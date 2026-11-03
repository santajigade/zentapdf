// Find ruled tables on a PDF page from its drawn lines and filled boxes, and read the text into their cells.
import type { PageText, Word } from './pdfread';
import { lineText } from './pdfread';

export type HSeg = { y: number; x0: number; x1: number };
export type VSeg = { x: number; y0: number; y1: number };
export type Box = { x0: number; y0: number; x1: number; y1: number; color: string };
export type Cell = { r: number; c: number; rs: number; cs: number; text: string; bold: boolean; align: 'left' | 'center' | 'right'; fill?: string; wrap: boolean; size: number };
export type Table = { x0: number; y0: number; x1: number; y1: number; colW: number[]; rowH: number[]; cells: Cell[]; ruled: 'grid' | 'rows' };

// ---------- 1. read lines and boxes from the drawing commands ----------
export async function pageGraphics(page: any, OPS: Record<string, number>): Promise<{ h: HSeg[]; v: VSeg[]; boxes: Box[] }> {
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const h: HSeg[] = [], v: VSeg[] = [], boxes: Box[] = [];
  type St = { m: number[]; lw: number; fill: string; stroke: string };
  let st: St = { m: vp.transform.slice(), lw: 1, fill: '#000000', stroke: '#000000' };
  const stack: St[] = [];
  const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const pt = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const isWhite = (c: string) => /^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/i.test(c);
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const area = vp.width * vp.height;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) stack.push({ ...st, m: st.m.slice() });
    else if (fn === OPS.restore) st = stack.pop() ?? st;
    else if (fn === OPS.transform) st.m = mul(st.m, args);
    else if (fn === OPS.setLineWidth) st.lw = args[0];
    else if (fn === OPS.setFillRGBColor) st.fill = String(args[0]);
    else if (fn === OPS.setStrokeRGBColor) st.stroke = String(args[0]);
    else if (fn === OPS.constructPath) {
      const op = args[0]; const buf: ArrayLike<number> | undefined = args[1]?.[0];
      if (!buf || !buf.length) continue;
      const doStroke = strokeOps.has(op) && !isWhite(st.stroke), doFill = fillOps.has(op);
      if (!doStroke && !doFill) continue;
      const lwPage = st.lw * Math.hypot(st.m[0], st.m[1]);
      // split into sub-paths of points
      const subs: number[][][] = []; let cur: number[][] = [];
      for (let k = 0; k < buf.length;) {
        const c = buf[k];
        if (c === 0) { if (cur.length) subs.push(cur); cur = [pt(st.m, buf[k + 1], buf[k + 2])]; k += 3; }
        else if (c === 1) { cur.push(pt(st.m, buf[k + 1], buf[k + 2])); k += 3; }
        else if (c === 2) { cur.push(pt(st.m, buf[k + 5], buf[k + 6])); cur.push([NaN, NaN]); k += 7; }
        else if (c === 3) { cur.push(pt(st.m, buf[k + 3], buf[k + 4])); cur.push([NaN, NaN]); k += 5; }
        else if (c === 4) { if (cur.length) cur.push(cur[0]); k += 1; }
        else break;
      }
      if (cur.length) subs.push(cur);
      for (const s of subs) {
        if (s.some((p) => isNaN(p[0]))) continue; // curves: not table lines
        const xs = s.map((p) => p[0]), ys = s.map((p) => p[1]);
        const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
        const rect = s.length >= 4 && s.length <= 5 && s.every((p, j) => j === 0 || Math.abs(p[0] - s[j - 1][0]) < 0.5 || Math.abs(p[1] - s[j - 1][1]) < 0.5);
        if (doFill && rect && !isWhite(st.fill)) {
          const bw = bx1 - bx0, bh = by1 - by0;
          if (bh <= 3 && bw > 3) h.push({ y: (by0 + by1) / 2, x0: bx0, x1: bx1 });
          else if (bw <= 3 && bh > 3) v.push({ x: (bx0 + bx1) / 2, y0: by0, y1: by1 });
          else if (bw > 3 && bh > 3 && bw * bh < area * 0.6) boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, color: st.fill });
        }
        if (doStroke && lwPage < 6) {
          for (let j = 1; j < s.length; j++) {
            const [ax, ay] = s[j - 1], [bx, by] = s[j];
            if (Math.abs(ay - by) < 0.8 && Math.abs(ax - bx) > 2) h.push({ y: (ay + by) / 2, x0: Math.min(ax, bx), x1: Math.max(ax, bx) });
            else if (Math.abs(ax - bx) < 0.8 && Math.abs(ay - by) > 2) v.push({ x: (ax + bx) / 2, y0: Math.min(ay, by), y1: Math.max(ay, by) });
          }
        }
      }
    }
  }
  // boxes with a fill also give cell edges (tables drawn with shaded cells instead of lines)
  for (const b of boxes) {
    h.push({ y: b.y0, x0: b.x0, x1: b.x1 }, { y: b.y1, x0: b.x0, x1: b.x1 });
    v.push({ x: b.x0, y0: b.y0, y1: b.y1 }, { x: b.x1, y0: b.y0, y1: b.y1 });
  }
  return { h: mergeH(h), v: mergeV(v), boxes };
}

function mergeH(a: HSeg[]): HSeg[] {
  a.sort((p, q) => p.y - q.y || p.x0 - q.x0);
  const out: HSeg[] = [];
  for (const s of a) {
    const m = out.find((o) => Math.abs(o.y - s.y) < 1.5 && s.x0 <= o.x1 + 2 && s.x1 >= o.x0 - 2);
    if (m) { m.x0 = Math.min(m.x0, s.x0); m.x1 = Math.max(m.x1, s.x1); } else out.push({ ...s });
  }
  return out.filter((s) => s.x1 - s.x0 > 4);
}
function mergeV(a: VSeg[]): VSeg[] {
  a.sort((p, q) => p.x - q.x || p.y0 - q.y0);
  const out: VSeg[] = [];
  for (const s of a) {
    const m = out.find((o) => Math.abs(o.x - s.x) < 1.5 && s.y0 <= o.y1 + 2 && s.y1 >= o.y0 - 2);
    if (m) { m.y0 = Math.min(m.y0, s.y0); m.y1 = Math.max(m.y1, s.y1); } else out.push({ ...s });
  }
  return out.filter((s) => s.y1 - s.y0 > 4);
}

const cluster = (vals: number[], tol: number) => { const s = vals.slice().sort((a, b) => a - b); const out: number[][] = []; for (const v of s) { const l = out[out.length - 1]; if (l && v - l[l.length - 1] <= tol) l.push(v); else out.push([v]); } return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length); };

// ---------- 2. tables ----------
export function findTables(pt: PageText, g: { h: HSeg[]; v: VSeg[]; boxes: Box[] }): Table[] {
  const T = 2.5;
  // split text pieces into single words, so a piece that runs across two cells is shared out correctly
  const words = pt.lines.flatMap((l) => l.words.filter((w) => w.text.trim()).flatMap(splitWord));
  // connected groups of lines that touch each other
  const H = g.h, V = g.v;
  const parent = Array.from({ length: H.length + V.length }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  H.forEach((hs, i) => V.forEach((vs, j) => { if (vs.x >= hs.x0 - T && vs.x <= hs.x1 + T && hs.y >= vs.y0 - T && hs.y <= vs.y1 + T) join(i, H.length + j); }));
  const groups = new Map<number, { h: HSeg[]; v: VSeg[] }>();
  H.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, { h: [], v: [] }); groups.get(r)!.h.push(s); });
  V.forEach((s, j) => { const r = find(H.length + j); if (!groups.has(r)) groups.set(r, { h: [], v: [] }); groups.get(r)!.v.push(s); });

  const tables: Table[] = [];
  const usedH = new Set<HSeg>();
  for (const grp of groups.values()) {
    if (grp.h.length < 2 || grp.v.length < 2) continue;
    const x0 = Math.min(...grp.h.map((s) => s.x0), ...grp.v.map((s) => s.x)), x1 = Math.max(...grp.h.map((s) => s.x1), ...grp.v.map((s) => s.x));
    const y0 = Math.min(...grp.v.map((s) => s.y0), ...grp.h.map((s) => s.y)), y1 = Math.max(...grp.v.map((s) => s.y1), ...grp.h.map((s) => s.y));
    if (x1 - x0 < 30 || y1 - y0 < 10) continue;
    const xs = cluster([x0, x1, ...grp.v.map((s) => s.x)], 3), ys = cluster([y0, y1, ...grp.h.map((s) => s.y)], 3);
    if (xs.length < 2 || ys.length < 2) continue;
    const t = gridTable(xs, ys, grp.h, grp.v, words, g.boxes);
    if (t) { tables.push(t); grp.h.forEach((s) => usedH.add(s)); }
  }
  // tables ruled only with horizontal lines (common in reports and bank statements)
  const free = H.filter((s) => !usedH.has(s) && s.x1 - s.x0 > pt.w * 0.25 && !tables.some((t) => s.y >= t.y0 - T && s.y <= t.y1 + T && s.x0 < t.x1 && s.x1 > t.x0)).sort((a, b) => a.y - b.y);
  const runs: HSeg[][] = [];
  for (const s of free) {
    const r = runs[runs.length - 1]; const last = r?.[r.length - 1];
    if (last && Math.abs(last.x0 - s.x0) < 8 && Math.abs(last.x1 - s.x1) < 8 && s.y - last.y < 80) r.push(s); else runs.push([s]);
  }
  for (const r of runs) {
    if (r.length < 3) continue;
    const x0 = Math.min(...r.map((s) => s.x0)), x1 = Math.max(...r.map((s) => s.x1));
    const t = rowsTable(x0, x1, r.map((s) => s.y), words);
    if (t) tables.push(t);
  }
  return tables.sort((a, b) => a.y0 - b.y0);
}

let mctx: any = null;
/** Text width in a similar font (proportions only). */
function measurer(w: Word): (t: string) => number {
  if (mctx === null) { try { mctx = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8).getContext('2d') : document.createElement('canvas').getContext('2d'); } catch { mctx = false; } }
  if (!mctx) return (t) => t.length;
  mctx.font = `${w.bold ? 'bold ' : ''}20px "${w.font}", Arial, sans-serif`;
  return (t) => mctx.measureText(t).width;
}

/** "Flow meter" → "Flow", "meter" with estimated positions. */
function splitWord(w: Word): Word[] {
  const parts = w.text.split(/(\s+)/); if (parts.length < 3) return [w];
  const m = measurer(w);
  const k = (w.x1 - w.x0) / Math.max(1e-6, m(w.text)); let x = w.x0; const out: Word[] = [];
  for (const p of parts) { const pw = m(p) * k; if (p.trim()) out.push({ ...w, text: p, x0: x, x1: x + pw }); x += pw; }
  return out;
}

const inside = (w: Word, x0: number, y0: number, x1: number, y1: number) => { const cx = (w.x0 + w.x1) / 2, cy = w.y - w.size * 0.3; return cx > x0 && cx < x1 && cy > y0 && cy < y1; };

/** Text of a cell: words grouped into lines; a line that clearly ended early starts a new line in the cell. */
function cellText(ws: Word[], cellW: number): { text: string; bold: boolean; size: number; lines: { x0: number; x1: number }[] } {
  if (!ws.length) return { text: '', bold: false, size: 0, lines: [] };
  ws = ws.slice().sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: Word[][] = [];
  for (const w of ws) { const l = lines.find((L) => Math.abs(L[0].y - w.y) < Math.max(2, w.size * 0.45)); if (l) l.push(w); else lines.push([w]); }
  lines.forEach((l) => l.sort((a, b) => a.x0 - b.x0));
  // superscripts (footnote marks) sit higher on the same line: fold them in
  let text = '';
  const geo = lines.map((l) => ({ x0: Math.min(...l.map((w) => w.x0)), x1: Math.max(...l.map((w) => w.x1)) }));
  const minX = Math.min(...geo.map((g) => g.x0));
  lines.forEach((l, i) => {
    const t = lineText(l);
    if (!i) { text = t; return; }
    const prev = geo[i - 1]; const firstW = (l[0].x1 - l[0].x0);
    const fits = prev.x1 + firstW + l[0].size * 0.5 < minX + cellW * 0.97 - 2 || l[0].y - lines[i - 1][0].y > l[0].size * 1.6; // fits on the line above, or a gap above
    const small = l.every((w) => w.size < lines[i - 1][0].size * 0.75) && l.length <= 2;
    const item = /^([•●▪■◦\-–—*]|\d{1,2}[.)]\s|[A-Z0-9]{1,4}\d?\)?\s*=)/.test(t); // a list item or "code = meaning"
    text += small ? t : fits || item ? '\n' + t : (text.endsWith('-') ? '' : ' ') + t;
  });
  const boldN = ws.filter((w) => w.bold).reduce((a, w) => a + w.text.length, 0), allN = ws.reduce((a, w) => a + w.text.length, 0);
  const sizes = ws.map((w) => w.size).sort((a, b) => a - b);
  return { text: text.trim(), bold: boldN > allN / 2, size: sizes[Math.floor(sizes.length / 2)], lines: geo };
}
function alignOf(lines: { x0: number; x1: number }[], x0: number, x1: number): Cell['align'] {
  if (!lines.length) return 'left';
  const l = Math.min(...lines.map((g) => g.x0)) - x0, r = x1 - Math.max(...lines.map((g) => g.x1));
  if (Math.abs(l - r) < Math.max(3, (x1 - x0) * 0.08) && l > 4) return 'center';
  if (r < l * 0.4 && l > 8) return 'right';
  return 'left';
}

function gridTable(xs: number[], ys: number[], H: HSeg[], V: VSeg[], words: Word[], boxes: Box[]): Table | null {
  const R = ys.length - 1, C = xs.length - 1;
  const T = 2.5;
  const hasH = (y: number, xa: number, xb: number) => H.some((s) => Math.abs(s.y - y) < T && s.x0 <= xa + T && s.x1 >= xb - T);
  const hasV = (x: number, ya: number, yb: number) => V.some((s) => Math.abs(s.x - x) < T && s.y0 <= ya + T && s.y1 >= yb - T);
  // join grid units that have no line between them → merged cells
  const id = (r: number, c: number) => r * C + c;
  const par = Array.from({ length: R * C }, (_, i) => i);
  const f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const mx0 = xs[c] + (xs[c + 1] - xs[c]) * 0.25, mx1 = xs[c + 1] - (xs[c + 1] - xs[c]) * 0.25;
    const my0 = ys[r] + (ys[r + 1] - ys[r]) * 0.25, my1 = ys[r + 1] - (ys[r + 1] - ys[r]) * 0.25;
    if (c + 1 < C && !hasV(xs[c + 1], my0, my1)) par[f(id(r, c))] = f(id(r, c + 1));
    if (r + 1 < R && !hasH(ys[r + 1], mx0, mx1)) par[f(id(r, c))] = f(id(r + 1, c));
  }
  const regions = new Map<number, { r0: number; r1: number; c0: number; c1: number; n: number }>();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const k = f(id(r, c)); const g = regions.get(k) ?? { r0: r, r1: r, c0: c, c1: c, n: 0 }; g.r0 = Math.min(g.r0, r); g.r1 = Math.max(g.r1, r); g.c0 = Math.min(g.c0, c); g.c1 = Math.max(g.c1, c); g.n++; regions.set(k, g); }
  const cells: Cell[] = [];
  const addCell = (r0: number, r1: number, c0: number, c1: number) => {
    const X0 = xs[c0], X1 = xs[c1 + 1], Y0 = ys[r0], Y1 = ys[r1 + 1];
    const ws = words.filter((w) => inside(w, X0, Y0, X1, Y1));
    const ct = cellText(ws, X1 - X0 - 4);
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const box = boxes.filter((b) => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
    cells.push({ r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1, text: ct.text, bold: ct.bold, align: alignOf(ct.lines, X0, X1), fill: box?.color, wrap: ct.text.includes('\n') || ct.lines.length > 1, size: ct.size });
  };
  for (const g of regions.values()) {
    if (g.n === (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1)) addCell(g.r0, g.r1, g.c0, g.c1);
    else for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (regions.get(f(id(r, c))) === g) addCell(r, r, c, c);
  }
  const filled = cells.filter((c) => c.text).length;
  // a frame around a picture or one box of text is not a table
  if (filled < 2 || (R < 2 && C < 2) || cells.length < 3) return null;
  // drop empty grid columns/rows that are only a few points wide (double lines)
  return { x0: xs[0], x1: xs[C], y0: ys[0], y1: ys[R], colW: xs.slice(1).map((x, i) => x - xs[i]), rowH: ys.slice(1).map((y, i) => y - ys[i]), cells: cells.sort((a, b) => a.r - b.r || a.c - b.c), ruled: 'grid' };
}

function rowsTable(x0: number, x1: number, ys: number[], words: Word[]): Table | null {
  const Y0 = ys[0], Y1 = ys[ys.length - 1];
  const ws = words.filter((w) => inside(w, x0 - 2, Y0, x1 + 2, Y1));
  if (ws.length < 4) return null;
  // columns: split where (almost) no row has text
  const R0 = ys.length - 1;
  const bin = 0.5, nb = Math.ceil((x1 - x0) / bin) + 1;
  const cover = new Array(nb).fill(0);
  for (let r = 0; r < R0; r++) {
    const seen = new Uint8Array(nb);
    ws.filter((w) => inside(w, x0 - 2, ys[r], x1 + 2, ys[r + 1])).forEach((w) => { for (let b = Math.max(0, Math.floor((w.x0 - x0) / bin)); b <= Math.min(nb - 1, Math.ceil((w.x1 - x0) / bin)); b++) seen[b] = 1; });
    seen.forEach((v, b) => (cover[b] += v));
  }
  const limit = Math.max(0, Math.floor(R0 * 0.08));
  const spans: [number, number][] = []; let st = -1;
  for (let b = 0; b <= nb; b++) {
    const busy = b < nb && cover[b] > limit;
    if (busy && st < 0) st = b;
    if (!busy && st >= 0) { const a = x0 + st * bin, e = x0 + b * bin; const l = spans[spans.length - 1]; if (l && a - l[1] < 2) l[1] = e; else spans.push([a, e]); st = -1; }
  }
  if (spans.length < 2) return null;
  const xs = [x0, ...spans.slice(1).map((s, i) => (spans[i][1] + s[0]) / 2), x1];
  const C = xs.length - 1, R = ys.length - 1;
  const cells: Cell[] = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cw = ws.filter((w) => inside(w, xs[c], ys[r], xs[c + 1], ys[r + 1]));
    const ct = cellText(cw, xs[c + 1] - xs[c]);
    cells.push({ r, c, rs: 1, cs: 1, text: ct.text, bold: ct.bold, align: alignOf(ct.lines, c ? spans[c][0] - 1 : x0, c < C - 1 ? spans[c][1] + 1 : x1), wrap: ct.lines.length > 1, size: ct.size });
  }
  if (cells.filter((c) => c.text).length < 4) return null;
  return { x0, x1, y0: Y0, y1: Y1, colW: xs.slice(1).map((x, i) => x - xs[i]), rowH: ys.slice(1).map((y, i) => y - ys[i]), cells, ruled: 'rows' };
}
