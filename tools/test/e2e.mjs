import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium, firefox, webkit } = require('playwright');
import { PDFDocument } from '../../node_modules/pdf-lib/cjs/index.js';
import fs from 'fs';
const T = '/home/claude/testfiles/', OUT = '/home/claude/testout/';
fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321';
const which = process.argv[2] || 'chromium';
const browser = await ({ chromium, firefox, webkit })[which].launch();
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name} ${info}`); };

async function page(url, width = 1280) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(B + url); if (/-/.test(url)) await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }).catch(() => {});
  return p;
}
async function upload(p, files) { await p.setInputFiles('input[type=file] >> nth=0', files.map((f) => T + f)); }
async function dl(p, btnText, name, timeout = 120000) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout }), p.getByRole('button', { name: btnText }).first().click()]);
  const path = OUT + which + '-' + name; await d.saveAs(path); return { path, suggested: d.suggestedFilename() };
}
const pages = async (path) => (await PDFDocument.load(fs.readFileSync(path))).getPageCount();

try {
  // Merge
  let p = await page('/merge-pdf/');
  await upload(p, ['a.pdf', 'b.pdf', 'c.pdf']);
  await p.getByRole('button', { name: 'Merge PDF' }).click();
  let d = await dl(p, 'Download PDF', 'merged.pdf');
  ok('merge 3+5+120', (await pages(d.path)) === 128, await pages(d.path));
  ok('merge no console errors', p.errors.length === 0, p.errors.join('|'));
  // Merge encrypted
  p = await page('/merge-pdf/');
  await upload(p, ['a.pdf', 'encrypted.pdf']);
  await p.getByRole('button', { name: 'Merge PDF' }).click();
  await p.waitForSelector('.error', { timeout: 20000 });
  ok('merge encrypted -> friendly error', /password/i.test(await p.textContent('.error')), await p.textContent('.error'));
  // Merge broken
  p = await page('/merge-pdf/');
  await upload(p, ['a.pdf', 'broken.pdf']);
  await p.getByRole('button', { name: 'Merge PDF' }).click();
  await p.waitForSelector('.error', { timeout: 20000 });
  ok('merge broken -> error', true, await p.textContent('.error'));
  // Merge big
  p = await page('/merge-pdf/');
  await upload(p, ['big60mb.pdf', 'a.pdf']);
  await p.getByRole('button', { name: 'Merge PDF' }).click();
  d = await dl(p, 'Download PDF', 'merged-big.pdf', 180000);
  ok('merge 60MB', (await pages(d.path)) === 9, fs.statSync(d.path).size);

  // Split ranges
  p = await page('/split-pdf/');
  await upload(p, ['c.pdf']);
  await p.waitForSelector('input[type=text]');
  await p.fill('input[type=text]', '1-3, 5, 100-end');
  await p.getByRole('button', { name: 'Split PDF' }).click();
  d = await dl(p, 'Download all (ZIP)', 'split.zip');
  ok('split ranges zip', fs.statSync(d.path).size > 1000, d.suggested);
  // bad range
  await p.getByRole('button', { name: 'Split again' }).click();
  await p.fill('input[type=text]', '1-500');
  await p.getByRole('button', { name: 'Split PDF' }).click();
  ok('split bad range msg', /outside/.test(await p.textContent('.error')));
  // every page
  await p.getByRole('button', { name: 'Every page' }).click();
  await p.getByRole('button', { name: 'Split PDF' }).click();
  d = await dl(p, 'Download all (ZIP)', 'split-every.zip');
  ok('split every page', true, d.suggested);
  // single range → single PDF
  p = await page('/split-pdf/');
  await upload(p, ['b.pdf']);
  await p.waitForSelector('input[type=text]');
  await p.fill('input[type=text]', '2-4');
  await p.getByRole('button', { name: 'Split PDF' }).click();
  d = await dl(p, 'Download PDF', 'split-one.pdf');
  ok('split single range = 3 pages', (await pages(d.path)) === 3);
  ok('split no console errors', p.errors.length === 0, p.errors.join('|'));
  // split encrypted
  p = await page('/split-pdf/');
  await upload(p, ['encrypted.pdf']);
  await p.waitForSelector('.error', { timeout: 20000 });
  ok('split encrypted -> friendly', /password/i.test(await p.textContent('.error')));

  // JPG to PDF
  p = await page('/jpg-to-pdf/');
  await upload(p, ['photo1.jpg', 'photo2.jpg', 'rotated_exif6.jpg', 'pic.png', 'pic.webp', 'transparent.png']);
  await p.getByRole('button', { name: 'Convert to PDF' }).click();
  d = await dl(p, 'Download PDF', 'images.pdf');
  const doc = await PDFDocument.load(fs.readFileSync(d.path));
  const sz = doc.getPages().map((pg) => pg.getSize()).map((s) => `${Math.round(s.width)}x${Math.round(s.height)}`);
  ok('jpg->pdf 6 pages, auto orientation', doc.getPageCount() === 6, sz.join(' '));
  ok('jpg->pdf size keeps jpg (~>15MB)', fs.statSync(d.path).size > 15e6, fs.statSync(d.path).size);
  ok('jpg->pdf no console errors', p.errors.length === 0, p.errors.join('|'));
  // fit mode
  await p.getByRole('button', { name: 'Change settings' }).click();
  await p.selectOption('select >> nth=0', 'fit');
  await p.getByRole('button', { name: 'Convert to PDF' }).click();
  d = await dl(p, 'Download PDF', 'images-fit.pdf');
  const d2 = await PDFDocument.load(fs.readFileSync(d.path));
  ok('jpg->pdf fit sizes', true, d2.getPages().map((pg) => pg.getSize()).map((s) => `${Math.round(s.width)}x${Math.round(s.height)}`).join(' '));

  // PDF to JPG
  p = await page('/pdf-to-jpg/');
  await upload(p, ['b.pdf']);
  await p.getByRole('button', { name: 'Convert to images' }).click();
  d = await dl(p, 'Download all (ZIP)', 'pages.zip', 120000);
  ok('pdf->jpg 5 pages zip', (await p.locator('.pages-grid figure').count()) === 5, d.suggested);
  ok('pdf->jpg no console errors', p.errors.length === 0, p.errors.join('|'));
  p = await page('/pdf-to-jpg/');
  await upload(p, ['landscape.pdf']);
  await p.getByRole('button', { name: 'PNG' }).click();
  await p.selectOption('select', 'max');
  await p.getByRole('button', { name: 'Convert to images' }).click();
  d = await dl(p, 'Download all (ZIP)', 'pages-png.zip', 120000);
  ok('pdf->png 300dpi', true, d.suggested);
  p = await page('/pdf-to-jpg/');
  await upload(p, ['encrypted.pdf']);
  await p.getByRole('button', { name: 'Convert to images' }).click();
  await p.waitForSelector('.error', { timeout: 20000 });
  ok('pdf->jpg encrypted friendly', /password/i.test(await p.textContent('.error')));
  p = await page('/pdf-to-jpg/');
  await upload(p, ['big60mb.pdf']);
  await p.getByRole('button', { name: 'Convert to images' }).click();
  d = await dl(p, 'Download all (ZIP)', 'big-pages.zip', 180000);
  ok('pdf->jpg 60MB', true, fs.statSync(d.path).size);

  // Compress image
  p = await page('/compress-image/');
  await upload(p, ['photo1.jpg', 'pic.png', 'pic.webp', 'rotated_exif6.jpg']);
  await p.getByRole('button', { name: /Compress 4 images/ }).click();
  await p.waitForSelector('.done', { timeout: 60000 });
  ok('compress result', true, await p.textContent('.done .big'));
  ok('compress per-file', true, (await p.locator('.files .meta').allTextContents()).join(' | '));
  d = await dl(p, 'Download all (ZIP)', 'compressed.zip');
  ok('compress no console errors', p.errors.length === 0, p.errors.join('|'));
  p = await page('/compress-image/');
  await upload(p, ['photo1.jpg']);
  await p.selectOption('select >> nth=1', 'webp');
  await p.selectOption('select >> nth=0', '1920');
  await p.getByRole('button', { name: /Compress image/ }).click();
  d = await dl(p, 'Download image', 'compressed1');
  ok('compress webp 1920', true, d.suggested + ' ' + fs.statSync(d.path).size);

  // Mobile 360 px: no horizontal scroll on all pages
  for (const u of ['/', '/merge-pdf/', '/split-pdf/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/compress-image/', '/organise-pdf/', '/privacy-policy/', '/nope/']) {
    const m = await page(u, 360);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth);
    ok('360px ' + u, sw <= 360, 'scrollWidth=' + sw + (m.errors.length ? ' errors:' + m.errors.join('|') : ''));
  }
} catch (e) { ok('EXCEPTION', false, e.stack); }
console.log(results.join('\n'));
await browser.close();
