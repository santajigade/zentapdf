// Share images for the Device Test section. Usage: node --experimental-strip-types tools/og/make-device-og.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { icons } = await import(ROOT + '/src/data/icons.ts');
const { deviceTests } = await import(ROOT + '/src/data/devicetests.ts');
const logo = fs.readFileSync(ROOT + '/public/logo.svg', 'utf8').replace('<svg ', '<svg width="56" height="56" ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
const pages = [...deviceTests.filter((t) => t.live).map((t) => ({ out: `device/${t.slug}.png`, title: t.name, sub: t.short, ic: icons[t.icon], col: t.color })),
  { out: 'device-test.png', title: 'Device Test', sub: 'Keyboard, mouse, mic, webcam, speakers & internet speed — free online', ic: icons.keyboard, col: '#0891b2' }];
for (const g of pages) {
  await p.setContent(`<html><body style="margin:0"><div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0f172a;background:linear-gradient(135deg,#ecfeff 0%,#ffffff 55%,#ecfeff 100%)">
    <div style="position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:#cffafe;opacity:.8"></div>
    <div style="position:absolute;left:70px;top:58px;display:flex;align-items:center;gap:14px">${logo}<span style="font-size:34px;font-weight:800">Zenta<span style="color:#4F46E5">PDF</span></span></div>
    <div style="position:absolute;right:110px;top:160px;width:230px;height:230px;border-radius:52px;background:${g.col};display:grid;place-items:center;box-shadow:0 24px 50px -18px ${g.col}">
      <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g.ic}</svg></div>
    <div style="position:absolute;left:70px;width:640px;top:170px">
      <div style="display:inline-block;background:#cffafe;color:#0e7490;border-radius:999px;padding:8px 20px;font-size:22px;font-weight:800;letter-spacing:.08em">DEVICE TEST</div>
      <div style="font-size:70px;font-weight:900;line-height:1.08;letter-spacing:-.02em;margin-top:22px">${esc(g.title)}</div>
      <div style="font-size:30px;color:#475569;margin-top:18px;line-height:1.3">${esc(g.sub)}</div>
    </div>
    <div style="position:absolute;left:70px;bottom:54px;font-size:26px;color:#475569">Free · No download · No sign-up</div>
    <div style="position:absolute;right:70px;bottom:44px;background:#0e7490;color:#fff;border-radius:999px;padding:10px 26px;font-size:26px;font-weight:800">zentapdf.com</div>
  </div></body></html>`);
  const out = `${ROOT}/public/og/${g.out}`; await p.screenshot({ path: out });
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${out}').convert('RGB').quantize(colors=200, method=2); im.save('${out}', optimize=True)`]);
}
await b.close(); console.log('device images', pages.length);
