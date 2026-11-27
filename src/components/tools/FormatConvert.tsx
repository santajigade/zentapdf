import { useEffect, useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canvasFor, encode, prepBackground, outName, canEncode } from '../../lib/imageOps';

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const NAME: Record<string, string> = { jpg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF', bmp: 'BMP', svg: 'SVG', heic: 'HEIC' };
const MAX = 5;

export default function FormatConvert({ from, to, accept }: { from: string; to: string; accept: string }) {
  const type = MIME[to];
  const [quality, setQuality] = useState(90);
  const [ok, setOk] = useState(true);
  useEffect(() => { canEncode(type).then(setOk); }, []);

  const process = async (file: File) => {
    if (!ok) throw new Error(`This browser cannot create ${NAME[to]} files. Please use Chrome or Edge.`);
    const bmp = await loadBitmap(file);
    const { c, ctx } = canvasFor(bmp.width, bmp.height);
    prepBackground(ctx, type, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const info = `${c.width}×${c.height}`;
    return { blob: await encode(c, type, quality / 100), name: outName(file.name, '', type), info };
  };

  return (
    <ImageBatch actionLabel="Convert" zipName={`${from}-to-${to}.zip`} process={process} optionsKey={String(quality)} max={MAX}
      accept={accept + ',image/*,.heic,.heif'} hint={`${NAME[from]} images, up to ${MAX} at a time, or drop them here`}
      options={<>
        {to !== 'png' && <label>Quality: {quality}%<input type="range" min={40} max={100} step={5} value={quality} onInput={(e) => setQuality(+(e.target as HTMLInputElement).value)} /></label>}
        <span class="status">Up to {MAX} images per conversion.</span>
        {!ok && <span class="status" style={{ color: 'var(--err)' }}>This browser can’t create {NAME[to]} files, please open this page in Chrome or Edge.</span>}
      </>} />
  );
}
