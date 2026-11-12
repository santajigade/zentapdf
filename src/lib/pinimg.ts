// Tall Pinterest pin images (1000x1500 JPG), rendered at build time with satori + resvg + sharp and cached in .og-cache/.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { icons } from '../data/icons';
import type { Pin } from './pins';

const ROOT = process.cwd();
let FONTS: any[] | null = null;
const fonts = () => FONTS ??= [
  { name: 'Inter', data: readFileSync(join(ROOT, 'public/fonts/Inter-Regular.ttf')), weight: 500, style: 'normal' },
  { name: 'Inter', data: readFileSync(join(ROOT, 'public/fonts/Inter-Bold.ttf')), weight: 800, style: 'normal' },
];
const dataUrl = (svg: string) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const LOGO = () => dataUrl(readFileSync(join(ROOT, 'public/logo.svg'), 'utf8'));
const iconUrl = (name: string) => dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] ?? icons.text}</svg>`);

const h = (type: string, style: any, children?: any, extra: any = {}) => ({ type, props: { style, children, ...extra } });
const shade = (hex: string, f: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
const rs = (t: string) => t.replace(/₹\s?/g, 'Rs ').replace(/\s*[–—]\s*/g, ', ');

function pin(p: Pin) {
  const t = rs(p.title);
  const size = t.length > 56 ? 66 : t.length > 40 ? 76 : t.length > 22 ? 92 : 112;
  const tick = (x: string) => h('div', { display: 'flex', alignItems: 'center', gap: 20, fontSize: 36, fontWeight: 500 }, [
    h('div', { width: 48, height: 48, borderRadius: 999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
      h('div', { width: 13, height: 24, borderRight: `6px solid ${shade(p.color, 0.8)}`, borderBottom: `6px solid ${shade(p.color, 0.8)}`, transform: 'rotate(45deg) translate(-2px,-3px)' })), x]);
  return h('div', { width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '76px 76px 76px', fontFamily: 'Inter', color: '#fff',
    backgroundColor: shade(p.color, 0.3), backgroundImage: `radial-gradient(circle at 100% 0%, ${p.color} 0%, ${p.color}88 40%, transparent 72%), radial-gradient(circle at 0% 100%, ${shade(p.color, 0.75)}cc 0%, transparent 60%)` }, [
    h('div', { display: 'flex', alignItems: 'center', gap: 20 }, [
      h('img', { width: 78, height: 78, borderRadius: 18 }, undefined, { src: LOGO(), width: 78, height: 78 }),
      h('div', { fontSize: 46, fontWeight: 800, letterSpacing: -1, display: 'flex' }, 'ZentaPDF'),
    ]),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 80 }, [
      h('div', { display: 'flex', fontSize: 28, fontWeight: 800, letterSpacing: 4, padding: '12px 26px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.35)', textTransform: 'uppercase' }, p.kicker),
      h('div', { width: 132, height: 132, borderRadius: 32, background: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        h('img', { width: 84, height: 84 }, undefined, { src: iconUrl(p.icon), width: 84, height: 84 })),
    ]),
    h('div', { marginTop: 40, fontSize: size, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2.5, display: 'flex' }, t),
    h('div', { marginTop: 36, fontSize: 40, fontWeight: 500, opacity: 0.92, lineHeight: 1.4, display: 'flex' }, rs(p.sub)),
    h('div', { display: 'flex', flexDirection: 'column', gap: 24, marginTop: 'auto' }, p.ticks.map(tick)),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 56, padding: '28px 0', borderRadius: 999, background: '#fff', color: shade(p.color, 0.45), fontSize: 42, fontWeight: 800 }, 'Try it free at zentapdf.com'),
  ]);
}

const CACHE = join(ROOT, '.og-cache');
export async function pinJpg(p: Pin): Promise<Buffer> {
  const key = createHash('sha1').update(JSON.stringify(p) + 'pin1').digest('hex');
  const f = join(CACHE, key + '.jpg');
  if (existsSync(f)) return readFileSync(f);
  const svg = await satori(pin(p) as any, { width: 1000, height: 1500, fonts: fonts() });
  const jpg = await sharp(new Resvg(svg, { fitTo: { mode: 'width', value: 1000 } }).render().asPng()).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  mkdirSync(CACHE, { recursive: true }); writeFileSync(f, jpg);
  return jpg;
}
