import { useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canvasFor, encode, prepBackground, sameType, outName } from '../../lib/imageOps';

export default function ResizeImage() {
  const [mode, setMode] = useState<'px' | 'pct'>('px');
  const [w, setW] = useState(1280);
  const [h, setH] = useState(0);
  const [keep, setKeep] = useState(true);
  const [pct, setPct] = useState(50);
  const [noUpscale, setNoUpscale] = useState(true);

  const process = async (file: File) => {
    const bmp = await loadBitmap(file);
    const ow = bmp.width, oh = bmp.height;
    let nw: number, nh: number;
    if (mode === 'pct') { nw = (ow * pct) / 100; nh = (oh * pct) / 100; }
    else if (keep) {
      const s = w && h ? Math.min(w / ow, h / oh) : w ? w / ow : h ? h / oh : 1;
      nw = ow * s; nh = oh * s;
    } else { nw = w || ow; nh = h || oh; }
    if (noUpscale && (nw > ow || nh > oh)) { const s = Math.min(ow / nw, oh / nh); nw *= s; nh *= s; }
    const type = sameType(file);
    const { c, ctx } = canvasFor(nw, nh);
    prepBackground(ctx, type, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const info = `${ow}×${oh} → ${c.width}×${c.height}`;
    return { blob: await encode(c, type, 0.92), name: outName(file.name, '-resized', type), info };
  };

  const num = (set: (n: number) => void) => (e: Event) => set(Math.max(0, parseInt((e.target as HTMLInputElement).value, 10) || 0));
  return (
    <ImageBatch actionLabel="Resize" zipName="resized-images.zip" process={process} optionsKey={[mode, w, h, keep, pct, noUpscale].join()}
      options={<>
        <div class="seg" role="group" aria-label="Resize by">
          <button type="button" aria-pressed={mode === 'px'} onClick={() => setMode('px')}>By pixels</button>
          <button type="button" aria-pressed={mode === 'pct'} onClick={() => setMode('pct')}>By percent</button>
        </div>
        {mode === 'px' ? <>
          <label>Width (px)<input type="number" min={0} value={w || ''} placeholder="auto" onInput={num(setW)} /></label>
          <label>Height (px)<input type="number" min={0} value={h || ''} placeholder="auto" onInput={num(setH)} /></label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={keep} onChange={(e) => setKeep((e.target as HTMLInputElement).checked)} /> Keep proportions</label>
        </> : (
          <label>Size: {pct}%<input type="range" min={5} max={200} step={5} value={pct} onInput={num(setPct)} /></label>
        )}
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={noUpscale} onChange={(e) => setNoUpscale((e.target as HTMLInputElement).checked)} /> Don’t enlarge small images</label>
      </>} />
  );
}
