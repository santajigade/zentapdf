import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, MoveButtons, moveItem, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, uid, jpegOrientation, baseName } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadBitmap, isHeicFile } from '../../lib/imageOps';

type Item = { id: string; file: File; url: string };
type Prepared = { bytes: ArrayBuffer; kind: 'jpg' | 'png'; w: number; h: number };

async function prepare(file: File): Promise<Prepared> {
  const buf = await file.arrayBuffer();
  const isJpg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const isPng = /png/i.test(file.type) || /\.png$/i.test(file.name);
  // createImageBitmap applies EXIF rotation, so dimensions are as the user sees them.
  const bmp = isHeicFile(file) ? await loadBitmap(file) : await createImageBitmap(new Blob([buf], { type: file.type }));
  const w = bmp.width, h = bmp.height;
  if (isJpg && jpegOrientation(buf) === 1) { bmp.close(); return { bytes: buf, kind: 'jpg', w, h }; }
  if (isPng) { bmp.close(); return { bytes: buf, kind: 'png', w, h }; }
  // Rotated JPG, WebP, GIF, BMP… → re-encode as high-quality JPG (PNG if it has transparency is overkill; JPG on white).
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0); bmp.close();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.92));
  c.width = c.height = 0;
  return { bytes: await blob.arrayBuffer(), kind: 'jpg', w, h };
}

export default function JpgToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState<'fit' | 'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [margin, setMargin] = useState(20);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Blob | null>(null);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));
    setError(imgs.length < files.length ? 'Some files were skipped because they are not images.' : '');
    setResult(null);
    setItems((cur) => [...cur, ...imgs.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))]);
  };

  const convert = async () => {
    setError(''); setResult(null);
    try {
      const prepared: Prepared[] = [];
      for (let i = 0; i < items.length; i++) {
        setBusy({ done: i, total: items.length * 2, label: `Preparing image ${i + 1} of ${items.length}` });
        try { prepared.push(await prepare(items[i].file)); }
        catch { throw new Error(`"${items[i].file.name}" could not be read as an image.`); }
      }
      const r = await runPdfJob<{ files: Uint8Array[] }>(
        { op: 'images', images: prepared, page, orientation, margin },
        prepared.map((p) => p.bytes),
        (p) => setBusy({ done: items.length + p.done, total: items.length * 2, label: p.label }),
      );
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!items.length)
    return <>
      <DropZone accept="image/*,.heic,.heif" multiple label="Choose images" hint="JPG, PNG or WebP — or drop them here" onFiles={add} />
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const warn = sizeWarning(items.reduce((s, i) => s + i.file.size, 0) * 3);
  const outName = (items.length === 1 ? baseName(items[0].file.name) : 'images') + '.pdf';

  return (
    <div>
      <ul class="files" aria-label="Images (in page order)">
        {items.map((it, i) => (
          <li key={it.id}>
            <span class="num">{i + 1}</span>
            <img class="thumb" src={it.url} alt="" loading="lazy" />
            <span class="fname" title={it.file.name}>{it.file.name}</span>
            <span class="meta">{formatBytes(it.file.size)}</span>
            <MoveButtons i={i} n={items.length} move={(a, b) => { setItems(moveItem(items, a, b)); setResult(null); }}
              remove={(k) => { URL.revokeObjectURL(items[k].url); setItems(items.filter((_, j) => j !== k)); setResult(null); }} />
          </li>
        ))}
      </ul>
      {!result && (
        <div class="opts">
          <label>Page size
            <select value={page} onChange={(e) => setPage((e.target as HTMLSelectElement).value as any)}>
              <option value="a4">A4</option><option value="letter">US Letter</option><option value="fit">Same as image</option>
            </select>
          </label>
          {page !== 'fit' && (
            <label>Orientation
              <select value={orientation} onChange={(e) => setOrientation((e.target as HTMLSelectElement).value as any)}>
                <option value="auto">Automatic</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select>
            </label>
          )}
          <label>Margin
            <select value={margin} onChange={(e) => setMargin(+(e.target as HTMLSelectElement).value)}>
              <option value={0}>None</option><option value={20}>Small</option><option value={40}>Large</option>
            </select>
          </label>
        </div>
      )}
      {warn && <ErrorBox>{warn}</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          <p class="big">Done! {items.length} image{items.length > 1 ? 's' : ''} converted to PDF.</p>
          <p class="status">{formatBytes(result.size)}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(result, outName)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setResult(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]); setResult(null); }}>Start over</button>
          </div>
        </div>
      ) : (
        <div class="actions">
          <DropZone compact accept="image/*,.heic,.heif" multiple label="Add more images" onFiles={add} />
          <button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={convert}>Convert to PDF</button>
        </div>
      )}
    </div>
  );
}
