import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const v = +process.argv[2], FPS = 30, DUR = 16.5; const dir = `/tmp/fr/v${v}`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + process.cwd() + '/short.html?v=' + v); await p.waitForTimeout(400);
for (let i = 0; i < FPS * DUR; i++) { await p.evaluate((t) => render(t), i / FPS); await p.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
await b.close();
