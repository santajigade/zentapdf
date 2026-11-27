import { useState } from 'preact/hooks';
import { DropZone, ErrorBox, ProgressBar } from './shared';
import { downloadBlob, zipFiles, formatBytes, uid, baseName } from '../../lib/utils';
import { IMAGE_ACCEPT, isImage, loadBitmap, EXT } from '../../lib/imageOps';
import type { Progress } from '../../lib/pdfJob';

type Item = { id: string; file: File; url: string; meta?: Record<string, any> | null; gps?: { latitude: number; longitude: number } | null; clean?: Blob; err?: string };

/** Remove EXIF/XMP/IPTC/comments from a JPEG without re-compressing (keeps APP0 JFIF and colour profile). */
function stripJpeg(buf: ArrayBuffer): Uint8Array {
  const b = new Uint8Array(buf), out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1];
    if (m === 0xda) { out.push(b.subarray(i)); i = b.length; break; } // start of scan: rest is image data
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = b.subarray(i, i + 2 + len);
    const isIcc = m === 0xe2 && String.fromCharCode(...b.subarray(i + 4, i + 15)) === 'ICC_PROFILE';
    const drop = (m === 0xe1) || (m >= 0xe3 && m <= 0xef) || m === 0xfe || (m === 0xe2 && !isIcc);
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  const total = out.reduce((s, x) => s + x.length, 0), r = new Uint8Array(total);
  let o = 0; for (const x of out) { r.set(x, o); o += x.length; }
  return r;
}

/** Remove text/EXIF/time chunks from a PNG without changing pixels. */
function stripPng(buf: ArrayBuffer): Uint8Array {
  const b = new Uint8Array(buf), v = new DataView(buf), out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= b.length) {
    const len = v.getUint32(i), type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    const chunk = b.subarray(i, i + 12 + len);
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type)) out.push(chunk);
    i += 12 + len;
    if (type === 'IEND') break;
  }
  const total = out.reduce((s, x) => s + x.length, 0), r = new Uint8Array(total);
  let o = 0; for (const x of out) { r.set(x, o); o += x.length; }
  return r;
}

async function clean(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name)) {
    // Keep orientation visually correct: if the photo relies on EXIF rotation, re-encode it upright
    const { jpegOrientation } = await import('../../lib/utils');
    if (jpegOrientation(buf) === 1) return new Blob([stripJpeg(buf) as BlobPart], { type: 'image/jpeg' });
  } else if (/png/i.test(file.type) || /\.png$/i.test(file.name)) {
    return new Blob([stripPng(buf) as BlobPart], { type: 'image/png' });
  }
  // Other formats (WebP, HEIC, rotated JPG…): redraw the pixels, which drops all metadata
  const bmp = await loadBitmap(file);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
  const type = /png|webp/i.test(file.type) ? file.type : 'image/jpeg';
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode'))), type, 0.95));
}

const LABELS: [string, string][] = [
  ['Make', 'Camera make'], ['Model', 'Camera model'], ['LensModel', 'Lens'], ['DateTimeOriginal', 'Date taken'], ['ExposureTime', 'Exposure (s)'],
  ['FNumber', 'Aperture (f/)'], ['ISO', 'ISO'], ['FocalLength', 'Focal length (mm)'], ['Software', 'Software'], ['Artist', 'Author'],
  ['Copyright', 'Copyright'], ['ImageDescription', 'Description'], ['ExifImageWidth', 'Width (px)'], ['ExifImageHeight', 'Height (px)'],
  ['Orientation', 'Orientation'], ['GPSAltitude', 'Altitude (m)'], ['HostComputer', 'Device'], ['OwnerName', 'Owner'], ['SerialNumber', 'Serial number'],
];
const fmt = (v: any) => v instanceof Date ? v.toLocaleString() : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(4)) : Array.isArray(v) ? v.join(', ') : String(v);

export default function ExifTool({ mode = 'view' }: { mode?: 'view' | 'remove' }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const add = async (files: File[]) => {
    const imgs = files.filter(isImage); setError(imgs.length < files.length ? 'Some files were skipped because they are not images.' : ''); setDone(false);
    const exifr = (await import('exifr')).default;
    const fresh: Item[] = [];
    for (const file of imgs) {
      let meta: any = null, gps: any = null;
      try { meta = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, ifd1: false, translateValues: true, reviveValues: true }); } catch { /* no metadata */ }
      try { gps = await exifr.gps(file); } catch { /* no gps */ }
      fresh.push({ id: uid(), file, url: URL.createObjectURL(file), meta: meta ?? null, gps: gps && isFinite(gps.latitude) ? gps : null });
    }
    setItems((cur) => [...cur, ...fresh]);
  };

  const removeAll = async () => {
    const next: Item[] = [];
    for (let k = 0; k < items.length; k++) {
      setBusy({ done: k, total: items.length, label: `Cleaning ${k + 1} of ${items.length}` });
      try { next.push({ ...items[k], clean: await clean(items[k].file), err: undefined }); } catch { next.push({ ...items[k], err: 'Could not clean this image.' }); }
    }
    setItems(next); setBusy(null); setDone(true);
  };
  const outName = (it: Item) => `${baseName(it.file.name)}-no-metadata.${it.clean?.type === 'image/png' ? 'png' : EXT[it.clean?.type ?? ''] ?? 'jpg'}`;
  const downloadAll = async () => {
    const ok = items.filter((i) => i.clean);
    if (ok.length === 1) return downloadBlob(ok[0].clean!, outName(ok[0]));
    downloadBlob(await zipFiles(ok.map((i) => ({ name: outName(i), blob: i.clean! }))), 'photos-no-metadata.zip');
  };

  if (!items.length) return <>
    <DropZone accept={IMAGE_ACCEPT} multiple label="Choose photos" hint="JPG, PNG, WebP or HEIC, see and remove hidden photo data" onFiles={add} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      {items.map((it) => {
        const rows = LABELS.filter(([k]) => it.meta?.[k] !== undefined && it.meta?.[k] !== '').map(([k, l]) => [l, fmt(it.meta![k])]);
        const extra = it.meta ? Object.keys(it.meta).length - rows.length : 0;
        return (
          <div key={it.id} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', marginBottom: '12px', background: 'var(--bg-soft)' }}>
            <img src={it.url} alt="" style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '10px', flex: 'none' }} />
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <strong style={{ wordBreak: 'break-all' }}>{it.file.name}</strong> <span class="meta" style={{ color: 'var(--muted)' }}>· {formatBytes(it.file.size)}{it.clean && <> → {formatBytes(it.clean.size)}</>}</span>
              {it.gps
                ? <p style={{ margin: '6px 0', color: 'var(--err)', fontWeight: 600 }}>⚠ Location found: {it.gps.latitude.toFixed(5)}, {it.gps.longitude.toFixed(5)}, <a href={`https://www.google.com/maps?q=${it.gps.latitude},${it.gps.longitude}`} target="_blank" rel="noopener nofollow">see on map</a></p>
                : <p style={{ margin: '6px 0', color: 'var(--ok)', fontWeight: 600 }}>✓ No GPS location in this photo</p>}
              {rows.length ? (
                <table style={{ fontSize: '.88rem', borderCollapse: 'collapse', width: '100%' }}><tbody>
                  {rows.map(([l, v]) => <tr><td style={{ color: 'var(--muted)', padding: '2px 10px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{l}</td><td style={{ padding: '2px 0', wordBreak: 'break-word' }}>{v}</td></tr>)}
                </tbody></table>
              ) : <p class="status" style={{ textAlign: 'left', margin: 0 }}>{it.meta ? 'Only technical data found.' : 'No hidden metadata found.'}</p>}
              {extra > 0 && <p class="status" style={{ textAlign: 'left', margin: '4px 0 0' }}>+ {extra} more technical fields</p>}
              {it.err && <p style={{ color: 'var(--err)' }}>{it.err}</p>}
              {it.clean && <button type="button" class="dl-file" style={{ marginTop: '8px' }} onClick={() => downloadBlob(it.clean!, outName(it))}>Download clean photo</button>}
            </div>
          </div>
        );
      })}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      <div class="actions">
        {done
          ? <button type="button" class="btn btn-primary dl btn-lg" onClick={downloadAll}>{items.length > 1 ? 'Download all (ZIP)' : 'Download clean photo'}</button>
          : <button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={removeAll}>{mode === 'remove' ? 'Remove metadata' : 'Remove all metadata'}</button>}
        <DropZone compact accept={IMAGE_ACCEPT} multiple label="Add photos" onFiles={add} />
        <button type="button" class="btn btn-ghost" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]); setDone(false); }}>Start over</button>
      </div>
      <p class="status">JPG and PNG photos are cleaned without any quality loss. Other formats are re-saved at high quality.</p>
    </div>
  );
}
