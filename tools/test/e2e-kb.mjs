import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/';
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u) { const p = await (await b.newContext({ acceptDownloads: true })).newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); await p.goto('http://localhost:4321' + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
try {
  for (const kb of [20, 50, 100]) {
    const p = await page(`/compress-image-to-${kb}kb/`); await p.setInputFiles('input[type=file]', [T + 'photo1.jpg', T + 'pic.png']);
    await p.getByRole('button', { name: /Compress 2 images/ }).click(); await p.waitForSelector('.done', { timeout: 60000 });
    const metas = await p.locator('.files .meta').allTextContents();
    const [d] = await Promise.all([p.waitForEvent('download'), p.locator('.files .mini').first().click()]); const f = '/tmp/testout/kb' + kb + '.jpg'; await d.saveAs(f);
    ok(`${kb}KB`, fs.statSync(f).size <= kb * 1024, fs.statSync(f).size + ' | ' + metas.join(' | '));
  }
  const p = await page('/reduce-image-size-in-kb/'); await p.setInputFiles('input[type=file]', [T + 'photo1.jpg']);
  await p.fill('.opts input[type=number] >> nth=0', '30'); await p.fill('.opts input[type=number] >> nth=1', '200'); await p.fill('.opts input[type=number] >> nth=2', '230');
  await p.getByRole('button', { name: /Compress image/ }).click(); await p.waitForSelector('.done');
  ok('custom 30KB 200x230', /200×230/.test(await p.textContent('.files .meta')), await p.textContent('.files .meta')); ok('errors', !p.errors.length, p.errors.join());
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
