// Read the text structure of PDF pages (lines → words with position, size and font) for PDF→Word / PDF→Excel.
export type Word = { text: string; x0: number; x1: number; y: number; size: number; bold: boolean; italic: boolean; font: string; family: string; symbol?: boolean; fid?: string };
export type Line = { y: number; x0: number; x1: number; size: number; words: Word[] };
export type PageText = { w: number; h: number; lines: Line[] };

function fontInfo(page: any, styles: any, fontName: string) {
  let name = ''; let fobj: any = null;
  try { if (page.commonObjs.has(fontName)) { fobj = page.commonObjs.get(fontName); name = fobj?.name ?? ''; } } catch { /* not loaded */ }
  const fam = styles?.[fontName]?.fontFamily ?? '';
  const serifHint = fam === 'serif';
  const n = (name || fam).replace(/^[A-Z]{6}\+/, '');
  // real family name, e.g. "ABCDEF+Calibri-Bold" → "Calibri", "TimesNewRomanPSMT" → "Times New Roman"
  let family = n.split(/[-,]/)[0].replace(/(PSMT|PS|MT|Std|Pro|LT)$/g, '').replace(/(Bold|Italic|Oblique|Regular|Light|Medium|Semibold)+$/i, '');
  family = family.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  if (!family || /^(g_|f\d|F\d|T\d|TT\d|C\d)/.test(family) || family.length < 3 || /^(sans-serif|serif|monospace)$/.test(family)) family = '';
  // open fonts that are metric-compatible with common Microsoft fonts
  const SUB: Record<string, string> = { 'Carlito': 'Calibri', 'Caladea': 'Cambria', 'Liberation Sans': 'Arial', 'Liberation Serif': 'Times New Roman', 'Liberation Mono': 'Courier New', 'Arimo': 'Arial', 'Tinos': 'Times New Roman', 'Cousine': 'Courier New', 'Helvetica': 'Arial', 'Times': 'Times New Roman', 'Times Roman': 'Times New Roman', 'Courier': 'Courier New', 'Helvetica Neue': 'Arial', 'Helvetica Neue LT': 'Arial', 'Free Serif': 'Times New Roman', 'Free Sans': 'Arial', 'Deja Vu Sans': 'Arial', 'Deja Vu Serif': 'Times New Roman' };
  family = SUB[family] ?? family;
  const sansName = /helvetica|arial|sans|neue|gothic|grotesk|frutiger|univers|futura|verdana|tahoma|calibri|segoe|myriad|\bdin|roboto|lato|montserrat|poppins|inter\b|aptos/i.test(n);
  return {
    family,
    symbol: /dingbat|wingding|webding|symbol|zapf/i.test(n),
    bold: /bold|black|heavy|semibold|demi|[-,](Md|Bd|Hv|Hvy|Blk|Hea|Medium|SemiBd|Sb)\b|^CMBX|^CMB\d|^LMRomanDemi|-BX|Bd\b/i.test(n) || /,\s*Bold/i.test(n) || !!fobj?.bold || !!fobj?.black,
    italic: /italic|oblique|^CMTI|^CMSL|^CMMI|-It\b/i.test(n) || !!fobj?.italic,
    font: !sansName && (/times|serif(?!.*sans)|georgia|cambria|garamond|book|roman|minion|palatino|baskerville|caslon|charter|^CM[RBTS]|^LM/i.test(n) || serifHint) ? 'Times New Roman' : /courier|mono|consol/i.test(n) ? 'Courier New' : /calibri/i.test(n) ? 'Calibri' : /verdana/i.test(n) ? 'Verdana' : /tahoma/i.test(n) ? 'Tahoma' : 'Arial',
  };
}

export async function readPage(page: any): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  try { await page.getOperatorList(); } catch { /* fonts names are optional */ }
  const tc = await page.getTextContent();
  const words: Word[] = [];
  for (const it of tc.items as any[]) {
    if (!it.str || !it.str.trim() && !it.str.length) continue;
    // text matrix in page (viewport) space, so rotated pages work too
    const m = vp.transform, t = it.transform;
    const a = m[0] * t[0] + m[2] * t[1], b = m[1] * t[0] + m[3] * t[1], c = m[0] * t[2] + m[2] * t[3], d = m[1] * t[2] + m[3] * t[3];
    const vx = m[0] * t[4] + m[2] * t[5] + m[4], vy = m[1] * t[4] + m[3] * t[5] + m[5];
    if (Math.abs(b) > Math.abs(a) * 0.2 || a <= 0) continue; // skip rotated / upside-down text
    const size = Math.hypot(c, d) || it.height || 10;
    const fi = fontInfo(page, tc.styles, it.fontName);
    words.push({ fid: it.fontName, text: it.str.replace(/[\u0000-\u0008\u000b-\u001f]/g, ""), x0: vx, x1: vx + it.width * Math.hypot(a, b) / Math.max(1e-6, Math.hypot(t[0], t[1])), y: vy, size, ...fi });
  }
  // group into lines by baseline
  words.sort((p, q) => p.y - q.y || p.x0 - q.x0);
  const lines: Line[] = [];
  for (const w of words) {
    const L = lines.find((l) => Math.abs(l.y - w.y) < Math.max(2, Math.min(l.size, w.size) * 0.45));
    if (L) { L.words.push(w); L.x0 = Math.min(L.x0, w.x0); L.x1 = Math.max(L.x1, w.x1); L.size = Math.max(L.size, w.size); }
    else lines.push({ y: w.y, x0: w.x0, x1: w.x1, size: w.size, words: [w] });
  }
  lines.forEach((l) => l.words.sort((p, q) => p.x0 - q.x0));
  lines.sort((p, q) => p.y - q.y);
  return { w: vp.width, h: vp.height, lines: lines.filter((l) => l.words.some((w) => w.text.trim())) };
}

/** Join the words of a line, adding spaces where there is a visible gap. */
export function lineText(words: Word[]): string {
  let s = '';
  words.forEach((w, i) => {
    if (i > 0) { const gap = w.x0 - words[i - 1].x1; const indic = /[\u0900-\u0DFF]$/.test(words[i - 1].text) && /^[\u0900-\u0DFF]/.test(w.text); if (gap > w.size * (indic ? 0.32 : 0.18) && !s.endsWith(' ') && !w.text.startsWith(' ')) s += ' '; }
    s += w.text;
  });
  return s.replace(/\s+/g, ' ').trim();
}

/** Split a line into cells where the gap between words is wide. */
export function lineChunks(words: Word[]): { text: string; x0: number; x1: number }[] {
  const out: { words: Word[]; x0: number; x1: number }[] = [];
  for (const w of words) {
    if (!w.text.trim()) continue; // a space item can span a column gap
    const last = out[out.length - 1];
    if (last && w.x0 - last.x1 < Math.max(w.size * 0.9, 4)) { last.words.push(w); last.x1 = Math.max(last.x1, w.x1); }
    else out.push({ words: [w], x0: w.x0, x1: w.x1 });
  }
  return out.map((c) => ({ text: lineText(c.words), x0: c.x0, x1: c.x1 })).filter((c) => c.text);
}

export const median = (a: number[]) => { if (!a.length) return 10; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
