import { useEffect, useState } from 'preact/hooks';

type Pad = { index: number; id: string; mapping: string; buttons: { pressed: boolean; value: number }[]; axes: number[]; rumble: boolean };
const NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'Back / Share', 'Start / Options', 'Left stick', 'Right stick', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home / PS'];
const read = (): Pad[] => Array.from(navigator.getGamepads?.() ?? []).filter(Boolean).map((g) => ({ index: g!.index, id: g!.id, mapping: g!.mapping, buttons: g!.buttons.map((b) => ({ pressed: b.pressed, value: b.value })), axes: Array.from(g!.axes), rumble: !!(g as any).vibrationActuator }));

function Stick({ x, y, pressed, label }: { x: number; y: number; pressed?: boolean; label: string }) {
  const drift = Math.hypot(x, y);
  return (
    <div class="gp-stick"><svg viewBox="-60 -60 120 120" width="120" height="120">
      <circle r="54" fill="var(--brand-50)" stroke="var(--border)" stroke-width="3" /><circle r="8" fill="none" stroke="var(--border)" stroke-dasharray="3 3" />
      <line x1="-54" x2="54" stroke="var(--border)" /><line y1="-54" y2="54" stroke="var(--border)" />
      <circle cx={x * 44} cy={y * 44} r="12" fill={pressed ? '#16a34a' : '#4f46e5'} />
    </svg><strong>{label}</strong><small>x {x.toFixed(2)} · y {y.toFixed(2)}{drift > 0.08 && drift < 0.3 ? ' · drift?' : ''}</small></div>
  );
}

export default function GamepadTest() {
  const [pads, setPads] = useState<Pad[]>([]);
  const [seen, setSeen] = useState<Record<number, Set<number>>>({});
  const supported = typeof navigator !== 'undefined' && 'getGamepads' in navigator;
  useEffect(() => {
    if (!supported) return; let raf = 0;
    const loop = () => { const p = read(); setPads(p); setSeen((s) => { let ch = false; const n = { ...s }; p.forEach((g) => { const set = new Set(n[g.index] ?? []); g.buttons.forEach((b, i) => { if (b.pressed && !set.has(i)) { set.add(i); ch = true; } }); n[g.index] = set; }); return ch ? n : s; }); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  const rumble = (i: number, strong: number, weak: number) => { const g = navigator.getGamepads()[i] as any; g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 800, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {}); };

  if (!supported) return <div class="error">Your browser does not support game controllers. Please use the latest Chrome, Edge or Firefox.</div>;
  if (!pads.length) return (
    <div class="dt-start">
      <div class="gp-wait">🎮</div>
      <p class="big" style={{ color: 'var(--text)' }}>Connect your controller and press any button</p>
      <p class="status">USB or Bluetooth — Xbox, PlayStation, Switch Pro and most PC gamepads. Browsers only show a controller after a button is pressed.</p>
    </div>
  );
  return (
    <div>
      {pads.map((g) => {
        const std = g.mapping === 'standard'; const tested = seen[g.index] ?? new Set();
        return (
          <div class="gp-card" key={g.index}>
            <div class="gp-head"><strong>Controller {g.index + 1}</strong><span class="status">{g.id}</span></div>
            <div class="gp-sticks">
              <Stick x={g.axes[0] ?? 0} y={g.axes[1] ?? 0} pressed={g.buttons[10]?.pressed} label="Left stick" />
              <Stick x={g.axes[2] ?? 0} y={g.axes[3] ?? 0} pressed={g.buttons[11]?.pressed} label="Right stick" />
              {std && <div class="gp-trig">{[6, 7].map((i) => <div><span>{i === 6 ? 'LT / L2' : 'RT / R2'}</span><div class="gp-bar"><div style={{ height: `${Math.round((g.buttons[i]?.value ?? 0) * 100)}%` }} /></div><small>{Math.round((g.buttons[i]?.value ?? 0) * 100)}%</small></div>)}</div>}
            </div>
            <div class="gp-btns">{g.buttons.map((b, i) => <span class={b.pressed ? 'down' : tested.has(i) ? 'ok' : ''} title={`button ${i}`}>{std ? NAMES[i] ?? `Button ${i}` : `Button ${i}`}{b.value > 0 && b.value < 1 ? ` ${Math.round(b.value * 100)}%` : ''}</span>)}</div>
            <div class="dt-results">
              <div><span>Buttons tested</span><b>{tested.size} / {g.buttons.length}</b></div>
              <div><span>Axes</span><b>{g.axes.length}</b><small>{g.axes.map((a) => a.toFixed(2)).join(' · ')}</small></div>
              <div><span>Layout</span><b style={{ fontSize: '1rem' }}>{std ? 'Standard' : 'Custom'}</b></div>
            </div>
            {g.rumble ? <div class="actions" style={{ justifyContent: 'flex-start' }}><button type="button" class="btn btn-ghost" onClick={() => rumble(g.index, 1, 0)}>Strong vibration</button><button type="button" class="btn btn-ghost" onClick={() => rumble(g.index, 0, 1)}>Weak vibration</button><button type="button" class="btn btn-ghost" onClick={() => rumble(g.index, 1, 1)}>Both</button></div>
              : <p class="status" style={{ textAlign: 'left' }}>Vibration test is not available for this controller in this browser (works in Chrome and Edge with most Xbox and PlayStation controllers).</p>}
          </div>
        );
      })}
    </div>
  );
}
