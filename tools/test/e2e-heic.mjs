import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/';
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u) { const p = await (await b.newContext({ acceptDownloads: true })).newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => m.type() === 'error' && !/TUNNEL|googletag/.test(m.text()) && p.errors.push(m.text())); await p.goto('http://localhost:4321' + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
try {
  let p = await page('/heic-to-jpg/'); await p.setInputFiles('input[type=file]', [T + 'iphone.heic', T + 'iphone2.heic']);
  await p.getByRole('button', { name: /Convert 2 images/ }).click(); await p.waitForSelector('.done', { timeout: 90000 });
  ok('heic→jpg', true, (await p.locator('.files .meta').allTextContents()).join(' | ')); ok('errors', !p.errors.length, p.errors.join());
  const [d] = await Promise.all([p.waitForEvent('download'), p.locator('.files .mini').first().click()]); await d.saveAs('/tmp/testout/heic.jpg');
  const head = fs.readFileSync('/tmp/testout/heic.jpg').subarray(0, 3); ok('is jpeg', head[0] === 0xff && head[1] === 0xd8);
  p = await page('/compress-image-to-50kb/'); await p.setInputFiles('input[type=file]', [T + 'iphone.heic']);
  await p.getByRole('button', { name: /Compress image/ }).click(); await p.waitForSelector('.done', { timeout: 90000 }); ok('heic → 50KB', true, await p.textContent('.files .meta'));
  p = await page('/jpg-to-pdf/'); await p.setInputFiles('input[type=file]', [T + 'iphone.heic']);
  await p.getByRole('button', { name: 'Convert to PDF' }).click(); await p.waitForSelector('.done', { timeout: 90000 }); ok('heic → pdf', true, await p.textContent('.done .status'));
  p = await page('/compress-image/'); await p.setInputFiles('input[type=file]', [T + 'iphone.heic']);
  await p.getByRole('button', { name: /Compress image/ }).click(); await p.waitForSelector('.done', { timeout: 90000 }); ok('compress heic', true, await p.textContent('.files .meta')); ok('errors2', !p.errors.length, p.errors.join());
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
