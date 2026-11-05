import { createRequire } from 'module'; const require = createRequire('/home/claude/zentapdf/'); const { chromium } = require('playwright');
import { execSync } from 'child_process';
const T = '/home/claude/testfiles/', P = T + 'plus/';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const sh = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return 'ERR ' + e.stderr; } };
const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 1000 } });
const only = process.argv[2];
async function open(slug, file) {
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()));
  await p.goto(`http://localhost:4321/${slug}/`); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
  await p.setInputFiles('input[type=file]', file); return p;
}
async function dl(p, name, re = /^Download (PDF|ZIP|Markdown)/) { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), p.getByRole('button', { name: re }).first().click()]); const f = '/tmp/testout/' + name; await d.saveAs(f); return f; }
const pages = (f) => +(sh(`qpdf --show-npages ${f}`).trim());
const shot = async (p, n) => p.screenshot({ path: `/tmp/plus-${n}.png`, fullPage: true });

if (!only || only === 'repair') for (const f of (process.argv[3] ? process.argv[3].split(',') : ['bad-xref.pdf', 'truncated.pdf', 'letter.pdf'])) {
  const p = await open('repair-pdf', P + f); await p.waitForSelector('.plus-report, .err, [role=alert]', { timeout: 60000 }); await shot(p, 'repair-' + f);
  const rep = await p.locator('.plus-report').innerText().catch(() => 'none');
  if (rep === 'none') { ok('repair ' + f + ' (not recoverable, message shown)', await p.locator('.err, [role=alert]').count() > 0); await p.close(); continue; }
  const out = await dl(p, 'rep-' + f); ok('repair ' + f, pages(out) >= 1 && !/ERR/.test(sh(`qpdf --check ${out}`)), rep.replace(/\n/g, ' | '));
  ok('repair errors ' + f, !p.errs.length, p.errs.join('|')); await p.close();
}
if (!only || only === 'nup') {
  const p = await open('pages-per-sheet', T + 'real/k12_db_en-4.pdf'); await p.waitForSelector('.pp-box img', { timeout: 30000 }); await p.waitForTimeout(800); await shot(p, 'nup4');
  const out = await dl(p, 'nup4.pdf', /Create PDF/).catch(async () => { await p.getByRole('button', { name: 'Create PDF' }).click(); return dl(p, 'nup4.pdf'); });
  ok('nup 4', pages(out) >= 1, `in ${pages(T + 'real/k12_db_en-4.pdf')} out ${pages(out)}; ${sh(`pdfinfo ${out} | grep 'Page size'`).trim()}`);
  await p.getByRole('button', { name: /Start over/ }).click().catch(() => {}); await p.close();
  const q = await open('pages-per-sheet', P + 'rot-letter.pdf'); await q.waitForSelector('.pp-box img'); await q.getByRole('button', { name: /Booklet/ }).click(); await q.waitForTimeout(1500); await shot(q, 'booklet');
  await q.getByRole('button', { name: 'Make booklet' }).click(); const o2 = await dl(q, 'booklet.pdf'); ok('booklet', pages(o2) === 2, 'pages ' + pages(o2)); ok('nup errors', !q.errs.length, q.errs.join('|')); await q.close();
}
if (!only || only === 'overlay') {
  const p = await open('pdf-overlay', P + 'rot-letter.pdf'); await p.waitForTimeout(500); await p.setInputFiles('input[type=file]', P + 'head.pdf');
  await p.waitForSelector('.pp-box img', { timeout: 30000 }); await p.waitForTimeout(1500); await shot(p, 'overlay');
  await p.getByRole('button', { name: 'Add overlay' }).click(); const out = await dl(p, 'overlay.pdf');
  const txt = sh(`pdftotext ${out} -`); ok('overlay', pages(out) === 3 && /FIRST PAGE HEAD/.test(txt) && /follow-on/.test(txt) && /Invoice 2/.test(txt), (txt.match(/KOBOLD[^\n]*/g) || []).join(','));
  ok('overlay errors', !p.errs.length, p.errs.join('|')); await p.close();
}
if (!only || only === 'pagesize') {
  const p = await open('page-size', P + 'rot-letter.pdf'); await p.waitForSelector('.pp-box img'); await p.waitForTimeout(800); await shot(p, 'pagesize');
  await p.getByRole('button', { name: 'Change page size' }).click(); const out = await dl(p, 'pagesize.pdf');
  ok('pagesize A4', /595\.\d* x 841|595 x 842|841.* x 595|842 x 595/.test(sh(`pdfinfo -f 1 -l 3 ${out}`)), sh(`pdfinfo -f 1 -l 3 ${out} | grep size`).replace(/\n/g, ' '));
  ok('pagesize text kept', /Invoice 3/.test(sh(`pdftotext ${out} -`)));
  ok('pagesize link kept', /zentapdf/.test(sh(`qpdf --qdf --object-streams=disable ${out} - | grep -a URI`)));
  ok('pagesize errors', !p.errs.length, p.errs.join('|')); await p.close();
}
if (!only || only === 'gray') for (const f of [P + 'letter.pdf', T + 'cmp/canva.pdf', T + 'real/kdf-kdg-9-gb-flow.pdf']) {
  const p = await open('pdf-to-grayscale', f); await p.waitForSelector('.pp-two .pp-box img:nth-child(1)'); await p.waitForTimeout(2500); await shot(p, 'gray-' + f.split('/').pop());
  await p.getByRole('button', { name: 'Convert to grayscale' }).click(); const out = await dl(p, 'gray-' + f.split('/').pop(), /^Download PDF/);
  sh(`pdftoppm -r 40 -png ${out} /tmp/testout/grayck`);
  const col = sh(`python3 -c "
import glob;from PIL import Image
m=0
for g in glob.glob('/tmp/testout/grayck*.png'):
  im=Image.open(g).convert('RGB')
  for r,gg,bb in im.getdata(): m=max(m,max(r,gg,bb)-min(r,gg,bb))
print(m)"`).trim(); sh('rm -f /tmp/testout/grayck*');
  ok('grayscale ' + f.split('/').pop(), +col <= 6, `max chroma ${col}, ${sh(`ls -l ${f} ${out} | awk '{print $5}'`).replace(/\n/g, ' -> ')}`);
  ok('gray errors', !p.errs.length, p.errs.join('|')); await p.close();
}
if (!only || only === 'blank') {
  const p = await open('delete-blank-pages', P + 'blanks.pdf'); await p.waitForSelector('.blank-grid button'); await shot(p, 'blank');
  const marked = await p.locator('.blank-grid button.del').count(); ok('blank found 3', marked === 3, 'marked ' + marked);
  await p.getByRole('button', { name: /Delete \d blank/ }).click(); const out = await dl(p, 'noblank.pdf'); ok('blank removed', pages(out) === 3, 'pages ' + pages(out));
  ok('blank errors', !p.errs.length, p.errs.join('|')); await p.close();
  const q = await open('delete-blank-pages', T + 'real/kdf-kdg-9-gb-flow.pdf'); await q.waitForSelector('.blank-grid button'); ok('datasheet no blanks', (await q.locator('.blank-grid button.del').count()) === 0); await q.close();
}
if (!only || only === 'extract') for (const f of [T + 'real/kdf-kdg-9-gb-flow.pdf', T + 'cmp/canva.pdf', T + 'photos.pdf']) {
  const p = await open('extract-images-from-pdf', f); await p.waitForSelector('.img-card, .status:has-text("No pictures")', { timeout: 60000 }); await p.waitForTimeout(500); await shot(p, 'extract-' + f.split('/').pop());
  const n = await p.locator('.img-card').count(); const ref = sh(`pdfimages -list ${f} | tail -n +3 | awk '$3=="image"' | wc -l`).trim();
  if (n) { const out = await dl(p, 'imgs-' + f.split('/').pop() + '.zip', /^Download \d+ picture/); ok('extract ' + f.split('/').pop(), true, `cards ${n} (pdfimages ${ref}) zip ${sh(`unzip -l ${out} | tail -1`).trim()}`); }
  else ok('extract ' + f.split('/').pop(), false, 'none');
  ok('extract errors', !p.errs.length, p.errs.join('|')); await p.close();
}
if (!only || only === 'md') for (const f of [T + 'real/kdf-kdg-9-gb-flow.pdf', T + 'report.pdf', T + 'ruled.pdf']) {
  const p = await open('pdf-to-markdown', f); await p.waitForSelector('.md-prev', { timeout: 60000 }); await shot(p, 'md-' + f.split('/').pop());
  const out = await dl(p, 'md-' + f.split('/').pop() + '.md'); const md = sh(`cat ${out}`);
  ok('md ' + f.split('/').pop(), md.length > 100, `${md.length} chars, ${(md.match(/^#+ /gm) || []).length} headings, ${(md.match(/^\|/gm) || []).length} table rows`);
  ok('md errors', !p.errs.length, p.errs.join('|')); await p.close();
}
await b.close();
