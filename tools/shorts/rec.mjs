import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs';
const FMT=process.env.F||'short'; const VP={short:{width:1080,height:1920},feed:{width:1080,height:1350},wide:{width:1920,height:1080}}[FMT];
const v = +process.argv[2], FPS = 30, DUR = 16.5; const dir = `/tmp/fr/v${v}${FMT}`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: VP });
await p.goto('file://' + process.cwd() + '/short.html?f=' + FMT + '&v=' + v); await p.waitForTimeout(400);
for (let i = 0; i < FPS * DUR; i++) { await p.evaluate((t) => render(t), i / FPS); await p.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
await b.close();
