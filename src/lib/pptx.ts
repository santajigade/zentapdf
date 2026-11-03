// PowerPoint (PPTX) slide renderer: draws each slide onto a canvas the way PowerPoint lays it out —
// theme colours, master/layout text styles, bullets, placeholders, gradients, pictures, tables and charts.
import type { Slide } from './office';

const EMU = 12700; // EMU per point
type El = Element | undefined | null;
const kids = (el: El, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: El, name: string) => kids(el, name)[0];
const deep = (el: El, name: string) => (el ? Array.from(el.getElementsByTagName('*')).find((c) => c.localName === name) : undefined);
const num = (v: string | null | undefined, d = 0) => (v == null || v === '' ? d : +v);

// ---------- colours ----------
function hexToRgb(h: string) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHsl(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hslToRgb(h: number, s: number, l: number) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }

class Theme {
  scheme: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
  major = 'Calibri Light'; minor = 'Calibri';
  map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  /** Resolve a colour element (srgbClr, schemeClr…) with tint/shade/lumMod/alpha. */
  color(holder: El, phClr?: string): string | undefined {
    if (!holder) return undefined;
    const c = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].map((n) => kid(holder, n)).find(Boolean) ?? (['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(holder.localName) ? holder : undefined);
    if (!c) return undefined;
    let hex: string;
    const v = c.getAttribute('val') ?? '';
    if (c.localName === 'srgbClr') hex = v;
    else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') ?? (v === 'window' ? 'FFFFFF' : '000000');
    else if (c.localName === 'schemeClr') hex = v === 'phClr' && phClr ? phClr.replace('#', '') : this.scheme[this.map[v] ?? v] ?? '000000';
    else if (c.localName === 'prstClr') hex = ({ black: '000000', white: 'FFFFFF', red: 'FF0000', green: '00FF00', blue: '0000FF', yellow: 'FFFF00', gray: '808080' } as any)[v] ?? '000000';
    else hex = '000000';
    let [r, g, b] = hexToRgb(hex); let a = 1;
    for (const m of Array.from(c.children)) {
      const val = num(m.getAttribute('val')) / 100000;
      if (m.localName === 'tint' || m.localName === 'shade') { // PowerPoint applies these in linear light
        const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const srgb = (c: number) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
        const f = (c: number) => srgb(m.localName === 'tint' ? 1 - (1 - lin(c)) * val : lin(c) * val);
        r = f(r); g = f(g); b = f(b);
      }
      else if (m.localName === 'lumMod' || m.localName === 'lumOff') { const [h, s, l] = rgbToHsl(r, g, b); const nl = m.localName === 'lumMod' ? l * val : Math.min(1, l + val); [r, g, b] = hslToRgb(h, s, nl); }
      else if (m.localName === 'alpha') a = val;
    }
    const f = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
    return a < 1 ? `rgba(${f(r)},${f(g)},${f(b)},${a})` : `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  font(tf: string | null | undefined) { if (!tf) return undefined; const f = tf.startsWith('+mj') ? this.major : tf.startsWith('+mn') ? this.minor : tf; return f === 'Calibri Light' ? 'Calibri' : f; }
}

// ---------- text styles ----------
type PStyle = { algn?: string; marL?: number; indent?: number; bu?: { char?: string; none?: boolean; auto?: string; font?: string; color?: string; size?: number }; spcBef?: { pct?: number; pts?: number }; spcAft?: { pct?: number; pts?: number }; lnSpc?: { pct?: number; pts?: number }; sz?: number; b?: boolean; i?: boolean; u?: boolean; color?: string; font?: string; caps?: boolean };
function readLvl(lvl: El, th: Theme): PStyle {
  if (!lvl) return {};
  const s: PStyle = {};
  const a = (n: string) => lvl.getAttribute(n);
  if (a('algn')) s.algn = a('algn')!;
  if (a('marL') != null) s.marL = num(a('marL')) / EMU;
  if (a('indent') != null) s.indent = num(a('indent')) / EMU;
  const sp = (n: string) => { const e = kid(lvl, n); if (!e) return undefined; const p = kid(e, 'spcPct'), t = kid(e, 'spcPts'); return p ? { pct: num(p.getAttribute('val')) / 100000 } : t ? { pts: num(t.getAttribute('val')) / 100 } : undefined; };
  s.spcBef = sp('spcBef'); s.spcAft = sp('spcAft'); s.lnSpc = sp('lnSpc');
  if (kid(lvl, 'buNone')) s.bu = { none: true };
  else if (kid(lvl, 'buChar')) s.bu = { char: kid(lvl, 'buChar')!.getAttribute('char') ?? '•' };
  else if (kid(lvl, 'buAutoNum')) s.bu = { auto: kid(lvl, 'buAutoNum')!.getAttribute('type') ?? 'arabicPeriod' };
  if (s.bu) { const bf = kid(lvl, 'buFont'); if (bf) s.bu.font = bf.getAttribute('typeface') ?? undefined; const bc = kid(lvl, 'buClr'); if (bc) s.bu.color = th.color(bc); const bs = kid(lvl, 'buSzPct'); if (bs) s.bu.size = num(bs.getAttribute('val')) / 100000; }
  Object.assign(s, readRun(kid(lvl, 'defRPr'), th));
  return s;
}
function readRun(r: El, th: Theme): PStyle {
  if (!r) return {};
  const s: PStyle = {};
  if (r.getAttribute('sz')) s.sz = num(r.getAttribute('sz')) / 100;
  if (r.getAttribute('b') != null) s.b = r.getAttribute('b') === '1' || r.getAttribute('b') === 'true';
  if (r.getAttribute('i') != null) s.i = r.getAttribute('i') === '1' || r.getAttribute('i') === 'true';
  if (r.getAttribute('u') != null) s.u = r.getAttribute('u') !== 'none';
  if (r.getAttribute('cap') === 'all') s.caps = true;
  const fill = kid(r, 'solidFill'); if (fill) s.color = th.color(fill);
  const lat = kid(r, 'latin'); if (lat) s.font = th.font(lat.getAttribute('typeface'));
  return s;
}
/** Merge styles: earlier sources win. */
const merge = (...ss: (PStyle | undefined)[]): PStyle => { const o: any = {}; for (const s of ss.slice().reverse()) if (s) for (const [k, v] of Object.entries(s)) if (v !== undefined) o[k] = k === 'bu' && o.bu ? { ...o.bu, ...v } : v; return o; };

// ---------- text layout ----------
type Run = { t: string; sz: number; b: boolean; i: boolean; u: boolean; color: string; font: string; br?: boolean };
type Para = { runs: Run[]; st: PStyle; bullet?: string; buColor?: string; buFont?: string; buSize?: number };

function fontCss(r: { sz: number; b: boolean; i: boolean; font: string }, scale: number) {
  return `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${r.sz * scale}px "${r.font}", Calibri, Carlito, Arial, sans-serif`;
}

function layoutText(ctx: CanvasRenderingContext2D, paras: Para[], w: number, fontScale: number, lnReduce: number) {
  type Piece = { t: string; font: string; color: string; w: number; u: boolean };
  type Line = { pieces: Piece[]; w: number; asc: number; h: number; algn: string; x0: number; spcBef: number };
  const lines: Line[] = [];
  for (const p of paras) {
    const algn = p.st.algn ?? 'l';
    const marL = p.st.marL ?? 0, ind = p.st.indent ?? 0;
    const maxSz = Math.max(...p.runs.map((r) => r.sz), p.runs.length ? 0 : (p.st.sz ?? 18)) * fontScale;
    const lnPct = p.st.lnSpc?.pct ? p.st.lnSpc.pct - lnReduce : undefined;
    const lineH = (sz: number) => (p.st.lnSpc?.pts ? p.st.lnSpc.pts * fontScale : sz * 1.2 * (lnPct ?? 1 - lnReduce));
    const bef = p.st.spcBef?.pts ?? (p.st.spcBef?.pct ?? 0) * maxSz;
    let cur: Line = { pieces: [], w: 0, asc: maxSz, h: lineH(maxSz), algn, x0: marL + ind, spcBef: bef };
    if (p.bullet && p.runs.some((r) => r.t.trim())) {
      const bsz = maxSz * (p.buSize ?? 1); ctx.font = `${bsz}px "${p.buFont ?? 'Arial'}", Arial, sans-serif`;
      const bw = ctx.measureText(p.bullet).width; const gap = Math.max(bw + 4, -ind);
      cur.pieces.push({ t: p.bullet, font: ctx.font, color: p.buColor ?? p.runs.find((r) => r.t.trim())?.color ?? '#000', w: gap, u: false }); cur.w = gap;
    }
    const avail = (l: Line) => w - l.x0;
    if (!p.runs.length || !p.runs.some((r) => r.t)) { lines.push(cur); continue; }
    for (const r of p.runs) {
      if (r.br) { lines.push(cur); cur = { pieces: [], w: 0, asc: r.sz * fontScale, h: lineH(r.sz * fontScale), algn, x0: marL, spcBef: 0 }; continue; }
      const font = fontCss(r, fontScale); ctx.font = font;
      for (const word of r.t.split(/(\s+)/)) {
        if (!word) continue;
        const ww = ctx.measureText(word).width;
        if (cur.w + ww > avail(cur) + 0.5 && cur.pieces.some((x) => x.t.trim()) && !/^\s+$/.test(word)) {
          lines.push(cur); cur = { pieces: [], w: 0, asc: r.sz * fontScale, h: lineH(r.sz * fontScale), algn, x0: marL, spcBef: 0 };
        }
        if (!cur.pieces.length && /^\s+$/.test(word)) continue;
        cur.pieces.push({ t: word, font, color: r.color, w: ww, u: r.u }); cur.w += ww;
        cur.asc = Math.max(cur.asc, r.sz * fontScale); cur.h = Math.max(cur.h, lineH(r.sz * fontScale));
      }
    }
    lines.push(cur);
    const aft = p.st.spcAft?.pts ?? (p.st.spcAft?.pct ?? 0) * maxSz;
    if (aft) lines.push({ pieces: [], w: 0, asc: 0, h: aft, algn, x0: 0, spcBef: 0 });
  }
  if (lines.length) lines[0].spcBef = 0;
  const total = lines.reduce((s, l) => s + l.h + l.spcBef, 0);
  return { lines, total };
}

function drawTextBox(ctx: CanvasRenderingContext2D, paras: Para[], x: number, y: number, w: number, h: number, anchor: string, autofit: { scale: number; ln: number; shrink: boolean }, vert?: string) {
  if (!paras.some((p) => p.runs.some((r) => r.t.trim()))) return;
  let scale = autofit.scale, ln = autofit.ln;
  let L = layoutText(ctx, paras, w, scale, ln);
  // PowerPoint shrinks text on overflow when "shrink text on overflow" is set
  if (autofit.shrink) for (let k = 0; k < 8 && L.total > h * 1.02; k++) { scale *= 0.9; ln = Math.min(0.2, ln + 0.05); L = layoutText(ctx, paras, w, scale, ln); }
  let yy = anchor === 'ctr' ? y + (h - L.total) / 2 : anchor === 'b' ? y + h - L.total : y;
  ctx.save();
  if (vert === 'vert270') { ctx.translate(x, y + h); ctx.rotate(-Math.PI / 2); }
  for (const l of L.lines) {
    yy += l.spcBef;
    const base = yy + l.h * 0.5 + l.asc * 0.35; // baseline near the middle of the line box
    const contentW = l.w;
    let xx = l.algn === 'ctr' ? x + l.x0 + (w - l.x0 - contentW) / 2 : l.algn === 'r' ? x + w - contentW : x + l.x0;
    for (const p of l.pieces) {
      ctx.font = p.font; ctx.fillStyle = p.color; ctx.textBaseline = 'alphabetic'; ctx.fillText(p.t, xx, base);
      if (p.u && p.t.trim()) { ctx.fillRect(xx, base + 2, p.w, Math.max(1, l.asc / 16)); }
      xx += p.w;
    }
    yy += l.h;
  }
  ctx.restore();
}

function shapePath(ctx: CanvasRenderingContext2D, geom: string, x: number, y: number, w: number, h: number, adj?: number) {
  ctx.beginPath();
  const r = Math.min(Math.abs(w), Math.abs(h));
  switch (geom) {
    case 'ellipse': case 'flowChartConnector': ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); break;
    case 'roundRect': case 'flowChartAlternateProcess': ctx.roundRect(x, y, w, h, r * (adj ?? 0.16667)); break;
    case 'triangle': ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break;
    case 'rtTriangle': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break;
    case 'diamond': case 'flowChartDecision': ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); break;
    case 'rightArrow': { const hh = h * 0.25, hw = Math.min(w, h) * 0.5; ctx.moveTo(x, y + hh); ctx.lineTo(x + w - hw, y + hh); ctx.lineTo(x + w - hw, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - hw, y + h); ctx.lineTo(x + w - hw, y + h - hh); ctx.lineTo(x, y + h - hh); ctx.closePath(); break; }
    case 'leftArrow': { const hh = h * 0.25, hw = Math.min(w, h) * 0.5; ctx.moveTo(x + w, y + hh); ctx.lineTo(x + hw, y + hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(x + hw, y + h); ctx.lineTo(x + hw, y + h - hh); ctx.lineTo(x + w, y + h - hh); ctx.closePath(); break; }
    case 'chevron': { const d = Math.min(w, h) * 0.5; ctx.moveTo(x, y); ctx.lineTo(x + w - d, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + d, y + h / 2); ctx.closePath(); break; }
    case 'homePlate': { const d = Math.min(w, h) * 0.5; ctx.moveTo(x, y); ctx.lineTo(x + w - d, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
    case 'hexagon': { const d = w * 0.25; ctx.moveTo(x + d, y); ctx.lineTo(x + w - d, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x + d, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); break; }
    case 'parallelogram': { const d = w * 0.25; ctx.moveTo(x + d, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - d, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
    case 'line': case 'straightConnector1': case 'bentConnector3': case 'curvedConnector3': ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); break;
    case 'snip1Rect': { const d = r * 0.16667; ctx.moveTo(x, y); ctx.lineTo(x + w - d, y); ctx.lineTo(x + w, y + d); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
    case 'round2SameRect': ctx.roundRect(x, y, w, h, [r * 0.16667, r * 0.16667, 0, 0]); break;
    default: ctx.rect(x, y, w, h);
  }
}

/** Fill for spPr / bgPr: solid colour, gradient or picture. */
function fillStyle(ctx: CanvasRenderingContext2D, pr: El, th: Theme, x: number, y: number, w: number, h: number, phClr?: string): string | CanvasGradient | null | 'none' | { img: string } {
  if (!pr) return null;
  if (kid(pr, 'noFill')) return 'none';
  const sf = kid(pr, 'solidFill'); if (sf) return th.color(sf, phClr) ?? null;
  const gf = kid(pr, 'gradFill');
  if (gf) {
    const stops = kids(kid(gf, 'gsLst'), 'gs').map((g) => ({ pos: num(g.getAttribute('pos')) / 100000, col: th.color(g, phClr) ?? '#fff' })).sort((a, b) => a.pos - b.pos);
    const lin = kid(gf, 'lin'); const path = kid(gf, 'path');
    let grad: CanvasGradient;
    if (path && !lin) { const r = Math.hypot(w, h) / 2; grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, r); }
    else {
      const ang = (num(lin?.getAttribute('ang')) / 60000) * Math.PI / 180;
      const cx = x + w / 2, cy = y + h / 2, dx = Math.cos(ang), dy = Math.sin(ang);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    }
    stops.forEach((s) => grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.col));
    return grad;
  }
  const bf = kid(pr, 'blipFill'); if (bf) { const blip = kid(bf, 'blip'); const id = blip?.getAttribute('r:embed'); if (id) return { img: id }; }
  return null;
}

// ---------- charts ----------
type Series = { name: string; cats: string[]; vals: number[]; color?: string };
function readCache(el: El): string[] {
  const c = deep(el, 'strCache') ?? deep(el, 'numCache'); if (!c) { const lit = deep(el, 'strLit') ?? deep(el, 'numLit'); if (!lit) return []; return kids(lit, 'pt').map((p) => kid(p, 'v')?.textContent ?? ''); }
  const n = num(kid(c, 'ptCount')?.getAttribute('val')); const out: string[] = Array(n).fill('');
  kids(c, 'pt').forEach((p) => { out[num(p.getAttribute('idx'))] = kid(p, 'v')?.textContent ?? ''; });
  return out;
}
function niceScale(min: number, max: number, ticks = 6) {
  if (min === max) { max = min + 1; }
  const span = max - min; const raw = span / ticks; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}
function fmtNum(v: number) { return Math.abs(v) >= 1000 ? v.toLocaleString('en') : String(Math.round(v * 100) / 100); }

function drawChart(ctx: CanvasRenderingContext2D, xml: Document, th: Theme, x: number, y: number, w: number, h: number) {
  const plot = deep(xml.documentElement, 'plotArea'); if (!plot) return;
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((a) => '#' + th.scheme[a]);
  const types = Array.from(plot.children).filter((c) => /Chart$/.test(c.localName));
  if (!types.length) return;
  const ctype = types[0]; const kind = ctype.localName;
  const series: Series[] = kids(ctype, 'ser').map((s, i) => ({ name: readCache(kid(s, 'tx')).join(' ') || `Series ${i + 1}`, cats: readCache(kid(s, 'cat') ?? kid(s, 'xVal')), vals: readCache(kid(s, 'val') ?? kid(s, 'yVal')).map((v) => parseFloat(v) || 0), color: th.color(kid(kid(s, 'spPr'), 'solidFill')) ?? th.color(kid(kid(kid(s, 'spPr'), 'ln'), 'solidFill')) }));
  if (!series.length) return;
  const txt = deep(xml.documentElement, 'txPr'); const baseSz = num(deep(txt, 'defRPr')?.getAttribute('sz'), 1000) / 100;
  const fs = Math.max(7, Math.min(baseSz, h / 22));
  ctx.save(); ctx.fillStyle = '#404040'; ctx.strokeStyle = '#d9d9d9';
  const font = (s: number, b = false) => `${b ? 'bold ' : ''}${s}px Calibri, Carlito, Arial, sans-serif`;
  let top = y + 6, bottom = y + h - 6, left = x + 6, right = x + w - 6;
  // title
  const chartEl = deep(xml.documentElement, 'chart');
  const tEl = kid(chartEl, 'title'); const autoDel = kid(chartEl, 'autoTitleDeleted')?.getAttribute('val') === '1';
  let title = tEl ? Array.from(tEl.getElementsByTagName('*')).filter((e) => e.localName === 't').map((e) => e.textContent).join('') : '';
  if (!title && !autoDel && series.length === 1 && (kind === 'pieChart' || kind === 'doughnutChart' || tEl)) title = series[0].name;
  if (title) { ctx.font = font(fs * 1.4, true); ctx.textAlign = 'center'; ctx.fillStyle = '#404040'; ctx.fillText(title, x + w / 2, top + fs * 1.4); top += fs * 2.2; }
  // legend
  const leg = kid(chartEl, 'legend'); const pos = kid(leg, 'legendPos')?.getAttribute('val') ?? 'r';
  const pie = kind === 'pieChart' || kind === 'doughnutChart' || kind === 'pie3DChart';
  const legItems = pie ? series[0].cats.map((c, i) => ({ t: c, col: accents[i % 6] })) : series.map((s, i) => ({ t: s.name, col: s.color ?? accents[i % 6] }));
  if (pie) kids(kids(ctype, 'ser')[0], 'dPt').forEach((d) => { const idx = num(kid(d, 'idx')?.getAttribute('val')); const c = th.color(kid(kid(d, 'spPr'), 'solidFill')); if (c && legItems[idx]) legItems[idx].col = c; });
  if (leg) {
    ctx.font = font(fs); ctx.textAlign = 'left';
    if (pos === 'b' || pos === 't') {
      const widths = legItems.map((l) => ctx.measureText(l.t).width + fs * 2); const tot = widths.reduce((a, b) => a + b, 0);
      let lx = x + (w - tot) / 2; const ly = pos === 'b' ? bottom - fs * 0.3 : top + fs;
      legItems.forEach((l, i) => { ctx.fillStyle = l.col; ctx.fillRect(lx, ly - fs * 0.75, fs * 0.75, fs * 0.75); ctx.fillStyle = '#404040'; ctx.fillText(l.t, lx + fs, ly); lx += widths[i]; });
      if (pos === 'b') bottom -= fs * 1.8; else top += fs * 1.8;
    } else {
      const lw = Math.max(...legItems.map((l) => ctx.measureText(l.t).width)) + fs * 1.6; const lx = pos === 'l' ? left : right - lw;
      let ly = y + h / 2 - (legItems.length * fs * 1.4) / 2 + fs;
      legItems.forEach((l) => { ctx.fillStyle = l.col; ctx.fillRect(lx, ly - fs * 0.75, fs * 0.75, fs * 0.75); ctx.fillStyle = '#404040'; ctx.fillText(l.t, lx + fs, ly); ly += fs * 1.4; });
      if (pos === 'l') left += lw + 6; else right -= lw + 6;
    }
  }
  if (pie) {
    const s = series[0]; const tot = s.vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(4, Math.min(right - left, bottom - top) / 2 - 4);
    const hole = kind === 'doughnutChart' ? r * num(kid(ctype, 'holeSize')?.getAttribute('val'), 50) / 100 : 0;
    let a0 = -Math.PI / 2 + (num(kid(ctype, 'firstSliceAng')?.getAttribute('val')) * Math.PI) / 180;
    s.vals.forEach((v, i) => { const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); ctx.fillStyle = legItems[i]?.col ?? accents[i % 6]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); a0 = a1; });
    if (hole) { ctx.beginPath(); ctx.arc(cx, cy, hole, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.restore(); return;
  }
  // axes charts: bar / column / line / area / scatter
  const horizontal = kind === 'barChart' && kid(ctype, 'barDir')?.getAttribute('val') === 'bar';
  const grouping = kid(ctype, 'grouping')?.getAttribute('val') ?? 'clustered';
  const stacked = grouping === 'stacked' || grouping === 'percentStacked';
  const pct = grouping === 'percentStacked';
  const cats = series[0].cats.length ? series[0].cats : series[0].vals.map((_, i) => String(i + 1));
  const n = cats.length;
  let vmin = 0, vmax = 0;
  if (stacked) for (let i = 0; i < n; i++) { let p = 0, q = 0; series.forEach((s) => { const v = s.vals[i] ?? 0; if (v >= 0) p += v; else q += v; }); vmax = Math.max(vmax, pct ? 100 : p); vmin = Math.min(vmin, pct ? 0 : q); }
  else series.forEach((s) => s.vals.forEach((v) => { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }));
  const valAx = kid(plot, 'valAx'); const sc = kid(valAx, 'scaling');
  const fixedMax = kid(sc, 'max')?.getAttribute('val'), fixedMin = kid(sc, 'min')?.getAttribute('val');
  const ns = niceScale(fixedMin != null ? +fixedMin : vmin, fixedMax != null ? +fixedMax : vmax);
  let { lo, hi } = ns; const step = ns.step;
  if (fixedMin != null) lo = +fixedMin; if (fixedMax != null) hi = +fixedMax;
  // like Office, leave some room above the tallest value
  if (fixedMax == null && !pct && vmax > 0 && hi - vmax < (hi - lo) * 0.05 + 1e-9) hi += step;
  ctx.font = font(fs); const lblW = Math.max(...Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => ctx.measureText(fmtNum(lo + k * step) + (pct ? '%' : '')).width));
  const catW = Math.max(...cats.map((c) => ctx.measureText(c).width));
  if (horizontal) { left += catW + 8; bottom -= fs * 1.6; } else { left += lblW + 8; bottom -= fs * 1.8; }
  right -= 6; top += 4;
  const pw = right - left, ph = bottom - top; if (pw < 10 || ph < 10) { ctx.restore(); return; }
  const vpos = (v: number) => (horizontal ? left + ((v - lo) / (hi - lo)) * pw : bottom - ((v - lo) / (hi - lo)) * ph);
  // gridlines + value labels
  ctx.lineWidth = 1; ctx.textAlign = horizontal ? 'center' : 'right';
  const grid = !!kid(valAx, 'majorGridlines');
  for (let v = lo; v <= hi + step / 1000; v += step) {
    const p = vpos(v);
    if (grid) { ctx.strokeStyle = '#d9d9d9'; ctx.beginPath(); if (horizontal) { ctx.moveTo(p, top); ctx.lineTo(p, bottom); } else { ctx.moveTo(left, p); ctx.lineTo(right, p); } ctx.stroke(); }
    ctx.fillStyle = '#595959'; if (horizontal) ctx.fillText(fmtNum(v) + (pct ? '%' : ''), p, bottom + fs * 1.2); else ctx.fillText(fmtNum(v) + (pct ? '%' : ''), left - 4, p + fs * 0.35);
  }
  ctx.strokeStyle = '#bfbfbf'; ctx.beginPath(); if (horizontal) { ctx.moveTo(vpos(Math.max(lo, 0)), top); ctx.lineTo(vpos(Math.max(lo, 0)), bottom); } else { ctx.moveTo(left, vpos(Math.max(lo, 0))); ctx.lineTo(right, vpos(Math.max(lo, 0))); } ctx.stroke();
  // category labels
  const band = (horizontal ? ph : pw) / n;
  ctx.fillStyle = '#595959'; ctx.textAlign = horizontal ? 'right' : 'center';
  const every = Math.max(1, Math.ceil((catW + 6) / band)) ;
  cats.forEach((c, i) => { if (horizontal) ctx.fillText(c, left - 4, top + band * (i + 0.5) + fs * 0.35); else if (i % (horizontal ? 1 : every) === 0) ctx.fillText(c, left + band * (i + 0.5), bottom + fs * 1.3); });
  const zero = vpos(Math.max(lo, Math.min(hi, 0)));
  if (kind === 'barChart' || kind === 'bar3DChart') {
    const gapW = num(kid(ctype, 'gapWidth')?.getAttribute('val'), 150) / 100;
    const groupW = band / (1 + gapW);
    const barW = stacked ? groupW : groupW / series.length;
    for (let i = 0; i < n; i++) {
      let accP = 0, accN = 0; const tot = series.reduce((a, s) => a + Math.abs(s.vals[i] ?? 0), 0) || 1;
      series.forEach((s, k) => {
        let v = s.vals[i] ?? 0; if (pct) v = (v / tot) * 100;
        const start = stacked ? (v >= 0 ? accP : accN) : 0; const end = start + v; if (stacked) { if (v >= 0) accP = end; else accN = end; }
        const off = (band - groupW) / 2 + (stacked ? 0 : k * barW);
        ctx.fillStyle = s.color ?? accents[k % 6];
        if (horizontal) { const a = vpos(start), b = vpos(end); ctx.fillRect(Math.min(a, b), top + band * i + off, Math.abs(b - a), barW * 0.98); }
        else { const a = vpos(start), b = vpos(end); ctx.fillRect(left + band * i + off, Math.min(a, b), barW * 0.98, Math.abs(b - a)); }
      });
    }
  } else if (kind === 'lineChart' || kind === 'areaChart' || kind === 'scatterChart' || kind === 'line3DChart' || kind === 'area3DChart') {
    const acc = Array(n).fill(0);
    series.forEach((s, k) => {
      const col = s.color ?? accents[k % 6];
      const pts = s.vals.map((v, i) => { const base = stacked ? acc[i] : 0; const val = base + v; if (stacked) acc[i] = val; return [left + band * (i + 0.5), vpos(val), vpos(base)] as const; });
      if (kind.startsWith('area')) { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], stacked ? pts[i][2] : zero); ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
      else {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, h / 200); ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); if (kind !== 'scatterChart' || kid(kids(ctype, 'ser')[k], 'spPr')) ctx.stroke();
        const marker = kid(kid(kids(ctype, 'ser')[k], 'marker'), 'symbol')?.getAttribute('val');
        if (marker !== 'none') { ctx.fillStyle = col; pts.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, Math.max(2, h / 140), 0, Math.PI * 2); ctx.fill(); }); }
      }
    });
  }
  ctx.restore();
}

// ---------- slides ----------
export async function pptxSlides(buf: ArrayBuffer): Promise<Slide[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(buf));
  const cache = new Map<string, Document | null>();
  const xml = (p: string) => { if (!cache.has(p)) cache.set(p, z[p] ? new DOMParser().parseFromString(strFromU8(z[p]), 'application/xml') : null); return cache.get(p)!; };
  const pres = xml('ppt/presentation.xml'); if (!pres) throw new Error('This file is not a valid PowerPoint (PPTX) file.');
  const sz = deep(pres.documentElement, 'sldSz');
  const W = num(sz?.getAttribute('cx'), 9144000) / EMU, H = num(sz?.getAttribute('cy'), 6858000) / EMU;
  const resolve = (base: string, t: string) => { const parts = (base.slice(0, base.lastIndexOf('/') + 1) + t).split('/'); const o: string[] = []; for (const p of parts) { if (p === '..') o.pop(); else if (p !== '.') o.push(p); } return o.join('/'); };
  const rels = (part: string) => { const r = xml(part.replace(/([^/]+)$/, '_rels/$1.rels')); const m = new Map<string, { target: string; type: string }>(); r?.querySelectorAll('Relationship').forEach((e) => m.set(e.getAttribute('Id')!, { target: e.getAttribute('TargetMode') === 'External' ? '' : resolve(part, e.getAttribute('Target')!), type: e.getAttribute('Type') ?? '' })); return m; };
  const presRels = rels('ppt/presentation.xml');
  const order = kids(deep(pres.documentElement, 'sldIdLst'), 'sldId').map((e) => presRels.get(e.getAttribute('r:id')!)?.target).filter(Boolean) as string[];
  const bitmaps = new Map<string, Promise<ImageBitmap | null>>();
  const bitmap = (path: string) => {
    if (!bitmaps.has(path)) bitmaps.set(path, (async () => { const d = z[path]; if (!d || /\.(emf|wmf|tiff?)$/i.test(path)) return null; try { return await createImageBitmap(new Blob([d as BlobPart], { type: /\.png$/i.test(path) ? 'image/png' : /\.svg$/i.test(path) ? 'image/svg+xml' : /\.gif$/i.test(path) ? 'image/gif' : 'image/jpeg' })); } catch { return null; } })());
    return bitmaps.get(path)!;
  };
  const defaults = deep(pres.documentElement, 'defaultTextStyle');

  type Ctx = { part: string; rels: Map<string, { target: string; type: string }>; doc: Document };
  const load = (part: string): Ctx | null => { const d = xml(part); return d ? { part, rels: rels(part), doc: d } : null; };
  const themeFor = (master: Ctx | null) => {
    const th = new Theme();
    const tp = master ? [...master.rels.values()].find((r) => r.type.endsWith('/theme'))?.target : undefined;
    const td = tp ? xml(tp) : null;
    const cs = deep(td?.documentElement, 'clrScheme');
    cs && Array.from(cs.children).forEach((c) => { const v = deep(c, 'srgbClr')?.getAttribute('val') ?? deep(c, 'sysClr')?.getAttribute('lastClr'); if (v) th.scheme[c.localName] = v; });
    th.major = deep(deep(td?.documentElement, 'majorFont'), 'latin')?.getAttribute('typeface') || th.major;
    th.minor = deep(deep(td?.documentElement, 'minorFont'), 'latin')?.getAttribute('typeface') || th.minor;
    const cm = kid(master?.doc.documentElement, 'clrMap'); if (cm) for (const a of Array.from(cm.attributes)) th.map[a.name] = a.value;
    return th;
  };
  const phInfo = (sp: Element) => { const ph = deep(kid(sp, 'nvSpPr') ?? kid(sp, 'nvPicPr') ?? kid(sp, 'nvGraphicFramePr'), 'ph'); if (!ph) return null; return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '' }; };
  const findPh = (c: Ctx | null, key: { type: string; idx: string }) => {
    if (!c) return undefined;
    const sps = Array.from(c.doc.getElementsByTagName('*')).filter((e) => e.localName === 'sp');
    const norm = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t);
    return sps.find((s) => { const k = phInfo(s); return k && key.idx && k.idx === key.idx; })
      ?? sps.find((s) => { const k = phInfo(s); return k && k.type === key.type; })
      ?? sps.find((s) => { const k = phInfo(s); return k && norm(k.type) === norm(key.type); });
  };

  // web copies of Office fonts (Calibri → Carlito etc.) so the canvas measures text like PowerPoint
  const { addFontFaces } = await import('./dom2pdf');
  addFontFaces(document);
  const fams = new Set(['Calibri', 'Arial', 'Times New Roman', 'Cambria', 'Courier New', 'Carlito']);
  for (const m of strFromU8(z['ppt/theme/theme1.xml'] ?? new Uint8Array()).matchAll(/typeface="([^"+][^"]*)"/g)) fams.add(m[1]);
  await Promise.all([...fams].flatMap((f) => ['', 'bold ', 'italic ', 'bold italic '].map((w) => document.fonts.load(`${w}16px "${f}"`).catch(() => 0))));

  const slides: Slide[] = [];
  for (const sp of order) {
    const slide = load(sp); if (!slide) continue;
    const layoutPart = [...slide.rels.values()].find((r) => r.type.endsWith('/slideLayout'))?.target;
    const layout = layoutPart ? load(layoutPart) : null;
    const masterPart = layout ? [...layout.rels.values()].find((r) => r.type.endsWith('/slideMaster'))?.target : undefined;
    const master = masterPart ? load(masterPart) : null;
    const th = themeFor(master);
    const txStyles = deep(master?.doc.documentElement, 'txStyles');
    const bgOf = (c: Ctx | null) => { const bg = deep(c?.doc.documentElement, 'bg'); if (!bg) return null; return { el: bg, ctx: c! }; };
    const bg = bgOf(slide) ?? bgOf(layout) ?? bgOf(master);

    slides.push({
      w: W, h: H,
      draw: async (ctx) => {
        // background
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        if (bg) {
          const pr = kid(bg.el, 'bgPr'); const ref = kid(bg.el, 'bgRef');
          const f = pr ? fillStyle(ctx, pr, th, 0, 0, W, H) : ref ? th.color(ref) : null;
          if (f && typeof f === 'object' && 'img' in f) { const t = bg.ctx.rels.get(f.img)?.target; const b = t ? await bitmap(t) : null; if (b) ctx.drawImage(b, 0, 0, W, H); }
          else if (f && f !== 'none') { ctx.fillStyle = f as any; ctx.fillRect(0, 0, W, H); }
        }

        const paras = (tb: El, key: { type: string; idx: string } | null, shapeEl: Element, c: Ctx, fontRefColor?: string, tableCell = false): Para[] => {
          const lvlOf = (src: El, lvl: number) => kid(src, `lvl${lvl + 1}pPr`);
          // where inherited styles come from, nearest first
          const layoutPh = key ? findPh(layout, key) : undefined, masterPh = key ? findPh(master, key) : undefined;
          const typ = key?.type ?? '';
          const mstyle = typ === 'title' || typ === 'ctrTitle' ? kid(txStyles, 'titleStyle') : key ? kid(txStyles, 'bodyStyle') : kid(txStyles, 'otherStyle');
          // shapes (not text boxes) centre their text unless told otherwise
          const isTxBox = deep(kid(shapeEl, 'nvSpPr'), 'cNvSpPr')?.getAttribute('txBox') === '1';
          const shapeDefault: PStyle = !key && !tableCell && !isTxBox && kid(shapeEl, 'style') ? { algn: 'ctr' } : {};
          let autoNum = new Map<number, number>();
          return kids(tb, 'p').map((p) => {
            const pPr = kid(p, 'pPr'); const lvl = num(pPr?.getAttribute('lvl'));
            const st = merge(readLvl(pPr, th), readLvl(lvlOf(kid(tb, 'lstStyle'), lvl), th), readLvl(lvlOf(kid(kid(layoutPh, 'txBody'), 'lstStyle'), lvl), th), readLvl(lvlOf(kid(kid(masterPh, 'txBody'), 'lstStyle'), lvl), th), fontRefColor ? { color: fontRefColor } : {}, shapeDefault, tableCell ? {} : readLvl(lvlOf(mstyle, lvl), th), readLvl(lvlOf(defaults, lvl), th), { sz: 18 });
            const runs: Run[] = [];
            for (const r of Array.from(p.children)) {
              if (r.localName === 'br') { runs.push({ t: '', br: true, sz: st.sz ?? 18, b: false, i: false, u: false, color: '#000', font: th.minor }); continue; }
              if (r.localName !== 'r' && r.localName !== 'fld') continue;
              const rs = merge(readRun(kid(r, 'rPr'), th), st);
              let t = kid(r, 't')?.textContent ?? '';
              if (rs.caps) t = t.toUpperCase();
              runs.push({ t, sz: rs.sz ?? 18, b: !!rs.b, i: !!rs.i, u: !!rs.u, color: rs.color ?? fontRefColor ?? '#000000', font: rs.font ?? th.minor });
            }
            const has = runs.some((r) => r.t.trim());
            let bullet: string | undefined;
            if (has && st.bu && !st.bu.none) {
              if (st.bu.char) bullet = st.bu.char === '§' || st.bu.char === 'Ø' || st.bu.char === 'ü' ? '•' : st.bu.char;
              else if (st.bu.auto) { const n = (autoNum.get(lvl) ?? 0) + 1; autoNum.set(lvl, n); bullet = /alpha/i.test(st.bu.auto) ? String.fromCharCode((/UcPeriod|Uc/.test(st.bu.auto) ? 64 : 96) + n) + (/Paren/.test(st.bu.auto) ? ')' : '.') : /roman/i.test(st.bu.auto) ? ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n - 1] + '.' : `${n}${/Paren/.test(st.bu.auto) ? ')' : '.'}`; }
            }
            // Wingdings / Symbol bullets are private characters: use a normal bullet instead
            if (bullet && /wingding|symbol/i.test(st.bu?.font ?? '')) bullet = '•';
            return { runs, st, bullet, buColor: st.bu?.color, buFont: st.bu?.font && !/wingding|symbol/i.test(st.bu.font) ? st.bu.font : 'Arial', buSize: st.bu?.size };
          });
        };

        const drawTree = async (c: Ctx, tree: El, isSlide: boolean, gx = 0, gy = 0, sx = 1, sy = 1) => {
          if (!tree) return;
          for (const el of Array.from(tree.children)) {
            const ln = el.localName;
            if (ln === 'grpSp') {
              const xf = deep(kid(el, 'grpSpPr'), 'xfrm');
              const off = kid(xf, 'off'), ext = kid(xf, 'ext'), co = kid(xf, 'chOff'), ce = kid(xf, 'chExt');
              const nsx = ce && num(ce.getAttribute('cx')) ? num(ext?.getAttribute('cx')) / num(ce.getAttribute('cx')) : 1, nsy = ce && num(ce.getAttribute('cy')) ? num(ext?.getAttribute('cy')) / num(ce.getAttribute('cy')) : 1;
              const ngx = gx + sx * (num(off?.getAttribute('x')) / EMU) - sx * nsx * (num(co?.getAttribute('x')) / EMU), ngy = gy + sy * (num(off?.getAttribute('y')) / EMU) - sy * nsy * (num(co?.getAttribute('y')) / EMU);
              await drawTree(c, el, isSlide, ngx, ngy, sx * nsx, sy * nsy); continue;
            }
            if (ln === 'AlternateContent') { const ch = kid(el, 'Choice') ?? kid(el, 'Fallback'); if (ch) await drawTree(c, ch, isSlide, gx, gy, sx, sy); continue; }
            if (ln !== 'sp' && ln !== 'pic' && ln !== 'cxnSp' && ln !== 'graphicFrame') continue;
            const key = phInfo(el);
            if (!isSlide && key) continue; // placeholders on layouts/masters only hold prompt text
            if (!isSlide && key === null && ln === 'sp' && !kid(el, 'txBody') && !kid(kid(el, 'spPr'), 'prstGeom') && !kid(kid(el, 'spPr'), 'custGeom')) continue;
            const spPr = kid(el, 'spPr');
            const lph = key ? findPh(layout, key) : undefined, mph = key ? findPh(master, key) : undefined;
            let xf = deep(spPr, 'xfrm') ?? (ln === 'graphicFrame' ? kid(el, 'xfrm') : undefined);
            if (!xf && key) xf = deep(kid(lph, 'spPr'), 'xfrm') ?? deep(kid(mph, 'spPr'), 'xfrm');
            if (!xf) continue;
            const off = kid(xf, 'off'), ext = kid(xf, 'ext');
            const x = gx + sx * (num(off?.getAttribute('x')) / EMU), y = gy + sy * (num(off?.getAttribute('y')) / EMU);
            const w = sx * (num(ext?.getAttribute('cx')) / EMU), h = sy * (num(ext?.getAttribute('cy')) / EMU);
            const rot = num(xf.getAttribute('rot')) / 60000;
            const flipH = xf.getAttribute('flipH') === '1', flipV = xf.getAttribute('flipV') === '1';
            ctx.save();
            if (rot || flipH || flipV) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate((rot * Math.PI) / 180); ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1); ctx.translate(-(x + w / 2), -(y + h / 2)); }
            const style = kid(el, 'style');
            if (ln === 'pic') {
              const bf = kid(el, 'blipFill'); const blip = kid(bf, 'blip'); const t = blip && c.rels.get(blip.getAttribute('r:embed')!)?.target;
              const b = t ? await bitmap(t) : null;
              if (b) {
                const sr = kid(bf, 'srcRect'); const p = (k: string) => num(sr?.getAttribute(k)) / 1e5;
                const cx0 = b.width * p('l'), cy0 = b.height * p('t'), cw = b.width * (1 - p('l') - p('r')), ch = b.height * (1 - p('t') - p('b'));
                const geom = deep(spPr, 'prstGeom')?.getAttribute('prst');
                if (geom && geom !== 'rect') { shapePath(ctx, geom, x, y, w, h); ctx.clip(); }
                ctx.drawImage(b, cx0, cy0, Math.max(1, cw), Math.max(1, ch), x, y, w, h);
              }
              const lnEl = kid(spPr, 'ln'); const lc = lnEl && !kid(lnEl, 'noFill') ? th.color(kid(lnEl, 'solidFill')) : undefined;
              if (lc) { ctx.strokeStyle = lc; ctx.lineWidth = Math.max(0.5, num(lnEl?.getAttribute('w'), 12700) / EMU); ctx.strokeRect(x, y, w, h); }
            } else if (ln === 'graphicFrame') {
              const gd = deep(el, 'graphicData'); const uri = gd?.getAttribute('uri') ?? '';
              const tbl = deep(el, 'tbl');
              if (tbl) {
                const tblPr = kid(tbl, 'tblPr'); const firstRow = tblPr?.getAttribute('firstRow') === '1', band = tblPr?.getAttribute('bandRow') === '1';
                const styled = !!kid(tblPr, 'tableStyleId');
                const acc = '#' + th.scheme.accent1;
                const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => num(g.getAttribute('w')) / EMU);
                const rows = kids(tbl, 'tr'); let yy = y;
                for (let ri = 0; ri < rows.length; ri++) {
                  const tr = rows[ri]; const tcs = kids(tr, 'tc');
                  // measure the row height from its tallest cell
                  let rh = Math.max(num(tr.getAttribute('h')) / EMU, 12);
                  const cellParas = tcs.map((tc) => paras(kid(tc, 'txBody'), null, tc, c, undefined, true));
                  tcs.forEach((tc, k) => { const cw = cols[k] ?? 60; const L = layoutText(ctx, cellParas[k], cw - 14.4, 1, 0); rh = Math.max(rh, L.total + 7.2); });
                  let xx = x;
                  tcs.forEach((tc, k) => {
                    let cw = cols[k] ?? 60; const span = num(tc.getAttribute('gridSpan'), 1); for (let s = 1; s < span; s++) cw += cols[k + s] ?? 0;
                    if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') { xx += cols[k] ?? 0; return; }
                    const tcPr = kid(tc, 'tcPr');
                    let fill: any = fillStyle(ctx, tcPr, th, xx, yy, cw, rh);
                    const hdr = styled && firstRow && ri === 0;
                    if (!fill && styled) fill = hdr ? acc : band ? (ri % 2 === (firstRow ? 1 : 0) ? th.color(new DOMParser().parseFromString(`<a:schemeClr xmlns:a="a" val="accent1"><a:tint val="40000"/></a:schemeClr>`, 'application/xml').documentElement) : th.color(new DOMParser().parseFromString(`<a:schemeClr xmlns:a="a" val="accent1"><a:tint val="20000"/></a:schemeClr>`, 'application/xml').documentElement)) : null;
                    if (fill && fill !== 'none' && typeof fill !== 'object') { ctx.fillStyle = fill; ctx.fillRect(xx, yy, cw, rh); }
                    // borders
                    let drew = false;
                    for (const [side, x1, y1, x2, y2] of [['lnL', xx, yy, xx, yy + rh], ['lnR', xx + cw, yy, xx + cw, yy + rh], ['lnT', xx, yy, xx + cw, yy], ['lnB', xx, yy + rh, xx + cw, yy + rh]] as const) {
                      const l = kid(tcPr, side); if (!l || kid(l, 'noFill')) continue; const col = th.color(kid(l, 'solidFill')); if (!col) continue; drew = true;
                      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, num(l.getAttribute('w'), 12700) / EMU); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    }
                    if (!drew && styled) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(xx, yy, cw, rh); }
                    else if (!drew && !styled) { ctx.strokeStyle = '#000'; ctx.lineWidth = 0.75; ctx.strokeRect(xx, yy, cw, rh); }
                    const ps = cellParas[k].map((p) => (hdr ? { ...p, runs: p.runs.map((r) => ({ ...r, b: true, color: r.color === '#000000' ? '#ffffff' : r.color })) } : p));
                    const mar = (a: string, d: number) => num(tcPr?.getAttribute(a), d) / EMU;
                    drawTextBox(ctx, ps, xx + mar('marL', 91440), yy + mar('marT', 45720), cw - mar('marL', 91440) - mar('marR', 91440), rh - mar('marT', 45720) - mar('marB', 45720), tcPr?.getAttribute('anchor') ?? 't', { scale: 1, ln: 0, shrink: false });
                    xx += cw;
                  });
                  yy += rh;
                }
              } else if (/chart/.test(uri)) {
                const rid = Array.from(gd!.getElementsByTagName('*')).find((e) => e.localName === 'chart')?.getAttribute('r:id');
                const t = rid ? c.rels.get(rid)?.target : undefined; const cx = t ? xml(t) : null;
                if (cx) { const cf = fillStyle(ctx, kid(deep(cx.documentElement, 'chartSpace') ?? cx.documentElement, 'spPr'), th, x, y, w, h); if (cf && cf !== 'none' && typeof cf !== 'object') { ctx.fillStyle = cf; ctx.fillRect(x, y, w, h); } drawChart(ctx, cx, th, x, y, w, h); }
              } else {
                // SmartArt and other objects: use the stored preview drawing if there is one
                const relIds = Array.from(gd?.getElementsByTagName('*') ?? []).map((e) => e.getAttribute('r:dm') ?? e.getAttribute('r:id') ?? e.getAttribute('r:embed')).filter(Boolean) as string[];
                const drawing = [...c.rels.values()].find((r) => /diagramDrawing/.test(r.type) && relIds.length);
                const dd = drawing ? xml(drawing.target) : null;
                if (dd) { const dctx = load(drawing!.target); const spTree = deep(dd.documentElement, 'spTree'); if (dctx && spTree) await drawTree(dctx, spTree, true, x, y, 1, 1); }
                else { const img = deep(el, 'blip') ?? Array.from(el.getElementsByTagName('*')).find((e) => e.getAttribute('r:embed')); const t = img && c.rels.get(img.getAttribute('r:embed')!)?.target; const b = t ? await bitmap(t) : null; if (b) ctx.drawImage(b, x, y, w, h); }
              }
            } else {
              const geom = deep(spPr, 'prstGeom')?.getAttribute('prst') ?? (deep(spPr, 'custGeom') ? 'rect' : 'rect');
              const adjv = deep(deep(spPr, 'avLst'), 'gd')?.getAttribute('fmla'); const adj = adjv && /val (\d+)/.test(adjv) ? +RegExp.$1 / 100000 : undefined;
              const phSpPr = kid(lph, 'spPr') ?? kid(mph, 'spPr');
              let fill = fillStyle(ctx, spPr, th, x, y, w, h) ?? fillStyle(ctx, phSpPr, th, x, y, w, h);
              if (!fill && style && !key && ln === 'sp') fill = th.color(kid(style, 'fillRef')) ?? null;
              if (fill && typeof fill === 'object' && 'img' in fill) { const t = c.rels.get(fill.img)?.target; const b = t ? await bitmap(t) : null; if (b) { ctx.save(); shapePath(ctx, geom, x, y, w, h, adj); ctx.clip(); ctx.drawImage(b, x, y, w, h); ctx.restore(); } }
              else if (fill && fill !== 'none' && !/line|Connector/.test(geom)) { shapePath(ctx, geom, x, y, w, h, adj); ctx.fillStyle = fill as any; ctx.fill(); }
              const lnEl = kid(spPr, 'ln') ?? kid(phSpPr, 'ln');
              const lineCol = lnEl && kid(lnEl, 'noFill') ? undefined : th.color(kid(lnEl, 'solidFill')) ?? (style && (ln === 'cxnSp' || !key) && num(kid(style, 'lnRef')?.getAttribute('idx')) > 0 ? th.color(kid(style, 'lnRef')) : undefined);
              if (lineCol) {
                shapePath(ctx, geom, x, y, w, h, adj); ctx.strokeStyle = lineCol; ctx.lineWidth = Math.max(0.5, num(lnEl?.getAttribute('w'), 9525) / EMU);
                const dash = kid(lnEl, 'prstDash')?.getAttribute('val'); if (dash && dash !== 'solid') ctx.setLineDash(dash.includes('dot') ? [1, 3] : [6, 4]);
                ctx.stroke(); ctx.setLineDash([]);
                if (/Connector|line/.test(geom) && kid(lnEl, 'tailEnd') && kid(lnEl, 'tailEnd')!.getAttribute('type') !== 'none') { const a = Math.atan2(h, w); const L = 8; ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w - L * Math.cos(a - 0.4), y + h - L * Math.sin(a - 0.4)); ctx.lineTo(x + w - L * Math.cos(a + 0.4), y + h - L * Math.sin(a + 0.4)); ctx.closePath(); ctx.fillStyle = lineCol; ctx.fill(); }
              }
              const tb = kid(el, 'txBody');
              if (tb) {
                const bp = kid(tb, 'bodyPr'), lbp = kid(kid(lph, 'txBody'), 'bodyPr'), mbp = kid(kid(mph, 'txBody'), 'bodyPr');
                const battr = (a: string) => bp?.getAttribute(a) ?? lbp?.getAttribute(a) ?? mbp?.getAttribute(a);
                const ins = (k: string, d: number) => num(battr(k), d) / EMU;
                const anchor = battr('anchor') ?? 't';
                const na = deep(bp, 'normAutofit') ?? deep(lbp, 'normAutofit') ?? deep(mbp, 'normAutofit');
                const fontScale = num(na?.getAttribute('fontScale'), 100000) / 1e5, lnRed = num(na?.getAttribute('lnSpcReduction')) / 1e5;
                const fontRef = style ? th.color(kid(style, 'fontRef')) : undefined;
                const ps = paras(tb, key, el, c, fontRef);
                const wrapNone = battr('wrap') === 'none';
                drawTextBox(ctx, ps, x + ins('lIns', 91440), y + ins('tIns', 45720), (wrapNone ? 10000 : w - ins('lIns', 91440) - ins('rIns', 91440)), h - ins('tIns', 45720) - ins('bIns', 45720), anchor, { scale: fontScale, ln: lnRed, shrink: !!na }, battr('vert') ?? undefined);
              }
            }
            ctx.restore();
          }
        };
        const showMaster = layout?.doc.documentElement.getAttribute('showMasterSp') !== '0' && slide.doc.documentElement.getAttribute('showMasterSp') !== '0';
        if (master && showMaster) await drawTree(master, deep(master.doc.documentElement, 'spTree'), false);
        if (layout && slide.doc.documentElement.getAttribute('showMasterSp') !== '0') await drawTree(layout, deep(layout.doc.documentElement, 'spTree'), false);
        await drawTree(slide, deep(slide.doc.documentElement, 'spTree'), true);
      },
    });
  }
  if (!slides.length) throw new Error('No slides were found in this presentation.');
  return slides;
}
