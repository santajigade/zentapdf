import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const T = process.env.TESTFILES || '/home/claude/testfiles/';
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u) { const p = await (await b.newContext({ acceptDownloads: true })).newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); await p.goto('http://localhost:4321' + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
try {
  let p = await page('/png-to-jpg/');
  await p.setInputFiles('input[type=file]', ['pic.png', 'pic2.png', 'transparent.png', 't2.png', 'pic.png', 'pic2.png'].map(f => T + f));
  ok('limit 5 message', /up to 5/.test(await p.textContent('.error')), await p.locator('.files li').count());
  await p.getByRole('button', { name: /Convert 5 images/ }).click(); await p.waitForSelector('.done');
  const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download all (ZIP)' }).click()]);
  ok('png→jpg zip', d.suggestedFilename() === 'png-to-jpg.zip'); ok('no add-more at 5', !(await p.getByRole('button', { name: /Add more/ }).count()));
  ok('errors', !p.errors.length, p.errors.join());
  for (const [u, f] of [['/webp-to-png/', 'pic.webp'], ['/jpg-to-webp/', 'photo1.jpg'], ['/svg-to-png/', 'logo.svg'], ['/avif-to-jpg/', 'pic.webp'], ['/gif-to-png/', 'pic.png']]) {
    p = await page(u); await p.setInputFiles('input[type=file]', [T + f]);
    await p.getByRole('button', { name: /Convert image/ }).click(); await p.waitForSelector('.done, .files .meta span');
    ok(u, !!(await p.locator('.done').count()), (await p.locator('.files .meta').allTextContents()).join());
  }
  p = await (await b.newContext()).newPage(); await p.goto('http://localhost:4321/image-converter/'); ok('category page', (await p.locator('.card').count()) === 16);
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
