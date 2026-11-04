import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + process.cwd() + '/short.html?v=' + process.argv[2]); await p.waitForTimeout(400);
await p.evaluate(() => render(1.0)); await p.screenshot({ path: process.argv[3] }); await b.close();
