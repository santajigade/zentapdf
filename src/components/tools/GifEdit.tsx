import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, zipFiles } from '../../lib/utils';
import { decodeGif, encodeGif, resize, crop, toMp4, type Anim } from '../../lib/gif';

export type GifMode = 'resize' | 'crop' | 'reverse' | 'speed' | 'compress' | 'jpg' | 'mp4';
type Busy = { done: number; total: number; label: string };
const num = (e: Event) => +(e.target as HTMLInputElement).value;
const ACTION: Record<GifMode, string> = { resize: 'Resize GIF', crop: 'Crop GIF', reverse: 'Reverse GIF', speed: 'Change speed', compress: 'Compress GIF', jpg: 'Extract frames', mp4: 'Convert to MP4' };
const RATIOS: [string, number][] = [['Free', 0], ['Square 1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9], ['9:16 (Story)', 9 / 16], ['4:5 (Instagram)', 4 / 5]];

export default function GifEdit({ mode }: { mode: GifMode }) {
  const [file, setFile] = useState<File | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; name: string; url: string; info: string } | null>(null);
  // options
  const [w, setW] = useState(0); const [h, setH] = useState(0); const [lock, setLock] = useState(true);
  const [cx, setCx] = useState(0); const [cy, setCy] = useState(0); const [ratio, setRatio] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [boomerang, setBoomerang] = useState(false);
  const [level, setLevel] = useState(2);
  const [fmt, setFmt] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [loops, setLoops] = useState(3);

  useEffect(() => () => { srcUrl && URL.revokeObjectURL(srcUrl); }, [srcUrl]);
  useEffect(() => () => { out && URL.revokeObjectURL(out.url); }, [out]);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'image/gif' || /\.gif$/i.test(x.name));
    if (!f) { setError('Please choose a GIF file.'); return; }
    setError(''); setOut(null); setAnim(null); setFile(f); setSrcUrl(URL.createObjectURL(f));
    setBusy({ done: 0, total: 0, label: 'Reading GIF…' });
    try {
      const a = await decodeGif(await f.arrayBuffer());
      setAnim(a); setW(a.width); setH(a.height); setCx(0); setCy(0);
    } catch (e) { setError(friendlyError(e)); setFile(null); }
    finally { setBusy(null); }
  };

  const reset = () => { setFile(null); setAnim(null); setOut(null); setError(''); };

  const setRatioCentered = (r: number) => {
    setRatio(r); if (!anim) return;
    if (!r) { setCx(0); setCy(0); setW(anim.width); setH(anim.height); return; }
    let cw = anim.width, ch = Math.round(cw / r);
    if (ch > anim.height) { ch = anim.height; cw = Math.round(ch * r); }
    setW(cw); setH(ch); setCx(Math.round((anim.width - cw) / 2)); setCy(Math.round((anim.height - ch) / 2));
  };

  const run = async () => {
    if (!anim || !file) return;
    setError(''); setOut(null);
    const prog = (label: string) => (d: number, t: number) => setBusy({ done: d, total: t, label });
    try {
      let a: Anim = anim; let colors = 256;
      const base = baseName(file.name);
      setBusy({ done: 0, total: 0, label: 'Working…' });
      await new Promise((r) => setTimeout(r, 30));
      if (mode === 'jpg') {
        const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const ctx = c.getContext('2d')!;
        const files: { name: string; blob: Blob }[] = []; const ext = fmt === 'image/png' ? 'png' : 'jpg';
        for (let i = 0; i < a.frames.length; i++) {
          ctx.fillStyle = '#fff'; ctx.clearRect(0, 0, c.width, c.height); if (fmt === 'image/jpeg') ctx.fillRect(0, 0, c.width, c.height);
          const tmp = document.createElement('canvas'); tmp.width = a.width; tmp.height = a.height;
          tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(a.frames[i]), a.width, a.height), 0, 0);
          ctx.drawImage(tmp, 0, 0);
          files.push({ name: `${base}-frame-${String(i + 1).padStart(3, '0')}.${ext}`, blob: await new Promise((r) => c.toBlob((b) => r(b!), fmt, 0.92)) });
          setBusy({ done: i + 1, total: a.frames.length, label: 'Saving frames…' });
        }
        const zip = await zipFiles(files);
        setOut({ blob: zip, name: `${base}-frames.zip`, url: URL.createObjectURL(files[0].blob), info: `${files.length} frames as ${ext.toUpperCase()}` });
        return;
      }
      if (mode === 'mp4') {
        const mp4 = await toMp4(a, loops, prog('Creating video…'));
        if (!mp4) throw new Error('Your browser cannot create MP4 videos. Please use the latest Chrome, Edge or Safari.');
        setOut({ blob: mp4, name: `${base}.mp4`, url: URL.createObjectURL(mp4), info: `${a.width - (a.width % 2)}×${a.height - (a.height % 2)} MP4 video` });
        return;
      }
      if (mode === 'resize') a = resize(a, Math.max(1, w), Math.max(1, h));
      if (mode === 'crop') a = crop(a, cx, cy, Math.max(1, Math.min(w, a.width - cx)), Math.max(1, Math.min(h, a.height - cy)));
      if (mode === 'reverse') {
        const fr = a.frames.slice().reverse(), dl = a.delays.slice().reverse();
        a = boomerang ? { ...a, frames: [...a.frames, ...fr.slice(1, -1)], delays: [...a.delays, ...dl.slice(1, -1)] } : { ...a, frames: fr, delays: dl };
      }
      if (mode === 'speed') a = { ...a, delays: a.delays.map((d) => Math.max(20, Math.round(d / speed / 10) * 10)) };
      if (mode === 'compress') {
        if (level >= 2 && a.frames.length > 4) { // drop every second frame, keep total duration
          const fr: Uint8ClampedArray[] = [], dl: number[] = [];
          for (let i = 0; i < a.frames.length; i += 2) { fr.push(a.frames[i]); dl.push(a.delays[i] + (a.delays[i + 1] ?? 0)); }
          a = { ...a, frames: fr, delays: dl };
        }
        if (level >= 3) a = resize(a, Math.max(1, Math.round(a.width * 0.7)), Math.max(1, Math.round(a.height * 0.7)));
        colors = level === 1 ? 128 : level === 2 ? 64 : 48;
      }
      const blob = await encodeGif(a, { colors }, prog('Creating GIF…'));
      setOut({ blob, name: `${base}-${mode === 'speed' ? 'speed' : mode === 'compress' ? 'compressed' : mode === 'reverse' ? 'reversed' : mode === 'crop' ? 'cropped' : 'resized'}.gif`, url: URL.createObjectURL(blob), info: `${a.width}×${a.height}, ${a.frames.length} frames` });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="image/gif,.gif" label="Choose GIF file" hint="or drop an animated GIF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const dur = anim ? anim.delays.reduce((s, d) => s + d, 0) / 1000 : 0;
  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span>
        <span class="meta">{formatBytes(file.size)}{anim && ` · ${anim.width}×${anim.height} · ${anim.frames.length} frames · ${dur.toFixed(1)} s`}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={reset}>✕</button></li></ul>

      {anim && !out && (
        <>
          {mode === 'crop'
            ? <CropBox src={srcUrl} W={anim.width} H={anim.height} x={cx} y={cy} w={w} h={h} ratio={ratio} onChange={(x, y, cw, ch) => { setCx(x); setCy(y); setW(cw); setH(ch); }} />
            : <div class="gif-prev"><img src={srcUrl} alt="Original GIF" /></div>}
          <div class="opts">
            {mode === 'resize' && <>
              <label>Width (px)<input type="number" min={1} max={4000} value={w} onInput={(e) => { const v = num(e); setW(v); if (lock) setH(Math.max(1, Math.round(v * anim.height / anim.width))); }} /></label>
              <label>Height (px)<input type="number" min={1} max={4000} value={h} onInput={(e) => { const v = num(e); setH(v); if (lock) setW(Math.max(1, Math.round(v * anim.width / anim.height))); }} /></label>
              <label class="check"><input type="checkbox" checked={lock} onChange={(e) => setLock((e.target as HTMLInputElement).checked)} /> Keep proportions</label>
              <div class="seg" role="group" aria-label="Quick sizes">{[25, 50, 75].map((p) => <button type="button" onClick={() => { setW(Math.round(anim.width * p / 100)); setH(Math.round(anim.height * p / 100)); }}>{p}%</button>)}</div>
            </>}
            {mode === 'crop' && <>
              <label>Shape<select value={ratio} onChange={(e) => setRatioCentered(+(e.target as HTMLSelectElement).value)}>{RATIOS.map(([t, r]) => <option value={r}>{t}</option>)}</select></label>
              <label>Left<input type="number" min={0} max={anim.width - 1} value={cx} onInput={(e) => setCx(Math.min(num(e), anim.width - 1))} /></label>
              <label>Top<input type="number" min={0} max={anim.height - 1} value={cy} onInput={(e) => setCy(Math.min(num(e), anim.height - 1))} /></label>
              <label>Width<input type="number" min={1} max={anim.width} value={w} onInput={(e) => setW(num(e))} /></label>
              <label>Height<input type="number" min={1} max={anim.height} value={h} onInput={(e) => setH(num(e))} /></label>
            </>}
            {mode === 'reverse' && <label class="check"><input type="checkbox" checked={boomerang} onChange={(e) => setBoomerang((e.target as HTMLInputElement).checked)} /> Boomerang (play forward, then backward)</label>}
            {mode === 'speed' && <div class="seg" role="group" aria-label="Speed">{[0.25, 0.5, 0.75, 1.5, 2, 3, 4].map((s) => <button type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s < 1 ? `${s}× slower` : `${s}× faster`}</button>)}</div>}
            {mode === 'compress' && <div class="seg" role="group" aria-label="Compression level">{[[1, 'Light'], [2, 'Recommended'], [3, 'Strong']].map(([v, t]) => <button type="button" aria-pressed={level === v} onClick={() => setLevel(v as number)}>{t}</button>)}</div>}
            {mode === 'jpg' && <label>Format<select value={fmt} onChange={(e) => setFmt((e.target as HTMLSelectElement).value as any)}><option value="image/jpeg">JPG</option><option value="image/png">PNG (keeps transparency)</option></select></label>}
            {mode === 'mp4' && <label>Repeat the animation<select value={loops} onChange={(e) => setLoops(+(e.target as HTMLSelectElement).value)}>{[1, 2, 3, 5, 10].map((n) => <option value={n}>{n === 1 ? 'Once' : `${n} times`}</option>)}</select></label>}
          </div>
          {mode === 'speed' && <p class="status">New length: {(dur / speed).toFixed(1)} seconds (was {dur.toFixed(1)} s).</p>}
          {mode === 'compress' && <p class="status">{level === 1 ? 'Fewer colours, all frames kept.' : level === 2 ? 'Fewer colours and every second frame removed — same total length.' : 'Fewer colours, fewer frames and 30% smaller size.'}</p>}
        </>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big" style={{ color: 'var(--text)' }}>Done! {out.info} · {formatBytes(out.blob.size)}
            {mode === 'compress' && out.blob.size < file.size && <span class="saving"> (-{Math.round((1 - out.blob.size / file.size) * 100)}%)</span>}</p>
          {mode === 'compress' && out.blob.size >= file.size && <p class="status">This GIF is already well optimised — try the Strong level.</p>}
          <div class="gif-prev">{mode === 'mp4' ? <video src={out.url} controls autoplay muted loop playsInline /> : <img src={out.url} alt="Result" />}</div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(out.blob, out.name)}>{mode === 'jpg' ? 'Download frames (ZIP)' : mode === 'mp4' ? 'Download MP4' : 'Download GIF'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={reset}>New GIF</button>
          </div>
        </div>
      ) : (
        anim && !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>{ACTION[mode]}</button></div>
      )}
    </div>
  );
}

/** Drag a rectangle over the first frame to pick the crop area. */
function CropBox({ src, W, H, x, y, w, h, ratio, onChange }: { src: string; W: number; H: number; x: number; y: number; w: number; h: number; ratio: number; onChange: (x: number, y: number, w: number, h: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'move' | 'new'; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const toImg = (e: PointerEvent) => { const r = box.current!.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W))), Math.round(Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H)))]; };
  const down = (e: PointerEvent) => {
    const [px, py] = toImg(e); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const inside = px > x && px < x + w && py > y && py < y + h;
    drag.current = { kind: inside ? 'move' : 'new', sx: px, sy: py, ox: x, oy: y };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current; if (!d) return; const [px, py] = toImg(e);
    if (d.kind === 'move') onChange(Math.max(0, Math.min(W - w, d.ox + px - d.sx)), Math.max(0, Math.min(H - h, d.oy + py - d.sy)), w, h);
    else {
      let nw = Math.abs(px - d.sx), nh = Math.abs(py - d.sy);
      if (ratio) nh = Math.round(nw / ratio);
      const nx = px < d.sx ? d.sx - nw : d.sx, ny = py < d.sy ? d.sy - nh : d.sy;
      if (nw > 4 && nh > 4 && nx >= 0 && ny >= 0 && nx + nw <= W && ny + nh <= H) onChange(nx, ny, nw, nh);
    }
  };
  const pct = (v: number, t: number) => (v / t) * 100 + '%';
  return (
    <div class="gif-prev">
      <div ref={box} class="cropbox" onPointerDown={down as any} onPointerMove={move as any} onPointerUp={() => (drag.current = null)} style={{ aspectRatio: `${W} / ${H}` }}>
        <img src={src} alt="GIF to crop" draggable={false} />
        <div class="cropsel" style={{ left: pct(x, W), top: pct(y, H), width: pct(Math.min(w, W - x), W), height: pct(Math.min(h, H - y), H) }} />
      </div>
      <p class="status">Drag on the image to draw the crop area, or drag the box to move it.</p>
    </div>
  );
}
