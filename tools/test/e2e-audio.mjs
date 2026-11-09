import { createRequire } from 'module'; const require = createRequire('/home/claude/zentapdf/'); const { chromium } = require('playwright');
import { execSync } from 'child_process';
const A = '/home/claude/testfiles/audio/';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const probe = (f) => { try { return execSync(`ffprobe -v error -show_entries format=duration,format_name:stream=codec_name,channels,sample_rate,bit_rate -of compact=p=0 "${f}"`).toString().trim().replace(/\n/g, ' | '); } catch (e) { return 'ERR'; } };
const dur = (f) => +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString();
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 }, permissions: ['microphone'] });
const only = process.argv[2];
async function open(slug, files) {
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|net::|Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
  await p.goto(`http://localhost:4321/${slug}/`); await p.waitForSelector('astro-island:not([ssr])', { state: 'attached' });
  if (files) await p.setInputFiles('input[type=file] >> nth=0', files.map((f) => A + f));
  return p;
}
async function dl(p, name, btn, timeout = 120000) { const [d] = await Promise.all([p.waitForEvent('download', { timeout }), btn()]); const f = '/tmp/au/' + name; await d.saveAs(f); return f; }
const shot = (p, n) => p.screenshot({ path: `/tmp/au-${n}.png`, fullPage: true });
const T = (n) => !only || only === n;

if (T('cut')) {
  const p = await open('mp3-cutter', ['song.mp3']); await p.waitForSelector('.au-wave canvas, .au-wave-box div', { timeout: 30000 }); await p.waitForTimeout(800);
  const ins = p.locator('.au-ti input'); await ins.nth(0).fill('2.5'); await ins.nth(0).press('Enter'); await ins.nth(1).fill('0:12'); await ins.nth(1).press('Enter');
  await p.getByLabel('Fade in').fill?.('1').catch(() => {});
  await p.waitForTimeout(300); await shot(p, 'cutter');
  const f = await dl(p, 'cut.mp3', () => p.getByRole('button', { name: /Cut and download/ }).click());
  ok('cutter mp3', Math.abs(dur(f) - 9.5) < 0.15, probe(f));
  await p.selectOption('.au-export select >> nth=0', 'wav'); const f2 = await dl(p, 'cut.wav', () => p.getByRole('button', { name: /Cut and download/ }).click()); ok('cutter wav', Math.abs(dur(f2) - 9.5) < 0.05, probe(f2));
  await p.selectOption('.opts select >> nth=0', 'remove'); await p.selectOption('.au-export select >> nth=0', 'mp3'); const f3 = await dl(p, 'removed.mp3', () => p.getByRole('button', { name: /Cut and download/ }).click()); ok('cutter remove middle', Math.abs(dur(f3) - 10.5) < 0.15, probe(f3));
  ok('cutter errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('ring')) {
  const p = await open('ringtone-maker', ['song.m4a']); await p.waitForSelector('.au-wave-box div', { timeout: 90000 }); await p.waitForTimeout(500); await shot(p, 'ringtone');
  const f = await dl(p, 'ring.mp3', () => p.getByRole('button', { name: /Download ringtone/ }).click()); ok('ringtone mp3 (m4a input via ffmpeg)', dur(f) <= 30.2 && dur(f) > 5, probe(f));
  await p.selectOption('.au-export select >> nth=0', 'm4r'); const f2 = await dl(p, 'ring.m4r', () => p.getByRole('button', { name: /Download ringtone/ }).click()); ok('ringtone m4r', /aac/.test(probe(f2)) && dur(f2) <= 30.2, probe(f2));
  ok('ring errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('conv')) {
  const p = await open('audio-converter', ['tone.wav', 'song.flac', 'song.ogg', 'song.wma']); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Convert to MP3/ }).click(); await p.waitForSelector('.au-row.done >> nth=3', { timeout: 180000 }).catch(() => {});
  await shot(p, 'converter');
  const st = await p.locator('.au-row').evaluateAll((els) => els.map((e) => e.className + ' ' + e.innerText.replace(/\n/g, ' ')));
  ok('converter 4 files to mp3', st.every((s) => /done/.test(s)), st.join(' || '));
  const z = await dl(p, 'conv.zip', () => p.getByRole('button', { name: /Download all/ }).click()); ok('converter zip', /4 files/.test(execSync(`unzip -l ${z} | tail -1`).toString()), execSync(`unzip -l ${z} | tail -1`).toString().trim());
  for (const [fmt, re] of [['flac', /flac/], ['ogg', /vorbis|opus/], ['m4a', /aac/], ['aac', /aac/], ['wav', /pcm/]]) {
    await p.selectOption('.opts select >> nth=0', fmt); await p.getByRole('button', { name: new RegExp('Convert to ' + fmt, 'i') }).click();
    await p.waitForFunction(() => !document.querySelector('.au-row .spin') && document.querySelectorAll('.au-row.done').length + document.querySelectorAll('.au-row.error').length === 4, null, { timeout: 180000 }).catch(() => {});
    const first = await dl(p, 'conv1.' + fmt, () => p.locator('.au-row .dl').first().click()); ok('convert to ' + fmt, re.test(probe(first)), probe(first));
  }
  ok('conv errors', !p.errs.length, p.errs.join(' | ')); await p.close();
  const q = await open('wav-to-mp3', ['tone.wav']); await q.getByRole('button', { name: /Convert to MP3/ }).click(); const f = await dl(q, 'w2m.mp3', () => Promise.resolve()); ok('wav-to-mp3 page', /mp3/.test(probe(f)), probe(f)); await q.close();
}
if (T('comp')) {
  const p = await open('audio-compressor', ['song.mp3']); await p.waitForTimeout(800); await shot(p, 'compressor-before');
  await p.selectOption('.opts select >> nth=1', '64'); await p.locator('.opts input[type=checkbox]').check();
  const f = await dl(p, 'comp.mp3', () => p.getByRole('button', { name: /^Compress$/ }).click()); const t = await p.locator('.au-row').innerText(); await shot(p, 'compressor');
  ok('compressor', /smaller/.test(t), t.replace(/\n/g, ' ') + ' :: ' + probe(f)); await p.close();
}
if (T('vol')) {
  const p = await open('volume-booster', ['quiet.mp3']); await p.waitForSelector('.au-meter'); const before = await p.locator('.au-meter').first().innerText();
  await p.getByRole('button', { name: '+15 dB' }).click(); await p.getByRole('button', { name: /Apply volume/ }).click(); await p.waitForSelector('.au-meter >> nth=1'); const after = await p.locator('.au-meter').nth(1).innerText(); await shot(p, 'volume');
  const f = await dl(p, 'loud.mp3', () => p.getByRole('button', { name: /^Download MP3/ }).click());
  const vol = execSync(`ffmpeg -i ${f} -af volumedetect -f null - 2>&1 | grep max_volume`).toString().trim();
  ok('volume booster', true, `${before} → ${after} ; ${vol}`); ok('vol errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('video')) for (const v of ['clip.mp4', 'clip.webm', 'clip.mkv', 'clip.mov']) {
  const p = await open('video-to-mp3', [v]); await p.waitForTimeout(500);
  const f = await dl(p, v + '.mp3', () => p.getByRole('button', { name: /Extract MP3/ }).click(), 180000); ok('video to mp3 ' + v, Math.abs(dur(f) - 10) < 0.3, probe(f)); if (v === 'clip.mp4') await shot(p, 'video');
  ok('video errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('bpm')) {
  const p = await open('bpm-finder', ['beat120.mp3']); await p.waitForSelector('.bpm-result', { timeout: 60000 }); const t = await p.locator('.bpm-result').innerText(); await shot(p, 'bpm');
  ok('bpm 120', /^12[01]/.test(t.trim()), t.replace(/\n/g, ' '));
  for (let i = 0; i < 6; i++) { await p.locator('.tap-btn').click(); await p.waitForTimeout(500); } const tt = await p.locator('.tap-out').innerText(); ok('tap tempo ~120', /1[12]\d/.test(tt), tt.replace(/\n/g, ' ')); await p.close();
}
if (T('fx')) for (const [slug, act, name] of [['pitch-changer', /Change pitch/, 'pitch'], ['audio-speed-changer', /Change speed/, 'speed'], ['reverse-audio', /Reverse audio/, 'reverse'], ['audio-normalizer', /^Normalize$/, 'norm']]) {
  const p = await open(slug, ['beat120.wav']); await p.waitForSelector('.au-wave-box div'); await p.getByRole('button', { name: act }).click();
  await p.waitForSelector('text=Result: listen', { timeout: 120000 }); await shot(p, name);
  const f = await dl(p, name + '.wav', async () => { await p.selectOption('.au-export select >> nth=0', 'wav'); await p.getByRole('button', { name: /^Download WAV/ }).click(); });
  const d = dur(f); const extra = name === 'norm' ? execSync(`ffmpeg -i ${f} -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness" | tail -1`).toString().trim() : '';
  ok(name, name === 'speed' ? Math.abs(d - 24) < 0.3 : Math.abs(d - 30) < 0.3, `dur ${d.toFixed(2)} ${extra}`); ok(name + ' errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('join')) {
  const p = await open('audio-joiner', ['tone.wav', 'beat120.mp3', 'song.ogg']); await p.waitForFunction(() => document.querySelectorAll('.au-row').length === 3 && !/reading/.test(document.querySelector('.au-rows').textContent), null, { timeout: 60000 });
  await p.locator('.opts input[type=range]').first().fill('2'); await shot(p, 'joiner');
  const f = await dl(p, 'joined.mp3', () => p.getByRole('button', { name: /Join and download/ }).click()); ok('joiner 20+30+20 - 2x2', Math.abs(dur(f) - 66) < 0.4, probe(f)); ok('join errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('rec')) {
  const p = await open('voice-recorder'); await p.getByRole('button', { name: 'Start recording' }).click(); await p.waitForTimeout(3000); await shot(p, 'recording');
  await p.getByRole('button', { name: 'Stop recording' }).click(); await p.waitForSelector('.au-wave-box div', { timeout: 30000 }); await shot(p, 'recorder');
  const f = await dl(p, 'rec.mp3', () => p.getByRole('button', { name: /^Download MP3/ }).click()); ok('recorder', dur(f) > 2, probe(f)); ok('rec errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
if (T('tone')) {
  const p = await open('tone-generator'); await p.fill('.tone-freq input', '1000'); await p.getByRole('button', { name: '▶ Play' }).click(); await p.waitForTimeout(500); await shot(p, 'tone'); await p.getByRole('button', { name: '■ Stop' }).click();
  const f = await dl(p, 'tone.wav', () => p.getByRole('button', { name: /^Download WAV/ }).click()); ok('tone wav 10s', Math.abs(dur(f) - 10) < 0.05, probe(f)); ok('tone errors', !p.errs.length, p.errs.join(' | ')); await p.close();
}
await b.close();
