import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { readPage, lineChunks, type PageText } from '../../lib/pdfread';

const MAX_PAGES = 300;

/** Use the most common number of cells per line as the column template, then place every cell in the best-matching column. */
function pageToRows(pt: PageText): string[][] {
  const lines = pt.lines.map((l) => lineChunks(l.words));
  const counts = new Map<number, number>();
  lines.forEach((c) => c.length >= 2 && counts.set(c.length, (counts.get(c.length) ?? 0) + 1));
  if (!counts.size) return lines.map((c) => [c.map((x) => x.text).join(' ')]);
  // modal count (prefer more columns when tied)
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const cols = Array.from({ length: modal }, () => ({ x0: Infinity, x1: -Infinity }));
  for (const c of lines) if (c.length === modal) c.forEach((ch, k) => { cols[k].x0 = Math.min(cols[k].x0, ch.x0); cols[k].x1 = Math.max(cols[k].x1, ch.x1); });
  // keep column ranges from overlapping
  for (let k = 1; k < modal; k++) if (cols[k].x0 < cols[k - 1].x1) { const m = (cols[k].x0 + cols[k - 1].x1) / 2; cols[k - 1].x1 = m; cols[k].x0 = m; }
  const best = (ch: { x0: number; x1: number }) => {
    let bi = 0, bv = -Infinity;
    cols.forEach((c, k) => { const ov = Math.min(c.x1, ch.x1) - Math.max(c.x0, ch.x0); const d = ov > 0 ? ov : -Math.min(Math.abs(ch.x0 - c.x1), Math.abs(c.x0 - ch.x1)); if (d > bv) { bv = d; bi = k; } });
    return bi;
  };
  return lines.map((cs) => {
    if (cs.length === 1 && cs[0].x1 - cs[0].x0 > pt.w * 0.45) return [cs[0].text]; // a wide title/paragraph line
    const row: string[] = [];
    for (const c of cs) { const k = best(c); row[k] = row[k] ? row[k] + ' ' + c.text : c.text; }
    return Array.from(row, (v) => v ?? '');
  });
}

/** "1,23,456.50" → 123456.5 ; keeps text like phone numbers or codes with leading zeros. */
function cellValue(s: string): string | number {
  const t = s.trim();
  if (/^[-−(]?[₹$€£]?\s?\d{1,3}(,\d{2,3})*(\.\d+)?\)?%?$|^[-−]?[₹$€£]?\d+(\.\d+)?%?$/.test(t) && !/^0\d/.test(t.replace(/^[-−₹$€£\s(]+/, '')) && t.replace(/\D/g, '').length <= 15) {
    let v = parseFloat(t.replace(/[,₹$€£\s()%]/g, '').replace('−', '-'));
    if (/^\(.*\)$/.test(t) || /^[-−]/.test(t)) v = -Math.abs(v);
    if (t.endsWith('%')) v = v / 100;
    if (isFinite(v)) return v;
  }
  return t;
}

export default function PdfToExcel() {
  const [file, setFile] = useState<File | null>(null);
  const [layout, setLayout] = useState<'pages' | 'one'>('pages');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; rows: number; sheets: number; warn: string } | null>(null);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const all: (string | number)[][] = []; let total = 0;
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Reading page ${i} of ${n}…` });
        const page = await doc.getPage(i);
        const rows = pageToRows(await readPage(page)).map((r) => r.map(cellValue));
        page.cleanup(); total += rows.length;
        if (layout === 'pages') { if (rows.length) addSheet(XLSX, wb, rows, `Page ${i}`); }
        else { if (all.length && rows.length) all.push([]); all.push(...rows); }
      }
      if (!total) throw new Error('No text was found in this PDF. Scanned PDFs (pictures of pages) need text recognition (OCR), which is coming soon.');
      if (layout === 'one') addSheet(XLSX, wb, all, 'Sheet1');
      const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      setOut({ blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rows: total, sheets: wb.SheetNames.length, warn: doc.numPages > MAX_PAGES ? `Only the first ${MAX_PAGES} pages were converted.` : '' });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF with tables here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {!out && <div role="radiogroup" aria-label="Sheets" class="choice-grid">
        {([['pages', 'One sheet per page', 'Each PDF page goes to its own sheet.'], ['one', 'All in one sheet', 'All pages one after another — best for long statements.']] as const).map(([v, t, d]) => (
          <button type="button" role="radio" aria-checked={layout === v} class="choice" onClick={() => setLayout(v)}><strong>{t}</strong><span>{d}</span></button>
        ))}
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Excel file ready — {out.rows} rows in {out.sheets} sheet{out.sheets > 1 ? 's' : ''} ({formatBytes(out.blob.size)}).</p>
          <p class="status">{out.warn || 'Numbers are saved as real numbers, so you can sum and sort them. Check merged or multi-line cells.'}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.xlsx`)}>Download Excel</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Convert to Excel</button></div>}
    </div>
  );
}

function addSheet(XLSX: any, wb: any, rows: (string | number)[][], name: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  ws['!cols'] = Array.from({ length: cols }, (_, c) => ({ wch: Math.min(60, Math.max(8, ...rows.slice(0, 500).map((r) => String(r[c] ?? '').length + 2))) }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}
