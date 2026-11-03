import { useEffect, useRef, useState } from 'preact/hooks';

const COLS = ['#4f46e5', '#e5484d', '#16a34a', '#f59e0b', '#0891b2', '#d6409f', '#8e4ec6', '#f76b15', '#12a594', '#3e63dd'];

export default function TouchTest() {
  const [mode, setMode] = useState<'draw' | 'grid'>('draw');
  const [now, setNow] = useState(0);
  const [max, setMax] = useState(0);
  const [info, setInfo] = useState<{ type: string; pressure: number; w: number; h: number } | null>(null);
  const [hit, setHit] = useState<Set<number>>(new Set());
  const [full, setFull] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number; c: string }>());
  const GX = 8, GY = 12;

  const resize = () => { const c = cv.current, w = wrap.current; if (!c || !w) return; const r = w.getBoundingClientRect(); const d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; c.getContext('2d')!.setTransform(d, 0, 0, d, 0, 0); };
  useEffect(() => { resize(); window.addEventListener('resize', resize); const fs = () => { setFull(!!document.fullscreenElement); setTimeout(resize, 50); }; document.addEventListener('fullscreenchange', fs); return () => { window.removeEventListener('resize', resize); document.removeEventListener('fullscreenchange', fs); }; }, []);
  useEffect(() => { setTimeout(resize, 0); }, [mode]);

  const pos = (e: PointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, r }; };
  const mark = (x: number, y: number, r: DOMRect) => { const gx = Math.min(GX - 1, Math.floor((x / r.width) * GX)), gy = Math.min(GY - 1, Math.floor((y / r.height) * GY)); const k = gy * GX + gx; setHit((h) => (h.has(k) ? h : new Set(h).add(k))); };
  const down = (e: PointerEvent) => {
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const { x, y, r } = pos(e); const c = COLS[pts.current.size % COLS.length]; pts.current.set(e.pointerId, { x, y, c });
    setNow(pts.current.size); setMax((m) => Math.max(m, pts.current.size)); setInfo({ type: e.pointerType, pressure: e.pressure, w: e.width, h: e.height });
    const g = cv.current!.getContext('2d')!; g.fillStyle = c; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
    if (mode === 'grid') mark(x, y, r);
  };
  const move = (e: PointerEvent) => {
    const p = pts.current.get(e.pointerId); if (!p) return; e.preventDefault();
    const { x, y, r } = pos(e); const g = cv.current!.getContext('2d')!;
    g.strokeStyle = p.c; g.lineWidth = Math.max(3, (e.pressure || 0.5) * 14); g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(x, y); g.stroke();
    p.x = x; p.y = y; setInfo({ type: e.pointerType, pressure: e.pressure, w: e.width, h: e.height });
    if (mode === 'grid') mark(x, y, r);
  };
  const up = (e: PointerEvent) => { pts.current.delete(e.pointerId); setNow(pts.current.size); };
  const clear = () => { const c = cv.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHit(new Set()); setMax(0); };
  const goFull = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await wrap.current?.parentElement?.requestFullscreen(); } catch { /* not supported */ } };

  return (
    <div class="tt-shell">
      <div class="dt-bar">
        <div class="seg" role="group" aria-label="Mode">{([['draw', 'Draw & multi-touch'], ['grid', 'Dead-zone grid']] as const).map(([v, t]) => <button type="button" aria-pressed={mode === v} onClick={() => { setMode(v); clear(); }}>{t}</button>)}</div>
        <div style={{ display: 'flex', gap: '8px' }}><button type="button" class="btn btn-ghost" onClick={clear}>Clear</button><button type="button" class="btn btn-ghost" onClick={goFull}>{full ? 'Exit full screen' : 'Full screen'}</button></div>
      </div>
      <div ref={wrap} class={'tt-area' + (full ? ' full' : '')} onPointerDown={down as any} onPointerMove={move as any} onPointerUp={up as any} onPointerCancel={up as any} onContextMenu={(e) => e.preventDefault()}>
        {mode === 'grid' && <div class="tt-grid" style={{ gridTemplateColumns: `repeat(${GX},1fr)`, gridTemplateRows: `repeat(${GY},1fr)` }}>{Array.from({ length: GX * GY }, (_, k) => <span class={hit.has(k) ? 'on' : ''} />)}</div>}
        <canvas ref={cv} />
        {now === 0 && !hit.size && <div class="tt-hint">{mode === 'grid' ? 'Swipe over every square — squares that stay grey may be dead zones' : 'Touch with one or more fingers and draw'}</div>}
      </div>
      <div class="dt-results">
        <div><span>Touches now</span><b>{now}</b></div>
        <div><span>Most at once</span><b>{max}</b><small>{max >= 5 ? 'multi-touch works' : 'try 5 fingers'}</small></div>
        {mode === 'grid' && <div><span>Area tested</span><b>{Math.round((hit.size / (GX * GY)) * 100)}%</b></div>}
        <div><span>Input</span><b style={{ fontSize: '1rem' }}>{info ? info.type : '–'}</b><small>{info ? `size ${Math.round(info.w)}×${Math.round(info.h)} px${info.pressure && info.pressure !== 0.5 ? ` · pressure ${info.pressure.toFixed(2)}` : ''}` : ''}</small></div>
      </div>
    </div>
  );
}
