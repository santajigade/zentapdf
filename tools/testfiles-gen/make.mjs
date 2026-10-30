import { PDFDocument, StandardFonts, rgb } from '../../node_modules/pdf-lib/cjs/index.js';
import fs from 'fs';
const D = '/home/claude/testfiles/';
async function mk(name, n, opts = {}) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = d.addPage(opts.size || [595, 842]);
    p.drawText(`${name} page ${i}`, { x: 50, y: p.getHeight() - 80, size: 28, font: f, color: rgb(0.2, 0.2, 0.6) });
  }
  if (opts.blob) { // big embedded image-like content to inflate size
    const png = fs.readFileSync(D + 'big.png');
    const img = await d.embedPng(png);
    d.getPages().forEach((p, i) => i < opts.blob && p.drawImage(img, { x: 50, y: 50, width: 300, height: 300 }));
  }
  fs.writeFileSync(D + name + '.pdf', await d.save({ useObjectStreams: false }));
}
await mk('a', 3); await mk('b', 5); await mk('c', 120); await mk('landscape', 2, { size: [842, 595] });
