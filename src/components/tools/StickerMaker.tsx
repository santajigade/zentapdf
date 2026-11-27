import { useEffect, useState } from 'preact/hooks';
import ImageBatch from './ImageBatch';
import { loadBitmap, canEncode, outName } from '../../lib/imageOps';

const S = 512;

/** Draw the image centred in 512×512 with optional rounded corners, white outline and caption. */
async function makeSticker(file: File, o: { pad: number; outline: number; round: boolean; caption: string; capColor: string }) {
  const bmp = await loadBitmap(file);
  const inner = S - o.pad * 2 - o.outline * 2 - (o.caption ? 70 : 0);
  const s = Math.min(inner / bmp.width, inner / bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  // image layer (optionally rounded)
  const img = document.createElement('canvas'); img.width = w; img.height = h;
  const ic = img.getContext('2d')!; ic.imageSmoothingQuality = 'high';
  if (o.round) { ic.beginPath(); ic.roundRect(0, 0, w, h, Math.min(w, h) * 0.12); ic.clip(); }
  ic.drawImage(bmp, 0, 0, w, h); bmp.close();
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const x = (S - w) / 2, y = (S - h - (o.caption ? 70 : 0)) / 2;
  if (o.outline) {
    // white silhouette drawn around the shape
    const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
    const sc = sil.getContext('2d')!; sc.drawImage(img, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#fff'; sc.fillRect(0, 0, w, h);
    for (let a = 0; a < 360; a += 15) { const r = (a * Math.PI) / 180; ctx.drawImage(sil, x + Math.cos(r) * o.outline, y + Math.sin(r) * o.outline); }
  }
  ctx.drawImage(img, x, y);
  if (o.caption) {
    ctx.font = '800 48px Impact, "Arial Black", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    let size = 48; while (ctx.measureText(o.caption).width > S - 30 && size > 20) { size -= 2; ctx.font = `800 ${size}px Impact, "Arial Black", Arial, sans-serif`; }
    ctx.lineWidth = Math.max(4, size / 6); ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
    ctx.strokeText(o.caption, S / 2, S - 14); ctx.fillStyle = o.capColor; ctx.fillText(o.caption, S / 2, S - 14);
  }
  // WhatsApp stickers: WebP, 512×512, under 100 KB
  const webp = await canEncode('image/webp');
  const type = webp ? 'image/webp' : 'image/png';
  let blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.9));
  for (let q = 0.8; webp && blob.size > 100 * 1024 && q >= 0.3; q -= 0.1) blob = await new Promise((r) => c.toBlob((b) => r(b!), type, q));
  return { blob, name: outName(file.name, '-sticker', type), info: `512×512 ${webp ? 'WebP' : 'PNG'}` };
}

export default function StickerMaker() {
  const [pad, setPad] = useState(16);
  const [outline, setOutline] = useState(8);
  const [round, setRound] = useState(true);
  const [caption, setCaption] = useState('');
  const [capColor, setCapColor] = useState('#111827');
  const [webp, setWebp] = useState(true);
  useEffect(() => { canEncode('image/webp').then(setWebp); }, []);
  const o = { pad, outline, round, caption: caption.trim(), capColor };
  return (
    <ImageBatch actionLabel="Make" zipName="whatsapp-stickers.zip" max={30} process={(f) => makeSticker(f, o)} optionsKey={JSON.stringify(o)}
      hint="Photos or PNG images with transparent background, up to 30 at a time"
      preview={(items) => <StickerPreview file={items[0].file} o={o} />}
      options={<>
        <label>White outline<select value={outline} onChange={(e) => setOutline(+(e.target as HTMLSelectElement).value)}><option value={0}>None</option><option value={5}>Thin</option><option value={8}>Normal</option><option value={14}>Thick</option></select></label>
        <label>Margin<select value={pad} onChange={(e) => setPad(+(e.target as HTMLSelectElement).value)}><option value={0}>None</option><option value={16}>Small</option><option value={40}>Large</option></select></label>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={round} onChange={(e) => setRound((e.target as HTMLInputElement).checked)} /> Rounded corners</label>
        <label style={{ flex: '1 1 200px' }}>Caption (optional)<input type="text" value={caption} maxLength={30} placeholder="e.g. Good morning!" onInput={(e) => setCaption((e.target as HTMLInputElement).value)} style={{ width: '100%' }} /></label>
        {caption && <label>Caption colour<input type="color" value={capColor} onInput={(e) => setCapColor((e.target as HTMLInputElement).value)} /></label>}
        {!webp && <span class="status" style={{ color: 'var(--err)' }}>This browser can't create WebP, stickers are saved as PNG. Use Chrome for WebP.</span>}
      </>} />
  );
}

function StickerPreview({ file, o }: { file: File; o: any }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let u = ''; makeSticker(file, o).then((r) => { u = URL.createObjectURL(r.blob); setUrl(u); }).catch(() => {}); return () => u && URL.revokeObjectURL(u); }, [file, JSON.stringify(o)]);
  return (
    <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0' }}>
      <div style={{ background: '#e5ddd5', borderRadius: '14px', padding: '18px', width: '240px', height: '240px', display: 'grid', placeItems: 'center' }} title="Preview on a WhatsApp-style background">
        {url && <img src={url} alt="Sticker preview" style={{ width: '200px', height: '200px' }} />}
      </div>
    </div>
  );
}
