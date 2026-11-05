// PDF → Markdown: headings from font sizes, paragraphs, lists, bold/italic, links, tables, two-column pages,
// and running headers/footers removed.
import { readPage, lineText, type Line, type PageText, type Word } from './pdfread';
import { pageGraphics, findTables, type Table } from './pdftables';

export type MdOpts = { tables: boolean; headers: boolean; pageBreaks: boolean };
type Block = { y: number; md: string }; // y = position in reading order

const BULLET = /^([•●▪■◦‣○◆◇►▶➢✓✔·]|[-–—*])\s*/;
const NUMBERED = /^(\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s+/;
const esc = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1');

/** Words of a line as Markdown, with **bold**, *italic* and [links](url). */
function inline(words: Word[], links: { r: number[]; url: string }[]): string {
  const out: string[] = []; let cur: { b: boolean; i: boolean; url: string; t: string } | null = null;
  const flush = () => {
    if (!cur) return; let t = cur.t.trim(); if (!t) { cur = null; return; }
    if (cur.b && cur.i) t = `***${t}***`; else if (cur.b) t = `**${t}**`; else if (cur.i) t = `*${t}*`;
    if (cur.url) t = `[${t}](${cur.url})`;
    out.push(t); cur = null;
  };
  let prev: Word | null = null;
  for (const w of words) {
    if (!w.text.trim()) continue;
    const cx = (w.x0 + w.x1) / 2, cy = w.y - w.size * 0.3;
    const url = links.find((l) => cx >= l.r[0] && cx <= l.r[2] && cy >= l.r[1] && cy <= l.r[3])?.url ?? '';
    const indic = prev && /[\u0900-\u0DFF]$/.test(prev.text) && /^[\u0900-\u0DFF]/.test(w.text);
    const space = prev && w.x0 - prev.x1 > w.size * (indic ? 0.32 : 0.18) ? ' ' : '';
    if (cur && cur.b === w.bold && cur.i === w.italic && cur.url === url) cur.t += space + esc(w.text);
    else { flush(); if (space && out.length) out.push(' '); cur = { b: w.bold, i: w.italic, url, t: esc(w.text) }; }
    prev = w;
  }
  flush();
  return out.join('').replace(/\s+/g, ' ').replace(/\*\*\s*\*\*/g, ' ').trim();
}

function tableMd(t: Table): string {
  const R = t.rowH.length, C = t.colW.length;
  const grid: string[][] = Array.from({ length: R }, () => Array(C).fill(''));
  for (const c of t.cells) grid[c.r][c.c] = (c.bold && c.r > 0 ? `**${c.text}**` : c.text).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  // drop columns that are empty everywhere
  const keep = Array.from({ length: C }, (_, c) => grid.some((r) => r[c].trim()));
  const rows = grid.map((r) => r.filter((_, c) => keep[c])).filter((r) => r.some((x) => x.trim()));
  if (!rows.length) return '';
  const n = rows[0].length;
  return [`| ${rows[0].join(' | ')} |`, `|${' --- |'.repeat(n)}`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

const mkLine = (words: Word[]): Line => ({ y: words[0].y, x0: Math.min(...words.map((w) => w.x0)), x1: Math.max(...words.map((w) => w.x1)), size: Math.max(...words.map((w) => w.size)), words });

/**
 * Reading order for pages with two columns of text. A column gap (gutter) is a vertical strip that splits many lines
 * into a left and a right part while no word crosses it. Lines that cross the gutter (titles, full-width tables)
 * start a new section; inside a section the left column is read first, then the right one.
 * Two short columns side by side (labels and values) are not columns of text, so they are left as they are.
 */
function readingOrder(pt: PageText, lines: Line[]): Line[] {
  if (lines.length < 8) return lines;
  const real = (l: Line) => l.words.filter((w) => w.text.trim());
  let best = { x: 0, score: 0 };
  for (let x = pt.w * 0.3; x <= pt.w * 0.7; x += 2) {
    let score = 0, cross = 0;
    for (const l of lines) {
      const ws = real(l);
      if (ws.some((w) => w.x0 - 1.5 < x && w.x1 + 1.5 > x)) { cross++; continue; }
      if (ws.some((w) => w.x1 < x) && ws.some((w) => w.x0 > x)) score++;
    }
    if (cross > lines.length * 0.35) continue;
    if (score > best.score) best = { x, score };
  }
  if (best.score < 4) return lines;
  const g = best.x;
  // split every line at the gutter
  type Part = { line: Line; side: 0 | 1 | 2 }; // 0 left, 1 right, 2 crosses
  const parts: Part[] = [];
  for (const l of lines) {
    const ws = real(l);
    if (ws.some((w) => w.x0 - 1.5 < g && w.x1 + 1.5 > g)) { parts.push({ line: l, side: 2 }); continue; }
    const L = ws.filter((w) => w.x1 <= g), R = ws.filter((w) => w.x0 >= g);
    if (L.length) parts.push({ line: R.length ? mkLine(L) : l, side: 0 });
    if (R.length) parts.push({ line: L.length ? mkLine(R) : l, side: 1 });
  }
  // real columns of text have long lines on both sides; label | value lists do not
  const med = (side: 0 | 1) => { const a = parts.filter((p) => p.side === side).map((p) => lineText(p.line.words).length).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  if (med(0) < 22 || med(1) < 22) return lines;
  const out: Line[] = []; let left: Line[] = [], right: Line[] = [];
  const flush = () => { out.push(...left, ...right); left = []; right = []; };
  for (const p of parts) { if (p.side === 2) { flush(); out.push(p.line); } else (p.side ? right : left).push(p.line); }
  flush();
  return out;
}

export async function pdfToMarkdown(doc: any, pdfjs: any, o: MdOpts, progress: (d: number, t: number) => void): Promise<string> {
  const pages: { pt: PageText; tables: Table[]; links: { r: number[]; url: string }[] }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    progress(i - 1, doc.numPages);
    const page = await doc.getPage(i);
    const pt = await readPage(page);
    // bullets drawn with a symbol font (Wingdings, Zapf Dingbats) come out as letters: make them real bullets
    for (const l of pt.lines) {
      const ws = l.words.filter((w) => w.text.trim()); if (ws.length < 2) continue;
      // leading marks in another font than the text after them (often several copies drawn on top of each other)
      let k = 0; while (k < ws.length - 1 && ws[k].text.trim().length <= 2 && ws[k].fid !== ws[ws.length - 1].fid && (ws[k].symbol || /^[OoQqnluvw§¨Øø•●■□▪◦\uf000-\uf0ff]+$/.test(ws[k].text.trim()))) k++;
      if (k && ws[k].x0 - ws[k - 1].x1 > ws[k].size * 0.2) { ws[0].text = '•'; for (let j = 1; j < k; j++) ws[j].text = ''; }
    }
    let tables: Table[] = [];
    if (o.tables) { try { tables = findTables(pt, await pageGraphics(page, pdfjs.OPS)); } catch { /* text only */ } }
    const vp = page.getViewport({ scale: 1 });
    const links = (await page.getAnnotations()).filter((a: any) => a.subtype === 'Link' && a.url).map((a: any) => {
      const [x0, y0, x1, y1] = vp.convertToViewportRectangle ? vp.convertToViewportRectangle(a.rect) : [...vp.convertToViewportPoint(a.rect[0], a.rect[1]), ...vp.convertToViewportPoint(a.rect[2], a.rect[3])];
      return { r: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)], url: a.url };
    });
    pages.push({ pt, tables, links });
    page.cleanup();
  }
  // running headers and footers: the same text near the top or bottom of most pages
  const norm = (l: Line) => lineText(l.words).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const repeat = new Map<string, number>();
  if (o.headers && pages.length >= 3) for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.pt.lines) if (l.y < p.pt.h * 0.09 || l.y > p.pt.h * 0.92) { const k = norm(l); if (k && !seen.has(k)) { seen.add(k); repeat.set(k, (repeat.get(k) ?? 0) + 1); } }
  }
  const isRunning = (p: PageText, l: Line) => (l.y < p.h * 0.09 || l.y > p.h * 0.92) && ((repeat.get(norm(l)) ?? 0) >= Math.max(2, pages.length * 0.5) || /^(page\s*)?#(\s*(of|\/)\s*#)?$/.test(norm(l)));
  // body text size = the size used for most characters
  const sizeCount = new Map<number, number>();
  for (const p of pages) for (const l of p.pt.lines) { const s = Math.round(l.size * 2) / 2; sizeCount.set(s, (sizeCount.get(s) ?? 0) + lineText(l.words).length); }
  const body = [...sizeCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
  const big = [...sizeCount.keys()].filter((s) => s >= body * 1.15).sort((a, b) => b - a);
  const level = (size: number) => { const s = Math.round(size * 2) / 2; const i = big.findIndex((b) => Math.abs(b - s) < 0.6); return i < 0 ? 0 : Math.min(i + 1, 4); };

  const md: string[] = [];
  pages.forEach((p, pi) => {
    const blocks: Block[] = [];
    const inTable = (l: Line) => p.tables.some((t) => l.y - l.size * 0.3 > t.y0 && l.y - l.size * 0.3 < t.y1 && l.x1 > t.x0 && l.x0 < t.x1);
    const lines = readingOrder(p.pt, p.pt.lines.filter((l) => l.words.some((w) => w.text.trim()) && !inTable(l) && !isRunning(p.pt, l)));
    const ord = new Map(lines.map((l, i) => [l, i]));
    for (const t of p.tables) { const m = tableMd(t); if (!m) continue; let i = lines.findIndex((l) => l.y > t.y0 && l.x1 > t.x0 && l.x0 < t.x1); if (i < 0) i = lines.findIndex((l) => l.y > t.y0); blocks.push({ y: (i < 0 ? lines.length : i) - 0.5, md: m }); }
    let para: { lines: Line[]; kind: 'p' | 'li'; indent: number; num: boolean } | null = null;
    const listX: number[] = [];
    const flush = () => {
      if (!para) return;
      const parts: string[] = [];
      para.lines.forEach((l, k) => {
        let t = inline(l.words, p.links);
        if (k === 0 && para!.kind === 'li') {
          // take the bullet or number off the front, even when it sits inside **bold** markers
          const mk = (para!.num ? lineText(l.words).trim().match(NUMBERED) : lineText(l.words).trim().match(BULLET))?.[0].trim() ?? '';
          const at = mk ? t.indexOf(esc(mk)) : -1;
          if (at >= 0 && at <= 3) t = (t.slice(0, at) + t.slice(at + esc(mk).length)).replace(/^(\**)\s+/, '$1').replace(/^\*\*\s*\*\*/, '');
          if (para!.num) t = mk.replace(/[()]/g, '').replace(/\.?$/, '') + '. ' + t; // keep the number for the list
        }
        if (parts.length && /[a-z]-$/.test(parts[parts.length - 1]) && /^[a-z]/.test(t)) parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1) + t; // re-join hyphenated words
        else parts.push(t);
      });
      let text = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (para.kind === 'li') {
        const pad = '  '.repeat(para.indent);
        const m = text.match(/^(\d{1,3})\. /);
        text = para.num && m ? `${pad}${text}` : `${pad}- ${para.num ? text.replace(/^[^ ]+ /, (x) => x) : text}`;
      }
      blocks.push({ y: ord.get(para.lines[0])!, md: text }); para = null;
    };
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k]; const raw = lineText(l.words).trim();
      if (/^[•●▪■◦‣○◆◇►▶➢✓✔·\-–—*]+$/.test(raw)) continue; // a lone bullet with nothing after it
      const lv = level(l.size);
      const allBold = l.words.filter((w) => w.text.trim()).every((w) => w.bold);
      const looksList = (BULLET.test(raw) && raw.length > 2) || NUMBERED.test(raw);
      if (lv && raw.length < 120 && !looksList && !/^[a-z]/.test(raw) && (allBold || l.size >= body * 1.3)) {
        flush();
        // a heading may wrap onto two lines of the same size
        const plain = (ws: Word[]) => inline(ws, p.links).replace(/(?<!\\)\*{2,3}/g, '').replace(/\s+/g, ' ').trim();
        let text = plain(l.words);
        while (lines[k + 1] && level(lines[k + 1].size) === lv && lines[k + 1].y - l.y < l.size * 1.8 && Math.abs(lines[k + 1].size - l.size) < 0.6) { k++; text += ' ' + plain(lines[k].words); }
        blocks.push({ y: ord.get(l)!, md: `${'#'.repeat(lv)} ${text}` }); continue;
      }
      const bullet = BULLET.test(raw) && raw.length > 2, numbered = NUMBERED.test(raw);
      if (bullet || numbered) {
        flush();
        let ind = listX.findIndex((x) => Math.abs(x - l.x0) < l.size * 0.8); if (ind < 0) { listX.push(l.x0); listX.sort((a, b) => a - b); ind = listX.findIndex((x) => Math.abs(x - l.x0) < l.size * 0.8); }
        para = { lines: [l], kind: 'li', indent: Math.min(ind, 3), num: numbered && !bullet };
        continue;
      }
      // standalone bold line at body size: a small heading
      const next = lines[k + 1];
      if (allBold && raw.length < 70 && !/[.:,;]$/.test(raw) && !/^[a-z]/.test(raw) && (!next || !next.words.every((w) => w.bold || !w.text.trim()))) {
        flush(); blocks.push({ y: ord.get(l)!, md: `${'#'.repeat(Math.min(big.length + 1, 4) || 3)} ${esc(raw)}` }); continue;
      }
      if (para) {
        const last = para.lines[para.lines.length - 1];
        const gap = l.y - last.y;
        const sameSize = Math.abs(l.size - last.size) < 1;
        const endStop = /[.!?:]$/.test(lineText(last.words).trim());
        const right = Math.max(...para.lines.map((x) => x.x1));
        const full = last.x1 > right - l.size * 1.5 && para.lines.length > 1 || last.x1 - last.x0 > (l.x1 - l.x0) * 0.9;
        const cont = para.kind === 'li' ? l.x0 > para.lines[0].x0 + l.size * 0.3 && gap < l.size * 1.8 : gap > 0 && gap < l.size * 1.55 && sameSize && Math.abs(l.x0 - para.lines[0].x0) < l.size * 2.5 && (!endStop || full);
        if (cont) { para.lines.push(l); continue; }
        flush();
      }
      para = { lines: [l], kind: 'p', indent: 0, num: false };
    }
    flush();
    blocks.sort((a, b) => a.y - b.y);
    if (o.pageBreaks && pi > 0) md.push('---');
    // keep list items together, blank line between other blocks
    let prevLi = false;
    for (const b of blocks) {
      const li = /^\s*(- |\d+\. )/.test(b.md);
      if (md.length && !(li && prevLi)) md.push('');
      md.push(b.md); prevLi = li;
    }
  });
  progress(doc.numPages, doc.numPages);
  return md.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
