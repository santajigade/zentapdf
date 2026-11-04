import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName, uid } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';
import SignaturePad from './SignaturePad';

type Tool = 'select' | 'edittext' | 'text' | 'whiteout' | 'highlight' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'draw';
type Obj = {
  id: string; page: number; type: 'text' | 'rect' | 'ellipse' | 'line' | 'ink' | 'image'; arrow?: boolean;
  x: number; y: number; w: number; h: number; // viewport units (scale 1, top-left origin)
  text?: string; size?: number; font?: string; bold?: boolean; italic?: boolean; hs?: number; cs?: number;
  color: string; fill?: boolean; opacity?: number; width?: number;
  points?: [number, number][]; src?: string; kind?: 'png' | 'jpg'; link?: string; tkey?: string;
  orig?: string; origStyle?: string; fitW?: number; fitText?: string; ffam?: string;
};
type TItem = { key: string; str: string; x: number; y: number; w: number; h: number; base: number; size: number; font: string; bold: boolean; italic?: boolean; real?: string; fam?: string };
type PageInfo = { w: number; h: number; rot: number };

// fonts shown in the editor are the same files that get embedded, so text looks and measures the same in the PDF
const FONTS: [string, string, string, string, string][] = [
  ['sans', 'Arial', 'ZSans', 'LiberationSans', 'Standard'], ['serif', 'Times', 'ZSerif', 'LiberationSerif', 'Standard'], ['calibri', 'Calibri', 'ZCalibri', 'Carlito', 'Standard'],
  ['cambria', 'Cambria', 'ZCambria', 'Caladea', 'Standard'], ['mono', 'Courier', 'ZMono', 'LiberationMono', 'Standard'],
  ['roboto', 'Roboto', 'ZRoboto', 'Roboto', 'Sans serif'], ['opensans', 'Open Sans', 'ZOpenSans', 'OpenSans', 'Sans serif'], ['lato', 'Lato', 'ZLato', 'Lato', 'Sans serif'],
  ['montserrat', 'Montserrat', 'ZMontserrat', 'Montserrat', 'Sans serif'], ['poppins', 'Poppins', 'ZPoppins', 'Poppins', 'Sans serif'], ['inter', 'Inter', 'ZInter', 'Inter', 'Sans serif'],
  ['noto', 'Noto Sans', 'ZNoto', 'NotoSans', 'Sans serif'], ['oswald', 'Oswald', 'ZOswald', 'Oswald', 'Sans serif'],
  ['georgia', 'Georgia', 'ZGeorgia', 'Gelasio', 'Serif'], ['merriweather', 'Merriweather', 'ZMerri', 'Merriweather', 'Serif'], ['playfair', 'Playfair Display', 'ZPlayfair', 'PlayfairDisplay', 'Serif'],
  ['sourceserif', 'Source Serif', 'ZSourceSerif', 'SourceSerif4', 'Serif'],
  ['dancing', 'Dancing Script', 'ZDancing', 'DancingScript', 'Handwriting'], ['caveat', 'Caveat', 'ZCaveat', 'Caveat', 'Handwriting'],
];
const NO_ITALIC = new Set(['LiberationMono', 'Oswald', 'DancingScript', 'Caveat']);
const OLD: Record<string, string> = { Helvetica: 'sans', TimesRoman: 'serif', Courier: 'mono' };
const fkey = (f?: string) => (f && OLD[f]) || (FONTS.some((x) => x[0] === f) ? f! : 'sans');
const css = (f?: string) => `"${FONTS.find((x) => x[0] === fkey(f))![2]}", "ZSym", sans-serif`;
const fontFile = (f: string | undefined, bold = false, italic = false) => {
  const base = FONTS.find((x) => x[0] === fkey(f))![3];
  const st = NO_ITALIC.has(base) ? (bold ? 'Bold' : 'Regular') : bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  return `${base}-${st}.ttf`;
};
const SYM = 'DejaVuSans.ttf';
let facesDone = false;
function addEditorFonts() {
  if (facesDone) return; facesDone = true;
  const st = document.createElement('style');
  st.textContent = FONTS.map(([k, , fam]) => [[false, false], [true, false], [false, true], [true, true]].map(([b, i]) => `@font-face{font-family:"${fam}";font-weight:${b ? 700 : 400};font-style:${i ? 'italic' : 'normal'};src:url(/fonts/${fontFile(k, b, i)});}`).join('')).join('')
    + `@font-face{font-family:"ZSym";src:url(/fonts/${SYM});unicode-range:U+0100-024F,U+0370-03FF,U+0400-04FF,U+2000-2BFF,U+20B9;}`;
  document.head.appendChild(st);
}
const needsSym = (t: string) => /[^\u0000-\u00ff\u2013\u2014\u2018-\u201e\u2022\u2026\u20ac\u2122]/.test(t);
const TOOLS: [Tool, string, string][] = [
  ['select', '↖', 'Select / move'], ['edittext', 'Aa', 'Edit existing text'], ['text', 'T', 'Add text'], ['whiteout', '▭', 'White-out (hide content)'],
  ['highlight', '▬', 'Highlight'], ['rect', '□', 'Rectangle'], ['ellipse', '○', 'Circle / ellipse'], ['line', '╱', 'Line'], ['arrow', '→', 'Arrow'], ['draw', '✎', 'Draw'],
];

const COL: Record<string, string> = { edittext: '#4f46e5', text: '#2563eb', whiteout: '#64748b', highlight: '#d97706', rect: '#0d9488', ellipse: '#0891b2', line: '#059669', arrow: '#16a34a', draw: '#db2777', select: '#475569' };
const tint = (c: string) => ({ '--c': c } as any);
const SHORT: Record<string, string> = { edittext: 'Edit text', text: 'Add text', whiteout: 'White-out', highlight: 'Highlight', rect: 'Box', ellipse: 'Circle', line: 'Line', arrow: 'Arrow', draw: 'Draw' };
const ICONS: Record<string, string> = {
  edittext: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/><path d="M15 20h6"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  whiteout: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h10" stroke-dasharray="2 2"/>',
  highlight: '<path d="m9 11-5 5v3h3l5-5"/><path d="m15 5 4 4-7 7-4-4z"/><path d="M14 20h7"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M5 19 19 5"/><path d="M10 5h9v9"/>',
  stamp: '<path d="m5 12 4 4 10-10"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  pages: '<rect x="4" y="3" width="7" height="9" rx="1"/><rect x="13" y="3" width="7" height="9" rx="1"/><rect x="4" y="14" width="7" height="7" rx="1"/><rect x="13" y="14" width="7" height="7" rx="1"/>',
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

/** Join text pieces that sit on the same line with the same style, so a whole line can be edited at once. */
function mergeLine(items: TItem[]): TItem[] {
  const out: TItem[] = [];
  for (const it of items) {
    const l = out[out.length - 1];
    const gap = l ? it.x - (l.x + l.w) : 0;
    if (l && Math.abs(l.base - it.base) < Math.max(0.6, it.size * 0.08) && Math.abs(l.size - it.size) < it.size * 0.06 && l.font === it.font && l.real === it.real && l.bold === it.bold && !!l.italic === !!it.italic && gap > -it.size * 0.25 && gap < it.size * 0.9) {
      const spaced = /^(\S )+\S$/;
      // letter-spaced words ("S T A N D A R D"): mark the word gap with two spaces so it can be found again
      const space = spaced.test(l.str.split('  ').pop()!) && spaced.test(it.str) ? '  ' : gap > it.size * 0.12 && !l.str.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '';
      l.str = l.str + space + it.str; l.w = it.x + it.w - l.x; l.h = Math.max(l.h, it.h); l.key += '+' + it.key;
    } else out.push({ ...it });
  }
  return out;
}

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
  const [style, setStyle] = useState({ color: '#111827', size: 14, font: 'sans', bold: false, italic: false, width: 2, opacity: 1, fill: false });
  const [scales, setScales] = useState<number[]>([]);
  const [zoom, setZoom] = useState(1);
  const [curPage, setCurPage] = useState(0);
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
  const [future, setFuture] = useState<Obj[][]>([]);
  const clip = useRef<Obj | null>(null);
  const commit = (next: Obj[]) => { setHist((h) => [...h.slice(-50), objs]); setFuture([]); setObjs(next); setResult(null); };
  const undo = () => { if (!hist.length) return; setFuture((f) => [objs, ...f].slice(0, 50)); setObjs(hist[hist.length - 1]); setHist(hist.slice(0, -1)); setSel(null); setEditing(null); };
  const redo = () => { if (!future.length) return; setHist((h) => [...h, objs]); setObjs(future[0]); setFuture(future.slice(1)); setSel(null); setEditing(null); };
  const shift = (o: Obj, dx: number, dy: number): Obj => ({ ...o, x: o.x + dx, y: o.y + dy, points: o.points?.map(([px, py]) => [px + dx, py + dy] as [number, number]) });
  const duplicate = (o: Obj | undefined, dx = 12, dy = 12) => { if (!o) return; const n = { ...shift(o, dx, dy), id: uid(), link: undefined, tkey: undefined }; commit([...objs, n]); setSel(n.id); setTool('select'); };
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
  useEffect(() => { addEditorFonts(); return () => docRef.current?.destroy?.(); }, []);
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
        const special: [RegExp, string][] = [[/roboto(?!.*mono)/, 'roboto'], [/open ?sans/, 'opensans'], [/\blato/, 'lato'], [/montserrat/, 'montserrat'], [/poppins/, 'poppins'], [/\binter\b|inter-/, 'inter'], [/noto ?sans/, 'noto'], [/oswald/, 'oswald'],
          [/georgia|gelasio/, 'georgia'], [/merriweather/, 'merriweather'], [/playfair/, 'playfair'], [/source ?serif/, 'sourceserif'], [/dancing/, 'dancing'], [/caveat/, 'caveat']];
        const sp = special.find(([re]) => re.test(nm.replace(/[-_]/g, ' ')) || re.test(nm));
        const font = sp ? sp[1] : /courier|consol|mono|lucida ?console|menlo|cmtt|lmmono|inconsolata/.test(nm) ? 'mono'
          : /calibri|carlito|candara|corbel/.test(nm) ? 'calibri'
          : /cambria|caladea/.test(nm) ? 'cambria'
          : /arial|helvetica|verdana|tahoma|segoe|roboto|opensans|open ?sans|liberation ?sans|dejavu ?sans|gill|futura|gothic|trebuchet|aptos|lato|noto ?sans|source ?sans|franklin|myriad|frutiger|univers|nirmala|mangal|cmss|lmsans|sans|inter\b|montserrat|poppins/.test(nm) ? 'sans'
          : /times|georgia|garamond|antiqua|palatino|liberation ?serif|minion|bookman|schoolbook|noto ?serif|constantia|baskerville|didot|cmr|cmbx|cmti|cmsl|cmcsc|lmroman|sfrm|sfbx|sfti|nimbus ?rom|charter|utopia|stix|xits|libertine|dejavu ?serif|serif|tex/.test(nm) ? 'serif'
          : flags === 'mono' ? 'mono' : flags === 'serif' ? 'serif' : /^serif/.test(fam) ? 'serif' : 'sans';
        const italic = /italic|oblique|cmti|cmsl|sfti|-it\b|,it\b|-ital/.test(nm);
        let loaded = ''; try { loaded = pg.commonObjs.get(it.fontName)?.loadedName || ''; } catch {}
        items.push({ real: real.replace(/^\/?/, ''), fam: loaded, key: `${i}-${k}`, str: it.str.normalize('NFKC'), x: t[4], base: t[5], y: t[5] - size * 0.95, w, h: size * 1.25, size, font, italic, bold: /bold|black|heavy|semibold|demi|,bd|-bd\b|extrabold|cmbx|sfbx/i.test(real) });
      });
      setTitems((cur) => { const n = cur.slice(); n[i] = mergeLine(items); return n; });
    } catch { rendered.current.delete(i); }
  };

  // ---------- keyboard (handler is refreshed on every render so it never sees old state) ----------
  const keyFn = useRef<(e: KeyboardEvent) => void>(() => {});
  {
    keyFn.current = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) { setTool(mode === 'sign' ? 'select' : mode === 'annotate' ? 'highlight' : 'edittext'); setSel(null); return; }
      if (editing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remove(sel); }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      const so = objs.find((o) => o.id === sel);
      if (mod && k === 'd' && so) { e.preventDefault(); duplicate(so); }
      if (mod && k === 'c' && so) { clip.current = so; }
      if (mod && k === 'v' && clip.current) { e.preventDefault(); duplicate({ ...clip.current, page: so?.page ?? clip.current.page }, 16, 16); }
      if (so && e.key.startsWith('Arrow')) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        commit(objs.map((o) => (o.id === so.id ? shift(o, dx, dy) : o)));
      }
    };
  }
  useEffect(() => { const h = (e: KeyboardEvent) => keyFn.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

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
      ? { id, page, type: 'ink', x, y, w: 0, h: 0, points: [[x, y]], color: style.color, width: style.width, opacity: style.opacity }
      : tool === 'line' || tool === 'arrow'
        ? { id, page, type: 'line', arrow: tool === 'arrow', x, y, w: 0, h: 0, points: [[x, y], [x, y]], color: style.color, width: style.width, opacity: style.opacity }
        : { id, page, type: tool === 'ellipse' ? 'ellipse' : 'rect', x, y, w: 0, h: 0, fill: tool === 'whiteout' || tool === 'highlight' || ((tool === 'rect' || tool === 'ellipse') && style.fill), width: style.width,
            opacity: tool === 'highlight' ? 0.35 : tool === 'whiteout' ? 1 : style.opacity,
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
        if (o.type === 'line') {
          // hold Shift for straight lines (0°, 45°, 90°)
          let ex = x, ey = y;
          if (e.shiftKey) { const a = Math.round(Math.atan2(y - d.sy, x - d.sx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(x - d.sx, y - d.sy); ex = d.sx + L * Math.cos(a); ey = d.sy + L * Math.sin(a); }
          return { ...o, points: [[d.sx, d.sy], [ex, ey]], x: Math.min(d.sx, ex), y: Math.min(d.sy, ey), w: Math.abs(ex - d.sx), h: Math.abs(ey - d.sy) };
        }
        let w = Math.abs(x - d.sx), h = Math.abs(y - d.sy);
        if (e.shiftKey && (o.type === 'ellipse' || o.type === 'rect') && o.opacity !== 0.35) w = h = Math.max(w, h); // Shift: circle / square
        return { ...o, x: x < d.sx ? d.sx - w : d.sx, y: y < d.sy ? d.sy - h : d.sy, w, h };
      }));
    } else if (d.kind === 'move') {
      const dx = x - d.sx, dy = y - d.sy;
      setObjs((cur) => cur.map((o) => (o.id !== d.id ? o : o.type === 'ink' || o.type === 'line'
        ? { ...o, x: d.orig.x + dx, y: d.orig.y + dy, points: d.orig.points.map(([px, py]: number[]) => [px + dx, py + dy]) }
        : { ...o, x: d.orig.x + dx, y: d.orig.y + dy })));
    } else if (d.kind === 'resize') {
      setObjs((cur) => cur.map((o) => {
        if (o.id !== d.id) return o;
        let w = Math.max(8, d.orig.w + x - d.sx), h = Math.max(8, d.orig.h + y - d.sy);
        if (o.type === 'image') h = w * (d.orig.h / d.orig.w);
        if (o.type === 'text') return { ...o, size: Math.max(6, Math.round(d.orig.size * (1 + (x - d.sx) / Math.max(40, d.orig.w || 100)))) };
        if (o.type === 'line') { const [a, b] = d.orig.points; const nb: [number, number] = [b[0] + x - d.sx, b[1] + y - d.sy]; return { ...o, points: [a, nb], x: Math.min(a[0], nb[0]), y: Math.min(a[1], nb[1]), w: Math.abs(nb[0] - a[0]), h: Math.abs(nb[1] - a[1]) }; }
        return { ...o, w, h };
      }));
    }
  };

  const onPageUp = () => {
    const d = drag.current; drag.current = null;
    if (d?.kind === 'create') {
      setObjs((cur) => cur.map((o) => (o.id !== d.id ? o
        : (o.type === 'rect' || o.type === 'ellipse') && o.w < 4 && o.h < 4 ? { ...o, x: o.x - 50, y: o.y - (o.type === 'ellipse' ? 50 : 12), w: 100, h: o.type === 'ellipse' ? 100 : 24 }
        : o.type === 'line' && o.w < 3 && o.h < 3 ? { ...o, points: [o.points![0], [o.points![0][0] + 120, o.points![0][1]]], w: 120 } : o)));
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
  /** The page area behind a piece of text, drawn without any text: used to hide the old words on photos and coloured boxes. */
  const renderRegion = async (page: number, r: { x: number; y: number; w: number; h: number }, noText: boolean) => {
    const pg = await docRef.current.getPage(page + 1);
    const k = 3, w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
    const vp = pg.getViewport({ scale: k, offsetX: -r.x * k, offsetY: -r.y * k });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })! as any;
    if (noText) { ctx.fillText = () => {}; ctx.strokeText = () => {}; }
    await pg.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return { c, d: ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray };
  };
  /** Left and right end of the printed words on a scanned line (the hidden OCR text is often shorter or longer). */
  const inkSpan = (page: number, it: TItem, bgHex: string): [number, number] => {
    const c = pageEls.current[page]?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c || !c.width) return [it.x, it.x + it.w];
    const k = c.width / pages[page].w, ctx = c.getContext('2d', { willReadFrequently: true })!;
    const y0 = Math.max(0, Math.round((it.base - it.size * 0.75) * k)), y1 = Math.min(c.height - 1, Math.round((it.base + it.size * 0.2) * k));
    const x0 = Math.max(0, Math.round((it.x - it.size * 3) * k)), x1 = Math.min(c.width - 1, Math.round((it.x + it.w + it.size * 8) * k));
    if (x1 <= x0 || y1 <= y0) return [it.x, it.x + it.w];
    const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data, W = x1 - x0 + 1, H = y1 - y0 + 1;
    const B = [1, 3, 5].map((o) => parseInt(bgHex.slice(o, o + 2), 16));
    const ink = (col: number) => { for (let r = 0; r < H; r++) { const q = (r * W + col) * 4; if (Math.abs(d[q] - B[0]) + Math.abs(d[q + 1] - B[1]) + Math.abs(d[q + 2] - B[2]) > 90) return true; } return false; };
    const gap = Math.max(3, it.size * 0.9 * k);
    const sL = Math.round((it.x * k) - x0), sR = Math.round(((it.x + it.w) * k) - x0);
    let L = sL, R = sR;
    for (let col = sR, blank = 0; col < W; col++) { if (ink(col)) { R = col; blank = 0; } else if (++blank > gap) break; }
    for (let col = sL, blank = 0; col >= 0; col--) { if (ink(col)) { L = col; blank = 0; } else if (++blank > gap) break; }
    return [(L + x0) / k, (R + 1 + x0) / k];
  };
  /** Text that is not drawn at all (the hidden text layer of scanned, OCR'd PDFs): hiding it changes nothing on the page. */
  const isInvisible = async (page: number, it: TItem) => {
    if (/glyphless|invisible/i.test(it.real ?? '')) return true;
    try {
      const r = { x: it.x, y: it.y, w: it.w, h: it.h };
      const [a, b] = await Promise.all([renderRegion(page, r, false), renderRegion(page, r, true)]);
      let diff = 0; for (let q = 0; q < a.d.length; q += 4) diff += Math.abs(a.d[q] - b.d[q]) + Math.abs(a.d[q + 1] - b.d[q + 1]) + Math.abs(a.d[q + 2] - b.d[q + 2]);
      return diff / (a.d.length / 4) < 2;
    } catch { return false; }
  };
  const cleanPatch = async (page: number, r: { x: number; y: number; w: number; h: number }): Promise<string | null> => {
    try {
      const { c, d } = await renderRegion(page, r, true);
      let mn = [255, 255, 255], mx = [0, 0, 0];
      for (let q = 0; q < d.length; q += 16) for (let ch = 0; ch < 3; ch++) { mn[ch] = Math.min(mn[ch], d[q + ch]); mx[ch] = Math.max(mx[ch], d[q + ch]); }
      if (mx.every((v, ch) => v - mn[ch] < 14)) return null; // plain background: a filled box is enough
      return c.toDataURL('image/png');
    } catch { return null; }
  };
  const editItem = async (e: PointerEvent, page: number, it: TItem) => {
    e.stopPropagation(); e.preventDefault();
    clickPt.current = { x: e.clientX, y: e.clientY };
    const { bg, fg } = sample(page, it);
    const hidden = await isInvisible(page, it);
    if (!it.bold && !hidden) { const r = await stemRatio(page, it, bg); (window as any).__stem = r; if (r > 0.125) it = { ...it, bold: true }; }
    const wid = uid(), tid = uid();
    let white: Obj = { id: wid, page, type: 'rect', x: it.x - 1, y: it.y - it.size * 0.05, w: it.w + 2, h: it.h, fill: true, opacity: 1, color: bg, tkey: it.key };
    if (hidden) {
      // scanned page: the words are part of the picture. Cover them with the paper colour (a little larger, OCR boxes are approximate)
      const padY = it.size * 0.18, padX = it.size * 0.2;
      const [l, r] = inkSpan(page, it, bg);
      white = { ...white, x: l - padX, y: it.y - padY, w: r - l + padX * 2, h: it.h + padY * 1.2 };
      it = { ...it, real: undefined };
    } else {
      const patch = await cleanPatch(page, white);
      if (patch) white = { ...white, type: 'image', src: patch, kind: 'png', fill: undefined };
    }
    const text: Obj = { id: tid, page, type: 'text', x: it.x, y: it.base - 0.92 * it.size, w: 0, h: 0, text: it.str, size: Math.round(it.size * 10) / 10, font: it.font, bold: it.bold, italic: it.italic, color: fg, link: wid, tkey: it.key,
      orig: it.real || undefined, origStyle: `${it.font}|${it.bold}|${!!it.italic}|${Math.round(it.size * 10) / 10}`, fitW: it.w, ffam: it.fam || undefined };
    // match the original width: letter-spaced text gets character spacing, other text is squeezed/stretched slightly
    const ctx = (measureCv.current ??= document.createElement('canvas')).getContext('2d')!;
    ctx.font = `${it.italic ? 'italic ' : ''}${it.bold ? 700 : 400} ${it.size}px ${css(it.font)}`;
    try { await document.fonts.load(ctx.font, it.str); } catch { /* measure with fallback */ }
    const parts = it.str.split('  ');
    if (parts.every((x) => /^(\S )+\S$/.test(x))) {
      text.text = parts.map((x) => x.replace(/ /g, '')).join(' '); text.fitText = text.text;
      const nat = ctx.measureText(text.text).width;
      text.cs = Math.max(0, (it.w - nat) / text.text.length);
    } else {
      text.fitText = it.str;
      const nat = ctx.measureText(it.str).width, r = nat ? it.w / nat : 1;
      if (Math.abs(r - 1) > 0.03 && r > 0.6 && r < 1.25) text.hs = Math.round(r * 1000) / 1000;
    }
    commit([...objs, white, text]); setSel(tid); setEditing(tid);
  };
  const edited = new Set(objs.filter((o) => o.tkey).map((o) => o.tkey));

  // ---------- images & signatures ----------
  const visiblePage = () => {
    const sr = scroller.current?.getBoundingClientRect();
    const mid = sr ? (sr.top + sr.bottom) / 2 : window.innerHeight / 2; let best = 0, bestD = Infinity;
    pageEls.current.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };
  const placeImage = (src: string, kind: 'png' | 'jpg', iw: number, ih: number, widthFrac = 0.3) => {
    const page = visiblePage(), p = pages[page];
    const w = p.w * widthFrac, h = (w * ih) / iw;
    const o: Obj = { id: uid(), page, type: 'image', x: (p.w - w) / 2, y: Math.max(0, (p.h - h) / 2), w, h, src, kind, color: '#000' };
    commit([...objs, o]); setSel(o.id); setTool('select');
  };
  const addStamp = (t: string) => {
    const page = visiblePage(), p = pages[page]; const size = t.length > 2 ? Math.max(10, style.size) : Math.max(16, style.size * 1.4);
    const o: Obj = { id: uid(), page, type: 'text', x: p.w / 2 - size, y: p.h / 3, w: 0, h: 0, text: t, size, font: style.font, bold: t.length <= 2, italic: false, color: t === '✗' ? '#dc2626' : t === '✓' ? '#16a34a' : style.color, opacity: 1 };
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
      const items: any[] = []; const transfer: ArrayBuffer[] = []; const need = new Set<string>(); void transfer;
      for (const o of objs) {
        const rot = pages[o.page].rot;
        if (o.type === 'text') {
          const text = (textRef.current[o.id] ?? o.text ?? '');
          if (!text.trim()) continue;
          const lines = text.split('\n').map((t, i) => { const [x, y] = conv(o.page, o.x, o.y + (i * 1.2 + 0.92) * o.size!); return { text: t, x, y }; });
          const file = fontFile(o.font, o.bold, o.italic); need.add(file); if (needsSym(text)) need.add(SYM);
          // keep the PDF's own font while the user has not changed font, style or size
          const same = o.orig && o.origStyle === `${o.font}|${!!o.bold}|${!!o.italic}|${o.size}` && (o.opacity ?? 1) === 1;
          items.push({ type: 'text', page: o.page, lines, size: o.size, color: o.color, file, sym: SYM, rot, hs: o.hs, cs: o.cs, opacity: o.opacity ?? 1,
            ...(same ? { orig: o.orig, fitW: o.fitW, fitText: o.fitText } : {}) });
        } else if (o.type === 'rect' || o.type === 'ellipse') {
          const [x1, y1] = conv(o.page, o.x, o.y), [x2, y2] = conv(o.page, o.x + o.w, o.y + o.h);
          items.push({ type: o.type, page: o.page, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: o.color, fill: o.fill, opacity: o.opacity ?? 1, width: o.width });
        } else if (o.type === 'line') {
          const [a, b] = o.points!; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) continue;
          items.push({ type: 'line', page: o.page, a: conv(o.page, a[0], a[1]), b: conv(o.page, b[0], b[1]), arrow: o.arrow, color: o.color, width: o.width, opacity: o.opacity ?? 1 });
        } else if (o.type === 'ink') {
          if (o.points!.length < 2) continue;
          items.push({ type: 'ink', page: o.page, points: o.points!.map(([x, y]) => conv(o.page, x, y)), color: o.color, width: o.width, opacity: o.opacity ?? 1 });
        } else if (o.type === 'image') {
          const bytes = await (await fetch(o.src!)).arrayBuffer();
          const [x, y] = conv(o.page, o.x, o.y + o.h);
          items.push({ type: 'image', page: o.page, key: o.id, bytes, kind: o.kind, x, y, w: o.w, h: o.h, rot, opacity: o.opacity ?? 1 }); transfer.push(bytes);
        }
      }
      let buf = await file.arrayBuffer();
      const fonts: Record<string, ArrayBuffer> = {};
      for (const f of need) fonts[f] = await (await fetch(`/fonts/${f}`)).arrayBuffer();
      const job = (b: ArrayBuffer) => runPdfJob<{ files: Uint8Array[] }>({ op: 'annotate', file: b, items: structuredClone(items), fonts }, [], setBusy);
      let r;
      try { r = await job(buf.slice(0)); }
      catch (e: any) {
        // PDFs locked only against editing open without a password: remove the lock, then save
        if (!/encrypt|password/i.test(String(e?.message))) throw e;
        const d = await runPdfJob<{ files: Uint8Array[] }>({ op: 'decrypt', file: buf, password: '' }, [], undefined, 'qpdf');
        buf = d.files[0].slice().buffer; r = await job(buf);
      }
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
      if (p.width && (selObj.type === 'ink' || selObj.type === 'rect' || selObj.type === 'ellipse' || selObj.type === 'line')) q.width = p.width;
      if (p.opacity !== undefined && !(selObj.type === 'rect' && (selObj.color === '#ffffff' || selObj.opacity === 0.35))) q.opacity = p.opacity;
      if (p.fill !== undefined && (selObj.type === 'rect' || selObj.type === 'ellipse')) q.fill = p.fill;
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
            <button type="button" class="ed-btn tint" style={tint(COL[t])} title={label} aria-pressed={tool === t} onClick={() => { setTool(t); setEditing(null); }}>
              <Icon name={t} /><span class="ed-label">{SHORT[t]}</span>
            </button>
          </>))}
          <span class="ed-sep" />
          <button type="button" class="ed-btn tint" style={tint('#7c3aed')} title="Add signature" onClick={() => setSigOpen(true)}><Icon name="sign" /><span class="ed-label">Sign</span></button>
          <button type="button" class="ed-btn tint" style={tint('#ea580c')} title="Add image" onClick={() => imgInput.current?.click()}><Icon name="image" /><span class="ed-label">Image</span></button>
          <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { addImageFile((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
          <span class="ed-stamps" role="group" aria-label="Quick marks">
            {[['✓', 'Tick'], ['✗', 'Cross'], ['●', 'Dot'], ['date', 'Today\u2019s date']].map(([t, l]) => (
              <button type="button" class="ed-btn ed-sq tint" style={tint(t === '✓' ? '#16a34a' : t === '✗' ? '#dc2626' : t === 'date' ? '#0284c7' : '#334155')} title={`Add ${l}`} aria-label={`Add ${l}`} onClick={() => addStamp(t === 'date' ? new Date().toLocaleDateString('en-GB') : t)}>{t === 'date' ? <span style={{ fontSize: '.72rem', fontWeight: 800 }}>DATE</span> : <span style={{ fontSize: '1.05rem' }}>{t}</span>}</button>
            ))}
          </span>
          <span class="ed-sep" />
          <button type="button" class="ed-btn tint" style={tint('#475569')} title="Select & move items" aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setEditing(null); }}><Icon name="select" /><span class="ed-label">Move</span></button>
          <span style={{ flex: 1 }} />
          <button type="button" class="btn btn-primary" style={{ padding: '9px 18px' }} disabled={!!busy} onClick={save}>Save PDF</button>
        </div>
        <div class="ed-row ed-format">
          <label class="ed-field" title="Colour"><input type="color" aria-label="Colour" value={selObj && selObj.type !== 'image' && !(selObj.type === 'rect' && selObj.fill) ? selObj.color : style.color} onInput={(e) => setStyleAndSel({ color: (e.target as HTMLInputElement).value })} /></label>
          <select class="ed-select" aria-label="Font" value={fkey(selObj?.type === 'text' ? selObj.font : style.font)} onChange={(e) => setStyleAndSel({ font: (e.target as HTMLSelectElement).value })}>
            {['Standard', 'Sans serif', 'Serif', 'Handwriting'].map((g) => (
              <optgroup label={g}>{FONTS.filter((f) => f[4] === g).map(([v, l, fam]) => <option value={v} style={{ fontFamily: `"${fam}"` }}>{l}</option>)}</optgroup>
            ))}
          </select>
          <select class="ed-select" aria-label="Text size" value={String(curSize)} onChange={(e) => setStyleAndSel({ size: +(e.target as HTMLSelectElement).value })}>
            {sizes.map((v) => <option value={String(v)}>{v} pt</option>)}
          </select>
          <button type="button" class="ed-btn ed-sq" aria-label="Bold" title="Bold" aria-pressed={selObj?.type === 'text' ? !!selObj.bold : style.bold} onClick={() => setStyleAndSel({ bold: !(selObj?.type === 'text' ? selObj.bold : style.bold) })}><b>B</b></button>
          <button type="button" class="ed-btn ed-sq" aria-label="Italic" title="Italic" aria-pressed={selObj?.type === 'text' ? !!selObj.italic : style.italic} onClick={() => setStyleAndSel({ italic: !(selObj?.type === 'text' ? selObj.italic : style.italic) })}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></button>
          <span class="ed-sep" />
          <select class="ed-select" aria-label="Line width" title="Line width for shapes and drawing" value={selObj && 'width' in selObj && selObj.width ? selObj.width : style.width} onChange={(e) => setStyleAndSel({ width: +(e.target as HTMLSelectElement).value })}>
            {[1, 2, 3, 5, 8, 12].map((w) => <option value={w}>Line {w}px</option>)}
          </select>
          <button type="button" class="ed-btn ed-sq" title="Fill the shape" aria-label="Fill shape" aria-pressed={selObj && (selObj.type === 'rect' || selObj.type === 'ellipse') ? !!selObj.fill : style.fill} onClick={() => setStyleAndSel({ fill: !(selObj && (selObj.type === 'rect' || selObj.type === 'ellipse') ? selObj.fill : style.fill) })}>
            <svg width="18" height="18" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" opacity=".85" /></svg></button>
          <label class="ed-field ed-op" title="Opacity">Opacity <input type="range" min={10} max={100} step={5} aria-label="Opacity" value={Math.round(((selObj?.opacity ?? style.opacity) || 1) * 100)} onInput={(e) => setStyleAndSel({ opacity: +(e.target as HTMLInputElement).value / 100 })} /></label>
          <span style={{ flex: 1 }} />
          <button type="button" class="ed-btn tint" style={tint('#6366f1')} title="Undo (Ctrl+Z)" disabled={!hist.length} onClick={undo}><Icon name="undo" /><span class="ed-label">Undo</span></button>
          <button type="button" class="ed-btn tint" style={tint('#6366f1')} title="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}><Icon name="redo" /><span class="ed-label">Redo</span></button>
          <button type="button" class="ed-btn tint" style={tint('#0d9488')} title="Duplicate selected (Ctrl+D)" disabled={!sel} onClick={() => duplicate(selObj)}><Icon name="copy" /><span class="ed-label">Copy</span></button>
          <button type="button" class="ed-btn tint" style={tint('#dc2626')} title="Delete selected (Del)" disabled={!sel} onClick={() => sel && remove(sel)}><Icon name="trash" /><span class="ed-label">Delete</span></button>
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

      <div class="ed-main">
      {pages.length > 1 && <Thumbs doc={docRef.current} pages={pages} cur={curPage} onPick={(i) => pageEls.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />}
      <div ref={scroller} onScroll={() => setCurPage(visiblePage())} style={{ flex: 1, minWidth: 0, height: '78vh', overflow: 'auto', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
      <div style={{ display: 'grid', gap: '18px', margin: '0 auto', width: `min(${900 * zoom}px, ${100 * zoom}%)` }}>
        {pages.map((p, i) => {
          const s = scales[i] || 1;
          return (
            <div key={i} data-page={i} ref={(el) => (pageEls.current[i] = el)}
              style={{ position: 'relative', width: '100%', aspectRatio: `${p.w} / ${p.h}`, background: '#fff', boxShadow: 'var(--shadow)', border: '1px solid var(--border)', touchAction: tool === 'select' || tool === 'edittext' ? 'auto' : 'none', cursor: tool === 'select' || tool === 'edittext' ? 'default' : tool === 'text' ? 'text' : 'crosshair', userSelect: 'none', overflow: 'hidden' }}
              onPointerDown={(e) => onPageDown(e, i)} onPointerMove={(e) => onPageMove(e, i)} onPointerUp={onPageUp} onPointerCancel={onPageUp}>
              <canvas style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label={`Page ${i + 1}`} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${p.w} ${p.h}`}>
                {objs.filter((o) => o.page === i && (o.type === 'ink' || o.type === 'line')).map((o) => {
                  const pts = o.points!; const [a, b] = [pts[0], pts[pts.length - 1]];
                  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.max(8, (o.width ?? 2) * 4);
                  const head = o.arrow ? `${b[0]},${b[1]} ${b[0] - L * Math.cos(ang - 0.45)},${b[1] - L * Math.sin(ang - 0.45)} ${b[0] - L * Math.cos(ang + 0.45)},${b[1] - L * Math.sin(ang + 0.45)}` : '';
                  return (
                    <g opacity={o.opacity ?? 1} style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: 'move' }} onPointerDown={(e: any) => onObjDown(e, o, 'move')}>
                      <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke="transparent" stroke-width={Math.max(12, (o.width ?? 2) + 10)} style={{ pointerEvents: 'stroke' }} />
                      <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={o.color} stroke-width={o.width} stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={sel === o.id && o.type === 'ink' ? '4 3' : undefined} />
                      {head && <polygon points={head} fill={o.color} />}
                      {sel === o.id && o.type === 'line' && <circle cx={b[0]} cy={b[1]} r="6" fill="var(--brand)" stroke="#fff" stroke-width="2" style={{ pointerEvents: 'auto', cursor: 'crosshair' }} onPointerDown={(e: any) => { e.stopPropagation(); onObjDown(e, o, 'resize'); }} />}
                    </g>
                  );
                })}
              </svg>
              {tool === 'edittext' && (titems[i] || []).filter((t) => !edited.has(t.key)).map((t) => (
                <div class="ti" title="Click to edit" data-text={t.str} onPointerDown={(e) => editItem(e as any, i, t)}
                  style={{ position: 'absolute', left: (t.x / p.w) * 100 + '%', top: (t.y / p.h) * 100 + '%', width: (t.w / p.w) * 100 + '%', height: (t.h / p.h) * 100 + '%', cursor: 'text', zIndex: 2 }} />
              ))}
              {objs.filter((o) => o.page === i && o.type !== 'ink' && o.type !== 'line').map((o) => {
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
                        style={{ font: `${o.italic ? 'italic ' : ''}${o.bold ? 700 : 400} ${o.size! * s}px/1.2 ${css(o.font)}`, letterSpacing: o.cs ? o.cs * s + 'px' : undefined, transform: o.hs ? `scaleX(${o.hs})` : undefined, transformOrigin: 'left top', color: o.color, opacity: o.opacity ?? 1, whiteSpace: 'pre', minWidth: '1ch', minHeight: o.size! * 1.2 * s + 'px', outline: 'none', background: isEdit ? 'rgb(79 70 229 / .06)' : 'transparent' }}
                        dangerouslySetInnerHTML={{ __html: (o.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') }} />
                    )}
                    {(o.type === 'rect' || o.type === 'ellipse') && <div style={{ width: '100%', height: '100%', borderRadius: o.type === 'ellipse' ? '50%' : 0, background: o.fill ? o.color : 'transparent', opacity: o.opacity, border: o.fill ? (o.color === '#ffffff' && isSel ? '1px solid #ddd' : 'none') : `${(o.width ?? 2) * s}px solid ${o.color}`, mixBlendMode: o.opacity === 0.35 ? 'multiply' : 'normal', boxSizing: 'border-box' }} />}
                    {o.type === 'image' && <img src={o.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', opacity: o.opacity ?? 1 }} />}
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
      </div>
      <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={save}>Save PDF</button></div>
      {sigOpen && <SignaturePad onClose={() => setSigOpen(false)} onDone={(src, w, h) => { setSigOpen(false); placeImage(src, 'png', w, h, 0.25); }} />}
    </div>
  );
}

/** Page thumbnails: click one to jump to that page. */
function Thumbs({ doc, pages, cur, onPick }: { doc: any; pages: PageInfo[]; cur: number; onPick: (i: number) => void }) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    if (!doc) return;
    let dead = false;
    const io = new IntersectionObserver((en) => en.forEach(async (e) => {
      if (!e.isIntersecting) return; const c = e.target as HTMLCanvasElement; io.unobserve(c);
      const i = Number(c.dataset.i); const pg = await doc.getPage(i + 1); if (dead) return;
      const vp = pg.getViewport({ scale: 200 / pages[i].w }); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise.catch(() => 0);
    }), { rootMargin: '300px' });
    refs.current.forEach((c) => c && io.observe(c));
    return () => { dead = true; io.disconnect(); };
  }, [doc, pages]);
  useEffect(() => { refs.current[cur]?.parentElement?.scrollIntoView({ block: 'nearest' }); }, [cur]);
  return (
    <div class="ed-thumbs" aria-label="Pages">
      {pages.map((p, i) => (
        <button type="button" class={i === cur ? 'on' : ''} aria-label={`Go to page ${i + 1}`} onClick={() => onPick(i)}>
          <canvas data-i={i} ref={(el) => (refs.current[i] = el)} style={{ aspectRatio: `${p.w} / ${p.h}` }} /><span>{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
