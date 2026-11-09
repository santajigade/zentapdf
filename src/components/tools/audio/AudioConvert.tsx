import { useEffect, useState } from 'preact/hooks';
import { AudioDrop, ProgressBar, ErrorBox, useBusy, bigWarning, friendlyAudioError, formatBytes, fmtTime, BITRATES, FMT_LABEL } from './ui';
import { AUDIO_ACCEPT, VIDEO_ACCEPT, BIG_FILE, decodeFile, encode, transcode, ext, AudioError, LOSSY, type Fmt } from '../../../lib/audio/core';
import { downloadBlob, baseName, zipFiles } from '../../../lib/utils';
import type { Status } from '../../../lib/audio/ffmpeg';

type Mode = 'convert' | 'compress' | 'video';
type Row = { file: File; dur?: number; out?: Blob; outName?: string; err?: string; state: 'wait' | 'work' | 'done' | 'error'; pct?: number };
const ALL: Fmt[] = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];

/** Convert one file. Small files are decoded and encoded in the page; long files and formats like OGG and FLAC go straight through ffmpeg. */
async function convertOne(file: File, fmt: Fmt, o: { kbps: number; mono: boolean }, status: Status): Promise<Blob> {
  const direct = fmt === 'ogg' || fmt === 'flac' || file.size > BIG_FILE;
  if (!direct) {
    let pcm;
    try { pcm = await decodeFile(file, file.name, status); } catch (e) { if (e instanceof AudioError && /No sound|empty/.test(e.friendly)) throw e; }
    if (pcm) return encode(pcm, fmt, { kbps: o.kbps, mono: o.mono }, status);
  }
  return transcode(file, fmt, { kbps: o.kbps, mono: o.mono }, status);
}

const mediaDuration = (f: File) => new Promise<number | undefined>((res) => {
  const a = document.createElement(f.type.startsWith('video') ? 'video' : 'audio'); const u = URL.createObjectURL(f);
  const done = (v?: number) => { URL.revokeObjectURL(u); res(v && isFinite(v) ? v : undefined); };
  a.preload = 'metadata'; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(); a.src = u; setTimeout(() => done(), 4000);
});

export default function AudioConvert({ mode = 'convert', from, to = 'mp3' }: { mode?: Mode; from?: string; to?: Fmt }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fmt, setFmt] = useState<Fmt>(mode === 'compress' ? 'mp3' : to);
  const [kbps, setKbps] = useState(mode === 'compress' ? 96 : mode === 'video' ? 192 : 192);
  const [mono, setMono] = useState(false);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const multi = mode !== 'video';
  const accept = mode === 'video' ? VIDEO_ACCEPT : (from ? `.${from},${AUDIO_ACCEPT}` : AUDIO_ACCEPT);
  const working = rows.some((r) => r.state === 'work');

  const add = async (fs: File[]) => {
    setError('');
    const list = (multi ? fs : fs.slice(0, 1)).filter((f) => f.size > 0);
    if (!list.length) { setError('That file is empty.'); return; }
    const next: Row[] = list.map((file) => ({ file, state: 'wait' }));
    setRows((r) => (multi ? [...r, ...next] : next));
    for (const r of next) r.dur = await mediaDuration(r.file);
    setRows((r) => [...r]);
  };
  const update = (row: Row, p: Partial<Row>) => { Object.assign(row, p); setRows((r) => [...r]); };
  const run = async () => {
    setError('');
    for (const row of rows) {
      if (row.state === 'done' && row.outName?.endsWith('.' + fmt)) continue;
      update(row, { state: 'work', err: undefined, out: undefined, pct: 0 });
      try {
        const blob = await convertOne(row.file, fmt, { kbps, mono }, (l, d, t) => { status(`${row.file.name}: ${l}`, d, t); });
        update(row, { state: 'done', out: blob, outName: `${baseName(row.file.name)}${mode === 'compress' ? '-compressed' : ''}.${fmt}` });
      } catch (e) { update(row, { state: 'error', err: friendlyAudioError(e) }); }
    }
    setBusy(null);
    const ok = rows.filter((r) => r.out);
    if (ok.length === 1) downloadBlob(ok[0].out!, ok[0].outName!);
  };
  const zip = async () => { const ok = rows.filter((r) => r.out); downloadBlob(await zipFiles(ok.map((r) => ({ name: r.outName!, blob: r.out! }))), mode === 'compress' ? 'compressed-audio.zip' : 'converted-audio.zip'); };
  useEffect(() => { setRows((r) => r.map((x) => (x.state === 'done' ? { ...x, state: 'wait', out: undefined } : x))); }, [fmt, kbps, mono]);

  const totalIn = rows.reduce((a, r) => a + r.file.size, 0);
  const est = (r: Row) => (r.dur ? ((kbps * 1000) / 8) * r.dur * (mono && fmt !== 'wav' ? 1 : 1) : undefined);
  const label = mode === 'video' ? 'Choose video file' : multi ? 'Choose audio files' : 'Choose audio file';
  if (!rows.length) return <>
    <AudioDrop accept={accept} multiple={multi} label={label} hint={mode === 'video' ? 'or drop a video here · MP4, MOV, WEBM, MKV, AVI and more' : undefined} onFiles={add} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;
  const formats: Fmt[] = mode === 'compress' ? ['mp3', 'm4a', 'ogg'] : mode === 'video' ? ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] : ALL;
  const rates = mode === 'compress' ? [32, 48, 64, 96, 128, 160, 192] : BITRATES;
  return (
    <div class="au">
      {bigWarning(totalIn) && <p class="hint">{bigWarning(totalIn)}</p>}
      <ul class="au-rows">
        {rows.map((r, i) => (
          <li class={`au-row ${r.state}`}>
            <span class="au-file-ic" aria-hidden="true">{mode === 'video' ? '▶' : '♪'}</span>
            <span class="au-row-main"><b>{r.file.name}</b>
              <small>{formatBytes(r.file.size)}{r.dur ? ` · ${fmtTime(r.dur, 0)}` : ''}
                {r.out ? <> → <b class="ok">{formatBytes(r.out.size)}</b>{r.out.size < r.file.size ? ` (${Math.round((1 - r.out.size / r.file.size) * 100)}% smaller)` : ''}</> : mode === 'compress' && est(r) ? ` → about ${formatBytes(est(r)!)}` : ''}
              </small>
              {r.err && <small class="err">{r.err}</small>}
            </span>
            {r.out ? <button type="button" class="btn btn-ghost dl" onClick={() => downloadBlob(r.out!, r.outName!)}>Download</button>
              : r.state === 'work' ? <span class="spin" aria-label="Working" />
              : <button type="button" class="mini" aria-label="Remove" disabled={working} onClick={() => setRows(rows.filter((_, k) => k !== i))}>✕</button>}
          </li>
        ))}
      </ul>
      {multi && <AudioDrop accept={accept} multiple label="Add more files" compact hint="" onFiles={add} />}
      <div class="opts" data-title={mode === 'compress' ? 'Compression' : 'Output'}>
        <label>Format<select value={fmt} onChange={(e) => setFmt((e.target as HTMLSelectElement).value as Fmt)}>{formats.map((f) => <option value={f}>{FMT_LABEL[f]}</option>)}</select></label>
        {LOSSY.includes(fmt) && <label>{mode === 'compress' ? 'Bitrate (lower = smaller)' : 'Quality'}<select value={kbps} onChange={(e) => setKbps(+(e.target as HTMLSelectElement).value)}>{rates.map((b) => <option value={b}>{b} kbps{b === 64 ? ' (voice)' : b === 96 ? ' (balanced)' : b === 128 ? ' (good)' : b === 192 ? ' (high)' : b === 320 ? ' (best)' : ''}</option>)}</select></label>}
        <label class="chk"><input type="checkbox" checked={mono} onChange={(e) => setMono((e.target as HTMLInputElement).checked)} /> Mono{mode === 'compress' ? ' (great for speech, much smaller)' : ''}</label>
        {mode === 'compress' && <p class="hint full">Lower bitrate makes the file smaller. 96 kbps sounds close to the original for most music; 64 kbps mono is ideal for voice notes and podcasts.</p>}
        {fmt === 'flac' && <p class="hint full">FLAC is lossless: same quality as the source, but larger than MP3.</p>}
        {(fmt === 'ogg' || fmt === 'flac' || totalIn > BIG_FILE) && <p class="hint full">This format uses our audio engine, which loads once (about 10 MB).</p>}
      </div>
      {busy && working && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      <div class="actions">
        <button type="button" class="btn btn-primary btn-lg" disabled={working} onClick={run}>{mode === 'compress' ? 'Compress' : mode === 'video' ? `Extract ${FMT_LABEL[fmt]}` : `Convert to ${FMT_LABEL[fmt]}`}</button>
        {rows.filter((r) => r.out).length > 1 && <button type="button" class="btn btn-ghost dl" onClick={zip}>Download all (ZIP)</button>}
        <button type="button" class="btn btn-ghost" disabled={working} onClick={() => setRows([])}>Start over</button>
      </div>
    </div>
  );
}
export const _ext = ext;
