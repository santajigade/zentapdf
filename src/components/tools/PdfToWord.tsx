import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { readPage, lineText, median, type Line } from '../../lib/pdfread';

const MAX_PAGES = 300;
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
  const [mode, setMode] = useState<'text' | 'exact'>('text');
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
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const D = await import('docx');
      const sections: any[] = [];
      let textChars = 0;
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Reading page ${i} of ${n}…` });
        const page = await doc.getPage(i); const vp = page.getViewport({ scale: 1 });
        const twW = Math.round(vp.width * 20), twH = Math.round(vp.height * 20);
        if (mode === 'exact') {
          const c = document.createElement('canvas'); const s = 2;
          const v2 = page.getViewport({ scale: s }); c.width = Math.ceil(v2.width); c.height = Math.ceil(v2.height);
          const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvas: c, canvasContext: cx, viewport: v2 }).promise;
          const data = new Uint8Array(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.88)));
          sections.push({ properties: { page: { size: { width: twW, height: twH }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
            children: [new D.Paragraph({ children: [new D.ImageRun({ type: 'jpg', data, transformation: { width: Math.round(vp.width * 96 / 72) - 1, height: Math.round(vp.height * 96 / 72) - 2 } })] })] });
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
        sections.push({ properties: { page: { size: { width: twW, height: twH }, margin: { top: Math.max(360, Math.round((pt.lines[0]?.y ?? 50) * 20 - (pt.lines[0]?.size ?? 10) * 20)), bottom: 360, left: mL, right: mR } } },
          children: children.length ? children : [new D.Paragraph({ children: [] })] });
        page.cleanup();
      }
      if (mode === 'text' && textChars < 20 * n) setWarn('This PDF has very little text — it may be a scanned document (pictures of pages). Choose "Exact look" to keep the pages as they appear; text recognition (OCR) is coming soon.');
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
        {([['text', 'Editable text', 'Text you can edit in Word. Best for letters, reports and articles.'], ['exact', 'Exact look', 'Pages look exactly like the PDF, as pictures (text not editable).']] as const).map(([v, t, d]) => (
          <button type="button" role="radio" aria-checked={mode === v} class="choice" onClick={() => setMode(v)}><strong>{t}</strong><span>{d}</span></button>
        ))}
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Word document ready ({out.pages} page{out.pages > 1 ? 's' : ''}, {formatBytes(out.blob.size)}).</p>
          {warn && <p class="status" style={{ color: 'var(--err)' }}>{warn}</p>}
          {!warn && mode === 'text' && <p class="status">Text, headings, bold and paragraphs are kept. Pictures and complex layouts (columns, tables) may need small fixes in Word.</p>}
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
