import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, uid, baseName, zipFiles, friendlyError } from '../../lib/utils';
import type { Progress } from '../../lib/pdfJob';
import { loadBitmap, isHeicFile } from '../../lib/imageOps';

type Item = { id: string; file: File; url: string; out?: Blob; outName?: string; w?: number; h?: number; err?: string; kept?: boolean };
type Fmt = 'same' | 'jpg' | 'webp';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function targetType(file: File, fmt: Fmt): string {
  if (fmt === 'jpg') return 'image/jpeg';
  if (fmt === 'webp') return 'image/webp';
  return EXT[file.type] ? file.type : 'image/jpeg';
}

// Main-thread fallback for browsers without OffscreenCanvas in workers.
async function compressMain(blob: Blob, type: string, quality: number, maxWidth: number) {
  const bmp = await loadBitmap(blob);
  let w = bmp.width, h = bmp.height; const ow = w;
  if (maxWidth && w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  const out: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, quality));
  c.width = c.height = 0;
  return { blob: out, w, h, ow };
}

function makeRunner() {
  const canWorker = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined';
  if (!canWorker) return { run: compressMain, stop: () => {} };
  const w = new Worker(new URL('../../lib/image.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<string, (v: any) => void>();
  w.onmessage = (e) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
  return {
    run: (blob: Blob, type: string, quality: number, maxWidth: number) => isHeicFile(blob as any) ? compressMain(blob, type, quality, maxWidth) :
      new Promise<{ blob: Blob; w: number; h: number; ow: number }>((res, rej) => {
        const id = uid();
        pending.set(id, (d) => (d.error ? compressMain(blob, type, quality, maxWidth).then(res, rej) : res(d)));
        w.postMessage({ id, blob, type, quality, maxWidth });
      }),
    stop: () => w.terminate(),
  };
}

export default function CompressImage() {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(75);
  const [maxWidth, setMaxWidth] = useState(0);
  const [fmt, setFmt] = useState<Fmt>('same');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));
    setError(imgs.length < files.length ? 'Some files were skipped because they are not images.' : '');
    setDone(false);
    setItems((cur) => [...cur.map((i) => ({ ...i, out: undefined, err: undefined })), ...imgs.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))]);
  };

  const compress = async () => {
    setError(''); setDone(false);
    const runner = makeRunner();
    const next: Item[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setBusy({ done: i, total: items.length, label: `Compressing ${i + 1} of ${items.length}` });
        let type = targetType(it.file, fmt);
        try {
          let r = await runner.run(it.file, type, quality / 100, maxWidth);
          // Safari can't encode WebP and silently returns PNG, fall back to JPG.
          if (r.blob.type !== type) { type = 'image/jpeg'; r = await runner.run(it.file, type, quality / 100, maxWidth); }
          const sameFormat = type === it.file.type;
          const resized = r.w < r.ow;
          const kept = sameFormat && !resized && r.blob.size >= it.file.size;
          next.push({ ...it, out: kept ? it.file : r.blob, kept, w: r.w, h: r.h, outName: `${baseName(it.file.name)}-compressed.${EXT[type] ?? 'jpg'}` });
        } catch (e) {
          next.push({ ...it, err: 'Could not read this image.' });
        }
      }
      setItems(next); setDone(true);
    } catch (e) { setError(friendlyError(e)); }
    finally { runner.stop(); setBusy(null); }
  };

  const downloadAll = async () => {
    const ok = items.filter((i) => i.out);
    if (ok.length === 1) return downloadBlob(ok[0].out!, ok[0].outName!);
    setBusy({ done: 0, total: 0, label: 'Creating ZIP…' });
    try { downloadBlob(await zipFiles(ok.map((i) => ({ name: i.outName!, blob: i.out! }))), 'compressed-images.zip'); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!items.length)
    return <>
      <DropZone accept="image/*,.heic,.heif" multiple label="Choose images" hint="JPG, PNG or WebP, or drop them here" onFiles={add} />
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const before = items.reduce((s, i) => s + i.file.size, 0);
  const after = items.reduce((s, i) => s + (i.out?.size ?? i.file.size), 0);
  const saved = before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;

  return (
    <div>
      <div class="opts">
        <label>Quality: {quality}%
          <input type="range" min={30} max={95} step={5} value={quality} onInput={(e) => { setQuality(+(e.target as HTMLInputElement).value); setDone(false); }} />
        </label>
        <label>Max width
          <select value={maxWidth} onChange={(e) => { setMaxWidth(+(e.target as HTMLSelectElement).value); setDone(false); }}>
            <option value={0}>Keep original</option><option value={3840}>3840 px (4K)</option><option value={1920}>1920 px (Full HD)</option>
            <option value={1280}>1280 px</option><option value={800}>800 px</option>
          </select>
        </label>
        <label>Output format
          <select value={fmt} onChange={(e) => { setFmt((e.target as HTMLSelectElement).value as Fmt); setDone(false); }}>
            <option value="same">Same as original</option><option value="jpg">JPG</option><option value="webp">WebP (smallest)</option>
          </select>
        </label>
      </div>
      <ul class="files" aria-label="Images">
        {items.map((it, k) => (
          <li key={it.id}>
            <img class="thumb" src={it.url} alt="" loading="lazy" />
            <span class="fname" title={it.file.name}>{it.file.name}</span>
            <span class="meta">
              {formatBytes(it.file.size)}
              {it.out && <> → <b>{formatBytes(it.out.size)}</b> <span class="saving">{it.kept ? '(already optimal)' : `-${Math.max(0, Math.round((1 - it.out.size / it.file.size) * 100))}%`}</span></>}
              {it.err && <span style={{ color: 'var(--err)' }}> {it.err}</span>}
            </span>
            {it.out
              ? <button type="button" class="dl-file" aria-label={'Download ' + it.outName} onClick={() => downloadBlob(it.out!, it.outName!)}>Download</button>
              : <button type="button" class="mini" aria-label="Remove" disabled={!!busy} onClick={() => { URL.revokeObjectURL(it.url); setItems(items.filter((_, j) => j !== k)); }}>✕</button>}
          </li>
        ))}
      </ul>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {done && !busy ? (
        <div class="done">
          <p class="big">Done! You saved {saved}% ({formatBytes(before)} → {formatBytes(after)})</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={downloadAll}>{items.filter((i) => i.out).length > 1 ? 'Download all (ZIP)' : 'Download image'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]); setDone(false); }}>Start over</button>
          </div>
          <p class="status">Change the settings above and press Compress again to try a different size.</p>
          <div class="actions"><button type="button" class="btn btn-ghost" onClick={compress}>Compress again</button></div>
        </div>
      ) : (
        <div class="actions">
          <DropZone compact accept="image/*,.heic,.heif" multiple label="Add more images" onFiles={add} />
          <button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={compress}>Compress {items.length > 1 ? `${items.length} images` : 'image'}</button>
        </div>
      )}
    </div>
  );
}
