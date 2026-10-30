import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/'; fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321'; const b = await chromium.launch(); const res = [];
const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await c.newPage(); p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e))); await p.goto(B + u); if (u.includes('-image') || u.includes('base64')) await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function dl(p, name, f) { const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name }).first().click()]); const path = OUT + f; await d.saveAs(path); return { path, s: d.suggestedFilename() }; }
const dims = async (p, path) => p.evaluate(async (b64) => { const r = await fetch('data:image/*;base64,' + b64); const bm = await createImageBitmap(await r.blob()); return bm.width + 'x' + bm.height; }, fs.readFileSync(path).toString('base64'));
try {
  let p = await page('/resize-image/');
  await p.setInputFiles('input[type=file]', [T + 'photo1.jpg', T + 'pic.png', T + 'rotated_exif6.jpg']);
  await p.getByRole('button', { name: /Resize 3 images/ }).click();
  await p.waitForSelector('.done');
  ok('resize info', true, (await p.locator('.files .meta').allTextContents()).join(' | '));
  let d = await dl(p, 'Download all (ZIP)', 'r.zip'); ok('resize zip', fs.statSync(d.path).size > 1000);
  ok('resize errors', !p.errors.length, p.errors.join());

  p = await page('/convert-image/');
  await p.setInputFiles('input[type=file]', [T + 'pic.webp', T + 'transparent.png']);
  await p.getByRole('button', { name: 'PNG', exact: true }).click();
  await p.getByRole('button', { name: 'WebP', exact: true }).click();
  ok('avif enabled?', true, String(await p.getByRole('button', { name: 'AVIF' }).isEnabled()));
  await p.getByRole('button', { name: /Convert 2 images/ }).click(); await p.waitForSelector('.done');
  d = await dl(p, 'Download all (ZIP)', 'c.zip'); ok('convert', true, (await p.locator('.files .meta').allTextContents()).join(' | '));
  ok('convert errors', !p.errors.length, p.errors.join());

  p = await page('/rotate-image/');
  await p.setInputFiles('input[type=file]', [T + 'pic.png']);
  await p.getByRole('button', { name: /Rotate right/ }).click(); // 180
  await p.getByRole('button', { name: /Rotate image/ }).click(); await p.waitForSelector('.done');
  d = await dl(p, 'Download image', 'rot.png'); ok('rotate 1600x1200 @180', (await dims(p, d.path)) === '1600x1200', await dims(p, d.path));
  await p.getByRole('button', { name: 'Start over' }).click();
  await p.setInputFiles('input[type=file]', [T + 'pic.png']);
  await p.getByRole('button', { name: /Rotate image/ }).click(); await p.waitForSelector('.done');
  d = await dl(p, 'Download image', 'rot2.png'); ok('rotate 180 kept after start over', (await dims(p, d.path)) === '1600x1200', await dims(p, d.path));
  ok('rotate errors', !p.errors.length, p.errors.join());

  p = await page('/crop-image/');
  await p.setInputFiles('input[type=file]', [T + 'pic.png']);
  await p.getByRole('button', { name: '16:9' }).click();
  const h = p.locator('[aria-label="Drag to resize"]'); const bb = await h.boundingBox();
  await p.mouse.move(bb.x + 10, bb.y + 10); await p.mouse.down(); await p.mouse.move(bb.x - 100, bb.y - 60, { steps: 5 }); await p.mouse.up();
  const area = p.locator('[aria-label="Crop area — drag to move"]'); const ab = await area.boundingBox();
  await p.mouse.move(ab.x + 40, ab.y + 40); await p.mouse.down(); await p.mouse.move(ab.x + 10, ab.y + 10, { steps: 5 }); await p.mouse.up();
  const vals = await p.locator('.opts input[type=number]').evaluateAll(els => els.map(e => e.value).join(','));
  await p.getByRole('button', { name: 'Crop image' }).click();
  d = await dl(p, 'Download image', 'crop.png'); const dd = await dims(p, d.path);
  const [W, H] = dd.split('x').map(Number);
  ok('crop 16:9', Math.abs(W / H - 16 / 9) < 0.02, dd + ' box=' + vals);
  ok('crop errors', !p.errors.length, p.errors.join());

  p = await page('/image-to-base64/');
  await p.setInputFiles('input[type=file]', [T + 'transparent.png']);
  const v = await p.inputValue('textarea'); ok('base64 uri', v.startsWith('data:image/png;base64,'), v.slice(0, 40));
  await p.getByRole('button', { name: 'CSS' }).click(); ok('base64 css', (await p.inputValue('textarea')).startsWith('background-image'));
  await p.getByRole('button', { name: 'Copy to clipboard' }).click(); await p.waitForTimeout(300); ok('copy', (await p.textContent('.tool-box .btn-primary')).includes('Copied'));
  ok('base64 errors', !p.errors.length, p.errors.join());

  for (const u of ['/resize-image/', '/crop-image/', '/convert-image/', '/rotate-image/', '/image-to-base64/', '/image-tools/']) {
    const m = await page(u, 360); if (u === '/crop-image/') { await m.setInputFiles('input[type=file]', [T + 'photo1.jpg']); await m.waitForTimeout(500); }
    if (u === '/rotate-image/' || u === '/convert-image/' || u === '/resize-image/') { await m.setInputFiles('input[type=file]', [T + 'photo1.jpg']); }
    const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok('360 ' + u, sw <= 360, sw);
  }
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
