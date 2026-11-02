// DOM → PDF: draws laid-out HTML pages into a PDF as real vector text (searchable), with
// backgrounds, borders and images in their exact positions. Used for Word/Excel/HTML conversions.
import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, setCharacterSqueeze, rectangle, clip, endPath, type PDFFont, type PDFPage } from 'pdf-lib';

// Metric-compatible open fonts (same widths as the Microsoft fonts they replace)
const FILES: Record<string, string> = {
  carlito: 'Carlito', caladea: 'Caladea', sans: 'LiberationSans', serif: 'LiberationSerif', mono: 'LiberationMono',
};
const FACES = `
@font-face{font-family:"Calibri";src:local("Calibri"),url(/fonts/Carlito-Regular.ttf);}
@font-face{font-family:"Calibri";font-weight:700;src:local("Calibri Bold"),url(/fonts/Carlito-Bold.ttf);}
@font-face{font-family:"Calibri";font-style:italic;src:local("Calibri Italic"),url(/fonts/Carlito-Italic.ttf);}
@font-face{font-family:"Calibri";font-weight:700;font-style:italic;src:local("Calibri Bold Italic"),url(/fonts/Carlito-BoldItalic.ttf);}
@font-face{font-family:"Cambria";src:local("Cambria"),url(/fonts/Caladea-Regular.ttf);}
@font-face{font-family:"Cambria";font-weight:700;src:local("Cambria Bold"),url(/fonts/Caladea-Bold.ttf);}
@font-face{font-family:"Cambria";font-style:italic;src:local("Cambria Italic"),url(/fonts/Caladea-Italic.ttf);}
@font-face{font-family:"Cambria";font-weight:700;font-style:italic;src:local("Cambria Bold Italic"),url(/fonts/Caladea-BoldItalic.ttf);}
@font-face{font-family:"Arial";src:local("Arial"),url(/fonts/LiberationSans-Regular.ttf);}
@font-face{font-family:"Arial";font-weight:700;src:local("Arial Bold"),url(/fonts/LiberationSans-Bold.ttf);}
@font-face{font-family:"Arial";font-style:italic;src:local("Arial Italic"),url(/fonts/LiberationSans-Italic.ttf);}
@font-face{font-family:"Arial";font-weight:700;font-style:italic;src:local("Arial Bold Italic"),url(/fonts/LiberationSans-BoldItalic.ttf);}
@font-face{font-family:"Times New Roman";src:local("Times New Roman"),url(/fonts/LiberationSerif-Regular.ttf);}
@font-face{font-family:"Times New Roman";font-weight:700;src:local("Times New Roman Bold"),url(/fonts/LiberationSerif-Bold.ttf);}
@font-face{font-family:"Times New Roman";font-style:italic;src:local("Times New Roman Italic"),url(/fonts/LiberationSerif-Italic.ttf);}
@font-face{font-family:"Times New Roman";font-weight:700;font-style:italic;src:local("Times New Roman Bold Italic"),url(/fonts/LiberationSerif-BoldItalic.ttf);}
@font-face{font-family:"Courier New";src:local("Courier New"),url(/fonts/LiberationMono-Regular.ttf);}
@font-face{font-family:"Courier New";font-weight:700;src:local("Courier New Bold"),url(/fonts/LiberationMono-Bold.ttf);}
`;
// Fonts Word uses that are not freely available: lay them out with the nearest metric-compatible font
const ALIASES = [['Aptos', 'LiberationSans'], ['Aptos Display', 'LiberationSans'], ['Segoe UI', 'LiberationSans'], ['Helvetica', 'LiberationSans'], ['Verdana', 'LiberationSans'], ['Tahoma', 'LiberationSans'], ['Georgia', 'LiberationSerif'], ['Garamond', 'LiberationSerif'], ['Book Antiqua', 'LiberationSerif'], ['Palatino Linotype', 'LiberationSerif'], ['Consolas', 'LiberationMono']]
  .map(([n, f]) => `@font-face{font-family:"${n}";src:local("${n}"),url(/fonts/${f}-Regular.ttf);}@font-face{font-family:"${n}";font-weight:700;src:local("${n} Bold"),url(/fonts/${f}-Bold.ttf);}`).join('');
let facesAdded = false;
export function addFontFaces(d: Document = document) {
  if (d === document) { if (facesAdded) return; facesAdded = true; }
  const st = d.createElement('style'); st.textContent = (FACES + ALIASES).replace(/url\(\/fonts\//g, `url(${location.origin}/fonts/`); d.head.appendChild(st);
}

/** Which embedded font family to use for a CSS font-family list. */
function pickFamily(css: string): keyof typeof FILES {
  const f = css.toLowerCase();
  const first = f.split(',')[0].replace(/["']/g, '').trim();
  if (/calibri|carlito|candara|corbel/.test(first)) return 'carlito';
  if (/cambria|caladea/.test(first)) return 'caladea';
  if (/courier|mono|consolas|lucida console/.test(first)) return 'mono';
  if (/times|georgia|garamond|book antiqua|palatino|serif|minion|constantia|century schoolbook|bookman/.test(first) && !/sans/.test(first)) return 'serif';
  return 'sans';
}

const COMPLEX = /[֐-ࣿऀ-෿฀-࿿က-႟぀-鿿가-힯יִ-﷿ﹰ-﻿]|\p{Extended_Pictographic}/u;

function parseColor(c: string): { r: number; g: number; b: number; a: number } | null {
  const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const a = p.length > 3 ? p[3] : 1;
  if (a === 0) return null;
  return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a };
}

/** Turn CSS ::before bullets/numbers (counters) into real text so they can be drawn. */
export function materializePseudo(root: HTMLElement) {
  const d = root.ownerDocument, getComputedStyle = (e: Element, p?: string) => d.defaultView!.getComputedStyle(e, p);
  const counters = new Map<string, number>();
  const fmt = (n: number, style: string) => {
    const s = style.trim();
    if (s === 'lower-alpha' || s === 'lower-latin') return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    if (s === 'upper-alpha' || s === 'upper-latin') return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    if (s === 'lower-roman' || s === 'upper-roman') { const R: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let x = n, o = ''; for (const [v, t] of R) while (x >= v) { o += t; x -= v; } return s === 'upper-roman' ? o.toUpperCase() : o; }
    if (s === 'decimal-leading-zero') return String(n).padStart(2, '0');
    if (s === 'disc') return '•'; if (s === 'circle') return '◦'; if (s === 'square') return '▪';
    return String(n);
  };
  const apply = (list: string, reset: boolean) => {
    if (!list || list === 'none') return;
    const parts = list.trim().split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]; const num = /^-?\d+$/.test(parts[i + 1] ?? '') ? +parts[++i] : reset ? 0 : 1;
      counters.set(name, reset ? num : (counters.get(name) ?? 0) + num);
    }
  };
  const evalContent = (content: string) => {
    let out = ''; const re = /"((?:[^"\\]|\\.)*)"|counter\(\s*([^,)\s]+)\s*(?:,\s*([^)]+))?\)/g; let m;
    while ((m = re.exec(content))) {
      if (m[1] !== undefined) out += m[1].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
      else out += fmt(counters.get(m[2]) ?? 0, m[3] ?? 'decimal');
    }
    return out;
  };
  const els = Array.from(root.querySelectorAll<HTMLElement>('*'));
  const fixes: [HTMLElement, string, CSSStyleDeclaration][] = [];
  for (const el of els) {
    const cs = getComputedStyle(el);
    apply(cs.counterReset, true); apply((cs as any).counterSet, true); apply(cs.counterIncrement, false);
    const b = getComputedStyle(el, '::before');
    if (b.content && b.content !== 'none' && b.content !== 'normal') {
      apply(b.counterReset, true); apply(b.counterIncrement, false);
      const text = evalContent(b.content);
      if (text) fixes.push([el, text, b]);
    }
  }
  for (const [el, text, b] of fixes) {
    const sp = d.createElement('span');
    const copy = ['display', 'width', 'min-width', 'padding-left', 'padding-right', 'margin-left', 'margin-right', 'font-family', 'font-size', 'font-weight', 'font-style', 'color', 'text-indent', 'vertical-align', 'position', 'left', 'top', 'text-align', 'white-space'];
    sp.style.cssText = copy.map((k) => `${k}:${b.getPropertyValue(k)}`).join(';');
    sp.textContent = text.replace(/\t/g, '    ');
    sp.dataset.pseudo = '1';
    el.classList.add('z-nobefore');
    el.insertBefore(sp, el.firstChild);
  }
  const st = d.createElement('style'); st.textContent = '.z-nobefore::before{content:none!important}'; root.appendChild(st);
}

type Ink = (pg: PDFPage, oy: number) => Promise<void> | void;

export type PageBox = { el: HTMLElement; /** rect of the page in CSS px */ rect: DOMRect };

/** Draw a list of page elements into a new PDF (one PDF page per element; tall elements are split). */
export async function pagesToPdf(pages: HTMLElement[], onProgress?: (d: number, t: number) => void, opts: { pageHeightPx?: (el: HTMLElement) => number; marginTopPx?: number; marginBottomPx?: number; pageWidthPx?: (el: HTMLElement) => number } = {}): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const fontkit = (await import('@pdf-lib/fontkit')).default; doc.registerFontkit(fontkit);
  const fontCache = new Map<string, Promise<{ pdf: PDFFont; fk: any }>>();
  const getFont = (fam: keyof typeof FILES, bold: boolean, italic: boolean) => {
    const variant = fam === 'mono' ? (bold ? 'Bold' : 'Regular') : bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    const key = FILES[fam] + '-' + variant;
    if (!fontCache.has(key)) fontCache.set(key, (async () => {
      const buf = await (await fetch(`/fonts/${key}.ttf`)).arrayBuffer();
      return { pdf: await doc.embedFont(buf, { subset: false }), fk: fontkit.create(new Uint8Array(buf)) };
    })());
    return fontCache.get(key)!;
  };
  const imgCache = new Map<string, any>();
  const PX = 0.75; // CSS px → pt

  for (let pi = 0; pi < pages.length; pi++) {
    onProgress?.(pi, pages.length);
    const pageEl = pages[pi];
    const dd = pageEl.ownerDocument, getComputedStyle = (e: Element) => dd.defaultView!.getComputedStyle(e);
    const pr = pageEl.getBoundingClientRect();
    const fullH = opts.pageHeightPx?.(pageEl) ?? pr.height;
    const W = (opts.pageWidthPx?.(pageEl) ?? pr.width) * PX, H = fullH * PX;
    const mT = opts.marginTopPx ?? fullH * 0.06, mB = opts.marginBottomPx ?? fullH * 0.06;
    // Collect drawing operations with their vertical extent (CSS px relative to page top)
    type Op = { y0: number; y1: number; draw: Ink; line?: boolean };
    const ops: Op[] = [];
    const rel = (r: DOMRect) => ({ x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height });

    // 1) backgrounds & borders
    const all = [pageEl, ...Array.from(pageEl.querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      const tag = el.tagName.toUpperCase();
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'SVG') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = rel(el.getBoundingClientRect()); if (r.w <= 0 || r.h <= 0) continue;
      const bg = el === pageEl ? null : parseColor(cs.backgroundColor);
      if (el.dataset?.keep) ops.push({ y0: r.y + 1, y1: r.y + r.h - 1, line: true, draw: () => {} });
      if (bg && !(bg.r === 1 && bg.g === 1 && bg.b === 1 && el.tagName === 'SECTION')) ops.push({ y0: r.y, y1: r.y + r.h, draw: (pg, oy) => pg.drawRectangle({ x: r.x * PX, y: H - (r.y - oy + r.h) * PX, width: r.w * PX, height: r.h * PX, color: rgb(bg.r, bg.g, bg.b), opacity: bg.a }) });
      const sides: ['Top' | 'Right' | 'Bottom' | 'Left', number, number, number, number][] = [
        ['Top', r.x, r.y, r.w, 0], ['Bottom', r.x, r.y + r.h, r.w, 0], ['Left', r.x, r.y, 0, r.h], ['Right', r.x + r.w, r.y, 0, r.h]];
      for (const [side, x, y, w, h] of sides) {
        const bw = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)); const bs = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
        if (!bw || bs === 'none' || bs === 'hidden') continue;
        const c = parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)); if (!c) continue;
        const t = bw * ((el as any).currentCSSZoom ?? 1);
        const rx = side === 'Right' ? x - t : x, ry = side === 'Bottom' ? y - t : y;
        ops.push({ y0: ry, y1: ry + (h || t), line: true, draw: (pg, oy) => pg.drawRectangle({ x: rx * PX, y: H - (ry - oy + (h || t)) * PX, width: (w || t) * PX, height: (h || t) * PX, color: rgb(c.r, c.g, c.b), opacity: c.a }) });
      }
      // 2) images
      if (tag === 'IMG' && (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth) {
        const im = el as HTMLImageElement;
        const src = im.currentSrc || im.src;
        ops.push({ y0: r.y, y1: r.y + r.h, draw: async (pg, oy) => {
          let img = imgCache.get(src);
          if (!img) {
            try {
              const c = document.createElement('canvas'); const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
              c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
              const cx = c.getContext('2d')!; cx.drawImage(im, 0, 0, c.width, c.height);
              const png = /png|gif|svg/i.test(src.slice(0, 40));
              const bytes = await new Promise<ArrayBuffer>((res) => c.toBlob((b) => b!.arrayBuffer().then(res), png ? 'image/png' : 'image/jpeg', 0.9));
              img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
            } catch { img = null; }
            imgCache.set(src, img);
          }
          if (img) pg.drawImage(img, { x: r.x * PX, y: H - (r.y - oy + r.h) * PX, width: r.w * PX, height: r.h * PX });
        } });
      }
      if (tag === 'SVG' || tag === 'CANVAS') {
        const node = el as any;
        ops.push({ y0: r.y, y1: r.y + r.h, draw: async (pg, oy) => {
          try {
            let c: HTMLCanvasElement;
            if (tag === 'CANVAS') c = node;
            else {
              const xml = new XMLSerializer().serializeToString(node); const im = new Image();
              im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await im.decode();
              c = document.createElement('canvas'); c.width = Math.ceil(r.w * 2); c.height = Math.ceil(r.h * 2); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
            }
            const png = await doc.embedPng(await new Promise<ArrayBuffer>((res) => c.toBlob((b) => b!.arrayBuffer().then(res), 'image/png')));
            pg.drawImage(png, { x: r.x * PX, y: H - (r.y - oy + r.h) * PX, width: r.w * PX, height: r.h * PX });
          } catch { /* skip */ }
        } });
      }
    }

    // 3) text, word by word, with the same font metrics as the browser layout
    const walker = dd.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
    const range = dd.createRange();
    let tn: Node | null;
    while ((tn = walker.nextNode())) {
      const text = tn.textContent ?? ''; if (!text.trim()) continue;
      const parent = tn.parentElement!; const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const color = parseColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
      const size = parseFloat(cs.fontSize) * ((parent as any).currentCSSZoom ?? 1); // CSS zoom shrinks the layout, not the computed size
      const bold = parseInt(cs.fontWeight) >= 600 || cs.fontWeight === 'bold';
      const italic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
      const fam = pickFamily(cs.fontFamily);
      const deco = cs.textDecorationLine || '';
      // cells that hide overflowing text: clip to the cell box
      const clipEl = parent.closest('td,th,[data-clip]') as HTMLElement | null;
      const clipR = clipEl && getComputedStyle(clipEl).overflow !== 'visible' ? rel(clipEl.getBoundingClientRect()) : null;
      const re = /\S+/g; let m;
      while ((m = re.exec(text))) {
        const word = m[0];
        range.setStart(tn, m.index); range.setEnd(tn, m.index + word.length);
        const rects = Array.from(range.getClientRects()).filter((q) => q.width > 0);
        if (!rects.length) continue;
        // a word split over two lines (rare): draw per character
        const pieces: { s: string; r: DOMRect }[] = [];
        if (rects.length === 1) pieces.push({ s: word, r: rects[0] });
        else for (let k = 0; k < word.length; k++) { range.setStart(tn, m.index + k); range.setEnd(tn, m.index + k + 1); const q = range.getBoundingClientRect(); if (q.width) pieces.push({ s: word[k], r: q }); }
        for (const p of pieces) {
          const r = rel(p.r);
          if (clipR && (r.x >= clipR.x + clipR.w - 0.5 || r.x + r.w <= clipR.x + 0.5)) continue; // fully hidden
          const needClip = !!clipR && (r.x < clipR.x - 0.5 || r.x + r.w > clipR.x + clipR.w + 0.5);
          if (COMPLEX.test(p.s)) {
            ops.push({ y0: r.y, y1: r.y + r.h, line: true, draw: async (pg, oy) => {
              const S = 3; const c = document.createElement('canvas'); c.width = Math.ceil(r.w * S) + 2; c.height = Math.ceil(r.h * S) + 2;
              const cx = c.getContext('2d')!; cx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * S}px ${cs.fontFamily}`; cx.fillStyle = cs.color; cx.textBaseline = 'bottom';
              cx.fillText(p.s, 0, c.height - size * S * 0.22);
              const png = await doc.embedPng(await new Promise<ArrayBuffer>((res) => c.toBlob((b) => b!.arrayBuffer().then(res), 'image/png')));
              pg.drawImage(png, { x: r.x * PX, y: H - (r.y - oy + r.h) * PX, width: (c.width / S) * PX, height: (c.height / S) * PX });
            } });
            continue;
          }
          ops.push({ y0: r.y, y1: r.y + r.h, line: true, draw: async (pg, oy) => {
            const f = await getFont(fam, bold, italic);
            const asc = f.fk.ascent / f.fk.unitsPerEm, desc = Math.abs(f.fk.descent) / f.fk.unitsPerEm;
            // baseline inside the line box (the inline box height = (ascent + descent) × size, centred)
            const contentH = (asc + desc) * size;
            const baseline = r.y + (r.h - contentH) / 2 + asc * size;
            let str = p.s;
            try { f.pdf.encodeText(str); } catch { str = str.replace(/[^\x20-\x7E -ſ‐-‧€₹]/g, '?'); }
            const natural = f.pdf.widthOfTextAtSize(str, size);
            const sq = natural > 0 ? Math.max(50, Math.min(150, (r.w / natural) * 100)) : 100;
            const x = r.x * PX, y = H - (baseline - oy) * PX;
            if (needClip) pg.pushOperators(pushGraphicsState(), rectangle(clipR!.x * PX, H - (clipR!.y - oy + clipR!.h) * PX, clipR!.w * PX, clipR!.h * PX), clip(), endPath());
            if (Math.abs(sq - 100) > 1.5) pg.pushOperators(pushGraphicsState(), setCharacterSqueeze(sq));
            pg.drawText(str, { x, y, size: size * PX, font: f.pdf, color: rgb(color.r, color.g, color.b), opacity: color.a });
            if (Math.abs(sq - 100) > 1.5) pg.pushOperators(popGraphicsState());
            if (needClip) pg.pushOperators(popGraphicsState());
            if (/underline/.test(deco)) pg.drawLine({ start: { x, y: y - size * PX * 0.12 }, end: { x: x + r.w * PX, y: y - size * PX * 0.12 }, thickness: Math.max(0.5, size * PX * 0.06), color: rgb(color.r, color.g, color.b) });
            if (/line-through/.test(deco)) pg.drawLine({ start: { x, y: y + size * PX * 0.3 }, end: { x: x + r.w * PX, y: y + size * PX * 0.3 }, thickness: Math.max(0.5, size * PX * 0.06), color: rgb(color.r, color.g, color.b) });
          } });
        }
      }
    }

    // 4) split into pages of height fullH, cutting only between lines of text
    const totalH = Math.max(pr.height, ...ops.map((o) => o.y1));
    const cuts: number[] = [0];
    const lineBoxes = ops.filter((o) => o.line).map((o) => [o.y0, o.y1]).sort((a, b) => a[0] - b[0]);
    while (true) {
      const start = cuts[cuts.length - 1];
      if (cuts.length === 1 && totalH <= fullH + 2) break; // fits on one page as it is
      const limit = cuts.length === 1 ? fullH - mB : start + fullH - mT - mB;
      if (limit >= totalH - 2) break;
      let cut = limit;
      for (let guard = 0; guard < 400; guard++) { const hit = lineBoxes.find(([a, b]) => a < cut - 0.5 && b > cut + 0.5); if (!hit) break; cut = hit[0] - 1; }
      if (cut <= start + (limit - start) * 0.3) cut = limit;
      cuts.push(cut);
    }
    for (let k = 0; k < cuts.length; k++) {
      const top = cuts[k], bottom = k + 1 < cuts.length ? cuts[k + 1] : Infinity;
      const pg = doc.addPage([W, H]);
      const oy = k === 0 ? 0 : top - mT; // continued pages start below the top margin
      for (const o of ops) {
        if (o.line ? (o.y0 + o.y1) / 2 < top || (o.y0 + o.y1) / 2 >= bottom : o.y1 <= top || o.y0 >= bottom) continue;
        await o.draw(pg, oy);
      }
    }
    await new Promise((r) => setTimeout(r));
  }
  return doc;
}
