import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, zipFiles } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';

export type PlusMode = 'repair' | 'extract' | 'nup' | 'overlay' | 'pagesize' | 'grayscale' | 'blank' | 'markdown';
const MM = 72 / 25.4;
const SIZES: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], A5: [148, 210], Tabloid: [279.4, 431.8], B5: [176, 250] };
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Render one page of a PDF (bytes) to a data URL. */
async function renderPage(bytes: Uint8Array | ArrayBuffer, page = 1, maxPx = 520): Promise<{ url: string; w: number; h: number; pages: number } | null> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.slice()), isEvalSupported: false }).promise;
  try {
    if (page > doc.numPages) return null;
    const p = await doc.getPage(page); const v1 = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: (maxPx * Math.min(2, devicePixelRatio || 1)) / Math.max(v1.width, v1.height) });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return { url: c.toDataURL('image/png'), w: v1.width, h: v1.height, pages: doc.numPages };
  } finally { doc.loadingTask.destroy(); }
}

/** Run a worker job; a PDF locked only against editing is unlocked first and the job is tried again. */
async function job<T>(msg: any, onP?: (p: Progress) => void): Promise<T> {
  try { return await runPdfJob<T>({ ...msg, file: msg.file.slice(0) }, [], onP); }
  catch (e: any) {
    if (!/encrypt|password/i.test(String(e?.message))) throw e;
    const d = await runPdfJob<{ files: Uint8Array[] }>({ op: 'decrypt', file: msg.file.slice(0), password: '' }, [], undefined, 'qpdf');
    return runPdfJob<T>({ ...msg, file: d.files[0].slice().buffer }, [], onP);
  }
}

const SUFFIX: Record<PlusMode, string> = { repair: 'repaired', extract: 'images', nup: 'pages-per-sheet', overlay: 'overlay', pagesize: 'resized', grayscale: 'grayscale', blank: 'no-blank-pages', markdown: 'md' };

export default function PdfPlus({ mode }: { mode: PlusMode }) {
  const [file, setFile] = useState<File | null>(null);
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; note?: string } | null>(null);

  const pick = async (files: File[]) => {
    const f = files.find(isPdf);
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setResult(null); setFile(f); setBuf(await f.arrayBuffer());
  };
  const reset = () => { setFile(null); setBuf(null); setResult(null); setError(''); };
  const out = (bytes: Uint8Array | Blob, note?: string, ext = 'pdf', type = 'application/pdf') => setResult({ blob: bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type }), name: `${baseName(file!.name)}-${SUFFIX[mode]}.${ext}`, note });

  if (!file || !buf) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const common = { file, buf, setBusy, setError, out, busy };
  return (
    <div class="plus">
      <p class="status"><b>{file.name}</b> · {formatBytes(file.size)}</p>
      {sizeWarning(file.size) && <ErrorBox>{sizeWarning(file.size)}</ErrorBox>}
      {mode === 'repair' && <Repair {...common} />}
      {mode === 'nup' && <Nup {...common} />}
      {mode === 'overlay' && <Overlay {...common} />}
      {mode === 'pagesize' && <PageSize {...common} />}
      {mode === 'grayscale' && <Grayscale {...common} />}
      {mode === 'blank' && <Blank {...common} />}
      {mode === 'extract' && <Extract {...common} />}
      {mode === 'markdown' && <Markdown {...common} />}
      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {result && (
        <div class="done">
          <p class="big">Done! {result.note ?? ''} ({formatBytes(result.blob.size)})</p>
          <div class="actions"><button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result.blob, result.name)}>Download {/\.md$/.test(result.name) ? 'Markdown' : /\.zip$/.test(result.name) ? 'ZIP' : 'PDF'}</button></div>
        </div>
      )}
      <div class="actions"><button type="button" class="btn btn-ghost" disabled={!!busy} onClick={reset}>Start over</button></div>
    </div>
  );
}

type Common = { file: File; buf: ArrayBuffer; setBusy: (p: Progress | null) => void; setError: (s: string) => void; out: (b: Uint8Array | Blob, note?: string, ext?: string, type?: string) => void; busy: Progress | null };

/** Live preview: re-run the job on the first pages a moment after the options change. */
function usePreview(make: () => Promise<Uint8Array | null>, deps: any[], page = 1) {
  const [img, setImg] = useState<{ url: string; w: number; h: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const ticket = useRef(0);
  useEffect(() => {
    const t = ++ticket.current; setLoading(true);
    const h = setTimeout(async () => {
      try { const b = await make(); if (t !== ticket.current) return; setImg(b ? await renderPage(b, page) : null); }
      catch { if (t === ticket.current) setImg(null); }
      finally { if (t === ticket.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(h);
  }, deps);
  return { img, loading };
}
function Preview({ img, loading, caption }: { img: { url: string; w: number; h: number } | null; loading: boolean; caption?: string }) {
  return (
    <figure class="plus-prev">
      <div class="pp-box">{img ? <img src={img.url} alt="Preview of the result" style={{ aspectRatio: `${img.w} / ${img.h}` }} /> : <span class="shim" style={{ width: '60%', height: '60%' }} />}{loading && img && <span class="spin pp-spin" />}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
const Seg = <T extends string | number>({ value, set, items, label }: { value: T; set: (v: T) => void; items: [T, string][]; label: string }) => (
  <div class="seg" role="group" aria-label={label}>{items.map(([v, l]) => <button type="button" aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}</div>
);

// ---------- Repair ----------
function Repair({ buf, setBusy, setError, out, busy }: Common) {
  const [report, setReport] = useState<{ ok: boolean; method: string; pages: number; fixed: string[]; before: string } | null>(null);
  const run = async () => {
    setError(''); setReport(null);
    // 1. how bad is it? pdf.js is very tolerant and tells us how many pages exist
    setBusy({ done: 0, total: 3, label: 'Checking the file…' });
    const pdfjs = await loadPdfjs();
    let expect = 0, before = '';
    try { const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, stopAtErrors: false }).promise; expect = d.numPages; before = `opens with ${d.numPages} page${d.numPages > 1 ? 's' : ''}`; d.loadingTask.destroy(); }
    catch (e: any) { before = /password/i.test(String(e?.name)) ? 'is password protected' : 'cannot be opened'; if (/password/i.test(String(e?.name))) { setBusy(null); setError('This PDF needs a password to open. Unlock it first with Unlock PDF, then repair it.'); return; } }
    const check = async (b: Uint8Array) => { try { const d = await pdfjs.getDocument({ data: b.slice(), isEvalSupported: false }).promise; let ok = 0; for (let i = 1; i <= d.numPages; i++) { try { await (await d.getPage(i)).getOperatorList(); ok++; } catch { /* broken page */ } } const n = d.numPages; d.loadingTask.destroy(); return { n, ok }; } catch { return { n: 0, ok: 0 }; } };
    const tidy = (log: string) => [...new Set(log.split('\n').map((l) => l.replace(/^.*?\/in\.pdf[^:]*:\s*/, '').replace(/^WARNING:\s*/i, '').trim()).filter((l) => l && !/operation succeeded|qpdf:/i.test(l)))].slice(0, 12).map((l) =>
      /xref|cross-reference|expected n n obj|startxref/i.test(l) ? 'Rebuilt the damaged page index (cross-reference table)' : /stream.*length|Length/i.test(l) ? 'Fixed wrong data lengths' : /object .* not found|unknown object|invalid object|dangling/i.test(l) ? 'Removed references to missing parts' : /trailer/i.test(l) ? 'Rebuilt the missing file trailer' : /EOF|end of file|truncated/i.test(l) ? 'Recovered a cut-off (truncated) file' : /decod|flate|zlib/i.test(l) ? 'Skipped data that could not be decoded' : l.slice(0, 120));
    // 2. qpdf: rebuilds the structure and keeps everything (text, links, forms)
    setBusy({ done: 1, total: 3, label: 'Repairing (method 1 of 3)…' });
    try {
      const r = await runPdfJob<{ files: Uint8Array[]; log: string }>({ op: 'repair', file: buf.slice(0) }, [], undefined, 'qpdf');
      const c = await check(r.files[0]);
      if (c.n && c.ok >= Math.max(1, expect) * 0.999) { const fixed = [...new Set(tidy(r.log || ''))]; if (fixed.some((f) => /cut-off/.test(f))) fixed.push('Parts that were missing from the end of the file cannot be brought back, so some pictures or text may be empty'); setReport({ ok: true, method: 'Full repair (text, links and forms kept)', pages: c.n, fixed, before }); out(r.files[0], fixed.length ? 'PDF repaired.' : 'No errors found; the PDF was rebuilt cleanly.'); setBusy(null); return; }
    } catch { /* try the next method */ }
    // 3. pdf-lib: reads object by object and skips what is broken
    setBusy({ done: 2, total: 3, label: 'Repairing (method 2 of 3)…' });
    try {
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'plus', kind: 'repair', file: buf.slice(0), o: {} }, []);
      const c = await check(r.files[0]);
      if (c.n && c.ok >= Math.max(1, expect) * 0.999) { setReport({ ok: true, method: 'Structure rebuilt object by object', pages: c.n, fixed: ['Rebuilt the file structure', 'Skipped damaged objects'], before }); out(r.files[0], 'PDF repaired.'); setBusy(null); return; }
    } catch { /* last method */ }
    // 4. last resort: draw every readable page again as an image
    if (!expect) { setBusy(null); setError('Sorry, no pages could be recovered from this file. It may not be a PDF, or too much of it is missing.'); return; }
    try {
      const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, stopAtErrors: false }).promise;
      const { PDFDocument } = await import('pdf-lib'); const outDoc = await PDFDocument.create(); let ok = 0;
      for (let i = 1; i <= d.numPages; i++) {
        setBusy({ done: i - 1, total: d.numPages, label: `Rebuilding page ${i} of ${d.numPages} (method 3 of 3)…` });
        try {
          const p = await d.getPage(i); const v1 = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: 200 / 72 });
          const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          await p.render({ canvas: c, canvasContext: x, viewport: vp }).promise;
          const jpg = await outDoc.embedJpg(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))).arrayBuffer());
          outDoc.addPage([v1.width, v1.height]).drawImage(jpg, { x: 0, y: 0, width: v1.width, height: v1.height }); ok++;
        } catch { /* page could not be drawn */ }
      }
      d.loadingTask.destroy();
      if (!ok) throw new Error('none');
      setReport({ ok: true, method: 'Pages rebuilt as images (text can no longer be selected)', pages: ok, fixed: [`Recovered ${ok} of ${expect} pages`], before });
      out(await outDoc.save(), 'Pages recovered.');
    } catch { setError("Sorry, no pages could be recovered from this file."); }
    setBusy(null);
  };
  useEffect(() => { run(); }, []);
  return report ? (
    <div class="opts plus-report" data-title="Repair report">
      <p>Before: the file {report.before}. After: <b>{report.pages} page{report.pages > 1 ? 's' : ''}</b> recovered.</p>
      <p>Method: <b>{report.method}</b></p>
      {report.fixed.length > 0 && <ul>{report.fixed.map((f) => <li>✓ {f}</li>)}</ul>}
    </div>
  ) : !busy ? <button type="button" class="btn btn-primary btn-lg" onClick={run}>Repair PDF</button> : null;
}

// ---------- Pages per sheet ----------
function Nup({ buf, setBusy, setError, out, busy }: Common) {
  const [o, setO] = useState({ n: 4, paper: 'A4', orient: 'auto' as 'auto' | 'portrait' | 'landscape', order: 'h' as 'h' | 'v', margin: 8, gap: 5, border: true, booklet: false });
  const opts = () => ({ n: o.booklet ? 2 : o.n, sheet: o.paper === 'same' ? 'auto' : [SIZES[o.paper][0] * MM, SIZES[o.paper][1] * MM], orient: o.booklet ? 'landscape' : o.orient, order: o.order, margin: o.margin * MM, gap: o.gap * MM, border: o.border, booklet: o.booklet });
  const prev = usePreview(async () => (await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'nup', file: buf, o: { ...opts(), preview: true } })).files[0], [JSON.stringify(o)]);
  const run = async () => { setError(''); setBusy({ done: 0, total: 0, label: 'Arranging pages…' }); try { const r = await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'nup', file: buf, o: opts() }, setBusy); out(r.files[0], o.booklet ? 'Booklet ready: print on both sides (flip on the short edge), then fold.' : `${o.n} pages on each sheet.`); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); } };
  const set = (p: Partial<typeof o>) => setO({ ...o, ...p });
  return (
    <div class="plus-grid">
      <div>
        <div class="opts" data-title="Layout">
          <label class="full">Pages per sheet</label>
          <div class="pchoice nup-choice">
            {[2, 4, 6, 8, 9, 16].map((n) => <button type="button" aria-pressed={!o.booklet && o.n === n} onClick={() => set({ n, booklet: false })}><NupIcon n={n} />{n}</button>)}
            <button type="button" aria-pressed={o.booklet} onClick={() => set({ booklet: true })}><NupIcon n={0} />Booklet</button>
          </div>
          <label>Paper<select value={o.paper} onChange={(e) => set({ paper: (e.target as HTMLSelectElement).value })}>{['A4', 'Letter', 'A3', 'Legal', 'A5'].map((s) => <option>{s}</option>)}<option value="same">Same as pages</option></select></label>
          {!o.booklet && <label>Orientation<select value={o.orient} onChange={(e) => set({ orient: (e.target as HTMLSelectElement).value as any })}><option value="auto">Best fit</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>}
          {!o.booklet && <label>Order<select value={o.order} onChange={(e) => set({ order: (e.target as HTMLSelectElement).value as any })}><option value="h">Across, then down</option><option value="v">Down, then across</option></select></label>}
          <label>Margin <b>{o.margin} mm</b><input type="range" min={0} max={25} value={o.margin} onInput={(e) => set({ margin: +(e.target as HTMLInputElement).value })} /></label>
          <label>Space between <b>{o.gap} mm</b><input type="range" min={0} max={20} value={o.gap} onInput={(e) => set({ gap: +(e.target as HTMLInputElement).value })} /></label>
          <label class="chk"><input type="checkbox" checked={o.border} onChange={(e) => set({ border: (e.target as HTMLInputElement).checked })} /> Thin border around each page</label>
          {o.booklet && <p class="hint">Pages are reordered so that, printed on both sides and folded in half, they read 1, 2, 3… like a book.</p>}
        </div>
        <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={run}>{o.booklet ? 'Make booklet' : 'Create PDF'}</button></div>
      </div>
      <Preview {...prev} caption="First sheet" />
    </div>
  );
}
function NupIcon({ n }: { n: number }) {
  const [c, r] = n === 0 ? [2, 1] : n === 2 ? [1, 2] : n === 4 ? [2, 2] : n === 6 ? [2, 3] : n === 8 ? [2, 4] : n === 9 ? [3, 3] : [4, 4];
  return <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">{Array.from({ length: c * r }, (_, i) => <rect x={1 + (i % c) * (20 / c)} y={1 + Math.floor(i / c) * (26 / r)} width={20 / c - 1.5} height={26 / r - 1.5} rx="1" fill="currentColor" opacity=".55" />)}{n === 0 && <line x1="11" y1="0" x2="11" y2="28" stroke="currentColor" stroke-dasharray="2 2" />}</svg>;
}

// ---------- Overlay ----------
function Overlay({ buf, setBusy, setError, out, busy }: Common) {
  const [ov, setOv] = useState<{ name: string; bytes: ArrayBuffer; kind: 'pdf' | 'png' | 'jpg'; thumb: string } | null>(null);
  const [o, setO] = useState({ where: 'behind' as 'behind' | 'front', pages: 'all' as 'all' | 'first' | 'firstdiff' | 'match', fit: 'stretch' as 'stretch' | 'fit' | 'none', opacity: 1 });
  const [ovPages, setOvPages] = useState(1);
  const pickOv = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    let bytes = await f.arrayBuffer(); let kind: 'pdf' | 'png' | 'jpg';
    if (isPdf(f)) kind = 'pdf';
    else if (/png/i.test(f.type)) kind = 'png';
    else if (/jpe?g/i.test(f.type)) kind = 'jpg';
    else { const b = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; c.getContext('2d')!.drawImage(b, 0, 0); bytes = await (await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'))).arrayBuffer(); kind = 'png'; }
    const thumb = kind === 'pdf' ? (await renderPage(bytes, 1, 200))?.url ?? '' : URL.createObjectURL(new Blob([bytes]));
    if (kind === 'pdf') { const r = await renderPage(bytes, 1, 40); setOvPages(r?.pages ?? 1); if ((r?.pages ?? 1) > 1) setO((x) => ({ ...x, pages: 'firstdiff' })); } else setOvPages(1);
    setOv({ name: f.name, bytes, kind, thumb });
  };
  const msg = () => ({ op: 'plus', kind: 'overlay', file: buf, ov: ov!.bytes.slice(0), ovKind: ov!.kind });
  const prev1 = usePreview(async () => (ov ? (await job<{ files: Uint8Array[] }>({ ...msg(), o: { ...o, preview: true } })).files[0] : null), [ov, JSON.stringify(o)], 1);
  const prev2 = usePreview(async () => (ov ? (await job<{ files: Uint8Array[] }>({ ...msg(), o: { ...o, preview: true } })).files[0] : null), [ov, JSON.stringify(o)], 2);
  const run = async () => { setError(''); setBusy({ done: 0, total: 0, label: 'Adding overlay…' }); try { const r = await job<{ files: Uint8Array[] }>({ ...msg(), o }, setBusy); out(r.files[0], o.where === 'behind' ? 'Letterhead added.' : 'Overlay added.'); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); } };
  const set = (p: Partial<typeof o>) => setO({ ...o, ...p });
  if (!ov) return <DropZone accept="application/pdf,.pdf,image/*" label="Choose letterhead or overlay" hint="A PDF (e.g. company letterhead) or an image (PNG, JPG)" onFiles={pickOv} />;
  return (
    <div class="plus-grid">
      <div>
        <div class="opts" data-title="Overlay">
          <div class="ov-file full"><img src={ov.thumb} alt="" /><span><b>{ov.name}</b><br />{ov.kind === 'pdf' ? `${ovPages} page${ovPages > 1 ? 's' : ''}` : 'Image'}</span><button type="button" class="mini" onClick={() => setOv(null)} aria-label="Choose another overlay">✕</button></div>
          <label class="full">Place it</label>
          <Seg label="Place it" value={o.where} set={(v) => set({ where: v, opacity: v === 'behind' ? 1 : Math.min(o.opacity, 0.5) })} items={[['behind', 'Behind content (letterhead)'], ['front', 'On top (stamp, watermark)']]} />
          <label>Pages<select value={o.pages} onChange={(e) => set({ pages: (e.target as HTMLSelectElement).value as any })}>
            <option value="all">All pages</option><option value="first">First page only</option>
            {ovPages > 1 && <option value="firstdiff">Page 1 on first page, page 2 on the rest</option>}
            {ovPages > 1 && <option value="match">Page by page</option>}
          </select></label>
          <label>Size<select value={o.fit} onChange={(e) => set({ fit: (e.target as HTMLSelectElement).value as any })}><option value="stretch">Fill the page</option><option value="fit">Fit (keep proportions)</option><option value="none">Original size, centred</option></select></label>
          <label class="full">Opacity <b>{Math.round(o.opacity * 100)}%</b><input type="range" min={5} max={100} step={5} value={Math.round(o.opacity * 100)} onInput={(e) => set({ opacity: +(e.target as HTMLInputElement).value / 100 })} /></label>
          {o.where === 'behind' && <p class="hint">Text and pictures of your PDF stay fully readable on top of the letterhead.</p>}
        </div>
        <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={run}>Add overlay</button></div>
      </div>
      <div class="pp-two"><Preview {...prev1} caption="Page 1" />{prev2.img && <Preview {...prev2} caption="Page 2" />}</div>
    </div>
  );
}

// ---------- Page size ----------
function PageSize({ buf, setBusy, setError, out, busy }: Common) {
  const [o, setO] = useState({ size: 'A4', w: 210, h: 297, orient: 'auto' as 'auto' | 'portrait' | 'landscape', scale: 'fit' as 'fit' | 'none', margin: 0 });
  const [now, setNow] = useState('');
  useEffect(() => { (async () => {
    const pdfjs = await loadPdfjs(); const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    const count = new Map<string, number>();
    for (let i = 1; i <= Math.min(d.numPages, 200); i++) { const v = (await d.getPage(i)).getViewport({ scale: 1 }); const [a, b] = [v.width / MM, v.height / MM].sort((x, y) => x - y); const nm = Object.entries(SIZES).find(([, [sw, sh]]) => Math.abs(sw - a) < 3 && Math.abs(sh - b) < 3)?.[0] ?? `${Math.round(v.width / MM)} × ${Math.round(v.height / MM)} mm`; count.set(nm, (count.get(nm) ?? 0) + 1); }
    setNow([...count].map(([k, v]) => `${v} × ${k}`).join(', ')); d.loadingTask.destroy();
  })().catch(() => {}); }, []);
  const dims = (): [number, number] => (o.size === 'custom' ? [o.w * MM, o.h * MM] : [SIZES[o.size][0] * MM, SIZES[o.size][1] * MM]);
  const opts = () => ({ size: dims(), orient: o.orient, scale: o.scale, margin: o.margin * MM });
  const prev = usePreview(async () => (await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'pagesize', file: buf, o: { ...opts(), preview: true } })).files[0], [JSON.stringify(o)]);
  const run = async () => { setError(''); setBusy({ done: 0, total: 0, label: 'Changing page size…' }); try { const r = await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'pagesize', file: buf, o: opts() }, setBusy); out(r.files[0], `All pages are now ${o.size === 'custom' ? `${o.w} × ${o.h} mm` : o.size}.`); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); } };
  const set = (p: Partial<typeof o>) => setO({ ...o, ...p });
  return (
    <div class="plus-grid">
      <div>
        <div class="opts" data-title="Page size">
          {now && <p class="hint full">Your pages now: {now}</p>}
          <label class="full">New size</label>
          <div class="pchoice">{['A4', 'Letter', 'Legal', 'A3', 'A5', 'custom'].map((s) => <button type="button" aria-pressed={o.size === s} onClick={() => set({ size: s })}>{s === 'custom' ? 'Custom' : s}<small>{s === 'custom' ? 'any size' : `${SIZES[s][0]} × ${SIZES[s][1]} mm`}</small></button>)}</div>
          {o.size === 'custom' && <><label>Width (mm)<input type="number" min={20} max={2000} value={o.w} onInput={(e) => set({ w: +(e.target as HTMLInputElement).value || 210 })} /></label><label>Height (mm)<input type="number" min={20} max={2000} value={o.h} onInput={(e) => set({ h: +(e.target as HTMLInputElement).value || 297 })} /></label></>}
          <label>Orientation<select value={o.orient} onChange={(e) => set({ orient: (e.target as HTMLSelectElement).value as any })}><option value="auto">Same as each page</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label>Content<select value={o.scale} onChange={(e) => set({ scale: (e.target as HTMLSelectElement).value as any })}><option value="fit">Scale to fit the new size</option><option value="none">Keep original size (centred)</option></select></label>
          <label class="full">Margin <b>{o.margin} mm</b><input type="range" min={0} max={30} value={o.margin} onInput={(e) => set({ margin: +(e.target as HTMLInputElement).value })} /></label>
          <p class="hint full">Text stays sharp and links, comments and form fields keep working.</p>
        </div>
        <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={run}>Change page size</button></div>
      </div>
      <Preview {...prev} caption={`Page 1 · ${o.size === 'custom' ? `${o.w} × ${o.h} mm` : o.size}`} />
    </div>
  );
}

// ---------- Grayscale ----------
function Grayscale({ buf, setBusy, setError, out, busy, file }: Common) {
  const [black, setBlack] = useState(false);
  const orig = usePreview(async () => new Uint8Array(buf.slice(0)), []);
  const prev = usePreview(async () => (await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'grayscale', file: buf, o: { black, preview: true } })).files[0], [black]);
  const run = async () => { setError(''); setBusy({ done: 0, total: 0, label: 'Converting to grayscale…' }); try { const r = await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'grayscale', file: buf, o: { black } }, setBusy); out(r.files[0], `Converted to grayscale (${formatBytes(file.size)} before).`); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); } };
  return (
    <>
      <div class="opts" data-title="Options">
        <label class="chk full"><input type="checkbox" checked={black} onChange={(e) => setBlack((e.target as HTMLInputElement).checked)} /> Make dark text pure black (sharper print, saves toner)</label>
        <p class="hint full">Text and drawings stay sharp and searchable: only the colours change. Photos become gray pictures.</p>
      </div>
      <div class="pp-two"><Preview {...orig} caption="Before" /><Preview {...prev} caption="After" /></div>
      <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={run}>Convert to grayscale</button></div>
    </>
  );
}

// ---------- Delete blank pages ----------
type PageScore = { url: string; ink: number; inkNoEdges: number; w: number; h: number };
function Blank({ buf, setBusy, setError, out, busy }: Common) {
  const [scores, setScores] = useState<PageScore[]>([]);
  const [level, setLevel] = useState(1);
  const [edges, setEdges] = useState(true);
  const [manual, setManual] = useState<Record<number, boolean>>({});
  const LEVELS: [string, number][] = [['Strict', 0.0004], ['Normal', 0.002], ['Loose', 0.008]];
  useEffect(() => { (async () => {
    setBusy({ done: 0, total: 0, label: 'Looking at every page…' });
    try {
      const pdfjs = await loadPdfjs(); const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
      const list: PageScore[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        setBusy({ done: i - 1, total: d.numPages, label: `Checking page ${i} of ${d.numPages}` });
        const p = await d.getPage(i); const v1 = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: 260 / Math.max(v1.width, v1.height) });
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const x = c.getContext('2d', { willReadFrequently: true })!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        await p.render({ canvas: c, canvasContext: x, viewport: vp }).promise;
        list.push({ url: c.toDataURL('image/jpeg', 0.7), ...inkScore(x, c.width, c.height), w: v1.width, h: v1.height });
        p.cleanup();
      }
      d.loadingTask.destroy(); setScores(list);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  })(); }, []);
  const thr = LEVELS[level][1];
  const blank = scores.map((s, i) => manual[i] ?? (edges ? s.inkNoEdges : s.ink) < thr);
  const n = blank.filter(Boolean).length;
  const run = async () => {
    if (!n) return; if (n === scores.length) { setError('All pages would be removed. Keep at least one page.'); return; }
    setBusy({ done: 0, total: 0, label: 'Removing pages…' });
    try { const r = await job<{ files: Uint8Array[] }>({ op: 'plus', kind: 'remove', file: buf, o: { pages: blank.map((b, i) => (b ? i : -1)).filter((i) => i >= 0) } }); out(r.files[0], `${n} blank page${n > 1 ? 's' : ''} removed, ${scores.length - n} kept.`); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  if (!scores.length) return null;
  return (
    <>
      <div class="opts" data-title="Find blank pages">
        <label>How strict<Seg label="How strict" value={level} set={(v) => { setLevel(v); setManual({}); }} items={LEVELS.map(([l], i) => [i, l])} /></label>
        <label class="chk"><input type="checkbox" checked={edges} onChange={(e) => { setEdges((e.target as HTMLInputElement).checked); setManual({}); }} /> Ignore page numbers, headers and footers</label>
        <p class="hint full"><b>{n}</b> of {scores.length} pages look blank (marked red). Click any page to change it.</p>
      </div>
      <div class="blank-grid">{scores.map((s, i) => (
        <button type="button" class={blank[i] ? 'del' : ''} aria-pressed={blank[i]} aria-label={`Page ${i + 1}: ${blank[i] ? 'will be removed' : 'kept'}`} onClick={() => setManual({ ...manual, [i]: !blank[i] })}>
          <img src={s.url} alt="" style={{ aspectRatio: `${s.w} / ${s.h}` }} /><span>{i + 1}{blank[i] ? ' · Blank' : ''}</span>
        </button>
      ))}</div>
      <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy || !n} onClick={run}>{n ? `Delete ${n} blank page${n > 1 ? 's' : ''}` : 'No blank pages found'}</button></div>
    </>
  );
}
/** Share of the page that has ink, ignoring the paper colour and scanner specks. */
function inkScore(x: CanvasRenderingContext2D, w: number, h: number) {
  const d = x.getImageData(0, 0, w, h).data;
  // paper colour: the brightest common colour along the edges
  const lum = (i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  const edge: number[] = []; for (let i = 0; i < w; i += 3) { edge.push(lum((2 * w + i) * 4), lum(((h - 3) * w + i) * 4)); } for (let j = 0; j < h; j += 3) { edge.push(lum((j * w + 2) * 4), lum((j * w + w - 3) * 4)); }
  edge.sort((a, b) => a - b); const paper = edge[Math.floor(edge.length * 0.6)];
  // count dark blocks of 3x3 pixels (single specks of dust don't count)
  let ink = 0, inner = 0; const B = 3; const y0 = h * 0.09, y1 = h * 0.91;
  for (let by = 0; by + B <= h; by += B) for (let bx = 0; bx + B <= w; bx += B) {
    let dark = 0; for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) if (paper - lum(((by + yy) * w + bx + xx) * 4) > 45) dark++;
    if (dark >= 3) { ink++; if (by > y0 && by < y1) inner++; }
  }
  const blocks = Math.floor(w / B) * Math.floor(h / B);
  return { ink: ink / blocks, inkNoEdges: inner / blocks };
}

// ---------- Extract images ----------
type Img = { ref: string; bytes: Uint8Array; mime: string; w: number; h: number; pages: number[]; kind: string; url?: string };
function Extract({ buf, setBusy, setError, busy, file }: Common) {
  const [imgs, setImgs] = useState<Img[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [small, setSmall] = useState(true);
  const [fmt, setFmt] = useState<'orig' | 'png' | 'jpg'>('orig');
  const [skipped, setSkipped] = useState(0);
  const load = async (skipSmall: boolean) => {
    setError(''); setBusy({ done: 0, total: 0, label: 'Finding pictures…' });
    try {
      const r = await job<{ images: Img[]; skipped: any[] }>({ op: 'plus', kind: 'extract', file: buf, o: { minSize: skipSmall ? 48 : 0 } }, setBusy);
      let list = r.images;
      // pictures in formats the worker can't decode (JPEG 2000, JBIG2, fax): let pdf.js draw them
      if (r.skipped.length) list = list.concat(await viaPdfjs(buf, r.skipped));
      setSkipped(Math.max(0, r.skipped.length - (list.length - r.images.length)));
      list.forEach((i) => (i.url = URL.createObjectURL(new Blob([i.bytes as BlobPart], { type: i.mime }))));
      list.sort((a, b) => (a.pages[0] ?? 999) - (b.pages[0] ?? 999));
      setImgs(list); setSel(new Set(list.map((i) => i.ref)));
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  useEffect(() => { load(small); }, [small]);
  const convert = async (i: Img): Promise<{ blob: Blob; ext: string }> => {
    const ext0 = i.mime === 'image/jpeg' ? 'jpg' : 'png';
    if (fmt === 'orig' || fmt === ext0) return { blob: new Blob([i.bytes as BlobPart], { type: i.mime }), ext: ext0 };
    const b = await createImageBitmap(new Blob([i.bytes as BlobPart], { type: i.mime })); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const x = c.getContext('2d')!;
    if (fmt === 'jpg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(b, 0, 0); b.close();
    return { blob: await new Promise<Blob>((r) => c.toBlob((z) => r(z!), fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.95)), ext: fmt };
  };
  const nameOf = (i: Img, k: number, ext: string) => `${baseName(file.name)}-p${i.pages[0] ?? 0}-${k + 1}.${ext}`;
  const dlAll = async () => {
    const chosen = imgs!.filter((i) => sel.has(i.ref)); if (!chosen.length) return;
    setBusy({ done: 0, total: chosen.length, label: 'Preparing ZIP…' });
    try { const files = []; for (let k = 0; k < chosen.length; k++) { const { blob, ext } = await convert(chosen[k]); files.push({ name: nameOf(chosen[k], k, ext), blob }); } downloadBlob(await zipFiles(files), `${baseName(file.name)}-images.zip`); }
    finally { setBusy(null); }
  };
  if (!imgs) return null;
  if (!imgs.length) return <p class="status">No pictures were found in this PDF.{small ? <> <button type="button" class="linkbtn" onClick={() => setSmall(false)}>Include small pictures and icons</button></> : null}</p>;
  const total = imgs.filter((i) => sel.has(i.ref)).reduce((a, i) => a + i.bytes.length, 0);
  return (
    <>
      <div class="opts" data-title="Pictures">
        <p class="full"><b>{imgs.length}</b> picture{imgs.length > 1 ? 's' : ''} found{skipped ? ` (${skipped} could not be read)` : ''}. JPEG photos are saved exactly as they are stored in the PDF.</p>
        <label>Save as<select value={fmt} onChange={(e) => setFmt((e.target as HTMLSelectElement).value as any)}><option value="orig">Original format (best)</option><option value="png">PNG</option><option value="jpg">JPG</option></select></label>
        <label class="chk"><input type="checkbox" checked={small} onChange={(e) => setSmall((e.target as HTMLInputElement).checked)} /> Skip small pictures and icons</label>
        <span class="full"><button type="button" class="linkbtn" onClick={() => setSel(new Set(imgs.map((i) => i.ref)))}>Select all</button> · <button type="button" class="linkbtn" onClick={() => setSel(new Set())}>Select none</button></span>
      </div>
      <div class="img-grid">{imgs.map((i, k) => (
        <div class={`img-card ${sel.has(i.ref) ? 'on' : ''}`}>
          <label><input type="checkbox" checked={sel.has(i.ref)} onChange={() => { const s = new Set(sel); s.has(i.ref) ? s.delete(i.ref) : s.add(i.ref); setSel(s); }} aria-label={`Select picture ${k + 1}`} />
            <span class="ic-img"><img src={i.url} alt={`Picture ${k + 1}`} loading="lazy" /></span></label>
          <div class="ic-meta"><b>{i.w} × {i.h}</b> · {formatBytes(i.bytes.length)}<br /><small>{i.kind}{i.pages.length ? ` · page ${i.pages.slice(0, 4).join(', ')}${i.pages.length > 4 ? '…' : ''}` : ''}</small></div>
          <button type="button" class="dl-file" aria-label={`Download picture ${k + 1}`} onClick={async () => { const { blob, ext } = await convert(i); downloadBlob(blob, nameOf(i, k, ext)); }} />
        </div>
      ))}</div>
      <div class="actions"><button type="button" class="btn btn-primary dl btn-lg" disabled={!!busy || !sel.size} onClick={dlAll}>Download {sel.size} picture{sel.size === 1 ? '' : 's'} (ZIP · {formatBytes(total)})</button></div>
    </>
  );
}
/** Decode pictures through pdf.js (it understands every image format) and match them by page and size. */
async function viaPdfjs(buf: ArrayBuffer, skipped: { ref: string; w: number; h: number; pages: number[] }[]): Promise<Img[]> {
  const pdfjs = await loadPdfjs(); const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
  const out: Img[] = []; const want = [...skipped];
  try {
    const pages = [...new Set(want.flatMap((s) => s.pages))].sort((a, b) => a - b);
    for (const pn of pages) {
      const p = await d.getPage(pn); const ol = await p.getOperatorList();
      for (let i = 0; i < ol.fnArray.length; i++) {
        const isMask = ol.fnArray[i] === pdfjs.OPS.paintImageMaskXObject;
        if (ol.fnArray[i] !== pdfjs.OPS.paintImageXObject && !isMask) continue;
        const a0 = ol.argsArray[i][0];
        const oid = isMask ? a0?.data : a0; const obj: any = typeof oid === 'string' ? await new Promise((r) => { try { p.objs.get(oid, r); } catch { r(null); } }) : null;
        if (!obj) continue;
        const k = want.findIndex((s) => s.pages.includes(pn) && s.w === obj.width && s.h === obj.height); if (k < 0) continue;
        const c = document.createElement('canvas'); c.width = obj.width; c.height = obj.height; const x = c.getContext('2d')!;
        if (isMask && obj.data && !obj.bitmap) {
          // stencil mask (1 bit per pixel, often a scanned logo or signature): ink is black, the rest transparent
          const id2 = x.createImageData(obj.width, obj.height); const row = (obj.width + 7) >> 3; const inv = false; // bit 0 paints, as in the PDF
          for (let yy = 0; yy < obj.height; yy++) for (let xx = 0; xx < obj.width; xx++) { const bit = (obj.data[yy * row + (xx >> 3)] >> (7 - (xx & 7))) & 1; if (bit === (inv ? 1 : 0)) id2.data[(yy * obj.width + xx) * 4 + 3] = 255; }
          x.putImageData(id2, 0, 0);
        } else if (obj.bitmap) x.drawImage(obj.bitmap, 0, 0);
        else if (obj.data) { const id2 = x.createImageData(obj.width, obj.height); const src = obj.data; if (src.length === obj.width * obj.height * 4) id2.data.set(src); else for (let q = 0, s = 0; q < id2.data.length; q += 4, s += 3) { id2.data[q] = src[s]; id2.data[q + 1] = src[s + 1]; id2.data[q + 2] = src[s + 2]; id2.data[q + 3] = 255; } x.putImageData(id2, 0, 0); }
        else continue;
        const blob = await new Promise<Blob>((r) => c.toBlob((z) => r(z!), 'image/png'));
        out.push({ ref: want[k].ref, bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', w: obj.width, h: obj.height, pages: want[k].pages, kind: 'PNG (converted)' });
        want.splice(k, 1);
      }
      p.cleanup();
    }
  } finally { d.loadingTask.destroy(); }
  return out;
}

// ---------- Markdown ----------
function Markdown({ buf, setBusy, setError, out, busy }: Common) {
  const [md, setMd] = useState('');
  const [o, setO] = useState({ tables: true, headers: true, pageBreaks: false });
  const [view, setView] = useState<'preview' | 'md'>('preview');
  const [copied, setCopied] = useState(false);
  useEffect(() => { (async () => {
    setError(''); setBusy({ done: 0, total: 0, label: 'Reading the PDF…' });
    try {
      const pdfjs = await loadPdfjs(); const d = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, fontExtraProperties: true }).promise;
      const { pdfToMarkdown } = await import('../../lib/pdfmd');
      const text = await pdfToMarkdown(d, pdfjs, o, (a, t) => setBusy({ done: a, total: t, label: `Reading page ${Math.min(a + 1, t)} of ${t}` }));
      d.loadingTask.destroy();
      if (!text.trim()) throw new Error('No text was found in this PDF. Scanned PDFs (pictures of pages) need text recognition (OCR), which is coming soon.');
      setMd(text); out(new Blob([text], { type: 'text/markdown' }), 'Markdown ready.', 'md', 'text/markdown');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  })(); }, [JSON.stringify(o)]);
  if (!md) return null;
  return (
    <>
      <div class="opts" data-title="Options">
        <label class="chk"><input type="checkbox" checked={o.tables} onChange={(e) => setO({ ...o, tables: (e.target as HTMLInputElement).checked })} /> Convert tables</label>
        <label class="chk"><input type="checkbox" checked={o.headers} onChange={(e) => setO({ ...o, headers: (e.target as HTMLInputElement).checked })} /> Remove page headers, footers and numbers</label>
        <label class="chk"><input type="checkbox" checked={o.pageBreaks} onChange={(e) => setO({ ...o, pageBreaks: (e.target as HTMLInputElement).checked })} /> Mark page breaks (---)</label>
      </div>
      <div class="md-bar"><Seg label="View" value={view} set={setView} items={[['preview', 'Preview'], ['md', 'Markdown']]} />
        <button type="button" class="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied ✓' : 'Copy Markdown'}</button></div>
      {view === 'md' ? <pre class="md-raw">{md}</pre> : <div class="md-prev" dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />}
    </>
  );
}
/** Small, safe Markdown renderer for the preview (headings, lists, tables, bold/italic, links). */
function mdToHtml(md: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inl = (s: string) => e(s).replace(/\\([\\`*_[\]])/g, '$1\u0000').replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener nofollow">$1</a>').replace(/\u0000/g, '').replace(/&lt;br&gt;/g, '<br>');
  const lines = md.split('\n'); const html: string[] = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{1,6} /.test(l)) { const n = l.match(/^#+/)![0].length; html.push(`<h${n + 1}>${inl(l.slice(n + 1))}</h${n + 1}>`); i++; continue; }
    if (/^\|/.test(l)) { const rows: string[] = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]); const cells = (r: string) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim()); html.push('<table><thead><tr>' + cells(rows[0]).map((c) => `<th>${inl(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(2).map((r) => '<tr>' + cells(r).map((c) => `<td>${inl(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'); continue; }
    if (/^\s*(- |\d+\. )/.test(l)) { const items: string[] = []; const ordered = /^\s*\d+\. /.test(l); while (i < lines.length && /^\s*(- |\d+\. )/.test(lines[i])) { const m = lines[i].match(/^(\s*)(- |\d+\. )(.*)$/)!; items.push(`<li style="margin-left:${m[1].length * 0.8}em">${inl(m[3])}</li>`); i++; } html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`); continue; }
    if (l === '---') { html.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    html.push(`<p>${inl(l)}</p>`); i++;
  }
  return html.join('\n');
}
