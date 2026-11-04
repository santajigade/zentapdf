import { createRequire } from 'module'; const require = createRequire('/home/claude/zentapdf/'); const { chromium } = require('playwright');
import { execSync } from 'child_process';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 1000 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4321/sign-pdf/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
await p.setInputFiles('input[type=file]', ['/home/claude/testfiles/real/kdf-kdg-9-gb-flow.pdf']);
await p.waitForSelector('.sigpad'); await p.waitForTimeout(400);
// draw
const c = await p.locator('.sp-canvas').boundingBox();
await p.mouse.move(c.x + 60, c.y + c.height * 0.6); await p.mouse.down();
for (let i = 0; i < 40; i++) await p.mouse.move(c.x + 60 + i * 12, c.y + c.height * (0.55 + 0.15 * Math.sin(i / 3)));
await p.mouse.up();
await p.screenshot({ path: '/tmp/sig-draw.png', clip: await p.locator('.sigpad').boundingBox() });
await p.getByRole('button', { name: 'Use signature' }).click();
ok('signature placed', (await p.locator('[data-obj] img').count()) === 1);
// all pages
await p.getByRole('button', { name: /All pages/ }).click();
ok('on all pages', (await p.locator('[data-obj] img').count()) === 4, await p.locator('[data-obj] img').count());
// saved
await p.getByRole('button', { name: /^Sign$/ }).click(); await p.waitForSelector('.sigpad');
ok('saved signature shown', (await p.locator('.sp-saved img').count()) === 1);
// typed initials
await p.keyboard.press('Escape'); await p.locator('.sp-head .mini').click();
await p.getByRole('button', { name: /Initials/ }).click(); await p.waitForSelector('.sigpad');
await p.getByRole('button', { name: 'Type' }).click(); await p.fill('.sp-type input', 'S.G.'); await p.locator('.sp-fonts button').nth(1).click(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/sig-type.png', clip: await p.locator('.sigpad').boundingBox() });
await p.getByRole('button', { name: 'Use initials' }).click();
// photo upload
await p.getByRole('button', { name: /^Sign$/ }).click(); await p.waitForSelector('.sigpad');
await p.getByRole('button', { name: 'Upload photo' }).click(); await p.setInputFiles('.sigpad input[type=file]', '' + (process.env.TESTFILES || '/home/claude/testfiles/') + 'sigphoto.jpg'); await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/sig-photo.png', clip: await p.locator('.sigpad').boundingBox() });
await p.getByRole('button', { name: 'Use signature' }).click();
ok('images now', (await p.locator('[data-obj] img').count()) === 6, await p.locator('[data-obj] img').count());
await p.getByRole('button', { name: 'Save PDF' }).first().click();
const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: 'Download PDF' }).click()]); await d.saveAs('/tmp/testout/signed.pdf');
const imgs = execSync('pdfimages -list /tmp/testout/signed.pdf | tail -n +3 | wc -l').toString().trim();
ok('saved pdf', true, 'images ' + imgs);
ok('no errors', !errs.length, errs.join('|'));
await b.close();
