import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const FMT=process.env.F||'short'; const VP={short:{width:1080,height:1920},feed:{width:1080,height:1350},wide:{width:1920,height:1080}}[FMT];
const b = await chromium.launch(); const p = await b.newPage({ viewport: VP });
await p.goto('file://' + process.cwd() + '/short.html?f=' + FMT + '&v=' + process.argv[2]); await p.waitForTimeout(400);
await p.evaluate(() => render(1.0)); await p.screenshot({ path: process.argv[3] }); await b.close();
