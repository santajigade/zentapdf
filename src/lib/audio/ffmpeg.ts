// ffmpeg.wasm (single thread core, no COOP/COEP needed). Loaded only when a job needs it.
import type { FFmpeg } from '@ffmpeg/ffmpeg';

const BASE = '/ffmpeg/0.12.10/';
const WASM_SIZE = 32232419;
let loading: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export type Status = (label: string, done?: number, total?: number) => void;

export function ffmpegLoaded() { return !!loading; }

export function getFFmpeg(status?: Status): Promise<FFmpeg> {
  if (!loading) loading = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ff = new FFmpeg();
    // fetch the 32 MB engine ourselves so we can show progress (it is cached after the first time)
    status?.('Loading the audio engine (one time, about 10 MB)…', 0, 100);
    const res = await fetch(BASE + 'ffmpeg-core.wasm');
    if (!res.ok || !res.body) throw new Error('ENGINE_LOAD');
    const reader = res.body.getReader(); const parts: Uint8Array[] = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); got += value.length;
      status?.('Loading the audio engine (one time, about 10 MB)…', Math.min(99, Math.round((got / WASM_SIZE) * 100)), 100);
    }
    const wasmURL = URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'application/wasm' }));
    await ff.load({ coreURL: new URL(BASE + 'ffmpeg-core.js', location.href).href, wasmURL });
    return ff;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

let n = 0;
/**
 * Run ffmpeg on one input file. `args` gets the input path in place of "{in}" and the output path in place of "{out}".
 * Large File objects are mounted read-only (WORKERFS) instead of being copied into memory.
 */
export function ffRun(input: Blob, inExt: string, args: string[], outExt: string, status?: Status, total?: number): Promise<{ data: Uint8Array; log: string }> {
  const job = queue.then(async () => {
    const ff = await getFFmpeg(status);
    const id = ++n; const dir = `/w${id}`; const outName = `/out${id}.${outExt}`;
    let inPath: string; let mounted = false;
    const file = input instanceof File ? input : new File([input], `in.${inExt}`);
    const safe = `in${id}.${inExt}`;
    await ff.createDir(dir);
    try {
      const f = new File([file], safe, { type: file.type });
      await ff.mount('WORKERFS' as any, { files: [f] }, dir); mounted = true; inPath = `${dir}/${safe}`;
    } catch {
      inPath = `/${safe}`; await ff.writeFile(inPath, new Uint8Array(await file.arrayBuffer()));
    }
    let log = '';
    const onLog = ({ message }: { message: string }) => { log += message + '\n'; if (log.length > 200000) log = log.slice(-100000); };
    const onProg = ({ time }: { time: number }) => { if (total) status?.('Working…', Math.min(total, time / 1e6), total); };
    ff.on('log', onLog); ff.on('progress', onProg);
    try {
      const full = args.map((a) => (a === '{in}' ? inPath : a === '{out}' ? outName : a));
      const rc = await ff.exec(full);
      if (outExt === 'none') return { data: new Uint8Array(), log };
      if (rc !== 0) throw Object.assign(new Error('FFMPEG_FAILED'), { log });
      const data = (await ff.readFile(outName)) as Uint8Array;
      return { data, log };
    } finally {
      ff.off('log', onLog); ff.off('progress', onProg);
      try { await ff.deleteFile(outName); } catch { /* nothing written */ }
      if (mounted) { try { await ff.unmount(dir); } catch { /* ignore */ } } else { try { await ff.deleteFile(inPath!); } catch { /* ignore */ } }
      try { await ff.deleteDir(dir); } catch { /* ignore */ }
    }
  });
  queue = job.catch(() => {});
  return job;
}

/** Read duration and channel count from ffmpeg's description of the input. */
export async function ffProbe(input: Blob, ext: string, status?: Status) {
  const { log } = await ffRun(input, ext, ['-hide_banner', '-i', '{in}'], 'none', status);
  const d = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const a = log.match(/Stream #[^\n]*Audio: ([^\n]*)/);
  if (!a) throw new Error('NO_AUDIO');
  const ch = /mono/.test(a[1]) ? 1 : 2;
  const rate = +(a[1].match(/(\d+) Hz/)?.[1] ?? 44100);
  return { duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, channels: ch, rate, codec: a[1].split(/[ ,(]/)[0] };
}
