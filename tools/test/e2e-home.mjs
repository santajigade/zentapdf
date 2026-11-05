import { createRequire } from 'module'; const require = createRequire('/home/claude/zentapdf/'); const { chromium } = require('playwright');
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const T = '/home/claude/testfiles/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4321/'); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/home-b.png', fullPage: true });
// search
await p.fill('#tool-search', 'grayscale'); await p.waitForTimeout(200);
ok('search finds', await p.locator('#all-tools li:visible').count() === 1, await p.locator('#all-tools li:visible').count());
await p.fill('#tool-search', ''); 
// drop a pdf, open compress
await p.setInputFiles('#hb-file', T + 'real/kdf-kdg-9-gb-flow.pdf'); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/home-pick.png', clip: { x: 760, y: 60, width: 640, height: 470 } });
ok('offers shown', await p.locator('.hb-offers button').count() >= 6);
await p.locator('.hb-offers button', { hasText: 'Compress PDF' }).click(); await p.waitForURL(/compress-pdf/);
await p.waitForTimeout(4000); const body = await p.locator('.tool-box').innerText();
ok('compress opened file', /kdf-kdg-9-gb-flow/.test(body), body.slice(0, 120).replace(/\n/g, ' '));
ok('url cleaned', !/from=home/.test(p.url()), p.url());
// two pdfs to merge
await p.goto('http://localhost:4321/'); await p.setInputFiles('#hb-file', [T + 'a.pdf', T + 'b.pdf']); await p.locator('.hb-offers button', { hasText: 'Merge PDF' }).click(); await p.waitForURL(/merge-pdf/); await p.waitForTimeout(2500);
const mb = await p.locator('.tool-box').innerText(); ok('merge got 2 files', /a\.pdf/.test(mb) && /b\.pdf/.test(mb), mb.slice(0, 120).replace(/\n/g, ' '));
// image to jpg-to-pdf
await p.goto('http://localhost:4321/'); await p.setInputFiles('#hb-file', T + 'photo1.jpg'); await p.locator('.hb-offers button', { hasText: 'JPG to PDF' }).click(); await p.waitForURL(/jpg-to-pdf/); await p.waitForTimeout(2000);
ok('jpg to pdf got file', /photo1/.test(await p.locator('.tool-box').innerText()));
ok('no errors', !errs.length, errs.join('|'));
// mobile + dark
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await m.goto('http://localhost:4321/'); await m.waitForTimeout(400); await m.screenshot({ path: '/tmp/home-mobile.png', fullPage: true });
ok('no horizontal scroll', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await m.evaluate(() => document.documentElement.scrollWidth));
const d = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }); await d.goto('http://localhost:4321/'); await d.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await d.waitForTimeout(300); await d.screenshot({ path: '/tmp/home-dark.png', fullPage: false });
await b.close();
