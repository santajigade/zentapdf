// Generates a share image (1200×630) for every tool: public/og/tools/<slug>.png
// Usage: node tools/og/make-tool-images.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const src = fs.readFileSync(ROOT + '/src/data/tools.ts', 'utf8');
const iconsSrc = fs.readFileSync(ROOT + '/src/data/icons.ts', 'utf8');
const doc = `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>`;
const icons = {}; for (const m of iconsSrc.matchAll(/^\s+(\w+): (doc \+ )?'([^']*)'/gm)) icons[m[1]] = (m[2] ? doc : '') + m[3];
const C = {}; for (const m of iconsSrc.matchAll(/(\w+): '(#[0-9a-f]{6})'/g)) C[m[1]] = m[2];
const colors = {}; for (const m of iconsSrc.matchAll(/'([\w-]+)': C\.(\w+)/g)) colors[m[1]] = C[m[2]];
const tools = [...src.matchAll(/slug: '([\w-]+)', name: ['"]([^'"]+)['"], category: '\w+', icon: '(\w+)', live: true[^\n]*\n\s+short: (['"])(.*?)\4,/g)].map((m) => ({ slug: m[1], name: m[2], icon: m[3], short: m[5].replace(/\\'/g, "'") }));
const logo = fs.readFileSync(ROOT + '/tools/og/logo-white.svg', 'utf8').replace(/width="([\d.]+)" height="64"/, (m, W) => `width="${W * 52 / 64}" height="52"`);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const t of tools) {
  const col = colors[t.slug] || '#5b5bd6';
  await p.setContent(`<html><body style="margin:0"><div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:radial-gradient(circle at 85% 15%,#818CF8 0,transparent 45%),linear-gradient(130deg,#3730A3,#4F46E5 50%,#6366F1)">
    <div style="position:absolute;inset:0;background-image:radial-gradient(rgb(255 255 255 / .08) 2px,transparent 2px);background-size:30px 30px"></div>
    <div style="position:absolute;left:70px;top:56px">${logo}</div>
    <div style="position:absolute;left:70px;top:170px;width:220px;height:220px;border-radius:52px;background:${col};display:grid;place-items:center;box-shadow:0 24px 50px rgb(0 0 0 / .25)">
      <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[t.icon] || ''}</svg></div>
    <div style="position:absolute;left:340px;right:70px;top:175px">
      <div style="font-size:${t.name.length > 18 ? 66 : 80}px;font-weight:800;letter-spacing:-.02em;line-height:1.05">${t.name}</div>
      <div style="font-size:32px;opacity:.93;margin-top:22px;line-height:1.3">${t.short}</div>
    </div>
    <div style="position:absolute;left:70px;bottom:56px;font-size:26px;opacity:.92">Free · No sign-up · No watermark</div>
    <div style="position:absolute;right:70px;bottom:46px;background:#fff;color:#4F46E5;border-radius:999px;padding:10px 26px;font-size:26px;font-weight:800">zentapdf.com</div>
  </div></body></html>`);
  const out = `${ROOT}/public/og/tools/${t.slug}.png`;
  await p.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${out}').convert('RGB').quantize(colors=200, method=2); im.save('${out}', optimize=True)`]);
}
await b.close(); console.log('tools', tools.length);
