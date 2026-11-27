import { useRef, useState } from 'preact/hooks';

type Ev = { t: number; gap: number | null; kind: 'single' | 'double' | 'chatter' };

export default function DoubleClickTest() {
  const [btn, setBtn] = useState(0);
  const [limit, setLimit] = useState(500);
  const [events, setEvents] = useState<Ev[]>([]);
  const [flash, setFlash] = useState<'' | 'single' | 'double' | 'chatter'>('');
  const lastDown = useRef(0); const lastUp = useRef(0);
  const counts = { single: events.filter((e) => e.kind === 'single').length, double: events.filter((e) => e.kind === 'double').length, chatter: events.filter((e) => e.kind === 'chatter').length };
  const pd = (e: PointerEvent) => {
    if (e.button !== btn) return; e.preventDefault();
    const now = performance.now(); const gap = lastDown.current ? now - lastDown.current : null; const sinceUp = now - lastUp.current;
    // a "click" that starts less than 80 ms after the previous release is faster than any human, the switch is bouncing
    const kind: Ev['kind'] = gap !== null && gap < 80 && sinceUp < 40 ? 'chatter' : gap !== null && gap <= limit ? 'double' : 'single';
    lastDown.current = now;
    setEvents((ev) => [{ t: now, gap, kind }, ...ev].slice(0, 200)); setFlash(kind); setTimeout(() => setFlash(''), 180);
  };
  const pu = (e: PointerEvent) => { if (e.button === btn) lastUp.current = performance.now(); };
  const gaps = events.filter((e) => e.kind === 'double' && e.gap).map((e) => e.gap!);
  const fastest = gaps.length ? Math.min(...gaps) : null;
  return (
    <div>
      <div class="opts" data-title="Settings">
        <div class="seg" role="group" aria-label="Button">{[[0, 'Left button'], [2, 'Right button'], [1, 'Middle']].map(([v, t]) => <button type="button" aria-pressed={btn === v} onClick={() => { setBtn(v as number); setEvents([]); lastDown.current = 0; }}>{t}</button>)}</div>
        <label>Double-click speed<select value={limit} onChange={(e) => setLimit(+(e.target as HTMLSelectElement).value)}>{[200, 300, 400, 500, 700, 900].map((v) => <option value={v}>{v} ms{v === 500 ? ' (Windows default)' : ''}</option>)}</select></label>
      </div>
      <div class={'dc-area ' + flash} onPointerDown={pd as any} onPointerUp={pu as any} onContextMenu={(e) => e.preventDefault()} onAuxClick={(e) => e.preventDefault()}>
        <strong>{flash === 'chatter' ? '⚠ Chatter detected!' : flash === 'double' ? 'Double-click!' : flash === 'single' ? 'Click' : 'Click here'}</strong>
        <span>Single-click slowly to check for faults · double-click to test speed</span>
      </div>
      <div class="dt-results">
        <div><span>Single clicks</span><b>{counts.single}</b></div>
        <div><span>Double-clicks</span><b>{counts.double}</b><small>{fastest ? `fastest ${Math.round(fastest)} ms` : ''}</small></div>
        <div style={counts.chatter ? { background: '#fee2e2', borderColor: '#fca5a5' } : {}}><span>Faulty double-clicks</span><b>{counts.chatter}</b><small>{counts.chatter ? 'the switch is bouncing' : 'none found'}</small></div>
      </div>
      {counts.chatter > 0 && <div class="error" role="alert">Your mouse sent {counts.chatter} click{counts.chatter > 1 ? 's' : ''} that arrived less than 80 ms after letting go, faster than a person can click. This "double-click fault" usually means the switch inside the mouse is worn.</div>}
      {events.length > 0 && <div class="dc-log">{events.slice(0, 12).map((e) => <span class={e.kind}>{e.kind === 'chatter' ? '⚠' : e.kind === 'double' ? '⧉' : '•'} {e.gap === null ? 'first' : `${Math.round(e.gap)} ms`}</span>)}</div>}
      <div class="actions" style={{ justifyContent: 'flex-start' }}><button type="button" class="btn btn-ghost" onClick={() => { setEvents([]); lastDown.current = 0; }}>Reset</button></div>
    </div>
  );
}
