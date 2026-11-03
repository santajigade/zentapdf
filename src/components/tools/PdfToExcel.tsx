import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { readPage, lineChunks, type PageText, type Line } from '../../lib/pdfread';
import { pageGraphics, findTables, type Table } from '../../lib/pdftables';

const MAX_PAGES = 300;

/** Use the most common number of cells per line as the column template, then place every cell in the best-matching column. */
function pageToRows(pt: PageText, src: Line[] = pt.lines): string[][] {
  const lines = src.map((l) => lineChunks(l.words));
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
  const t = s.trim().replace(/[\uf0b7\uf0a7\uf06c\uf0a8\uf0d8\uf076\uf0fc]/g, '•'); // Symbol/Wingdings bullets
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
  const [out, setOut] = useState<{ blob: Blob; rows: number; sheets: number; tables: number; warn: string } | null>(null);

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
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, fontExtraProperties: true }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod;
      const wb = new ExcelJS.Workbook(); wb.creator = 'ZentaPDF';
      let total = 0, tables = 0;
      let sheet: any = null; let row = 1; const colW: number[] = [];
      const newSheet = (name: string) => { if (sheet) widths(sheet, colW); sheet = wb.addWorksheet(name); row = 1; colW.length = 0; };
      if (layout === 'one') newSheet('Sheet1');
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Reading page ${i} of ${n}…` });
        const page = await doc.getPage(i);
        const pt = await readPage(page);
        let found: Table[] = [];
        try { found = findTables(pt, await pageGraphics(page, pdfjs.OPS)); } catch { /* no table lines: use text columns */ }
        page.cleanup();
        // lines that are not inside a table, kept in reading order with the tables
        const inTable = (l: Line) => found.some((t) => l.y - l.size * 0.3 > t.y0 && l.y - l.size * 0.3 < t.y1 && l.x1 > t.x0 && l.x0 < t.x1);
        const loose = pt.lines.filter((l) => !inTable(l));
        const looseRows = pageToRows(pt, loose);
        const items: ({ y: number; t: Table } | { y: number; r: string[]; size: number; bold: boolean })[] = [...found.map((t) => ({ y: t.y0, t })), ...loose.map((l, k) => ({ y: l.y, r: looseRows[k], size: l.size, bold: l.words.every((w) => w.bold || !w.text.trim()) }))].sort((p, q) => p.y - q.y);
        if (!items.length) continue;
        if (layout === 'pages') newSheet(`Page ${i}`); else if (row > 1) row++;
        let prevY = -1;
        for (const it of items) {
          if ('t' in it) {
            if (row > 1 && prevY >= 0) row++; // a blank row before a table
            writeTable(sheet, it.t, row, colW); row += it.t.rowH.length + 1; tables++; total += it.t.rowH.length; prevY = it.t.y1;
          } else {
            const filledN = it.r.filter((v) => v !== '').length;
            it.r.forEach((v, c) => {
              if (v === '') return; const cell = sheet.getCell(row, c + 1); cell.value = cellValue(v);
              if (found.length || it.bold) cell.font = { name: 'Calibri', size: found.length ? Math.max(7, Math.min(18, Math.round(it.size))) : 11, bold: it.bold };
              // a caption longer than its column, with text in the next cell: wrap it instead of cutting it off
              if (found.length && String(v).length * 0.55 * it.size > (colW[c] ?? 9) * 5.6 && it.r[c + 1]) cell.alignment = { wrapText: true, vertical: 'top' };
              // titles and captions may run over into the next columns: they don't set column widths
              if (filledN > 1 && !found.length) colW[c] = Math.max(colW[c] ?? 0, Math.min(60, String(v).length + 2));
            });
            row++; total++; prevY = it.y;
          }
        }
      }
      if (sheet) widths(sheet, colW);
      if (!total) throw new Error('No text was found in this PDF. Scanned PDFs (pictures of pages) need text recognition (OCR), which is coming soon.');
      const data = await wb.xlsx.writeBuffer();
      setOut({ blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rows: total, sheets: wb.worksheets.length, tables, warn: doc.numPages > MAX_PAGES ? `Only the first ${MAX_PAGES} pages were converted.` : '' });
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
          <p class="big">Done! Excel file ready — {out.rows} rows in {out.sheets} sheet{out.sheets > 1 ? 's' : ''}{out.tables ? `, ${out.tables} table${out.tables > 1 ? 's' : ''} with borders and merged cells` : ''} ({formatBytes(out.blob.size)}).</p>
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

const xlColor = (c: string) => 'FF' + c.replace('#', '').toUpperCase();
const dark = (c: string) => { const n = parseInt(c.replace('#', ''), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) < 120; };

/** Put a table into the sheet at a row: cells, merges, borders, fills, bold, alignment and sizes like the PDF. */
function writeTable(ws: any, t: Table, top: number, colW: number[]) {
  const thin = { style: 'thin', color: { argb: 'FF808080' } };
  t.colW.forEach((w, c) => { colW[c] = Math.max(colW[c] ?? 0, Math.min(80, Math.max(4, w / 5.6))); });
  t.rowH.forEach((h, r) => { const R = ws.getRow(top + r); R.height = Math.max(13, Math.min(300, h)); });
  for (const c of t.cells) {
    const r0 = top + c.r, c0 = 1 + c.c;
    if (c.rs > 1 || c.cs > 1) ws.mergeCells(r0, c0, r0 + c.rs - 1, c0 + c.cs - 1);
    const cell = ws.getCell(r0, c0);
    if (c.text) cell.value = c.text.includes('\n') ? c.text : cellValue(c.text);
    if (typeof cell.value === 'number' && /%$/.test(c.text.trim())) cell.numFmt = '0.##%';
    else if (typeof cell.value === 'number' && /\d,\d/.test(c.text)) cell.numFmt = /\d,\d\d,\d{3}/.test(c.text) ? '#,##,##0.##' : '#,##0.##';
    cell.font = { name: 'Calibri', size: c.size ? Math.max(6, Math.min(20, Math.round(c.size * 2) / 2)) : 10, bold: c.bold, color: c.fill && dark(c.fill) ? { argb: 'FFFFFFFF' } : undefined };
    cell.alignment = { vertical: c.rs > 1 || c.wrap ? 'top' : 'middle', horizontal: c.align, wrapText: true };
    if (c.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlColor(c.fill) } };
    for (let r = r0; r < r0 + c.rs; r++) for (let k = c0; k < c0 + c.cs; k++) {
      const x = ws.getCell(r, k);
      x.border = { top: r === r0 ? thin : undefined, bottom: r === r0 + c.rs - 1 ? thin : undefined, left: k === c0 ? thin : undefined, right: k === c0 + c.cs - 1 ? thin : undefined };
      if (t.ruled === 'rows') x.border = { top: r === r0 ? thin : undefined, bottom: r === r0 + c.rs - 1 ? thin : undefined };
    }
  }
}

function widths(ws: any, colW: number[]) {
  colW.forEach((w, c) => { if (w) ws.getColumn(c + 1).width = Math.max(6, Math.round(w * 10) / 10); });
}
