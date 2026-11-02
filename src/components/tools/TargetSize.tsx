import { useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canvasFor, outName } from '../../lib/imageOps';

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/jpeg', q));

/** Draw the bitmap at w×h (cover-crop when an exact size is requested). */
function draw(bmp: ImageBitmap, w: number, h: number, exact: boolean) {
  const { c, ctx } = canvasFor(w, h);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (exact) {
    const s = Math.max(w / bmp.width, h / bmp.height), sw = w / s, sh = h / s;
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  } else ctx.drawImage(bmp, 0, 0, w, h);
  return c;
}

/** Find the best-quality JPEG that fits under `target` bytes, shrinking the image only if needed. */
async function fit(bmp: ImageBitmap, target: number, W: number, H: number, exact: boolean) {
  let w = W, h = H, best: Blob | null = null;
  for (let round = 0; round < 8; round++) {
    const c = draw(bmp, w, h, exact);
    let lo = 0.3, hi = 0.95, found: Blob | null = null;
    const top = await toBlob(c, hi);
    if (top.size <= target) found = top;
    else {
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2, b = await toBlob(c, mid);
        if (b.size <= target) { found = b; lo = mid; } else hi = mid;
      }
      if (!found) { const b = await toBlob(c, 0.3); if (b.size <= target) found = b; }
    }
    c.width = c.height = 0;
    if (found) { best = found; break; }
    if (exact) { const b = await toBlob(draw(bmp, w, h, exact), 0.2); best = b; break; } // exact size requested: keep size, lowest quality
    const s = Math.max(0.5, Math.sqrt(target / top.size) * 0.9);
    w = Math.max(16, Math.round(w * s)); h = Math.max(16, Math.round(h * s));
  }
  return { blob: best!, w, h };
}

export default function TargetSize({ kb }: { kb?: number }) {
  const [target, setTarget] = useState(kb ?? 50);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const process = async (file: File) => {
    const bmp = await loadBitmap(file);
    const exact = dims.w > 0 && dims.h > 0;
    const W = exact ? dims.w : bmp.width, H = exact ? dims.h : bmp.height;
    const r = await fit(bmp, target * 1024, W, H, exact); bmp.close();
    const note = r.blob.size > target * 1024 ? ' (smallest possible at this size)' : '';
    return { blob: r.blob, name: outName(file.name, `-${target}kb`, 'image/jpeg'), info: `${r.w}×${r.h} · target ${target} KB${note}` };
  };
  const n = (v: number, set: (v: number) => void, min: number, max: number, ph?: string) => (
    <input type="number" min={min} max={max} value={v || ''} placeholder={ph} style={{ minWidth: '90px', width: '100px' }} onInput={(e) => set(Math.max(0, Math.min(max, parseInt((e.target as HTMLInputElement).value, 10) || 0)))} />
  );
  return (
    <ImageBatch actionLabel="Compress" zipName={`images-${target}kb.zip`} process={process} optionsKey={[target, dims.w, dims.h].join()}
      hint={`JPG, PNG, WebP — we make each one ${target} KB or smaller`}
      options={<>
        <label>Target size (KB){n(target, setTarget, 5, 5000)}</label>
        {!kb && <div class="seg" role="group" aria-label="Common sizes">{[20, 50, 100, 200, 500].map((v) => <button type="button" aria-pressed={target === v} onClick={() => setTarget(v)}>{v} KB</button>)}</div>}
        <label>Width px (optional){n(dims.w, (v) => setDims({ ...dims, w: v }), 0, 8000, 'auto')}</label>
        <label>Height px (optional){n(dims.h, (v) => setDims({ ...dims, h: v }), 0, 8000, 'auto')}</label>
        <span class="status" style={{ flexBasis: '100%', textAlign: 'left' }}>Output is JPG — accepted by almost every online form. Set both width and height only if the form asks for an exact size in pixels.</span>
      </>} />
  );
}
