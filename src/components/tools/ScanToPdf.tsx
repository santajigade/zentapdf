import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, moveItem } from './shared';
import { formatBytes, downloadBlob, friendlyError, uid } from '../../lib/utils';
import { loadBitmap, isImage, IMAGE_ACCEPT } from '../../lib/imageOps';
import { warp, applyFilter, rotateCanvas, type Pt, type Filter } from '../../lib/scan';

type Page = { id: string; src: HTMLCanvasElement; q: Pt[]; filter: Filter; rot: number; thumb: string };
const FILTERS: [Filter, string][] = [['magic', 'Magic colour'], ['bw', 'Black & white'], ['gray', 'Greyscale'], ['original', 'Original']];
const MAX_SRC = 2400;

async function processed(p: Page, maxSide: number) {
  const c = warp(p.src, p.q, maxSide); applyFilter(c, p.filter); return rotateCanvas(c, p.rot);
}
async function makeThumb(p: Page) { const c = await processed(p, 500); return c.toDataURL('image/jpeg', 0.8); }

export default function ScanToPdf() {
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('magic');
  const [size, setSize] = useState<'a4' | 'fit'>('a4');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<Blob | null>(null);
  const cam = useRef<HTMLInputElement>(null);

  const add = async (files: File[]) => {
    const imgs = files.filter(isImage); if (!imgs.length) { setError('Please choose photos (JPG, PNG, HEIC…).'); return; }
    setError(''); setOut(null);
    const added: Page[] = [];
    for (let i = 0; i < imgs.length; i++) {
      setBusy({ done: i, total: imgs.length, label: 'Reading photos…' });
      try {
        const b = await loadBitmap(imgs[i]); const k = Math.min(1, MAX_SRC / Math.max(b.width, b.height));
        const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
        c.getContext('2d')!.drawImage(b, 0, 0, c.width, c.height); b.close();
        const ix = c.width * 0.03, iy = c.height * 0.03;
        const p: Page = { id: uid(), src: c, q: [[ix, iy], [c.width - ix, iy], [c.width - ix, c.height - iy], [ix, c.height - iy]], filter, rot: 0, thumb: '' };
        p.thumb = await makeThumb(p); added.push(p);
      } catch (e) { setError(friendlyError(e)); }
    }
    setBusy(null);
    setPages((ps) => [...ps, ...added]); if (added.length) setSel(added[0].id);
  };

  const update = async (id: string, patch: Partial<Page>) => {
    setOut(null);
    const p = pages.find((x) => x.id === id); if (!p) return;
    const np = { ...p, ...patch }; np.thumb = await makeThumb(np);
    setPages((ps) => ps.map((x) => (x.id === id ? np : x)));
  };

  const make = async () => {
    setError(''); setOut(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      for (let i = 0; i < pages.length; i++) {
        setBusy({ done: i, total: pages.length, label: `Processing page ${i + 1}…` });
        await new Promise((r) => setTimeout(r));
        const c = await processed(pages[i], 2200);
        const bw = pages[i].filter === 'bw';
        const img = bw ? await doc.embedPng(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/png')))
          : await doc.embedJpg(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.85)));
        let PW: number, PH: number;
        if (size === 'a4') { [PW, PH] = c.width > c.height ? [841.89, 595.28] : [595.28, 841.89]; }
        else { const s = 595.28 / Math.min(c.width, c.height) * (c.width < c.height ? 1 : 1); PW = c.width * s; PH = c.height * s; }
        const k = Math.min(PW / c.width, PH / c.height); const w = c.width * k, h = c.height * k;
        doc.addPage([PW, PH]).drawImage(img, { x: (PW - w) / 2, y: (PH - h) / 2, width: w, height: h });
      }
      doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
      setBusy({ done: pages.length, total: pages.length, label: 'Saving PDF…' });
      setOut(new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const camInput = <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files; if (f?.length) add(Array.from(f)); (e.target as HTMLInputElement).value = ''; }} />;

  if (!pages.length) return <>
    <div class="scan-start">
      <button type="button" class="btn btn-primary btn-lg" onClick={() => cam.current?.click()}>📷 Take photo</button>
      {camInput}
    </div>
    <DropZone accept={IMAGE_ACCEPT} multiple label="Choose photos" hint="or drop photos of documents here" onFiles={add} />
    {busy && <ProgressBar {...busy} />}
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const cur = pages.find((p) => p.id === sel) ?? pages[0];
  return (
    <div>
      {cur && <CornerEditor key={cur.id} page={cur} onChange={(q) => update(cur.id, { q })} />}
      {cur && <div class="opts" data-title={`Page ${pages.indexOf(cur) + 1}`}>
        <div class="seg" role="group" aria-label="Filter">{FILTERS.map(([f, t]) => <button type="button" aria-pressed={cur.filter === f} onClick={() => { setFilter(f); update(cur.id, { filter: f }); }}>{t}</button>)}</div>
        <button type="button" class="btn btn-ghost" onClick={() => update(cur.id, { rot: (cur.rot + 90) % 360 })}>⟳ Rotate</button>
        <button type="button" class="btn btn-ghost" onClick={() => update(cur.id, { q: [[0, 0], [cur.src.width, 0], [cur.src.width, cur.src.height], [0, cur.src.height]] })}>Whole photo</button>
        <button type="button" class="btn btn-ghost" onClick={() => setPages(pages.map((p) => ({ ...p, filter: cur.filter }))) /* thumbs refresh below */ }>Use this filter for all</button>
      </div>}
      <ul class="frames scan-pages">
        {pages.map((p, i) => (
          <li key={p.id} class={p.id === cur?.id ? 'cur' : ''} onClick={() => setSel(p.id)}>
            <span class="fno">{i + 1}</span>
            <img src={p.thumb} alt={`Scanned page ${i + 1}`} />
            <div>
              <button type="button" class="mini" aria-label="Move left" disabled={i === 0} onClick={(e) => { e.stopPropagation(); setPages(moveItem(pages, i, i - 1)); setOut(null); }}>←</button>
              <button type="button" class="mini" aria-label="Move right" disabled={i === pages.length - 1} onClick={(e) => { e.stopPropagation(); setPages(moveItem(pages, i, i + 1)); setOut(null); }}>→</button>
              <button type="button" class="mini" aria-label="Remove page" onClick={(e) => { e.stopPropagation(); setPages(pages.filter((x) => x.id !== p.id)); setOut(null); }}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      <div class="actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" class="btn btn-ghost" onClick={() => cam.current?.click()}>📷 Take another photo</button>{camInput}
        <DropZone compact accept={IMAGE_ACCEPT} multiple label="Add photos" onFiles={add} />
      </div>
      <div class="opts" data-title="PDF settings">
        <label>Page size<select value={size} onChange={(e) => { setSize((e.target as HTMLSelectElement).value as any); setOut(null); }}><option value="a4">A4</option><option value="fit">Same as scan</option></select></label>
        <span class="status">{pages.length} page{pages.length > 1 ? 's' : ''}</span>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Your scanned PDF is ready ({formatBytes(out.size)}).</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out, 'scan.pdf')}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Keep editing</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={make}>Create PDF</button></div>}
      <ThumbRefresher pages={pages} setPages={setPages} />
    </div>
  );
}

/** Rebuild thumbnails that went stale (e.g. after "use this filter for all"). */
function ThumbRefresher({ pages, setPages }: { pages: Page[]; setPages: (f: (p: Page[]) => Page[]) => void }) {
  const done = useRef(new Map<string, string>());
  useEffect(() => {
    (async () => {
      for (const p of pages) {
        const key = p.filter + p.rot + JSON.stringify(p.q);
        if (!done.current.has(p.id)) { done.current.set(p.id, key); continue; }
        if (done.current.get(p.id) === key) continue;
        done.current.set(p.id, key);
        const t = await makeThumb(p); setPages((ps) => ps.map((x) => (x.id === p.id ? { ...x, thumb: t } : x)));
      }
    })();
  }, [pages]);
  return null;
}

/** The photo with four draggable corners to mark the document edges. */
function CornerEditor({ page, onChange }: { page: Page; onChange: (q: Pt[]) => void }) {
  const [q, setQ] = useState<Pt[]>(page.q);
  const [url] = useState(() => page.src.toDataURL('image/jpeg', 0.8));
  const box = useRef<HTMLDivElement>(null); const drag = useRef<number | null>(null);
  const W = page.src.width, H = page.src.height;
  const toPx = (e: PointerEvent): Pt => { const r = box.current!.getBoundingClientRect(); return [Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W)), Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H))]; };
  return (
    <div class="scan-edit">
      <div ref={box} class="scan-box" style={{ aspectRatio: `${W} / ${H}` }}
        onPointerMove={(e: any) => { if (drag.current === null) return; const p = toPx(e); setQ((o) => o.map((v, i) => (i === drag.current ? p : v))); }}
        onPointerUp={() => { if (drag.current !== null) { drag.current = null; onChange(q); } }} onPointerCancel={() => { drag.current = null; }}>
        <img src={url} alt="Photo to scan" draggable={false} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <polygon points={q.map((p) => p.join(',')).join(' ')} fill="rgba(79,70,229,.15)" stroke="#4f46e5" stroke-width={Math.max(W, H) / 250} />
        </svg>
        {q.map((p, i) => <span class="scan-h" style={{ left: (p[0] / W) * 100 + '%', top: (p[1] / H) * 100 + '%' }} onPointerDown={(e: any) => { e.preventDefault(); box.current!.setPointerCapture(e.pointerId); drag.current = i; }} aria-label={`Corner ${i + 1}`} />)}
      </div>
      <p class="status">Drag the 4 round handles to the corners of the document.</p>
    </div>
  );
}
