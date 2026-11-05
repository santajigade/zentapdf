// Screenshot a tool in use for a guide: public/guides/img/<slug>.webp
// Usage (site served on :4321): node tools/guides/shot.mjs <slug> </tool-url/> <file1,file2> [wait-selector]
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import { execFileSync } from 'child_process'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [slug, url, files = '', wait = ''] = process.argv.slice(2);
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1180, height: 1300 } }); const q = await c.newPage();
await q.goto('http://localhost:4321' + url); await q.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
if (files) await q.setInputFiles('input[type=file] >> nth=0', files.split(',').map((f) => f.startsWith('/') ? f : '/tmp/gfiles/' + f));
if (wait) await q.waitForSelector(wait, { timeout: 60000 });
await q.waitForTimeout(2500);
await (await q.$('.tool-box')).screenshot({ path: `/tmp/${slug}.png` });
execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('/tmp/${slug}.png').convert('RGB'); im.thumbnail((1100, 900)); im.save('${ROOT}/public/guides/img/${slug}.webp', 'WEBP', quality=80)`]);
await b.close(); console.log('saved public/guides/img/' + slug + '.webp');
