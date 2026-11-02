import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { encodeGif, fitFrame, frameCanvas } from '../../lib/gif';

const MAX_FRAMES = 300;

export default function VideoToGif() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [dur, setDur] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; url: string; info: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => { url && URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { out && URL.revokeObjectURL(out.url); }, [out]);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(x.name));
    if (!f) { setError('Please choose a video file (MP4, WebM or MOV).'); return; }
    setError(''); setOut(null); setDur(0); setFile(f); setUrl(URL.createObjectURL(f));
  };
  const loaded = () => {
    const v = video.current!; const d = v.duration;
    if (!isFinite(d) || !v.videoWidth) { setError('This video format cannot be played in your browser. Try an MP4 file.'); return; }
    setDur(d); setStart(0); setEnd(+Math.min(d, 5).toFixed(1));
  };
  const frames = Math.max(1, Math.round((end - start) * fps));

  const make = async () => {
    const v = video.current!; setError(''); setOut(null);
    if (end <= start) { setError('End time must be after start time.'); return; }
    if (frames > MAX_FRAMES) { setError(`That is ${frames} frames — the limit is ${MAX_FRAMES}. Choose a shorter clip or fewer frames per second.`); return; }
    try {
      v.pause();
      const W = Math.min(width, v.videoWidth - (v.videoWidth % 2) || width);
      const H = Math.max(1, Math.round(W * v.videoHeight / v.videoWidth));
      const ctx = frameCanvas(W, H);
      const list: Uint8ClampedArray[] = [];
      for (let i = 0; i < frames; i++) {
        const t = Math.min(dur - 0.001, start + i / fps);
        await new Promise<void>((res, rej) => {
          const to = setTimeout(() => rej(new Error('The video could not be read. Try an MP4 file.')), 8000);
          v.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true });
          v.currentTime = t;
        });
        list.push(fitFrame(ctx, v, v.videoWidth, v.videoHeight, 'contain', '#000'));
        setBusy({ done: i + 1, total: frames, label: 'Capturing frames…' });
      }
      const delay = Math.round(1000 / fps / 10) * 10;
      const blob = await encodeGif({ width: W, height: H, frames: list, delays: list.map(() => delay) }, {}, (d, t) => setBusy({ done: d, total: t, label: 'Creating GIF…' }));
      setOut({ blob, url: URL.createObjectURL(blob), info: `${W}×${H}, ${list.length} frames` });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="video/*,.mp4,.webm,.mov,.m4v" label="Choose video" hint="or drop an MP4, WebM or MOV video here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const num = (e: Event) => Math.max(0, Math.min(dur, +(e.target as HTMLInputElement).value));
  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}{dur > 0 && ` · ${dur.toFixed(1)} s`}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      <div class="gif-prev" style={{ display: out ? 'none' : undefined }}><video ref={video} src={url} controls muted playsInline preload="auto" onLoadedMetadata={loaded} onError={() => setError('This video format cannot be played in your browser. Try an MP4 file.')} /></div>
      {dur > 0 && !out && <>
        <div class="opts">
          <label>Start (sec)<input type="number" step={0.1} min={0} max={dur} value={start} onInput={(e) => setStart(num(e))} /></label>
          <label>End (sec)<input type="number" step={0.1} min={0} max={dur} value={end} onInput={(e) => setEnd(num(e))} /></label>
          <button type="button" class="btn btn-ghost" onClick={() => setStart(+video.current!.currentTime.toFixed(1))}>Start = current time</button>
          <button type="button" class="btn btn-ghost" onClick={() => setEnd(+video.current!.currentTime.toFixed(1))}>End = current time</button>
        </div>
        <div class="opts">
          <label>Frames per second<select value={fps} onChange={(e) => setFps(+(e.target as HTMLSelectElement).value)}>{[5, 8, 10, 12, 15, 20, 25].map((v) => <option value={v}>{v}</option>)}</select></label>
          <label>Width<select value={width} onChange={(e) => setWidth(+(e.target as HTMLSelectElement).value)}>{[240, 320, 400, 480, 640, 800].map((v) => <option value={v}>{v} px</option>)}</select></label>
        </div>
        <p class="status">Clip length {(end - start).toFixed(1)} s · {frames} frames {frames > MAX_FRAMES && `(limit ${MAX_FRAMES})`}</p>
      </>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big" style={{ color: 'var(--text)' }}>Done! {out.info} · {formatBytes(out.blob.size)}</p>
          <div class="gif-prev"><img src={out.url} alt="Your GIF" /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.gif`)}>Download GIF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New video</button>
          </div>
        </div>
      ) : dur > 0 && !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={make}>Make GIF</button></div>}
    </div>
  );
}
