/// <reference lib="webworker" />
import { PDFDocument, degrees } from 'pdf-lib';

type Msg =
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
