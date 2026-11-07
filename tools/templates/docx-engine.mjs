// Turns a template "doc" spec (JSON) into a .docx file. Every design is original and data-driven.
// Text markup inside any string: **bold**, _italic_, [placeholder] (shown in grey so users know to replace it).
// Block types: title, header, heading, p, fields, table, bullets, checklist, box, signature, spacer, rule, pagebreak, columns
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ShadingType, VerticalAlign, PageOrientation, TableLayoutType, HeightRule, LevelFormat,
} from 'docx';

const MM = 56.7; // twips per mm
const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const hex = (c) => String(c).replace('#', '').toUpperCase();
// mix a colour with white (t = 0..1 amount of colour kept)
const tint = (c, t) => { const n = parseInt(hex(c), 16); const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * t)); return ch.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };

export async function makeDocx(spec, accentHex, title) {
  const A = hex(spec.accent || accentHex);
  const font = spec.font || 'Calibri';
  const headFont = spec.headFont || font;
  const base = (spec.size || 10.5) * 2; // half-points
  const GREY = '8A94A6', DARK = '1F2937', MUTED = '5B6475';
  const [pw, ph] = PAPER[spec.page?.size || 'A4'];
  const land = spec.page?.orientation === 'landscape';
  const W = land ? ph : pw, H = land ? pw : ph;
  const m = spec.page?.margin ?? 18;
  const contentW = Math.round((W - 2 * m) * MM);

  const runs = (text, o = {}) => {
    const out = [];
    const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\])/g;
    String(text ?? '').split('\n').forEach((line, li) => {
      let last = 0, mt;
      const push = (t, extra = {}) => t && out.push(new TextRun({ text: t, font: o.font || font, size: o.size || base, bold: o.bold, italics: o.italic, color: o.color || DARK, allCaps: o.caps, characterSpacing: o.spacing, ...extra, break: undefined }));
      if (li > 0) out.push(new TextRun({ break: 1, size: o.size || base }));
      while ((mt = re.exec(line))) {
        push(line.slice(last, mt.index));
        const t = mt[0];
        if (t.startsWith('**')) push(t.slice(2, -2), { bold: true });
        else if (t.startsWith('_')) push(t.slice(1, -1), { italics: true });
        else push(t, { color: o.phColor || GREY });
        last = mt.index + t.length;
      }
      push(line.slice(last));
    });
    return out;
  };
  const para = (text, o = {}) => new Paragraph({
    children: runs(text, o), alignment: AlignmentType[(o.align || 'left').toUpperCase()],
    spacing: { before: (o.before ?? 0) * 20, after: (o.after ?? 4) * 20, line: o.line ? Math.round(o.line * 240) : undefined },
    border: o.border, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    keepNext: o.keepNext, pageBreakBefore: o.pageBreak, indent: o.indent ? { left: o.indent * MM } : undefined,
  });
  const cell = (children, o = {}) => new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: o.borders || NO_BORDERS, verticalAlign: o.v || VerticalAlign.CENTER, columnSpan: o.span,
    margins: { top: (o.pad ?? 1.4) * MM, bottom: (o.pad ?? 1.4) * MM, left: (o.padX ?? 2) * MM, right: (o.padX ?? 2) * MM },
  });
  const table = (rows, widths, o = {}) => new Table({
    rows, width: { size: contentW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: o.borders || NO_BORDERS,
  });
  const split = (fr) => { const s = fr.reduce((a, b) => a + b, 0); const w = fr.map((f) => Math.floor((contentW * f) / s)); w[w.length - 1] += contentW - w.reduce((a, b) => a + b, 0); return w; };
  const line = (color = 'D1D5DB', size = 6) => ({ style: BorderStyle.SINGLE, size, color });
  // a header line: "# Big", "## Bold", "~ small muted", or plain
  const headerLine = (s, align) => {
    if (s.startsWith('# ')) return para(s.slice(2), { size: (spec.titleSize || 26) * 2, bold: true, color: A, font: headFont, align, after: 2 });
    if (s.startsWith('## ')) return para(s.slice(3), { size: base + 4, bold: true, align, after: 2 });
    if (s.startsWith('~ ')) return para(s.slice(2), { size: base - 2, color: MUTED, align, after: 1 });
    return para(s, { align, after: 1 });
  };

  const out = [];
  for (const b of spec.blocks) {
    switch (b.type) {
      case 'title': {
        if (b.band) {
          out.push(table([new TableRow({ children: [cell([
            para(b.text, { size: (b.size || spec.titleSize || 26) * 2, bold: true, color: 'FFFFFF', font: headFont, align: b.align, after: 1, phColor: 'E5E7EB' }),
            ...(b.sub ? [para(b.sub, { color: tint('FFFFFF', 1), size: base, align: b.align, after: 0, phColor: 'E5E7EB' })] : []),
          ], { fill: A, pad: 4, padX: 5 })] })], [contentW]));
          out.push(para('', { after: 6 }));
        } else {
          out.push(para(b.text, { size: (b.size || spec.titleSize || 26) * 2, bold: true, color: b.color ? hex(b.color) : A, font: headFont, align: b.align, after: b.sub ? 1 : 8, caps: b.caps, spacing: b.caps ? 40 : undefined }));
          if (b.sub) out.push(para(b.sub, { color: MUTED, align: b.align, after: 8, size: b.subSize ? b.subSize * 2 : base }));
        }
        break;
      }
      case 'header': { // two columns: left and right lines (e.g. company and invoice details)
        const fr = b.split || [1, 1];
        out.push(table([new TableRow({ children: [
          cell((b.left || []).map((s) => headerLine(s, 'left')), { w: split(fr)[0], v: VerticalAlign.TOP, padX: 0 }),
          cell((b.right || []).map((s) => headerLine(s, 'right')), { w: split(fr)[1], v: VerticalAlign.TOP, padX: 0 }),
        ] })], split(fr)));
        out.push(para('', { after: b.after ?? 6, border: b.rule === false ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 12, color: A, space: 4 } } }));
        break;
      }
      case 'heading':
        out.push(para(b.text, {
          bold: true, color: b.plain ? DARK : A, font: headFont, size: (b.size || 12) * 2, caps: b.caps !== false, spacing: b.caps !== false ? 20 : undefined,
          before: b.pagebreak ? 0 : b.before ?? 10, after: 4, keepNext: true, align: b.align, pageBreak: b.pagebreak,
          border: b.rule === false ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, color: tint(A, 0.45), space: 2 } },
        }));
        break;
      case 'p':
        out.push(para(b.text, { align: b.align, size: b.size ? b.size * 2 : base, color: b.muted ? MUTED : b.color ? hex(b.color) : DARK, bold: b.bold, italic: b.italic, before: b.before, after: b.after ?? 6, line: b.line, indent: b.indent, font: b.font }));
        break;
      case 'rule':
        out.push(para('', { after: b.after ?? 6, border: { bottom: { style: BorderStyle.SINGLE, size: b.weight || 6, color: b.accent ? A : 'D1D5DB', space: 1 } } }));
        break;
      case 'spacer':
        out.push(para('', { after: b.h ?? 10, size: 4 }));
        break;
      case 'pagebreak':
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        break;
      case 'bullets':
      case 'checklist': {
        for (const it of b.items) out.push(new Paragraph({
          children: [new TextRun({ text: b.type === 'checklist' ? '☐  ' : '', font: 'DejaVu Sans', size: base, color: A }), ...runs(it)],
          numbering: b.type === 'bullets' ? { reference: b.numbered ? 'nums' : 'dots', level: 0 } : undefined,
          spacing: { after: (b.gap ?? 3) * 20 }, indent: b.type === 'checklist' ? { left: 4 * MM } : undefined,
        }));
        out.push(para('', { after: 2, size: 4 }));
        break;
      }
      case 'fields': { // label: value pairs with writing lines, 1 to 3 pairs per row
        const cols = b.cols || 1; const lw = b.labelWidth || 0.38;
        const unit = contentW / cols; const widths = [];
        for (let i = 0; i < cols; i++) widths.push(Math.round(unit * lw), Math.round(unit * (1 - lw)));
        widths[widths.length - 1] += contentW - widths.reduce((a, c) => a + c, 0);
        const rows = [];
        for (let i = 0; i < b.items.length; i += cols) {
          const cs = [];
          for (let j = 0; j < cols; j++) {
            const [lab, val] = b.items[i + j] || ['', ''];
            cs.push(cell(para(lab, { bold: true, color: MUTED, size: base - 1, after: 0 }), { w: widths[j * 2], padX: j ? 3 : 0 }));
            cs.push(cell(para(val, { after: 0 }), { w: widths[j * 2 + 1], borders: { ...NO_BORDERS, bottom: lab && b.lines !== false ? line('B8C0CC', 4) : NONE }, padX: 1 }));
          }
          rows.push(new TableRow({ children: cs, height: { value: (b.rowHeight || 7.5) * MM, rule: HeightRule.ATLEAST } }));
        }
        out.push(table(rows, widths));
        out.push(para('', { after: b.after ?? 6, size: 4 }));
        break;
      }
      case 'table': {
        const widths = split(b.columns.map((c) => c.w || 1));
        const al = (i) => AlignmentType[(b.columns[i].align || 'left').toUpperCase()];
        const grid = { top: line('D1D5DB'), bottom: line('D1D5DB'), left: b.grid ? line('D1D5DB') : NONE, right: b.grid ? line('D1D5DB') : NONE };
        const rows = [new TableRow({ tableHeader: true, children: b.columns.map((c, i) => cell(new Paragraph({ alignment: al(i), children: runs(c.h, { bold: true, color: b.headText ? hex(b.headText) : 'FFFFFF', size: base - 1, phColor: 'E5E7EB' }) }), { w: widths[i], fill: b.headFill ? hex(b.headFill) : A, borders: grid, pad: 1.8 })) })];
        const body = [...(b.rows || [])];
        for (let k = 0; k < (b.blank || 0); k++) body.push(b.columns.map(() => ''));
        body.forEach((r, ri) => rows.push(new TableRow({
          height: { value: (b.rowHeight || 7) * MM, rule: HeightRule.ATLEAST },
          children: r.map((v, i) => cell(new Paragraph({ alignment: al(i), children: runs(v, { size: base - (b.small ? 1 : 0) }) }), { w: widths[i], fill: b.zebra !== false && ri % 2 ? tint(A, 0.06) : undefined, borders: grid, v: b.top ? VerticalAlign.TOP : VerticalAlign.CENTER })),
        })));
        out.push(table(rows, widths));
        if (b.totals?.length) { // right-aligned totals block under the table
          const tw = split([1.6, 1, 0.9]);
          out.push(table(b.totals.map(([lab, val], i) => {
            const last = i === b.totals.length - 1;
            return new TableRow({ children: [
              cell(para('', { after: 0 }), { w: tw[0] }),
              cell(para(lab, { bold: last, after: 0, align: 'right', color: last ? 'FFFFFF' : MUTED }), { w: tw[1], fill: last ? A : undefined, borders: { ...NO_BORDERS, bottom: last ? NONE : line('E5E7EB', 4) } }),
              cell(para(val, { bold: last, after: 0, align: 'right', color: last ? 'FFFFFF' : DARK, phColor: last ? 'E5E7EB' : GREY }), { w: tw[2], fill: last ? A : undefined, borders: { ...NO_BORDERS, bottom: last ? NONE : line('E5E7EB', 4) } }),
            ] });
          }), tw));
        }
        out.push(para('', { after: b.after ?? 8, size: 4 }));
        break;
      }
      case 'box': { // shaded note box (terms, bank details, notes)
        const children = [];
        if (b.title) children.push(para(b.title, { bold: true, color: A, after: 2, caps: true, size: base - 1, spacing: 20 }));
        for (const s of b.lines || []) children.push(para(s, { after: 1, size: b.small ? base - 1 : base }));
        out.push(table([new TableRow({ children: [cell(children, { fill: tint(A, 0.08), pad: 3, padX: 4, borders: { ...NO_BORDERS, left: { style: BorderStyle.SINGLE, size: 18, color: A } } })] })], [contentW]));
        out.push(para('', { after: b.after ?? 8, size: 4 }));
        break;
      }
      case 'columns': { // side-by-side boxes of lines, e.g. "Bill to" and "Ship to"
        const widths = split(b.cols.map((c) => c.w || 1));
        out.push(table([new TableRow({ children: b.cols.map((c, i) => cell([
          ...(c.title ? [para(c.title, { bold: true, color: A, caps: true, size: base - 2, spacing: 20, after: 2 })] : []),
          ...(c.lines || []).map((s) => headerLine(s, c.align || 'left')),
        ], { w: widths[i], v: VerticalAlign.TOP, fill: c.fill ? tint(A, 0.07) : undefined, pad: c.fill ? 2.5 : 0.5, padX: c.fill ? 3 : i ? 3 : 0 })) })], widths));
        out.push(para('', { after: b.after ?? 8, size: 4 }));
        break;
      }
      case 'signature': { // signature lines with labels
        const n = b.items.length; const gap = 0.25;
        const fr = []; b.items.forEach((_, i) => { fr.push(1); if (i < n - 1) fr.push(gap); });
        const widths = split(fr);
        out.push(para('', { after: b.space ?? 26, size: 4 }));
        out.push(table([new TableRow({ children: fr.map((f, i) => i % 2 === 0
          ? cell(para(b.items[i / 2], { align: b.align || 'left', color: MUTED, size: base - 1, after: 0 }), { w: widths[i], borders: { ...NO_BORDERS, top: line('6B7280', 6) }, padX: 0 })
          : cell(para('', { after: 0 }), { w: widths[i] })) })], widths));
        out.push(para('', { after: b.after ?? 6, size: 4 }));
        break;
      }
      default: throw new Error('unknown block type ' + b.type);
    }
  }

  const bd = spec.page?.border;
  const pageBorder = bd ? { style: bd.double ? BorderStyle.DOUBLE : BorderStyle.SINGLE, size: bd.size || 24, color: hex(bd.color || A), space: bd.space || 24 } : null;
  const doc = new Document({
    creator: 'ZentaPDF', title, description: 'Free template from zentapdf.com',
    styles: { default: { document: { run: { font, size: base, color: DARK }, paragraph: { spacing: { after: 80 } } } } },
    numbering: { config: [
      { reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { color: A } } }] },
      { reference: 'nums', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 280 } }, run: { color: A, bold: true } } }] },
    ] },
    sections: [{
      properties: { page: {
        size: { width: Math.round(pw * MM), height: Math.round(ph * MM), orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: Math.round(m * MM), bottom: Math.round(m * MM), left: Math.round(m * MM), right: Math.round(m * MM), header: 400, footer: 400 },
        borders: pageBorder ? { pageBorderTop: pageBorder, pageBorderBottom: pageBorder, pageBorderLeft: pageBorder, pageBorderRight: pageBorder, pageBorders: { offsetFrom: 'page', display: 'allPages' } } : undefined,
      }, verticalAlign: spec.page?.vcenter ? 'center' : undefined },
      children: out,
    }],
  });
  return Packer.toBuffer(doc);
}
