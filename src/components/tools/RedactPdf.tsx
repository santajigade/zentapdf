import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs, viewRect } from '../../lib/pdfjs';

type Box = { id: number; page: number; x: number; y: number; w: number; h: number }; // PDF points, top-left origin
type PageInfo = { w: number; h: number; url: string };
const MAX_PAGES = 150;
let nextId = 1;

export default function RedactPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [term, setTerm] = useState('');
  const [color, setColor] = useState('#000000');
  const [found, setFound] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<Blob | null>(null);
  const docRef = useRef<any>(null);
  const drag = useRef<{ page: number; x: number; y: number; id: number } | null>(null);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setBoxes([]); setPages([]); setFile(f);
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      docRef.current = doc;
      if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages. Redact PDF works with up to ${MAX_PAGES} pages, split it first.`);
      const list: PageInfo[] = [];
      const c = document.createElement('canvas');
      for (let i = 1; i <= doc.numPages; i++) {
        setBusy({ done: i - 1, total: doc.numPages, label: 'Loading pages…' });
        const pg = await doc.getPage(i); const vp1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 1100 / vp1.width });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: cx, viewport: vp }).promise;
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85));
        list.push({ w: vp1.width, h: vp1.height, url: URL.createObjectURL(blob) });
        setPages(list.slice());
      }
    } catch (e: any) { setError(friendlyError(e)); if (/pages/.test(String(e?.message))) setFile(null); }
    finally { setBusy(null); }
  };

  const findText = async (pattern: RegExp, label: string) => {
    const doc = docRef.current; if (!doc) return;
    const add: Box[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      for (const it of tc.items as any[]) {
        if (!it.str) continue;
        pattern.lastIndex = 0; let m: RegExpExecArray | null;
        while ((m = pattern.exec(it.str))) {
          if (!m[0].length) { pattern.lastIndex++; continue; }
          const [a, b, , d, e, f] = it.transform; const fh = Math.hypot(b, d) || it.height || 10;
          const per = it.width / Math.max(1, it.str.length);
          const x0 = e + per * m.index, x1 = x0 + per * m[0].length;
          const [vx0, vy0, vx1, vy1] = viewRect(vp, [x0 - 1, f - fh * 0.25, x1 + 1, f + fh * 0.95]);
          add.push({ id: nextId++, page: i - 1, x: Math.min(vx0, vx1), y: Math.min(vy0, vy1), w: Math.abs(vx1 - vx0), h: Math.abs(vy1 - vy0) });
          if (!pattern.global) break;
        }
      }
    }
    setBoxes((b) => [...b, ...add]); setOut(null);
    setFound(add.length ? `${add.length} ${label} marked. Check the pages below, click × on a box to remove it.` : `No ${label} found. Scanned pages (photos) have no text to search, draw boxes by hand.`);
  };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const toPt = (e: PointerEvent, page: number) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const p = pages[page]; return { x: Math.max(0, Math.min(p.w, (e.clientX - r.left) / r.width * p.w)), y: Math.max(0, Math.min(p.h, (e.clientY - r.top) / r.height * p.h)) }; };
  const down = (page: number) => (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.rbox-x')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toPt(e, page); const id = nextId++;
    drag.current = { page, x, y, id }; setBoxes((b) => [...b, { id, page, x, y, w: 0, h: 0 }]); setOut(null);
  };
  const move = (page: number) => (e: PointerEvent) => {
    const d = drag.current; if (!d || d.page !== page) return; const { x, y } = toPt(e, page);
    setBoxes((b) => b.map((bx) => (bx.id === d.id ? { ...bx, x: Math.min(x, d.x), y: Math.min(y, d.y), w: Math.abs(x - d.x), h: Math.abs(y - d.y) } : bx)));
  };
  const up = () => { const d = drag.current; drag.current = null; if (d) setBoxes((b) => b.filter((bx) => bx.id !== d.id || (bx.w > 3 && bx.h > 3))); };

  const apply = async () => {
    if (!file || !boxes.length) return;
    setError(''); setOut(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();
      const doc = docRef.current; const c = document.createElement('canvas');
      const byPage = new Map<number, Box[]>(); boxes.forEach((b) => byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]));
      for (let i = 0; i < pages.length; i++) {
        setBusy({ done: i, total: pages.length, label: `Processing page ${i + 1}…` });
        const bx = byPage.get(i);
        if (!bx) { const [p] = await outDoc.copyPages(src, [i]); outDoc.addPage(p); continue; }
        // Redacted page: rebuild as an image so the hidden text is really gone
        const pg = await doc.getPage(i + 1); const vp1 = pg.getViewport({ scale: 1 }); const S = 2.5;
        const vp = pg.getViewport({ scale: S });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: cx, viewport: vp }).promise;
        cx.fillStyle = color; bx.forEach((b) => cx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S));
        const img = await outDoc.embedJpg(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.9)));
        const np = outDoc.addPage([vp1.width, vp1.height]);
        np.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      }
      // remove document information that could reveal details
      outDoc.setTitle(''); outDoc.setAuthor(''); outDoc.setSubject(''); outDoc.setKeywords([]); outDoc.setProducer('ZentaPDF'); outDoc.setCreator('ZentaPDF');
      setBusy({ done: pages.length, total: pages.length, label: 'Saving…' });
      const bytes = await outDoc.save();
      setOut(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const marked = new Set(boxes.map((b) => b.page)).size;
  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)} · {pages.length} pages</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      <div class="opts" data-title="Find and mark text">
        <label style={{ flex: '1 1 220px' }}>Word or phrase<input type="text" value={term} placeholder="e.g. a name, account number…" onInput={(e) => setTerm((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && term.trim() && findText(new RegExp(esc(term.trim()), 'gi'), `"${term.trim()}"`)} style={{ width: '100%' }} /></label>
        <button type="button" class="btn btn-ghost" disabled={!term.trim()} onClick={() => findText(new RegExp(esc(term.trim()), 'gi'), `matches for "${term.trim()}"`)}>Mark all</button>
        <button type="button" class="btn btn-ghost" onClick={() => findText(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'email addresses')}>Mark emails</button>
        <button type="button" class="btn btn-ghost" onClick={() => findText(/(\+?\d[\d\s-]{8,}\d)/g, 'phone numbers')}>Mark phone numbers</button>
      </div>
      <div class="opts" data-title="Redaction">
        <label>Box colour<select value={color} onChange={(e) => { setColor((e.target as HTMLSelectElement).value); setOut(null); }}><option value="#000000">Black</option><option value="#ffffff">White</option></select></label>
        <span class="status">{boxes.length} area{boxes.length === 1 ? '' : 's'} on {marked} page{marked === 1 ? '' : 's'}</span>
        {boxes.length > 0 && <button type="button" class="btn btn-ghost" onClick={() => { setBoxes([]); setOut(null); setFound(''); }}>Clear all</button>}
      </div>
      {found && <p class="status" style={{ textAlign: 'left' }}>{found}</p>}
      <p class="status" style={{ textAlign: 'left' }}>Drag on a page to cover anything you want to hide.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Redacted PDF ready ({formatBytes(out.size)}).</p>
          <p class="status">The covered text and images were permanently removed from {marked} page{marked === 1 ? '' : 's'}. Those pages are now pictures, so their text can't be selected.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out, `${baseName(file.name)}-redacted.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Keep editing</button>
          </div>
        </div>
      ) : !busy && pages.length > 0 && <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!boxes.length} onClick={apply}>{boxes.length ? 'Redact PDF' : 'Mark something to redact'}</button></div>}
      <div class="rpages">
        {pages.map((p, i) => (
          <figure key={i} class="rpage">
            <div class="rpage-in" style={{ aspectRatio: `${p.w} / ${p.h}` }} onPointerDown={down(i) as any} onPointerMove={move(i) as any} onPointerUp={up} onPointerCancel={up}>
              <img src={p.url} alt={`Page ${i + 1}`} draggable={false} />
              {boxes.filter((b) => b.page === i).map((b) => (
                <div class="rbox" style={{ left: (b.x / p.w) * 100 + '%', top: (b.y / p.h) * 100 + '%', width: (b.w / p.w) * 100 + '%', height: (b.h / p.h) * 100 + '%', background: color === '#ffffff' ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.78)' }}>
                  <button type="button" class="rbox-x" aria-label="Remove this box" onClick={() => { setBoxes((all) => all.filter((x) => x.id !== b.id)); setOut(null); }}>×</button>
                </div>
              ))}
            </div>
            <figcaption>Page {i + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
