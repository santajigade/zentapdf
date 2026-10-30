import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, uid } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';
import SignaturePad from './SignaturePad';

type Tool = 'select' | 'text' | 'whiteout' | 'highlight' | 'rect' | 'draw';
type Obj = {
  id: string; page: number; type: 'text' | 'rect' | 'ink' | 'image';
  x: number; y: number; w: number; h: number; // viewport units (scale 1, top-left origin)
  text?: string; size?: number; font?: string; bold?: boolean;
  color: string; fill?: boolean; opacity?: number; width?: number;
  points?: [number, number][]; src?: string; kind?: 'png' | 'jpg';
};
type PageInfo = { w: number; h: number; rot: number };

const FONTS: [string, string, string][] = [['Helvetica', 'Sans', 'Helvetica, Arial, sans-serif'], ['TimesRoman', 'Serif', '"Times New Roman", Times, serif'], ['Courier', 'Mono', '"Courier New", Courier, monospace']];
const css = (f?: string) => FONTS.find((x) => x[0] === f)?.[2] ?? FONTS[0][2];
const pdfFont = (f = 'Helvetica', bold = false) => (bold ? (f === 'TimesRoman' ? 'TimesRomanBold' : f + 'Bold') : f);
const TOOLS: [Tool, string, string][] = [
  ['select', '↖', 'Select / move'], ['text', 'T', 'Add text'], ['whiteout', '▭', 'White-out (hide content)'],
  ['highlight', '▬', 'Highlight'], ['rect', '□', 'Rectangle'], ['draw', '✎', 'Draw'],
];

export default function PdfEditor({ mode = 'edit' }: { mode?: 'edit' | 'sign' }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [objs, setObjs] = useState<Obj[]>([]);
  const [hist, setHist] = useState<Obj[][]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [style, setStyle] = useState({ color: '#111827', size: 14, font: 'Helvetica', bold: false, width: 2 });
  const [scales, setScales] = useState<number[]>([]);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const docRef = useRef<any>(null);
  const vpRef = useRef<any[]>([]);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const rendered = useRef<Set<number>>(new Set());
  const drag = useRef<any>(null);
  const textRef = useRef<Record<string, string>>({});
  const imgInput = useRef<HTMLInputElement>(null);

  // ---------- history ----------
  const commit = (next: Obj[]) => { setHist((h) => [...h.slice(-50), objs]); setObjs(next); setResult(null); };
  const undo = () => { if (!hist.length) return; setObjs(hist[hist.length - 1]); setHist(hist.slice(0, -1)); setSel(null); setEditing(null); };
  const patch = (id: string, p: Partial<Obj>) => setObjs((cur) => cur.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const remove = (id: string) => { commit(objs.filter((o) => o.id !== id)); setSel(null); setEditing(null); };

  // ---------- load ----------
  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs();
      docRef.current?.destroy?.();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      docRef.current = doc;
      const info: PageInfo[] = []; vpRef.current = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        vpRef.current.push(vp); info.push({ w: vp.width, h: vp.height, rot: vp.rotation });
      }
      rendered.current = new Set(); pageEls.current = [];
      setFile(f); setPages(info); setObjs([]); setHist([]); setSel(null); setResult(null);
      if (mode === 'sign') setSigOpen(true);
    } catch (e: any) {
      setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Please unlock it first, then try again.' : friendlyError(e));
    } finally { setBusy(null); }
  };
  useEffect(() => () => docRef.current?.destroy?.(), []);

  // ---------- page rendering (lazy) + scale tracking ----------
  useEffect(() => {
    if (!pages.length) return;
    const measure = () => setScales(pages.map((p, i) => (pageEls.current[i]?.clientWidth ?? p.w) / p.w));
    measure();
    const ro = new ResizeObserver(measure);
    pageEls.current.forEach((el) => el && ro.observe(el));
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      const i = Number((en.target as HTMLElement).dataset.page);
      if (en.isIntersecting && !rendered.current.has(i)) { rendered.current.add(i); renderPage(i); }
    }), { rootMargin: '800px 0px' });
    pageEls.current.forEach((el) => el && io.observe(el));
    return () => { ro.disconnect(); io.disconnect(); };
  }, [pages]);

  const renderPage = async (i: number) => {
    const el = pageEls.current[i]; const doc = docRef.current;
    if (!el || !doc) return;
    try {
      const pg = await doc.getPage(i + 1);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale: (el.clientWidth / pages[i].w) * dpr });
      const c = el.querySelector('canvas') as HTMLCanvasElement;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
    } catch { rendered.current.delete(i); }
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remove(sel); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- pointer interaction ----------
  const ptOf = (e: PointerEvent, page: number): [number, number] => {
    const r = pageEls.current[page]!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * pages[page].w, ((e.clientY - r.top) / r.height) * pages[page].h];
  };

  const onPageDown = (e: PointerEvent, page: number) => {
    if (e.button !== 0) return;
    const [x, y] = ptOf(e, page);
    if (tool === 'select') { setSel(null); setEditing(null); return; }
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const id = uid();
    if (tool === 'text') {
      const o: Obj = { id, page, type: 'text', x, y: y - style.size * 0.6, w: 0, h: 0, text: '', size: style.size, font: style.font, bold: style.bold, color: style.color };
      commit([...objs, o]); setSel(id); setEditing(id); setTool('select');
      return;
    }
    const base: Obj = tool === 'draw'
      ? { id, page, type: 'ink', x, y, w: 0, h: 0, points: [[x, y]], color: style.color, width: style.width }
      : { id, page, type: 'rect', x, y, w: 0, h: 0, fill: tool !== 'rect', width: style.width, opacity: tool === 'highlight' ? 0.35 : 1,
          color: tool === 'whiteout' ? '#ffffff' : tool === 'highlight' ? '#facc15' : style.color };
    commit([...objs, base]); setSel(id);
    drag.current = { kind: 'create', id, page, sx: x, sy: y };
  };

  const onPageMove = (e: PointerEvent, page: number) => {
    const d = drag.current; if (!d || d.page !== page) return;
    const [x, y] = ptOf(e, page);
    if (d.kind === 'create') {
      setObjs((cur) => cur.map((o) => {
        if (o.id !== d.id) return o;
        if (o.type === 'ink') return { ...o, points: [...o.points!, [x, y]] };
        return { ...o, x: Math.min(d.sx, x), y: Math.min(d.sy, y), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) };
      }));
    } else if (d.kind === 'move') {
      const dx = x - d.sx, dy = y - d.sy;
      setObjs((cur) => cur.map((o) => (o.id !== d.id ? o : o.type === 'ink'
        ? { ...o, points: d.orig.points.map(([px, py]: number[]) => [px + dx, py + dy]) }
        : { ...o, x: d.orig.x + dx, y: d.orig.y + dy })));
    } else if (d.kind === 'resize') {
      setObjs((cur) => cur.map((o) => {
        if (o.id !== d.id) return o;
        let w = Math.max(8, d.orig.w + x - d.sx), h = Math.max(8, d.orig.h + y - d.sy);
        if (o.type === 'image') h = w * (d.orig.h / d.orig.w);
        if (o.type === 'text') return { ...o, size: Math.max(6, Math.round(d.orig.size * (1 + (x - d.sx) / Math.max(40, d.orig.w || 100)))) };
        return { ...o, w, h };
      }));
    }
  };

  const onPageUp = () => {
    const d = drag.current; drag.current = null;
    if (d?.kind === 'create') {
      setObjs((cur) => cur.map((o) => (o.id === d.id && o.type === 'rect' && o.w < 4 && o.h < 4 ? { ...o, x: o.x - 50, y: o.y - 12, w: 100, h: 24 } : o)));
    }
  };

  const onObjDown = (e: PointerEvent, o: Obj, kind: 'move' | 'resize') => {
    if (tool !== 'select' || editing === o.id) return;
    e.stopPropagation(); e.preventDefault();
    const pageEl = pageEls.current[o.page]!;
    pageEl.setPointerCapture(e.pointerId);
    setSel(o.id); setEditing(null);
    const [x, y] = ptOf(e, o.page);
    const box = (e.currentTarget as HTMLElement).closest('[data-obj]')?.getBoundingClientRect();
    const w = box ? (box.width / pageEl.getBoundingClientRect().width) * pages[o.page].w : o.w;
    setHist((h) => [...h.slice(-50), objs]);
    drag.current = { kind, id: o.id, page: o.page, sx: x, sy: y, orig: { ...o, w: o.type === 'text' ? w : o.w } };
  };

  // ---------- images & signatures ----------
  const visiblePage = () => {
    const mid = window.innerHeight / 2; let best = 0, bestD = Infinity;
    pageEls.current.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };
  const placeImage = (src: string, kind: 'png' | 'jpg', iw: number, ih: number, widthFrac = 0.3) => {
    const page = visiblePage(), p = pages[page];
    const w = p.w * widthFrac, h = (w * ih) / iw;
    const o: Obj = { id: uid(), page, type: 'image', x: (p.w - w) / 2, y: Math.max(0, (p.h - h) / 2), w, h, src, kind, color: '#000' };
    commit([...objs, o]); setSel(o.id); setTool('select');
  };
  const addImageFile = async (f?: File) => {
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const jpg = /jpe?g/i.test(f.type);
    placeImage(c.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.92), jpg ? 'jpg' : 'png', bmp.width, bmp.height);
    bmp.close();
  };

  // ---------- save ----------
  const save = async () => {
    if (!file) return;
    setError(''); setBusy({ done: 0, total: 0, label: 'Saving your changes…' });
    try {
      const conv = (page: number, x: number, y: number) => vpRef.current[page].convertToPdfPoint(x, y) as [number, number];
      const items: any[] = []; const transfer: ArrayBuffer[] = [];
      for (const o of objs) {
        const rot = pages[o.page].rot;
        if (o.type === 'text') {
          const text = (textRef.current[o.id] ?? o.text ?? '');
          if (!text.trim()) continue;
          const lines = text.split('\n').map((t, i) => { const [x, y] = conv(o.page, o.x, o.y + (i * 1.2 + 0.92) * o.size!); return { text: t, x, y }; });
          items.push({ type: 'text', page: o.page, lines, size: o.size, color: o.color, font: pdfFont(o.font, o.bold), rot });
        } else if (o.type === 'rect') {
          const [x1, y1] = conv(o.page, o.x, o.y), [x2, y2] = conv(o.page, o.x + o.w, o.y + o.h);
          items.push({ type: 'rect', page: o.page, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: o.color, fill: o.fill, opacity: o.opacity, width: o.width });
        } else if (o.type === 'ink') {
          if (o.points!.length < 2) continue;
          items.push({ type: 'ink', page: o.page, points: o.points!.map(([x, y]) => conv(o.page, x, y)), color: o.color, width: o.width });
        } else if (o.type === 'image') {
          const bytes = await (await fetch(o.src!)).arrayBuffer();
          const [x, y] = conv(o.page, o.x, o.y + o.h);
          items.push({ type: 'image', page: o.page, key: o.id, bytes, kind: o.kind, x, y, w: o.w, h: o.h, rot }); transfer.push(bytes);
        }
      }
      const buf = await file.arrayBuffer();
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'annotate', file: buf, items }, [buf, ...transfer], setBusy);
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  // ---------- UI ----------
  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {busy && <ProgressBar {...busy} />}
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const selObj = objs.find((o) => o.id === sel);
  const setStyleAndSel = (p: Partial<typeof style>) => {
    setStyle({ ...style, ...p });
    if (selObj) {
      const q: Partial<Obj> = {};
      if (p.color && (selObj.type !== 'rect' || !selObj.fill)) q.color = p.color;
      if (p.size && selObj.type === 'text') q.size = p.size;
      if (p.font && selObj.type === 'text') q.font = p.font;
      if (p.bold !== undefined && selObj.type === 'text') q.bold = p.bold;
      if (p.width && (selObj.type === 'ink' || selObj.type === 'rect')) q.width = p.width;
      if (Object.keys(q).length) commit(objs.map((o) => (o.id === sel ? { ...o, ...q } : o)));
    }
  };
  const tb = (active: boolean) => ({ minWidth: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', padding: '0 10px',
    background: active ? 'var(--brand)' : 'var(--card)', color: active ? '#fff' : 'var(--text)' });

  return (
    <div>
      {sizeWarning(file.size) && <ErrorBox>{sizeWarning(file.size)}</ErrorBox>}
      <div role="toolbar" aria-label="Editor tools" style={{ position: 'sticky', top: '62px', zIndex: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', boxShadow: 'var(--shadow)' }}>
        {TOOLS.map(([t, icon, label]) => (
          <button type="button" title={label} aria-label={label} aria-pressed={tool === t} style={tb(tool === t)} onClick={() => { setTool(t); setEditing(null); }}>{icon}</button>
        ))}
        <button type="button" title="Add signature" style={tb(false)} onClick={() => setSigOpen(true)}>✍ Sign</button>
        <button type="button" title="Add image" style={tb(false)} onClick={() => imgInput.current?.click()}>🖼 Image</button>
        <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { addImageFile((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
        <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)' }} />
        <input type="color" aria-label="Colour" value={style.color} onInput={(e) => setStyleAndSel({ color: (e.target as HTMLInputElement).value })} style={{ width: '40px', height: '40px', border: 0, background: 'none', padding: 0 }} />
        <select aria-label="Font" value={selObj?.type === 'text' ? selObj.font : style.font} onChange={(e) => setStyleAndSel({ font: (e.target as HTMLSelectElement).value })} style={{ height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {FONTS.map(([v, l]) => <option value={v}>{l}</option>)}
        </select>
        <select aria-label="Text size" value={selObj?.type === 'text' ? selObj.size : style.size} onChange={(e) => setStyleAndSel({ size: +(e.target as HTMLSelectElement).value })} style={{ height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72].map((s) => <option value={s}>{s}</option>)}
        </select>
        <button type="button" aria-label="Bold" aria-pressed={selObj?.type === 'text' ? !!selObj.bold : style.bold} style={tb(selObj?.type === 'text' ? !!selObj.bold : style.bold)} onClick={() => setStyleAndSel({ bold: !(selObj?.type === 'text' ? selObj.bold : style.bold) })}>B</button>
        <select aria-label="Line width" value={style.width} onChange={(e) => setStyleAndSel({ width: +(e.target as HTMLSelectElement).value })} style={{ height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {[1, 2, 3, 5, 8].map((w) => <option value={w}>{w}px line</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" style={tb(false)} disabled={!hist.length} onClick={undo}>↶</button>
        <button type="button" title="Delete selected" aria-label="Delete selected" style={tb(false)} disabled={!sel} onClick={() => sel && remove(sel)}>🗑</button>
        <button type="button" class="btn btn-primary" style={{ height: '40px' }} disabled={!!busy} onClick={save}>Save PDF</button>
      </div>
      <p class="status" style={{ margin: '8px 0' }}>
        {tool === 'text' ? 'Click on the page where you want to type.' : tool === 'whiteout' ? 'Drag over anything you want to hide. Then use T to type new text on top.'
          : tool === 'highlight' ? 'Drag over text to highlight it.' : tool === 'rect' ? 'Drag to draw a rectangle.' : tool === 'draw' ? 'Draw freely with your mouse, finger or pen.'
          : 'Click an item to select it, drag to move, use the round handle to resize. Double-click text to edit.'}
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result && (
        <div class="done">
          <p class="big">Done! Your edited PDF is ready ({formatBytes(result.size)}).</p>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(result, `${baseName(file.name)}-edited.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setResult(null)}>Keep editing</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New file</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '18px', margin: '10px auto 0', maxWidth: '900px' }}>
        {pages.map((p, i) => {
          const s = scales[i] || 1;
          return (
            <div key={i} data-page={i} ref={(el) => (pageEls.current[i] = el)}
              style={{ position: 'relative', width: '100%', aspectRatio: `${p.w} / ${p.h}`, background: '#fff', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', touchAction: tool === 'select' ? 'auto' : 'none', cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair', userSelect: 'none', overflow: 'hidden' }}
              onPointerDown={(e) => onPageDown(e, i)} onPointerMove={(e) => onPageMove(e, i)} onPointerUp={onPageUp} onPointerCancel={onPageUp}>
              <canvas style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label={`Page ${i + 1}`} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${p.w} ${p.h}`}>
                {objs.filter((o) => o.page === i && o.type === 'ink').map((o) => (
                  <polyline points={o.points!.map((q) => q.join(',')).join(' ')} fill="none" stroke={o.color} stroke-width={o.width} stroke-linecap="round" stroke-linejoin="round"
                    style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none', cursor: 'move' }} onPointerDown={(e: any) => onObjDown(e, o, 'move')}
                    stroke-dasharray={sel === o.id ? '4 3' : undefined} />
                ))}
              </svg>
              {objs.filter((o) => o.page === i && o.type !== 'ink').map((o) => {
                const isSel = sel === o.id, isEdit = editing === o.id;
                const box: any = { position: 'absolute', left: (o.x / p.w) * 100 + '%', top: (o.y / p.h) * 100 + '%', outline: isSel ? '2px dashed var(--brand)' : 'none', outlineOffset: '2px', pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: isEdit ? 'text' : 'move' };
                return (
                  <div key={o.id} data-obj onPointerDown={(e) => onObjDown(e, o, 'move')} onDblClick={() => o.type === 'text' && (setSel(o.id), setEditing(o.id))}
                    style={o.type === 'text' ? box : { ...box, width: (o.w / p.w) * 100 + '%', height: (o.h / p.h) * 100 + '%' }}>
                    {o.type === 'text' && (
                      <div contentEditable={isEdit} spellcheck={false} aria-label="Text"
                        ref={(el) => { if (el && isEdit && document.activeElement !== el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s2 = getSelection(); s2?.removeAllRanges(); s2?.addRange(r); } }}
                        onInput={(e) => (textRef.current[o.id] = (e.target as HTMLElement).innerText)}
                        onBlur={(e) => { const t = (e.target as HTMLElement).innerText.replace(/\n$/, ''); textRef.current[o.id] = t; if (!t.trim()) { setObjs((cur) => cur.filter((x) => x.id !== o.id)); } else patch(o.id, { text: t }); setEditing(null); }}
                        style={{ font: `${o.bold ? 700 : 400} ${o.size! * s}px/1.2 ${css(o.font)}`, color: o.color, whiteSpace: 'pre', minWidth: '1ch', minHeight: o.size! * 1.2 * s + 'px', outline: 'none', background: isEdit ? 'rgb(79 70 229 / .06)' : 'transparent' }}
                        dangerouslySetInnerHTML={{ __html: (o.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') }} />
                    )}
                    {o.type === 'rect' && <div style={{ width: '100%', height: '100%', background: o.fill ? o.color : 'transparent', opacity: o.opacity, border: o.fill ? (o.color === '#ffffff' && isSel ? '1px solid #ddd' : 'none') : `${(o.width ?? 2) * s}px solid ${o.color}`, mixBlendMode: o.opacity! < 1 ? 'multiply' : 'normal' }} />}
                    {o.type === 'image' && <img src={o.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />}
                    {isSel && !isEdit && tool === 'select' && (
                      <span onPointerDown={(e) => onObjDown(e as any, o, 'resize')} aria-label="Resize"
                        style={{ position: 'absolute', right: '-10px', bottom: '-10px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--brand)', border: '2px solid #fff', cursor: 'nwse-resize', pointerEvents: 'auto' }} />
                    )}
                  </div>
                );
              })}
              <span style={{ position: 'absolute', right: '8px', bottom: '6px', fontSize: '11px', color: '#888', pointerEvents: 'none' }}>{i + 1} / {pages.length}</span>
            </div>
          );
        })}
      </div>
      <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={save}>Save PDF</button></div>
      {sigOpen && <SignaturePad onClose={() => setSigOpen(false)} onDone={(src, w, h) => { setSigOpen(false); placeImage(src, 'png', w, h, 0.25); }} />}
    </div>
  );
}
