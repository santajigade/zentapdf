/// <reference lib="webworker" />
// Basic PDF compression: re-encode embedded raster images as smaller JPEGs (runs inside a Web Worker).
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict, PDFRef, PDFBool, decodePDFRawStream } from 'pdf-lib';

export const LEVELS = {
  low: { maxPx: 2400, q: 0.82 },
  recommended: { maxPx: 1600, q: 0.68 },
  extreme: { maxPx: 1100, q: 0.5 },
} as const;

const N = (s: string) => PDFName.of(s);

function num(o: any): number | undefined { return o instanceof PDFNumber ? o.asNumber() : undefined; }

/** Returns number of colour components (1 or 3) if supported, else 0. */
function components(doc: PDFDocument, cs: any): number {
  if (cs instanceof PDFRef) cs = doc.context.lookup(cs);
  if (cs === N('DeviceRGB')) return 3;
  if (cs === N('DeviceGray')) return 1;
  if (cs instanceof PDFArray && cs.get(0) === N('ICCBased')) {
    const st = doc.context.lookup(cs.get(1)) as any;
    const n = num(st?.dict?.get(N('N')));
    return n === 3 || n === 1 ? n : 0;
  }
  return 0;
}

function filters(dict: PDFDict): string[] {
  const f = dict.get(N('Filter'));
  if (!f) return [];
  if (f instanceof PDFArray) return f.asArray().map((x: any) => x.asString?.() ?? String(x));
  return [(f as any).asString?.() ?? String(f)];
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

async function toBitmap(doc: PDFDocument, st: PDFRawStream, w: number, h: number, comps: number, f: string[]): Promise<ImageBitmap | null> {
  if (f.length === 1 && f[0] === '/DCTDecode') return createImageBitmap(new Blob([st.contents as BlobPart], { type: 'image/jpeg' }));
  if (f.length === 1 && f[0] === '/FlateDecode') {
    let data = decodePDFRawStream(st).decode();
    const parms = st.dict.lookup(N('DecodeParms')) as PDFDict | undefined;
    const pred = parms ? num(parms.get(N('Predictor'))) ?? 1 : 1;
    if (pred > 1 && pred < 10) return null; // TIFF predictor: not supported
    data = unpredict(data, w, comps, pred);
    if (data.length < w * h * comps) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0, s = 0; p < w * h; p++) {
      if (comps === 3) { rgba[p * 4] = data[s++]; rgba[p * 4 + 1] = data[s++]; rgba[p * 4 + 2] = data[s++]; }
      else { const g = data[s++]; rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = g; }
      rgba[p * 4 + 3] = 255;
    }
    return createImageBitmap(new ImageData(rgba, w, h));
  }
  return null;
}

export async function compressImages(doc: PDFDocument, level: keyof typeof LEVELS, progress: (d: number, t: number) => void) {
  const { maxPx, q } = LEVELS[level];
  const imgs = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && (o as PDFRawStream).dict.get(N('Subtype')) === N('Image')) as [PDFRef, PDFRawStream][];
  let changed = 0, saved = 0;
  for (let k = 0; k < imgs.length; k++) {
    progress(k, imgs.length);
    const [ref, st] = imgs[k]; const d = st.dict;
    try {
      const w = num(d.get(N('Width'))) ?? 0, h = num(d.get(N('Height'))) ?? 0;
      if (w * h < 60_000) continue; // tiny images: not worth it
      if (d.get(N('ImageMask')) === PDFBool.True || d.get(N('Decode')) || num(d.get(N('BitsPerComponent'))) !== 8) continue;
      const comps = components(doc, d.get(N('ColorSpace')));
      if (!comps) continue;
      const f = filters(d);
      const hasMask = !!(d.get(N('SMask')) || d.get(N('Mask')));
      const bmp = await toBitmap(doc, st, w, h, comps, f);
      if (!bmp) continue;
      const s = hasMask ? 1 : Math.min(1, maxPx / Math.max(w, h)); // masked images keep their size so the mask still fits
      const nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s));
      const c = new OffscreenCanvas(nw, nh); const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, nw, nh);
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, nw, nh); bmp.close();
      const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer());
      if (jpg.length >= st.contents.length * 0.95) continue; // not worth replacing
      const nd: Record<string, any> = { Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' };
      const ns = doc.context.stream(jpg, nd);
      for (const key of ['SMask', 'Mask', 'Intent', 'Interpolate']) { const v = d.get(N(key)); if (v) ns.dict.set(N(key), v); }
      saved += st.contents.length - jpg.length;
      doc.context.assign(ref, ns); changed++;
    } catch { /* leave this image unchanged */ }
  }
  progress(imgs.length, imgs.length);
  return { images: imgs.length, changed, saved };
}
