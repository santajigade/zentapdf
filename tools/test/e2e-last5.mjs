import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 900 } }); const p = await c.newPage(); p.errors = []; p.on('console', m => m.type() === 'error' && !/TUNNEL|googletag/.test(m.text()) && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e))); await p.goto('http://localhost:4321' + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function dl(p, name, f) { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.getByRole('button', { name }).first().click()]); await d.saveAs(OUT + f); return OUT + f; }
try {
  // Images to PDF
  let p = await page('/images-to-pdf/'); await p.setInputFiles('input[type=file]', ['pic.png', 'pic.webp', 'rotated_exif6.jpg'].map(f => T + f));
  await p.getByRole('button', { name: 'Convert to PDF' }).click(); let f = await dl(p, 'Download PDF', 'imgs.pdf');
  ok('images-to-pdf 3 pages', (await PDFDocument.load(fs.readFileSync(f))).getPageCount() === 3); ok('images errors', !p.errors.length, p.errors.join());
  // PDF to Text
  p = await page('/pdf-to-text/'); await p.setInputFiles('input[type=file]', [T + 'doc.pdf']); await p.waitForSelector('textarea');
  const txt = await p.inputValue('textarea'); ok('pdf-to-text', /Initial release/.test(txt) && /Document Control/.test(txt), JSON.stringify(txt.slice(0, 80)));
  f = await dl(p, 'Download .txt', 'doc.txt'); ok('txt download', fs.readFileSync(f, 'utf8').includes('Initial release'));
  p = await page('/pdf-to-text/'); await p.setInputFiles('input[type=file]', [T + 'big60mb.pdf']); await p.waitForSelector('.error', { timeout: 60000 });
  ok('scan → no text msg', /scan/i.test(await p.textContent('.error')));
  // Compress (all three levels are worked out right after upload)
  const ready = (pg, ms = 180000) => pg.waitForFunction(() => [...document.querySelectorAll('.cmp-lv')].slice(0, 3).every((x) => x.querySelector('.r b, .r i.z')), null, { timeout: ms });
  p = await page('/compress-pdf/'); await p.setInputFiles('input[type=file]', [T + 'photos.pdf']); await ready(p);
  for (const lv of ['Light', 'Recommended', 'Strong']) {
    await p.getByRole('radio', { name: new RegExp(lv) }).click();
    f = await dl(p, 'Download PDF', `cmp-${lv}.pdf`); const d = await PDFDocument.load(fs.readFileSync(f));
    ok('compress ' + lv, d.getPageCount() === 3 && fs.statSync(f).size < fs.statSync(T + 'photos.pdf').size * 0.2, fs.statSync(f).size + ' | ' + (await p.textContent('.cmp-sum .status')));
  }
  ok('compress preview drawn', await p.evaluate(() => { const c = document.querySelector('.cmp-stack canvas'); return !!c && c.width > 100; }));
  ok('compress errors', !p.errors.length, p.errors.join());
  p = await page('/compress-pdf/'); await p.setInputFiles('input[type=file]', [T + 'big60mb.pdf']); await ready(p, 240000); ok('compress 60MB', true, await p.textContent('.cmp-levels'));
  p = await page('/compress-pdf/'); await p.setInputFiles('input[type=file]', [T + 'c.pdf']); await ready(p, 60000); ok('compress text-only', true, await p.textContent('.cmp-levels'));
  // many files + a PDF locked against editing → ZIP
  p = await page('/compress-pdf/'); await p.setInputFiles('input[type=file]', [T + 'photos.pdf', T + 'real/kdf-kdg-9-gb-flow.pdf', T + 'cmp/canva.pdf']);
  await p.waitForFunction(() => document.querySelectorAll('.cmp-files li').length === 3 && ![...document.querySelectorAll('.cmp-files li')].some((l) => /working|waiting|failed/.test(l.textContent)), null, { timeout: 240000 });
  f = await dl(p, /Download all/, 'cmp.zip'); const { unzipSync } = await import('fflate'); const z = unzipSync(fs.readFileSync(f));
  ok('compress batch zip', Object.keys(z).length === 3 && Object.values(z).every((b) => b[0] === 0x25), Object.keys(z).join());
  // custom level
  await p.getByRole('radio', { name: /Custom/ }).click();
  await p.locator('.cmp-custom input[type=range]').first().evaluate((el) => { el.value = '72'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForFunction(() => document.querySelectorAll('.cmp-lv')[3].querySelector('.r b'), null, { timeout: 60000 });
  ok('compress custom', true, await p.textContent('.cmp-lv:nth-child(4) .r'));
  // Protect
  p = await page('/protect-pdf/'); await p.setInputFiles('input[type=file]', [T + 'b.pdf']);
  await p.fill('input[type=password] >> nth=0', 'secret1'); await p.fill('input[type=password] >> nth=1', 'secret1');
  await p.getByRole('button', { name: 'Protect PDF', exact: true }).click(); f = await dl(p, 'Download PDF', 'prot.pdf');
  let enc = false; try { await PDFDocument.load(fs.readFileSync(f)); } catch (e) { enc = /encrypt/i.test(e.message); }
  ok('protect → encrypted', enc); ok('protect errors', !p.errors.length, p.errors.join());
  fs.copyFileSync(f, T + 'prot.pdf');
  // mismatch
  p = await page('/protect-pdf/'); await p.setInputFiles('input[type=file]', [T + 'b.pdf']);
  await p.fill('input[type=password] >> nth=0', 'secret1'); await p.fill('input[type=password] >> nth=1', 'other'); await p.getByRole('button', { name: 'Protect PDF', exact: true }).click();
  ok('mismatch msg', /match/.test(await p.textContent('.error')));
  // already protected
  p = await page('/protect-pdf/'); await p.setInputFiles('input[type=file]', [T + 'encrypted.pdf']);
  await p.fill('input[type=password] >> nth=0', 'secret1'); await p.fill('input[type=password] >> nth=1', 'secret1'); await p.getByRole('button', { name: 'Protect PDF', exact: true }).click();
  await p.waitForSelector('.error', { timeout: 30000 }); ok('already protected msg', /already/.test(await p.textContent('.error')), await p.textContent('.error'));
  // Unlock: wrong then right
  p = await page('/unlock-pdf/'); await p.setInputFiles('input[type=file]', [T + 'prot.pdf']); await p.waitForSelector('input[type=password]', { timeout: 30000 });
  await p.fill('input[type=password]', 'nope'); await p.getByRole('button', { name: 'Unlock PDF', exact: true }).click(); await p.waitForSelector('.error');
  ok('wrong pw msg', /not correct/.test(await p.textContent('.error')));
  await p.fill('input[type=password]', 'secret1'); await p.getByRole('button', { name: 'Unlock PDF', exact: true }).click(); f = await dl(p, 'Download PDF', 'unl.pdf');
  ok('unlock → 5 pages readable', (await PDFDocument.load(fs.readFileSync(f))).getPageCount() === 5); ok('unlock errors', !p.errors.length, p.errors.join());
  // Unlock encrypted.pdf (user pw 'user123')
  p = await page('/unlock-pdf/'); await p.setInputFiles('input[type=file]', [T + 'encrypted.pdf']); await p.waitForSelector('input[type=password]', { timeout: 30000 });
  await p.fill('input[type=password]', 'user123'); await p.getByRole('button', { name: 'Unlock PDF', exact: true }).click(); f = await dl(p, 'Download PDF', 'unl2.pdf');
  ok('unlock qpdf-encrypted', (await PDFDocument.load(fs.readFileSync(f))).getPageCount() === 5);
  for (const u of ['/compress-pdf/', '/protect-pdf/', '/unlock-pdf/', '/pdf-to-text/', '/images-to-pdf/']) {
    const m = await page(u, 360); const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok('360 ' + u, sw <= 360, sw);
  }
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
