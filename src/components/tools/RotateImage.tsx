import { useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canvasFor, encode, prepBackground, sameType, outName } from '../../lib/imageOps';

export default function RotateImage() {
  const [angle, setAngle] = useState(90); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const process = async (file: File) => {
    const bmp = await loadBitmap(file);
    const side = angle % 180 !== 0;
    const w = side ? bmp.height : bmp.width, h = side ? bmp.width : bmp.height;
    const type = sameType(file);
    const { c, ctx } = canvasFor(w, h);
    prepBackground(ctx, type, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2); bmp.close();
    return { blob: await encode(c, type, 0.92), name: outName(file.name, '-rotated', type) };
  };
  const transform = `rotate(${angle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`;
  return (
    <ImageBatch actionLabel="Rotate" zipName="rotated-images.zip" process={process} optionsKey={[angle, flipH, flipV].join()}
      preview={(items) => (
        <div style={{ display: 'grid', placeItems: 'center', height: '200px', background: 'var(--bg-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          <img src={items[0].url} alt="Preview" style={{ maxWidth: '170px', maxHeight: '170px', transform, transition: 'transform .2s' }} />
        </div>
      )}
      options={<>
        <button type="button" class="btn btn-ghost" onClick={() => setAngle((angle + 270) % 360)}>⟲ Rotate left</button>
        <button type="button" class="btn btn-ghost" onClick={() => setAngle((angle + 90) % 360)}>⟳ Rotate right</button>
        <button type="button" class="btn btn-ghost" aria-pressed={flipH} onClick={() => setFlipH(!flipH)}>⇋ Flip horizontal{flipH ? ' ✓' : ''}</button>
        <button type="button" class="btn btn-ghost" aria-pressed={flipV} onClick={() => setFlipV(!flipV)}>⇵ Flip vertical{flipV ? ' ✓' : ''}</button>
        <span class="status">Rotation: {angle}°</span>
      </>} />
  );
}
