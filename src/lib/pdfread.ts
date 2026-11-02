// Read the text structure of PDF pages (lines → words with position, size and font) for PDF→Word / PDF→Excel.
export type Word = { text: string; x0: number; x1: number; y: number; size: number; bold: boolean; italic: boolean; font: string };
export type Line = { y: number; x0: number; x1: number; size: number; words: Word[] };
export type PageText = { w: number; h: number; lines: Line[] };

function fontInfo(page: any, styles: any, fontName: string) {
  let name = '';
  try { if (page.commonObjs.has(fontName)) name = page.commonObjs.get(fontName)?.name ?? ''; } catch { /* not loaded */ }
  const fam = styles?.[fontName]?.fontFamily ?? '';
  const n = (name || fam).replace(/^[A-Z]{6}\+/, '');
  return {
    bold: /bold|black|heavy|semibold|demi/i.test(n) || /,\s*Bold/i.test(n),
    italic: /italic|oblique/i.test(n),
    font: /times|serif(?!.*sans)|georgia|cambria|garamond|book/i.test(n) && !/sans/i.test(n) ? 'Times New Roman' : /courier|mono|consol/i.test(n) ? 'Courier New' : /calibri/i.test(n) ? 'Calibri' : /verdana/i.test(n) ? 'Verdana' : /tahoma/i.test(n) ? 'Tahoma' : 'Arial',
  };
}

export async function readPage(page: any): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  try { await page.getOperatorList(); } catch { /* fonts names are optional */ }
  const tc = await page.getTextContent();
  const words: Word[] = [];
  for (const it of tc.items as any[]) {
    if (!it.str || !it.str.trim() && !it.str.length) continue;
    const [a, b, c, d, e, f] = it.transform;
    if (Math.abs(b) > Math.abs(a) * 0.2) continue; // skip rotated text
    const [vx, vy] = vp.convertToViewportPoint(e, f);
    const size = Math.hypot(c, d) || it.height || 10;
    const fi = fontInfo(page, tc.styles, it.fontName);
    words.push({ text: it.str, x0: vx, x1: vx + it.width * (vp.scale || 1), y: vy, size, ...fi });
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
    if (i > 0) { const gap = w.x0 - words[i - 1].x1; if (gap > w.size * 0.18 && !s.endsWith(' ') && !w.text.startsWith(' ')) s += ' '; }
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
