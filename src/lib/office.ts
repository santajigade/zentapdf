// Office documents → content for PDF. Word (docx via mammoth), spreadsheets (xlsx/xls/ods via SheetJS),
// OpenDocument text (odt), and slides (pptx / odp) drawn onto canvases.
import type { Block } from './docpdf';
import { htmlToBlocks } from './docpdf';

// ---------- Word ----------
export async function docxToBlocks(buf: ArrayBuffer): Promise<{ blocks: Block[]; messages: string[] }> {
  const mammoth: any = (await import('mammoth')).default ?? (await import('mammoth'));
  const res = await mammoth.convertToHtml({ arrayBuffer: buf }, { includeDefaultStyleMap: true, styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"] });
  const doc = new DOMParser().parseFromString(`<body>${res.value}</body>`, 'text/html');
  const blocks = await htmlToBlocks(doc, async (src) => (/^data:/.test(src) ? (await fetch(src)).blob() : null));
  return { blocks, messages: (res.messages ?? []).map((m: any) => m.message) };
}

// ---------- Spreadsheets ----------
export async function sheetsToBlocks(buf: ArrayBuffer): Promise<Block[]> {
  const XLSX: any = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  const blocks: Block[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws || !ws['!ref']) continue;
    let rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false, defval: '' });
    rows = rows.map((r) => r.map((v) => String(v ?? '')));
    // drop empty columns at the right
    const width = rows.reduce((m, r) => { let k = r.length; while (k > 0 && !r[k - 1].trim()) k--; return Math.max(m, k); }, 0);
    rows = rows.map((r) => r.slice(0, width)).filter((r) => r.some((c) => c.trim()));
    if (!rows.length) continue;
    if (blocks.length) blocks.push({ t: 'break' });
    if (wb.SheetNames.length > 1) blocks.push({ t: 'h', level: 3, runs: [{ text: name }] });
    blocks.push({ t: 'table', rows, header: true });
  }
  if (!blocks.length) throw new Error('This spreadsheet is empty.');
  return blocks;
}

// ---------- OpenDocument text ----------
export async function odtToBlocks(buf: ArrayBuffer): Promise<Block[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  if (!z['content.xml']) throw new Error('This file is not a valid OpenDocument file.');
  const x = new DOMParser().parseFromString(strFromU8(z['content.xml']), 'application/xml');
  const sx = z['styles.xml'] ? new DOMParser().parseFromString(strFromU8(z['styles.xml']), 'application/xml') : null;
  // style name → bold / italic / heading-ish
  const st = new Map<string, { b?: boolean; i?: boolean; parent?: string }>();
  for (const d of [sx, x]) d?.querySelectorAll('*').forEach((el) => {
    if (el.localName !== 'style') return;
    const name = el.getAttribute('style:name'); if (!name) return;
    const tp = Array.from(el.children).find((c) => c.localName === 'text-properties');
    st.set(name, { b: tp?.getAttribute('fo:font-weight') === 'bold' || undefined, i: tp?.getAttribute('fo:font-style') === 'italic' || undefined, parent: el.getAttribute('style:parent-style-name') ?? undefined });
  });
  const look = (name: string | null, k: 'b' | 'i'): boolean => { let n = name, guard = 0; while (n && guard++ < 8) { const s = st.get(n); if (!s) return false; if (s[k] !== undefined) return !!s[k]; n = s.parent ?? null; } return false; };
  const html: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const imgs: Record<string, Blob> = {};
  const inline = (n: Node): string => {
    if (n.nodeType === 3) return esc(n.textContent ?? '');
    if (n.nodeType !== 1) return '';
    const el = n as Element; const ln = el.localName;
    if (ln === 's') return '&nbsp;'.repeat(+(el.getAttribute('text:c') ?? 1));
    if (ln === 'tab') return '&nbsp;&nbsp;&nbsp;&nbsp;';
    if (ln === 'line-break') return '<br>';
    if (ln === 'note' || ln === 'annotation') return '';
    if (ln === 'frame') { const im = Array.from(el.getElementsByTagName('*')).find((c) => c.localName === 'image'); const href = im?.getAttribute('xlink:href'); if (href && z[href]) { imgs[href] = new Blob([z[href] as BlobPart]); return `</p><img src="${esc(href)}"><p>`; } return ''; }
    const inner = Array.from(el.childNodes).map(inline).join('');
    if (ln === 'span') { const sn = el.getAttribute('text:style-name'); let s = inner; if (look(sn, 'b')) s = `<b>${s}</b>`; if (look(sn, 'i')) s = `<i>${s}</i>`; return s; }
    if (ln === 'a') return `<a href="#">${inner}</a>`;
    return inner;
  };
  const block = (el: Element) => {
    const ln = el.localName;
    if (ln === 'h') { const lv = Math.min(6, +(el.getAttribute('text:outline-level') ?? 1)); html.push(`<h${lv}>${Array.from(el.childNodes).map(inline).join('')}</h${lv}>`); }
    else if (ln === 'p') { const sn = el.getAttribute('text:style-name'); let s = Array.from(el.childNodes).map(inline).join(''); if (/^(Title|Heading)/i.test(sn ?? '') || /Title/.test(st.get(sn ?? '')?.parent ?? '')) s = `<b>${s}</b>`; else { if (look(sn, 'b')) s = `<b>${s}</b>`; if (look(sn, 'i')) s = `<i>${s}</i>`; } html.push(`<p>${s}</p>`); }
    else if (ln === 'list') { html.push('<ul>'); for (const it of Array.from(el.children)) if (it.localName === 'list-item') { html.push('<li>'); Array.from(it.children).forEach(block); html.push('</li>'); } html.push('</ul>'); }
    else if (ln === 'table') {
      html.push('<table>');
      el.querySelectorAll('*').forEach(() => {});
      const rows = Array.from(el.getElementsByTagName('*')).filter((r) => r.localName === 'table-row');
      rows.forEach((r, k) => { html.push('<tr>'); Array.from(r.children).filter((c) => c.localName === 'table-cell').forEach((c) => { const rep = Math.min(50, +(c.getAttribute('table:number-columns-repeated') ?? 1)); const t = Array.from(c.childNodes).map((p) => inline(p)).join(' '); for (let q = 0; q < rep; q++) html.push(k === 0 ? `<th>${t}</th>` : `<td>${t}</td>`); }); html.push('</tr>'); });
      html.push('</table>');
    }
    else if (ln === 'section' || ln === 'text' || ln === 'body') Array.from(el.children).forEach(block);
  };
  const body = Array.from(x.getElementsByTagName('*')).find((e) => e.localName === 'text' && e.parentElement?.localName === 'body');
  if (!body) throw new Error('No text was found in this document.');
  Array.from(body.children).forEach(block);
  const doc = new DOMParser().parseFromString(`<body>${html.join('')}</body>`, 'text/html');
  return htmlToBlocks(doc, async (src) => imgs[src] ?? null);
}

// ---------- Slides ----------
export type Slide = { w: number; h: number; draw: (ctx: CanvasRenderingContext2D, scale: number) => Promise<void> };
const EMU = 12700; // EMU per point

type Para = { runs: { t: string; size?: number; b?: boolean; i?: boolean; color?: string; font?: string }[]; align: string; bullet?: string; lvl: number };

/** Wrap and draw text paragraphs inside a box. Sizes in points; ctx is already scaled to points. */
function drawText(ctx: CanvasRenderingContext2D, paras: Para[], x: number, y: number, w: number, h: number, anchor: string, defSize: number, scaleFont = 1) {
  type L = { parts: { t: string; font: string; color: string; w: number }[]; w: number; size: number; align: string; indent: number };
  const lines: L[] = [];
  for (const p of paras) {
    const indent = p.lvl * 18 + (p.bullet ? 14 : 0);
    let cur: L = { parts: [], w: 0, size: defSize * scaleFont, align: p.align, indent };
    if (p.bullet) { const sz = (p.runs[0]?.size ?? defSize) * scaleFont; ctx.font = `${sz}px Arial`; cur.parts.push({ t: p.bullet + ' ', font: ctx.font, color: p.runs[0]?.color ?? '#000', w: ctx.measureText(p.bullet + ' ').width }); cur.w = cur.parts[0].w; cur.size = sz; cur.indent = p.lvl * 18; }
    if (!p.runs.length || !p.runs.some((r) => r.t)) { lines.push(cur); continue; }
    for (const r of p.runs) {
      const sz = (r.size ?? defSize) * scaleFont;
      const font = `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${sz}px ${r.font ? `"${r.font}", ` : ''}Calibri, Carlito, Arial, sans-serif`;
      ctx.font = font;
      for (const word of r.t.split(/(\s+)/)) {
        if (!word) continue;
        if (word.includes('\n')) { lines.push(cur); cur = { parts: [], w: 0, size: sz, align: p.align, indent: p.lvl * 18 + (p.bullet ? 14 : 0) }; continue; }
        const ww = ctx.measureText(word).width;
        if (cur.w + ww > w - indent - 4 && cur.parts.length && !/^\s+$/.test(word)) { lines.push(cur); cur = { parts: [], w: 0, size: sz, align: p.align, indent: p.lvl * 18 + (p.bullet ? 14 : 0) }; }
        if (!cur.parts.length && /^\s+$/.test(word)) continue;
        cur.parts.push({ t: word, font, color: r.color ?? '#000', w: ww }); cur.w += ww; cur.size = Math.max(cur.size, sz);
      }
    }
    lines.push(cur);
  }
  const total = lines.reduce((s, l) => s + l.size * 1.2, 0);
  let yy = anchor === 'ctr' ? y + (h - total) / 2 : anchor === 'b' ? y + h - total : y;
  ctx.textBaseline = 'alphabetic';
  for (const l of lines) {
    yy += l.size * 1.2;
    let xx = l.align === 'ctr' ? x + (w - l.w) / 2 : l.align === 'r' ? x + w - l.w : x + l.indent;
    for (const p of l.parts) { ctx.font = p.font; ctx.fillStyle = p.color; ctx.fillText(p.t, xx, yy - l.size * 0.22); xx += p.w; }
  }
}

async function bitmap(data: Uint8Array | undefined, name: string): Promise<ImageBitmap | null> {
  if (!data || /\.(emf|wmf|tiff?)$/i.test(name)) return null;
  try { return await createImageBitmap(new Blob([data as BlobPart], { type: /\.png$/i.test(name) ? 'image/png' : /\.svg$/i.test(name) ? 'image/svg+xml' : /\.gif$/i.test(name) ? 'image/gif' : 'image/jpeg' })); } catch { return null; }
}

function shapePath(ctx: CanvasRenderingContext2D, geom: string, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (geom === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  else if (geom === 'roundRect') ctx.roundRect(x, y, w, h, Math.min(Math.abs(w), Math.abs(h)) * 0.16);
  else if (geom === 'triangle') { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
  else if (geom === 'line' || geom === 'straightConnector1') { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); }
  else ctx.rect(x, y, w, h);
}

const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0];
const deep = (el: Element | null | undefined, name: string) => (el ? Array.from(el.getElementsByTagName('*')).find((c) => c.localName === name) : undefined);

export { pptxSlides } from './pptx';

/** OpenDocument presentation (odp): frames with text boxes, images and simple shapes. */
export async function odpSlides(buf: ArrayBuffer): Promise<Slide[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  if (!z['content.xml']) throw new Error('This file is not a valid OpenDocument presentation.');
  const content = new DOMParser().parseFromString(strFromU8(z['content.xml']), 'application/xml');
  const styles = z['styles.xml'] ? new DOMParser().parseFromString(strFromU8(z['styles.xml']), 'application/xml') : null;
  const len = (v: string | null | undefined) => { if (!v) return 0; const n = parseFloat(v); return /cm$/.test(v) ? n * 28.3465 : /mm$/.test(v) ? n * 2.83465 : /in$/.test(v) ? n * 72 : /pt$/.test(v) ? n : /px$/.test(v) ? n * 0.75 : n; };
  const all = styles ? Array.from(styles.getElementsByTagName('*')) : [];
  const mp = all.find((e) => e.localName === 'master-page' && e.getAttribute('style:page-layout-name'));
  const lay = all.find((e) => e.localName === 'page-layout' && e.getAttribute('style:name') === mp?.getAttribute('style:page-layout-name'));
  const pl = (lay && Array.from(lay.children).find((c) => c.localName === 'page-layout-properties')) ?? all.find((e) => e.localName === 'page-layout-properties');
  const W = len(pl?.getAttribute('fo:page-width')) || 792, H = len(pl?.getAttribute('fo:page-height')) || 612;
  const st = new Map<string, Element>();
  for (const d of [styles, content]) d && Array.from(d.getElementsByTagName('*')).forEach((e) => { if (e.localName === 'style' && e.getAttribute('style:name')) st.set(e.getAttribute('style:name')!, e); });
  const prop = (name: string | null, local: string, attr: string): string | null => { let n = name, g = 0; while (n && g++ < 8) { const s = st.get(n); if (!s) return null; const p = Array.from(s.children).find((c) => c.localName === local); const v = p?.getAttribute(attr); if (v) return v; n = s.getAttribute('style:parent-style-name'); } return null; };
  const pages = Array.from(content.getElementsByTagName('*')).filter((e) => e.localName === 'page' && e.parentElement?.localName === 'presentation');
  return pages.map((pg) => ({
    w: W, h: H,
    draw: async (ctx) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      for (const el of Array.from(pg.children)) {
        const x = len(el.getAttribute('svg:x')), y = len(el.getAttribute('svg:y')), w = len(el.getAttribute('svg:width')), h = len(el.getAttribute('svg:height'));
        const sname = el.getAttribute('draw:style-name') ?? el.getAttribute('presentation:style-name');
        const fill = prop(sname, 'graphic-properties', 'draw:fill') === 'solid' ? prop(sname, 'graphic-properties', 'draw:fill-color') : null;
        if (fill && (el.localName === 'rect' || el.localName === 'custom-shape' || el.localName === 'ellipse')) { shapePath(ctx, el.localName === 'ellipse' ? 'ellipse' : 'rect', x, y, w, h); ctx.fillStyle = fill; ctx.fill(); }
        const img = deep(el, 'image'); const href = img?.getAttribute('xlink:href');
        if (href && z[href]) { const b = await bitmap(z[href], href); if (b) ctx.drawImage(b, x, y, w, h); continue; }
        const pres = el.getAttribute('presentation:class');
        const ps: Para[] = Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === 'p').map((p) => {
          const pst = p.getAttribute('text:style-name');
          const runs: Para['runs'] = [];
          const walk = (n: Node, b = false, i = false, size?: number, color?: string) => {
            if (n.nodeType === 3) { runs.push({ t: n.textContent ?? '', b, i, size, color }); return; }
            if (n.nodeType !== 1) return; const e = n as Element;
            if (e.localName === 's') { runs.push({ t: ' '.repeat(+(e.getAttribute('text:c') ?? 1)), size }); return; }
            if (e.localName === 'line-break') { runs.push({ t: '\n' }); return; }
            const sn = e.getAttribute('text:style-name');
            const nb = b || prop(sn, 'text-properties', 'fo:font-weight') === 'bold', ni = i || prop(sn, 'text-properties', 'fo:font-style') === 'italic';
            const fsz = prop(sn, 'text-properties', 'fo:font-size'); const col = prop(sn, 'text-properties', 'fo:color');
            Array.from(e.childNodes).forEach((c) => walk(c, nb, ni, fsz && !fsz.endsWith('%') ? len(fsz) : size, col ?? color));
          };
          walk(p, false, false, len(prop(pst, 'text-properties', 'fo:font-size')) || undefined, prop(pst, 'text-properties', 'fo:color') ?? undefined);
          const al = prop(pst, 'paragraph-properties', 'fo:text-align');
          return { runs, align: al === 'center' ? 'ctr' : al === 'end' || al === 'right' ? 'r' : 'l', bullet: p.parentElement?.localName === 'list-item' ? '•' : undefined, lvl: 0 };
        });
        if (ps.some((p) => p.runs.some((r) => r.t.trim()))) drawText(ctx, ps, x + 6, y + 4, w - 12, h - 8, pres === 'title' ? 'ctr' : 't', pres === 'title' ? 36 : 18);
      }
    },
  }));
}

/** Render slides into a PDF document (one page per slide). */
export async function slidesToPdf(slides: Slide[], onProgress?: (d: number, t: number) => void): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const c = document.createElement('canvas');
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i, slides.length);
    const s = slides[i]; const scale = Math.min(3, 1800 / s.w);
    c.width = Math.round(s.w * scale); c.height = Math.round(s.h * scale);
    const ctx = c.getContext('2d')!; ctx.setTransform(scale, 0, 0, scale, 0, 0);
    try { await s.draw(ctx, scale); } catch { /* draw what we can */ }
    const img = await doc.embedJpg(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.9)));
    doc.addPage([s.w, s.h]).drawImage(img, { x: 0, y: 0, width: s.w, height: s.h });
    await new Promise((r) => setTimeout(r));
  }
  doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
  return doc.save();
}

/** Word → PDF with the real Word layout: render the DOCX like Word (pages, fonts, headers/footers), then draw it as vector PDF. */
export async function docxToPdfExact(file: Blob, onProgress?: (d: number, t: number) => void): Promise<Uint8Array> {
  const { addFontFaces, materializePseudo, pagesToPdf } = await import('./dom2pdf');
  // render inside a clean, invisible frame so the website's own styles don't affect the document
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-30000px;top:0;width:1800px;height:1200px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument!; d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>'); d.close();
    const host = d.body;
    const { renderAsync } = await import('docx-preview');
    await renderAsync(file, host, d.head, { inWrapper: true, ignoreLastRenderedPageBreak: false, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false });
    addFontFaces(d); // after rendering: docx-preview clears the style container
    void host.offsetHeight; await new Promise((r) => setTimeout(r, 30));
    await d.fonts.ready;
    await Promise.all(Array.from(d.fonts).filter((f) => f.status === 'loading').map((f) => f.loaded.catch(() => 0)));
    await Promise.all(Array.from(host.querySelectorAll('img')).map((im) => (im.complete ? 0 : im.decode().catch(() => 0))));
    await new Promise((r) => setTimeout(r, 80));
    await d.fonts.ready;
    materializePseudo(host);
    const pages = Array.from(host.querySelectorAll<HTMLElement>('section.docx'));
    if (!pages.length) throw new Error('No pages were found in this document.');
    const ptToPx = (v: string) => (v.endsWith('pt') ? parseFloat(v) * 4 / 3 : parseFloat(v));
    const doc = await pagesToPdf(pages, onProgress, { pageHeightPx: (el) => ptToPx(el.style.minHeight || '') || el.getBoundingClientRect().height });
    doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
    return doc.save();
  } finally { if (!(window as any).__zKeep) frame.remove(); }
}

/** Excel → PDF keeping the look: fonts, fills, borders, alignment, merged cells, column widths. */
export async function xlsxToPdfExact(buf: ArrayBuffer, o: { page: 'a4' | 'letter'; orient: 'auto' | 'portrait' | 'landscape'; grid: 'auto' | 'on' | 'off' }, onProgress?: (d: number, t: number) => void): Promise<Uint8Array> {
  const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
  const XLSX: any = await import('xlsx');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const sj = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, cellNF: true });
  // theme colours
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  const theme: string[] = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
  const tx = Object.keys(z).find((k) => /^xl\/theme\/theme\d*\.xml$/.test(k));
  if (tx) {
    const d = new DOMParser().parseFromString(strFromU8(z[tx]), 'application/xml');
    const cs = Array.from(d.getElementsByTagName('*')).find((e) => e.localName === 'clrScheme');
    if (cs) { const get = (n: string) => { const el = Array.from(cs.children).find((c) => c.localName === n); const v = el && Array.from(el.getElementsByTagName('*')).find((c) => c.localName === 'srgbClr' || c.localName === 'sysClr'); return v?.getAttribute('val') === 'windowText' ? '000000' : v?.getAttribute('val') === 'window' ? 'FFFFFF' : v?.getAttribute('lastClr') ?? v?.getAttribute('val') ?? null; };
      ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].forEach((n, i) => { const v = get(n); if (v) theme[i] = v; }); }
  }
  const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  const color = (c: any, dflt: string | null): string | null => {
    if (!c) return dflt;
    let hex: string | null = null;
    if (c.argb) hex = c.argb.length === 8 ? c.argb.slice(2) : c.argb;
    else if (c.theme !== undefined) hex = theme[c.theme] ?? null;
    else if (c.indexed !== undefined) hex = c.indexed === 64 ? dflt?.replace('#', '') ?? null : INDEXED[c.indexed] ?? null;
    if (!hex) return dflt;
    let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const t = c.tint ?? 0;
    if (t) { const f = (v: number) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t); r = f(r); g = f(g); b = f(b); }
    return `rgb(${r},${g},${b})`;
  };
  const BORDER: Record<string, string> = { thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid', dotted: '1px dotted', dashed: '1px dashed', mediumDashed: '2px dashed', dashDot: '1px dashed', mediumDashDot: '2px dashed', dashDotDot: '1px dotted', slantDashDot: '2px dashed', double: '3px double' };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const [PW, PH] = o.page === 'letter' ? [816, 1056] : [794, 1123]; // px at 96 dpi
  const M = { l: 0.7 * 96, r: 0.7 * 96, t: 0.75 * 96, b: 0.75 * 96 };

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-30000px;top:0;width:4000px;height:1200px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument!; d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Calibri,sans-serif}.pg{background:#fff;box-sizing:border-box;position:relative}table{border-collapse:collapse;table-layout:fixed;transform-origin:0 0}td{overflow:hidden;padding:1px 3px;font-size:11pt;line-height:1.2;white-space:nowrap;vertical-align:bottom}td.w{white-space:pre-wrap;word-wrap:break-word}td.s{overflow:visible}</style></head><body></body></html>'); d.close();
    const { addFontFaces, pagesToPdf } = await import('./dom2pdf');
    addFontFaces(d);
    const pages: HTMLElement[] = []; const pageSizes = new Map<HTMLElement, [number, number]>();
    const sheets = wb.worksheets.filter((ws: any) => ws.state !== 'hidden' && ws.state !== 'veryHidden');
    for (const ws of sheets) {
      const sws = sj.Sheets[ws.name];
      // used range (cells with a value or a fill/border)
      let maxR = 0, maxC = 0;
      ws.eachRow({ includeEmpty: false }, (row: any, r: number) => row.eachCell({ includeEmpty: false }, (cell: any, c: number) => { if (cell.value !== null && cell.value !== '' ) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); } }));
      if (!maxR) continue;
      const merges = new Map<string, [number, number]>(); const covered = new Set<string>();
      for (const m of (ws.model?.merges ?? []) as string[]) {
        const [a, b] = m.split(':'); const ca = ws.getCell(a), cb = ws.getCell(b);
        merges.set(`${ca.row},${ca.col}`, [cb.row - ca.row + 1, cb.col - ca.col + 1]);
        for (let r = ca.row; r <= cb.row; r++) for (let c = ca.col; c <= cb.col; c++) if (r !== ca.row || c !== ca.col) covered.add(`${r},${c}`);
        maxR = Math.max(maxR, Math.min(cb.row, maxR + 0)); maxC = Math.max(maxC, cb.col);
      }
      const colW: number[] = []; for (let c = 1; c <= maxC; c++) { const col = ws.getColumn(c); colW[c] = col.hidden ? 0 : Math.round(((col.width ?? ws.properties?.defaultColWidth ?? 8.43) * 7 + 5)); }
      // 1) read every cell once
      type Cell = { text: string; css: string; span?: [number, number]; wrap: boolean; hasB: boolean };
      const grid: (Cell | null)[][] = []; const rowH: number[] = []; const visRows: number[] = [];
      let bordered = 0, cellsN = 0;
      for (let r = 1; r <= maxR; r++) {
        const row = ws.getRow(r); if (row.hidden) continue;
        visRows.push(r); rowH[r] = row.height ? Math.round(row.height * 4 / 3) : 20; grid[r] = [];
        for (let c = 1; c <= maxC; c++) {
          if (!colW[c] || covered.has(`${r},${c}`)) { grid[r][c] = null; continue; }
          const cell = row.getCell(c); const st = cell.style ?? {};
          const sc = sws?.[cell.address];
          let text = sc ? (sc.w ?? (sc.v instanceof Date ? sc.v.toLocaleDateString() : String(sc.v ?? ''))) : '';
          if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) text = cell.value.richText.map((t: any) => t.text).join('');
          if (cell.value && typeof cell.value === 'object' && 'hyperlink' in cell.value && !text) text = String(cell.value.text ?? cell.value.hyperlink);
          const css: string[] = [];
          const f = st.font ?? {};
          if (f.name) css.push(`font-family:'${String(f.name).replace(/['"<>]/g, '')}',Calibri,sans-serif`);
          if (f.size) css.push(`font-size:${f.size}pt`);
          if (f.bold) css.push('font-weight:700'); if (f.italic) css.push('font-style:italic');
          if (f.underline) css.push('text-decoration:underline'); if (f.strike) css.push('text-decoration:line-through');
          const fc = color(f.color, null); if (fc) css.push(`color:${fc}`);
          const fill = st.fill; if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') { const bg = color(fill.fgColor, null) ?? color(fill.bgColor, null); if (bg) css.push(`background:${bg}`); }
          const bd = st.border ?? {}; let hasB = false;
          for (const side of ['top', 'right', 'bottom', 'left'] as const) { const bs = bd[side]; if (bs?.style) { hasB = true; css.push(`border-${side}:${BORDER[bs.style] ?? '1px solid'} ${color(bs.color, 'rgb(0,0,0)')}`); } }
          cellsN++; if (hasB) bordered++;
          const al = st.alignment ?? {};
          const isNum = typeof cell.value === 'number' || (sc && sc.t === 'n');
          const ha = !al.horizontal || al.horizontal === 'general' ? (isNum ? 'right' : 'left') : al.horizontal;
          css.push(`text-align:${ha === 'centerContinuous' ? 'center' : ha === 'fill' || ha === 'justify' || ha === 'distributed' ? 'left' : ha}`);
          if (al.vertical) css.push(`vertical-align:${al.vertical === 'middle' ? 'middle' : al.vertical === 'top' ? 'top' : 'bottom'}`);
          if (al.indent) css.push(`padding-left:${3 + al.indent * 9}px`);
          grid[r][c] = { text, css: css.join(';'), span: merges.get(`${r},${c}`), wrap: !!al.wrapText, hasB };
        }
      }
      const gridOn = o.grid === 'on' || (o.grid === 'auto' && bordered < cellsN * 0.05);
      // 2) split wide sheets into groups of columns (like Excel prints "across, then down")
      const portrait = o.orient === 'portrait' || (o.orient === 'auto' && ws.pageSetup?.orientation === 'portrait');
      const tableW = colW.reduce((t, v) => t + (v || 0), 0);
      const landscape = o.orient === 'landscape' || (o.orient === 'auto' && !portrait && tableW > PW - M.l - M.r) || (o.orient === 'auto' && ws.pageSetup?.orientation === 'landscape');
      const [W, H] = landscape ? [PH, PW] : [PW, PH];
      const contentW = W - M.l - M.r;
      const MIN_ZOOM = 0.62;
      const groups: [number, number][] = [];
      let g0 = 1, acc = 0;
      for (let c = 1; c <= maxC; c++) { const w = colW[c] || 0; if (acc + w > contentW / MIN_ZOOM && c > g0) { groups.push([g0, c - 1]); g0 = c; acc = 0; } acc += w; }
      groups.push([g0, maxC]);
      for (const [c0, c1] of groups) {
        const gw = colW.slice(c0, c1 + 1).reduce((t, v) => t + (v || 0), 0);
        const zoom = Math.min(1, contentW / Math.max(1, gw));
        const rows: string[] = [];
        for (const r of visRows) {
          const tds: string[] = [];
          for (let c = c0; c <= c1; c++) {
            if (!colW[c]) continue;
            const cell = grid[r][c]; if (cell === null) continue;
            if (!cell) { tds.push('<td></td>'); continue; }
            let span = cell.span; if (span) span = [span[0], Math.min(span[1], c1 - c + 1)];
            // like Excel: text may run into the next cells while they are empty
            let next = c + (span ? span[1] : 1); while (next <= c1 && !colW[next]) next++;
            const spill = !cell.wrap && cell.text && (next > c1 || (grid[r][next] !== null && !grid[r][next]?.text));
            const cls = cell.wrap ? 'w' : spill ? 's' : '';
            tds.push(`<td${span ? ` rowspan="${span[0]}" colspan="${span[1]}"` : ''} class="${cls}" style="${cell.css}">${esc(cell.text)}</td>`);
          }
          rows.push(`<tr data-keep="1" style="height:${rowH[r]}px">${tds.join('')}</tr>`);
        }
        const pg = d.createElement('div'); pg.className = 'pg';
        pg.style.cssText = `width:${W}px;padding:${M.t}px ${M.r}px ${M.b}px ${M.l}px;`;
        pg.innerHTML = `<table style="width:${gw}px;zoom:${zoom}"><colgroup>${colW.slice(c0, c1 + 1).filter((v) => v).map((v) => `<col style="width:${v}px">`).join('')}</colgroup>${rows.join('')}</table>`;
        if (gridOn) pg.querySelectorAll('td').forEach((td) => { const st = (td as HTMLElement).style; for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (!st.getPropertyValue(`border-${side.toLowerCase()}-style`)) (st as any)[`border${side}`] = '1px solid rgb(208,208,208)'; });
        d.body.appendChild(pg); pages.push(pg); pageSizes.set(pg, [W, H]);
      }
    }
    if (!pages.length) throw new Error('This spreadsheet is empty.');
    void d.body.offsetHeight; await new Promise((r) => setTimeout(r, 30)); await d.fonts.ready;
    await Promise.all(Array.from(d.fonts).filter((f) => f.status === 'loading').map((f) => f.loaded.catch(() => 0)));
    const doc = await pagesToPdf(pages, onProgress, { pageHeightPx: (el) => pageSizes.get(el)![1], pageWidthPx: (el) => pageSizes.get(el)![0], marginTopPx: M.t, marginBottomPx: M.b });
    doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
    return doc.save();
  } finally { if (!(window as any).__zKeep) frame.remove(); }
}
