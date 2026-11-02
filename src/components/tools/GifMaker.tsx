import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, moveItem } from './shared';
import { formatBytes, downloadBlob, friendlyError, uid } from '../../lib/utils';
import { loadBitmap, isImage, IMAGE_ACCEPT } from '../../lib/imageOps';
import { encodeGif, fitFrame, frameCanvas, decodeGif } from '../../lib/gif';

/** One frame: the source image (or a frame taken from an uploaded GIF), its thumbnail, delay and skip flag. */
type Item = { id: string; name: string; src: Blob; w: number; h: number; thumb: string; delay: number; skip: boolean };
const MAX = 150;
const MAX_SIDE = 1200;
const GRAVITY: [string, number, number][] = [['Center', .5, .5], ['Top', .5, 0], ['Bottom', .5, 1], ['Left', 0, .5], ['Right', 1, .5], ['Top left', 0, 0], ['Top right', 1, 0], ['Bottom left', 0, 1], ['Bottom right', 1, 1]];
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const val = (e: Event) => (e.target as HTMLInputElement).value;

async function thumbOf(src: CanvasImageSource, w: number, h: number): Promise<string> {
  const s = Math.min(1, 160 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return URL.createObjectURL(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')));
}

export default function GifMaker() {
  const [items, setItems] = useState<Item[]>([]);
  const [delay, setDelay] = useState(0.5);          // default delay for all frames (seconds)
  const [size, setSize] = useState(0);               // 0 = same as smallest image, else width in px
  const [fit, setFit] = useState<'contain' | 'cover' | 'stretch'>('contain');
  const [grav, setGrav] = useState(0);
  const [bg, setBg] = useState('#ffffff');
  const [plays, setPlays] = useState(0);             // 0 = forever
  const [dither, setDither] = useState(true);
  const [fade, setFade] = useState(false);
  const [noStack, setNoStack] = useState(true);
  const [from, setFrom] = useState(1); const [to, setTo] = useState(1); const [every, setEvery] = useState(2);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; url: string; info: string } | null>(null);
  useEffect(() => () => { out && URL.revokeObjectURL(out.url); }, [out]);

  const update = (next: Item[]) => { setItems(next); setOut(null); };

  const add = async (files: File[]) => {
    const imgs = files.filter(isImage);
    if (!imgs.length) { setError('Please choose image files (JPG, PNG, WebP, GIF, HEIC…).'); return; }
    setError(''); setOut(null);
    const added: Item[] = []; let skipped = false;
    setBusy({ done: 0, total: imgs.length, label: 'Reading images…' });
    try {
      for (let n = 0; n < imgs.length; n++) {
        const f = imgs[n];
        if (items.length + added.length >= MAX) { skipped = true; break; }
        if (f.type === 'image/gif' || /\.gif$/i.test(f.name)) {
          // animated GIF: add each frame with its own timing
          const a = await decodeGif(await f.arrayBuffer());
          const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const ctx = c.getContext('2d')!;
          for (let i = 0; i < a.frames.length; i++) {
            if (items.length + added.length >= MAX) { skipped = true; break; }
            ctx.putImageData(new ImageData(new Uint8ClampedArray(a.frames[i]), a.width, a.height), 0, 0);
            const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
            added.push({ id: uid(), name: `${f.name} #${i + 1}`, src: blob, w: a.width, h: a.height, thumb: await thumbOf(c, a.width, a.height), delay: +(a.delays[i] / 1000).toFixed(2), skip: false });
          }
        } else {
          const b = await loadBitmap(f);
          added.push({ id: uid(), name: f.name, src: f, w: b.width, h: b.height, thumb: await thumbOf(b, b.width, b.height), delay, skip: false });
          b.close();
        }
        setBusy({ done: n + 1, total: imgs.length, label: 'Reading images…' });
      }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
    if (skipped) setError(`You can use up to ${MAX} frames. Extra frames were skipped.`);
    const next = [...items, ...added]; update(next); setTo(next.length);
  };

  const setOne = (i: number, patch: Partial<Item>) => update(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const copy = (i: number) => { const n = items.slice(); n.splice(i + 1, 0, { ...items[i], id: uid() }); update(n); setTo(n.length); };
  const remove = (i: number) => { URL.revokeObjectURL(items[i].thumb); const n = items.filter((_, j) => j !== i); update(n); setTo(Math.min(to, n.length)); };
  const range = (skip: boolean) => update(items.map((it, i) => (i + 1 >= from && i + 1 <= to ? { ...it, skip } : it)));
  const nth = (skip: boolean) => update(items.map((it, i) => ((i + 1) % Math.max(1, every) === 0 ? { ...it, skip } : it)));
  const setAllDelays = (d: number) => { setDelay(d); update(items.map((it) => ({ ...it, delay: d }))); };

  const active = items.filter((i) => !i.skip);
  const smallest = active.length ? active.reduce((m, i) => (i.w * i.h < m.w * m.h ? i : m)) : null;
  const unequal = active.some((i) => i.w !== active[0].w || i.h !== active[0].h);

  const make = async () => {
    if (!smallest) return;
    setError(''); setOut(null);
    try {
      let W = size || smallest.w, H = size ? Math.round(size * smallest.h / smallest.w) : smallest.h;
      const k = Math.min(1, (size ? MAX_SIDE : 800) / Math.max(W, H)); W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
      const ctx = frameCanvas(W, H); const [, ax, ay] = GRAVITY[grav];
      const frames: Uint8ClampedArray[] = [], delays: number[] = [];
      for (let i = 0; i < active.length; i++) {
        const b = await loadBitmap(active[i].src);
        frames.push(fitFrame(ctx, b, b.width, b.height, fit, bg === 'transparent' ? null : bg, ax, ay)); b.close();
        delays.push(Math.max(20, Math.round(active[i].delay * 100) * 10));
        setBusy({ done: i + 1, total: active.length, label: 'Preparing frames…' });
      }
      if (fade && frames.length > 1) { // 4 blended steps between frames (0.05 s each)
        const fr: Uint8ClampedArray[] = [], dl: number[] = []; const STEPS = 4;
        for (let i = 0; i < frames.length; i++) {
          const a = frames[i], b = frames[(i + 1) % frames.length];
          fr.push(a); dl.push(delays[i]);
          if (i === frames.length - 1 && plays === 1) break;
          for (let s = 1; s <= STEPS; s++) {
            const t = s / (STEPS + 1), m = new Uint8ClampedArray(a.length);
            for (let p = 0; p < a.length; p++) m[p] = a[p] + (b[p] - a[p]) * t;
            fr.push(m); dl.push(50);
          }
        }
        frames.splice(0, frames.length, ...fr); delays.splice(0, delays.length, ...dl);
      }
      const repeat = plays === 0 ? 0 : plays === 1 ? -1 : plays - 1;
      const blob = await encodeGif({ width: W, height: H, frames, delays }, { repeat, dither, stack: !noStack }, (d, t) => setBusy({ done: d, total: t, label: 'Creating GIF…' }));
      setOut({ blob, url: URL.createObjectURL(blob), info: `${W}×${H}, ${frames.length} frames, ${(delays.reduce((s, d) => s + d, 0) / 1000).toFixed(1)} s` });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!items.length) return <>
    <DropZone accept={IMAGE_ACCEPT + ',.gif'} multiple label="Choose images" hint={`or drop images or GIFs here — up to ${MAX} frames`} onFiles={add} />
    {busy && <ProgressBar {...busy} />}
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <div class="actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}><DropZone compact accept={IMAGE_ACCEPT + ',.gif'} multiple label="Add more frames" onFiles={add} /></div>
      <ul class="frames">
        {items.map((it, i) => (
          <li key={it.id} class={it.skip ? 'skipped' : ''}>
            <span class="fno">{i + 1}</span>
            <img src={it.thumb} alt={`Frame ${i + 1}`} title={`${it.name} · ${it.w}×${it.h}`} />
            <label class="fdelay">Sec<input type="number" min={0.02} max={60} step={0.05} value={it.delay} aria-label={`Delay of frame ${i + 1} in seconds`} onChange={(e) => setOne(i, { delay: Math.max(0.02, +val(e) || 0.02) })} /></label>
            <div>
              <button type="button" class={'mini ' + (it.skip ? 'on' : 'warn')} onClick={() => setOne(i, { skip: !it.skip })}>{it.skip ? 'Use' : 'Skip'}</button>
              <button type="button" class="mini" onClick={() => copy(i)} title="Duplicate this frame">Copy</button>
            </div>
            <div>
              <button type="button" class="mini" aria-label="Move left" disabled={i === 0} onClick={() => update(moveItem(items, i, i - 1))}>←</button>
              <button type="button" class="mini" aria-label="Move right" disabled={i === items.length - 1} onClick={() => update(moveItem(items, i, i + 1))}>→</button>
              <button type="button" class="mini" aria-label="Remove" onClick={() => remove(i)}>✕</button>
            </div>
          </li>
        ))}
      </ul>

      {unequal && <div class="note-box">Your images are not the same size. They will be made the same size as the smallest one ({smallest!.w}×{smallest!.h}) — choose below whether to <b>fit</b>, <b>fill and crop</b> or <b>stretch</b> them.</div>}

      <fieldset class="panel">
        <legend>Skip or use a group of frames</legend>
        <div class="opts">
          <label>From<input type="number" min={1} max={items.length} value={from} onInput={(e) => setFrom(+val(e))} /></label>
          <label>To<input type="number" min={1} max={items.length} value={to} onInput={(e) => setTo(+val(e))} /></label>
          <button type="button" class="btn btn-ghost" onClick={() => range(true)}>Skip these</button>
          <button type="button" class="btn btn-ghost" onClick={() => range(false)}>Use these</button>
        </div>
        <div class="opts">
          <label>Every<input type="number" min={2} max={20} value={every} onInput={(e) => setEvery(+val(e))} /></label>
          <button type="button" class="btn btn-ghost" onClick={() => nth(true)}>Skip every {ord(every)}</button>
          <button type="button" class="btn btn-ghost" onClick={() => nth(false)}>Use every {ord(every)}</button>
        </div>
      </fieldset>

      <fieldset class="panel">
        <legend>GIF settings</legend>
        <div class="opts">
          <label>Time per frame (sec)<input type="number" min={0.02} max={60} step={0.05} value={delay} onChange={(e) => setAllDelays(Math.max(0.02, +val(e) || 0.5))} /></label>
          <span class="status">{(1 / delay).toFixed(1)} frames per second · changes all frames</span>
        </div>
        <div class="opts">
          <label>Size<select value={size} onChange={(e) => setSize(+val(e))}><option value={0}>Smallest image size</option>{[240, 320, 480, 640, 800, 1080].map((v) => <option value={v}>{v} px wide</option>)}</select></label>
          <label>Different sizes<select value={fit} onChange={(e) => setFit(val(e) as any)}><option value="contain">Fit whole image</option><option value="cover">Fill and crop</option><option value="stretch">Stretch</option></select></label>
          {fit !== 'stretch' && <label>Alignment<select value={grav} onChange={(e) => setGrav(+val(e))}>{GRAVITY.map(([t], i) => <option value={i}>{t}</option>)}</select></label>}
          <label>Background<select value={bg} onChange={(e) => setBg(val(e))}><option value="#ffffff">White</option><option value="#000000">Black</option><option value="transparent">Transparent</option></select></label>
          <label>Play<select value={plays} onChange={(e) => setPlays(+val(e))}><option value={0}>Forever (loop)</option><option value={1}>Once</option>{[2, 3, 5, 10].map((n) => <option value={n}>{n} times</option>)}</select></label>
          <label>Colour smoothing<select value={dither ? 1 : 0} onChange={(e) => setDither(val(e) === '1')}><option value={1}>On – best for photos</option><option value={0}>Off – best for graphics, smaller file</option></select></label>
        </div>
        <div class="opts">
          <label class="check"><input type="checkbox" checked={fade} onChange={(e) => setFade((e.target as HTMLInputElement).checked)} /> Crossfade between frames</label>
          <label class="check"><input type="checkbox" checked={noStack} onChange={(e) => setNoStack((e.target as HTMLInputElement).checked)} /> Don't stack frames (for transparent images)</label>
        </div>
      </fieldset>

      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out && (
        <div class="done">
          <p class="big" style={{ color: 'var(--text)' }}>Done! {out.info} · {formatBytes(out.blob.size)}</p>
          <div class="gif-prev"><img src={out.url} alt="Your animated GIF" /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(out.blob, 'animation.gif')}>Download GIF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
          </div>
        </div>
      )}
      {!out && !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={active.length < 2} onClick={make}>{active.length < 2 ? 'Use at least 2 frames' : `Make GIF (${active.length} frames)`}</button></div>}
    </div>
  );
}
