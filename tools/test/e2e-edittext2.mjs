// letter spacing, width matching and caret-at-click
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const T = process.env.TESTFILES || '/home/claude/testfiles/';
const b = await chromium.launch(); const p = await (await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:4321/edit-pdf/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
await p.setInputFiles('input[type=file]', [T + 'sop.pdf']); await p.waitForSelector('.ti');
const items = p.locator('.ti');
// 1) letter-spaced word
let bb = await items.nth(0).boundingBox(); await items.nth(0).click({ position: { x: bb.width - 2, y: bb.height / 2 } }); await p.waitForTimeout(300);
const ls = await p.evaluate(() => { const el = document.activeElement; return { t: el.innerText, ls: getComputedStyle(el).letterSpacing, w: el.getBoundingClientRect().width }; });
console.log((ls.t === 'STANDARD' && ls.ls !== 'normal' ? 'PASS' : 'FAIL') + ' letter-spaced', JSON.stringify(ls), 'orig width', bb.width.toFixed(1));
await p.mouse.click(1250, 980);
// 2) big title: click inside "Stock" (about 25% of width) and type X
const title = p.locator('.ti').nth(2); bb = await title.boundingBox();
await title.click({ position: { x: bb.width * 0.25, y: bb.height / 2 } }); await p.waitForTimeout(300);
await p.keyboard.type('X');
const t2 = await p.evaluate(() => { const el = document.activeElement; return { t: el.innerText, w: el.getBoundingClientRect().width }; });
console.log((t2.t !== 'New Stock Item CreationX' && t2.t.includes('X') ? 'PASS' : 'FAIL') + ' caret at click', JSON.stringify(t2), 'orig width', bb.width.toFixed(1));
await p.mouse.click(1250, 980);
await p.getByRole('button', { name: 'Save PDF' }).first().click();
const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download PDF' }).click()]); await d.saveAs('/tmp/testout/sop-ed.pdf');
console.log(errs.length ? 'FAIL errors ' + errs.join() : 'PASS no errors');
await b.close();
