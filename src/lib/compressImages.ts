/// <reference lib="webworker" />
// PDF compression engine (runs inside a Web Worker).
// 1. Finds how big every image is shown on its page, and resamples it to the target resolution (DPI).
// 2. Re-encodes photos as JPEG (RGB, grey, CMYK and palette images, with transparency masks).
// 3. Replaces huge embedded colour profiles, removes duplicate images and fonts, and drops private editor data.
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict, PDFRef, PDFBool, PDFHexString, PDFString, decodePDFRawStream, PDFStream } from 'pdf-lib';
import { zlibSync } from 'fflate';

export type Level = 'low' | 'recommended' | 'extreme' | 'custom';
export type Settings = { dpi: number; q: number; meta: boolean; icc: number };
export const LEVELS: Record<Exclude<Level, 'custom'>, Settings> = {
  low: { dpi: 220, q: 0.82, meta: false, icc: 200_000 },
  recommended: { dpi: 150, q: 0.72, meta: true, icc: 60_000 },
  extreme: { dpi: 96, q: 0.55, meta: true, icc: 20_000 },
};

const N = (s: string) => PDFName.of(s);
const num = (o: any): number | undefined => (o instanceof PDFNumber ? o.asNumber() : undefined);
const look = (doc: PDFDocument, o: any) => (o instanceof PDFRef ? doc.context.lookup(o) : o);

function filters(dict: PDFDict): string[] {
  const f = dict.get(N('Filter'));
  if (!f) return [];
  if (f instanceof PDFArray) return f.asArray().map((x: any) => x.asString?.() ?? String(x));
  return [(f as any).asString?.() ?? String(f)];
}

// ---------- 1. where and how big each image is drawn ----------
type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

function contentBytes(doc: PDFDocument, c: any): Uint8Array[] {
  c = look(doc, c);
  if (!c) return [];
  if (c instanceof PDFArray) return c.asArray().flatMap((x) => contentBytes(doc, x));
  if (c instanceof PDFRawStream) { try { return [decodePDFRawStream(c).decode()]; } catch { return []; } }
  if (c instanceof PDFStream) { try { return [(c as any).getContents()]; } catch { return []; } }
  return [];
}

/** Tokenise a content stream and report every image drawn ("Do") with the current transform. */
function walk(bytes: Uint8Array, onDo: (name: string, m: M) => void) {
  let i = 0; const n = bytes.length;
  const stack: M[] = []; let ctm: M = [1, 0, 0, 1, 0, 0];
  const ops: (number | string)[] = [];
  const ws = (c: number) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const delim = (c: number) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  while (i < n) {
    const c = bytes[i];
    if (ws(c)) { i++; continue; }
    if (c === 37) { while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++; continue; } // comment
    if (c === 40) { let d = 0; for (; i < n; i++) { const b = bytes[i]; if (b === 92) { i++; continue; } if (b === 40) d++; else if (b === 41 && --d === 0) { i++; break; } } ops.push('(s)'); continue; }
    if (c === 60 && bytes[i + 1] === 60) { i += 2; ops.push('<<'); continue; }
    if (c === 62 && bytes[i + 1] === 62) { i += 2; ops.push('>>'); continue; }
    if (c === 60) { while (i < n && bytes[i] !== 62) i++; i++; ops.push('<h>'); continue; }
    if (c === 91 || c === 93 || c === 123 || c === 125) { i++; continue; }
    if (c === 47) { let j = i + 1; while (j < n && !ws(bytes[j]) && !delim(bytes[j])) j++; ops.push(String.fromCharCode(...bytes.subarray(i, j))); i = j; continue; }
    let j = i; while (j < n && !ws(bytes[j]) && !delim(bytes[j])) j++;
    if (j === i) { i++; continue; }
    const tok = String.fromCharCode(...bytes.subarray(i, j)); i = j;
    const v = +tok;
    if (!isNaN(v) && /^[-+.\d]/.test(tok)) { ops.push(v); continue; }
    // operator
    if (tok === 'q') stack.push(ctm.slice() as M);
    else if (tok === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (tok === 'cm') { const a = ops.slice(-6) as number[]; if (a.length === 6 && a.every((x) => typeof x === 'number')) ctm = mul(a as M, ctm); }
    else if (tok === 'Do') { const nm = ops[ops.length - 1]; if (typeof nm === 'string' && nm.startsWith('/')) onDo(nm.slice(1), ctm); }
    else if (tok === 'BI') { // inline image: skip its binary data up to "EI"
      const k = (() => { for (let p = i; p < n - 2; p++) if (bytes[p] === 73 && bytes[p + 1] === 68 && ws(bytes[p + 2])) return p + 3; return n; })();
      let p = k; for (; p < n - 2; p++) if (ws(bytes[p]) && bytes[p + 1] === 69 && bytes[p + 2] === 73 && (p + 3 >= n || ws(bytes[p + 3]))) break;
      i = p + 3;
    }
    ops.length = 0;
  }
}

/** For every image object: the largest size (in points) it is shown at. */
export function imagePlacements(doc: PDFDocument): Map<string, { w: number; h: number }> {
  const out = new Map<string, { w: number; h: number }>();
  let budget = 4000;
  const visit = (content: Uint8Array[], res: PDFDict | undefined, base: M, depth: number) => {
    if (!res || depth > 8 || budget-- < 0) return;
    const xo = look(doc, res.get(N('XObject'))) as PDFDict | undefined;
    if (!(xo instanceof PDFDict)) return;
    for (const b of content) walk(b, (name, m) => {
      const ref = xo.get(N(name));
      const obj = look(doc, ref) as PDFRawStream | undefined;
      if (!obj || !(obj as any).dict) return;
      const st = obj.dict.get(N('Subtype'));
      const full = mul(m, base);
      if (st === N('Image') && ref instanceof PDFRef) {
        const w = Math.hypot(full[0], full[1]), h = Math.hypot(full[2], full[3]);
        const k = ref.toString(); const o = out.get(k);
        out.set(k, { w: Math.max(o?.w ?? 0, w), h: Math.max(o?.h ?? 0, h) });
      } else if (st === N('Form')) {
        const mx = (obj.dict.lookup(N('Matrix')) as PDFArray | undefined)?.asArray().map((x: any) => num(x) ?? 0) as M | undefined;
        const r2 = (look(doc, obj.dict.get(N('Resources'))) as PDFDict | undefined) ?? res;
        visit(contentBytes(doc, obj), r2, mx && mx.length === 6 ? mul(mx, full) : full, depth + 1);
      }
    });
  };
  for (const page of doc.getPages()) {
    const node = page.node;
    let res = node.Resources() as PDFDict | undefined;
    if (!res) { let p: any = node.Parent(); while (p && !res) { res = look(doc, p.get(N('Resources'))); p = look(doc, p.get(N('Parent'))); } }
    visit(contentBytes(doc, node.get(N('Contents'))), res, [1, 0, 0, 1, 0, 0], 0);
    // annotation appearances (stamps, signatures)
    const annots = look(doc, node.get(N('Annots'))) as PDFArray | undefined;
    annots?.asArray?.().forEach((a) => {
      const ad = look(doc, a) as PDFDict; const ap = look(doc, ad?.get?.(N('AP'))) as PDFDict | undefined; const nap = look(doc, ap?.get(N('N')));
      if (nap instanceof PDFRawStream && nap.dict.get(N('Subtype')) === N('Form')) {
        const rect = (look(doc, ad.get(N('Rect'))) as PDFArray)?.asArray().map((x: any) => num(x) ?? 0) ?? [0, 0, 100, 100];
        const bb = (look(doc, nap.dict.get(N('BBox'))) as PDFArray)?.asArray().map((x: any) => num(x) ?? 0) ?? [0, 0, 1, 1];
        const sx = Math.abs(rect[2] - rect[0]) / Math.max(1, Math.abs(bb[2] - bb[0])), sy = Math.abs(rect[3] - rect[1]) / Math.max(1, Math.abs(bb[3] - bb[1]));
        visit(contentBytes(doc, nap), look(doc, nap.dict.get(N('Resources'))), [sx, 0, 0, sy, 0, 0], 1);
      }
    });
  }
  return out;
}

// ---------- 2. images ----------
type ColorInfo = { comps: number; kind: 'rgb' | 'gray' | 'cmyk' | 'indexed'; palette?: Uint8Array; base?: number; hival?: number };
function colorInfo(doc: PDFDocument, cs: any): ColorInfo | null {
  cs = look(doc, cs);
  if (cs === N('DeviceRGB') || cs === N('CalRGB')) return { comps: 3, kind: 'rgb' };
  if (cs === N('DeviceGray') || cs === N('CalGray')) return { comps: 1, kind: 'gray' };
  if (cs === N('DeviceCMYK')) return { comps: 4, kind: 'cmyk' };
  if (cs instanceof PDFArray) {
    const fam = cs.get(0);
    if (fam === N('ICCBased')) { const st = look(doc, cs.get(1)) as any; const n = num(st?.dict?.get(N('N'))); return n === 3 ? { comps: 3, kind: 'rgb' } : n === 1 ? { comps: 1, kind: 'gray' } : n === 4 ? { comps: 4, kind: 'cmyk' } : null; }
    if (fam === N('CalRGB')) return { comps: 3, kind: 'rgb' };
    if (fam === N('CalGray')) return { comps: 1, kind: 'gray' };
    if (fam === N('Indexed') || fam === N('I')) {
      const base = colorInfo(doc, cs.get(1)); const hival = num(look(doc, cs.get(2))) ?? 255;
      if (!base || base.kind === 'indexed') return null;
      let lut: any = look(doc, cs.get(3)); let pal: Uint8Array;
      if (lut instanceof PDFHexString) pal = lut.asBytes(); else if (lut instanceof PDFString) pal = lut.asBytes();
      else if (lut instanceof PDFRawStream) pal = decodePDFRawStream(lut).decode(); else return null;
      return { comps: 1, kind: 'indexed', palette: pal, base: base.comps, hival };
    }
  }
  return null;
}

/** Undo PNG predictors (Predictor >= 10) on decoded Flate data. */
function unpredict(data: Uint8Array, w: number, comps: number, predictor: number): Uint8Array {
  if (predictor < 10) return data;
  const bpp = comps, row = w * comps, rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(row * rows);
  let prev = new Uint8Array(row), i = 0;
  for (let r = 0; r < rows; r++) {
    const type = data[i++]; const cur = out.subarray(r * row, (r + 1) * row);
    for (let x = 0; x < row; x++) {
      const raw = data[i++], a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw;
      if (type === 1) v = raw + a; else if (type === 2) v = raw + b; else if (type === 3) v = raw + ((a + b) >> 1);
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
    prev = cur;
  }
  return out;
}

/** Remove EXIF, XMP, Photoshop and comment segments from a JPEG (the picture itself is untouched). */
function stripJpeg(b: Uint8Array): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)]; let i = 2;
  while (i < b.length - 4) {
    if (b[i] !== 0xff) return b;
    const mk = b[i + 1];
    if (mk === 0xda) { parts.push(b.subarray(i)); break; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const drop = (mk >= 0xe1 && mk <= 0xed) || mk === 0xef || mk === 0xfe; // APP1..APP13, APP15, COM (keep JFIF APP0, Adobe APP14)
    if (!drop) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const n = parts.reduce((a, p) => a + p.length, 0); if (n >= b.length) return b;
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
/** Does a JPEG carry the Adobe APP14 marker? */
export function hasAdobe(b: Uint8Array) {
  for (let i = 2; i < Math.min(b.length - 12, 65536);) {
    if (b[i] !== 0xff) return false;
    const mk = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (mk === 0xee && b[i + 4] === 0x41 && b[i + 5] === 0x64 && b[i + 6] === 0x6f && b[i + 7] === 0x62 && b[i + 8] === 0x65) return true;
    if (mk === 0xda) return false;
    i += 2 + len;
  }
  return false;
}
const cmykToRgb = (c: number, m: number, y: number, k: number) => [255 - Math.min(255, c + k), 255 - Math.min(255, m + k), 255 - Math.min(255, y + k)];

/** Decode an image stream to RGBA pixels (or a bitmap for JPEG). */
async function decodeImage(doc: PDFDocument, st: PDFRawStream, w: number, h: number, ci: ColorInfo, f: string[]): Promise<ImageBitmap | ImageData | null> {
  const d = st.dict;
  if (f.length === 1 && (f[0] === '/DCTDecode' || f[0] === '/DCT')) {
    if (ci.kind === 'indexed') return null;
    // CMYK JPEGs: the browser decodes them, but PDFs from Photoshop store inverted values (Decode [1 0 1 0 ...]).
    const dec = look(doc, d.get(N('Decode'))) as PDFArray | undefined;
    if (ci.kind === 'cmyk') {
      // CMYK photos: browsers guess the colour inversion wrongly, so use the pdf.js JPEG decoder (it follows the PDF rules)
      const { JpegImage } = await import('pdfjs-dist/image_decoders/pdf.image_decoders.mjs' as any);
      let decodeTransform: Int32Array | undefined;
      if (dec) { const v = dec.asArray().map((x: any) => num(x) ?? 0); if (v.length >= 8 && v.some((x, i) => x !== (i % 2 ? 1 : 0))) { decodeTransform = new Int32Array(8); for (let k = 0; k < 4; k++) { const lo = v[2 * k], hi = v[2 * k + 1]; decodeTransform[2 * k] = Math.round((hi - lo) * 256); decodeTransform[2 * k + 1] = Math.round(lo * 255); } } }
      const j = new JpegImage({ decodeTransform, colorTransform: undefined });
      j.parse(st.contents);
      const rgba = j.getData({ width: j.width, height: j.height, forceRGBA: true, isSourcePDF: true }) as Uint8ClampedArray;
      return new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, j.width * j.height * 4), j.width, j.height);
    }
    if (dec) return null;
    return createImageBitmap(new Blob([st.contents as BlobPart], { type: 'image/jpeg' }));
  }
  if (!f.every((x) => x === '/FlateDecode' || x === '/Fl' || x === '/LZWDecode' || x === '/LZW')) return null;
  if (d.get(N('Decode'))) return null;
  let data = decodePDFRawStream(st).decode();
  const parms = (look(doc, d.get(N('DecodeParms'))) as PDFDict | undefined);
  const pp = parms instanceof PDFArray ? (look(doc, parms.get(0)) as PDFDict) : parms;
  const pred = pp ? num(pp.get(N('Predictor'))) ?? 1 : 1;
  if (pred > 1 && pred < 10) return null; // TIFF predictor: rare
  data = unpredict(data, w, ci.comps, pred);
  if (data.length < w * h * ci.comps) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, s = 0; p < w * h; p++) {
    let r: number, g: number, b: number;
    if (ci.kind === 'rgb') { r = data[s++]; g = data[s++]; b = data[s++]; }
    else if (ci.kind === 'gray') { r = g = b = data[s++]; }
    else if (ci.kind === 'cmyk') { [r, g, b] = cmykToRgb(data[s], data[s + 1], data[s + 2], data[s + 3]); s += 4; }
    else { const ix = Math.min(data[s++], ci.hival!) * ci.base!; const pal = ci.palette!; if (ci.base === 3) { r = pal[ix]; g = pal[ix + 1]; b = pal[ix + 2]; } else if (ci.base === 1) { r = g = b = pal[ix]; } else { [r, g, b] = cmykToRgb(pal[ix], pal[ix + 1], pal[ix + 2], pal[ix + 3]); } }
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = 255;
  }
  return new ImageData(rgba, w, h);
}

/** Few colours and sharp edges (logos, diagrams, screenshots) look bad as JPEG: keep those lossless. */
function isGraphic(id: ImageData): boolean {
  const p = id.data; const step = Math.max(1, Math.floor(p.length / 4 / 20000));
  const seen = new Set<number>();
  for (let k = 0; k < p.length; k += 4 * step) { seen.add((p[k] >> 3) << 10 | (p[k + 1] >> 3) << 5 | (p[k + 2] >> 3)); if (seen.size > 600) return false; }
  return true;
}

async function toCanvas(src: ImageBitmap | ImageData, nw: number, nh: number) {
  const c = new OffscreenCanvas(nw, nh); const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, nw, nh); ctx.imageSmoothingQuality = 'high';
  if (src instanceof ImageData) {
    if (src.width === nw && src.height === nh) ctx.putImageData(src, 0, 0);
    else { const b = await createImageBitmap(src); ctx.drawImage(b, 0, 0, nw, nh); b.close(); }
  } else ctx.drawImage(src, 0, 0, nw, nh);
  return c;
}

/** Resample a soft mask (transparency) to the new image size and store it with Flate. */
async function resizeMask(doc: PDFDocument, ref: any, nw: number, nh: number): Promise<PDFRef | null> {
  const m = look(doc, ref) as PDFRawStream;
  if (!(m instanceof PDFRawStream)) return null;
  const w = num(m.dict.get(N('Width'))) ?? 0, h = num(m.dict.get(N('Height'))) ?? 0;
  if (w === nw && h === nh) return ref;
  if (num(m.dict.get(N('BitsPerComponent'))) !== 8) return null;
  const f = filters(m.dict);
  let gray: Uint8Array;
  if (f.length === 1 && f[0] === '/DCTDecode') {
    const b = await createImageBitmap(new Blob([m.contents as BlobPart], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(nw, nh); const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, nw, nh); b.close();
    const d = x.getImageData(0, 0, nw, nh).data; gray = new Uint8Array(nw * nh); for (let k = 0; k < gray.length; k++) gray[k] = d[k * 4];
  } else {
    if (!f.every((x) => x === '/FlateDecode' || x === '/LZWDecode')) return null;
    const pp = look(doc, m.dict.get(N('DecodeParms'))) as PDFDict | undefined;
    const raw = unpredict(decodePDFRawStream(m).decode(), w, 1, pp ? num(pp.get(N('Predictor'))) ?? 1 : 1);
    if (raw.length < w * h) return null;
    const rgba = new Uint8ClampedArray(w * h * 4); for (let k = 0; k < w * h; k++) { rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = raw[k]; rgba[k * 4 + 3] = 255; }
    const b = await createImageBitmap(new ImageData(rgba, w, h));
    const c = new OffscreenCanvas(nw, nh); const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, nw, nh); b.close();
    const d = x.getImageData(0, 0, nw, nh).data; gray = new Uint8Array(nw * nh); for (let k = 0; k < gray.length; k++) gray[k] = d[k * 4];
  }
  const st = doc.context.flateStream(gray, { Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceGray', BitsPerComponent: 8 });
  return doc.context.register(st);
}

type Variant = { stream: PDFRawStream | null };
/** Work out the new version of every image for each set of settings (decoding each image once). */
export async function planImages(doc: PDFDocument, sets: Settings[], progress: (d: number, t: number) => void) {
  const place = imagePlacements(doc);
  const imgs = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && (o as PDFRawStream).dict.get(N('Subtype')) === N('Image')) as [PDFRef, PDFRawStream][];
  // soft masks are handled together with their image
  const masks = new Set<string>();
  imgs.forEach(([, st]) => { const sm = st.dict.get(N('SMask')); if (sm instanceof PDFRef) masks.add(sm.toString()); });
  const plan = new Map<string, (PDFRawStream | null)[]>();
  let done = 0;
  for (const [ref, st] of imgs) {
    progress(done++, imgs.length);
    if (masks.has(ref.toString())) continue;
    const d = st.dict;
    try {
      const w = num(d.get(N('Width'))) ?? 0, h = num(d.get(N('Height'))) ?? 0;
      if (d.get(N('ImageMask')) === PDFBool.True || num(d.get(N('BitsPerComponent'))) !== 8) continue;
      if (d.get(N('Mask')) instanceof PDFArray) continue; // colour-key transparency
      const ci = colorInfo(doc, d.get(N('ColorSpace')));
      if (!ci) continue;
      const f = filters(d);
      const isJpeg = f.length === 1 && f[0] === '/DCTDecode';
      if (w * h < 40_000) {
        // small pictures (icons, bullets): JPEG headers are often bigger than the picture, so store them losslessly
        if (!isJpeg || st.contents.length < 400) continue;
        const pic = await decodeImage(doc, st, w, h, ci, f); if (!pic) continue;
        const c = await toCanvas(pic, w, h); if (pic instanceof ImageBitmap) pic.close();
        const px = c.getContext('2d')!.getImageData(0, 0, w, h).data;
        let gray = true; for (let k = 0; k < px.length && gray; k += 4) if (px[k] !== px[k + 1] || px[k] !== px[k + 2]) gray = false;
        const raw = new Uint8Array(w * h * (gray ? 1 : 3));
        for (let p2 = 0; p2 < w * h; p2++) { if (gray) raw[p2] = px[p2 * 4]; else { raw[p2 * 3] = px[p2 * 4]; raw[p2 * 3 + 1] = px[p2 * 4 + 1]; raw[p2 * 3 + 2] = px[p2 * 4 + 2]; } }
        const z = zlibSync(raw, { level: 9 });
        const stripped = stripJpeg(st.contents);
        let out: PDFRawStream | null = null;
        if (z.length < Math.min(stripped.length, st.contents.length) * 0.9) out = doc.context.stream(z, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: gray ? 'DeviceGray' : 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' }) as unknown as PDFRawStream;
        else if (stripped.length < st.contents.length * 0.95) { out = doc.context.stream(stripped, {}) as unknown as PDFRawStream; for (const [k2, v] of d.entries()) if (k2 !== N('Length')) out.dict.set(k2, v); }
        if (out) { const sm = d.get(N('SMask')); if (sm) out.dict.set(N('SMask'), sm); plan.set(ref.toString(), sets.map(() => out)); }
        continue;
      }
      const pic = await Promise.race([decodeImage(doc, st, w, h, ci, f), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
      if (!pic) continue;
      const graphic = !(f[0] === '/DCTDecode') && pic instanceof ImageData && isGraphic(pic);
      const pl = place.get(ref.toString());
      const vs: (PDFRawStream | null)[] = [];
      const cache = new Map<string, PDFRawStream | null>();
      for (const s of sets) {
        // target pixels from the size it is shown at; unknown placement: assume a full A4 page width
        const tw = pl ? (pl.w / 72) * s.dpi : 8.3 * s.dpi, th = pl ? (pl.h / 72) * s.dpi : 11.7 * s.dpi;
        let k = Math.min(1, Math.max(tw / w, th / h));
        if (k > 0.9) k = 1;
        const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
        const key = `${nw}x${nh}@${s.q}`;
        if (cache.has(key)) { vs.push(cache.get(key)!); continue; }
        let out: PDFRawStream | null = null;
        if (graphic) {
          // logos and diagrams: only resample, keep lossless (Flate)
          if (k < 1) {
            const c = await toCanvas(pic, nw, nh); const px = c.getContext('2d')!.getImageData(0, 0, nw, nh).data;
            const rgb = new Uint8Array(nw * nh * 3); for (let p = 0; p < nw * nh; p++) { rgb[p * 3] = px[p * 4]; rgb[p * 3 + 1] = px[p * 4 + 1]; rgb[p * 3 + 2] = px[p * 4 + 2]; }
            const z = zlibSync(rgb, { level: 9 });
            if (z.length < st.contents.length * 0.9) out = doc.context.stream(z, { Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' }) as unknown as PDFRawStream;
          }
        } else {
          const c = await toCanvas(pic, nw, nh);
          const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: s.q })).arrayBuffer());
          if (jpg.length >= st.contents.length * 0.9 && isJpeg && k === 1) {
            const stripped = stripJpeg(st.contents);
            if (stripped.length < st.contents.length * 0.98) { out = doc.context.stream(stripped, {}) as unknown as PDFRawStream; for (const [k2, v] of d.entries()) if (k2 !== N('Length')) out.dict.set(k2, v); }
            cache.set(key, out); vs.push(out); continue;
          }
          if (jpg.length < st.contents.length * 0.9) out = doc.context.stream(jpg, { Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }) as unknown as PDFRawStream;
        }
        if (out) {
          for (const key2 of ['Intent', 'Interpolate', 'Metadata']) { const v = d.get(N(key2)); if (v && key2 !== 'Metadata') out.dict.set(N(key2), v); }
          const sm = d.get(N('SMask'));
          if (sm) { const nm = await resizeMask(doc, sm, nw, nh); if (nm) out.dict.set(N('SMask'), nm); else out = null; }
        }
        cache.set(key, out); vs.push(out);
      }
      if (pic instanceof ImageBitmap) pic.close();
      if (vs.some(Boolean)) plan.set(ref.toString(), vs);
    } catch { /* leave this image unchanged */ }
  }
  progress(imgs.length, imgs.length);
  return { plan, refs: new Map(imgs.map(([r, s]) => [r.toString(), [r, s] as const])), total: imgs.length - masks.size };
}

// ---------- 3. clean-up that does not change how pages look ----------
/** Replace very large embedded colour profiles (often 1 to 3 MB from print workflows) with the plain device colour space. */
export function shrinkProfiles(doc: PDFDocument, maxBytes: number) {
  const big = new Map<string, string>();
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFRawStream && o.dict.get(N('N')) && o.contents.length > maxBytes && !o.dict.get(N('Subtype')) && !o.dict.get(N('Type'))) {
      const n = num(o.dict.get(N('N')));
      big.set(ref.toString(), n === 4 ? 'DeviceCMYK' : n === 1 ? 'DeviceGray' : 'DeviceRGB');
    }
  }
  if (!big.size) return 0;
  const swap = (v: any): any => {
    const a = look(doc, v);
    if (a instanceof PDFArray && a.size() === 2 && a.get(0) === N('ICCBased') && a.get(1) instanceof PDFRef && big.has(a.get(1).toString())) return N(big.get(a.get(1).toString())!);
    return v;
  };
  const walkObj = (o: any, depth = 0) => {
    if (depth > 8 || !o) return;
    if (o instanceof PDFDict) for (const [k, v] of o.entries()) { const nv = swap(v); if (nv !== v) o.set(k, nv); else if (v instanceof PDFDict || v instanceof PDFArray) walkObj(v, depth + 1); }
    else if (o instanceof PDFArray) o.asArray().forEach((v, i) => { const nv = swap(v); if (nv !== v) o.set(i, nv); else if (v instanceof PDFDict || v instanceof PDFArray) walkObj(v, depth + 1); });
  };
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
    const nv = swap(o);
    if (nv !== o) { doc.context.assign(ref, nv); continue; }
    walkObj(o instanceof PDFRawStream ? o.dict : o);
  }
  // output intents point to the profile directly: drop them (used for print proofing only)
  doc.catalog.delete(N('OutputIntents'));
  for (const k of big.keys()) { const [n, g] = k.split(' ').map(Number); doc.context.delete(PDFRef.of(n, g)); }
  return big.size;
}

/** Point duplicate streams (same image or font embedded many times) to one copy. */
export function dedupe(doc: PDFDocument) {
  const seen = new Map<string, PDFRef>(); const remap = new Map<string, PDFRef>();
  const hash = (b: Uint8Array) => { let h1 = 0x811c9dc5, h2 = 0; const step = Math.max(1, Math.floor(b.length / 4096)); for (let i = 0; i < b.length; i += step) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = (h2 + b[i] * (i + 1)) | 0; } return `${b.length}:${h1 >>> 0}:${h2 >>> 0}`; };
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream)) continue;
    const t = o.dict.get(N('Type')), st = o.dict.get(N('Subtype'));
    const isImg = st === N('Image'), isFont = !!(o.dict.get(N('Length1')) || o.dict.get(N('Length2')) || st === N('Type1C') || st === N('CIDFontType0C') || st === N('OpenType'));
    if (!isImg && !isFont) continue;
    if (t === N('Metadata')) continue;
    const key = hash(o.contents) + '|' + o.dict.toString().replace(/\/Length \d+/, '');
    const first = seen.get(key);
    if (first) { const a = doc.context.lookup(first) as PDFRawStream; if (a.contents.length === o.contents.length && a.contents.every((x, i) => x === o.contents[i])) remap.set(ref.toString(), first); }
    else seen.set(key, ref);
  }
  if (!remap.size) return 0;
  const fix = (v: any) => (v instanceof PDFRef && remap.has(v.toString()) ? remap.get(v.toString())! : v);
  const walkObj = (o: any, depth = 0) => {
    if (depth > 10 || !o) return;
    if (o instanceof PDFDict) for (const [k, v] of o.entries()) { const nv = fix(v); if (nv !== v) o.set(k, nv); else walkObj(v, depth + 1); }
    else if (o instanceof PDFArray) o.asArray().forEach((v, i) => { const nv = fix(v); if (nv !== v) o.set(i, nv); else walkObj(v, depth + 1); });
  };
  for (const [, o] of doc.context.enumerateIndirectObjects()) walkObj(o instanceof PDFRawStream ? o.dict : o);
  for (const k of remap.keys()) { const [n, g] = k.split(' ').map(Number); doc.context.delete(PDFRef.of(n, g)); }
  return remap.size;
}

/** Remove data only the editing app needs: Illustrator/InDesign private data, page thumbnails, XMP metadata. */
export function stripExtras(doc: PDFDocument, meta: boolean) {
  const cat = doc.catalog;
  cat.delete(N('PieceInfo'));
  for (const p of doc.getPages()) { p.node.delete(N('PieceInfo')); p.node.delete(N('Thumb')); }
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    const d = o instanceof PDFDict ? o : (o as any)?.dict instanceof PDFDict ? (o as any).dict : null;
    if (!d) continue;
    d.delete(N('PieceInfo'));
    if (meta && d !== cat && d.get(N('Type')) !== N('Metadata')) d.delete(N('Metadata'));
  }
  if (meta) cat.delete(N('Metadata'));
}

/** Compress with several settings at once (each image is decoded only once). Settings must go from gentle to strong. */
export async function compressPdf(doc: PDFDocument, sets: Settings[], progress: (d: number, t: number, label: string) => void) {
  stripExtras(doc, false);
  const dups = dedupe(doc);
  const { plan, refs, total } = await planImages(doc, sets, (d, t) => progress(d, t, `Optimising image ${Math.min(d + 1, t)} of ${t}`));
  const outs: { bytes: Uint8Array; changed: number }[] = [];
  for (let i = 0; i < sets.length; i++) {
    progress(i, sets.length, 'Saving…');
    const s = sets[i]; let changed = 0;
    for (const [k, [ref, orig]] of refs) {
      const v = plan.get(k)?.[i];
      doc.context.assign(ref, v ?? orig); if (v) changed++;
    }
    if (s.meta) stripExtras(doc, true);
    shrinkProfiles(doc, s.icc);
    const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    outs.push({ bytes, changed });
  }
  return { outs, images: total, dups };
}
