import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';

type Mode = 'numbers' | 'watermark' | 'crop' | 'flatten' | 'metadata';
const LABEL: Record<Mode, [string, string]> = {
  numbers: ['Add page numbers', 'numbered'], watermark: ['Add watermark', 'watermarked'], crop: ['Crop PDF', 'cropped'],
  flatten: ['Flatten PDF', 'flattened'], metadata: ['Save metadata', 'edited'],
};
const META_KEYS = [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords (comma separated)'], ['creator', 'Creator (app)'], ['producer', 'Producer']] as const;

async function firstPageThumb(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 360 / Math.max(v1.width, v1.height) });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.8);
  } finally { doc.loadingTask.destroy(); }
}

export default function PdfEdit({ mode }: { mode: Mode }) {
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState('');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; note?: string } | null>(null);
  // options
  const [num, setNum] = useState({ pos: 'bc', format: 'n', start: 1, size: 11, color: '#333333', skipFirst: false, bold: false });
  const [wm, setWm] = useState({ text: 'CONFIDENTIAL', size: 60, opacity: 0.2, angle: 45, color: '#e11d48', tile: false, scale: 0.5 });
  const [wmImg, setWmImg] = useState<{ bytes: ArrayBuffer; kind: 'jpg' | 'png'; url: string } | null>(null);
  const [wmType, setWmType] = useState<'text' | 'image'>('text');
  const [crop, setCrop] = useState({ t: 10, r: 10, b: 10, l: 10 });
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [pageCount, setPageCount] = useState(0);
  const changed = () => setResult(null);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setResult(null); setThumb(''); setBusy({ done: 0, total: 0, label: 'Reading PDF…' });
    try {
      const buf = await f.arrayBuffer();
      const r = await runPdfJob<{ meta: Record<string, string>; pages: number }>({ op: 'edit', kind: 'meta-read', file: buf.slice(0), o: {} }, []);
      setMeta(r.meta); setPageCount(r.pages); setFile(f);
      if (mode === 'crop' || mode === 'watermark' || mode === 'numbers') firstPageThumb(buf).then(setThumb).catch(() => {});
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const pickImg = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    let bytes = await f.arrayBuffer(); let kind: 'jpg' | 'png' = /png/i.test(f.type) ? 'png' : 'jpg';
    if (!/png|jpe?g/i.test(f.type)) { // convert other formats to PNG
      const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      bytes = await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))).arrayBuffer(); kind = 'png';
    }
    setWmImg({ bytes, kind, url: URL.createObjectURL(f) }); changed();
  };

  const run = async () => {
    if (!file) return;
    if (mode === 'watermark' && wmType === 'text' && !wm.text.trim()) { setError('Please type the watermark text.'); return; }
    if (mode === 'watermark' && wmType === 'image' && !wmImg) { setError('Please choose a watermark image.'); return; }
    setError(''); setBusy({ done: 0, total: 0, label: 'Working…' });
    try {
      const buf = await file.arrayBuffer();
      const o = mode === 'numbers' ? num : mode === 'watermark' ? (wmType === 'image' ? { ...wm, image: { bytes: wmImg!.bytes.slice(0), kind: wmImg!.kind } } : wm)
        : mode === 'crop' ? crop : mode === 'metadata' ? meta : {};
      const kind = mode === 'metadata' ? 'meta-write' : mode;
      const r = await runPdfJob<{ files: Uint8Array[]; fields?: number }>({ op: 'edit', kind, file: buf, o }, [buf], setBusy);
      const note = mode === 'flatten' ? (r.fields ? `${r.fields} form field${r.fields > 1 ? 's' : ''} flattened.` : 'No fillable form fields were found — the PDF was saved unchanged.') : undefined;
      setResult({ blob: new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }), note });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {busy && <ProgressBar {...busy} />}
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const sel = (val: any, set: (v: string) => void, opts: [string, string][]) => (
    <select value={val} onChange={(e) => { set((e.target as HTMLSelectElement).value); changed(); }}>{opts.map(([v, l]) => <option value={v}>{l}</option>)}</select>
  );
  const n = (v: number, set: (v: number) => void, min = 0, max = 999) => (
    <input type="number" min={min} max={max} value={v} style={{ minWidth: '80px', width: '90px' }} onInput={(e) => { set(Math.max(min, Math.min(max, +(e.target as HTMLInputElement).value || 0))); changed(); }} />
  );
  // live preview positions (approximate)
  const posStyle: Record<string, any> = { bl: { left: '6%', bottom: '3%' }, bc: { left: '50%', bottom: '3%', transform: 'translateX(-50%)' }, br: { right: '6%', bottom: '3%' }, tl: { left: '6%', top: '3%' }, tc: { left: '50%', top: '3%', transform: 'translateX(-50%)' }, tr: { right: '6%', top: '3%' } };

  return (
    <div>
      <ul class="files"><li>
        <span class="fname" title={file.name}>{file.name}</span>
        <span class="meta">{pageCount} pages · {formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" onClick={() => { setFile(null); setResult(null); }}>✕</button>
      </li></ul>
      {sizeWarning(file.size) && <ErrorBox>{sizeWarning(file.size)}</ErrorBox>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
        {thumb && (
          <div style={{ position: 'relative', flex: 'none', margin: '0 auto', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', overflow: 'hidden', maxWidth: '100%' }}>
            <img src={thumb} alt="First page preview" style={{ display: 'block', maxWidth: '260px', width: '100%' }} />
            {mode === 'numbers' && <span style={{ position: 'absolute', fontSize: Math.max(8, num.size * 0.6) + 'px', color: num.color, fontWeight: num.bold ? 700 : 400, ...posStyle[num.pos] }}>
              {num.skipFirst ? '' : num.format === 'of' ? `${num.start} of ${pageCount}` : num.format === 'page' ? `Page ${num.start}` : num.start}</span>}
            {mode === 'watermark' && (wmType === 'text'
              ? <span style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(${-wm.angle}deg)`, color: wm.color, opacity: wm.opacity, fontWeight: 800, fontSize: wm.size * 0.45 + 'px', whiteSpace: 'nowrap', fontFamily: 'Helvetica, Arial, sans-serif' }}>{wm.text}</span>
              : wmImg && <img src={wmImg.url} alt="" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: wm.scale * 100 + '%', opacity: wm.opacity }} />)}
            {mode === 'crop' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* approximate: page assumed ~210 mm wide */}
              <div style={{ position: 'absolute', left: (crop.l / 2.1) + '%', right: (crop.r / 2.1) + '%', top: (crop.t / 2.97) + '%', bottom: (crop.b / 2.97) + '%', outline: '2px dashed var(--brand)', boxShadow: '0 0 0 999px rgb(0 0 0 / .35)' }} />
            </div>}
          </div>
        )}
        <div class="opts" style={{ flex: '1 1 260px', margin: 0 }}>
          {mode === 'numbers' && <>
            <label>Position{sel(num.pos, (v) => setNum({ ...num, pos: v }), [['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']])}</label>
            <label>Format{sel(num.format, (v) => setNum({ ...num, format: v }), [['n', '1, 2, 3'], ['page', 'Page 1'], ['of', '1 of 10']])}</label>
            <label>Start at{n(num.start, (v) => setNum({ ...num, start: v }), 0, 99999)}</label>
            <label>Font size{n(num.size, (v) => setNum({ ...num, size: v }), 6, 48)}</label>
            <label>Colour<input type="color" value={num.color} onInput={(e) => { setNum({ ...num, color: (e.target as HTMLInputElement).value }); changed(); }} /></label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={num.skipFirst} onChange={(e) => { setNum({ ...num, skipFirst: (e.target as HTMLInputElement).checked }); changed(); }} /> Skip first page (cover)</label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={num.bold} onChange={(e) => { setNum({ ...num, bold: (e.target as HTMLInputElement).checked }); changed(); }} /> Bold</label>
          </>}
          {mode === 'watermark' && <>
            <div class="seg" role="group" aria-label="Watermark type">
              <button type="button" aria-pressed={wmType === 'text'} onClick={() => { setWmType('text'); changed(); }}>Text</button>
              <button type="button" aria-pressed={wmType === 'image'} onClick={() => { setWmType('image'); changed(); }}>Image / logo</button>
            </div>
            {wmType === 'text' ? <>
              <label>Text<input type="text" value={wm.text} maxLength={80} onInput={(e) => { setWm({ ...wm, text: (e.target as HTMLInputElement).value }); changed(); }} /></label>
              <label>Font size{n(wm.size, (v) => setWm({ ...wm, size: v }), 8, 200)}</label>
              <label>Colour<input type="color" value={wm.color} onInput={(e) => { setWm({ ...wm, color: (e.target as HTMLInputElement).value }); changed(); }} /></label>
              <label>Angle{sel(String(wm.angle), (v) => setWm({ ...wm, angle: +v }), [['45', 'Diagonal 45°'], ['0', 'Horizontal'], ['-45', 'Diagonal −45°'], ['90', 'Vertical']])}</label>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={wm.tile} onChange={(e) => { setWm({ ...wm, tile: (e.target as HTMLInputElement).checked }); changed(); }} /> Repeat across page</label>
            </> : <>
              <DropZone compact accept="image/png,image/jpeg,image/webp" label={wmImg ? 'Change image' : 'Choose image'} onFiles={pickImg} />
              <label>Size: {Math.round(wm.scale * 100)}%<input type="range" min={10} max={100} step={5} value={wm.scale * 100} onInput={(e) => { setWm({ ...wm, scale: +(e.target as HTMLInputElement).value / 100 }); changed(); }} /></label>
            </>}
            <label>Opacity: {Math.round(wm.opacity * 100)}%<input type="range" min={5} max={100} step={5} value={wm.opacity * 100} onInput={(e) => { setWm({ ...wm, opacity: +(e.target as HTMLInputElement).value / 100 }); changed(); }} /></label>
          </>}
          {mode === 'crop' && <>
            <p class="status" style={{ width: '100%', textAlign: 'left', margin: 0 }}>Cut this much from each edge of every page (millimetres):</p>
            <label>Top{n(crop.t, (v) => setCrop({ ...crop, t: v }), 0, 500)}</label>
            <label>Bottom{n(crop.b, (v) => setCrop({ ...crop, b: v }), 0, 500)}</label>
            <label>Left{n(crop.l, (v) => setCrop({ ...crop, l: v }), 0, 500)}</label>
            <label>Right{n(crop.r, (v) => setCrop({ ...crop, r: v }), 0, 500)}</label>
          </>}
          {mode === 'flatten' && <p class="status" style={{ textAlign: 'left' }}>Flattening turns fillable form fields (text boxes, check boxes, drop-downs) into normal page content, so the answers can no longer be changed.</p>}
          {mode === 'metadata' && META_KEYS.map(([k, l]) => (
            <label style={{ flex: '1 1 240px' }}>{l}<input type="text" value={meta[k] ?? ''} style={{ width: '100%' }} onInput={(e) => { setMeta({ ...meta, [k]: (e.target as HTMLInputElement).value }); changed(); }} /></label>
          ))}
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          <p class="big">Done! Your PDF is ready ({formatBytes(result.blob.size)}).</p>
          {result.note && <p class="status">{result.note}</p>}
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result.blob, `${baseName(file.name)}-${LABEL[mode][1]}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New file</button>
          </div>
        </div>
      ) : (
        !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>{LABEL[mode][0]}</button></div>
      )}
    </div>
  );
}
