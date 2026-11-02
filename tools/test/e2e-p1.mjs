import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium, firefox, webkit } = require('playwright');
import fs from 'fs';
const { PDFDocument } = require('pdf-lib');
const T = '/home/claude/testfiles/', OUT = '/home/claude/testout/';
fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321';
const which = process.argv[2] || 'chromium';
const only = process.argv[3];
const browser = await ({ chromium, firefox, webkit })[which].launch();
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name} ${info}`); };
async function page(url, width = 1280) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: 900 } });
  const p = await ctx.newPage(); p.errors = [];
  p.on('console', (m) => m.type() === 'error' && !/TUNNEL|googletagmanager|google-analytics/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(B + url); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }).catch(() => {});
  return p;
}
const upload = (p, files) => p.setInputFiles('input[type=file] >> nth=0', files.map((f) => T + f));
async function dl(p, btn, name, timeout = 120000) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout }), p.getByRole('button', { name: btn }).first().click()]);
  const path = OUT + which + '-' + name; await d.saveAs(path); return path;
}
const pdfText = async (path) => { const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs'); const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)) }).promise; let t = ''; for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ') + '\n'; return { n: doc.numPages, t }; };
const run = (name) => !only || name.includes(only);

try {
  for (const [slug, f, expect] of [['txt-to-pdf', 'sample.txt', /Line 119/], ['csv-to-pdf', 'sample.csv', /Person 79/], ['html-to-pdf', 'sample.html', /HTML Test Heading[\s\S]*Nested/], ['epub-to-pdf', 'sample.epub', /Chapter Two/], ['rtf-to-pdf', 'sample.rtf', /bold[\s\S]*Café/], ['markdown-to-pdf', 'sample.md', /Markdown Title[\s\S]*code block/]]) {
    if (!run(slug)) continue;
    const p = await page(`/${slug}/`); await upload(p, [f]);
    await p.getByRole('button', { name: 'Convert to PDF' }).click();
    const path = await dl(p, 'Download PDF', slug + '.pdf');
    const r = await pdfText(path);
    ok(slug, expect.test(r.t), `${r.n} pages`); ok(slug + ' no errors', !p.errors.length, p.errors.join('|'));
    if (slug === 'html-to-pdf') ok('html no script/style text', !/alert|color:red/.test(r.t));
    if (slug === 'epub-to-pdf') ok('epub chapters on new page', r.n >= 2, r.n);
  }
  if (run('zip')) {
    const p = await page('/zip-to-pdf/'); await upload(p, ['sample.zip']);
    const path = await dl(p, 'Download PDF', 'zip.pdf'); const r = await pdfText(path);
    const a = (await PDFDocument.load(fs.readFileSync(T + 'a.pdf'))).getPageCount();
    ok('zip to pdf', r.n >= a + 3 && /Line 5/.test(r.t), `${r.n} pages`); ok('zip skipped docx listed', /readme\.docx/.test(await p.textContent('.done')));
  }
  if (run('png')) {
    const p = await page('/pdf-to-png/'); await upload(p, ['a.pdf']);
    await p.getByRole('button', { name: 'Convert to images' }).click();
    const path = await dl(p, /Download all|Download image/, 'png.zip'); ok('pdf to png zip', fs.statSync(path).size > 1000 && fs.readFileSync(path).toString('latin1').includes('.png'));
  }
  if (run('ppt')) {
    const p = await page('/pdf-to-ppt/'); await upload(p, ['a.pdf']);
    await p.getByRole('button', { name: 'Convert to PowerPoint' }).click();
    const path = await dl(p, 'Download PPTX', 'out.pptx'); const s = fs.readFileSync(path).toString('latin1');
    ok('pdf to ppt', s.startsWith('PK') && (s.match(/ppt\/slides\/slide\d+\.xml/g) || []).length >= 3, fs.statSync(path).size);
    ok('ppt no errors', !p.errors.length, p.errors.join('|'));
  }
  if (run('redact')) {
    const p = await page('/redact-pdf/'); await upload(p, ['form2.pdf']);
    await p.waitForSelector('.rpage >> nth=1');
    await p.fill('input[placeholder^="e.g. a name"]', 'John Smith'); await p.getByRole('button', { name: 'Mark all' }).click();
    await p.getByRole('button', { name: 'Mark emails' }).click(); await p.getByRole('button', { name: 'Mark phone numbers' }).click();
    await p.waitForTimeout(500); const n = await p.$$eval('.rbox', (x) => x.length);
    ok('redact marks', n === 3, n);
    // also a hand-drawn box on page 1
    const bb = await (await p.$('.rpage-in')).boundingBox();
    await p.mouse.move(bb.x + 40, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 200, bb.y + 60, { steps: 5 }); await p.mouse.up();
    ok('redact hand box', (await p.$$eval('.rbox', (x) => x.length)) === 4);
    await p.getByRole('button', { name: 'Redact PDF' }).click();
    const path = await dl(p, 'Download PDF', 'redacted.pdf'); const r = await pdfText(path);
    ok('redacted text gone', !/John|9876543210|example\.com/.test(r.t) && r.n === 2, JSON.stringify(r.t.slice(0, 80)));
  }
  if (run('form')) {
    const p = await page('/pdf-form-filler/'); await upload(p, ['form2.pdf']);
    await p.waitForSelector('.ffw');
    await p.fill('input.ffw[title=fullname]', 'Santaji नमस्ते'); await p.fill('textarea.ffw', 'Line 1\nLine 2');
    await p.check('input[aria-label=agree]'); await p.selectOption('select.ffw', 'Mumbai'); await p.check('input[aria-label="gender: Female"]');
    await p.getByRole('button', { name: 'Save filled PDF' }).click();
    const path = await dl(p, 'Download PDF', 'filled.pdf');
    const f = (await PDFDocument.load(fs.readFileSync(path))).getForm();
    ok('form filled', f.getTextField('fullname').getText() === 'Santaji नमस्ते' && f.getCheckBox('agree').isChecked() && f.getDropdown('city').getSelected()[0] === 'Mumbai' && f.getRadioGroup('gender').getSelected() === 'Female', '');
    ok('form no errors', !p.errors.length, p.errors.join('|'));
    const p2 = await page('/pdf-form-filler/'); await upload(p2, ['a.pdf']); await p2.waitForSelector('.note-box'); ok('form: no fields message', /no fillable/.test(await p2.textContent('.note-box')));
  }
  if (run('reader')) {
    const p = await page('/pdf-reader/'); await upload(p, ['c.pdf']);
    await p.waitForSelector('.rd-page canvas', { timeout: 20000 });
    ok('reader renders', (await p.$$('.rd-page')).length === 120);
    await p.fill('.rd-num', '50'); await p.press('.rd-num', 'Enter'); await p.waitForTimeout(1500);
    ok('reader jump', +(await p.inputValue('.rd-num')) >= 49, await p.inputValue('.rd-num'));
    await p.fill('.rd-search input', 'Page'); await p.getByRole('button', { name: 'Find' }).click(); await p.waitForTimeout(2500);
    ok('reader search', /\/\d+/.test(await p.textContent('.rd-search')), await p.textContent('.rd-search'));
    const sel = await p.evaluate(() => { const s = document.querySelector('.rd-page .textLayer span'); if (!s) return ''; const r = document.createRange(); r.selectNodeContents(s); getSelection().removeAllRanges(); getSelection().addRange(r); return getSelection().toString(); });
    ok('reader text selectable', sel.length > 0, JSON.stringify(sel));
    await p.getByRole('button', { name: 'Zoom in' }).click(); await p.waitForTimeout(800);
    ok('reader no errors', !p.errors.length, p.errors.join('|'));
  }
  if (run('annot')) {
    const p = await page('/pdf-annotator/'); await upload(p, ['a.pdf']);
    await p.waitForSelector('.ed-bar'); const labels = await p.$$eval('.ed-label', (x) => x.map((e) => e.textContent).join(','));
    ok('annotator tools', !/Edit text|White-out/.test(labels) && /Highlight/.test(labels), labels);
    const pg = await p.waitForSelector('[style*="aspect-ratio"] >> nth=0'); const bb = await pg.boundingBox();
    await p.mouse.move(bb.x + 50, bb.y + 50); await p.mouse.down(); await p.mouse.move(bb.x + 250, bb.y + 70, { steps: 5 }); await p.mouse.up();
    await p.getByRole('button', { name: 'Save PDF' }).first().click();
    const path = await dl(p, 'Download PDF', 'annot.pdf'); ok('annotator saves', /annotated/.test(path) || fs.statSync(path).size > 500);
  }
  if (run('scan')) {
    const p = await page('/pdf-scanner/'); await p.setInputFiles('input[type=file][multiple]', [T + 'photo1.jpg', T + 'photo2.jpg']);
    await p.waitForSelector('.scan-pages li >> nth=1', { timeout: 30000 });
    await p.getByRole('button', { name: 'Black & white' }).click(); await p.waitForTimeout(1500);
    const h = await (await p.$('.scan-h')).boundingBox(); await p.mouse.move(h.x + 13, h.y + 13); await p.mouse.down(); await p.mouse.move(h.x + 60, h.y + 50, { steps: 4 }); await p.mouse.up();
    await p.getByRole('button', { name: 'Create PDF' }).click();
    const path = await dl(p, 'Download PDF', 'scan.pdf'); ok('scanner pdf', (await PDFDocument.load(fs.readFileSync(path))).getPageCount() === 2, fs.statSync(path).size);
    ok('scanner no errors', !p.errors.length, p.errors.join('|'));
  }
  if (run('mobile')) for (const s of ['pdf-reader', 'redact-pdf', 'pdf-form-filler', 'pdf-scanner', 'csv-to-pdf']) {
    const p = await page(`/${s}/`, 360); await p.setInputFiles(s === 'pdf-scanner' ? 'input[type=file][multiple]' : 'input[type=file] >> nth=0', [T + (s === 'pdf-scanner' ? 'photo1.jpg' : s === 'csv-to-pdf' ? 'sample.csv' : s === 'pdf-form-filler' ? 'form2.pdf' : 'a.pdf')]);
    await p.waitForTimeout(3000); const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`mobile ${s} no overflow`, sw <= 362, sw);
  }
} catch (e) { results.push('FAIL exception ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
await browser.close();
