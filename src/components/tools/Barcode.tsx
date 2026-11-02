import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadBlob } from '../../lib/utils';

const FORMATS: [string, string, string][] = [
  ['CODE128', 'Code 128 (any text)', 'ZENTA-12345'], ['EAN13', 'EAN-13 (retail products)', '890123456789'], ['EAN8', 'EAN-8', '1234567'],
  ['UPC', 'UPC-A (USA/Canada)', '01234567890'], ['CODE39', 'Code 39', 'ABC-123'], ['ITF14', 'ITF-14 (cartons)', '1234567890123'],
];

export default function Barcode() {
  const [fmt, setFmt] = useState('CODE128');
  const [value, setValue] = useState('ZENTA-12345');
  const [showText, setShowText] = useState(true);
  const [height, setHeight] = useState(100);
  const [width, setWidth] = useState(2);
  const [fg, setFg] = useState('#000000');
  const [err, setErr] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    (async () => {
      const JsBarcode = (await import('jsbarcode')).default;
      let ok = true;
      try {
        JsBarcode(svgRef.current, value, { format: fmt, displayValue: showText, height, width, lineColor: fg, background: '#ffffff', margin: 12, fontSize: 18, valid: (v: boolean) => { ok = v; } });
      } catch { ok = false; }
      setErr(ok ? '' : fmt.startsWith('EAN') || fmt === 'UPC' || fmt === 'ITF14' ? `This value is not valid for ${fmt}. Use digits only (${fmt === 'EAN13' ? '12 or 13' : fmt === 'EAN8' ? '7 or 8' : fmt === 'UPC' ? '11 or 12' : '13 or 14'} digits).` : 'This value cannot be encoded in this barcode type.');
    })();
  }, [fmt, value, showText, height, width, fg]);

  const svgText = () => new XMLSerializer().serializeToString(svgRef.current!);
  const dlSvg = () => downloadBlob(new Blob([svgText()], { type: 'image/svg+xml' }), `barcode-${value}.svg`);
  const dlPng = () => {
    const img = new Image(); const s = svgRef.current!; const w = s.width.baseVal.value, h = s.height.baseVal.value;
    img.onload = () => { const c = document.createElement('canvas'); c.width = w * 3; c.height = h * 3; const ctx = c.getContext('2d')!; ctx.scale(3, 3); ctx.drawImage(img, 0, 0); c.toBlob((b) => b && downloadBlob(b, `barcode-${value}.png`)); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText());
  };

  return (
    <div>
      <div class="opts">
        <label>Barcode type<select value={fmt} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setFmt(v); setValue(FORMATS.find((x) => x[0] === v)![2]); }}>{FORMATS.map(([v, l]) => <option value={v}>{l}</option>)}</select></label>
        <label style={{ flex: '1 1 220px' }}>Value<input type="text" value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} style={{ width: '100%' }} /></label>
        <label>Bar height<select value={height} onChange={(e) => setHeight(+(e.target as HTMLSelectElement).value)}><option value={60}>Short</option><option value={100}>Normal</option><option value={150}>Tall</option></select></label>
        <label>Bar width<select value={width} onChange={(e) => setWidth(+(e.target as HTMLSelectElement).value)}><option value={1}>Thin</option><option value={2}>Normal</option><option value={3}>Wide</option></select></label>
        <label>Colour<input type="color" value={fg} onInput={(e) => setFg((e.target as HTMLInputElement).value)} /></label>
        <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={showText} onChange={(e) => setShowText((e.target as HTMLInputElement).checked)} /> Show text</label>
      </div>
      <div style={{ textAlign: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', overflowX: 'auto' }}>
        <svg ref={svgRef} aria-label="Barcode preview" style={{ maxWidth: '100%', height: 'auto', visibility: err ? 'hidden' : 'visible' }} />
      </div>
      {err && <div class="error" role="alert">{err}</div>}
      <div class="actions">
        <button type="button" class="btn btn-primary btn-lg" disabled={!!err || !value} onClick={dlPng}>Download PNG</button>
        <button type="button" class="btn btn-ghost" disabled={!!err || !value} onClick={dlSvg}>Download SVG</button>
      </div>
      <p class="status">EAN and UPC check digits are added automatically when you leave out the last digit.</p>
    </div>
  );
}
