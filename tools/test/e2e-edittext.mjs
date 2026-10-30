import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const T = process.env.TESTFILES || '/home/claude/testfiles/', OUT = '/tmp/testout/';
const b = await chromium.launch(); const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
const c = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } }); const p = await c.newPage(); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && !/TUNNEL|googletag/.test(m.text()) && errs.push(m.text()));
await p.goto('http://localhost:4321/edit-pdf/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
await p.setInputFiles('input[type=file]', [T + 'doc.pdf']); await p.waitForSelector('.ti');
ok('text items', true, await p.locator('.ti').count());
async function editAt(text, replacement) {
  const items = p.locator('.ti'); const n = await items.count();
  // find item by position: use pdf text via title lookup is unavailable, so check each box against the text layer
  for (let k = 0; k < n; k++) {
    const bb = await items.nth(k).boundingBox(); if (!bb) continue;
    await items.nth(k).click({ position: { x: 2, y: bb.height / 2 } });
    await p.waitForTimeout(250); const cur = await p.evaluate(() => document.activeElement?.innerText ?? '');
    if (cur.includes(text)) { await p.keyboard.press('Control+A'); await p.keyboard.type(replacement); await p.mouse.click(1200, 900); return cur; }
    await p.keyboard.press('Escape'); await p.getByRole('button', { name: 'Undo' }).click();
  }
  return null;
}
ok('edit "Initial release"', await editAt('Initial release', 'Second release'));
ok('edit header "Revision"', await editAt('Revision', 'Rev.'));
ok('edit bold error', await editAt('Error! Bookmark', 'Page 12'));
await p.getByRole('button', { name: 'Save PDF' }).first().click();
const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download PDF' }).click()]);
await d.saveAs(OUT + 'doc-edited.pdf'); ok('saved', fs.statSync(OUT + 'doc-edited.pdf').size > 1000); ok('errors', !errs.length, errs.join());
console.log(res.join('\n')); await b.close();
