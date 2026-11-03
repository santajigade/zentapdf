import { useEffect, useRef, useState } from 'preact/hooks';

const COLORS: [string, string][] = [['#000000', 'Black'], ['#ffffff', 'White'], ['#ff0000', 'Red'], ['#00ff00', 'Green'], ['#0000ff', 'Blue'], ['#ffff00', 'Yellow'], ['#00ffff', 'Cyan'], ['#ff00ff', 'Magenta'], ['#808080', 'Grey']];

export default function DeadPixelTest() {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const [fix, setFix] = useState(false);
  const [hint, setHint] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);

  const open = async (mode: 'test' | 'fix') => {
    setFix(mode === 'fix'); setI(0); setHint(true); setOn(true);
    try { await box.current?.requestFullscreen?.(); } catch { /* still works without fullscreen */ }
  };
  const close = () => { setOn(false); setAuto(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (['ArrowRight', ' ', 'Enter', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setI((x) => (x + 1) % COLORS.length); setHint(false); }
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setI((x) => (x + COLORS.length - 1) % COLORS.length); setHint(false); }
    };
    const fs = () => { if (!document.fullscreenElement) setOn(false); };
    window.addEventListener('keydown', k); document.addEventListener('fullscreenchange', fs);
    const t = setTimeout(() => setHint(false), 4000);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('fullscreenchange', fs); clearTimeout(t); };
  }, [on]);
  useEffect(() => { if (!auto || !on) return; const t = setInterval(() => setI((x) => (x + 1) % COLORS.length), 2000); return () => clearInterval(t); }, [auto, on]);
  // stuck-pixel fixer: rapidly changing colours in a small square
  useEffect(() => {
    if (!on || !fix) return; let r = 0; const f = () => { const el = flash.current; if (el) { const c = ['#f00', '#0f0', '#00f', '#fff', '#000']; el.style.background = c[Math.floor(Math.random() * c.length)]; } r = requestAnimationFrame(f); }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r);
  }, [on, fix]);

  return (
    <div>
      <div class="dp-preview">{COLORS.map(([c, n]) => <span title={n} style={{ background: c }} />)}</div>
      <div class="dt-start">
        <button type="button" class="btn btn-primary btn-lg" onClick={() => open('test')}>Start dead pixel test (full screen)</button>
        <p class="status">Click or tap to change colour · arrow keys back and forward · Esc to exit</p>
        <button type="button" class="btn btn-ghost" onClick={() => open('fix')}>Stuck pixel fixer</button>
        <p class="status" style={{ fontSize: '.82rem' }}>⚠ The fixer flashes colours quickly. Do not use it if you are sensitive to flashing lights.</p>
      </div>
      <div ref={box} class={'dp-full' + (on ? ' on' : '')} style={{ background: fix ? '#000' : COLORS[i][0] }}
        onClick={() => { if (!fix) { setI((x) => (x + 1) % COLORS.length); setHint(false); } }} onContextMenu={(e) => { e.preventDefault(); setI((x) => (x + COLORS.length - 1) % COLORS.length); }}>
        {on && fix && <div ref={flash} class="dp-flash" onPointerDown={(e) => { const el = e.currentTarget as HTMLDivElement; const move = (ev: PointerEvent) => { el.style.left = ev.clientX - 60 + 'px'; el.style.top = ev.clientY - 60 + 'px'; }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} />}
        {on && (hint || fix) && <div class="dp-hint" onClick={(e) => e.stopPropagation()}>
          {fix ? 'Drag the flashing square over the stuck pixel and leave it for 10–20 minutes.' : `${COLORS[i][1]} — click for the next colour.`}
          {!fix && <label style={{ marginLeft: '10px' }}><input type="checkbox" checked={auto} onChange={(e) => setAuto((e.target as HTMLInputElement).checked)} /> Auto</label>}
          <button type="button" onClick={close}>Exit (Esc)</button>
        </div>}
      </div>
    </div>
  );
}
