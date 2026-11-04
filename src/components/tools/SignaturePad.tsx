import { useEffect, useRef, useState } from 'preact/hooks';

// handwriting fonts (files in /fonts, also used by the editor): [label, css family, weight]
const SCRIPT_FONTS: [string, string, number][] = [['Elegant', '"ZDancing", "Dancing Script", cursive', 400], ['Bold script', '"ZDancing", "Dancing Script", cursive', 700], ['Handwriting', '"ZCaveat", "Caveat", cursive', 400], ['Classic', '"ZPlayfair", Georgia, serif', 400]];
const KEY = 'zentapdf-signatures';
export type Saved = { id: string; kind: 'signature' | 'initials'; src: string; w: number; h: number };
export const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const store = (list: Saved[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))); } catch { /* storage full or blocked */ } };

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

/** Photo of a signature on paper: make the paper transparent and (optionally) recolour the ink. */
function cleanPhoto(src: HTMLCanvasElement, ink: string | null): HTMLCanvasElement {
  const max = 1600, k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0, 0, c.width, c.height), p = id.data;
  // paper brightness: a bright percentile of the image
  const hist = new Uint32Array(256); for (let q = 0; q < p.length; q += 4) hist[(p[q] * 299 + p[q + 1] * 587 + p[q + 2] * 114) / 1000 | 0]++;
  let acc = 0, paper = 255; const n = p.length / 4; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.4) { paper = v; break; } }
  const [ir, ig, ib] = ink ? [1, 3, 5].map((o) => parseInt(ink.slice(o, o + 2), 16)) : [0, 0, 0];
  for (let q = 0; q < p.length; q += 4) {
    const l = (p[q] * 299 + p[q + 1] * 587 + p[q + 2] * 114) / 1000;
    const a = Math.max(0, Math.min(1, (paper - 18 - l) / 70)); // smooth edge between ink and paper
    p[q + 3] = Math.round(a * 255);
    if (ink) { p[q] = ir; p[q + 1] = ig; p[q + 2] = ib; }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

export default function SignaturePad({ kind = 'signature', onDone, onClose }: { kind?: 'signature' | 'initials'; onDone: (src: string, w: number, h: number) => void; onClose: () => void }) {
  const [saved, setSaved] = useState<Saved[]>(() => loadSaved().filter((s) => s.kind === kind));
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);
  const [color, setColor] = useState('#1e3a8a');
  const [pen, setPen] = useState(6);
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [recolour, setRecolour] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ pts: [number, number, number][]; color: string; pen: number }[]>([]);
  const cur = useRef<{ pts: [number, number, number][]; color: string; pen: number } | null>(null);
  const W = kind === 'initials' ? 600 : 1000, H = 360;

  // draw everything (strokes are kept, so changing the colour or undoing a stroke is easy)
  const paint = () => {
    const c = cv.current; if (!c) return;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, W, H);
    if (tab === 'draw') {
      for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
        ctx.fillStyle = ctx.strokeStyle = s.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const p = s.pts;
        if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], s.pen / 2, 0, Math.PI * 2); ctx.fill(); continue; }
        // smooth curve through the points; faster movement = thinner line, like a real pen
        for (let i = 1; i < p.length; i++) {
          const [x0, y0] = i > 1 ? [(p[i - 2][0] + p[i - 1][0]) / 2, (p[i - 2][1] + p[i - 1][1]) / 2] : p[0];
          const [x2, y2] = [(p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2];
          const v = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) / Math.max(1, p[i][2] - p[i - 1][2]);
          ctx.lineWidth = s.pen * Math.max(0.45, Math.min(1.25, 1.3 - v * 0.18));
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(p[i - 1][0], p[i - 1][1], i === p.length - 1 ? p[i][0] : x2, i === p.length - 1 ? p[i][1] : y2); ctx.stroke();
        }
      }
    } else if (tab === 'type' && name) {
      const [, fam, wt] = SCRIPT_FONTS[font];
      let size = kind === 'initials' ? 190 : 150; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      do { ctx.font = `${fam === SCRIPT_FONTS[3][1] ? 'italic ' : ''}${wt} ${size}px ${fam}`; size -= 6; } while (ctx.measureText(name).width > W - 60 && size > 30);
      ctx.fillText(name, W / 2, H / 2 + 10);
    } else if (tab === 'upload' && photo) {
      const img = cleanPhoto(photo, recolour ? color : null);
      const k = Math.min((W - 20) / img.width, (H - 20) / img.height);
      ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    }
  };
  useEffect(() => { paint(); }, [tab, name, font, color, photo, recolour]);
  useEffect(() => { // handwriting fonts must be loaded before drawing on the canvas
    Promise.all(SCRIPT_FONTS.map(([, f, w]) => document.fonts.load(`${w} 40px ${f}`).catch(() => 0))).then(() => paint());
  }, []);

  const pos = (e: PointerEvent): [number, number, number] => { const c = cv.current!, r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, e.timeStamp]; };
  const down = (e: PointerEvent) => { if (tab !== 'draw') return; (e.target as HTMLElement).setPointerCapture(e.pointerId); cur.current = { pts: [pos(e)], color, pen }; setErr(''); paint(); };
  const move = (e: PointerEvent) => { if (!cur.current) return; const evs = (e as any).getCoalescedEvents?.() ?? [e]; for (const ev of evs) cur.current.pts.push(pos(ev)); paint(); };
  const up = () => { if (cur.current) { strokes.current.push(cur.current); cur.current = null; } };
  const clear = () => { strokes.current = []; setName(''); setPhoto(null); paint(); };
  const undoStroke = () => { strokes.current.pop(); paint(); };
  useEffect(() => { strokes.current.forEach((s) => (s.color = color)); paint(); }, [color]);

  const use = (src: string, w: number, h: number) => {
    if (keep) { const list = [{ id: Date.now().toString(36), kind, src, w, h }, ...loadSaved().filter((s) => s.src !== src)]; store(list); }
    onDone(src, w, h);
  };
  const finish = () => {
    const r = trim(cv.current!);
    if (!r) { setErr(tab === 'type' ? 'Please type your name.' : tab === 'upload' ? 'Please choose a photo of your signature.' : `Please draw your ${kind} first.`); return; }
    use(...r);
  };
  const upload = async (f?: File) => {
    if (!f) return;
    const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); setPhoto(c); setErr('');
  };
  const forget = (id: string) => { const list = loadSaved().filter((s) => s.id !== id); store(list); setSaved(list.filter((s) => s.kind === kind)); };
  const label = kind === 'initials' ? 'initials' : 'signature';

  return (
    <div role="dialog" aria-modal="true" aria-label={`Add ${label}`} onClick={(e) => e.target === e.currentTarget && onClose()} class="sigpad-bg">
      <div class="sigpad">
        <div class="sp-head">
          <strong>{kind === 'initials' ? 'Add your initials' : 'Add your signature'}</strong>
          <button type="button" class="mini" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {saved.length > 0 && (
          <div class="sp-saved">
            <span>Saved on this device · click to use</span>
            <div>{saved.map((s) => (
              <span class="sp-item"><button type="button" aria-label={`Use saved ${label}`} onClick={() => onDone(s.src, s.w, s.h)}><img src={s.src} alt="" /></button>
                <button type="button" class="sp-del" aria-label="Delete saved signature" onClick={() => forget(s.id)}>✕</button></span>
            ))}</div>
          </div>
        )}
        <div class="seg" role="group" aria-label="Signature type" style={{ marginBottom: '10px' }}>
          {(['draw', 'type', 'upload'] as const).map((t) => <button type="button" aria-pressed={tab === t} onClick={() => { setTab(t); setErr(''); }}>{t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload photo'}</button>)}
        </div>
        {tab === 'type' && <div class="sp-type">
          <input type="text" value={name} maxLength={kind === 'initials' ? 6 : 40} placeholder={kind === 'initials' ? 'Your initials, e.g. S.G.' : 'Your full name'} aria-label="Your name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <div class="sp-fonts">{SCRIPT_FONTS.map(([l, fam, wt], i) => (
            <button type="button" aria-pressed={font === i} onClick={() => setFont(i)} style={{ fontFamily: fam, fontWeight: wt, fontStyle: i === 3 ? 'italic' : 'normal', color }}>{name || (kind === 'initials' ? 'S.G.' : 'Your name')}<small>{l}</small></button>
          ))}</div>
        </div>}
        {tab === 'upload' && !photo && (
          <label class="drop" style={{ display: 'block' }}>
            <span class="btn btn-primary">Choose photo</span>
            <p>Sign on white paper and take a photo. The paper is removed automatically.</p>
            <input type="file" accept="image/*" hidden onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
          </label>
        )}
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} class="sp-canvas"
          style={{ aspectRatio: `${W} / ${H}`, display: tab === 'upload' && !photo ? 'none' : 'block', cursor: tab === 'draw' ? 'crosshair' : 'default', backgroundImage: 'linear-gradient(transparent calc(78% - 1px), #cbd5e1 calc(78% - 1px), #cbd5e1 78%, transparent 78%)' }} />
        {tab === 'draw' && <p class="sp-hint">Sign above the line with your mouse, finger or pen.</p>}
        <div class="sp-tools">
          {['#1e3a8a', '#111827', '#b91c1c', '#047857'].map((c) => <button type="button" class={`sp-col ${color === c ? 'on' : ''}`} aria-label={'Ink colour ' + c} onClick={() => setColor(c)} style={{ background: c }} />)}
          {tab === 'draw' && <label class="sp-pen">Pen <input type="range" min={2} max={14} value={pen} aria-label="Pen thickness" onInput={(e) => { setPen(+(e.target as HTMLInputElement).value); strokes.current.forEach((s) => (s.pen = +(e.target as HTMLInputElement).value)); paint(); }} /></label>}
          {tab === 'upload' && photo && <label class="sp-chk"><input type="checkbox" checked={recolour} onChange={(e) => setRecolour((e.target as HTMLInputElement).checked)} /> Use ink colour</label>}
          {tab === 'draw' && <button type="button" class="btn btn-ghost sp-small" onClick={undoStroke}>Undo</button>}
          <button type="button" class="btn btn-ghost sp-small" onClick={clear}>Clear</button>
        </div>
        <div class="sp-foot">
          <label class="sp-chk"><input type="checkbox" checked={keep} onChange={(e) => setKeep((e.target as HTMLInputElement).checked)} /> Save on this device for next time</label>
          <button type="button" class="btn btn-primary" onClick={finish}>Use {label}</button>
        </div>
        {err && <div class="error" role="alert">{err}</div>}
      </div>
    </div>
  );
}
