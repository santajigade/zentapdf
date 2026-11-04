// Edit PDF upgrade: whole-line edit on a coloured background, ₹ text, shapes, arrow, stamps, redo, duplicate, thumbnails
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import { execSync } from 'child_process';
const T = process.env.TESTFILES || '/home/claude/testfiles/';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const b = await chromium.launch(); const p = await (await b.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4321/edit-pdf/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
await p.setInputFiles('input[type=file]', [T + 'real/kdf-kdg-9-gb-flow.pdf']); await p.waitForSelector('.ti');
ok('thumbnails', (await p.locator('.ed-thumbs button').count()) === 4);
// 1) edit a whole line of existing text
const lines = await p.$$eval('.ti', (els) => els.map((e, i) => ({ i, w: e.getBoundingClientRect().width })));
const widest = lines.sort((a, c) => c.w - a.w)[3];
const ti = p.locator('.ti').nth(widest.i); await ti.click(); await p.waitForTimeout(400);
const before = await p.evaluate(() => document.activeElement?.innerText);
await p.keyboard.press('End'); await p.keyboard.type(' ZENTA');
ok('edit whole line', before && before.split(' ').length >= 3, JSON.stringify(before));
await p.mouse.click(1340, 990);
// 2) add text with the rupee sign
await p.getByRole('button', { name: /Add text/ }).click();
const pg = await p.locator('[data-page="0"]').boundingBox();
await p.mouse.click(pg.x + pg.width * 0.55, pg.y + pg.height * 0.12); await p.keyboard.type('Price ₹ 12,500 ✓'); await p.mouse.click(1340, 990);
// 3) ellipse, arrow, line
for (const [tool, x1, y1, x2, y2] of [['Circle', 0.1, 0.3, 0.3, 0.4], ['Arrow', 0.4, 0.3, 0.6, 0.36], ['Line', 0.4, 0.38, 0.7, 0.38]]) {
  await p.getByRole('button', { name: new RegExp('^' + tool) }).first().click();
  await p.mouse.move(pg.x + pg.width * x1, pg.y + pg.height * y1); await p.mouse.down(); await p.mouse.move(pg.x + pg.width * x2, pg.y + pg.height * y2, { steps: 5 }); await p.mouse.up();
}
// 4) stamps, duplicate, undo/redo
await p.getByRole('button', { name: 'Add Tick' }).click();
await p.keyboard.press('Control+d');
const n1 = await p.locator('[data-obj]').count();
await p.keyboard.press('Control+z'); const n2 = await p.locator('[data-obj]').count();
await p.keyboard.press('Control+y'); const n3 = await p.locator('[data-obj]').count();
ok('undo/redo/duplicate', n2 === n1 - 1 && n3 === n1, `${n1} ${n2} ${n3}`);
await p.getByRole('button', { name: 'Add Today’s date' }).click();
// save
await p.getByRole('button', { name: 'Save PDF' }).first().click();
const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: 'Download PDF' }).click()]); await d.saveAs('/tmp/testout/kdf-edited.pdf');
const txt = execSync('pdftotext -f 1 -l 1 /tmp/testout/kdf-edited.pdf -').toString();
ok('rupee saved', /Price ₹ 12,500/.test(txt) && txt.includes('✓'), JSON.stringify(txt.match(/Price.{0,20}/)?.[0]));
ok('line edit saved', txt.includes('ZENTA'));
ok('date saved', txt.includes(new Date().toLocaleDateString('en-GB')));
ok('no errors', !errs.length, errs.join(' | '));
await b.close();
