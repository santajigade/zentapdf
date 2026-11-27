import { useEffect, useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canvasFor, encode, prepBackground, outName, canEncode } from '../../lib/imageOps';

const TYPES = [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP'], ['image/avif', 'AVIF']] as const;

export default function ConvertImage() {
  const [type, setType] = useState('image/jpeg');
  const [quality, setQuality] = useState(90);
  const [ok, setOk] = useState<Record<string, boolean>>({ 'image/jpeg': true, 'image/png': true });

  useEffect(() => { (async () => {
    const r: Record<string, boolean> = {};
    for (const [t] of TYPES) r[t] = await canEncode(t);
    setOk(r);
  })(); }, []);

  const process = async (file: File) => {
    const bmp = await loadBitmap(file);
    const { c, ctx } = canvasFor(bmp.width, bmp.height);
    prepBackground(ctx, type, c.width, c.height);
    ctx.drawImage(bmp, 0, 0); bmp.close();
    const blob = await encode(c, type, quality / 100);
    return { blob, name: outName(file.name, '', type) };
  };
  const lossy = type !== 'image/png';
  return (
    <ImageBatch actionLabel="Convert" zipName="converted-images.zip" process={process} optionsKey={type + quality}
      options={<>
        <div class="seg" role="group" aria-label="Convert to">
          {TYPES.map(([t, label]) => (
            <button type="button" aria-pressed={type === t} disabled={ok[t] === false} title={ok[t] === false ? 'Your browser cannot create this format' : ''} onClick={() => setType(t)}>{label}</button>
          ))}
        </div>
        {lossy && <label>Quality: {quality}%<input type="range" min={40} max={100} step={5} value={quality} onInput={(e) => setQuality(+(e.target as HTMLInputElement).value)} /></label>}
        {(ok['image/webp'] === false || ok['image/avif'] === false) && <span class="status">Some formats are greyed out because this browser can’t create them, try Chrome or Edge.</span>}
      </>} />
  );
}
