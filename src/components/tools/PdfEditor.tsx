import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, uid } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';
import SignaturePad from './SignaturePad';

type Tool = 'select' | 'edittext' | 'text' | 'whiteout' | 'highlight' | 'rect' | 'draw';
type Obj = {
  id: string; page: number; type: 'text' | 'rect' | 'ink' | 'image';
  x: number; y: number; w: number; h: number; // viewport units (scale 1, top-left origin)
  text?: string; size?: number; font?: string; bold?: boolean; italic?: boolean; hs?: number; cs?: number;
  color: string; fill?: boolean; opacity?: number; width?: number;
  points?: [number, number][]; src?: string; kind?: 'png' | 'jpg'; link?: string; tkey?: string;
};
type TItem = { key: string; str: string; x: number; y: number; w: number; h: number; base: number; size: number; font: string; bold: boolean; italic?: boolean };
type PageInfo = { w: number; h: number; rot: number };

const FONTS: [string, string, string][] = [['Helvetica', 'Sans', 'Helvetica, Arial, sans-serif'], ['TimesRoman', 'Serif', '"Times New Roman", Times, serif'], ['Courier', 'Mono', '"Courier New", Courier, monospace']];
const css = (f?: string) => FONTS.find((x) => x[0] === f)?.[2] ?? FONTS[0][2];
const pdfFont = (f = 'Helvetica', bold = false, italic = false) => {
  if (f === 'TimesRoman') return 'TimesRoman' + (bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : '');
  return f + (bold && italic ? 'BoldOblique' : bold ? 'Bold' : italic ? 'Oblique' : '');
};
const TOOLS: [Tool, string, string][] = [
  ['select', '↖', 'Select / move'], ['edittext', 'Aa', 'Edit existing text'], ['text', 'T', 'Add text'], ['whiteout', '▭', 'White-out (hide content)'],
  ['highlight', '▬', 'Highlight'], ['rect', '□', 'Rectangle'], ['draw', '✎', 'Draw'],
];

const SHORT: Record<string, string> = { edittext: 'Edit text', text: 'Add text', whiteout: 'White-out', highlight: 'Highlight', rect: 'Box', draw: 'Draw' };
const ICONS: Record<string, string> = {
  edittext: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/><path d="M15 20h6"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  whiteout: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h10" stroke-dasharray="2 2"/>',
  highlight: '<path d="m9 11-5 5v3h3l5-5"/><path d="m15 5 4 4-7 7-4-4z"/><path d="M14 20h7"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1.5"/>',
  draw: '<path d="M3 17c3-4 5-8 7-8s1 7 4 7 3-5 7-5"/>',
  sign: '<path d="M3 17c2 0 3-6 5-6s1 5 3 5 2-3 4-3"/><path d="M3 21h18"/><path d="m16 4 4 4-6 6h-4v-4z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  select: '<path d="m4 4 7 16 2-7 7-2z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
};
const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
);

export default function PdfEditor({ mode = 'edit' }: { mode?: 'edit' | 'sign' | 'annotate' }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [objs, setObjs] = useState<Obj[]>([]);
  const [hist, setHist] = useState<Obj[][]>([]);
  const [tool, setTool] = useState<Tool>('edittext');
  const [titems, setTitems] = useState<TItem[][]>([]);
  const pdfjsRef = useRef<any>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [style, setStyle] = useState({ color: '#111827', size: 14, font: 'Helvetica', bold: false, italic: false, width: 2 });
  const [scales, setScales] = useState<number[]>([]);
  const [zoom, setZoom] = useState(1);
  const measureCv = useRef<HTMLCanvasElement | null>(null);
  const clickPt = useRef<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const zoomTo = (z: number) => {
    const el = scroller.current; const fx = el ? (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth) : 0.5; const fy = el ? (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight) : 0;
    setZoom(z);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!el) return; el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2; el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2; }));
  };
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
  const remove = (id: string) => { const link = objs.find((o) => o.id === id)?.link; commit(objs.filter((o) => o.id !== id && o.id !== link)); setSel(null); setEditing(null); };

  // ---------- load ----------
  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs(); pdfjsRef.current = pdfjs;
      docRef.current?.destroy?.();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false, fontExtraProperties: true }).promise;
      docRef.current = doc;
      const info: PageInfo[] = []; vpRef.current = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        vpRef.current.push(vp); info.push({ w: vp.width, h: vp.height, rot: vp.rotation });
      }
      rendered.current = new Set(); pageEls.current = [];
      setFile(f); setPages(info); setTitems([]); setTool(mode === 'sign' ? 'select' : mode === 'annotate' ? 'highlight' : 'edittext'); setObjs([]); setHist([]); setSel(null); setResult(null);
      if (mode === 'sign') setSigOpen(true);
    } catch (e: any) {
      setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Please unlock it first, then try again.' : friendlyError(e));
    } finally { setBusy(null); }
  };
  useEffect(() => () => docRef.current?.destroy?.(), []);
  useEffect(() => { document.querySelector('.tool-box')?.classList.toggle('wide', !!file); }, [file]);

  // ---------- page rendering (lazy) + scale tracking ----------
  useEffect(() => {
    if (!pages.length) return;
    rendered.current = new Set();
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
  }, [pages, zoom]);

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
      const tc = await pg.getTextContent();
      const v1 = vpRef.current[i], U = pdfjsRef.current.Util;
      const items: TItem[] = [];
      tc.items.forEach((it: any, k: number) => {
        if (!it.str || !it.str.trim()) return;
        const t = U.transform(v1.transform, it.transform);
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 || t[0] <= 0) return; // skip rotated / mirrored text
        const size = Math.hypot(t[2], t[3]);
        const w = it.width * (t[0] / Math.hypot(it.transform[0], it.transform[1]) || 1);
        if (size < 3 || w <= 0) return;
        let fam = (tc.styles[it.fontName]?.fontFamily || '').toLowerCase(), real = '';
        try { const fo = pg.commonObjs.get(it.fontName); real = fo?.name || ''; fam += ' ' + real.toLowerCase() + (fo?.isMonospace ? ' mono' : fo?.isSerifFont ? ' serif' : ''); } catch {}
        const nm = real.toLowerCase().replace(/^[a-z]{6}\+/, '');
        let flags = '';
        try { const fo = pg.commonObjs.get(it.fontName); flags = fo?.isMonospace ? 'mono' : fo?.isSerifFont ? 'serif' : ''; } catch {}
        const font = /courier|consol|mono|lucida ?console|menlo|cmtt|lmmono|inconsolata/.test(nm) ? 'Courier'
          : /calibri|arial|helvetica|verdana|tahoma|segoe|roboto|opensans|open ?sans|liberation ?sans|dejavu ?sans|gill|futura|gothic|trebuchet|aptos|lato|noto ?sans|source ?sans|candara|corbel|franklin|myriad|frutiger|univers|nirmala|mangal|cmss|lmsans|sans/.test(nm) ? 'Helvetica'
          : /times|georgia|garamond|cambria|antiqua|palatino|liberation ?serif|minion|bookman|schoolbook|noto ?serif|constantia|baskerville|didot|cmr|cmbx|cmti|cmsl|cmcsc|lmroman|sfrm|sfbx|sfti|nimbus ?rom|charter|utopia|stix|xits|libertine|dejavu ?serif|serif|tex/.test(nm) ? 'TimesRoman'
          : flags === 'mono' ? 'Courier' : flags === 'serif' ? 'TimesRoman' : /^serif/.test(fam) ? 'TimesRoman' : 'Helvetica';
        const italic = /italic|oblique|cmti|cmsl|sfti|-it\b|,it\b|-ital/.test(nm);
        items.push({ key: `${i}-${k}`, str: it.str.normalize('NFKC'), x: t[4], base: t[5], y: t[5] - size * 0.95, w, h: size * 1.25, size, font, italic, bold: /bold|black|heavy|semibold|demi|,bd|-bd\b|extrabold|cmbx|sfbx/i.test(real) });
      });
      setTitems((cur) => { const n = cur.slice(); n[i] = items; return n; });
    } catch { rendered.current.delete(i); }
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) { setTool(mode === 'sign' ? 'select' : mode === 'annotate' ? 'highlight' : 'edittext'); setSel(null); return; }
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
    if (tool === 'select' || tool === 'edittext') { setSel(null); setEditing(null); return; }
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const id = uid();
    if (tool === 'text') {
      const o: Obj = { id, page, type: 'text', x, y: y - style.size * 0.6, w: 0, h: 0, text: '', size: style.size, font: style.font, bold: style.bold, italic: style.italic, color: style.color };
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
    if (editing === o.id) return;
    if (tool === 'edittext') { if (o.type === 'text') { e.stopPropagation(); e.preventDefault(); clickPt.current = { x: e.clientX, y: e.clientY }; setSel(o.id); setEditing(o.id); } return; }
    if (tool !== 'select') return;
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

  // ---------- edit existing text ----------
  const sample = (page: number, it: TItem) => {
    const c = pageEls.current[page]?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c || !c.width) return { bg: '#ffffff', fg: '#000000' };
    const k = c.width / pages[page].w, ctx = c.getContext('2d', { willReadFrequently: true })!;
    const px = (x: number, y: number) => { const d = ctx.getImageData(Math.max(0, Math.min(c.width - 1, Math.round(x * k))), Math.max(0, Math.min(c.height - 1, Math.round(y * k))), 1, 1).data; return [d[0], d[1], d[2]]; };
    const corners = [px(it.x - 2, it.y - 1), px(it.x + it.w + 2, it.y - 1), px(it.x - 2, it.y + it.h), px(it.x + it.w + 2, it.y + it.h)];
    const bg = corners.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]))[0];
    let fg = [0, 0, 0], best = -1;
    const W = Math.max(1, Math.round(it.w * k)), H = Math.max(1, Math.round(it.size * k));
    const d = ctx.getImageData(Math.round(it.x * k), Math.round((it.base - it.size * 0.8) * k), W, H).data;
    for (let q = 0; q < d.length; q += 4 * 3) { const diff = Math.abs(d[q] - bg[0]) + Math.abs(d[q + 1] - bg[1]) + Math.abs(d[q + 2] - bg[2]); if (diff > best) { best = diff; fg = [d[q], d[q + 1], d[q + 2]]; } }
    const hex = (a: number[]) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
    return { bg: hex(bg), fg: hex(fg) };
  };
  /** Estimate stroke thickness relative to font size by rendering the text at high resolution (regular ≈ 0.09–0.10, bold ≈ 0.15+). */
  const stemRatio = async (page: number, it: TItem, bgHex: string) => {
    try {
      const pg = await docRef.current.getPage(page + 1);
      const k = 48 / it.size;
      const w = Math.max(1, Math.min(4000, Math.round(it.w * k))), h = Math.max(1, Math.round(it.size * 0.6 * k));
      const vp = pg.getViewport({ scale: k, offsetX: -it.x * k, offsetY: -(it.base - it.size * 0.65) * k });
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      await pg.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
      const d = ctx.getImageData(0, 0, w, h).data;
      const B = [1, 3, 5].map((o) => parseInt(bgHex.slice(o, o + 2), 16));
      const runs: number[] = [];
      for (let r = 0; r < h; r += 2) {
        let run = 0;
        for (let col = 0; col <= w; col++) {
          const q = (r * w + col) * 4;
          const cov = col < w ? Math.min(1, (Math.abs(d[q] - B[0]) + Math.abs(d[q + 1] - B[1]) + Math.abs(d[q + 2] - B[2])) / 450) : 0;
          if (cov > 0.15) run += cov; else if (run) { runs.push(run); run = 0; }
        }
      }
      if (runs.length < 4) return 0;
      runs.sort((p1, p2) => p1 - p2);
      return runs[Math.floor(runs.length / 2)] / 48;
    } catch { return 0; }
  };
  const editItem = async (e: PointerEvent, page: number, it: TItem) => {
    e.stopPropagation(); e.preventDefault();
    clickPt.current = { x: e.clientX, y: e.clientY };
    const { bg, fg } = sample(page, it);
    if (!it.bold) { const r = await stemRatio(page, it, bg); (window as any).__stem = r; if (r > 0.125) it = { ...it, bold: true }; }
    const wid = uid(), tid = uid();
    const white: Obj = { id: wid, page, type: 'rect', x: it.x - 1, y: it.y - it.size * 0.05, w: it.w + 2, h: it.h, fill: true, opacity: 1, color: bg, tkey: it.key };
    const text: Obj = { id: tid, page, type: 'text', x: it.x, y: it.base - 0.92 * it.size, w: 0, h: 0, text: it.str, size: Math.round(it.size * 10) / 10, font: it.font, bold: it.bold, italic: it.italic, color: fg, link: wid, tkey: it.key };
    // match the original width: letter-spaced text gets character spacing, other text is squeezed/stretched slightly
    const ctx = (measureCv.current ??= document.createElement('canvas')).getContext('2d')!;
    ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? 700 : 400} ${it.size}px ${css(it.font)}`;
    if (/^(\S )+\S$/.test(it.str)) {
      text.text = it.str.replace(/ /g, '');
      const nat = ctx.measureText(text.text).width;
      text.cs = Math.max(0, (it.w - nat) / text.text.length);
    } else {
      const nat = ctx.measureText(it.str).width, r = nat ? it.w / nat : 1;
      if (Math.abs(r - 1) > 0.03 && r > 0.6 && r < 1.25) text.hs = Math.round(r * 1000) / 1000;
    }
    commit([...objs, white, text]); setSel(tid); setEditing(tid);
  };
  const edited = new Set(objs.filter((o) => o.tkey).map((o) => o.tkey));

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
          items.push({ type: 'text', page: o.page, lines, size: o.size, color: o.color, font: pdfFont(o.font, o.bold, o.italic), rot, hs: o.hs, cs: o.cs });
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
  const curSize = selObj?.type === 'text' ? selObj.size! : style.size;
  const sizes = [...new Set([6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, curSize])].sort((x, y) => x - y);
  const setStyleAndSel = (p: Partial<typeof style>) => {
    setStyle({ ...style, ...p });
    if (selObj) {
      const q: Partial<Obj> = {};
      if (p.color && (selObj.type !== 'rect' || !selObj.fill)) q.color = p.color;
      if (p.size && selObj.type === 'text') q.size = p.size;
      if (p.font && selObj.type === 'text') q.font = p.font;
      if (p.bold !== undefined && selObj.type === 'text') q.bold = p.bold;
      if (p.italic !== undefined && selObj.type === 'text') q.italic = p.italic;
      if (p.width && (selObj.type === 'ink' || selObj.type === 'rect')) q.width = p.width;
      if (Object.keys(q).length) commit(objs.map((o) => (o.id === sel ? { ...o, ...q } : o)));
    }
  };
  const tb = (active: boolean) => ({ minWidth: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', padding: '0 10px',
    background: active ? 'var(--brand)' : 'var(--card)', color: active ? '#fff' : 'var(--text)' });

  return (
    <div style={{ width: 'min(1200px, calc(100vw - 24px))', marginLeft: 'calc(50% - min(600px, 50vw - 12px))' }}>
      {sizeWarning(file.size) && <ErrorBox>{sizeWarning(file.size)}</ErrorBox>}
      <div class="ed-bar" role="toolbar" aria-label="Editor tools">
        <div class="ed-row">
          {TOOLS.filter(([t]) => t !== 'select' && !(mode === 'annotate' && (t === 'edittext' || t === 'whiteout'))).map(([t, , label], k) => (<>
            {k === (mode === 'annotate' ? 1 : 2) && <span class="ed-sep" />}
            <button type="button" class="ed-btn" title={label} aria-pressed={tool === t} onClick={() => { setTool(t); setEditing(null); }}>
              <Icon name={t} /><span class="ed-label">{SHORT[t]}</span>
            </button>
          </>))}
          <span class="ed-sep" />
          <button type="button" class="ed-btn" title="Add signature" onClick={() => setSigOpen(true)}><Icon name="sign" /><span class="ed-label">Sign</span></button>
          <button type="button" class="ed-btn" title="Add image" onClick={() => imgInput.current?.click()}><Icon name="image" /><span class="ed-label">Image</span></button>
          <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { addImageFile((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
          <span class="ed-sep" />
          <button type="button" class="ed-btn" title="Select & move items" aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setEditing(null); }}><Icon name="select" /><span class="ed-label">Move</span></button>
          <span style={{ flex: 1 }} />
          <button type="button" class="btn btn-primary" style={{ padding: '9px 18px' }} disabled={!!busy} onClick={save}>Save PDF</button>
        </div>
        <div class="ed-row ed-format">
          <label class="ed-field" title="Colour"><input type="color" aria-label="Colour" value={selObj && selObj.type !== 'image' && !(selObj.type === 'rect' && selObj.fill) ? selObj.color : style.color} onInput={(e) => setStyleAndSel({ color: (e.target as HTMLInputElement).value })} /></label>
          <select class="ed-select" aria-label="Font" value={selObj?.type === 'text' ? selObj.font : style.font} onChange={(e) => setStyleAndSel({ font: (e.target as HTMLSelectElement).value })}>
            {FONTS.map(([v, l]) => <option value={v}>{l}</option>)}
          </select>
          <select class="ed-select" aria-label="Text size" value={String(curSize)} onChange={(e) => setStyleAndSel({ size: +(e.target as HTMLSelectElement).value })}>
            {sizes.map((v) => <option value={String(v)}>{v} pt</option>)}
          </select>
          <button type="button" class="ed-btn ed-sq" aria-label="Bold" title="Bold" aria-pressed={selObj?.type === 'text' ? !!selObj.bold : style.bold} onClick={() => setStyleAndSel({ bold: !(selObj?.type === 'text' ? selObj.bold : style.bold) })}><b>B</b></button>
          <button type="button" class="ed-btn ed-sq" aria-label="Italic" title="Italic" aria-pressed={selObj?.type === 'text' ? !!selObj.italic : style.italic} onClick={() => setStyleAndSel({ italic: !(selObj?.type === 'text' ? selObj.italic : style.italic) })}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></button>
          <span class="ed-sep" />
          <select class="ed-select" aria-label="Line width" title="Line width for rectangle and drawing" value={style.width} onChange={(e) => setStyleAndSel({ width: +(e.target as HTMLSelectElement).value })}>
            {[1, 2, 3, 5, 8].map((w) => <option value={w}>Line {w}px</option>)}
          </select>
          <span style={{ flex: 1 }} />
          <button type="button" class="ed-btn" title="Undo (Ctrl+Z)" disabled={!hist.length} onClick={undo}><Icon name="undo" /><span class="ed-label">Undo</span></button>
          <button type="button" class="ed-btn" title="Delete selected (Del)" disabled={!sel} onClick={() => sel && remove(sel)}><Icon name="trash" /><span class="ed-label">Delete</span></button>
          <span class="ed-sep" />
          <button type="button" class="ed-btn ed-sq" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => zoomTo(Math.max(0.5, Math.round((zoom - 0.25) * 100) / 100))}>−</button>
          <button type="button" class="ed-btn" title="Reset zoom" aria-label="Reset zoom" style={{ minWidth: '58px', justifyContent: 'center' }} onClick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" class="ed-btn ed-sq" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => zoomTo(Math.min(3, Math.round((zoom + 0.25) * 100) / 100))}>+</button>
        </div>
      </div>
      <p class="status" style={{ margin: '8px 0' }}>
        {tool === 'edittext' ? 'Click any existing text to change it. Tip: press Esc any time to come back to Edit text.' : tool === 'text' ? 'Click on the page where you want to type.' : tool === 'whiteout' ? 'Drag over anything you want to hide. Then use T to type new text on top.'
          : tool === 'highlight' ? 'Drag over text to highlight it.' : tool === 'rect' ? 'Drag to draw a rectangle.' : tool === 'draw' ? 'Draw freely with your mouse, finger or pen.'
          : 'Click an item to select it, drag to move, use the round handle to resize. Double-click text to edit.'}
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result && (
        <div class="done">
          <p class="big">Done! Your edited PDF is ready ({formatBytes(result.size)}).</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result, `${baseName(file.name)}-${mode === 'annotate' ? 'annotated' : mode === 'sign' ? 'signed' : 'edited'}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setResult(null)}>Keep editing</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New file</button>
          </div>
        </div>
      )}

      <div ref={scroller} style={{ height: '78vh', overflow: 'auto', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
      <div style={{ display: 'grid', gap: '18px', margin: '0 auto', width: `min(${900 * zoom}px, ${100 * zoom}%)` }}>
        {pages.map((p, i) => {
          const s = scales[i] || 1;
          return (
            <div key={i} data-page={i} ref={(el) => (pageEls.current[i] = el)}
              style={{ position: 'relative', width: '100%', aspectRatio: `${p.w} / ${p.h}`, background: '#fff', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', touchAction: tool === 'select' || tool === 'edittext' ? 'auto' : 'none', cursor: tool === 'select' || tool === 'edittext' ? 'default' : tool === 'text' ? 'text' : 'crosshair', userSelect: 'none', overflow: 'hidden' }}
              onPointerDown={(e) => onPageDown(e, i)} onPointerMove={(e) => onPageMove(e, i)} onPointerUp={onPageUp} onPointerCancel={onPageUp}>
              <canvas style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label={`Page ${i + 1}`} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${p.w} ${p.h}`}>
                {objs.filter((o) => o.page === i && o.type === 'ink').map((o) => (
                  <polyline points={o.points!.map((q) => q.join(',')).join(' ')} fill="none" stroke={o.color} stroke-width={o.width} stroke-linecap="round" stroke-linejoin="round"
                    style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none', cursor: 'move' }} onPointerDown={(e: any) => onObjDown(e, o, 'move')}
                    stroke-dasharray={sel === o.id ? '4 3' : undefined} />
                ))}
              </svg>
              {tool === 'edittext' && (titems[i] || []).filter((t) => !edited.has(t.key)).map((t) => (
                <div class="ti" title="Click to edit" onPointerDown={(e) => editItem(e as any, i, t)}
                  style={{ position: 'absolute', left: (t.x / p.w) * 100 + '%', top: (t.y / p.h) * 100 + '%', width: (t.w / p.w) * 100 + '%', height: (t.h / p.h) * 100 + '%', cursor: 'text', zIndex: 2 }} />
              ))}
              {objs.filter((o) => o.page === i && o.type !== 'ink').map((o) => {
                const isSel = sel === o.id, isEdit = editing === o.id;
                const box: any = { position: 'absolute', left: (o.x / p.w) * 100 + '%', top: (o.y / p.h) * 100 + '%', outline: isSel ? '2px dashed var(--brand)' : 'none', outlineOffset: '2px', pointerEvents: tool === 'select' || isEdit || (tool === 'edittext' && o.type === 'text') ? 'auto' : 'none', cursor: isEdit || tool === 'edittext' ? 'text' : 'move' };
                return (
                  <div key={o.id} data-obj onPointerDown={(e) => onObjDown(e, o, 'move')} onDblClick={() => o.type === 'text' && (setSel(o.id), setEditing(o.id))}
                    style={o.type === 'text' ? box : { ...box, width: (o.w / p.w) * 100 + '%', height: (o.h / p.h) * 100 + '%' }}>
                    {o.type === 'text' && (
                      <div contentEditable={isEdit} spellcheck={false} aria-label="Text"
                        ref={(el) => { if (el && isEdit && document.activeElement !== el) {
                          el.focus();
                          let r: Range | null = null; const cp = clickPt.current; clickPt.current = null;
                          if (cp) {
                            const d: any = document;
                            if (d.caretRangeFromPoint) r = d.caretRangeFromPoint(cp.x, cp.y);
                            else if (d.caretPositionFromPoint) { const pos = d.caretPositionFromPoint(cp.x, cp.y); if (pos) { r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); } }
                            if (r && !el.contains(r.startContainer)) r = null;
                          }
                          if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
                          const s2 = getSelection(); s2?.removeAllRanges(); s2?.addRange(r);
                        } }}
                        onInput={(e) => (textRef.current[o.id] = (e.target as HTMLElement).innerText)}
                        onBlur={(e) => { const t = (e.target as HTMLElement).innerText.replace(/\n$/, ''); textRef.current[o.id] = t; if (!t.trim()) { setObjs((cur) => cur.filter((x) => x.id !== o.id)); } else patch(o.id, { text: t }); setEditing(null); }}
                        style={{ font: `${o.italic ? 'italic ' : ''}${o.bold ? 700 : 400} ${o.size! * s}px/1.2 ${css(o.font)}`, letterSpacing: o.cs ? o.cs * s + 'px' : undefined, transform: o.hs ? `scaleX(${o.hs})` : undefined, transformOrigin: 'left top', color: o.color, whiteSpace: 'pre', minWidth: '1ch', minHeight: o.size! * 1.2 * s + 'px', outline: 'none', background: isEdit ? 'rgb(79 70 229 / .06)' : 'transparent' }}
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
      </div>
      <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={save}>Save PDF</button></div>
      {sigOpen && <SignaturePad onClose={() => setSigOpen(false)} onDone={(src, w, h) => { setSigOpen(false); placeImage(src, 'png', w, h, 0.25); }} />}
    </div>
  );
}
