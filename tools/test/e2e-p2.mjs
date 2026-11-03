import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const XLSX = require('xlsx'); const { unzipSync, strFromU8 } = require('fflate');
const T = '/home/claude/testfiles/', OUT = '/home/claude/testout/';
const B = 'http://localhost:4321'; const only = process.argv[2];
const browser = await chromium.launch(); const results = [];
const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
async function page(url, width = 1280) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: 900 } });
  const p = await ctx.newPage(); p.errors = [];
  p.on('console', (m) => m.type() === 'error' && !/TUNNEL|googletagmanager|google-analytics/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(B + url); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }).catch(() => {});
  return p;
}
async function dl(p, btn, name, timeout = 180000) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout }), p.getByRole('button', { name: btn }).first().click()]);
  const path = OUT + name; await d.saveAs(path); return path;
}
const pdfText = async (path) => { const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs'); const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)) }).promise; let t = ''; for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ') + '\n'; return { n: doc.numPages, t }; };
const run = (n) => !only || n.includes(only);
try {
  if (run('pdf-to-word')) {
    let p = await page('/pdf-to-word/'); await p.setInputFiles('input[type=file]', T + 'report.pdf');
    await p.getByRole('button', { name: 'Convert to Word' }).click();
    let path = await dl(p, 'Download Word', 'p2w-layout.docx'); let z = unzipSync(fs.readFileSync(path)); let x = strFromU8(z['word/document.xml']);
    ok('p2w layout: editable text in frames', /framePr/.test(x) && /Quarterly Report/.test(x) && /25 percent/.test(x) && /Flow meter/.test(x));
    ok('p2w layout: background picture', Object.keys(z).some((k) => k.startsWith('word/media/')) && /behindDoc="1"/.test(x));
    ok('p2w layout: fonts + bold', /Cambria|Calibri/.test(x) && /<w:b\/>|<w:b w:val="true"\/>/.test(x));
    ok('p2w no errors', !p.errors.length, p.errors.join('|'));
    await p.getByRole('button', { name: 'Change settings' }).click(); await p.getByRole('radio', { name: /Flowing text/ }).click();
    await p.getByRole('button', { name: 'Convert to Word' }).click();
    path = await dl(p, 'Download Word', 'p2w.docx'); x = strFromU8(unzipSync(fs.readFileSync(path))['word/document.xml']);
    ok('p2w flowing text + heading', /Quarterly Report/.test(x) && /Heading1|Heading2/.test(x));
  }
  if (run('pdf-to-excel')) {
    const p = await page('/pdf-to-excel/'); await p.setInputFiles('input[type=file]', T + 'table.pdf');
    await p.getByRole('radio', { name: /All in one sheet/ }).click();
    await p.getByRole('button', { name: 'Convert to Excel' }).click();
    const path = await dl(p, 'Download Excel', 'p2x.xlsx'); const wb = XLSX.readFile(path); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const r5 = rows.find((r) => r[0] === 'Product 5');
    ok('pdf-to-excel columns', !!r5 && r5[1] === 5 && r5[2] === 497.5, JSON.stringify(rows.slice(0, 3)) + JSON.stringify(r5));
    ok('pdf-to-excel rows', rows.filter((r) => /^Product \d+$/.test(r[0])).length === 59, rows.length);
    const p2 = await page('/pdf-to-excel/'); await p2.setInputFiles('input[type=file]', T + 'ruled.pdf');
    await p2.getByRole('button', { name: 'Convert to Excel' }).click();
    const wb2 = XLSX.readFile(await dl(p2, 'Download Excel', 'p2x2.xlsx')); const ws2 = wb2.Sheets[wb2.SheetNames[0]]; const r2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });
    const hdr = r2.findIndex((r) => r[0] === 'Item');
    ok('pdf-to-excel ruled table', hdr >= 0 && r2[hdr + 1][1] === 'Flow meter KDF-9291 with needle valve' && r2[hdr + 1][4] === 25000 && /wraps$/.test(r2[hdr + 2][1]), JSON.stringify(r2.slice(hdr, hdr + 3)));
    ok('pdf-to-excel merged total', (ws2['!merges'] || []).some((m) => m.e.c - m.s.c === 3), JSON.stringify(ws2['!merges']));
    const p3 = await page('/pdf-to-excel/'); await p3.setInputFiles('input[type=file]', T + 'statement.pdf');
    await p3.getByRole('button', { name: 'Convert to Excel' }).click();
    const r3 = XLSX.utils.sheet_to_json((w => w.Sheets[w.SheetNames[0]])(XLSX.readFile(await dl(p3, 'Download Excel', 'p2x3.xlsx'))), { header: 1 });
    ok('pdf-to-excel row-ruled statement', r3[0].join('|') === 'Date|Narration|Debit|Credit|Balance' && r3[1][1] === 'UPI/SALARY' && r3[1][4] === 51133, JSON.stringify(r3.slice(0, 2)));
  }
  for (const [slug, f, re] of [['word-to-pdf', 'sample.docx', /Quarterly Report[\s\S]*25 percent[\s\S]*Flow meter/], ['excel-to-pdf', 'sample.xlsx', /Product 59[\s\S]*Second sheet text/], ['odt-to-pdf', 'sample.odt', /Quarterly Report[\s\S]*Flow meter/], ['ods-to-pdf', 'sample.ods', /Product 59/], ['ppt-to-pdf', 'sample.pptx', null], ['odp-to-pdf', 'sample.odp', null]]) {
    if (!run(slug)) continue;
    const p = await page(`/${slug}/`); await p.setInputFiles('input[type=file]', T + f);
    await p.getByRole('button', { name: 'Convert to PDF' }).click();
    const path = await dl(p, 'Download PDF', slug + '.pdf'); const r = await pdfText(path);
    ok(slug, re ? re.test(r.t) : r.n === 3, `${r.n} pages`); ok(slug + ' no errors', !p.errors.length, p.errors.join('|'));
  }
  if (run('old')) { const p = await page('/word-to-pdf/'); fs.writeFileSync('/tmp/old.doc', 'x'); await p.setInputFiles('input[type=file]', '/tmp/old.doc'); await p.waitForSelector('.error'); ok('old .doc message', /save it as \.docx/.test(await p.textContent('.error'))); }
} catch (e) { results.push('FAIL exception ' + e.message.split('\n')[0]); }
console.log(results.join('\n')); await browser.close();
