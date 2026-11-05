// Tool screenshots for guides (public/guides/img/<slug>.webp). Guide thumbnails: tools/og/make-guide-og.mjs. Old OG part kept below (public/guides/img/<slug>.webp).
// Usage: npx astro preview --port 4321 &  then  node tools/og/make-guide-images.mjs [testfiles-dir]
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const T = (process.argv[2] || '/home/claude/testfiles') + '/';
const logo = fs.readFileSync(ROOT + '/tools/og/logo-white.svg', 'utf8').replace(/width="([\d.]+)" height="64"/, (m, W) => `width="${W * 60 / 64}" height="60"`);
const guides = fs.readdirSync(ROOT + '/src/content/guides').filter((f) => f.endsWith('.md')).map((f) => {
  const src = fs.readFileSync(ROOT + '/src/content/guides/' + f, 'utf8');
  return { slug: f.replace('.md', ''), h1: src.match(/^h1:\s*"(.*)"/m)[1] };
});
const b = await chromium.launch();
// 1) OG images
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const g of guides) {
  await p.setContent(`<html><body style="margin:0"><div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:radial-gradient(circle at 85% 15%,#818CF8 0,transparent 45%),linear-gradient(130deg,#3730A3,#4F46E5 50%,#6366F1)">
    <div style="position:absolute;inset:0;background-image:radial-gradient(rgb(255 255 255 / .08) 2px,transparent 2px);background-size:30px 30px"></div>
    <div style="position:absolute;left:70px;top:60px">${logo}</div>
    <div style="position:absolute;left:70px;right:70px;top:170px">
      <div style="display:inline-block;background:rgb(255 255 255 / .18);border:1px solid rgb(255 255 255 / .35);border-radius:999px;padding:6px 18px;font-size:22px;font-weight:700;letter-spacing:.08em">GUIDE</div>
      <div style="font-size:${g.h1.length > 70 ? 54 : 62}px;font-weight:800;line-height:1.12;letter-spacing:-.02em;margin-top:24px">${g.h1}</div>
    </div>
    <div style="position:absolute;left:70px;bottom:56px;font-size:26px;opacity:.92">Free · No sign-up · No watermark</div>
    <div style="position:absolute;right:70px;bottom:46px;background:#fff;color:#4F46E5;border-radius:999px;padding:10px 26px;font-size:26px;font-weight:800">zentapdf.com</div>
  </div></body></html>`);
  const out = `${ROOT}/public/og/guides/${g.slug}.png`;
  await p.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${out}').convert('RGB').quantize(colors=200, method=2); im.save('${out}', optimize=True)`]);
}
// 2) Screenshots of the tools in use
const B = 'http://localhost:4321';
async function shot(slug, url, setup, sel = '.tool-box') {
  const c = await b.newContext({ viewport: { width: 1180, height: 1300 }, deviceScaleFactor: 1 });
  const q = await c.newPage(); await q.goto(B + url);
  if (url !== '/image-converter/') await q.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
  if (setup) await setup(q);
  await q.waitForTimeout(600);
  const png = `/tmp/${slug}.png`;
  if (sel === 'editor') { const tb = await q.locator('[role=toolbar]').boundingBox(); await q.screenshot({ path: png, clip: { x: Math.max(0, tb.x - 10), y: tb.y - 10, width: Math.min(1180, tb.width + 20), height: slug.includes('sign') ? 940 : 640 } }); }
  else { const el = await q.$(sel); await el.screenshot({ path: png }); }
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${png}').convert('RGB'); im.thumbnail((1100, 900)); im.save('${ROOT}/public/guides/img/${slug}.webp', 'WEBP', quality=80)`]);
  await c.close();
}
const files = (q, list) => q.setInputFiles('input[type=file] >> nth=0', list.map((f) => T + f));
await shot('how-to-compress-pdf-for-email', '/compress-pdf/', (q) => files(q, ['photos.pdf']));
await shot('how-to-sign-pdf-without-printing', '/sign-pdf/', async (q) => { await files(q, ['a.pdf']); await q.getByRole('button', { name: 'Type', exact: true }).click(); await q.fill('[role=dialog] input[type=text]', 'Santaji Gade'); await q.getByRole('button', { name: 'Use signature' }).click(); }, 'editor');
await shot('how-to-edit-text-in-pdf-free', '/edit-pdf/', async (q) => { await files(q, ['doc.pdf']); await q.waitForSelector('.ti'); for (let k = 0; k < 12; k++) { const t = q.locator('.ti').nth(k); const bb = await t.boundingBox(); if (!bb) continue; await t.click({ position: { x: 3, y: bb.height / 2 } }); await q.waitForTimeout(500); const txt = await q.evaluate(() => document.activeElement?.innerText || ''); if (txt.includes('Initial release')) { await q.keyboard.press('Control+A'); await q.keyboard.type('Second release'); break; } await q.keyboard.press('Escape'); await q.getByRole('button', { name: /Undo/ }).click(); } }, 'editor');
await shot('how-to-merge-pdf-files', '/merge-pdf/', (q) => files(q, ['a.pdf', 'b.pdf', 'c.pdf']));
await shot('how-to-password-protect-pdf', '/protect-pdf/', async (q) => { await files(q, ['b.pdf']); await q.fill('input[type=password] >> nth=0', 'Mango-River-2026'); await q.fill('input[type=password] >> nth=1', 'Mango-River-2026'); });
await shot('how-to-convert-png-to-jpg', '/png-to-jpg/', (q) => files(q, ['pic.png', 'transparent.png']));
await shot('how-to-reduce-image-size-in-kb', '/reduce-image-size-in-kb/', (q) => files(q, ['photo1.jpg']));
await shot('how-to-remove-pages-from-pdf', '/remove-pages/', async (q) => { await files(q, ['b.pdf']); await q.waitForFunction(() => document.querySelectorAll('.pages-grid img').length >= 5); await q.locator('.pages-grid figure').nth(1).click(); await q.locator('.pages-grid figure').nth(3).click(); });
await shot('jpg-vs-png-vs-webp', '/image-converter/', null, '.cat-band');
await shot('compress-pdf-to-100kb', '/compress-pdf/', async (q) => { await files(q, ['photos.pdf']); await q.getByRole('radio', { name: /Strong/ }).click(); });
await shot('passport-size-photo-for-online-forms', '/reduce-image-size-in-kb/', async (q) => { await files(q, ['photo2.jpg']); await q.fill('.opts input[type=number] >> nth=1', '413'); await q.fill('.opts input[type=number] >> nth=2', '531'); });
await shot('scan-documents-to-pdf-with-phone', '/images-to-pdf/', (q) => files(q, ['photo2.jpg', 'rotated_exif6.jpg', 'pic.png']));
await shot('how-to-convert-heic-to-jpg', '/heic-to-jpg/', (q) => files(q, ['iphone.heic', 'iphone2.heic']));
await shot('how-to-unlock-pdf', '/unlock-pdf/', async (q) => { await files(q, ['prot.pdf']); await q.waitForSelector('input[type=password]', { timeout: 30000 }); await q.fill('input[type=password]', 'secret1'); });
await shot('aadhaar-card-pdf-password', '/unlock-pdf/', async (q) => { await files(q, ['e-aadhaar.pdf']); await q.waitForSelector('input[type=password]', { timeout: 30000 }); await q.fill('input[type=password]', 'RAHU1995'); });
await shot('how-to-repair-corrupted-pdf', '/repair-pdf/', async (q) => { await files(q, ['plus/truncated.pdf']); await q.waitForSelector('.plus-report', { timeout: 30000 }); });
await b.close(); console.log('done', guides.length);
