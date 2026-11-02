import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
const logo = fs.readFileSync('../../public/logo.svg', 'utf8');
await p.setContent(`<body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;background:linear-gradient(135deg,#eef2ff,#fff 60%);font-family:system-ui,sans-serif">
<div style="display:flex;align-items:center;gap:22px"><div style="width:96px;height:96px">${logo}</div><div style="font-size:64px;font-weight:800;color:#111827">Zenta<span style="color:#4F46E5">PDF</span></div></div>
<div style="font-size:52px;font-weight:750;color:#111827;margin-top:36px;line-height:1.15">Free PDF &amp; Image Tools</div>
<div style="font-size:30px;color:#4b5563;margin-top:16px">Edit · Merge · Convert · Compress — free, no sign-up</div></body>`);
await p.screenshot({ path: '../../public/og-default.png' });
for (const [u, w, theme, name] of [['/', 1280, 'light', 'home'], ['/merge-pdf/', 1280, 'light', 'merge'], ['/compress-image/', 390, 'dark', 'mobile-dark']]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme });
  const q = await c.newPage(); await q.goto('http://localhost:4321' + u);
  if (name === 'merge') { await q.setInputFiles('input[type=file]', ['/home/claude/testfiles/a.pdf', '/home/claude/testfiles/b.pdf', '/home/claude/testfiles/c.pdf']); }
  await q.screenshot({ path: `/home/claude/testout/shot-${name}.png`, fullPage: name !== 'home' ? false : false });
}
await b.close();
