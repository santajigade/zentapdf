import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, zipFiles } from '../../lib/utils';
import type { Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';

type Out = { name: string; blob: Blob; url: string };
const DPI = { normal: 100, high: 150, max: 300 } as const;
const MAX_PIXELS = 16_000_000; // iOS Safari canvas limit is ~16.7 MP

export default function PdfToJpg({ initial = 'jpg' }: { initial?: 'jpg' | 'png' }) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'jpg' | 'png'>(initial);
  const [quality, setQuality] = useState<keyof typeof DPI>('high');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<Out[] | null>(null);
  const cancel = useRef(false);

  useEffect(() => () => out?.forEach((o) => URL.revokeObjectURL(o.url)), [out]);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setFile(f);
  };

  const convert = async () => {
    if (!file) return;
    setError(''); setOut(null); cancel.current = false;
    setBusy({ done: 0, total: 0, label: 'Loading PDF…' });
    let doc: any;
    try {
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await file.arrayBuffer());
      doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const n = doc.numPages;
      const base = baseName(file.name);
      const pad = String(n).length;
      const results: Out[] = [];
      const canvas = document.createElement('canvas');
      for (let i = 1; i <= n; i++) {
        if (cancel.current) break;
        setBusy({ done: i - 1, total: n, label: `Converting page ${i} of ${n}` });
        const page = await doc.getPage(i);
        let scale = DPI[quality] / 72;
        const vp0 = page.getViewport({ scale: 1 });
        if (vp0.width * vp0.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (vp0.width * vp0.height));
        const vp = page.getViewport({ scale });
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create image (out of memory?)'))), type, 0.9));
        const name = `${base}-page-${String(i).padStart(pad, '0')}.${format}`;
        results.push({ name, blob, url: URL.createObjectURL(blob) });
      }
      canvas.width = canvas.height = 0;
      setOut(results);
    } catch (e: any) {
      setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Please unlock it first, then try again.' : friendlyError(e));
    } finally {
      doc?.destroy?.();
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    if (!out || !file) return;
    if (out.length === 1) return downloadBlob(out[0].blob, out[0].name);
    setBusy({ done: 0, total: 0, label: 'Creating ZIP…' });
    try { downloadBlob(await zipFiles(out), `${baseName(file.name)}-${format}.zip`); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file)
    return <>
      <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const warn = sizeWarning(file.size * (quality === 'max' ? 6 : 2));
  return (
    <div>
      <ul class="files">
        <li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
          <button type="button" class="mini" aria-label="Remove" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li>
      </ul>
      {!out && (
        <div class="opts">
          <div class="seg" role="group" aria-label="Image format">
            <button type="button" aria-pressed={format === 'jpg'} onClick={() => setFormat('jpg')}>JPG</button>
            <button type="button" aria-pressed={format === 'png'} onClick={() => setFormat('png')}>PNG</button>
          </div>
          <label>Quality
            <select value={quality} onChange={(e) => setQuality((e.target as HTMLSelectElement).value as any)}>
              <option value="normal">Normal (100 DPI)</option><option value="high">High (150 DPI)</option><option value="max">Very high (300 DPI)</option>
            </select>
          </label>
        </div>
      )}
      {warn && <ErrorBox>{warn}</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <>
        <ProgressBar {...busy} />
        {busy.total > 1 && <div class="actions"><button type="button" class="btn btn-ghost" onClick={() => (cancel.current = true)}>Stop</button></div>}
      </>}
      {out ? (
        <div class="done">
          <p class="big">Done! {out.length} page{out.length > 1 ? 's' : ''} converted to {format.toUpperCase()}.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={downloadAll} disabled={!!busy}>{out.length > 1 ? 'Download all (ZIP)' : 'Download image'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
          <div class="pages-grid">
            {out.slice(0, 60).map((o, i) => (
              <figure key={o.name}>
                <img src={o.url} alt={`Page ${i + 1}`} loading="lazy" />
                <a href={o.url} download={o.name}>Page {i + 1}</a> · {formatBytes(o.blob.size)}
              </figure>
            ))}
          </div>
        </div>
      ) : (
        !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={convert}>Convert to images</button></div>
      )}
    </div>
  );
}
