import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const B = 'http://localhost:4321'; const results = [];
const ok = (n, c, i = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n} ${i}`);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function page(url, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage(); p.errors = [];
  p.on('console', (m) => m.type() === 'error' && !/TUNNEL|google|ERR_|measurementlab/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(B + url); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' }).catch(() => {});
  return p;
}
try {
  let p = await page('/device-test/');
  ok('hub lists 11 live tests', (await p.$$('.cat-band a.card')).length === 11);
  // keyboard
  p = await page('/device-test/keyboard-test/');
  await p.getByRole('button', { name: 'Start keyboard test' }).click();
  const y0 = await p.evaluate(() => scrollY);
  for (const k of ['KeyA', 'KeyS', 'Space', 'ArrowDown', 'Enter', 'F5']) await p.keyboard.press(k === 'KeyA' ? 'a' : k === 'KeyS' ? 's' : k);
  await p.keyboard.down('q'); await p.keyboard.down('w'); await p.keyboard.down('e'); await p.keyboard.up('q'); await p.keyboard.up('w'); await p.keyboard.up('e');
  const green = await p.$$eval('.kb-key.ok', (x) => x.map((e) => e.getAttribute('title')));
  ok('keyboard keys turn green', ['KeyA', 'KeyS', 'Space', 'ArrowDown', 'Enter', 'F5', 'KeyQ'].every((k) => green.includes(k)), green.join(','));
  ok('keyboard: no page scroll / reload', (await p.evaluate(() => scrollY)) === y0 && p.url().includes('keyboard-test'));
  ok('keyboard: rollover counted', /3/.test(await p.textContent('.dt-results > div:nth-child(3) b')));
  ok('keyboard no errors', !p.errors.length, p.errors.join('|'));
  // mouse
  p = await page('/device-test/mouse-test/');
  const a = await (await p.$('.ms-area')).boundingBox(); await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.click(a.x + 50, a.y + 50); await p.mouse.click(a.x + 50, a.y + 50, { button: 'right' }); await p.mouse.click(a.x + 50, a.y + 50, { button: 'middle' }); await p.mouse.wheel(0, -100); await p.mouse.wheel(0, 100);
  const counts = await p.$$eval('.dt-results b', (x) => x.map((e) => e.textContent));
  ok('mouse buttons counted', counts[0] === '1' && counts[1] === '1' && counts[2] === '1' && counts[5] === '1 / 1', counts.join(','));
  ok('mouse no errors', !p.errors.length, p.errors.join('|'));
  // mic
  p = await page('/device-test/mic-test/');
  await p.getByRole('button', { name: /Start mic test/ }).click();
  await p.waitForSelector('.mic-meter', { timeout: 10000 }); await p.waitForTimeout(1500);
  ok('mic level shown', /dB/.test(await p.textContent('.dt-results')), await p.textContent('.dt-results > div'));
  ok('mic detected sound', /working/.test(await p.textContent('.mic-verdict')));
  await p.getByRole('button', { name: /Record 5 seconds/ }).click(); await p.waitForSelector('audio', { timeout: 9000 });
  ok('mic recording plays', !!(await p.$('audio')));
  ok('mic no errors', !p.errors.length, p.errors.join('|'));
  // webcam
  p = await page('/device-test/webcam-test/');
  await p.getByRole('button', { name: /Start webcam test/ }).click(); await p.waitForSelector('.dt-results', { timeout: 10000 }); await p.waitForTimeout(1500);
  ok('webcam resolution', /\d+ × \d+/.test(await p.textContent('.dt-results')), (await p.textContent('.dt-results')).slice(0, 80));
  await p.getByRole('button', { name: /Take a photo/ }).click(); await p.waitForSelector('.cam-snap img');
  ok('webcam snapshot', true); ok('webcam no errors', !p.errors.length, p.errors.join('|'));
  // speaker
  p = await page('/device-test/speaker-test/');
  await p.getByRole('button', { name: /left speaker/ }).click(); await p.waitForTimeout(300);
  ok('speaker left plays', /LEFT/.test(await p.textContent('.tool-box')));
  await p.getByRole('button', { name: /Frequency sweep/ }).click(); await p.waitForTimeout(800);
  ok('speaker sweep', /Frequency sweep: \d/.test(await p.textContent('.tool-box')));
  ok('speaker no errors', !p.errors.length, p.errors.join('|'));
  // speed test (no internet here: should show the consent gate and a friendly error)
  p = await page('/device-test/internet-speed-test/');
  ok('speed: start disabled until consent', await p.getByRole('button', { name: 'Start speed test' }).isDisabled());
  await p.check('.dt-start input[type=checkbox]'); await p.getByRole('button', { name: 'Start speed test' }).click();
  await p.waitForSelector('.error, .mic-verdict', { timeout: 40000 }).catch(() => {});
  ok('speed: runs or shows friendly error', !!(await p.$('.error, .mic-verdict')), (await p.textContent('.tool-box')).slice(0, 160));
  // ---- phase 2 ----
  const P = 'http://127.0.0.1:4322';
  p = await page('/device-test/ping-test/'); await p.goto(P + '/device-test/ping-test/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
  await p.getByRole('button', { name: 'Start ping test' }).click();
  await p.waitForFunction(() => /Test again/.test(document.querySelector('.dt-start')?.textContent || ''), null, { timeout: 120000 });
  const pings = await p.$$eval('.ping-card', (cs) => cs.map((c) => c.querySelector('.dt-results b')?.textContent));
  ok('ping: own server measured', /\d+ ms/.test(pings[2] || ''), pings.join(' | '));
  ok('ping no errors', !p.errors.length, p.errors.join('|'));
  p = await page('/device-test/what-is-my-ip/'); await p.goto(P + '/device-test/what-is-my-ip/'); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
  await p.waitForFunction(() => !/Finding/.test(document.querySelector('.ip-big b')?.textContent || 'Finding'), null, { timeout: 20000 });
  ok('ip shown', /127\.0\.0\.1/.test(await p.textContent('.ip-big b')), await p.textContent('.ip-big b'));
  p = await page('/device-test/dead-pixel-test/');
  await p.getByRole('button', { name: /Start dead pixel test/ }).click(); await p.waitForSelector('.dp-full.on');
  const c1 = await p.$eval('.dp-full', (e) => getComputedStyle(e).backgroundColor); await p.mouse.click(300, 300); const c2 = await p.$eval('.dp-full', (e) => getComputedStyle(e).backgroundColor);
  ok('dead pixel colours cycle', c1 !== c2, c1 + ' -> ' + c2); await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok('dead pixel exits', !(await p.$('.dp-full.on')));
  p = await page('/device-test/refresh-rate-test/'); await p.waitForTimeout(2500);
  const hz = +(await p.textContent('.hz-big b')); ok('refresh rate measured', hz >= 20 && hz <= 500, hz);
  p = await page('/device-test/double-click-test/');
  const d = await (await p.$('.dc-area')).boundingBox(); const cx = d.x + d.width / 2, cy = d.y + d.height / 2;
  await p.mouse.click(cx, cy); await p.waitForTimeout(700); await p.mouse.click(cx, cy); await p.waitForTimeout(150); await p.mouse.click(cx, cy); await p.waitForTimeout(700);
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.up(); await p.mouse.down(); await p.mouse.up(); // instant bounce = chatter
  const dc = await p.$$eval('.dt-results b', (x) => x.map((e) => e.textContent));
  ok('double-click: single/double/chatter', +dc[0] >= 1 && +dc[1] >= 1 && +dc[2] >= 1, dc.join(','));
  for (const s of ['ping-test', 'what-is-my-ip', 'dead-pixel-test', 'refresh-rate-test', 'double-click-test', 'keyboard-test', 'mouse-test', 'mic-test', 'speaker-test', 'internet-speed-test']) { p = await page(`/device-test/${s}/`, 360); const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`mobile ${s} no overflow`, sw <= 362, sw); }
} catch (e) { results.push('FAIL exception ' + e.message.split('\n')[0]); }
console.log(results.join('\n')); await browser.close();
