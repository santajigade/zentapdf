import { useEffect, useRef, useState } from 'preact/hooks';

const NAMES = ['Left', 'Middle (wheel)', 'Right', 'Back (side)', 'Forward (side)'];

export default function MouseTest() {
  const [down, setDown] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [wheel, setWheel] = useState({ up: 0, down: 0, left: 0, right: 0 });
  const [dbl, setDbl] = useState(0);
  const [last, setLast] = useState('');
  const [fault, setFault] = useState<string[]>([]);
  const [gap, setGap] = useState<number | null>(null);
  const lastDown = useRef<number[]>([0, 0, 0, 0, 0]);
  const lastUp = useRef<number[]>([0, 0, 0, 0, 0]);
  const area = useRef<HTMLDivElement>(null);
  // block page scrolling while the wheel is used inside the test box
  useEffect(() => { const el = area.current; if (!el) return; const f = (e: WheelEvent) => e.preventDefault(); el.addEventListener('wheel', f, { passive: false }); return () => el.removeEventListener('wheel', f); }, []);

  const pd = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    e.preventDefault();
    const b = e.button; if (b < 0 || b > 4) return;
    const now = performance.now();
    const since = now - lastUp.current[b];
    if (lastDown.current[b] && since < 60 && b === 0) setFault((f) => [`${NAMES[b]}: two clicks only ${Math.round(now - lastDown.current[b])} ms apart, the switch may be double-clicking by itself.`, ...f].slice(0, 4));
    if (b === 0 && lastDown.current[0]) setGap(Math.round(now - lastDown.current[0]));
    lastDown.current[b] = now;
    setDown((d) => new Set(d).add(b));
    setCounts((c) => c.map((v, i) => (i === b ? v + 1 : v)));
    setLast(NAMES[b]);
  };
  const pu = (e: PointerEvent) => { const b = e.button; lastUp.current[b] = performance.now(); setDown((d) => { const n = new Set(d); n.delete(b); return n; }); };
  const wh = (e: WheelEvent) => {
    e.preventDefault();
    setWheel((w) => ({ up: w.up + (e.deltaY < 0 ? 1 : 0), down: w.down + (e.deltaY > 0 ? 1 : 0), left: w.left + (e.deltaX < 0 ? 1 : 0), right: w.right + (e.deltaX > 0 ? 1 : 0) }));
    setLast(e.deltaY < 0 ? 'Scroll up' : e.deltaY > 0 ? 'Scroll down' : e.deltaX < 0 ? 'Tilt left' : 'Tilt right');
  };
  const fill = (b: number) => (down.has(b) ? '#4f46e5' : counts[b] ? '#86efac' : '#f1f5f9');
  return (
    <div>
      <div class="ms-area" onPointerDown={pd as any} onPointerUp={pu as any} onPointerCancel={pu as any} onContextMenu={(e) => e.preventDefault()} onAuxClick={(e) => e.preventDefault()} onDblClick={() => setDbl((d) => d + 1)} onWheel={wh as any} ref={area}>
        <svg viewBox="0 0 200 300" class="ms-svg" aria-hidden="true">
          <path d="M100 10 C150 10 180 50 180 110 V200 C180 255 145 290 100 290 C55 290 20 255 20 200 V110 C20 50 50 10 100 10 Z" fill="#fff" stroke="#334155" stroke-width="4" />
          <path d="M100 12 C55 12 22 50 22 110 V125 H98 V12 Z" fill={fill(0)} stroke="#334155" stroke-width="3" />
          <path d="M102 12 C145 12 178 50 178 110 V125 H102 V12 Z" fill={fill(2)} stroke="#334155" stroke-width="3" />
          <rect x="90" y="40" width="20" height="50" rx="10" fill={fill(1)} stroke="#334155" stroke-width="3" />
          <rect x="8" y="140" width="14" height="34" rx="6" fill={fill(4)} stroke="#334155" stroke-width="3" />
          <rect x="8" y="180" width="14" height="34" rx="6" fill={fill(3)} stroke="#334155" stroke-width="3" />
          <text x="100" y="215" text-anchor="middle" font-size="16" fill="#64748b">{last || 'Click here'}</text>
        </svg>
        <p class="ms-hint">Click, right-click, scroll and use the side buttons inside this box</p>
      </div>
      <div class="dt-results">
        {NAMES.map((n, i) => <div key={n}><span>{n}</span><b>{counts[i]}</b></div>)}
        <div><span>Scroll up / down</span><b>{wheel.up} / {wheel.down}</b></div>
        <div><span>Double-clicks</span><b>{dbl}</b><small>{gap !== null ? `last gap ${gap} ms` : ''}</small></div>
      </div>
      {fault.length > 0 && <div class="error" role="alert">{fault.map((f) => <div>{f}</div>)}</div>}
      <div class="actions" style={{ justifyContent: 'flex-start' }}><button type="button" class="btn btn-ghost" onClick={() => { setCounts([0, 0, 0, 0, 0]); setWheel({ up: 0, down: 0, left: 0, right: 0 }); setDbl(0); setLast(''); setFault([]); setGap(null); }}>Reset</button></div>
    </div>
  );
}
