import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { readPage, lineText, median, type Line, type Word } from '../../lib/pdfread';

const MAX_PAGES = 300;
const pageSize = (D: any, w: number, h: number) => (w > h ? { width: h, height: w, orientation: D.PageOrientation.LANDSCAPE } : { width: w, height: h, orientation: D.PageOrientation.PORTRAIT });
const COMMON_FONTS = /^(Arial|Arial Narrow|Calibri|Cambria|Candara|Constantia|Corbel|Times New Roman|Courier New|Verdana|Tahoma|Georgia|Segoe UI|Trebuchet MS|Garamond|Century Gothic|Book Antiqua|Palatino Linotype|Franklin Gothic.*|Gill Sans.*|Lucida.*|Impact|Comic Sans MS|Roboto|Open Sans|Lato|Montserrat|Poppins|Noto Sans|Noto Serif|Helvetica|Aptos|Bahnschrift)$/i;
type Chunk = { words: Word[]; x0: number; x1: number; y: number; size: number };
/** Split a line into separate pieces where the gap is wide (columns, tab stops). */
function chunksOf(l: Line): Chunk[] {
  const out: Chunk[] = [];
  for (const w of l.words) {
    if (!w.text.trim()) continue;
    const last = out[out.length - 1];
    const prev = last?.words[last.words.length - 1];
    const styleJump = !!prev && (Math.max(prev.size, w.size) / Math.min(prev.size, w.size) > 1.1 || prev.bold !== w.bold) && w.x0 - last!.x1 > w.size * 0.45;
    if (last && !styleJump && w.x0 - last.x1 < Math.max(w.size * 1.2, 6)) { last.words.push(w); last.x1 = Math.max(last.x1, w.x1); last.size = Math.max(last.size, w.size); }
    else out.push({ words: [w], x0: w.x0, x1: w.x1, y: l.y, size: w.size });
  }
  return out;
}
const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Render a page twice — with and without text — so text can be placed as editable Word text over a picture of everything else. */
async function renderLayers(page: any, S: number) {
  const vp = page.getViewport({ scale: S });
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const x = c.getContext('2d', { willReadFrequently: true })!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return [c, x] as const; };
  const [full, fx] = mk();
  await page.render({ canvas: full, canvasContext: fx, viewport: vp }).promise;
  const [bg, bx] = mk();
  // hide only straight (non-rotated) text; rotated text stays in the picture
  const keep = (orig: any) => function (this: CanvasRenderingContext2D, ...a: any[]) { const t = this.getTransform(); if (Math.abs(t.b) > Math.abs(t.a) * 0.2 || Math.abs(t.c) > Math.abs(t.d) * 0.2) return orig.apply(this, a); };
  (bx as any).fillText = keep(bx.fillText); (bx as any).strokeText = keep(bx.strokeText);
  await page.render({ canvas: bg, canvasContext: bx, viewport: vp }).promise;
  return { full, bg, fd: fx.getImageData(0, 0, full.width, full.height).data, bd: bx.getImageData(0, 0, bg.width, bg.height).data, W: full.width };
}

/** Text colour = the pixel that differs most from the text-free picture; null if the text is invisible. */
function sampleColor(L: { fd: Uint8ClampedArray; bd: Uint8ClampedArray; W: number }, H: number, S: number, c: Chunk): string | null {
  const x0 = Math.max(0, Math.floor(c.x0 * S)), x1 = Math.min(L.W - 1, Math.ceil(c.x1 * S));
  const y0 = Math.max(0, Math.floor((c.y - c.size * 0.8) * S)), y1 = Math.min(H - 1, Math.ceil((c.y + c.size * 0.15) * S));
  let best = 0, col = '000000', changed = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 2) {
    const i = (y * L.W + x) * 4; const d = Math.abs(L.fd[i] - L.bd[i]) + Math.abs(L.fd[i + 1] - L.bd[i + 1]) + Math.abs(L.fd[i + 2] - L.bd[i + 2]);
    if (d > 60) changed++;
    if (d > best) { best = d; col = hex(L.fd[i], L.fd[i + 1], L.fd[i + 2]); }
  }
  return changed < 2 ? null : col;
}

const measure = (() => { let ctx: CanvasRenderingContext2D | null = null; return (text: string, font: string, size: number, bold: boolean, italic: boolean) => { ctx ??= document.createElement('canvas').getContext('2d')!; ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${font}"`; return ctx.measureText(text).width; }; })();

type Para = { text: string; size: number; bold: boolean; italic: boolean; font: string; align: 'left' | 'center' | 'right'; heading: number; indent: number; spaceBefore: number };

/** Turn the lines of one page into paragraphs (merging wrapped lines). */
function toParagraphs(lines: Line[], pageW: number, body: number, left: number): Para[] {
  const out: Para[] = [];
  let cur: Para | null = null; let prev: Line | null = null;
  for (const l of lines) {
    const text = lineText(l.words); if (!text) continue;
    const bold = l.words.filter((w) => w.text.trim()).every((w) => w.bold);
    const italic = l.words.filter((w) => w.text.trim()).every((w) => w.italic);
    const font = l.words[0].font;
    const mid = (l.x0 + l.x1) / 2;
    const align: Para['align'] = Math.abs(mid - pageW / 2) < pageW * 0.04 && l.x0 > left + pageW * 0.08 ? 'center' : l.x0 > pageW * 0.55 && l.x1 > pageW * 0.85 ? 'right' : 'left';
    const ratio = l.size / body;
    const heading = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.12 && bold && text.length < 120 ? 3 : 0;
    const gap = prev ? l.y - prev.y : 0;
    const lineH = l.size * 1.25;
    const bullet = /^([•●▪◦■\-–*]|\d{1,3}[.)]|[a-z][.)])\s/.test(text);
    const continues = cur && prev && !heading && !cur.heading && !bullet && align === cur.align && Math.abs(l.size - cur.size) < 0.6 && gap < lineH * 1.45 && gap > 0
      && bold === cur.bold && (align !== 'left' || Math.abs(l.x0 - prev.x0) < l.size * 2.5 || l.x0 < prev.x0 + 2)
      && prev.x1 > pageW * 0.55; // previous line ran to the right side → it wrapped
    if (continues && cur) {
      cur.text = cur.text.endsWith('-') && /^[a-z]/.test(text) ? cur.text.slice(0, -1) + text : cur.text + ' ' + text;
    } else {
      cur = { text, size: l.size, bold, italic, font, align, heading, indent: Math.max(0, l.x0 - left), spaceBefore: prev ? Math.max(0, gap - lineH) : 0 };
      out.push(cur);
    }
    prev = l;
  }
  return out;
}

export default function PdfToWord() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'layout' | 'text'>('layout');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [out, setOut] = useState<{ blob: Blob; pages: number } | null>(null);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setWarn(''); setOut(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setWarn(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, fontExtraProperties: true }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const D = await import('docx');
      const sections: any[] = [];
      let textChars = 0;
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Reading page ${i} of ${n}…` });
        const page = await doc.getPage(i); const vp = page.getViewport({ scale: 1 });
        const twW = Math.round(vp.width * 20), twH = Math.round(vp.height * 20);
        if (mode === 'layout') {
          const S = 2.5;
          const pt = await readPage(page);
          const L = await renderLayers(page, S);
          const H = L.full.height;
          // text we can't place as editable text (Hindi and other complex scripts, broken characters): keep it in the picture
          const COMPLEX = /[\u0000-\u0008\u000E-\u001F\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0FFF\u3040-\u9FFF\uAC00-\uD7AF\uFB1D-\uFEFF\uFFFD]/;
          const keepInPicture = (c: Chunk) => { const bx = L.bg.getContext('2d')!; const x = Math.floor(c.x0 * S) - 2, y = Math.floor((c.y - c.size * 1.05) * S), w = Math.ceil((c.x1 - c.x0) * S) + 4, h = Math.ceil(c.size * 1.4 * S); bx.drawImage(L.full, x, y, w, h, x, y, w, h); };
          const placed: Chunk[] = [];
          for (const l of pt.lines) for (const c of chunksOf(l)) {
            // symbol fonts (bullets, ticks) keep their look in the picture; the rest becomes editable text
            const sym = c.words.filter((w) => w.symbol); const rest = c.words.filter((w) => !w.symbol);
            if (sym.length) keepInPicture({ ...c, words: sym, x0: Math.min(...sym.map((w) => w.x0)), x1: Math.max(...sym.map((w) => w.x1)) });
            if (!rest.length) continue;
            const c2 = { ...c, words: rest, x0: Math.min(...rest.map((w) => w.x0)), x1: Math.max(...rest.map((w) => w.x1)) };
            if (COMPLEX.test(rest.map((w) => w.text).join(''))) keepInPicture(c2); else placed.push(c2);
          }
          const data = new Uint8Array(await new Promise<ArrayBuffer>((r) => L.bg.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.9)));
          const children: any[] = [new D.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT }, children: [new D.ImageRun({ type: 'jpg', data, transformation: { width: Math.round(vp.width * 96 / 72), height: Math.round(vp.height * 96 / 72) },
            floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, allowOverlap: true, lockAnchor: true } })] })];
          for (const c of placed) {
            // colour per word (white text on a coloured box, coloured headings…); invisible text is skipped
            const wcol = c.words.map((w) => sampleColor(L, H, S, { words: [w], x0: w.x0, x1: w.x1, y: c.y, size: Math.max(w.size, c.size * 0.8) }));
            if (wcol.every((x) => x === null)) continue;
            const color = wcol.find((x) => x) ?? '000000';
            textChars += c.words.length;
            // group neighbouring words with the same style into runs
            const runs: { text: string; w: Word; col: string }[] = [];
            c.words.forEach((w0, k) => { let w = w0; const col = wcol[k] ?? color;
              const gap = k ? w.x0 - c.words[k - 1].x1 : 0; const sp = k && gap > w.size * 0.15 && !runs[runs.length - 1].text.endsWith(' ') && !w.text.startsWith(' ') ? ' ' : '';
              const last = runs[runs.length - 1];
              w = { ...w, text: w.text.replace(/[\uE000-\uF8FF]/g, '•') };
              if (last && last.col === col && last.w.bold === w.bold && last.w.italic === w.italic && Math.abs(last.w.size - w.size) < 0.3 && last.w.family === w.family) last.text += sp + w.text; else { if (last && sp) last.text += sp; runs.push({ text: w.text, w, col }); }
            });
            const size = c.size; const width = c.x1 - c.x0;
            const fam = (w: Word) => (COMMON_FONTS.test(w.family) ? w.family : w.font);
            // shrink the text slightly if the font on this computer is wider than in the PDF (keeps lines from wrapping)
            const mw = runs.reduce((t, r) => t + measure(r.text, fam(r.w), r.w.size, r.w.bold, r.w.italic), 0);
            const scale = mw > width * 1.02 ? Math.max(60, Math.round((width / mw) * 100)) : 100;
            const top = c.y - size * 0.92;
            children.push(new D.Paragraph({
              frame: { type: 'absolute', position: { x: Math.round(c.x0 * 20), y: Math.max(0, Math.round(top * 20)) }, width: Math.round(Math.min(vp.width - c.x0, width * 1.15 + size * 2) * 20), height: Math.round(size * 1.2 * 20), rule: D.HeightRule.ATLEAST, anchor: { horizontal: D.FrameAnchorType.PAGE, vertical: D.FrameAnchorType.PAGE }, wrap: D.FrameWrap.NONE } as any,
              spacing: { before: 0, after: 0, line: Math.round(size * 1.15 * 20), lineRule: D.LineRuleType.EXACT },
              children: runs.map((r) => { const small = r.w.size < size * 0.8; const sub = small && r.w.y > c.y + size * 0.08, sup = small && r.w.y < c.y - size * 0.15; return new D.TextRun({ text: r.text, bold: r.w.bold, italics: r.w.italic, size: Math.max(2, Math.round((sub || sup ? size : r.w.size) * 2)), font: fam(r.w), color: r.col, scale: scale < 100 ? scale : undefined, subScript: sub || undefined, superScript: sup || undefined }); }),
            }));
          }
          children.push(new D.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT }, children: [] })); // keeps the page break out of the text frames
          sections.push({ properties: { page: { size: pageSize(D, twW, twH), margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children });
          page.cleanup(); continue;
        }
        const pt = await readPage(page);
        const sizes = pt.lines.flatMap((l) => l.words.map((w) => w.size));
        const body = median(sizes);
        const left = Math.min(...pt.lines.map((l) => l.x0), vp.width * 0.15);
        const right = Math.max(...pt.lines.map((l) => l.x1), vp.width * 0.85);
        const paras = toParagraphs(pt.lines, vp.width, body, left);
        textChars += paras.reduce((s, p) => s + p.text.length, 0);
        const mL = Math.max(360, Math.round(left * 20)), mR = Math.max(360, Math.round((vp.width - right) * 20));
        const children = paras.map((p) => new D.Paragraph({
          heading: p.heading === 1 ? D.HeadingLevel.HEADING_1 : p.heading === 2 ? D.HeadingLevel.HEADING_2 : p.heading === 3 ? D.HeadingLevel.HEADING_3 : undefined,
          alignment: p.align === 'center' ? D.AlignmentType.CENTER : p.align === 'right' ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT,
          indent: p.align === 'left' && p.indent > 6 ? { left: Math.round(p.indent * 20) } : undefined,
          spacing: { before: Math.min(480, Math.round(p.spaceBefore * 20)), after: 60 },
          children: [new D.TextRun({ text: p.text, bold: p.bold, italics: p.italic, size: Math.max(12, Math.round(p.size * 2)), font: p.font, color: '000000' })],
        }));
        sections.push({ properties: { page: { size: pageSize(D, twW, twH), margin: { top: Math.max(360, Math.round((pt.lines[0]?.y ?? 50) * 20 - (pt.lines[0]?.size ?? 10) * 20)), bottom: 360, left: mL, right: mR } } },
          children: children.length ? children : [new D.Paragraph({ children: [] })] });
        page.cleanup();
      }
      if (textChars < (mode === 'layout' ? 3 : 20) * n) setWarn('This PDF has very little text — it may be a scanned document (pictures of pages). The pages are kept as pictures; text recognition (OCR) is coming soon.');
      setBusy({ done: n, total: n, label: 'Creating Word file…' });
      const blob = await D.Packer.toBlob(new D.Document({ creator: 'ZentaPDF', title: baseName(file.name), styles: { default: { document: { run: { font: 'Arial' } } } }, sections }));
      setOut({ blob, pages: n });
      if (doc.numPages > MAX_PAGES) setWarn(`Only the first ${MAX_PAGES} pages were converted.`);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {!out && <div role="radiogroup" aria-label="Conversion type" class="choice-grid">
        {([['layout', 'Same layout (recommended)', 'Looks exactly like the PDF — every line in place, text editable in Word.'], ['text', 'Flowing text', 'Plain paragraphs that re-flow as you type. Best for rewriting long documents.']] as const).map(([v, t, d]) => (
          <button type="button" role="radio" aria-checked={mode === v} class="choice" onClick={() => setMode(v)}><strong>{t}</strong><span>{d}</span></button>
        ))}
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Word document ready ({out.pages} page{out.pages > 1 ? 's' : ''}, {formatBytes(out.blob.size)}).</p>
          {warn && <p class="status" style={{ color: 'var(--err)' }}>{warn}</p>}
          {!warn && <p class="status">{mode === 'layout' ? 'Every line of text is placed exactly where it is in the PDF and can be edited in Word. Pictures, lines and colours stay in the background.' : 'Text, headings, bold and paragraphs are kept. Pictures and complex layouts (columns, tables) may need small fixes in Word.'}</p>}
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.docx`)}>Download Word</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Convert to Word</button></div>}
    </div>
  );
}
