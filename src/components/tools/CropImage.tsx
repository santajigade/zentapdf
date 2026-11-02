import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError } from '../../lib/utils';
import { isImage, loadBitmap, canvasFor, encode, prepBackground, sameType, outName } from '../../lib/imageOps';

type Box = { x: number; y: number; w: number; h: number }; // image pixels
const RATIOS: [string, number][] = [['Free', 0], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['9:16', 9 / 16]];

export default function CropImage() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; b: Box } | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = async (files: File[]) => {
    const f = files.find(isImage);
    if (!f) { setError('Please choose an image file.'); return; }
    try {
      const bmp = await loadBitmap(f);
      const w = bmp.width, h = bmp.height; bmp.close();
      setError(''); setResult(null); setFile(f); setUrl(URL.createObjectURL(f));
      setSize({ w, h }); setRatio(0);
      setBox({ x: Math.round(w * 0.1), y: Math.round(h * 0.1), w: Math.round(w * 0.8), h: Math.round(h * 0.8) });
    } catch { setError('Could not read this image.'); }
  };

  const clamp = (b: Box): Box => {
    let { x, y, w, h } = b;
    w = Math.max(1, Math.min(Math.round(w), size.w)); h = Math.max(1, Math.min(Math.round(h), size.h));
    x = Math.max(0, Math.min(Math.round(x), size.w - w)); y = Math.max(0, Math.min(Math.round(y), size.h - h));
    return { x, y, w, h };
  };

  const applyRatio = (r: number) => {
    setRatio(r); setResult(null);
    if (!r) return;
    let w = size.w, h = w / r;
    if (h > size.h) { h = size.h; w = h * r; }
    w *= 0.9; h *= 0.9;
    setBox(clamp({ x: (size.w - w) / 2, y: (size.h - h) / 2, w, h }));
  };

  const scale = () => (imgRef.current ? size.w / imgRef.current.clientWidth : 1);
  const down = (mode: 'move' | 'resize') => (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, b: box };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const s = scale(), dx = (e.clientX - d.sx) * s, dy = (e.clientY - d.sy) * s;
    if (d.mode === 'move') setBox(clamp({ ...d.b, x: d.b.x + dx, y: d.b.y + dy }));
    else {
      let w = Math.min(d.b.w + dx, size.w - d.b.x), h = ratio ? w / ratio : Math.min(d.b.h + dy, size.h - d.b.y);
      if (ratio && d.b.y + h > size.h) { h = size.h - d.b.y; w = h * ratio; }
      setBox(clamp({ ...d.b, w: Math.max(10, w), h: Math.max(10, h) }));
    }
    setResult(null);
  };
  const up = () => { drag.current = null; };

  const crop = async () => {
    if (!file) return;
    try {
      const bmp = await loadBitmap(file);
      const type = sameType(file);
      const { c, ctx } = canvasFor(box.w, box.h);
      prepBackground(ctx, type, box.w, box.h);
      ctx.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h); bmp.close();
      setResult({ blob: await encode(c, type, 0.92), name: outName(file.name, '-cropped', type) });
    } catch (e) { setError(friendlyError(e)); }
  };

  if (!file) return <>
    <DropZone accept="image/*,.heic,.heif" label="Choose image" hint="JPG, PNG, WebP — or drop it here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const pct = (v: number, t: number) => (v / t) * 100 + '%';
  const field = (k: keyof Box, label: string) => (
    <label>{label}<input type="number" min={0} value={box[k]} style={{ minWidth: '90px', width: '90px' }}
      onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value, 10) || 0; const b = { ...box, [k]: v }; if (ratio && k === 'w') b.h = v / ratio; if (ratio && k === 'h') b.w = v * ratio; setBox(clamp(b)); setResult(null); }} /></label>
  );
  return (
    <div>
      <div class="opts" data-title="Shape">
        <div class="seg" role="group" aria-label="Aspect ratio">
          {RATIOS.map(([l, r]) => <button type="button" aria-pressed={ratio === r} onClick={() => applyRatio(r)}>{l}</button>)}
        </div>
      </div>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: '8px', left: '50%', transform: 'translateX(-50%)' }}
        onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img ref={imgRef} src={url} alt="Image to crop" draggable={false} style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }} />
        <div onPointerDown={down('move')} aria-label="Crop area — drag to move"
          style={{ position: 'absolute', left: pct(box.x, size.w), top: pct(box.y, size.h), width: pct(box.w, size.w), height: pct(box.h, size.h),
            border: '2px solid #fff', outline: '1px solid rgb(0 0 0 / .5)', boxShadow: '0 0 0 9999px rgb(0 0 0 / .45)', cursor: 'move' }}>
          <div onPointerDown={down('resize')} aria-label="Drag to resize"
            style={{ position: 'absolute', right: '2px', bottom: '2px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--brand)', border: '3px solid #fff', cursor: 'nwse-resize' }} />
        </div>
      </div>
      <div class="opts" data-title="Exact position">{field('x', 'Left')}{field('y', 'Top')}{field('w', 'Width')}{field('h', 'Height')}<span class="status">Image: {size.w}×{size.h}px</span></div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {result ? (
        <div class="done">
          <p class="big">Done! Cropped to {box.w}×{box.h}px ({formatBytes(result.blob.size)})</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result.blob, result.name)}>Download image</button>
            <button type="button" class="btn btn-ghost" onClick={() => setResult(null)}>Adjust crop</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New image</button>
          </div>
        </div>
      ) : (
        <div class="actions">
          <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>Change image</button>
          <button type="button" class="btn btn-primary btn-lg" onClick={crop}>Crop image</button>
        </div>
      )}
    </div>
  );
}
