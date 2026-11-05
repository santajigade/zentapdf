/// <reference lib="webworker" />
// Engines for: pages per sheet, overlay, page size, grayscale and image extraction (run inside the PDF worker).
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFRef, PDFHexString, PDFString, PDFStream, PDFPage, BlendMode, rgb, degrees, decodePDFRawStream } from 'pdf-lib';
import { zlibSync } from 'fflate';

const N = (s: string) => PDFName.of(s);
const look = (doc: PDFDocument, o: any) => (o instanceof PDFRef ? doc.context.lookup(o) : o);
const num = (o: any, d = 0) => (o instanceof PDFNumber ? o.asNumber() : d);
const MM = 72 / 25.4;

/** Visible size of a page (after its /Rotate), and the box it is drawn from. */
function pageGeom(p: PDFPage) {
  const b = p.getCropBox(); const rot = ((p.getRotation().angle % 360) + 360) % 360;
  const side = rot === 90 || rot === 270;
  return { box: b, rot, w: side ? b.height : b.width, h: side ? b.width : b.height };
}

/** Draw an embedded page into a target rectangle, upright, scaled to fit (keeping proportions). */
function drawFit(sheet: PDFPage, emb: any, g: ReturnType<typeof pageGeom>, x: number, y: number, w: number, h: number, mode: 'fit' | 'stretch' | 'none' = 'fit', extra: any = {}) {
  let sx = w / g.w, sy = h / g.h;
  if (mode === 'fit') sx = sy = Math.min(sx, sy);
  if (mode === 'none') sx = sy = 1;
  const dw = g.w * sx, dh = g.h * sy;
  const ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
  // embedded pages are not rotated: turn them so they appear the way the page is shown
  const bw = g.box.width * (g.rot % 180 ? sy : sx), bh = g.box.height * (g.rot % 180 ? sx : sy);
  const opts: any = { width: bw, height: bh, ...extra };
  if (g.rot === 0) Object.assign(opts, { x: ox, y: oy });
  else if (g.rot === 90) Object.assign(opts, { x: ox, y: oy + dh, rotate: degrees(-90) });
  else if (g.rot === 180) Object.assign(opts, { x: ox + dw, y: oy + dh, rotate: degrees(180) });
  else Object.assign(opts, { x: ox + dw, y: oy, rotate: degrees(90) });
  sheet.drawPage(emb, opts);
  return { x: ox, y: oy, w: dw, h: dh };
}

// ---------- pages per sheet ----------
export type NupOpts = { n: number; sheet: [number, number] | 'auto'; orient: 'auto' | 'portrait' | 'landscape'; order: 'h' | 'v'; margin: number; gap: number; border: boolean; booklet: boolean; preview?: boolean };
export async function nup(src: PDFDocument, o: NupOpts): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = src.getPages();
  const geoms = pages.map(pageGeom);
  const first = geoms[0] ?? { w: 595, h: 842 };
  let [SW, SH] = o.sheet === 'auto' ? [first.w, first.h].sort((a, b) => a - b) as [number, number] : o.sheet;
  // which grid (cols × rows) and sheet orientation gives the biggest pages
  const grids: [number, number][] = [];
  for (let c = 1; c <= o.n; c++) if (o.n % c === 0) grids.push([c, o.n / c]);
  let best = { s: 0, cols: 1, rows: 1, W: SW, H: SH };
  for (const [W, H] of [[SW, SH], [SH, SW]] as [number, number][]) {
    if (o.orient === 'portrait' && W > H) continue; if (o.orient === 'landscape' && W < H) continue;
    for (const [cols, rows] of o.booklet ? [[2, 1]] as [number, number][] : grids) {
      const cw = (W - 2 * o.margin - (cols - 1) * o.gap) / cols, ch = (H - 2 * o.margin - (rows - 1) * o.gap) / rows;
      const s = Math.min(cw / first.w, ch / first.h);
      if (s > best.s) best = { s, cols, rows, W, H };
    }
  }
  const { cols, rows, W, H } = best;
  const cw = (W - 2 * o.margin - (cols - 1) * o.gap) / cols, ch = (H - 2 * o.margin - (rows - 1) * o.gap) / rows;
  // order of pages on the sheets (booklet: printed on both sides and folded in the middle)
  let seq: (number | null)[] = pages.map((_, i) => i);
  if (o.booklet) {
    const total = Math.ceil(pages.length / 4) * 4; const s: (number | null)[] = [];
    for (let i = 0; i < total / 2; i += 2) { s.push(total - 1 - i, i, i + 1, total - 2 - i); }
    seq = s.map((k) => (k! < pages.length ? k : null));
  }
  const per = cols * rows;
  const sheets = Math.ceil(seq.length / per);
  const limit = o.preview ? Math.min(sheets, 1) : sheets;
  const need = new Set(seq.slice(0, limit * per).filter((x): x is number => x !== null));
  const embedded = new Map<number, any>();
  const list = [...need];
  const bb = (i: number) => { const b = geoms[i].box; return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }; };
  if (list.length) (await out.embedPages(list.map((i) => pages[i]), list.map(bb))).forEach((e, k) => embedded.set(list[k], e));
  for (let s = 0; s < limit; s++) {
    const sheet = out.addPage([W, H]);
    for (let k = 0; k < per; k++) {
      const idx = seq[s * per + k];
      const c = o.order === 'h' ? k % cols : Math.floor(k / rows), r = o.order === 'h' ? Math.floor(k / cols) : k % rows;
      const x = o.margin + c * (cw + o.gap), y = H - o.margin - (r + 1) * ch - r * o.gap;
      if (idx === null || idx === undefined) continue;
      const box = drawFit(sheet, embedded.get(idx), geoms[idx], x, y, cw, ch);
      if (o.border) sheet.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
    }
  }
  return out.save();
}

// ---------- overlay / letterhead ----------
export type OverlayOpts = { where: 'behind' | 'front'; pages: 'all' | 'first' | 'firstdiff' | 'match'; fit: 'stretch' | 'fit' | 'none'; opacity: number; preview?: boolean };
export async function overlay(doc: PDFDocument, ov: { pdf?: PDFDocument; img?: { bytes: Uint8Array; kind: 'png' | 'jpg' } }, o: OverlayOpts): Promise<Uint8Array> {
  const pages = doc.getPages();
  const ovPages = ov.pdf ? ov.pdf.getPages() : [];
  const emb = ov.pdf ? await doc.embedPages(ovPages, ovPages.map((p) => { const b = p.getCropBox(); return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }; })) : [];
  // an isolated group: the letterhead is put together on its own first and only then blended with the page,
  // so its white text on a coloured band stays white instead of taking the band colour
  for (const e of emb) { await e.embed(); const f = (doc.context.lookup(e.ref) as PDFStream).dict; f.set(PDFName.of('Group'), doc.context.obj({ S: 'Transparency', I: true, K: false })); }
  const img = ov.img ? (ov.img.kind === 'png' ? await doc.embedPng(ov.img.bytes) : await doc.embedJpg(ov.img.bytes)) : null;
  const count = o.preview ? Math.min(2, pages.length) : pages.length;
  for (let i = 0; i < count; i++) {
    let k: number | null = 0;
    if (o.pages === 'first') k = i === 0 ? 0 : null;
    else if (o.pages === 'firstdiff') k = i === 0 ? 0 : (ovPages.length > 1 ? 1 : null);
    else if (o.pages === 'match') k = Math.min(i, Math.max(0, (ov.pdf ? ovPages.length : 1) - 1));
    if (k === null) continue;
    const pg = pages[i]; const g = pageGeom(pg);
    // work in the page's own (unrotated) box: the overlay is drawn so it looks upright on screen
    const { box } = g;
    const extra = { opacity: o.opacity, blendMode: o.where === 'behind' ? BlendMode.Multiply : BlendMode.Normal };
    const target = (w: number, h: number) => {
      // size of the overlay in visible orientation
      let sw = g.w / w, sh = g.h / h; if (o.fit === 'fit') sw = sh = Math.min(sw, sh); if (o.fit === 'none') sw = sh = 1;
      return { dw: w * sw, dh: h * sh };
    };
    if (img) {
      const { dw, dh } = target(img.width, img.height);
      drawUpright(pg, g, dw, dh, (x, y, w, h, rot) => pg.drawImage(img, { x, y, width: w, height: h, rotate: degrees(rot), ...extra }));
    } else {
      const ob = emb[k].size ? emb[k] : null; const w0 = ob ? ob.width : 595, h0 = ob ? ob.height : 842;
      const { dw, dh } = target(w0, h0);
      drawUpright(pg, g, dw, dh, (x, y, w, h, rot) => pg.drawPage(emb[k!], { x, y, width: w, height: h, rotate: degrees(rot), ...extra }));
    }
    void box;
  }
  if (o.preview) for (let i = pages.length - 1; i >= count; i--) doc.removePage(i);
  return doc.save();
}

/** Draw something dw × dh (in the page's visible orientation) centred on a page that may have /Rotate. */
function drawUpright(pg: PDFPage, g: ReturnType<typeof pageGeom>, dw: number, dh: number, draw: (x: number, y: number, w: number, h: number, rot: number) => void) {
  const b = g.box; const cx = (g.w - dw) / 2, cy = (g.h - dh) / 2; // offsets in visible space
  if (g.rot === 0) draw(b.x + cx, b.y + cy, dw, dh, 0);
  else if (g.rot === 90) draw(b.x + b.width - cy, b.y + cx, dw, dh, 90);
  else if (g.rot === 180) draw(b.x + b.width - cx, b.y + b.height - cy, dw, dh, 180);
  else draw(b.x + cy, b.y + b.height - cx, dw, dh, 270);
}

// ---------- page size ----------
export type SizeOpts = { size: [number, number]; orient: 'auto' | 'portrait' | 'landscape'; scale: 'fit' | 'none'; margin: number; preview?: boolean };
export async function pageSize(doc: PDFDocument, o: SizeOpts): Promise<Uint8Array> {
  const pages = doc.getPages();
  const count = o.preview ? Math.min(2, pages.length) : pages.length;
  for (let i = 0; i < count; i++) {
    const pg = pages[i]; const g = pageGeom(pg);
    let [W, H] = o.size;
    const land = o.orient === 'landscape' || (o.orient === 'auto' && g.w > g.h);
    if (land !== W > H) [W, H] = [H, W];
    // the page's unrotated space: a sideways page gets a sideways target
    const [UW, UH] = g.rot % 180 ? [H, W] : [W, H];
    const b = g.box;
    let s = o.scale === 'fit' ? Math.min((UW - 2 * o.margin) / b.width, (UH - 2 * o.margin) / b.height) : 1;
    if (!isFinite(s) || s <= 0) s = 1;
    const tx = (UW - b.width * s) / 2 - b.x * s, ty = (UH - b.height * s) / 2 - b.y * s;
    const ctx = doc.context;
    const pre = ctx.register(ctx.flateStream(`q ${s.toFixed(6)} 0 0 ${s.toFixed(6)} ${tx.toFixed(3)} ${ty.toFixed(3)} cm\n`));
    const post = ctx.register(ctx.flateStream('\nQ\n'));
    const cont = pg.node.get(N('Contents'));
    const arr = PDFArray.withContext(ctx); arr.push(pre);
    const old = look(doc, cont); if (old instanceof PDFArray) old.asArray().forEach((x) => arr.push(x)); else if (cont) arr.push(cont);
    arr.push(post);
    pg.node.set(N('Contents'), arr);
    pg.node.set(N('MediaBox'), ctx.obj([0, 0, UW, UH]));
    for (const k of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) pg.node.delete(N(k));
    // move links, comments and form fields with the content
    const annots = look(doc, pg.node.get(N('Annots'))) as PDFArray | undefined;
    annots?.asArray?.().forEach((a) => {
      const ad = look(doc, a) as PDFDict; if (!(ad instanceof PDFDict)) return;
      for (const key of ['Rect', 'QuadPoints']) {
        const r = look(doc, ad.get(N(key))) as PDFArray | undefined; if (!(r instanceof PDFArray)) continue;
        const v = r.asArray().map((x) => num(look(doc, x)));
        ad.set(N(key), ctx.obj(v.map((x, j) => (j % 2 === 0 ? x * s + tx : x * s + ty))));
      }
    });
  }
  if (o.preview) for (let i = pages.length - 1; i >= count; i--) doc.removePage(i);
  return doc.save();
}

// ---------- content-stream colour rewriting (grayscale) ----------
type Tok = { s: number; e: number; t: string; kind: 'num' | 'name' | 'op' | 'other' };
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const cmykL = (c: number, m: number, y: number, k: number) => lum((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
const f3 = (v: number) => (Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000).toString();

function tokens(b: Uint8Array): Tok[] {
  const out: Tok[] = []; let i = 0; const n = b.length;
  const ws = (c: number) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const delim = (c: number) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  const str = (s: number, e: number) => { let t = ''; for (let k = s; k < e; k++) t += String.fromCharCode(b[k]); return t; };
  const skipString = (p: number) => { let d = 0; for (; p < n; p++) { const c = b[p]; if (c === 92) { p++; continue; } if (c === 40) d++; else if (c === 41 && --d === 0) return p + 1; } return n; };
  const skipNested = (p: number, open: number, close: number) => { // arrays [..] and dicts << >>
    let d = 0;
    while (p < n) {
      const c = b[p];
      if (c === 40) { p = skipString(p); continue; }
      if (c === 37) { while (p < n && b[p] !== 10 && b[p] !== 13) p++; continue; }
      if (open === 91) { if (c === 91) d++; else if (c === 93 && --d === 0) return p + 1; p++; continue; }
      if (c === 60 && b[p + 1] === 60) { d++; p += 2; continue; } if (c === 62 && b[p + 1] === 62) { if (--d === 0) return p + 2; p += 2; continue; }
      p++;
    }
    return n;
  };
  while (i < n) {
    const c = b[i];
    if (ws(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    if (c === 40) { const e = skipString(i); out.push({ s: i, e, t: '', kind: 'other' }); i = e; continue; }
    if (c === 91) { const e = skipNested(i, 91, 93); out.push({ s: i, e, t: '', kind: 'other' }); i = e; continue; }
    if (c === 60 && b[i + 1] === 60) { const e = skipNested(i, 60, 62); out.push({ s: i, e, t: '', kind: 'other' }); i = e; continue; }
    if (c === 60) { let e = i; while (e < n && b[e] !== 62) e++; out.push({ s: i, e: e + 1, t: '', kind: 'other' }); i = e + 1; continue; }
    if (c === 47) { let e = i + 1; while (e < n && !ws(b[e]) && !delim(b[e])) e++; out.push({ s: i, e, t: str(i + 1, e), kind: 'name' }); i = e; continue; }
    if (c === 41 || c === 62 || c === 93 || c === 123 || c === 125) { i++; continue; }
    let e = i; while (e < n && !ws(b[e]) && !delim(b[e])) e++;
    const t = str(i, e);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) out.push({ s: i, e, t, kind: 'num' });
    else {
      out.push({ s: i, e, t, kind: 'op' });
      if (t === 'BI') { // inline image: everything up to EI is one piece
        let p = e; for (; p < n - 2; p++) if (b[p] === 73 && b[p + 1] === 68 && ws(b[p + 2])) break;
        let q = p + 3; for (; q < n - 2; q++) if (ws(b[q]) && b[q + 1] === 69 && b[q + 2] === 73 && (q + 3 >= n || ws(b[q + 3]))) break;
        out[out.length - 1].e = Math.min(n, q + 3); out[out.length - 1].t = 'BI…EI'; e = Math.min(n, q + 3);
      }
    }
    i = e;
  }
  return out;
}

type CsKind = { n: number; kind: 'conv' | 'keep' };
export function grayContent(bytes: Uint8Array, resolveCs: (name: string) => CsKind, black: boolean): Uint8Array {
  const toks = tokens(bytes);
  const parts: (Uint8Array | string)[] = []; let last = 0; let ops: Tok[] = [];
  let fill: CsKind = { n: 1, kind: 'conv' }, stroke: CsKind = { n: 1, kind: 'conv' };
  const stack: [CsKind, CsKind][] = [];
  const g = (l: number, isFill: boolean) => f3(black && isFill && l < 0.6 ? 0 : l);
  const replace = (from: number, to: number, text: string) => { parts.push(bytes.subarray(last, from)); parts.push(text); last = to; };
  for (const t of toks) {
    if (t.kind !== 'op') { ops.push(t); continue; }
    const nums = ops.filter((x) => x.kind === 'num').map((x) => +x.t);
    const start = ops.length ? ops[0].s : t.s;
    switch (t.t) {
      case 'q': stack.push([fill, stroke]); break;
      case 'Q': [fill, stroke] = stack.pop() ?? [fill, stroke]; break;
      case 'g': case 'G': if (nums.length === 1 && black && t.t === 'g') replace(start, t.e, `${g(nums[0], true)} g`); if (t.t === 'g') fill = { n: 1, kind: 'conv' }; else stroke = { n: 1, kind: 'conv' }; break;
      case 'rg': case 'RG': if (nums.length === 3) replace(start, t.e, `${g(lum(nums[0], nums[1], nums[2]), t.t === 'rg')} ${t.t === 'rg' ? 'g' : 'G'}`); if (t.t === 'rg') fill = { n: 1, kind: 'conv' }; else stroke = { n: 1, kind: 'conv' }; break;
      case 'k': case 'K': if (nums.length === 4) replace(start, t.e, `${g(cmykL(nums[0], nums[1], nums[2], nums[3]), t.t === 'k')} ${t.t === 'k' ? 'g' : 'G'}`); if (t.t === 'k') fill = { n: 1, kind: 'conv' }; else stroke = { n: 1, kind: 'conv' }; break;
      case 'cs': case 'CS': {
        const nm = ops.find((x) => x.kind === 'name')?.t ?? '';
        const k = resolveCs(nm);
        if (k.kind === 'conv') replace(start, t.e, `/DeviceGray ${t.t}`);
        if (t.t === 'cs') fill = k; else stroke = k;
        break;
      }
      case 'sc': case 'scn': case 'SC': case 'SCN': {
        const cs = t.t === 'sc' || t.t === 'scn' ? fill : stroke;
        const isFill = t.t === 'sc' || t.t === 'scn';
        if (cs.kind === 'conv' && !ops.some((x) => x.kind === 'name')) {
          let l: number | null = null;
          if (cs.n === 3 && nums.length === 3) l = lum(nums[0], nums[1], nums[2]);
          else if (cs.n === 4 && nums.length === 4) l = cmykL(nums[0], nums[1], nums[2], nums[3]);
          else if (cs.n === 1 && nums.length === 1) l = nums[0];
          if (l !== null) replace(start, t.e, `${g(l, isFill)} ${t.t}`);
        }
        break;
      }
    }
    ops = [];
  }
  parts.push(bytes.subarray(last));
  const enc = new TextEncoder();
  const chunks = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** What kind of colour space a resource name or array is: convert to gray, or leave alone. */
function csKind(doc: PDFDocument, cs: any): CsKind {
  cs = look(doc, cs);
  if (cs instanceof PDFName) {
    const s = cs.asString().slice(1);
    if (s === 'DeviceRGB' || s === 'RGB' || s === 'CalRGB') return { n: 3, kind: 'conv' };
    if (s === 'DeviceCMYK' || s === 'CMYK') return { n: 4, kind: 'conv' };
    if (s === 'DeviceGray' || s === 'G' || s === 'CalGray') return { n: 1, kind: 'conv' };
    return { n: 1, kind: 'keep' };
  }
  if (cs instanceof PDFArray) {
    const fam = cs.get(0) instanceof PDFName ? (cs.get(0) as PDFName).asString().slice(1) : '';
    if (fam === 'ICCBased') { const n = num((look(doc, cs.get(1)) as any)?.dict?.get(N('N')), 3); return { n, kind: 'conv' }; }
    if (fam === 'CalRGB' || fam === 'Lab') return { n: 3, kind: fam === 'Lab' ? 'keep' : 'conv' };
    if (fam === 'CalGray') return { n: 1, kind: 'conv' };
  }
  return { n: 1, kind: 'keep' }; // Pattern, Indexed, Separation, DeviceN: converted in their definitions
}

/** Turn colour definitions (palettes, spot colours, gradients) into gray, in place. */
function grayDefinitions(doc: PDFDocument) {
  const fix = (arr: PDFArray) => {
    const fam = arr.get(0) instanceof PDFName ? (arr.get(0) as PDFName).asString().slice(1) : '';
    if (fam === 'Indexed' || fam === 'I') {
      const base = csKind(doc, arr.get(1)); if (base.kind !== 'conv') return;
      const hival = num(look(doc, arr.get(2)), 255);
      let lut: any = look(doc, arr.get(3)); let pal: Uint8Array;
      if (lut instanceof PDFHexString || lut instanceof PDFString) pal = lut.asBytes(); else if (lut instanceof PDFRawStream) pal = decodePDFRawStream(lut).decode(); else return;
      const out = new Uint8Array(hival + 1);
      for (let i = 0; i <= hival; i++) {
        const p = i * base.n;
        out[i] = base.n === 3 ? Math.round(lum(pal[p], pal[p + 1], pal[p + 2])) : base.n === 4 ? Math.round(255 * cmykL(pal[p] / 255, pal[p + 1] / 255, pal[p + 2] / 255, pal[p + 3] / 255)) : pal[p];
      }
      arr.set(1, N('DeviceGray')); arr.set(3, PDFHexString.of([...out].map((v) => v.toString(16).padStart(2, '0')).join('')));
    } else if (fam === 'Separation' || fam === 'DeviceN') {
      const alt = csKind(doc, arr.get(2)); if (alt.kind !== 'conv' || alt.n === 1) return;
      const fn = look(doc, arr.get(3));
      const ins = fam === 'Separation' ? 1 : ((look(doc, arr.get(1)) as PDFArray)?.size() ?? 1);
      const g = grayFunction(doc, fn, alt.n, ins);
      arr.set(2, N('DeviceGray')); arr.set(3, g);
    }
  };
  const fixShading = (sh: PDFDict) => {
    const k = csKind(doc, sh.get(N('ColorSpace')));
    if (k.kind !== 'conv' || k.n === 1) return;
    const fn = look(doc, sh.get(N('Function')));
    if (!fn) return; // mesh shadings keep colour values in their data: left as they are
    if (fn instanceof PDFArray) { // one function per colour component
      const fs = fn.asArray().map((f) => look(doc, f));
      if (fs.length !== k.n || !fs.every((f) => f instanceof PDFDict && num(f.get(N('FunctionType'))) === 2)) return;
      const c0 = fs.map((f: any) => num((look(doc, f.get(N('C0'))) as PDFArray)?.get(0), 0)), c1 = fs.map((f: any) => num((look(doc, f.get(N('C1'))) as PDFArray)?.get(0), 1));
      const l = (v: number[]) => (k.n === 3 ? lum(v[0], v[1], v[2]) : cmykL(v[0], v[1], v[2], v[3]));
      sh.set(N('Function'), doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [l(c0)], C1: [l(c1)], N: num((fs[0] as PDFDict).get(N('N')), 1) }));
    } else sh.set(N('Function'), grayFunction(doc, fn, k.n, 1));
    sh.set(N('ColorSpace'), N('DeviceGray'));
  };
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    const visit = (v: any, depth = 0) => {
      if (depth > 6) return;
      if (v instanceof PDFArray) { fix(v); v.asArray().forEach((x) => (x instanceof PDFArray || x instanceof PDFDict) && visit(x, depth + 1)); }
      else if (v instanceof PDFDict) {
        if (v.get(N('ShadingType'))) fixShading(v);
        for (const [, x] of v.entries()) if (x instanceof PDFArray || x instanceof PDFDict) visit(x, depth + 1);
      }
    };
    if (o instanceof PDFRawStream) { if (o.dict.get(N('ShadingType'))) fixShading(o.dict); visit(o.dict); }
    else visit(o);
  }
}

/** A gray version of a colour function: exact for type 2/3, sampled for others. */
function grayFunction(doc: PDFDocument, fn: any, comps: number, ins: number): any {
  const l = (v: number[]) => (comps === 3 ? lum(v[0], v[1], v[2]) : cmykL(v[0], v[1], v[2], v[3] ?? 0));
  const ctx = doc.context;
  const d = fn instanceof PDFRawStream ? fn.dict : fn;
  const type = num(d?.get?.(N('FunctionType')), -1);
  if (type === 2) {
    const c0 = (look(doc, d.get(N('C0'))) as PDFArray)?.asArray().map((x) => num(x)) ?? Array(comps).fill(0);
    const c1 = (look(doc, d.get(N('C1'))) as PDFArray)?.asArray().map((x) => num(x)) ?? Array(comps).fill(1);
    return ctx.obj({ FunctionType: 2, Domain: (look(doc, d.get(N('Domain'))) as PDFArray)?.asArray().map((x) => num(x)) ?? [0, 1], C0: [l(c0)], C1: [l(c1)], N: num(d.get(N('N')), 1) });
  }
  if (type === 3) {
    const fs = (look(doc, d.get(N('Functions'))) as PDFArray).asArray().map((f) => ctx.register(grayFunction(doc, look(doc, f), comps, 1)));
    const nd = ctx.obj({}); for (const [k, v] of d.entries()) nd.set(k, v); nd.set(N('Functions'), ctx.obj(fs)); return nd;
  }
  if (type === 0 && fn instanceof PDFRawStream && ins === 1 && num(d.get(N('BitsPerSample'))) === 8) {
    const size = num((look(doc, d.get(N('Size'))) as PDFArray)?.get(0), 0); const data = decodePDFRawStream(fn).decode();
    const out = new Uint8Array(size); for (let i = 0; i < size; i++) { const v = [...data.subarray(i * comps, i * comps + comps)].map((x) => x / 255); out[i] = Math.round(255 * l(v)); }
    const st = ctx.flateStream(out, { FunctionType: 0, Domain: (look(doc, d.get(N('Domain'))) as PDFArray)?.asArray().map((x) => num(x)) ?? [0, 1], Range: [0, 1], Size: [size], BitsPerSample: 8 });
    return ctx.register(st);
  }
  // unknown functions (e.g. PostScript): full tint = dark gray, no tint = white
  return ctx.obj({ FunctionType: 2, Domain: Array(ins).fill(0).flatMap(() => [0, 1]).slice(0, 2), C0: [1], C1: [0.15], N: 1 });
}

export async function grayscale(doc: PDFDocument, o: { black: boolean; preview?: boolean }, decodeImage: (st: PDFRawStream) => Promise<{ data: Uint8Array; w: number; h: number; jpeg: boolean } | null>, encodeGrayJpeg: (g: Uint8Array, w: number, h: number) => Promise<Uint8Array>, progress: (d: number, t: number, l: string) => void) {
  const ctx = doc.context;
  if (o.preview) { const n = doc.getPageCount(); for (let i = n - 1; i >= 2; i--) doc.removePage(i); }
  grayDefinitions(doc);
  // 1. drawing instructions: pages, forms, patterns, annotation appearances, Type3 glyphs
  const done = new Set<string>();
  const rewrite = (ref: any, res: any) => {
    const key = ref instanceof PDFRef ? ref.toString() : ''; if (key && done.has(key)) return; if (key) done.add(key);
    const st = look(doc, ref);
    if (!(st instanceof PDFRawStream)) return;
    const r = (look(doc, st.dict.get(N('Resources'))) as PDFDict | undefined) ?? res;
    let data: Uint8Array; try { data = decodePDFRawStream(st).decode(); } catch { return; }
    const csd = look(doc, r?.get(N('ColorSpace'))) as PDFDict | undefined;
    const out = grayContent(data, (name) => csKind(doc, name === 'DeviceRGB' || name === 'DeviceCMYK' || name === 'DeviceGray' || name === 'Pattern' ? N(name) : csd?.get(N(name)) ?? N(name)), o.black);
    const ns = ctx.flateStream(out); for (const [k, v] of st.dict.entries()) if (k !== N('Length') && k !== N('Filter') && k !== N('DecodeParms')) ns.dict.set(k, v);
    if (ref instanceof PDFRef) ctx.assign(ref, ns);
    walkRes(r);
  };
  const walkRes = (res: any) => {
    res = look(doc, res); if (!(res instanceof PDFDict)) return;
    const xo = look(doc, res.get(N('XObject'))) as PDFDict | undefined;
    xo?.entries().forEach(([, v]) => { const s = look(doc, v); if (s instanceof PDFRawStream && s.dict.get(N('Subtype')) === N('Form')) rewrite(v, res); });
    const pat = look(doc, res.get(N('Pattern'))) as PDFDict | undefined;
    pat?.entries().forEach(([, v]) => { const s = look(doc, v); if (s instanceof PDFRawStream && num(s.dict.get(N('PatternType'))) === 1) rewrite(v, res); });
    const fonts = look(doc, res.get(N('Font'))) as PDFDict | undefined;
    fonts?.entries().forEach(([, v]) => { const f = look(doc, v); if (f instanceof PDFDict && f.get(N('Subtype')) === N('Type3')) { const cp = look(doc, f.get(N('CharProcs'))) as PDFDict; cp?.entries().forEach(([, c]) => rewrite(c, look(doc, f.get(N('Resources'))) ?? res)); } });
  };
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    progress(i, pages.length, `Converting page ${i + 1} of ${pages.length}`);
    const res = pg.node.Resources();
    const c = pg.node.get(N('Contents'));
    const list = look(doc, c) instanceof PDFArray ? (look(doc, c) as PDFArray).asArray() : c ? [c] : [];
    // page contents may be split over several streams that only work together: join them first
    if (list.length > 1) {
      const all = list.map((x) => { const s = look(doc, x); try { return s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : new Uint8Array(); } catch { return new Uint8Array(); } });
      const joined = new Uint8Array(all.reduce((a, x) => a + x.length + 1, 0)); let p = 0; for (const x of all) { joined.set(x, p); p += x.length; joined[p++] = 10; }
      const ref = ctx.register(ctx.flateStream(joined)); pg.node.set(N('Contents'), ref); rewrite(ref, res);
    } else if (list[0] instanceof PDFRef) rewrite(list[0], res);
    walkRes(res);
    const annots = look(doc, pg.node.get(N('Annots'))) as PDFArray | undefined;
    annots?.asArray?.().forEach((a) => {
      const ad = look(doc, a) as PDFDict; if (!(ad instanceof PDFDict)) return;
      const colorKeys = ['C', 'IC']; for (const k of colorKeys) { const arr = look(doc, ad.get(N(k))) as PDFArray | undefined; if (arr instanceof PDFArray && arr.size() >= 3) { const v = arr.asArray().map((x) => num(x)); const l2 = v.length === 3 ? lum(v[0], v[1], v[2]) : cmykL(v[0], v[1], v[2], v[3]); ad.set(N(k), ctx.obj([l2])); } }
      const ap = look(doc, ad.get(N('AP'))) as PDFDict | undefined;
      ap?.entries().forEach(([, v]) => { const s = look(doc, v); if (s instanceof PDFRawStream) rewrite(v, res); else if (s instanceof PDFDict) s.entries().forEach(([, w]) => rewrite(w, res)); });
    });
  });
  // 2. pictures
  const imgs = ctx.enumerateIndirectObjects().filter(([, s]) => s instanceof PDFRawStream && s.dict.get(N('Subtype')) === N('Image')) as [PDFRef, PDFRawStream][];
  let k = 0;
  for (const [ref, st] of imgs) {
    progress(k++, imgs.length, `Converting picture ${k} of ${imgs.length}`);
    const d = st.dict;
    if (d.get(N('ImageMask'))) continue;
    const cs = csKind(doc, d.get(N('ColorSpace')));
    if (cs.kind === 'keep' || cs.n === 1) {
      // palettes were already made gray; SMasks are gray anyway
      if (cs.n === 1 && cs.kind === 'conv' && !(d.get(N('ColorSpace')) instanceof PDFName)) d.set(N('ColorSpace'), N('DeviceGray'));
      continue;
    }
    try {
      const px = await decodeImage(st); if (!px) continue;
      const g = new Uint8Array(px.w * px.h); for (let i = 0; i < g.length; i++) g[i] = Math.round(lum(px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]));
      let ns: PDFStream;
      if (px.jpeg) ns = ctx.stream(await encodeGrayJpeg(g, px.w, px.h), { Type: 'XObject', Subtype: 'Image', Width: px.w, Height: px.h, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'DCTDecode' });
      else ns = ctx.stream(zlibSync(g, { level: 9 }), { Type: 'XObject', Subtype: 'Image', Width: px.w, Height: px.h, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' });
      for (const key of ['SMask', 'Mask', 'Interpolate', 'Intent']) { const v = d.get(N(key)); if (v) ns.dict.set(N(key), v); }
      ctx.assign(ref, ns);
    } catch { /* leave this picture as it is */ }
  }
  return doc.save({ useObjectStreams: true });
}

// ---------- image extraction ----------
export type Extracted = { ref: string; bytes: Uint8Array; mime: string; w: number; h: number; pages: number[]; kind: string };
export function imagePages(doc: PDFDocument): Map<string, number[]> {
  const map = new Map<string, Set<number>>();
  const seen = new Set<string>();
  const visit = (res: any, page: number, depth: number) => {
    res = look(doc, res); if (!(res instanceof PDFDict) || depth > 6) return;
    const xo = look(doc, res.get(N('XObject'))) as PDFDict | undefined;
    xo?.entries().forEach(([, v]) => {
      const s = look(doc, v); if (!(s instanceof PDFRawStream) || !(v instanceof PDFRef)) return;
      if (s.dict.get(N('Subtype')) === N('Image')) { const k = v.toString(); if (!map.has(k)) map.set(k, new Set()); map.get(k)!.add(page); }
      else if (s.dict.get(N('Subtype')) === N('Form')) { const key = v.toString() + ':' + page; if (seen.has(key)) return; seen.add(key); visit(s.dict.get(N('Resources')), page, depth + 1); }
    });
  };
  doc.getPages().forEach((p, i) => visit(p.node.Resources(), i + 1, 0));
  return new Map([...map].map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
}
