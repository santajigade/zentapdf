import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/';
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const p = await (await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 900 } })).newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => m.type() === 'error' && !/TUNNEL|googletag/.test(m.text()) && p.errors.push(m.text())); await p.goto('http://localhost:4321' + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function dl(p, name, f) { const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name }).first().click()]); await d.saveAs(OUT + f); return { path: OUT + f, s: d.suggestedFilename() }; }
try {
  let p = await page('/qr-code-generator/'); await p.waitForTimeout(800);
  let d = await dl(p, 'Download PNG', 'qr.png'); ok('qr png', fs.statSync(d.path).size > 1000);
  await p.getByRole('button', { name: 'Wi-Fi' }).click(); await p.fill('input >> nth=0', 'HomeNet'); await p.fill('input >> nth=1', 'pass1234'); await p.waitForTimeout(400);
  d = await dl(p, 'SVG', 'qr.svg'); ok('qr svg', fs.readFileSync(d.path, 'utf8').includes('<svg'));
  await p.getByRole('button', { name: 'Text', exact: true }).click(); await p.fill('textarea', 'x'.repeat(4000)); await p.waitForTimeout(500);
  ok('qr too long msg', /too much/i.test(await p.textContent('.error')));
  ok('qr errors', !p.errors.length, p.errors.join());


  // barcode
  p = await page('/barcode-generator/'); await p.waitForTimeout(600); d = await dl(p, 'Download PNG', 'bar.png'); ok('barcode png', fs.statSync(d.path).size > 500);
  await p.selectOption('select >> nth=0', 'EAN13'); await p.fill('input[type=text]', '12ab'); await p.waitForTimeout(400); ok('ean invalid msg', /not valid/.test(await p.textContent('.error')));
  await p.fill('input[type=text]', '890123456789'); await p.waitForTimeout(400); d = await dl(p, 'Download SVG', 'ean.svg'); ok('ean svg', fs.readFileSync(d.path, 'utf8').includes('<svg'));
  ok('barcode errors', !p.errors.length, p.errors.join());
  // favicon
  p = await page('/favicon-generator/'); await p.setInputFiles('input[type=file]', [T + 'transparent.png']); d = await dl(p, /favicon package/, 'fav.zip'); ok('favicon zip', d.s === 'favicon-package.zip' && fs.statSync(d.path).size > 1000);
  p = await page('/png-to-ico/'); await p.setInputFiles('input[type=file]', [T + 'pic.png']); d = await dl(p, 'Download ICO', 'x.ico');
  const ico = fs.readFileSync(d.path); ok('ico header', ico[2] === 1 && ico.readUInt16LE(4) === 3, 'count ' + ico.readUInt16LE(4));
  // exif
  p = await page('/exif-viewer/'); await p.setInputFiles('input[type=file]', [T + 'gps.jpg', T + 'pic.png']); await p.waitForTimeout(1500);
  const txt = await p.textContent('.tool-box'); ok('exif reads gps', /Location found: 18\.5/.test(txt) && /TestPhone/.test(txt), txt.match(/Location found[^—]*/)?.[0]);
  await p.getByRole('button', { name: 'Remove all metadata' }).click(); await p.waitForSelector('text=Download all (ZIP)');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download clean photo/ }).first().click()]); await d2.saveAs(OUT + 'clean.jpg');
  const exifr = (await import('exifr')).default; const after = await exifr.parse(fs.readFileSync(OUT + 'clean.jpg')).catch(() => null);
  ok('exif removed', !after || !after.latitude, JSON.stringify(after)?.slice(0, 80)); ok('exif errors', !p.errors.length, p.errors.join());
  // sticker
  p = await page('/whatsapp-sticker-maker/'); await p.setInputFiles('input[type=file]', [T + 'photo1.jpg', T + 'transparent.png']); await p.fill('.opts input[type=text]', 'Hello!');
  await p.getByRole('button', { name: /Make 2 images/ }).click(); await p.waitForSelector('.done');
  const [d3] = await Promise.all([p.waitForEvent('download'), p.locator('.files .dl-file').first().click()]); await d3.saveAs(OUT + 'st.webp');
  const st = fs.readFileSync(OUT + 'st.webp'); ok('sticker webp <100KB', st.toString('ascii', 8, 12) === 'WEBP' && st.length < 100 * 1024, st.length);
  ok('sticker errors', !p.errors.length, p.errors.join());
  for (const u of ['/', '/qr-code-generator/', '/barcode-generator/', '/exif-viewer/', '/whatsapp-sticker-maker/', '/favicon-generator/', '/utility-tools/']) {
    const m = await (await b.newContext({ viewport: { width: 360, height: 800 } })).newPage(); await m.goto('http://localhost:4321' + u); await m.waitForTimeout(400);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok('360 ' + u, sw <= 360, sw);
  }
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
