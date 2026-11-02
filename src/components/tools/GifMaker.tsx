import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, MoveButtons, moveItem } from './shared';
import { formatBytes, downloadBlob, friendlyError, uid } from '../../lib/utils';
import { loadBitmap, isImage, IMAGE_ACCEPT } from '../../lib/imageOps';
import { encodeGif, fitFrame, frameCanvas } from '../../lib/gif';

type Item = { id: string; file: File; url: string };
const MAX = 100;

export default function GifMaker() {
  const [items, setItems] = useState<Item[]>([]);
  const [width, setWidth] = useState(480);
  const [delay, setDelay] = useState(0.5);
  const [loop, setLoop] = useState(0);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [bg, setBg] = useState('#ffffff');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; url: string; info: string } | null>(null);
  useEffect(() => () => { out && URL.revokeObjectURL(out.url); }, [out]);

  const add = (files: File[]) => {
    const imgs = files.filter(isImage);
    if (!imgs.length) { setError('Please choose image files (JPG, PNG, WebP, HEIC…).'); return; }
    setError(''); setOut(null);
    const room = MAX - items.length;
    if (imgs.length > room) setError(`You can use up to ${MAX} images. Extra images were skipped.`);
    setItems([...items, ...imgs.slice(0, room).map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))]);
  };

  const make = async () => {
    setError(''); setOut(null);
    try {
      setBusy({ done: 0, total: items.length, label: 'Reading images…' });
      const first = await loadBitmap(items[0].file);
      const W = width || first.width;
      const H = Math.max(1, Math.round(W * first.height / first.width)); first.close();
      const ctx = frameCanvas(W, H);
      const frames: Uint8ClampedArray[] = [];
      for (let i = 0; i < items.length; i++) {
        const b = await loadBitmap(items[i].file);
        frames.push(fitFrame(ctx, b, b.width, b.height, fit, bg === 'transparent' ? null : bg)); b.close();
        setBusy({ done: i + 1, total: items.length, label: 'Reading images…' });
      }
      const blob = await encodeGif({ width: W, height: H, frames, delays: frames.map(() => Math.round(delay * 1000)) }, { repeat: loop }, (d, t) => setBusy({ done: d, total: t, label: 'Creating GIF…' }));
      setOut({ blob, url: URL.createObjectURL(blob), info: `${W}×${H}, ${frames.length} frames` });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!items.length) return <>
    <DropZone accept={IMAGE_ACCEPT} multiple label="Choose images" hint={`or drop images here — up to ${MAX}, they play in order`} onFiles={add} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="frames">
        {items.map((it, i) => (
          <li key={it.id}><img src={it.url} alt={`Frame ${i + 1}`} /><span>{i + 1}</span>
            <div><MoveButtons i={i} n={items.length} move={(a, b) => { setItems(moveItem(items, a, b)); setOut(null); }} remove={(k) => { URL.revokeObjectURL(items[k].url); setItems(items.filter((_, j) => j !== k)); setOut(null); }} /></div>
          </li>
        ))}
      </ul>
      <div class="actions" style={{ justifyContent: 'flex-start' }}><DropZone compact accept={IMAGE_ACCEPT} multiple label="Add more images" onFiles={add} /></div>
      <div class="opts">
        <label>Width<select value={width} onChange={(e) => setWidth(+(e.target as HTMLSelectElement).value)}>{[240, 320, 480, 640, 800, 1080].map((v) => <option value={v}>{v} px</option>)}</select></label>
        <label>Time per frame<select value={delay} onChange={(e) => setDelay(+(e.target as HTMLSelectElement).value)}>{[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5].map((v) => <option value={v}>{v} sec</option>)}</select></label>
        <label>Repeat<select value={loop} onChange={(e) => setLoop(+(e.target as HTMLSelectElement).value)}><option value={0}>Forever</option><option value={-1}>Play once</option></select></label>
        <label>Different sizes<select value={fit} onChange={(e) => setFit((e.target as HTMLSelectElement).value as any)}><option value="contain">Fit whole image</option><option value="cover">Fill and crop</option></select></label>
        <label>Background<select value={bg} onChange={(e) => setBg((e.target as HTMLSelectElement).value)}><option value="#ffffff">White</option><option value="#000000">Black</option><option value="transparent">Transparent</option></select></label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big" style={{ color: 'var(--text)' }}>Done! {out.info} · {formatBytes(out.blob.size)}</p>
          <div class="gif-prev"><img src={out.url} alt="Your animated GIF" /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(out.blob, 'animation.gif')}>Download GIF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={items.length < 2} onClick={make}>{items.length < 2 ? 'Add at least 2 images' : 'Make GIF'}</button></div>}
    </div>
  );
}
