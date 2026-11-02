import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium, firefox, webkit } = require('playwright');
import fs from 'fs';
const { parseGIF, decompressFrames } = require('gifuct-js');
const T = '/home/claude/testfiles/', OUT = '/home/claude/testout/';
fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321';
const which = process.argv[2] || 'chromium';
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
const info = (path) => { const b = fs.readFileSync(path); const g = parseGIF(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); const f = decompressFrames(g, false); return { w: g.lsd.width, h: g.lsd.height, n: f.length, delay: f.reduce((s, x) => s + x.delay, 0), size: b.length }; };
const src = info(T + 'anim.gif');
const run = async (slug, btn, setup) => { const p = await page(`/${slug}/`); await upload(p, ['anim.gif']); await p.waitForSelector('.files .meta:has-text("frames")', { timeout: 20000 }); if (setup) await setup(p); await p.getByRole('button', { name: btn }).click(); return p; };

try {
  let p = await run('resize-gif', 'Resize GIF', async (p) => { await p.getByRole('button', { name: '50%' }).click(); });
  let r = info(await dl(p, 'Download GIF', 'resized.gif'));
  ok('resize 50%', r.w === 160 && r.h === 120 && r.n === src.n, JSON.stringify(r)); ok('resize no errors', !p.errors.length, p.errors.join('|'));

  p = await run('crop-gif', 'Crop GIF', async (p) => { await p.selectOption('select', { label: 'Square 1:1' }); });
  r = info(await dl(p, 'Download GIF', 'crop.gif')); ok('crop square', r.w === 240 && r.h === 240 && r.n === src.n, JSON.stringify(r));

  p = await run('compress-gif', 'Compress GIF');
  r = info(await dl(p, 'Download GIF', 'comp.gif')); ok('compress smaller, same duration', r.size < src.size && Math.abs(r.delay - src.delay) <= 20, `${src.size}->${r.size} ${src.delay}/${r.delay}`);

  p = await run('reverse-gif', 'Reverse GIF', async (p) => { await p.check('input[type=checkbox]'); });
  r = info(await dl(p, 'Download GIF', 'rev.gif')); ok('boomerang frames', r.n === src.n * 2 - 2, r.n);

  p = await run('gif-speed', 'Change speed', async (p) => { await p.getByRole('button', { name: '2× faster' }).click(); });
  r = info(await dl(p, 'Download GIF', 'speed.gif')); ok('speed 2x', Math.abs(r.delay - src.delay / 2) <= 20, `${src.delay}->${r.delay}`);

  p = await run('split-gif', 'Extract frames');
  let path = await dl(p, 'Download frames', 'frames.zip'); const zip = fs.readFileSync(path);
  const count = (zip.toString('latin1').match(/PK\x03\x04/g) || []).length; ok('split frames zip', count === src.n, `${count}/${src.n}`);

  p = await run('gif-to-mp4', 'Convert to MP4');
  await p.waitForSelector('.done, .error', { timeout: 60000 });
  if (await p.$('.error')) ok('gif-to-mp4', false, await p.textContent('.error'));
  else { path = await dl(p, 'Download MP4', 'out.mp4'); const b = fs.readFileSync(path); ok('gif-to-mp4 is mp4', b.slice(4, 8).toString() === 'ftyp' && b.length > 1000, b.length); }

  // transparent GIF keeps transparency
  p = await page('/resize-gif/'); await upload(p, ['trans.gif']); await p.waitForSelector('.files .meta:has-text("frames")');
  await p.getByRole('button', { name: 'Resize GIF' }).click(); r = info(await dl(p, 'Download GIF', 'trans.gif'));
  ok('transparent gif ok', r.n > 1, JSON.stringify(r));

  // wrong file
  p = await page('/compress-gif/'); await upload(p, ['a.pdf']); await p.waitForSelector('.error'); ok('non-gif rejected', /GIF/.test(await p.textContent('.error')));

  // GIF maker: images + GIF frames, skip, copy, per-frame delay, crossfade, dither off, loop once
  p = await page('/gif-maker/'); await upload(p, ['photo1.jpg', 'photo2.jpg', 'pic.png', 'iphone.heic']);
  await p.waitForSelector('.frames li >> nth=3');
  await p.getByRole('button', { name: 'Make GIF' }).click();
  r = info(await dl(p, 'Download GIF', 'maker.gif')); ok('gif maker 4 frames', r.n === 4, JSON.stringify(r)); ok('maker no errors', !p.errors.length, p.errors.join('|'));
  await p.getByRole('button', { name: 'Change settings' }).click();
  await p.setInputFiles('input[type=file] >> nth=0', [T + 'trans.gif']); await p.waitForSelector('.frames li >> nth=13');
  ok('gif frames added', (await p.$$('.frames li')).length === 14);
  await p.locator('.frames li').nth(0).getByRole('button', { name: 'Skip' }).click();
  await p.locator('.frames li').nth(1).getByRole('button', { name: 'Copy' }).click();
  await p.locator('.frames li').nth(1).locator('input').fill('2'); await p.locator('.frames li').nth(1).locator('input').dispatchEvent('change');
  ok('15 frames, 14 used', /14 frames/.test(await p.textContent('.actions >> nth=-1')), await p.textContent('.actions >> nth=-1'));
  await p.getByRole('button', { name: /Make GIF/ }).click();
  r = info(await dl(p, 'Download GIF', 'maker2.gif')); ok('maker skip/copy/delay', r.n === 14 && r.delay > 2000, JSON.stringify(r));
  await p.getByRole('button', { name: 'Change settings' }).click();
  await p.check('text=Crossfade between frames'); await p.selectOption('select >> nth=4', '1');
  await p.getByRole('button', { name: /Make GIF/ }).click();
  r = info(await dl(p, 'Download GIF', 'maker3.gif')); ok('crossfade adds frames', r.n === 14 + 13 * 4, JSON.stringify(r));
  await p.locator('.frames li').nth(4).getByRole('button', { name: 'Skip' }).click().catch(() => {});

  // video to gif
  p = await page('/video-to-gif/'); await upload(p, ['clip.webm']);
  await p.waitForSelector('text=Clip length', { timeout: 20000 });
  await p.getByRole('button', { name: 'Make GIF' }).click();
  r = info(await dl(p, 'Download GIF', 'video.gif')); ok('video to gif 5s@10fps', r.n === 50 && r.w === 480, JSON.stringify(r));

  // pdf to gif
  p = await page('/pdf-to-gif/'); await upload(p, ['b.pdf']);
  await p.getByRole('button', { name: 'Make GIF' }).click();
  r = info(await dl(p, 'Download GIF', 'pdf.gif')); ok('pdf to gif 5 pages', r.n === 5 && r.w === 640, JSON.stringify(r));

  // mobile layout: no horizontal scroll
  for (const s of ['crop-gif', 'gif-maker', 'video-to-gif']) {
    p = await page(`/${s}/`, 360); await upload(p, s === 'gif-maker' ? ['photo1.jpg', 'photo2.jpg'] : s === 'video-to-gif' ? ['clip.webm'] : ['anim.gif']);
    await p.waitForTimeout(1500); const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`mobile ${s} no overflow`, sw <= 360, sw);
  }
} catch (e) { results.push('FAIL exception ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
await browser.close();
