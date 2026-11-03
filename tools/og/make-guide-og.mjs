// Light, colourful guide thumbnails (public/og/guides/<slug>.png) in the same style as the home-page category tiles.
// Usage: node --experimental-strip-types tools/og/make-guide-og.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { icons, toolColor } = await import(ROOT + '/src/data/icons.ts');
const { tools } = await import(ROOT + '/src/data/tools.ts');
const logo = fs.readFileSync(ROOT + '/public/logo.svg', 'utf8').replace('<svg ', '<svg width="56" height="56" ');
// same tints as the home page category tiles
const TINT = { organise: ['#eff6ff', '#dbeafe', '#2563eb'], edit: ['#f5f3ff', '#ede9fe', '#7c3aed'], convert: ['#ecfdf5', '#d1fae5', '#047857'], security: ['#fffbeb', '#fef3c7', '#b45309'], image: ['#fff1f2', '#ffe4e6', '#be123c'], imgconv: ['#f0fdfa', '#ccfbf1', '#0f766e'], topdf: ['#fff7ed', '#ffedd5', '#c2410c'], gif: ['#fdf2f8', '#fce7f3', '#be185d'], utility: ['#f0f9ff', '#e0f2fe', '#0369a1'] };
const guides = fs.readdirSync(ROOT + '/src/content/guides').filter((f) => f.endsWith('.md')).map((f) => {
  const src = fs.readFileSync(ROOT + '/src/content/guides/' + f, 'utf8');
  return { slug: f.replace('.md', ''), h1: src.match(/^h1:\s*"(.*)"/m)[1], tool: src.match(/^tool:\s*"(.*)"/m)?.[1] };
});
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const g of guides) {
  const t = tools.find((x) => x.slug === g.tool) ?? tools[0];
  const [bg, strong, accent] = TINT[t.category] ?? TINT.organise;
  const col = toolColor[t.slug] ?? accent;
  const ic = icons[t.icon] ?? icons.merge;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await p.setContent(`<html><head><style>@font-face{font-family:Inter;src:local('Inter')}</style></head><body style="margin:0">
  <div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0f172a;background:linear-gradient(135deg,${bg} 0%,#ffffff 55%,${bg} 100%)">
    <div style="position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:${strong};opacity:.7"></div>
    <div style="position:absolute;right:120px;bottom:-160px;width:340px;height:340px;border-radius:50%;background:${strong};opacity:.45"></div>
    <div style="position:absolute;left:70px;top:58px;display:flex;align-items:center;gap:14px">${logo}<span style="font-size:34px;font-weight:800;letter-spacing:-.01em">Zenta<span style="color:#4F46E5">PDF</span></span></div>
    <div style="position:absolute;right:110px;top:150px;width:230px;height:230px;border-radius:52px;background:${col};display:grid;place-items:center;box-shadow:0 24px 50px -18px ${col}">
      <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ic}</svg></div>
    <div style="position:absolute;left:70px;width:640px;top:165px">
      <div style="display:inline-block;background:${strong};color:${accent};border-radius:999px;padding:8px 20px;font-size:22px;font-weight:800;letter-spacing:.08em">GUIDE</div>
      <div style="font-size:${g.h1.length > 70 ? 46 : g.h1.length > 50 ? 52 : 58}px;font-weight:800;line-height:1.14;letter-spacing:-.02em;margin-top:22px">${esc(g.h1)}</div>
    </div>
    <div style="position:absolute;left:70px;bottom:54px;font-size:26px;color:#475569">Free · No sign-up · No watermark</div>
    <div style="position:absolute;right:70px;bottom:44px;background:${accent};color:#fff;border-radius:999px;padding:10px 26px;font-size:26px;font-weight:800">zentapdf.com</div>
  </div></body></html>`);
  const out = `${ROOT}/public/og/guides/${g.slug}.png`;
  await p.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${out}').convert('RGB').quantize(colors=200, method=2); im.save('${out}', optimize=True)`]);
}
await b.close(); console.log('guide images', guides.length);
