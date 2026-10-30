import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/'; fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:4321'; const b = await chromium.launch(); const res = [];
const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
async function page(u, w = 1280) { const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: 1000 } }); const p = await c.newPage(); p.errors = []; p.on('console', m => m.type() === 'error' && !/TUNNEL|googletagmanager/.test(m.text()) && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e))); await p.goto(B + u); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }); return p; }
async function run(u, file, out, w = 1280) {
  const p = await page(u, w);
  await p.setInputFiles('input[type=file]', [T + file]); await p.waitForSelector('[data-page="0"]'); await p.waitForTimeout(800);
  const pg = p.locator('[data-page="0"]'); const bb = await pg.boundingBox();
  if (u.includes('sign')) { await p.getByRole('button', { name: 'Type', exact: true }).click(); await p.fill('[role=dialog] input[type=text]', 'Santaji Gade'); await p.getByRole('button', { name: 'Use signature' }).click(); }
  const at = (fx, fy) => [bb.x + bb.width * fx, bb.y + bb.height * fy];
  // white-out over the "x page 1" title area, then text on top
  await p.getByRole('button', { name: /White-out/ }).click();
  let [x, y] = at(0.06, 0.06); await p.mouse.move(x, y); await p.mouse.down(); [x, y] = at(0.45, 0.12); await p.mouse.move(x, y, { steps: 4 }); await p.mouse.up();
  await p.getByRole('button', { name: /Add text/ }).click();
  [x, y] = at(0.1, 0.1); await p.mouse.click(x, y); await p.keyboard.type('Edited by ZentaPDF'); await p.mouse.click(...at(0.8, 0.5));
  await p.getByRole('button', { name: /Highlight/ }).click();
  [x, y] = at(0.1, 0.3); await p.mouse.move(x, y); await p.mouse.down(); [x, y] = at(0.6, 0.34); await p.mouse.move(x, y, { steps: 3 }); await p.mouse.up();
  await p.getByRole('button', { name: /Box|Rectangle/ }).click();
  [x, y] = at(0.1, 0.45); await p.mouse.move(x, y); await p.mouse.down(); [x, y] = at(0.5, 0.55); await p.mouse.move(x, y, { steps: 3 }); await p.mouse.up();
  await p.getByRole('button', { name: /^Draw/ }).click();
  [x, y] = at(0.6, 0.45); await p.mouse.move(x, y); await p.mouse.down(); for (let k = 0; k < 10; k++) { [x, y] = at(0.6 + k * 0.03, 0.45 + (k % 2) * 0.05); await p.mouse.move(x, y); } await p.mouse.up();
  if (!u.includes('sign')) { await p.getByRole('button', { name: /Sign/ }).first().click();
  await p.getByRole('button', { name: 'Type', exact: true }).click(); await p.fill('[role=dialog] input[type=text]', 'Santaji Gade');
  await p.getByRole('button', { name: 'Use signature' }).click(); }
  await p.setInputFiles('[role=toolbar] input[type=file]', [T + 'transparent.png']);
  // move the image a bit
  await p.getByRole('button', { name: /Move|Select/ }).click();
  const img = p.locator('[data-page="0"] [data-obj] img').last(); const ib = await img.boundingBox();
  await p.mouse.move(ib.x + 10, ib.y + 10); await p.mouse.down(); await p.mouse.move(ib.x + 10, ib.y + 160, { steps: 4 }); await p.mouse.up();
  await p.getByRole('button', { name: 'Save PDF' }).first().click();
  const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download PDF' }).click()]);
  await d.saveAs(OUT + out);
  const doc = await PDFDocument.load(fs.readFileSync(OUT + out));
  ok(`${u} ${file} saved`, doc.getPageCount() > 0, fs.statSync(OUT + out).size);
  ok(`${u} errors`, !p.errors.length, p.errors.join());
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`${u} width ${w}`, sw <= w, sw);
}
try {
  await run('/edit-pdf/', 'b.pdf', 'edited.pdf');
  await run('/edit-pdf/', 'rot.pdf', 'edited-rot.pdf').catch(e => ok('rot', false, e.message));
  await run('/sign-pdf/', 'a.pdf', 'signed.pdf', 390);
} catch (e) { ok('EXC', false, e.stack); }
console.log(res.join('\n')); await b.close();
