/// <reference lib="webworker" />
import { PDFDocument, degrees, rgb, StandardFonts, LineCapStyle, pushGraphicsState, popGraphicsState, setCharacterSqueeze, setCharacterSpacing } from 'pdf-lib';

type Msg =
  | { op: 'annotate'; file: ArrayBuffer; items: any[] }
  | { op: 'edit'; file: ArrayBuffer; kind: string; o: any }
  | { op: 'merge'; files: ArrayBuffer[] }
  | { op: 'count'; file: ArrayBuffer }
  | { op: 'build'; file: ArrayBuffer; pages: { src: number; rot: number }[] }
  | { op: 'split'; file: ArrayBuffer; ranges: [number, number][] }
  | { op: 'images'; images: { bytes: ArrayBuffer; kind: 'jpg' | 'png'; w: number; h: number }[]; page: 'fit' | 'a4' | 'letter'; orientation: 'auto' | 'portrait' | 'landscape'; margin: number };

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
    if (m.op === 'annotate') {
      const doc = await load(m.file);
      const pages = doc.getPages();
      const hex = (h: string) => { const n = parseInt((h || '#000000').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
      const fonts = new Map<string, any>();
      const font = async (name: string) => { if (!fonts.has(name)) fonts.set(name, await doc.embedFont((StandardFonts as any)[name])); return fonts.get(name); };
      const imgs = new Map<string, any>();
      for (let i = 0; i < m.items.length; i++) {
        const it = m.items[i];
        const pg = pages[it.page];
        if (!pg) continue;
        if (it.type === 'text') {
          const f = await font(it.font);
          const special = it.hs || it.cs;
          if (special) pg.pushOperators(pushGraphicsState(), setCharacterSqueeze((it.hs || 1) * 100), setCharacterSpacing(it.cs || 0));
          for (const ln of it.lines) if (ln.text) pg.drawText(ln.text, { x: ln.x, y: ln.y, size: it.size, font: f, color: hex(it.color), rotate: degrees(it.rot) });
          if (special) pg.pushOperators(popGraphicsState());
        } else if (it.type === 'rect') {
          pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h,
            ...(it.fill ? { color: hex(it.color), opacity: it.opacity } : { borderColor: hex(it.color), borderWidth: it.width, borderOpacity: it.opacity }) });
        } else if (it.type === 'ink') {
          for (let k = 1; k < it.points.length; k++) {
            const [x1, y1] = it.points[k - 1], [x2, y2] = it.points[k];
            pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: it.width, color: hex(it.color), lineCap: LineCapStyle.Round });
          }
        } else if (it.type === 'image') {
          let img = imgs.get(it.key);
          if (!img) { img = it.kind === 'png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes); imgs.set(it.key, img); }
          pg.drawImage(img, { x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot) });
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
