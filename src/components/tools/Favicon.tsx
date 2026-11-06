import { useState } from 'preact/hooks';
import { DropZone, ErrorBox } from './shared';
import { downloadBlob, zipFiles, baseName } from '../../lib/utils';
import { loadBitmap, IMAGE_ACCEPT, isImage } from '../../lib/imageOps';

/** Build a .ico file that contains PNG images (supported by all modern browsers and Windows Vista+). */
export function buildIco(pngs: { size: number; data: Uint8Array }[]): Blob {
  const n = pngs.length, header = 6 + 16 * n;
  const total = header + pngs.reduce((s, p) => s + p.data.length, 0);
  const buf = new Uint8Array(total), v = new DataView(buf.buffer);
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, n, true);
  let off = header;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    v.setUint8(e, p.size >= 256 ? 0 : p.size); v.setUint8(e + 1, p.size >= 256 ? 0 : p.size);
    v.setUint8(e + 2, 0); v.setUint8(e + 3, 0); v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, p.data.length, true); v.setUint32(e + 12, off, true);
    buf.set(p.data, off); off += p.data.length;
  });
  return new Blob([buf], { type: 'image/x-icon' });
}

async function render(bmp: ImageBitmap, size: number, pad: number, bg: string | null, round: boolean): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high';
  if (bg) { ctx.fillStyle = bg; if (round) { ctx.beginPath(); ctx.roundRect(0, 0, size, size, size * 0.22); ctx.fill(); } else ctx.fillRect(0, 0, size, size); }
  const inner = size * (1 - pad * 2), s = Math.min(inner / bmp.width, inner / bmp.height);
  const w = bmp.width * s, h = bmp.height * s;
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}

export default function Favicon({ mode = 'favicon' }: { mode?: 'favicon' | 'ico' }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [pad, setPad] = useState(0);
  const [bgOn, setBgOn] = useState(false);
  const [bg, setBg] = useState('#4f46e5');
  const [round, setRound] = useState(true);
  const [sizes, setSizes] = useState<number[]>([16, 32, 48]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (files: File[]) => { const f = files.find(isImage); if (!f) { setError('Please choose an image.'); return; } setError(''); setFile(f); setUrl(URL.createObjectURL(f)); };

  const make = async () => {
    if (!file) return; setBusy(true); setError('');
    try {
      const bmp = await loadBitmap(file); const b = bgOn ? bg : null;
      const png = async (s: number) => new Uint8Array(await (await render(bmp, s, pad / 100, b, round)).arrayBuffer());
      if (mode === 'ico') {
        const list = [...sizes].sort((a, z) => a - z);
        const ico = buildIco(await Promise.all(list.map(async (s) => ({ size: s, data: await png(s) }))));
        downloadBlob(ico, baseName(file.name) + '.ico');
      } else {
        const ico = buildIco(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(s) }))));
        const files = [
          { name: 'favicon.ico', blob: ico },
          ...(await Promise.all([[16, 'favicon-16x16.png'], [32, 'favicon-32x32.png'], [180, 'apple-touch-icon.png'], [192, 'android-chrome-192x192.png'], [512, 'android-chrome-512x512.png']].map(async ([s, n]) => ({ name: n as string, blob: new Blob([await png(s as number) as BlobPart], { type: 'image/png' }) })))),
          { name: 'site.webmanifest', blob: new Blob([JSON.stringify({ name: '', short_name: '', icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }], theme_color: bg, background_color: '#ffffff', display: 'standalone' }, null, 2)], { type: 'application/json' }) },
          { name: 'HOW-TO-USE.txt', blob: new Blob([SNIPPET], { type: 'text/plain' }) },
        ];
        downloadBlob(await zipFiles(files), 'favicon-package.zip');
      }
      bmp.close();
    } catch { setError('Could not read this image.'); }
    finally { setBusy(false); }
  };

  if (!file) return <>
    <DropZone accept={IMAGE_ACCEPT + ',.svg'} label="Choose image" hint="PNG, JPG, SVG or WebP — a square logo works best" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const preview = (s: number) => (
    <div style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--muted)' }}>
      <div style={{ width: `${s}px`, height: `${s}px`, margin: '0 auto 4px', borderRadius: bgOn && round ? `${s * 0.22}px` : 0, background: bgOn ? bg : 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0/8px 8px', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <img src={url} alt="" style={{ maxWidth: `${100 - pad * 2}%`, maxHeight: `${100 - pad * 2}%` }} />
      </div>{s}px
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: '22px', alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap', margin: '6px 0 14px' }}>{[16, 32, 64, 128].map(preview)}</div>
      <div class="opts">
        <label>Padding: {pad}%<input type="range" min={0} max={25} value={pad} onInput={(e) => setPad(+(e.target as HTMLInputElement).value)} /></label>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={bgOn} onChange={(e) => setBgOn((e.target as HTMLInputElement).checked)} /> Background colour</label>
        {bgOn && <><label>Colour<input type="color" value={bg} onInput={(e) => setBg((e.target as HTMLInputElement).value)} /></label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={round} onChange={(e) => setRound((e.target as HTMLInputElement).checked)} /> Rounded corners</label></>}
        {mode === 'ico' && <div class="seg" role="group" aria-label="Icon sizes">{[16, 24, 32, 48, 64, 128, 256].map((s) => <button type="button" aria-pressed={sizes.includes(s)} onClick={() => setSizes(sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s])}>{s}</button>)}</div>}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div class="actions">
        <button type="button" class="btn btn-primary dl btn-lg" disabled={busy || (mode === 'ico' && !sizes.length)} onClick={make}>{busy ? 'Creating…' : mode === 'ico' ? 'Download ICO' : 'Download favicon package (ZIP)'}</button>
        <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); }}>New image</button>
      </div>
      {mode === 'favicon' && <details class="faq" style={{ marginTop: '14px' }}><summary>HTML code to add to your website</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: '.82rem' }}>{SNIPPET}</pre></details>}
    </div>
  );
}

const SNIPPET = `Upload all files to the root folder of your website, then add this inside <head>:

<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

WordPress: Appearance → Customize → Site Identity → Site Icon (upload android-chrome-512x512.png).`;
