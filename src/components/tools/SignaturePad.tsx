import { useEffect, useRef, useState } from 'preact/hooks';

const SCRIPT_FONTS = ['"Segoe Script", "Brush Script MT", "Apple Chancery", cursive', '"Lucida Handwriting", "Snell Roundhand", cursive', 'Georgia, "Times New Roman", serif'];

/** Crop transparent edges of a canvas and return a PNG data URL. */
function trim(c: HTMLCanvasElement): [string, number, number] | null {
  const ctx = c.getContext('2d')!; const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return [o.toDataURL('image/png'), o.width, o.height];
}

export default function SignaturePad({ onDone, onClose }: { onDone: (src: string, w: number, h: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);
  const [color, setColor] = useState('#1e3a8a');
  const [err, setErr] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = 1000; c.height = 360;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, c.width, c.height);
    if (tab === 'type' && name) {
      let size = 150; ctx.fillStyle = color; ctx.textBaseline = 'middle';
      do { ctx.font = `italic ${size}px ${SCRIPT_FONTS[font]}`; size -= 6; } while (ctx.measureText(name).width > 940 && size > 30);
      ctx.fillText(name, 30, 180);
    }
  }, [tab, name, font, color]);

  const pos = (e: PointerEvent) => { const c = cv.current!, r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
  const down = (e: PointerEvent) => { if (tab !== 'draw') return; drawing.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); const ctx = cv.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: PointerEvent) => { if (!drawing.current) return; const ctx = cv.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); };

  const finish = () => { const r = trim(cv.current!); if (!r) { setErr(tab === 'type' ? 'Please type your name.' : 'Please draw your signature first.'); return; } onDone(...r); };
  const upload = async (f?: File) => {
    if (!f) return;
    const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0); onDone(c.toDataURL('image/png'), bmp.width, bmp.height); bmp.close();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Add signature" onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / .5)', zIndex: 50, display: 'grid', placeItems: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', color: 'var(--text)', borderRadius: '16px', padding: '18px', width: 'min(560px, 100%)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <strong>Add your signature</strong>
          <button type="button" class="mini" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div class="seg" role="group" aria-label="Signature type" style={{ marginBottom: '10px' }}>
          <button type="button" aria-pressed={tab === 'draw'} onClick={() => { setTab('draw'); setErr(''); }}>Draw</button>
          <button type="button" aria-pressed={tab === 'type'} onClick={() => { setTab('type'); setErr(''); }}>Type</button>
          <button type="button" aria-pressed={tab === 'upload'} onClick={() => { setTab('upload'); setErr(''); }}>Upload</button>
        </div>
        {tab === 'type' && <div class="opts" style={{ margin: '0 0 8px' }}>
          <label style={{ flex: 1 }}>Your name<input type="text" value={name} maxLength={40} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: '100%' }} /></label>
          <label>Style<select value={font} onChange={(e) => setFont(+(e.target as HTMLSelectElement).value)}><option value={0}>Script</option><option value={1}>Handwriting</option><option value={2}>Classic</option></select></label>
        </div>}
        {tab !== 'upload' ? <>
          <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ width: '100%', aspectRatio: '1000 / 360', background: '#fff', border: '1px dashed var(--border)', borderRadius: '10px', touchAction: 'none', cursor: tab === 'draw' ? 'crosshair' : 'default' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
            {['#1e3a8a', '#111827', '#b91c1c'].map((c) => <button type="button" aria-label={'Colour ' + c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: color === c ? '3px solid var(--brand-100)' : '1px solid var(--border)', cursor: 'pointer' }} />)}
            {tab === 'draw' && <button type="button" class="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={clear}>Clear</button>}
            <span style={{ flex: 1 }} />
            <button type="button" class="btn btn-primary" onClick={finish}>Use signature</button>
          </div>
        </> : (
          <label class="drop" style={{ display: 'block' }}>
            <span class="btn btn-primary">Choose image</span>
            <p>A photo or scan of your signature (PNG with transparent background looks best)</p>
            <input type="file" accept="image/*" hidden onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
          </label>
        )}
        {err && <div class="error" role="alert">{err}</div>}
      </div>
    </div>
  );
}
