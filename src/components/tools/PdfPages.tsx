import { useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, parseRanges, baseName, uid } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';

type Mode = 'remove' | 'extract' | 'reorder' | 'rotate' | 'blank';
type Pg = { key: string; src: number; rot: number; sel: boolean; thumb?: string };

const TEXT: Record<Mode, { action: string; hint: string; suffix: string }> = {
  remove: { action: 'Remove pages', hint: 'Click the pages you want to delete.', suffix: 'pages-removed' },
  extract: { action: 'Extract pages', hint: 'Click the pages you want to keep in the new PDF.', suffix: 'extracted' },
  reorder: { action: 'Save new order', hint: 'Drag pages to a new place, or use the ← → buttons.', suffix: 'reordered' },
  rotate: { action: 'Rotate PDF', hint: 'Rotate single pages with their buttons, or all pages at once.', suffix: 'rotated' },
  blank: { action: 'Add blank pages', hint: 'Click “+ Blank” to insert a blank page after any page.', suffix: 'with-blank-pages' },
};

export default function PdfPages({ mode }: { mode: Mode }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<Pg[]>([]);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [range, setRange] = useState('');
  const dragFrom = useRef<number | null>(null);
  const t = TEXT[mode];

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setResult(null); setFile(f); setPages([]);
    let doc: any;
    try {
      setBusy({ done: 0, total: 0, label: 'Loading pages…' });
      const pdfjs = await loadPdfjs();
      doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      const n = doc.numPages;
      const list: Pg[] = Array.from({ length: n }, (_, i) => ({ key: uid(), src: i, rot: 0, sel: false }));
      setPages(list);
      const canvas = document.createElement('canvas');
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Loading page ${i} of ${n}` });
        const page = await doc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 150 / Math.max(vp1.width, vp1.height) });
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        const thumb = canvas.toDataURL('image/jpeg', 0.7);
        setPages((cur) => cur.map((p) => (p.src === i - 1 && !p.thumb ? { ...p, thumb } : p)));
      }
      canvas.width = canvas.height = 0;
    } catch (e: any) {
      setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Please unlock it first, then try again.' : friendlyError(e));
      setFile(null);
    } finally { doc?.destroy?.(); setBusy(null); }
  };

  const update = (next: Pg[]) => { setPages(next); setResult(null); };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    const a = pages.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); update(a);
  };
  const selectRange = () => {
    const realCount = pages.filter((p) => p.src >= 0).length;
    const r = parseRanges(range, realCount);
    if (typeof r === 'string') { setError(r); return; }
    setError('');
    const want = new Set<number>(); r.forEach(([a, b]) => { for (let i = a; i <= b; i++) want.add(i - 1); });
    update(pages.map((p) => ({ ...p, sel: want.has(p.src) })));
  };

  const run = async () => {
    if (!file) return;
    const list = mode === 'remove' ? pages.filter((p) => !p.sel) : mode === 'extract' ? pages.filter((p) => p.sel) : pages;
    if (!list.length) { setError(mode === 'remove' ? 'You cannot remove every page.' : 'Please select at least one page.'); return; }
    if ((mode === 'remove' || mode === 'extract') && !pages.some((p) => p.sel)) { setError('Please select at least one page.'); return; }
    setError(''); setBusy({ done: 0, total: list.length, label: 'Building PDF…' });
    try {
      const buf = await file.arrayBuffer();
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'build', file: buf, pages: list.map((p) => ({ src: p.src, rot: p.rot })) }, [buf], setBusy);
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file)
    return <>
      <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const selCount = pages.filter((p) => p.sel).length;
  const selectable = mode === 'remove' || mode === 'extract';
  return (
    <div>
      <ul class="files"><li>
        <span class="fname" title={file.name}>{file.name}</span>
        <span class="meta">{pages.filter((p) => p.src >= 0).length} pages · {formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setPages([]); setResult(null); }}>✕</button>
      </li></ul>
      <p class="status">{t.hint}</p>
      <div class="opts">
        {selectable && <>
          <label>Select pages (e.g. 1-3, 7)<input type="text" value={range} onInput={(e) => setRange((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && selectRange()} /></label>
          <button type="button" class="btn btn-ghost" onClick={selectRange}>Select</button>
          <button type="button" class="btn btn-ghost" onClick={() => update(pages.map((p) => ({ ...p, sel: true })))}>All</button>
          <button type="button" class="btn btn-ghost" onClick={() => update(pages.map((p) => ({ ...p, sel: false })))}>None</button>
          <span class="status">{selCount} selected</span>
        </>}
        {mode === 'rotate' && <>
          <button type="button" class="btn btn-ghost" onClick={() => update(pages.map((p) => ({ ...p, rot: (p.rot + 270) % 360 })))}>⟲ Rotate all left</button>
          <button type="button" class="btn btn-ghost" onClick={() => update(pages.map((p) => ({ ...p, rot: (p.rot + 90) % 360 })))}>⟳ Rotate all right</button>
        </>}
        {mode === 'reorder' && <button type="button" class="btn btn-ghost" onClick={() => update(pages.slice().reverse())}>Reverse order</button>}
        {mode === 'blank' && <>
          <button type="button" class="btn btn-ghost" onClick={() => update([{ key: uid(), src: -1, rot: 0, sel: false }, ...pages])}>+ Blank at start</button>
          <button type="button" class="btn btn-ghost" onClick={() => update([...pages, { key: uid(), src: -1, rot: 0, sel: false }])}>+ Blank at end</button>
        </>}
      </div>
      <div class="pages-grid">
        {pages.map((p, i) => (
          <figure key={p.key}
            draggable={mode === 'reorder'}
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => mode === 'reorder' && e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null; }}
            onClick={() => selectable && update(pages.map((q, j) => (j === i ? { ...q, sel: !q.sel } : q)))}
            style={{
              cursor: selectable ? 'pointer' : mode === 'reorder' ? 'grab' : 'default',
              outline: p.sel ? `3px solid ${mode === 'remove' ? 'var(--err)' : 'var(--brand)'}` : 'none',
              opacity: mode === 'remove' && p.sel ? 0.45 : 1,
            }}>
            {p.src < 0
              ? <div style={{ height: '130px', background: '#fff', border: '1px dashed var(--border)', borderRadius: '6px', display: 'grid', placeItems: 'center', color: '#888', marginBottom: '6px' }}>Blank</div>
              : p.thumb
                ? <img src={p.thumb} alt={`Page ${p.src + 1}`} draggable={false} style={{ transform: `rotate(${p.rot}deg)`, transition: 'transform .2s' }} />
                : <div style={{ height: '130px', marginBottom: '6px' }} />}
            <div>{p.src < 0 ? 'Blank page' : `Page ${p.src + 1}`}{mode === 'remove' && p.sel ? ' ✕' : mode === 'extract' && p.sel ? ' ✓' : ''}</div>
            {mode === 'rotate' && p.src >= 0 && <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
              <button type="button" class="mini" aria-label={`Rotate page ${p.src + 1} left`} onClick={() => update(pages.map((q, j) => (j === i ? { ...q, rot: (q.rot + 270) % 360 } : q)))}>⟲</button>
              <button type="button" class="mini" aria-label={`Rotate page ${p.src + 1} right`} onClick={() => update(pages.map((q, j) => (j === i ? { ...q, rot: (q.rot + 90) % 360 } : q)))}>⟳</button>
            </div>}
            {mode === 'reorder' && <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
              <button type="button" class="mini" aria-label="Move left" disabled={i === 0} onClick={() => move(i, i - 1)}>←</button>
              <button type="button" class="mini" aria-label="Move right" disabled={i === pages.length - 1} onClick={() => move(i, i + 1)}>→</button>
            </div>}
            {mode === 'blank' && <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
              <button type="button" class="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '.8rem' }} onClick={() => { const a = pages.slice(); a.splice(i + 1, 0, { key: uid(), src: -1, rot: 0, sel: false }); update(a); }}>+ Blank</button>
              {p.src < 0 && <button type="button" class="mini" aria-label="Delete blank page" onClick={() => update(pages.filter((_, j) => j !== i))}>✕</button>}
            </div>}
          </figure>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          <p class="big">Done! Your new PDF is ready ({formatBytes(result.size)}).</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result, `${baseName(file.name)}-${t.suffix}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setPages([]); setResult(null); }}>New file</button>
          </div>
        </div>
      ) : (
        !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>{t.action}</button></div>
      )}
    </div>
  );
}
