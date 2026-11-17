// Turns a template "sheet" spec (JSON) into an .xlsx workbook with real formulas, styles, validation and print setup.
// Cell ops (in order, later ops win):
//   { "c": "A1", "v": "Text" | 12 | "=SUM(B2:B9)", "s": "title", "m": "A1:F1", "fmt": "money" }
//   { "row": 5, "from": "A", "v": ["Date", "Item"], "s": "header" }            write values across a row
//   { "rows": [6, 30], "cols": { "A": { "s": "input", "fmt": "date" }, "E": { "v": "=IF(C{r}=\"\",\"\",C{r}*D{r})", "s": "calc" } } }
//   { "data": [["2026-11-01", "Rent", 1200]], "at": "A6" }                       sample values (dates as YYYY-MM-DD)
//   { "list": "C6:C30", "items": ["Food", "Rent"] }  or  { "list": "C6:C30", "ref": "Lists!$A$2:$A$12" }
//   { "cf": "E6:E30", "rule": "neg" | "pos" | "bar" | "done" | "over", "ref": "F6" }     conditional formats
//   { "cf": "I7:X36", "rule": "fill", "ref": "AND(...)", "color": "#B91C1C", "text": "#FFFFFF" }  custom fill (e.g. Gantt bars; first op wins)
//   { "height": [1, 30] }  row height     { "note": "B3", "text": "..." }     cell comment
// Styles: title, sub, header, label, input, calc, total, note, band, plain, big, check
import ExcelJS from 'exceljs';

const FMT = { money: '#,##0.00;[Red]-#,##0.00', int: '#,##0', num: '0.00', pct: '0%', pct1: '0.0%', date: 'dd mmm yyyy', time: 'hh:mm', hours: '0.00" h"', text: '@' };
const hex = (c) => String(c).replace('#', '').toUpperCase();
const tint = (c, t) => { const n = parseInt(hex(c), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const colNum = (L) => L.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colLet = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const isoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function makeXlsx(spec, accentHex, title) {
  const A = hex(spec.accent || accentHex);
  const font = spec.font || 'Calibri';
  const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
  const S = {
    title: { font: { name: font, size: 20, bold: true, color: { argb: 'FF' + A } }, alignment: { vertical: 'middle' } },
    sub: { font: { name: font, size: 10, italic: true, color: { argb: 'FF5B6475' } }, alignment: { vertical: 'middle', wrapText: false } },
    header: { font: { name: font, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill(A), border: box, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } },
    label: { font: { name: font, size: 10, bold: true, color: { argb: 'FF374151' } }, alignment: { vertical: 'middle' } },
    input: { font: { name: font, size: 10, color: { argb: 'FF1F2937' } }, border: box, alignment: { vertical: 'middle' } },
    calc: { font: { name: font, size: 10, color: { argb: 'FF1F2937' } }, fill: fill(tint(A, 0.07)), border: box, alignment: { vertical: 'middle' } },
    total: { font: { name: font, size: 11, bold: true, color: { argb: 'FF111827' } }, fill: fill(tint(A, 0.16)), border: { ...box, top: { style: 'medium', color: { argb: 'FF' + A } } }, alignment: { vertical: 'middle' } },
    big: { font: { name: font, size: 16, bold: true, color: { argb: 'FF' + A } }, fill: fill(tint(A, 0.08)), border: box, alignment: { vertical: 'middle', horizontal: 'center' } },
    band: { font: { name: font, size: 10, bold: true, color: { argb: 'FF' + A } }, fill: fill(tint(A, 0.12)), alignment: { vertical: 'middle' } },
    note: { font: { name: font, size: 9, italic: true, color: { argb: 'FF6B7280' } }, alignment: { vertical: 'top', wrapText: true } },
    plain: { font: { name: font, size: 10, color: { argb: 'FF1F2937' } }, alignment: { vertical: 'middle' } },
    check: { font: { name: font, size: 11, bold: true, color: { argb: 'FF' + A } }, border: box, alignment: { vertical: 'middle', horizontal: 'center' } },
  };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZentaPDF'; wb.title = title; wb.description = 'Free template from zentapdf.com';
  wb.calcProperties = { fullCalcOnLoad: true };

  for (const sh of spec.sheets) {
    const p = sh.page || {};
    const ws = wb.addWorksheet(sh.name, {
      properties: { tabColor: { argb: 'FF' + hex(sh.tab || A) }, defaultRowHeight: 18 },
      views: [{ showGridLines: !!sh.gridlines, state: sh.freeze ? 'frozen' : 'normal', ySplit: sh.freeze || 0, zoomScale: sh.zoom || 100 }],
      pageSetup: {
        paperSize: p.paper === 'Letter' ? 1 : 9, orientation: p.orientation || 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: p.fitHeight ?? 0,
        horizontalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
        printTitlesRow: p.titles, printArea: p.area,
      },
      headerFooter: p.pageNumbers ? { oddFooter: '&R&8&K6B7280Page &P of &N' } : undefined,
    });
    (sh.cols || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const style = (cell, s, fmt, extra) => {
      if (s) { const st = S[s] || S.plain; for (const k of Object.keys(st)) cell[k] = JSON.parse(JSON.stringify(st[k])); }
      if (fmt) cell.numFmt = FMT[fmt] || fmt;
      if (extra?.align) cell.alignment = { ...(cell.alignment || {}), horizontal: extra.align };
      if (extra?.wrap) cell.alignment = { ...(cell.alignment || {}), wrapText: true };
      if (extra?.bold) cell.font = { ...(cell.font || { name: font, size: 10 }), bold: true };
      if (extra?.unlock) cell.protection = { locked: false };
    };
    const put = (cell, v) => {
      if (v === undefined) return;
      if (typeof v === 'string' && v.startsWith('=')) cell.value = { formula: v.slice(1) };
      else if (isoDate(v)) cell.value = new Date(v + 'T00:00:00Z');
      else cell.value = v;
    };
    for (const op of sh.cells || []) {
      if (op.c) {
        if (op.m) ws.mergeCells(op.m);
        const cell = ws.getCell(op.c); put(cell, op.v); style(cell, op.s, op.fmt, op);
        if (op.m && op.s && S[op.s]?.border) { // borders on every merged cell
          const [a, b] = op.m.split(':'); const r1 = ws.getCell(a).row, r2 = ws.getCell(b).row, c1 = ws.getCell(a).col, c2 = ws.getCell(b).col;
          for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) style(ws.getCell(r, c), op.s, op.fmt, op);
        }
      } else if (op.row) {
        const c0 = colNum(op.from || 'A');
        op.v.forEach((v, i) => { const cell = ws.getCell(op.row, c0 + i); put(cell, v); style(cell, op.s, op.fmt, op); });
      } else if (op.rows) {
        const [r1, r2] = op.rows;
        for (let r = r1; r <= r2; r++) for (const [L, o] of Object.entries(op.cols)) {
          const cell = ws.getCell(`${L}${r}`);
          put(cell, typeof o.v === 'string' ? o.v.replaceAll('{r}', r).replaceAll('{p}', r - 1) : o.v);
          style(cell, o.s, o.fmt, o);
        }
      } else if (op.data) {
        const at = ws.getCell(op.at); const r0 = at.row, c0 = at.col;
        op.data.forEach((row, i) => row.forEach((v, j) => { if (v !== null && v !== '') put(ws.getCell(r0 + i, c0 + j), v); }));
      } else if (op.list) {
        const formulae = op.ref ? [op.ref] : ['"' + op.items.join(',') + '"'];
        ws.dataValidations.add(op.list, { type: 'list', allowBlank: true, formulae, showErrorMessage: true, errorTitle: 'Pick from the list', error: 'Please choose a value from the drop-down list.' });
      } else if (op.cf) {
        const rules = {
          neg: [{ type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } }],
          pos: [{ type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: 'FF047857' }, bold: true } } }],
          bar: [{ type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF' + A } }],
          done: [{ type: 'expression', formulae: [op.ref], style: { font: { color: { argb: 'FF9CA3AF' }, strike: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF3F4F6' } } } }],
          fill: [{ type: 'expression', formulae: [op.ref], style: { font: { color: { argb: 'FF' + hex(op.text || 'FFFFFF') } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + (op.color ? hex(op.color) : A) } } } }],
          over: [{ type: 'expression', formulae: [op.ref], style: { font: { color: { argb: 'FFB91C1C' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } } } }],
        }[op.rule];
        ws.addConditionalFormatting({ ref: op.cf, rules });
      } else if (op.height) {
        ws.getRow(op.height[0]).height = op.height[1];
      } else if (op.note) {
        ws.getCell(op.note).note = op.text;
      } else throw new Error('unknown cell op ' + JSON.stringify(op).slice(0, 80));
    }
  }
  return wb.xlsx.writeBuffer();
}
export { colLet };
