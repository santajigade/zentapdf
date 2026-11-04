import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const vs = process.argv[2].split(',').map(Number); const ts = process.argv[3].split(',').map(Number);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
for (const v of vs) { await p.goto('file://' + process.cwd() + '/short.html?v=' + v); await p.waitForTimeout(300);
  for (const t of ts) { await p.evaluate((t) => render(t), t); await p.screenshot({ path: `/tmp/sn/v${v}-${t}.png` }); } }
await b.close(); console.log(errs.join('\n'));
