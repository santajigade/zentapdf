/// <reference lib="webworker" />
import { PDFDocument, degrees, rgb, StandardFonts, LineCapStyle, pushGraphicsState, popGraphicsState, setCharacterSqueeze, setCharacterSpacing, beginText, endText, setFontAndSize, showText, setTextMatrix, setFillingRgbColor, PDFHexString, PDFName, PDFRef } from 'pdf-lib';
import { originalFont, type Encoder } from './origFont';

type Msg =
  | { op: 'plus'; kind: 'nup' | 'overlay' | 'pagesize' | 'grayscale' | 'extract' | 'repair' | 'remove'; file: ArrayBuffer; o: any; ov?: ArrayBuffer; ovKind?: 'pdf' | 'png' | 'jpg' }
  | { op: 'compress'; file: ArrayBuffer; sets: import('./compressImages').Settings[] }
  | { op: 'annotate'; file: ArrayBuffer; items: any[]; fonts?: Record<string, ArrayBuffer> }
  | { op: 'edit'; file: ArrayBuffer; kind: string; o: any }
  | { op: 'merge'; files: ArrayBuffer[] }
  | { op: 'count'; file: ArrayBuffer }
  | { op: 'build'; file: ArrayBuffer; pages: { src: number; rot: number }[] }
  | { op: 'split'; file: ArrayBuffer; ranges: [number, number][] }
  | { op: 'images'; images: { bytes: ArrayBuffer; kind: 'jpg' | 'png'; w: number; h: number }[]; page: 'fit' | 'a4' | 'letter'; orientation: 'auto' | 'portrait' | 'landscape'; margin: number };

import { compressPdf } from './compressImages';
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);
const progress = (done: number, total: number, label = '') => post({ type: 'progress', done, total, label });

async function load(buf: ArrayBuffer) {
  return PDFDocument.load(buf, { updateMetadata: false });
}

function stamp(doc: PDFDocument) {
  doc.setProducer('ZentaPDF');
  doc.setCreator('ZentaPDF');
}

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  try {
    if (m.op === 'plus') { await plus(m); return; }
    if (m.op === 'count') {
      const doc = await load(m.file);
      post({ type: 'result', pages: doc.getPageCount() });
      return;
    }
    if (m.op === 'merge') {
      const out = await PDFDocument.create();
      for (let i = 0; i < m.files.length; i++) {
        progress(i, m.files.length, `Adding file ${i + 1} of ${m.files.length}`);
        let src: PDFDocument;
        try { src = await load(m.files[i]); }
        catch (e: any) { throw new Error(`File ${i + 1}: ${e?.message ?? e}`); }
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        (m.files as any)[i] = null; // free memory
      }
      progress(m.files.length, m.files.length, 'Saving…');
      stamp(out);
      const bytes = await out.save();
      post({ type: 'result', files: [bytes] }, [bytes.buffer]);
      return;
    }
    if (m.op === 'compress') {
      const doc = await load(m.file);
      const r = await compressPdf(doc, m.sets, (d, t, l) => progress(d, t, l));
      const files = r.outs.map((o) => o.bytes);
      post({ type: 'result', files, stats: { images: r.images, changed: r.outs.map((o) => o.changed), dups: r.dups } }, files.map((f) => f.buffer));
      return;
    }
    if (m.op === 'annotate') {
      const doc = await load(m.file);
      const pages = doc.getPages();
      const hex = (h: string) => { const n = parseInt((h || '#000000').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
      const fonts = new Map<string, any>();
      const font = async (name: string) => { if (!fonts.has(name)) fonts.set(name, await doc.embedFont((StandardFonts as any)[name])); return fonts.get(name); };
      // real font files (Unicode: ₹, accents, symbols): text that the main font lacks is drawn with the symbol font
      const files = m.fonts ?? {};
      if (Object.keys(files).length) { const fontkit = (await import('@pdf-lib/fontkit')).default; doc.registerFontkit(fontkit); }
      const ttf = new Map<string, { pdf: any; has: (cp: number) => boolean }>();
      const origCache = new Map<string, Encoder | null>();
      const tfont = async (name: string) => {
        if (!ttf.has(name)) { const pdf = await doc.embedFont(files[name], { subset: false }); const set = new Set<number>((pdf as any).embedder.font.characterSet); ttf.set(name, { pdf, has: (cp) => set.has(cp) }); }
        return ttf.get(name)!;
      };
      const runs = async (text: string, main: string, sym?: string) => {
        const a = await tfont(main); const b = sym && files[sym] ? await tfont(sym) : null;
        const out: { t: string; f: any }[] = [];
        for (const ch of text) { const cp = ch.codePointAt(0)!; const f = a.has(cp) || !b || !b.has(cp) ? a.pdf : b.pdf; const last = out[out.length - 1]; if (last && last.f === f) last.t += ch; else out.push({ t: ch, f }); }
        // characters no font has: drop them rather than fail
        return out.map((r) => ({ ...r, t: [...r.t].filter((c) => r.f === a.pdf ? a.has(c.codePointAt(0)!) || c === ' ' : true).join('') })).filter((r) => r.t);
      };
      const imgs = new Map<string, any>();
      for (let i = 0; i < m.items.length; i++) {
        const it = m.items[i];
        const pg = pages[it.page];
        if (!pg) continue;
        if (it.type === 'text') {
          if (it.orig && it.fitText && it.fitW) {
            // with the original font the widths already match: work out squeeze/letter spacing again for that font
            const k = `${it.page}|${it.orig}`;
            if (!origCache.has(k)) { try { origCache.set(k, originalFont(doc, pg, it.orig)); } catch { origCache.set(k, null); } }
            const enc0 = origCache.get(k);
            if (enc0) {
              const ch = [...it.fitText]; let wn = 0, ok = true;
              for (const c of ch) { const e = enc0.encode(c); if (e) wn += e.w; else if (c === ' ') wn += enc0.space; else { ok = false; break; } }
              wn *= it.size;
              if (ok && wn > 0) {
                if (it.cs) it.cs = Math.max(0, (it.fitW - wn) / ch.length), it.hs = undefined;
                else { const r = it.fitW / wn; it.hs = Math.abs(r - 1) > 0.03 && r > 0.6 && r < 1.25 ? r : undefined; }
              }
            }
          }
          const special = it.hs || it.cs;
          if (special) pg.pushOperators(pushGraphicsState(), setCharacterSqueeze((it.hs || 1) * 100), setCharacterSpacing(it.cs || 0));
          const opacity = it.opacity ?? 1;
          if (it.file) {
            const a = (it.rot * Math.PI) / 180;
            // edited original text: use the PDF's own font for every character it has
            let enc: Encoder | null = null;
            if (it.orig) { const k = `${it.page}|${it.orig}`; if (!origCache.has(k)) { try { origCache.set(k, originalFont(doc, pg, it.orig)); } catch { origCache.set(k, null); } } enc = origCache.get(k)!; }
            const col = hex(it.color);
            for (const ln of it.lines) {
              if (!ln.text) continue;
              let off = 0;
              const chars = [...ln.text];
              let i2 = 0;
              while (i2 < chars.length) {
                // longest run the original font can show
                if (enc) {
                  let hexs = '', w = 0, n = 0;
                  while (i2 < chars.length) {
                    const e = enc.encode(chars[i2]);
                    if (!e) { if (chars[i2] === ' ') { if (hexs) break; off += enc.space * it.size * (it.hs || 1) + (it.cs || 0); i2++; continue; } break; }
                    hexs += e.hex; w += e.w; n++; i2++;
                  }
                  if (hexs) {
                    pg.pushOperators(pushGraphicsState(), setFillingRgbColor(col.red, col.green, col.blue), beginText(), setFontAndSize(enc.key, it.size),
                      setTextMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), ln.x + off * Math.cos(a), ln.y + off * Math.sin(a)), showText(PDFHexString.of(hexs)), endText(), popGraphicsState());
                    off += w * it.size * (it.hs || 1) + (it.cs || 0) * n;
                    continue;
                  }
                }
                // the rest: the closest matching font file (with the symbol font for ₹, ✓ and so on)
                let j = i2 + 1; if (enc) while (j < chars.length && !enc.encode(chars[j]) && chars[j] !== ' ') j++; else j = chars.length;
                for (const r of await runs(chars.slice(i2, j).join(''), it.file, it.sym)) {
                  pg.drawText(r.t, { x: ln.x + off * Math.cos(a), y: ln.y + off * Math.sin(a), size: it.size, font: r.f, color: col, rotate: degrees(it.rot), opacity });
                  off += r.f.widthOfTextAtSize(r.t, it.size) * (it.hs || 1) + (it.cs || 0) * [...r.t].length;
                }
                i2 = j;
              }
            }
          } else {
            const f = await font(it.font);
            for (const ln of it.lines) if (ln.text) pg.drawText(ln.text, { x: ln.x, y: ln.y, size: it.size, font: f, color: hex(it.color), rotate: degrees(it.rot), opacity });
          }
          if (special) pg.pushOperators(popGraphicsState());
        } else if (it.type === 'ellipse') {
          pg.drawEllipse({ x: it.x + it.w / 2, y: it.y + it.h / 2, xScale: it.w / 2, yScale: it.h / 2,
            ...(it.fill ? { color: hex(it.color), opacity: it.opacity } : { borderColor: hex(it.color), borderWidth: it.width, borderOpacity: it.opacity }) });
        } else if (it.type === 'line') {
          const [x1, y1] = it.a, [x2, y2] = it.b;
          pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: it.width, color: hex(it.color), opacity: it.opacity, lineCap: LineCapStyle.Round });
          if (it.arrow) {
            const ang = Math.atan2(y2 - y1, x2 - x1), L = Math.max(8, it.width * 4), sp = 0.45;
            const p1 = [x2 - L * Math.cos(ang - sp), y2 - L * Math.sin(ang - sp)], p2 = [x2 - L * Math.cos(ang + sp), y2 - L * Math.sin(ang + sp)];
            // drawSvgPath uses a y-down system starting at (x, y)
            pg.drawSvgPath(`M ${x2} ${-y2} L ${p1[0]} ${-p1[1]} L ${p2[0]} ${-p2[1]} Z`, { x: 0, y: 0, color: hex(it.color), opacity: it.opacity });
          }
        } else if (it.type === 'rect') {
          pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h,
            ...(it.fill ? { color: hex(it.color), opacity: it.opacity } : { borderColor: hex(it.color), borderWidth: it.width, borderOpacity: it.opacity }) });
        } else if (it.type === 'ink') {
          for (let k = 1; k < it.points.length; k++) {
            const [x1, y1] = it.points[k - 1], [x2, y2] = it.points[k];
            pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: it.width, color: hex(it.color), opacity: it.opacity ?? 1, lineCap: LineCapStyle.Round });
          }
        } else if (it.type === 'image') {
          let img = imgs.get(it.key);
          if (!img) { img = it.kind === 'png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes); imgs.set(it.key, img); }
          pg.drawImage(img, { x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot), opacity: it.opacity ?? 1 });
        }
        if (i % 20 === 0) progress(i, m.items.length, 'Saving your changes…');
      }
      stamp(doc);
      const bytes = await doc.save();
      post({ type: 'result', files: [bytes] }, [bytes.buffer]);
      return;
    }
    if (m.op === 'edit') {
      const doc = await load(m.file);
      const o = m.o;
      const pages = doc.getPages();
      const hex = (h: string) => { const n = parseInt((h || '#000000').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
      if (m.kind === 'meta-read') {
        post({ type: 'result', meta: { title: doc.getTitle() ?? '', author: doc.getAuthor() ?? '', subject: doc.getSubject() ?? '', keywords: doc.getKeywords() ?? '', creator: doc.getCreator() ?? '', producer: doc.getProducer() ?? '' }, pages: pages.length });
        return;
      }
      if (m.kind === 'numbers') {
        const font = await doc.embedFont(o.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
        const total = pages.length;
        pages.forEach((pg, i) => {
          if (o.skipFirst && i === 0) return;
          const n = o.start + i - (o.skipFirst ? 1 : 0);
          const label = o.format === 'of' ? `${n} of ${total - (o.skipFirst ? 1 : 0) + o.start - 1}` : o.format === 'page' ? `Page ${n}` : String(n);
          const { width, height } = pg.getSize();
          const tw = font.widthOfTextAtSize(label, o.size);
          const m = 28;
          const x = o.pos.endsWith('l') ? m : o.pos.endsWith('r') ? width - m - tw : (width - tw) / 2;
          const y = o.pos.startsWith('t') ? height - m - o.size : m;
          pg.drawText(label, { x, y, size: o.size, font, color: hex(o.color) });
          if (i % 25 === 0) progress(i, total, 'Adding numbers…');
        });
      } else if (m.kind === 'watermark') {
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const img = o.image ? (o.image.kind === 'png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes)) : null;
        pages.forEach((pg, i) => {
          const { width, height } = pg.getSize();
          if (img) {
            const s = Math.min((width * o.scale) / img.width, (height * o.scale) / img.height);
            const w = img.width * s, h = img.height * s;
            pg.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h, opacity: o.opacity });
          } else {
            const size = o.size, tw = font.widthOfTextAtSize(o.text, size);
            const a = (o.angle * Math.PI) / 180;
            const draw = (cx: number, cy: number) => pg.drawText(o.text, { x: cx - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: cy - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a), size, font, color: hex(o.color), opacity: o.opacity, rotate: degrees(o.angle) });
            if (o.tile) { for (let y = height * 0.15; y < height; y += height / 3) for (let x = width * 0.25; x < width; x += width / 2) draw(x, y); }
            else draw(width / 2, height / 2);
          }
          if (i % 25 === 0) progress(i, pages.length, 'Adding watermark…');
        });
      } else if (m.kind === 'crop') {
        const mm = 72 / 25.4;
        for (const pg of pages) {
          const b = pg.getCropBox();
          const l = o.l * mm, r = o.r * mm, t = o.t * mm, bt = o.b * mm;
          const w = b.width - l - r, h = b.height - t - bt;
          if (w < 10 || h < 10) throw new Error('The margins are larger than the page. Please use smaller values.');
          pg.setCropBox(b.x + l, b.y + bt, w, h);
          pg.setMediaBox(b.x + l, b.y + bt, w, h);
        }
      } else if (m.kind === 'flatten') {
        const form = doc.getForm();
        const n = form.getFields().length;
        form.flatten();
        o._fields = n;
      } else if (m.kind === 'meta-write') {
        doc.setTitle(o.title); doc.setAuthor(o.author); doc.setSubject(o.subject);
        doc.setKeywords(o.keywords.split(',').map((k: string) => k.trim()).filter(Boolean));
        doc.setCreator(o.creator); doc.setProducer(o.producer || 'ZentaPDF'); doc.setModificationDate(new Date());
        const bytes = await doc.save();
        post({ type: 'result', files: [bytes] }, [bytes.buffer]);
        return;
      }
      stamp(doc);
      const bytes = await doc.save();
      post({ type: 'result', files: [bytes], fields: o._fields }, [bytes.buffer]);
      return;
    }
    if (m.op === 'build') {
      const src = await load(m.file);
      const out = await PDFDocument.create();
      const used = [...new Set(m.pages.filter((p) => p.src >= 0).map((p) => p.src))];
      const copied = new Map<number, any>();
      (await out.copyPages(src, used)).forEach((pg, i) => copied.set(used[i], pg));
      let lastSize: [number, number] = [595.28, 841.89];
      const first = m.pages.find((p) => p.src >= 0);
      if (first) { const s0 = src.getPage(first.src).getSize(); lastSize = [s0.width, s0.height]; }
      for (let i = 0; i < m.pages.length; i++) {
        if (i % 20 === 0) progress(i, m.pages.length, 'Building PDF…');
        const p = m.pages[i];
        if (p.src < 0) { out.addPage(lastSize); continue; }
        let pg = copied.get(p.src);
        if (!pg) continue;
        if (out.getPages().includes(pg)) pg = (await out.copyPages(src, [p.src]))[0]; // same page used twice
        const base = pg.getRotation().angle || 0;
        if (p.rot) pg.setRotation(degrees((((base + p.rot) % 360) + 360) % 360));
        out.addPage(pg);
        const sz = pg.getSize(); lastSize = [sz.width, sz.height];
      }
      stamp(out);
      const bytes = await out.save();
      post({ type: 'result', files: [bytes] }, [bytes.buffer]);
      return;
    }
    if (m.op === 'split') {
      const src = await load(m.file);
      const results: Uint8Array[] = [];
      for (let i = 0; i < m.ranges.length; i++) {
        progress(i, m.ranges.length, `Creating part ${i + 1} of ${m.ranges.length}`);
        const [a, b] = m.ranges[i];
        const out = await PDFDocument.create();
        const idx = Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k);
        const pages = await out.copyPages(src, idx);
        pages.forEach((p) => out.addPage(p));
        stamp(out);
        results.push(await out.save());
      }
      post({ type: 'result', files: results }, results.map((r) => r.buffer));
      return;
    }
    if (m.op === 'images') {
      const out = await PDFDocument.create();
      const sizes = { a4: [595.28, 841.89], letter: [612, 792] } as const;
      for (let i = 0; i < m.images.length; i++) {
        progress(i, m.images.length, `Adding image ${i + 1} of ${m.images.length}`);
        const im = m.images[i];
        const img = im.kind === 'jpg' ? await out.embedJpg(im.bytes) : await out.embedPng(im.bytes);
        const iw = im.w || img.width, ih = im.h || img.height;
        let pw: number, ph: number;
        const margin = m.margin;
        if (m.page === 'fit') {
          // 1 image px = 0.75pt (96 DPI); cap very large pages to 200in (PDF limit)
          const s = Math.min(0.75, 14400 / Math.max(iw, ih));
          pw = iw * s + margin * 2; ph = ih * s + margin * 2;
        } else {
          [pw, ph] = sizes[m.page];
          const landscape = m.orientation === 'landscape' || (m.orientation === 'auto' && iw > ih);
          if (landscape) [pw, ph] = [ph, pw];
        }
        const page = out.addPage([pw, ph]);
        const boxW = pw - margin * 2, boxH = ph - margin * 2;
        const s = Math.min(boxW / iw, boxH / ih);
        const dw = iw * s, dh = ih * s;
        page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh, rotate: degrees(0) });
        (m.images as any)[i] = null;
      }
      progress(m.images.length, m.images.length, 'Saving…');
      stamp(out);
      const bytes = await out.save();
      post({ type: 'result', files: [bytes] }, [bytes.buffer]);
      return;
    }
  } catch (e: any) {
    post({ type: 'error', message: String(e?.message ?? e), name: e?.name });
  }
};

// ---------- tools in src/lib/pdfplus.ts ----------
async function plus(m: any) {
  const P = await import('./pdfplus');
  const send = (bytes: Uint8Array, extra: any = {}) => post({ type: 'result', files: [bytes], ...extra }, [bytes.buffer]);
  if (m.kind === 'repair') {
    // gentle repair: let pdf-lib rebuild the file structure from whatever objects it can read
    const doc = await PDFDocument.load(m.file, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false } as any);
    if (!doc.getPageCount()) throw new Error('No pages could be recovered.');
    stamp(doc); send(await doc.save({ useObjectStreams: false }), { pages: doc.getPageCount() }); return;
  }
  const doc = await load(m.file);
  if (m.kind === 'remove') {
    const del: number[] = [...m.o.pages].sort((a: number, b: number) => b - a);
    for (const i of del) doc.removePage(i);
    stamp(doc); send(await doc.save({ useObjectStreams: true })); return;
  }
  if (m.kind === 'nup') { const b = await P.nup(doc, m.o); send(b); return; }
  if (m.kind === 'pagesize') { stamp(doc); send(await P.pageSize(doc, m.o)); return; }
  if (m.kind === 'overlay') {
    const ov = m.ovKind === 'pdf' ? { pdf: await load(m.ov) } : { img: { bytes: new Uint8Array(m.ov), kind: m.ovKind } };
    stamp(doc); send(await P.overlay(doc, ov as any, m.o)); return;
  }
  if (m.kind === 'grayscale') {
    const C = await import('./compressImages');
    const toRGBA = async (st: any) => {
      const d = st.dict; const w = d.get(PDFName.of('Width'))?.asNumber?.() ?? 0, h = d.get(PDFName.of('Height'))?.asNumber?.() ?? 0;
      if (d.get(PDFName.of('BitsPerComponent'))?.asNumber?.() !== 8) return null;
      const ci = C.colorInfo(doc, d.get(PDFName.of('ColorSpace'))); if (!ci) return null;
      const f = C.filters(d);
      const pic = await C.decodeImage(doc, st, w, h, ci, f); if (!pic) return null;
      let data: Uint8ClampedArray;
      if (pic instanceof ImageData) data = pic.data; else { const c = new OffscreenCanvas(pic.width, pic.height); const x = c.getContext('2d')!; x.drawImage(pic, 0, 0); data = x.getImageData(0, 0, c.width, c.height).data; pic.close(); }
      return { data: data as unknown as Uint8Array, w, h, jpeg: f.length === 1 && f[0] === '/DCTDecode' };
    };
    const enc = await grayJpeg();
    stamp(doc); send(await P.grayscale(doc, m.o, toRGBA, enc, (d, t, l) => progress(d, t, l))); return;
  }
  if (m.kind === 'extract') { await extract(doc, m.o); return; }
}

let jpegEnc: ((g: Uint8Array, w: number, h: number) => Promise<Uint8Array>) | null = null;
/** Grayscale JPEG encoder (MozJPEG): one colour channel, so gray pictures stay small. */
async function grayJpeg() {
  if (jpegEnc) return jpegEnc;
  try {
    const mod = await import('@jsquash/jpeg/encode.js' as any);
    const wasmUrl = (await import('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url' as any)).default;
    await mod.init({ locateFile: () => wasmUrl });
    jpegEnc = async (g, w, h) => {
      const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < g.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g[i]; rgba[i * 4 + 3] = 255; }
      return new Uint8Array(await mod.default(new ImageData(rgba, w, h), { quality: 85, color_space: 1 }));
    };
  } catch {
    // fallback: browser JPEG (stored as RGB gray)
    jpegEnc = async (g, w, h) => {
      const c = new OffscreenCanvas(w, h); const x = c.getContext('2d')!; const id = x.createImageData(w, h);
      for (let i = 0; i < g.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g[i]; id.data[i * 4 + 3] = 255; }
      x.putImageData(id, 0, 0); return new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).arrayBuffer());
    };
  }
  return jpegEnc;
}

/** Every picture in the PDF, at its original quality. JPEG photos are given back exactly as stored. */
async function extract(doc: PDFDocument, o: { minSize: number }) {
  const C = await import('./compressImages');
  const P = await import('./pdfplus');
  const { PDFRawStream: RS, PDFRef: RF, decodePDFRawStream } = await import('pdf-lib');
  const N = (s: string) => PDFName.of(s);
  const pagesOf = P.imagePages(doc);
  const all = doc.context.enumerateIndirectObjects().filter(([, s]) => s instanceof RS && (s as any).dict.get(N('Subtype')) === N('Image')) as [any, any][];
  const masks = new Set<string>(); all.forEach(([, s]) => { const m2 = s.dict.get(N('SMask')); if (m2 instanceof RF) masks.add(m2.toString()); });
  const out: any[] = []; const skipped: any[] = []; const transfer: ArrayBuffer[] = [];
  const seen = new Map<string, boolean>();
  let k = 0;
  for (const [ref, st] of all) {
    progress(k++, all.length, `Reading picture ${k} of ${all.length}`);
    const key = ref.toString(); if (masks.has(key)) continue;
    const d = st.dict; const w = d.get(N('Width'))?.asNumber?.() ?? 0, h = d.get(N('Height'))?.asNumber?.() ?? 0;
    if (w < o.minSize && h < o.minSize) continue;
    const pages = pagesOf.get(key) ?? [];
    if (!pages.length && o.minSize > 0) continue; // not shown anywhere
    // identical pictures stored twice: give them once
    const sig = `${w}x${h}:${st.contents.length}:${st.contents[0]}:${st.contents[st.contents.length >> 1]}:${st.contents[st.contents.length - 1]}`;
    if (seen.has(sig)) continue; seen.set(sig, true);
    const f = C.filters(d); const bpc = d.get(N('BitsPerComponent'))?.asNumber?.() ?? 8;
    const ci = d.get(N('ImageMask')) ? null : C.colorInfo(doc, d.get(N('ColorSpace')));
    const smask = d.get(N('SMask'));
    try {
      if (f.length === 1 && f[0] === '/DCTDecode' && ci && (ci.kind === 'rgb' || ci.kind === 'gray') && !smask && !d.get(N('Decode'))) {
        const b = st.contents.slice(); out.push({ ref: key, bytes: b, mime: 'image/jpeg', w, h, pages, kind: 'JPEG (original)' }); transfer.push(b.buffer); continue;
      }
      let rgba: Uint8ClampedArray | null = null;
      if (ci && bpc === 8) {
        const pic = await C.decodeImage(doc, st, w, h, ci, f);
        if (pic) { if (pic instanceof ImageData) rgba = pic.data; else { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d')!; x.drawImage(pic, 0, 0, w, h); rgba = x.getImageData(0, 0, w, h).data; pic.close(); } }
      } else if (bpc === 1 && f.every((x: string) => x === '/FlateDecode' || x === '/LZWDecode' || x === '/RunLengthDecode') ) {
        // black-and-white pictures (scans, line art)
        const raw = decodePDFRawStream(st).decode(); const row = Math.ceil(w / 8); rgba = new Uint8ClampedArray(w * h * 4);
        const dec = d.get(N('Decode')); const inv = !!(dec && dec.get?.(0)?.asNumber?.() === 1) !== !!d.get(N('ImageMask'));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bit = (raw[y * row + (x >> 3)] >> (7 - (x & 7))) & 1; const v = (bit ? 255 : 0) ^ (inv ? 255 : 0); const q = (y * w + x) * 4; rgba[q] = rgba[q + 1] = rgba[q + 2] = v; rgba[q + 3] = 255; }
      }
      if (!rgba) { skipped.push({ ref: key, w, h, pages, filter: f.join(' ') }); continue; }
      let alpha = false;
      if (smask) {
        const ms = look2(doc, smask);
        if (ms instanceof RS) {
          const mw = ms.dict.get(N('Width'))?.asNumber?.() ?? 0, mh = ms.dict.get(N('Height'))?.asNumber?.() ?? 0;
          const mf = C.filters(ms.dict);
          let a: Uint8Array | null = null;
          if (mf.length === 1 && mf[0] === '/DCTDecode') { const b2 = await createImageBitmap(new Blob([ms.contents as BlobPart], { type: 'image/jpeg' })); const c = new OffscreenCanvas(w, h); const x = c.getContext('2d')!; x.drawImage(b2, 0, 0, w, h); b2.close(); const dd = x.getImageData(0, 0, w, h).data; a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = dd[i * 4]; }
          else if (ms.dict.get(N('BitsPerComponent'))?.asNumber?.() === 8) {
            const raw = C.unpredict(decodePDFRawStream(ms).decode(), mw, 1, ms.dict.get(N('DecodeParms'))?.get?.(N('Predictor'))?.asNumber?.() ?? 1);
            if (mw === w && mh === h) a = raw; else { const src = new Uint8ClampedArray(mw * mh * 4); for (let i = 0; i < mw * mh; i++) { src[i * 4] = src[i * 4 + 1] = src[i * 4 + 2] = raw[i]; src[i * 4 + 3] = 255; } const b2 = await createImageBitmap(new ImageData(src, mw, mh)); const c = new OffscreenCanvas(w, h); const x = c.getContext('2d')!; x.drawImage(b2, 0, 0, w, h); b2.close(); const dd = x.getImageData(0, 0, w, h).data; a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = dd[i * 4]; }
          }
          if (a) { for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = a[i]; alpha = true; }
        }
      }
      const c = new OffscreenCanvas(w, h); c.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
      const photo = f.length === 1 && f[0] === '/DCTDecode' && !alpha; // CMYK photos: give a normal RGB JPEG
      const blob = await c.convertToBlob(photo ? { type: 'image/jpeg', quality: 0.95 } : { type: 'image/png' });
      const b = new Uint8Array(await blob.arrayBuffer());
      out.push({ ref: key, bytes: b, mime: blob.type, w, h, pages, kind: photo ? 'JPEG (CMYK converted)' : alpha ? 'PNG (transparent)' : 'PNG (lossless)' }); transfer.push(b.buffer);
    } catch { skipped.push({ ref: key, w, h, pages, filter: f.join(' ') }); }
  }
  post({ type: 'result', images: out, skipped }, transfer);
}
const look2 = (doc: PDFDocument, o: any) => (o instanceof PDFRef ? doc.context.lookup(o) : o);
