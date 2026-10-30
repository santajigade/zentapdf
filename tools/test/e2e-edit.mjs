import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/'; fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321'; const b = await chromium.launch(); const res = [];
const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 900 } }); const p = await c.newPage(); p.errors = []; p.on('console', m => m.type() === 'error' && !/TUNNEL|googletagmanager|google-analytics/.test(m.text()) && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e))); await p.goto(B + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function load(p, f) { await p.setInputFiles('input[type=file]', [T + f]); await p.waitForSelector('.files .meta'); }
async function go(p, btn, f) { await p.getByRole('button', { name: btn, exact: true }).click(); const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download PDF' }).click()]); await d.saveAs(OUT + f); return OUT + f; }
try {
  let p = await page('/add-page-numbers/'); await load(p, 'c.pdf');
  await p.selectOption('select >> nth=1', 'of'); await p.check('text=Skip first page');
  let f = await go(p, 'Add page numbers', 'num.pdf'); ok('numbers', (await PDFDocument.load(fs.readFileSync(f))).getPageCount() === 120);
  ok('numbers errors', !p.errors.length, p.errors.join());

  p = await page('/add-watermark/'); await load(p, 'b.pdf');
  await p.fill('.opts input[type=text]', 'DRAFT'); await p.check('text=Repeat across page');
  f = await go(p, 'Add watermark', 'wm.pdf'); ok('watermark text', fs.statSync(f).size > 3000);
  await p.getByRole('button', { name: 'New file' }).click(); await load(p, 'a.pdf');
  await p.getByRole('button', { name: 'Image / logo' }).click(); await p.setInputFiles('.opts input[type=file]', [T + 'transparent.png']);
  f = await go(p, 'Add watermark', 'wm2.pdf'); ok('watermark image', fs.statSync(f).size > 2000);
  await p.getByRole('button', { name: 'New file' }).click(); await load(p, 'a.pdf');
  await p.getByRole('button', { name: 'Text', exact: true }).click(); await p.fill('.opts input[type=text]', 'गोपनीय'); await p.getByRole('button', { name: 'Add watermark', exact: true }).click(); await p.waitForSelector('.error');
  ok('watermark hindi msg', /characters/.test(await p.textContent('.error')));
  ok('watermark errors', !p.errors.length, p.errors.join());

  p = await page('/crop-pdf/'); await load(p, 'b.pdf');
  f = await go(p, 'Crop PDF', 'crop.pdf'); const cd = await PDFDocument.load(fs.readFileSync(f));
  const cb = cd.getPage(0).getCropBox(); ok('crop 10mm', Math.round(cb.width) === Math.round(595 - 2 * 28.35), JSON.stringify(cb));
  ok('crop errors', !p.errors.length, p.errors.join());

  p = await page('/flatten-pdf/'); await load(p, 'form.pdf');
  f = await go(p, 'Flatten PDF', 'flat.pdf'); const fd = await PDFDocument.load(fs.readFileSync(f));
  ok('flatten fields gone', fd.getForm().getFields().length === 0, await p.textContent('.done .status'));
  ok('flatten errors', !p.errors.length, p.errors.join());

  p = await page('/edit-pdf-metadata/'); await load(p, 'form.pdf');
  ok('meta read', (await p.inputValue('.opts input >> nth=0')) === 'Old title');
  await p.fill('.opts input >> nth=0', 'New title'); await p.fill('.opts input >> nth=1', '');
  f = await go(p, 'Save metadata', 'meta.pdf'); const md = await PDFDocument.load(fs.readFileSync(f), { updateMetadata: false });
  ok('meta write', md.getTitle() === 'New title' && !md.getAuthor(), md.getTitle() + '|' + md.getAuthor());
  ok('meta errors', !p.errors.length, p.errors.join());

  p = await page('/crop-pdf/'); await p.setInputFiles('input[type=file]', [T + 'encrypted.pdf']); await p.waitForSelector('.error');
  ok('encrypted', /password/i.test(await p.textContent('.error')));
  for (const u of ['/add-page-numbers/', '/add-watermark/', '/crop-pdf/', '/edit-pdf-metadata/']) {
    const m = await page(u, 360); await load(m, 'b.pdf'); await m.waitForTimeout(800); const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok('360 ' + u, sw <= 360, sw);
  }
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
