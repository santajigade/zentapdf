// A small document layout engine: turns simple blocks (headings, paragraphs, lists, tables, images, code)
// into a real PDF with selectable text. Text in scripts that need shaping (Hindi, Arabic, Thai…) or emoji
// is drawn by the browser onto a canvas and placed as an image, so every language displays correctly.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type Run = { text: string; bold?: boolean; italic?: boolean; mono?: boolean; link?: boolean };
export type Block =
  | { t: 'h'; level: number; runs: Run[] }
  | { t: 'p'; runs: Run[]; indent?: number; bullet?: string; quote?: boolean }
  | { t: 'pre'; text: string; mono?: boolean }
  | { t: 'img'; blob: Blob }
  | { t: 'table'; rows: string[][]; header?: boolean }
  | { t: 'hr' }
  | { t: 'break' };

export type DocOptions = { page?: 'a4' | 'letter'; landscape?: boolean | 'auto'; margin?: number; size?: number };

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
// Scripts that pdf-lib cannot shape, plus emoji → draw with the browser instead.
const COMPLEX = /[֐-ࣿऀ-෿฀-࿿က-႟ក-៿぀-ヿ㐀-鿿가-힯豈-﫿יִ-﷿ﹰ-﻿]|\p{Extended_Pictographic}/u;

let fontBytes: Promise<ArrayBuffer[]> | null = null;
const loadFonts = () => (fontBytes ??= Promise.all(['DejaVuSans', 'DejaVuSans-Bold', 'DejaVuSans-Oblique', 'DejaVuSansMono'].map((n) => fetch(`/fonts/${n}.ttf`).then((r) => { if (!r.ok) throw new Error('Could not load fonts. Check your internet connection and try again.'); return r.arrayBuffer(); }))));

export async function embedUnicodeFont(doc: PDFDocument): Promise<PDFFont> {
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  doc.registerFontkit(fontkit);
  const [reg] = await loadFonts();
  return doc.embedFont(reg, { subset: true });
}

type Fonts = { reg: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };

export async function blocksToPdf(blocks: Block[], o: DocOptions = {}, onProgress?: (d: number, t: number) => void, existing?: PDFDocument): Promise<PDFDocument> {
  const doc = existing ?? await PDFDocument.create();
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  doc.registerFontkit(fontkit);
  const [r, b, i, m] = await loadFonts();
  const F: Fonts = { reg: await doc.embedFont(r, { subset: true }), bold: await doc.embedFont(b, { subset: true }), italic: await doc.embedFont(i, { subset: true }), mono: await doc.embedFont(m, { subset: true }) };
  let [PW, PH] = SIZES[o.page ?? 'a4'];
  const widest = blocks.reduce((mx, bl) => (bl.t === 'table' ? Math.max(mx, bl.rows.reduce((a, row) => Math.max(a, row.length), 0)) : mx), 0);
  if (o.landscape === true || (o.landscape === 'auto' && widest > 6)) [PW, PH] = [PH, PW];
  const M = o.margin ?? 50, BASE = o.size ?? 11, W = PW - M * 2;
  let page: PDFPage = doc.addPage([PW, PH]);
  let y = PH - M;
  const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
  const need = (h: number) => { if (y - h < M) newPage(); };
  const fontOf = (r: Run) => (r.mono ? F.mono : r.bold ? F.bold : r.italic ? F.italic : F.reg);
  const ink = rgb(0.1, 0.1, 0.12), linkInk = rgb(0.15, 0.3, 0.8), grey = rgb(0.45, 0.45, 0.5);

  /** Draw text that pdf-lib can't shape: render the browser's text onto a canvas, place as image. */
  const rasterParagraph = async (text: string, size: number, x0: number, width: number, bold: boolean) => {
    const S = 3; const c = document.createElement('canvas'); const ctx = c.getContext('2d')!;
    const font = `${bold ? '700 ' : ''}${size * S}px "Noto Sans", "Nirmala UI", "Mangal", "Segoe UI", "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif`;
    ctx.font = font;
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const w of para.split(/(\s+)/)) {
        const t = line + w;
        if (ctx.measureText(t).width > width * S && line.trim()) { lines.push(line.trimEnd()); line = w.trimStart(); } else line = t;
      }
      lines.push(line);
    }
    const lh = size * 1.45;
    for (const ln of lines) {
      need(lh);
      if (ln.trim()) {
        c.width = Math.ceil(width * S); c.height = Math.ceil(lh * S);
        ctx.font = font; ctx.fillStyle = '#1a1a1f'; ctx.textBaseline = 'middle'; ctx.direction = 'inherit';
        const rtl = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(ln);
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.fillText(ln, rtl ? c.width : 0, c.height / 2);
        const png = await doc.embedPng(await new Promise<ArrayBuffer>((res) => c.toBlob((bb) => bb!.arrayBuffer().then(res), 'image/png')));
        page.drawImage(png, { x: x0, y: y - lh, width, height: lh });
      }
      y -= lh;
    }
  };

  /** Word-wrap styled runs and draw them. */
  const drawRuns = async (runs: Run[], size: number, x0: number, width: number, lineGap = 1.4) => {
    const plain = runs.map((r) => r.text).join('');
    if (COMPLEX.test(plain)) return rasterParagraph(plain, size, x0, width, runs.every((r) => r.bold));
    type Tok = { text: string; run: Run; w: number; nl?: boolean };
    const toks: Tok[] = [];
    for (const r of runs) for (const part of r.text.split(/(\n|\s+)/)) {
      if (!part) continue;
      if (part === '\n') { toks.push({ text: '', run: r, w: 0, nl: true }); continue; }
      const f = fontOf(r);
      let w = f.widthOfTextAtSize(part, size);
      if (w > width && !/\s/.test(part)) { // very long word: split into chunks
        let chunk = '';
        for (const ch of part) { if (f.widthOfTextAtSize(chunk + ch, size) > width) { toks.push({ text: chunk, run: r, w: f.widthOfTextAtSize(chunk, size) }); chunk = ch; } else chunk += ch; }
        part.length && toks.push({ text: chunk, run: r, w: f.widthOfTextAtSize(chunk, size) });
        continue;
      }
      toks.push({ text: part, run: r, w });
    }
    const lh = size * lineGap;
    let line: Tok[] = [], lw = 0;
    const flush = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) { lw -= line[line.length - 1].w; line.pop(); }
      need(lh);
      let x = x0;
      for (const t of line) {
        if (t.text && !/^\s+$/.test(t.text)) page.drawText(t.text, { x, y: y - size, size, font: fontOf(t.run), color: t.run.link ? linkInk : ink });
        if (t.run.link && t.text.trim()) page.drawLine({ start: { x, y: y - size - 1.5 }, end: { x: x + t.w, y: y - size - 1.5 }, thickness: 0.5, color: linkInk });
        x += t.w;
      }
      y -= lh; line = []; lw = 0;
    };
    for (const t of toks) {
      if (t.nl) { flush(); continue; }
      if (!line.length && /^\s+$/.test(t.text)) continue;
      if (lw + t.w > width && line.length) flush();
      if (!line.length && /^\s+$/.test(t.text)) continue;
      line.push(t); lw += t.w;
    }
    if (line.length) flush();
  };

  const drawTable = async (rows: string[][], header: boolean) => {
    const cols = rows.reduce((a, r) => Math.max(a, r.length), 0); if (!cols) return;
    let size = Math.max(6, Math.min(BASE - 1, (W / cols) / 5));
    const pad = 3;
    // column widths by content length (capped), scaled to the page width
    const want = Array.from({ length: cols }, (_, c) => Math.min(40, Math.max(3, ...rows.slice(0, 200).map((r) => (r[c] ?? '').length))));
    const tot = want.reduce((s, v) => s + v, 0);
    const cw = want.map((v) => (v / tot) * W);
    const wrapCell = (text: string, w: number, f: PDFFont) => {
      const out: string[] = []; let line = '';
      for (const word of String(text).replace(/\r/g, '').split(/(\s+)/)) {
        if (word === '\n') { out.push(line); line = ''; continue; }
        const t = line + word;
        if (f.widthOfTextAtSize(t, size) > w - pad * 2 && line) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line = t;
        while (f.widthOfTextAtSize(line, size) > w - pad * 2 && line.length > 1) { // force-break long words
          let k = line.length; while (k > 1 && f.widthOfTextAtSize(line.slice(0, k), size) > w - pad * 2) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      }
      out.push(line); return out;
    };
    const lh = size * 1.3;
    const drawRow = (r: string[], bold: boolean, shade: boolean) => {
      const f = bold ? F.bold : F.reg;
      const safe = r.map((v) => (COMPLEX.test(v ?? '') ? (v ?? '').replace(new RegExp(COMPLEX.source, 'gu'), '?') : v ?? ''));
      const cells = Array.from({ length: cols }, (_, c) => wrapCell(safe[c] ?? '', cw[c], f));
      const h = Math.max(...cells.map((c) => c.length)) * lh + pad * 2;
      if (y - h < M) { newPage(); if (header && !bold) drawRow(rows[0], true, true); }
      let x = M;
      if (shade) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: rgb(0.93, 0.94, 0.98) });
      for (let c = 0; c < cols; c++) {
        page.drawRectangle({ x, y: y - h, width: cw[c], height: h, borderColor: rgb(0.75, 0.76, 0.8), borderWidth: 0.5 });
        cells[c].forEach((ln, k) => ln && page.drawText(ln, { x: x + pad, y: y - pad - size - k * lh + size * 0.15, size, font: f, color: ink }));
        x += cw[c];
      }
      y -= h;
    };
    rows.forEach((r, k) => { drawRow(r, header && k === 0, header && k === 0); if (k % 200 === 0) onProgress?.(k, rows.length); });
    y -= BASE * 0.8;
  };

  for (let k = 0; k < blocks.length; k++) {
    const bl = blocks[k];
    if (k % 25 === 0) { onProgress?.(k, blocks.length); await new Promise((res) => setTimeout(res)); }
    if (bl.t === 'h') {
      const size = BASE * ([2, 1.6, 1.35, 1.2, 1.1, 1][Math.min(5, bl.level - 1)]);
      need(size * 3); y -= size * 0.5;
      await drawRuns(bl.runs.map((r) => ({ ...r, bold: true })), size, M, W, 1.25);
      y -= size * 0.3;
    } else if (bl.t === 'p') {
      const ind = (bl.indent ?? 0) * 18 + (bl.quote ? 14 : 0);
      if (!bl.runs.some((r) => r.text.trim())) { y -= BASE * 0.7; continue; }
      need(BASE * 1.4);
      const top = y, pg0 = page;
      if (bl.bullet) page.drawText(bl.bullet, { x: M + ind, y: y - BASE, size: BASE, font: F.reg, color: ink });
      await drawRuns(bl.runs, BASE, M + ind + (bl.bullet ? 16 : 0), W - ind - (bl.bullet ? 16 : 0));
      if (bl.quote && page === pg0) page.drawLine({ start: { x: M + ind - 10, y: Math.min(top, PH - M) }, end: { x: M + ind - 10, y: y + 2 }, thickness: 2, color: grey });
      y -= bl.bullet ? BASE * 0.2 : BASE * 0.55;
    } else if (bl.t === 'pre') {
      const mono = bl.mono !== false;
      const size = mono ? BASE * 0.9 : BASE, f = mono ? F.mono : F.reg, lh = size * 1.35;
      for (const raw of bl.text.replace(/\t/g, '    ').split('\n')) {
        if (COMPLEX.test(raw)) { await rasterParagraph(raw, size, M, W, false); continue; }
        let rest = raw;
        do {
          let k2 = rest.length;
          while (k2 > 1 && f.widthOfTextAtSize(rest.slice(0, k2), size) > W) k2 = Math.floor(k2 * 0.9);
          if (k2 < rest.length && !mono) { const sp = rest.lastIndexOf(' ', k2); if (sp > k2 * 0.6) k2 = sp + 1; }
          const piece = rest.slice(0, k2); rest = rest.slice(k2);
          need(lh);
          if (piece.trim()) page.drawText(piece, { x: M, y: y - size, size, font: f, color: ink });
          y -= lh;
        } while (rest.length);
      }
      y -= BASE * 0.5;
    } else if (bl.t === 'img') {
      try {
        const bmp = await createImageBitmap(bl.blob);
        const c = document.createElement('canvas'); const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
        c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
        const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height);
        const jpg = await doc.embedJpg(await new Promise<ArrayBuffer>((res) => c.toBlob((bb) => bb!.arrayBuffer().then(res), 'image/jpeg', 0.85)));
        let w = Math.min(W, bmp.width * 0.75), h = w * bmp.height / bmp.width;
        const maxH = PH - M * 2; if (h > maxH) { h = maxH; w = h * bmp.width / bmp.height; }
        bmp.close();
        need(h + 6);
        page.drawImage(jpg, { x: M + (W - w) / 2, y: y - h, width: w, height: h });
        y -= h + BASE * 0.8;
      } catch { /* unreadable image: skip */ }
    } else if (bl.t === 'table') await drawTable(bl.rows, !!bl.header);
    else if (bl.t === 'hr') { need(14); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.7, color: rgb(0.8, 0.8, 0.85) }); y -= 8; }
    else if (bl.t === 'break') { if (y < PH - M - 1) newPage(); }
  }
  return doc;
}

// ---------- Parsers ----------

export async function readText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Minimal RTF reader: paragraphs, bold/italic, tabs, unicode and code-page characters. */
export function parseRtf(rtf: string): Block[] {
  const blocks: Block[] = []; let runs: Run[] = [];
  type St = { b: boolean; i: boolean; skip: boolean; uc: number };
  const stack: St[] = []; let st: St = { b: false, i: false, skip: false, uc: 1 };
  const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|headerl|headerr|footerl|footerr|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|themedata|colorschememapping|datastore|latentstyles|pgdsctbl|object|fldinst|mmathPr)$/;
  const add = (t: string) => { if (st.skip || !t) return; const last = runs[runs.length - 1]; if (last && !!last.bold === st.b && !!last.italic === st.i) last.text += t; else runs.push({ text: t, bold: st.b, italic: st.i }); };
  const par = () => { blocks.push({ t: 'p', runs }); runs = []; };
  let skipChars = 0;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') { stack.push({ ...st }); continue; }
    if (ch === '}') { st = stack.pop() ?? st; continue; }
    if (ch === '\\') {
      const nx = rtf[i + 1];
      if (nx === '\\' || nx === '{' || nx === '}') { if (skipChars > 0) skipChars--; else add(nx); i++; continue; }
      if (nx === '*') { st.skip = true; i++; continue; }
      if (nx === "'") { const code = parseInt(rtf.substr(i + 2, 2), 16); i += 3; if (skipChars > 0) { skipChars--; continue; } add(new TextDecoder('windows-1252').decode(new Uint8Array([code]))); continue; }
      if (nx === '~') { add(' '); i++; continue; }
      if (nx === '\n' || nx === '\r') { par(); i++; continue; }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40));
      if (!m) { i++; continue; }
      i += m[0].length;
      const w = m[1], n = m[2] !== undefined ? +m[2] : undefined;
      if (SKIP.test(w)) st.skip = true;
      else if (w === 'par' || w === 'sect') par();
      else if (w === 'line') add('\n');
      else if (w === 'tab') add('    ');
      else if (w === 'cell') add('  ');
      else if (w === 'row') par();
      else if (w === 'page') { par(); blocks.push({ t: 'break' }); }
      else if (w === 'b') st.b = n !== 0;
      else if (w === 'i') st.i = n !== 0;
      else if (w === 'plain') { st.b = false; st.i = false; }
      else if (w === 'uc') st.uc = n ?? 1;
      else if (w === 'u' && n !== undefined) { add(String.fromCharCode(n < 0 ? n + 65536 : n)); skipChars = st.uc; }
      else if (w === 'bullet') add('•');
      else if (w === 'emdash') add('—'); else if (w === 'endash') add('–');
      else if (w === 'lquote') add('‘'); else if (w === 'rquote') add('’'); else if (w === 'ldblquote') add('“'); else if (w === 'rdblquote') add('”');
      continue;
    }
    if (ch === '\n' || ch === '\r') continue;
    if (skipChars > 0) { skipChars--; continue; }
    add(ch);
  }
  if (runs.length) par();
  return blocks;
}

/** Convert an HTML document (or body) into blocks. `resolveImg` turns an image src into a Blob. */
export async function htmlToBlocks(root: Document | Element, resolveImg?: (src: string) => Promise<Blob | null>): Promise<Block[]> {
  const blocks: Block[] = [];
  let runs: Run[] = [];
  let ctx = { indent: 0, quote: false };
  let pendingBullet: string | undefined;
  const flush = () => {
    const txt = runs.map((r) => r.text).join('');
    if (txt.replace(/\s+/g, '').length || pendingBullet) {
      // collapse whitespace at the edges
      runs = runs.filter((r) => r.text.length);
      if (runs.length) { runs[0] = { ...runs[0], text: runs[0].text.replace(/^[ \t]+/, '') }; const L = runs.length - 1; runs[L] = { ...runs[L], text: runs[L].text.replace(/[ \t]+$/, '') }; }
      blocks.push({ t: 'p', runs, indent: ctx.indent, bullet: pendingBullet, quote: ctx.quote });
    }
    runs = []; pendingBullet = undefined;
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG', 'IFRAME', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'NAV']);
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'ADDRESS', 'DL', 'DT', 'DD', 'CENTER']);
  const walk = async (n: Node, st: Run) => {
    if (n.nodeType === 3) { const t = (n.textContent ?? '').replace(/\s+/g, ' '); if (t) { const prev = runs[runs.length - 1]; if (!(t === ' ' && (!prev || prev.text.endsWith(' ') || prev.text.endsWith('\n')))) runs.push({ ...st, text: t }); } return; }
    if (n.nodeType !== 1) return;
    const el = n as Element; const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if ((el as HTMLElement).hidden || /display\s*:\s*none/i.test(el.getAttribute('style') ?? '')) return;
    const kids = async (s: Run) => { for (const c of Array.from(el.childNodes)) await walk(c, s); };
    if (/^H[1-6]$/.test(tag)) { flush(); const save = runs; runs = []; await kids({ ...st, bold: true }); const hr = runs; runs = save; if (hr.some((r) => r.text.trim())) blocks.push({ t: 'h', level: +tag[1], runs: hr.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') })) }); return; }
    if (tag === 'BR') { runs.push({ ...st, text: '\n' }); return; }
    if (tag === 'HR') { flush(); blocks.push({ t: 'hr' }); return; }
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      if (resolveImg && src) { const blob = await resolveImg(src).catch(() => null); if (blob) { flush(); blocks.push({ t: 'img', blob }); } }
      else { const alt = el.getAttribute('alt'); if (alt) runs.push({ ...st, text: `[${alt}]` }); }
      return;
    }
    if (tag === 'PRE') { flush(); blocks.push({ t: 'pre', text: el.textContent ?? '' }); return; }
    if (tag === 'TABLE') {
      flush();
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).filter((c) => /^T[HD]$/i.test(c.tagName)).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));
      const header = !!el.querySelector('tr th') || !!el.querySelector('thead');
      if (rows.length) blocks.push({ t: 'table', rows, header });
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      flush(); const save = ctx; ctx = { ...ctx, indent: ctx.indent + 1 };
      let k = +(el.getAttribute('start') ?? 1);
      for (const li of Array.from(el.children)) {
        if (li.tagName.toUpperCase() !== 'LI') { await walk(li, st); continue; }
        flush(); pendingBullet = tag === 'OL' ? `${k++}.` : ctx.indent > 1 ? '◦' : '•';
        for (const c of Array.from(li.childNodes)) await walk(c, st);
        flush();
      }
      ctx = save; return;
    }
    if (tag === 'BLOCKQUOTE') { flush(); const save = ctx; ctx = { ...ctx, quote: true, indent: ctx.indent + 1 }; await kids(st); flush(); ctx = save; return; }
    const s2: Run = { ...st };
    if (tag === 'B' || tag === 'STRONG') s2.bold = true;
    if (tag === 'I' || tag === 'EM' || tag === 'CITE') s2.italic = true;
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') s2.mono = true;
    if (tag === 'A' && el.getAttribute('href')) s2.link = true;
    if (BLOCK.has(tag) || tag === 'LI') { flush(); await kids(s2); flush(); return; }
    await kids(s2);
  };
  const body = (root as Document).body ?? root;
  await walk(body, { text: '' });
  flush();
  return blocks;
}

/** Plain text → blocks (keeps line breaks). */
export const textToBlocks = (text: string, mono: boolean): Block[] => [{ t: 'pre', text: text.replace(/\r\n?/g, '\n'), mono }];

/** Markdown-lite: headings, lists, bold/italic/code, quotes, rules. */
export function markdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const inline = (s: string): Run[] => {
    const out: Run[] = []; const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/g; let last = 0; let m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ text: s.slice(last, m.index) });
      if (m[2]) out.push({ text: m[2], bold: true }); else if (m[4]) out.push({ text: m[4], italic: true }); else if (m[5]) out.push({ text: m[5], mono: true }); else if (m[6]) out.push({ text: m[6], link: true });
      last = re.lastIndex;
    }
    if (last < s.length) out.push({ text: s.slice(last) });
    return out;
  };
  const lines = md.replace(/\r\n?/g, '\n').split('\n'); let para: string[] = [];
  const flush = () => { if (para.length) blocks.push({ t: 'p', runs: inline(para.join(' ')) }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) { flush(); const code: string[] = []; while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]); blocks.push({ t: 'pre', text: code.join('\n') }); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)/.exec(l))) { flush(); blocks.push({ t: 'h', level: m[1].length, runs: inline(m[2]) }); }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); blocks.push({ t: 'hr' }); }
    else if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)/.exec(l))) { flush(); blocks.push({ t: 'p', runs: inline(m[3]), indent: 1 + Math.floor(m[1].length / 2), bullet: /\d/.test(m[2]) ? m[2] : '•' }); }
    else if ((m = /^>\s?(.*)/.exec(l))) { flush(); blocks.push({ t: 'p', runs: inline(m[1]), quote: true, indent: 1 }); }
    else if (!l.trim()) flush();
    else para.push(l.trim());
  }
  flush();
  return blocks;
}

/** EPUB → blocks, chapters in reading order, images included. */
export async function epubToBlocks(buf: ArrayBuffer, onProgress?: (d: number, t: number) => void): Promise<{ blocks: Block[]; title: string }> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buf));
  const get = (p: string) => files[p] ?? files[decodeURIComponent(p)];
  const container = get('META-INF/container.xml');
  if (!container) throw new Error('This file is not a valid EPUB e-book.');
  const parser = new DOMParser();
  const opfPath = parser.parseFromString(strFromU8(container), 'application/xml').querySelector('rootfile')?.getAttribute('full-path') ?? '';
  const opf = parser.parseFromString(strFromU8(get(opfPath)), 'application/xml');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const title = opf.getElementsByTagName('dc:title')[0]?.textContent ?? '';
  const manifest = new Map<string, { href: string; type: string }>();
  opf.querySelectorAll('manifest > item').forEach((it) => manifest.set(it.getAttribute('id')!, { href: it.getAttribute('href')!, type: it.getAttribute('media-type') ?? '' }));
  const spine = Array.from(opf.querySelectorAll('spine > itemref')).map((r) => manifest.get(r.getAttribute('idref')!)).filter(Boolean) as { href: string; type: string }[];
  const resolve = (from: string, rel: string) => { const parts = (from.slice(0, from.lastIndexOf('/') + 1) + rel.split('#')[0]).split('/'); const out: string[] = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); } return out.join('/'); };
  const blocks: Block[] = [];
  for (let k = 0; k < spine.length; k++) {
    const path = base + spine[k].href; const data = get(path); if (!data) continue;
    const doc = parser.parseFromString(strFromU8(data), /x?html/.test(spine[k].type) && spine[k].type.includes('xml') ? 'application/xhtml+xml' : 'text/html');
    const bl = await htmlToBlocks(doc, async (src) => { const d = get(resolve(path, src)); if (!d) return null; return new Blob([d as BlobPart], { type: /\.png$/i.test(src) ? 'image/png' : /\.gif$/i.test(src) ? 'image/gif' : /\.svg$/i.test(src) ? 'image/svg+xml' : 'image/jpeg' }); });
    if (bl.length) { if (blocks.length) blocks.push({ t: 'break' }); blocks.push(...bl); }
    onProgress?.(k + 1, spine.length);
  }
  if (!blocks.length) throw new Error('No readable text was found in this e-book.');
  return { blocks, title };
}
