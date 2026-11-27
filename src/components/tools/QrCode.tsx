import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadBlob } from '../../lib/utils';

type Kind = 'url' | 'text' | 'wifi' | 'whatsapp' | 'email' | 'phone';
const KINDS: [Kind, string][] = [['url', 'Website'], ['text', 'Text'], ['wifi', 'Wi-Fi'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['phone', 'Phone']];
const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

export default function QrCode() {
  const [kind, setKind] = useState<Kind>('url');
  const [f, setF] = useState<Record<string, string>>({ url: 'https://zentapdf.com', text: '', ssid: '', pass: '', enc: 'WPA', wa: '', msg: '', email: '', subject: '', phone: '' });
  const [fg, setFg] = useState('#111827');
  const [bg, setBg] = useState('#ffffff');
  const [ecl, setEcl] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [size, setSize] = useState(1024);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });

  const data = (): string => {
    switch (kind) {
      case 'url': return f.url.trim();
      case 'text': return f.text;
      case 'wifi': return f.ssid ? `WIFI:T:${f.enc};S:${esc(f.ssid)};${f.enc !== 'nopass' ? `P:${esc(f.pass)};` : ''};` : '';
      case 'whatsapp': return f.wa ? `https://wa.me/${f.wa.replace(/\D/g, '')}${f.msg ? '?text=' + encodeURIComponent(f.msg) : ''}` : '';
      case 'email': return f.email ? `mailto:${f.email}${f.subject ? '?subject=' + encodeURIComponent(f.subject) : ''}` : '';
      case 'phone': return f.phone ? `tel:${f.phone.replace(/[^\d+]/g, '')}` : '';
    }
  };

  useEffect(() => {
    const d = data(); const c = cv.current; if (!c) return;
    if (!d) { c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setErr(''); return; }
    (async () => {
      try {
        const QR = await import('qrcode');
        await QR.toCanvas(c, d, { width: size, margin: 2, errorCorrectionLevel: logo ? 'H' : ecl, color: { dark: fg, light: bg } });
        c.style.width = 'min(260px, 70vw)'; c.style.height = 'auto';
        if (logo) {
          const ctx = c.getContext('2d')!; const s = c.width * 0.22, x = (c.width - s) / 2;
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - s * 0.08, x - s * 0.08, s * 1.16, s * 1.16, s * 0.18); ctx.fill();
          ctx.drawImage(logo, x, x, s, s);
        }
        setErr('');
      } catch (e: any) { setErr(/too big|amount of data/i.test(e?.message) ? 'Too much text for one QR code, please shorten it.' : String(e?.message ?? e)); }
    })();
  }, [kind, f, fg, bg, ecl, size, logo]);

  const pickLogo = (file?: File) => { if (!file) return; const img = new Image(); img.onload = () => setLogo(img); img.src = URL.createObjectURL(file); };
  const png = () => cv.current!.toBlob((b) => b && downloadBlob(b, `qr-code-${kind}.png`), 'image/png');
  const svg = async () => {
    const QR = await import('qrcode');
    const s = await QR.toString(data(), { type: 'svg', margin: 2, errorCorrectionLevel: ecl, color: { dark: fg, light: bg } });
    downloadBlob(new Blob([s], { type: 'image/svg+xml' }), `qr-code-${kind}.svg`);
  };
  const inp = (k: string, label: string, ph = '', type = 'text', wide = true) => (
    <label style={{ flex: wide ? '1 1 100%' : '1 1 200px' }}>{label}<input type={type} value={f[k]} placeholder={ph} onInput={set(k)} style={{ width: '100%' }} /></label>
  );
  const has = !!data();

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 340px', minWidth: 0 }}>
        {<div class="seg" role="group" aria-label="QR code type" style={{ flexWrap: 'wrap', marginBottom: '12px' }}>
          {KINDS.map(([k, l]) => <button type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
        </div>}
        <div class="opts" data-title="Content" style={{ margin: 0 }}>
          {kind === 'url' && inp('url', 'Website address', 'https://example.com', 'url')}
          {kind === 'text' && <label style={{ flex: '1 1 100%' }}>Text<textarea value={f.text} rows={4} onInput={set('text')} style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '10px', font: 'inherit', background: 'var(--card)', color: 'var(--text)' }} /></label>}
          {kind === 'wifi' && <>{inp('ssid', 'Network name (SSID)')}{inp('pass', 'Password', '', 'text', false)}
            <label>Security<select value={f.enc} onChange={set('enc')}><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">None</option></select></label></>}
          {kind === 'whatsapp' && <>{inp('wa', 'WhatsApp number with country code', '91 98765 43210', 'tel')}{inp('msg', 'Pre-filled message (optional)')}</>}
          {kind === 'email' && <>{inp('email', 'Email address', '', 'email')}{inp('subject', 'Subject (optional)')}</>}
          {kind === 'phone' && inp('phone', 'Phone number', '+91 98765 43210', 'tel')}
        </div>
        <div class="opts" data-title="Style">
          <label>Colour<input type="color" value={fg} onInput={(e) => setFg((e.target as HTMLInputElement).value)} /></label>
          <label>Background<input type="color" value={bg} onInput={(e) => setBg((e.target as HTMLInputElement).value)} /></label>
          <label>Size<select value={size} onChange={(e) => setSize(+(e.target as HTMLSelectElement).value)}><option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px (print)</option></select></label>
          <label>Error correction<select value={logo ? 'H' : ecl} disabled={!!logo} onChange={(e) => setEcl((e.target as HTMLSelectElement).value as any)}><option value="L">Low</option><option value="M">Medium</option><option value="Q">High</option><option value="H">Highest</option></select></label>
          <label>Logo in centre<input type="file" accept="image/*" onChange={(e) => pickLogo((e.target as HTMLInputElement).files?.[0])} /></label>
          {logo && <button type="button" class="btn btn-ghost" onClick={() => setLogo(null)}>Remove logo</button>}
        </div>
      </div>
      <div style={{ flex: '0 1 300px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: bg, border: '1px solid var(--border)', borderRadius: '16px', padding: '12px', display: 'inline-block' }}>
          <canvas ref={cv} aria-label="QR code preview" style={{ width: 'min(260px, 70vw)', height: 'auto', display: has ? 'block' : 'none' }} />
          {!has && <div style={{ width: '260px', height: '260px', display: 'grid', placeItems: 'center', color: '#888' }}>Fill in the details</div>}
        </div>
        {err && <div class="error">{err}</div>}
        <div class="actions"><button type="button" class="btn btn-primary dl" disabled={!has || !!err} onClick={png}>Download PNG</button>
          <button type="button" class="btn btn-ghost" disabled={!has || !!err || !!logo} title={logo ? 'SVG download is without logo' : ''} onClick={svg}>SVG</button></div>
      </div>
    </div>
  );
}
