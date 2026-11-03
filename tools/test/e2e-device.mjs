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
  ok('hub lists 14 live tests', (await p.$$('.cat-band a.card')).length === 14);
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
  // ---- phase 3 ----
  { const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true }); const q = await ctx.newPage(); q.errors = []; q.on('pageerror', (e) => q.errors.push(String(e)));
    await q.goto(B + '/device-test/touch-screen-test/'); await q.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
    const r = await (await q.$('.tt-area')).boundingBox(); const cdp = await ctx.newCDPSession(q);
    const tp = (pts) => pts.map(([x, y], i) => ({ x: r.x + x, y: r.y + y, id: i }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[50, 50], [150, 80], [250, 120]]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[60, 90], [160, 120], [260, 160]]) });
    await q.waitForTimeout(100); const most = await q.textContent('.dt-results > div:nth-child(2) b');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ok('touch: multi-touch counted', +most >= 3, most);
    await q.getByRole('button', { name: 'Dead-zone grid' }).click(); await q.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[20, 20]]) });
    for (let x = 20; x < r.width - 10; x += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[x, 20]]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ok('touch: grid squares light up', (await q.$$('.tt-grid span.on')).length >= 6, (await q.$$('.tt-grid span.on')).length);
    ok('touch no errors', !q.errors.length, q.errors.join('|')); await ctx.close(); }
  { const ctx = await browser.newContext(); const q = await ctx.newPage(); q.errors = []; q.on('pageerror', (e) => q.errors.push(String(e)));
    await ctx.addInitScript(() => { const pad = { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0.02, -0.01, 0.6, 0.3], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 7 ? 0.5 : i === 0 ? 1 : 0 })) }; navigator.getGamepads = () => [pad, null, null, null]; });
    await q.goto(B + '/device-test/gamepad-test/'); await q.waitForSelector('.gp-card', { timeout: 5000 });
    ok('gamepad shown', /Xbox/.test(await q.textContent('.gp-card')) && !!(await q.$('.gp-btns span.down')));
    ok('gamepad trigger 50%', /50%/.test(await q.textContent('.gp-trig')));
    ok('gamepad no errors', !q.errors.length, q.errors.join('|')); await ctx.close(); }
  p = await page('/device-test/battery-test/'); await p.waitForTimeout(800);
  ok('battery shows level or fallback', /%|does not share/.test(await p.textContent('.tool-box')), (await p.textContent('.tool-box')).slice(0, 80));
  p = await page('/guides/mic-not-working-windows/');
  ok('guide links to mic test', !!(await p.$('a[href="/device-test/mic-test/"].btn')));
  p = await page('/device-test/mic-test/'); ok('mic page links guide', !!(await p.$('a[href="/guides/mic-not-working-windows/"]')));
  for (const s of ['touch-screen-test', 'gamepad-test', 'battery-test', 'ping-test', 'what-is-my-ip', 'dead-pixel-test', 'refresh-rate-test', 'double-click-test', 'keyboard-test', 'mouse-test', 'mic-test', 'speaker-test', 'internet-speed-test']) { p = await page(`/device-test/${s}/`, 360); const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`mobile ${s} no overflow`, sw <= 362, sw); }
} catch (e) { results.push('FAIL exception ' + e.message.split('\n')[0]); }
console.log(results.join('\n')); await browser.close();
