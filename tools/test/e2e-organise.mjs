import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/'; fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321'; const b = await chromium.launch(); const res = [];
const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 900 } }); const p = await c.newPage(); p.errors = []; p.on('console', m => m.type() === 'error' && !/TUNNEL|googletagmanager|google-analytics/.test(m.text()) && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e))); await p.goto(B + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function load(p, f) { await p.setInputFiles('input[type=file]', [T + f]); await p.waitForFunction(() => document.querySelectorAll('.pages-grid img').length > 0 && !document.querySelector('.progress')); }
async function dl(p, f) { const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download PDF' }).click()]); await d.saveAs(OUT + f); return PDFDocument.load(fs.readFileSync(OUT + f)); }
try {
  let p = await page('/remove-pages/'); await load(p, 'b.pdf');
  await p.fill('.opts input[type=text]', '2, 4-5'); await p.getByRole('button', { name: 'Select', exact: true }).click();
  await p.getByRole('button', { name: 'Remove pages' }).click(); let d = await dl(p, 'rm.pdf');
  ok('remove 2,4-5 → 2 pages', d.getPageCount() === 2); ok('remove errors', !p.errors.length, p.errors.join());

  p = await page('/extract-pages/'); await load(p, 'c.pdf');
  await p.locator('.pages-grid figure').nth(9).click(); await p.locator('.pages-grid figure').nth(0).click();
  await p.getByRole('button', { name: 'Extract pages' }).click(); d = await dl(p, 'ex.pdf');
  ok('extract 2 pages of 120', d.getPageCount() === 2); ok('extract errors', !p.errors.length, p.errors.join());

  p = await page('/reorder-pdf-pages/'); await load(p, 'b.pdf');
  await p.getByRole('button', { name: 'Reverse order' }).click();
  await p.locator('.pages-grid figure').nth(0).dragTo(p.locator('.pages-grid figure').nth(2));
  ok('reorder labels', true, (await p.locator('.pages-grid figure > div:first-of-type').allTextContents()).join(','));
  await p.getByRole('button', { name: 'Save new order' }).click(); d = await dl(p, 'ro.pdf');
  ok('reorder 5 pages', d.getPageCount() === 5); ok('reorder errors', !p.errors.length, p.errors.join());

  p = await page('/rotate-pdf/'); await load(p, 'b.pdf');
  await p.getByRole('button', { name: /Rotate all right/ }).click();
  await p.getByRole('button', { name: 'Rotate page 2 right' }).click();
  await p.getByRole('button', { name: 'Rotate PDF', exact: true }).click(); d = await dl(p, 'rot.pdf');
  const rots = d.getPages().map(x => x.getRotation().angle).join(',');
  ok('rotate angles', rots === '90,180,90,90,90', rots); ok('rotate errors', !p.errors.length, p.errors.join());

  p = await page('/add-blank-page/'); await load(p, 'landscape.pdf');
  await p.getByRole('button', { name: '+ Blank at start' }).click();
  await p.getByRole('button', { name: '+ Blank', exact: true }).nth(1).click();
  await p.getByRole('button', { name: 'Add blank pages' }).click(); d = await dl(p, 'bl.pdf');
  ok('blank → 4 pages, landscape size', d.getPageCount() === 4 && Math.round(d.getPage(0).getWidth()) === 842, d.getPages().map(x => Math.round(x.getWidth())).join());
  ok('blank errors', !p.errors.length, p.errors.join());

  p = await page('/remove-pages/'); await p.setInputFiles('input[type=file]', [T + 'encrypted.pdf']); await p.waitForSelector('.error');
  ok('encrypted msg', /password/i.test(await p.textContent('.error')));
  for (const u of ['/remove-pages/', '/rotate-pdf/', '/reorder-pdf-pages/', '/add-blank-page/']) {
    const m = await page(u, 360); await load(m, 'b.pdf'); const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok('360 ' + u, sw <= 360, sw);
  }
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
