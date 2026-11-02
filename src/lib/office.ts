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

export async function pptxSlides(buf: ArrayBuffer): Promise<Slide[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  const xml = (p: string) => (z[p] ? new DOMParser().parseFromString(strFromU8(z[p]), 'application/xml') : null);
  const pres = xml('ppt/presentation.xml'); if (!pres) throw new Error('This file is not a valid PowerPoint (PPTX) file.');
  const sz = deep(pres.documentElement, 'sldSz');
  const W = +(sz?.getAttribute('cx') ?? 9144000) / EMU, H = +(sz?.getAttribute('cy') ?? 6858000) / EMU;
  const resolve = (base: string, t: string) => { const parts = (base.slice(0, base.lastIndexOf('/') + 1) + t).split('/'); const o: string[] = []; for (const p of parts) { if (p === '..') o.pop(); else if (p !== '.') o.push(p); } return o.join('/'); };
  const rels = (part: string) => { const r = xml(part.replace(/([^/]+)$/, '_rels/$1.rels')); const m = new Map<string, { target: string; type: string }>(); r?.querySelectorAll('Relationship').forEach((e) => m.set(e.getAttribute('Id')!, { target: e.getAttribute('TargetMode') === 'External' ? '' : resolve(part, e.getAttribute('Target')!), type: e.getAttribute('Type') ?? '' })); return m; };
  const presRels = rels('ppt/presentation.xml');
  const order = kids(deep(pres.documentElement, 'sldIdLst'), 'sldId').map((e) => presRels.get(e.getAttribute('r:id')!)?.target).filter(Boolean) as string[];
  // theme colours + fonts
  const themePart = [...presRels.values()].find((r) => r.type.endsWith('/theme'))?.target ?? 'ppt/theme/theme1.xml';
  const theme = xml(themePart); const scheme: Record<string, string> = {};
  const cs = deep(theme?.documentElement, 'clrScheme');
  cs && Array.from(cs.children).forEach((c) => { const v = deep(c, 'srgbClr')?.getAttribute('val') ?? deep(c, 'sysClr')?.getAttribute('lastClr'); if (v) scheme[c.localName] = '#' + v; });
  const map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  const majorFont = deep(deep(theme?.documentElement, 'majorFont'), 'latin')?.getAttribute('typeface') ?? 'Calibri';
  const minorFont = deep(deep(theme?.documentElement, 'minorFont'), 'latin')?.getAttribute('typeface') ?? 'Calibri';
  const color = (el: Element | undefined): string | undefined => {
    if (!el) return undefined;
    const c = kid(el, 'srgbClr') ?? kid(el, 'schemeClr') ?? kid(el, 'sysClr') ?? kid(el, 'prstClr');
    if (!c) return undefined;
    let hex = c.localName === 'srgbClr' ? '#' + c.getAttribute('val') : c.localName === 'sysClr' ? '#' + (c.getAttribute('lastClr') ?? '000000') : c.localName === 'prstClr' ? (c.getAttribute('val') ?? 'black') : scheme[map[c.getAttribute('val')!] ?? c.getAttribute('val')!] ?? '#000000';
    const lum = kid(c, 'lumMod')?.getAttribute('val'), off = kid(c, 'lumOff')?.getAttribute('val'), alpha = kid(c, 'alpha')?.getAttribute('val');
    if ((lum || off) && hex.startsWith('#') && hex.length === 7) {
      const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(Math.min(255, v * (lum ? +lum / 1e5 : 1) + 255 * (off ? +off / 1e5 : 0)));
      hex = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
    if (alpha && hex.startsWith('#') && hex.length === 7) { const n = parseInt(hex.slice(1), 16); hex = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${+alpha / 1e5})`; }
    return hex;
  };
  const phKey = (sp: Element) => { const ph = deep(sp, 'ph'); if (!ph) return null; return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '' }; };

  type Ctx = { part: string; rels: Map<string, { target: string; type: string }>; doc: Document };
  const load = (part: string): Ctx | null => { const d = xml(part); return d ? { part, rels: rels(part), doc: d } : null; };

  const slides: Slide[] = [];
  for (const sp of order) {
    const slide = load(sp); if (!slide) continue;
    const layoutPart = [...slide.rels.values()].find((r) => r.type.endsWith('/slideLayout'))?.target;
    const layout = layoutPart ? load(layoutPart) : null;
    const masterPart = layout ? [...layout.rels.values()].find((r) => r.type.endsWith('/slideMaster'))?.target : undefined;
    const master = masterPart ? load(masterPart) : null;
    const phXfrm = (key: { type: string; idx: string }) => {
      for (const c of [layout, master]) {
        if (!c) continue;
        for (const s of Array.from(c.doc.getElementsByTagName('*')).filter((e) => e.localName === 'sp')) {
          const k = phKey(s); if (!k) continue;
          if ((key.idx && k.idx === key.idx) || k.type === key.type || (key.type === 'ctrTitle' && k.type === 'title') || (key.type === 'subTitle' && k.type === 'body')) { const x = deep(kid(s, 'spPr'), 'xfrm'); if (x) return x; }
        }
      }
      return undefined;
    };
    const bgOf = (c: Ctx | null) => { const bg = deep(c?.doc.documentElement, 'bg'); if (!bg) return null; const pr = kid(bg, 'bgPr'); const fill = kid(pr, 'solidFill'); if (fill) return { color: color(fill) }; const blip = deep(pr, 'blip'); if (blip) return { img: c!.rels.get(blip.getAttribute('r:embed')!)?.target }; const ref = kid(bg, 'bgRef'); if (ref) return { color: color(ref) }; return null; };
    const bg = bgOf(slide) ?? bgOf(layout) ?? bgOf(master);

    slides.push({
      w: W, h: H,
      draw: async (ctx) => {
        ctx.fillStyle = bg?.color ?? '#ffffff'; ctx.fillRect(0, 0, W, H);
        if (bg?.img) { const b = await bitmap(z[bg.img], bg.img); if (b) ctx.drawImage(b, 0, 0, W, H); }
        const drawTree = async (c: Ctx, tree: Element | undefined, isSlide: boolean, gx = 0, gy = 0, sx = 1, sy = 1) => {
          if (!tree) return;
          for (const el of Array.from(tree.children)) {
            const ln = el.localName;
            if (ln === 'grpSp') {
              const xf = deep(kid(el, 'grpSpPr'), 'xfrm');
              const off = kid(xf, 'off'), ext = kid(xf, 'ext'), co = kid(xf, 'chOff'), ce = kid(xf, 'chExt');
              const nsx = ce && +ce.getAttribute('cx')! ? (+ext!.getAttribute('cx')! / +ce.getAttribute('cx')!) : 1, nsy = ce && +ce.getAttribute('cy')! ? (+ext!.getAttribute('cy')! / +ce.getAttribute('cy')!) : 1;
              const ngx = gx + sx * (+(off?.getAttribute('x') ?? 0) / EMU) - sx * nsx * (+(co?.getAttribute('x') ?? 0) / EMU), ngy = gy + sy * (+(off?.getAttribute('y') ?? 0) / EMU) - sy * nsy * (+(co?.getAttribute('y') ?? 0) / EMU);
              await drawTree(c, el, isSlide, ngx, ngy, sx * nsx, sy * nsy); continue;
            }
            if (ln !== 'sp' && ln !== 'pic' && ln !== 'cxnSp' && ln !== 'graphicFrame') continue;
            const key = phKey(el);
            if (!isSlide && key) continue; // placeholders on layouts/masters only hold prompt text
            const spPr = kid(el, 'spPr') ?? kid(el, 'grpSpPr');
            let xf = deep(spPr, 'xfrm') ?? (ln === 'graphicFrame' ? kid(el, 'xfrm') : undefined);
            if (!xf && key) xf = phXfrm(key);
            if (!xf) continue;
            const off = kid(xf, 'off'), ext = kid(xf, 'ext');
            const x = gx + sx * (+(off?.getAttribute('x') ?? 0) / EMU), y = gy + sy * (+(off?.getAttribute('y') ?? 0) / EMU);
            const w = sx * (+(ext?.getAttribute('cx') ?? 0) / EMU), h = sy * (+(ext?.getAttribute('cy') ?? 0) / EMU);
            const rot = +(xf.getAttribute('rot') ?? 0) / 60000;
            ctx.save();
            if (rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate((rot * Math.PI) / 180); ctx.translate(-(x + w / 2), -(y + h / 2)); }
            if (ln === 'pic') {
              const blip = deep(kid(el, 'blipFill'), 'blip'); const t = blip && c.rels.get(blip.getAttribute('r:embed')!)?.target;
              const b = t ? await bitmap(z[t], t) : null;
              if (b) {
                const sr = deep(kid(el, 'blipFill'), 'srcRect'); const p = (k: string) => +(sr?.getAttribute(k) ?? 0) / 1e5;
                const cx0 = b.width * p('l'), cy0 = b.height * p('t'), cw = b.width * (1 - p('l') - p('r')), ch = b.height * (1 - p('t') - p('b'));
                ctx.drawImage(b, cx0, cy0, Math.max(1, cw), Math.max(1, ch), x, y, w, h);
              }
            } else if (ln === 'graphicFrame') {
              const tbl = deep(el, 'tbl');
              if (tbl) {
                const cols = kids(deep(tbl, 'tblGrid'), 'gridCol').map((g) => +(g.getAttribute('w') ?? 0) / EMU);
                let yy = y;
                for (const tr of kids(tbl, 'tr')) {
                  const rh = Math.max(+(tr.getAttribute('h') ?? 0) / EMU, 14); let xx = x;
                  kids(tr, 'tc').forEach((tc, k) => {
                    const cw = cols[k] ?? 60; const fill = color(kid(kid(tc, 'tcPr'), 'solidFill'));
                    if (fill) { ctx.fillStyle = fill; ctx.fillRect(xx, yy, cw, rh); }
                    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 0.5; ctx.strokeRect(xx, yy, cw, rh);
                    drawText(ctx, paras(kid(tc, 'txBody')), xx + 4, yy + 2, cw - 8, rh - 4, 't', 12);
                    xx += cw;
                  });
                  yy += rh;
                }
              }
            } else {
              const geom = deep(spPr, 'prstGeom')?.getAttribute('prst') ?? 'rect';
              const fillEl = kid(spPr, 'solidFill'); const noFill = !!kid(spPr, 'noFill');
              const style = kid(el, 'style');
              const fill = fillEl ? color(fillEl) : !noFill && style && ln === 'sp' && !key ? color(kid(style, 'fillRef')) : undefined;
              const lnEl = kid(spPr, 'ln'); const lineCol = lnEl && !kid(lnEl, 'noFill') ? color(kid(lnEl, 'solidFill')) ?? (style ? color(kid(style, 'lnRef')) : undefined) : undefined;
              if (fill && geom !== 'line') { shapePath(ctx, geom, x, y, w, h); ctx.fillStyle = fill; ctx.fill(); }
              if (lineCol || ln === 'cxnSp') { shapePath(ctx, geom, x, y, w, h); ctx.strokeStyle = lineCol ?? '#000'; ctx.lineWidth = Math.max(0.5, +(lnEl?.getAttribute('w') ?? 12700) / EMU); ctx.stroke(); }
              const tb = kid(el, 'txBody');
              if (tb) {
                const bp = kid(tb, 'bodyPr');
                const ins = (k: string, d: number) => +(bp?.getAttribute(k) ?? d) / EMU;
                const anchor = bp?.getAttribute('anchor') ?? (key && /title|ctrTitle/.test(key.type) ? (key.type === 'ctrTitle' ? 'b' : 'ctr') : 't');
                const fs = +(deep(bp, 'normAutofit')?.getAttribute('fontScale') ?? 100000) / 1e5;
                const defSize = key ? (/title/i.test(key.type) ? (key.type === 'ctrTitle' ? 44 : 36) : key.type === 'subTitle' ? 22 : 20) : 18;
                const ps = paras(tb, key ? (/title/i.test(key.type) ? majorFont : minorFont) : minorFont, !!key && !/title/i.test(key.type) && key.type !== 'subTitle');
                drawText(ctx, ps, x + ins('lIns', 91440), y + ins('tIns', 45720), w - ins('lIns', 91440) - ins('rIns', 91440), h - ins('tIns', 45720) - ins('bIns', 45720), anchor, defSize, fs);
              }
            }
            ctx.restore();
          }
        };
        const paras = (tb: Element | undefined, defFont = minorFont, bulletsByDefault = false): Para[] => kids(tb, 'p').map((p) => {
          const pPr = kid(p, 'pPr'); const lvl = +(pPr?.getAttribute('lvl') ?? 0);
          const runs = Array.from(p.children).filter((r) => r.localName === 'r' || r.localName === 'br' || r.localName === 'fld').map((r) => {
            if (r.localName === 'br') return { t: '\n' };
            const rp = kid(r, 'rPr');
            const s = rp?.getAttribute('sz'); const latin = kid(rp, 'latin')?.getAttribute('typeface');
            return { t: kid(r, 't')?.textContent ?? '', size: s ? +s / 100 : undefined, b: rp?.getAttribute('b') === '1', i: rp?.getAttribute('i') === '1', color: color(kid(rp, 'solidFill')), font: latin && !latin.startsWith('+') ? latin : defFont };
          });
          const buChar = kid(pPr, 'buChar')?.getAttribute('char'); const noBu = !!kid(pPr, 'buNone');
          const hasText = runs.some((r) => r.t.trim());
          return { runs, align: pPr?.getAttribute('algn') ?? 'l', bullet: hasText && !noBu ? (buChar ?? (kid(pPr, 'buAutoNum') ? '•' : bulletsByDefault ? '•' : undefined)) : undefined, lvl };
        });
        if (master) await drawTree(master, deep(master.doc.documentElement, 'spTree'), false);
        if (layout) await drawTree(layout, deep(layout.doc.documentElement, 'spTree'), false);
        await drawTree(slide, deep(slide.doc.documentElement, 'spTree'), true);
      },
    });
  }
  if (!slides.length) throw new Error('No slides were found in this presentation.');
  return slides;
}

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
