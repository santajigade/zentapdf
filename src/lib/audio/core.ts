// Audio basics: decode any file to PCM, encode PCM to MP3 / WAV / M4A / M4R / AAC / OGG / FLAC. All in the browser.
import { ffRun, ffProbe, type Status } from './ffmpeg';

export type Pcm = { rate: number; ch: Float32Array[] };
export const duration = (p: Pcm) => p.ch[0].length / p.rate;
export type Fmt = 'mp3' | 'wav' | 'm4a' | 'm4r' | 'aac' | 'ogg' | 'flac';
export const MIME: Record<Fmt, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', m4r: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' };
export const LOSSY: Fmt[] = ['mp3', 'm4a', 'm4r', 'aac', 'ogg'];
export const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.wma,.amr,.aiff,.aif,.caf,.m4r,.mp2,.ac3,.3gp,.webm,.mka';
export const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.3gp,.flv,.wmv,.mpeg,.mpg,.ts';
const RATE = 44100;

export class AudioError extends Error { constructor(public friendly: string) { super(friendly); } }

/** Estimated memory for decoded audio; used to pick a lighter path for very long files. */
export const pcmBytes = (seconds: number, ch = 2) => seconds * RATE * ch * 4;
export const BIG_FILE = 100 * 1024 * 1024;

function fromBuffer(b: AudioBuffer): Pcm { const ch: Float32Array[] = []; for (let i = 0; i < Math.min(2, b.numberOfChannels); i++) ch.push(b.getChannelData(i).slice()); return { rate: b.sampleRate, ch }; }

/**
 * Decode a file to PCM (44.1 kHz). The browser's own decoder is tried first; formats it cannot read
 * (WMA, AMR, some MKV/AVI videos, OGG on older iPhones) go through ffmpeg.
 */
export async function decodeFile(file: Blob, name: string, status?: Status): Promise<Pcm> {
  const e = ext(name);
  if (file.size === 0) throw new AudioError('This file is empty.');
  const skipNative = ['wma', 'amr', 'avi', 'wmv', 'flv', 'mkv', 'mka', 'ac3', 'mpg', 'mpeg', 'ts', '3gp'].includes(e);
  if (!skipNative) {
    try {
      status?.('Reading the audio…');
      const ac = new OfflineAudioContext(2, 1, RATE);
      const b = await ac.decodeAudioData(await file.arrayBuffer());
      if (b.length > 0) return fromBuffer(b);
    } catch { /* the browser cannot read it: try ffmpeg */ }
  }
  let info;
  try { info = await ffProbe(file, e || 'bin', status); }
  catch (err: any) {
    if (err?.message === 'NO_AUDIO') throw new AudioError('No sound track was found in this file.');
    if (err?.message === 'ENGINE_LOAD') throw new AudioError('The audio engine could not be loaded. Check your internet connection and try again.');
    throw new AudioError('This file could not be read. It may be damaged or in a format we do not support.');
  }
  if (pcmBytes(info.duration, info.channels) > 1.6e9) throw new AudioError('This recording is too long to edit in the browser. Please cut it into parts of about 2 hours or less.');
  const { data } = await ffRun(file, e || 'bin', ['-hide_banner', '-i', '{in}', '-vn', '-ac', String(info.channels), '-ar', String(RATE), '-f', 'f32le', '-c:a', 'pcm_f32le', '{out}'], 'raw', (l, d, t) => status?.(l === 'Working…' ? 'Reading the audio…' : l, d, t), info.duration);
  const f = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
  const n = Math.floor(f.length / info.channels); const ch = Array.from({ length: info.channels }, () => new Float32Array(n));
  for (let i = 0, k = 0; i < n; i++) for (let c = 0; c < info.channels; c++) ch[c][i] = f[k++];
  if (!n) throw new AudioError('No sound was found in this file.');
  return { rate: RATE, ch };
}

// ---------- encoders ----------
export function encodeWav(p: Pcm, bits: 16 | 24 = 16): Blob {
  const n = p.ch[0].length, c = p.ch.length, bps = bits / 8, data = n * c * bps;
  const buf = new ArrayBuffer(44 + data); const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + data, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, c, true);
  v.setUint32(24, p.rate, true); v.setUint32(28, p.rate * c * bps, true); v.setUint16(32, c * bps, true); v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    const s = Math.max(-1, Math.min(1, p.ch[k][i]));
    if (bits === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    else { const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** MP3 with LAME (in a worker, so the page stays smooth). */
export function encodeMp3(p: Pcm, kbps: number, status?: Status, mono = false): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    let ch = p.ch;
    if (mono && ch.length > 1) { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; ch = [m]; }
    let rate = p.rate;
    // LAME only accepts these sample rates
    if (![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(rate)) { ch = ch.map((x) => resampleLinear(x, rate, 44100)); rate = 44100; }
    w.onmessage = (e) => {
      if (e.data.progress != null) status?.('Making the MP3…', e.data.progress, 100);
      else if (e.data.error) { w.terminate(); reject(new AudioError('The MP3 could not be created: ' + e.data.error)); }
      else { w.terminate(); resolve(new Blob(e.data.parts, { type: 'audio/mpeg' })); }
    };
    w.onerror = (e) => { w.terminate(); reject(new AudioError('The MP3 encoder stopped: ' + (e.message || 'unknown error'))); };
    const copy = ch.map((x) => x.slice());
    w.postMessage({ ch: copy, rate, kbps }, copy.map((x) => x.buffer));
  });
}

function resampleLinear(x: Float32Array, from: number, to: number) {
  const n = Math.round((x.length * to) / from); const y = new Float32Array(n); const r = from / to;
  for (let i = 0; i < n; i++) { const t = i * r, k = Math.floor(t), f = t - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f; }
  return y;
}

/** AAC in an MP4 box (M4A / M4R) or ADTS (.aac) with the browser's encoder. Returns null when the browser has none. */
async function encodeAacNative(p: Pcm, kbps: number, kind: 'mp4' | 'adts', status?: Status): Promise<Blob | null> {
  const AE = (globalThis as any).AudioEncoder; const AD = (globalThis as any).AudioData;
  if (!AE || !AD) return null;
  const c = p.ch.length;
  const config: any = { codec: 'mp4a.40.2', sampleRate: p.rate, numberOfChannels: c, bitrate: kbps * 1000 };
  if (kind === 'adts') config.aac = { format: 'adts' };
  try { if (!(await AE.isConfigSupported(config)).supported) return null; } catch { return null; }
  const chunks: Uint8Array[] = [];
  let muxer: any = null;
  if (kind === 'mp4') { const { Muxer, ArrayBufferTarget } = await import('mp4-muxer'); muxer = new Muxer({ target: new ArrayBufferTarget(), audio: { codec: 'aac', sampleRate: p.rate, numberOfChannels: c }, fastStart: 'in-memory' }); }
  let failed: any = null;
  const enc = new AE({
    output: (chunk: any, meta: any) => { if (muxer) muxer.addAudioChunk(chunk, meta); else { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push(b); } },
    error: (e: any) => { failed = e; },
  });
  enc.configure(config);
  const n = p.ch[0].length, F = 4096;
  for (let i = 0; i < n; i += F) {
    const len = Math.min(F, n - i); const planar = new Float32Array(len * c);
    for (let k = 0; k < c; k++) planar.set(p.ch[k].subarray(i, i + len), k * len);
    const ad = new AD({ format: 'f32-planar', sampleRate: p.rate, numberOfFrames: len, numberOfChannels: c, timestamp: Math.round((i / p.rate) * 1e6), data: planar });
    enc.encode(ad); ad.close();
    if ((i / F) % 50 === 0) { status?.('Making the file…', i, n); await new Promise((r) => setTimeout(r)); }
    if (failed) break;
  }
  await enc.flush(); enc.close();
  if (failed) return null;
  if (muxer) { muxer.finalize(); return new Blob([muxer.target.buffer], { type: 'audio/mp4' }); }
  return new Blob(chunks as BlobPart[], { type: 'audio/aac' });
}

/** Encode PCM to any supported format. */
export async function encode(p: Pcm, fmt: Fmt, o: { kbps?: number; mono?: boolean; bits?: 16 | 24 } = {}, status?: Status): Promise<Blob> {
  const kbps = o.kbps ?? 192;
  if (o.mono && p.ch.length > 1) { const m = new Float32Array(p.ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (p.ch[0][i] + p.ch[1][i]) / 2; p = { rate: p.rate, ch: [m] }; }
  if (fmt === 'wav') return encodeWav(p, o.bits ?? 16);
  if (fmt === 'mp3') return encodeMp3(p, kbps, status);
  if (fmt === 'm4a' || fmt === 'm4r' || fmt === 'aac') {
    const b = await encodeAacNative(p, Math.min(kbps, 320), fmt === 'aac' ? 'adts' : 'mp4', status);
    if (b) return fmt === 'm4r' ? new Blob([b], { type: 'audio/mp4' }) : b;
  }
  // everything else through ffmpeg, starting from a lossless WAV
  const wav = encodeWav(p, 16);
  const codec: Record<string, string[]> = {
    m4a: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart'], m4r: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-f', 'ipod'], aac: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-f', 'adts'],
    ogg: ['-c:a', 'libvorbis', '-b:a', `${kbps}k`], flac: ['-c:a', 'flac', '-compression_level', '8'],
  };
  const { data } = await ffRun(wav, 'wav', ['-hide_banner', '-i', '{in}', ...codec[fmt], '{out}'], fmt, (l, d, t) => status?.(l === 'Working…' ? 'Making the file…' : l, d, t), duration(p));
  return new Blob([data as BlobPart], { type: MIME[fmt] });
}

/** Convert straight from file to file with ffmpeg (used for long files, and when the browser cannot decode). */
export async function transcode(file: File, fmt: Fmt, o: { kbps?: number; mono?: boolean; rate?: number } = {}, status?: Status): Promise<Blob> {
  const info = await ffProbe(file, ext(file.name) || 'bin', status).catch((e) => { throw new AudioError(e?.message === 'NO_AUDIO' ? 'No sound track was found in this file.' : 'This file could not be read. It may be damaged or in a format we do not support.'); });
  const kbps = o.kbps ?? 192;
  const codec: Record<Fmt, string[]> = {
    mp3: ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`], wav: ['-c:a', 'pcm_s16le'], m4a: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart'], m4r: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-f', 'ipod'],
    aac: ['-c:a', 'aac', '-b:a', `${kbps}k`, '-f', 'adts'], ogg: ['-c:a', 'libvorbis', '-b:a', `${kbps}k`], flac: ['-c:a', 'flac'],
  };
  const extra = [...(o.mono ? ['-ac', '1'] : []), ...(o.rate ? ['-ar', String(o.rate)] : [])];
  const { data } = await ffRun(file, ext(file.name) || 'bin', ['-hide_banner', '-i', '{in}', '-vn', '-map_metadata', '0', ...extra, ...codec[fmt], '{out}'], fmt, (l, d, t) => status?.(l === 'Working…' ? 'Converting…' : l, d, t), info.duration);
  return new Blob([data as BlobPart], { type: MIME[fmt] });
}

export const fmtTime = (s: number, dec = 1) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(dec).padStart(dec ? dec + 3 : 2, '0')}`; };
export const parseTime = (t: string) => { const m = t.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/); return m ? (+(m[1] ?? 0)) * 60 + +m[2] : NaN; };

export function friendlyAudioError(e: any): string {
  if (e instanceof AudioError) return e.friendly;
  const m = String(e?.message ?? e);
  if (/ENGINE_LOAD|Failed to fetch|NetworkError/i.test(m)) return 'The audio engine could not be loaded. Check your internet connection and try again.';
  if (/memory|allocation|RangeError|Array buffer/i.test(m)) return 'Your device ran out of memory. Try a shorter file, or use a computer.';
  if (/FFMPEG_FAILED/.test(m)) return 'This file could not be converted. It may be damaged or use an unusual format.';
  return 'Something went wrong: ' + m.slice(0, 160);
}
