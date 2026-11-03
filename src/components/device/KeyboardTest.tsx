import { useEffect, useRef, useState } from 'preact/hooks';

type K = [code: string, label: string, w?: number];
const F: K[] = [['Escape', 'Esc'], ['_', '', 1], ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'], ['_', '', 0.5], ['F5', 'F5'], ['F6', 'F6'], ['F7', 'F7'], ['F8', 'F8'], ['_', '', 0.5], ['F9', 'F9'], ['F10', 'F10'], ['F11', 'F11'], ['F12', 'F12']];
const MAIN: K[][] = [
  [['Backquote', '`'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'], ['Digit9', '9'], ['Digit0', '0'], ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫ Backspace', 2]],
  [['Tab', 'Tab', 1.5], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps Lock', 1.75], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter ↵', 2.25]],
  [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]],
  [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', 'Win', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', 'Win', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]],
];
const NAV: K[][] = [
  [['PrintScreen', 'PrtSc'], ['ScrollLock', 'ScrLk'], ['Pause', 'Pause']],
  [['Insert', 'Ins'], ['Home', 'Home'], ['PageUp', 'PgUp']],
  [['Delete', 'Del'], ['End', 'End'], ['PageDown', 'PgDn']],
  [['_', '', 3]],
  [['_', ''], ['ArrowUp', '↑'], ['_', '']],
  [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']],
];
const NUM: K[][] = [
  [['_', '', 4]],
  [['NumLock', 'Num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '-']],
  [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9'], ['NumpadAdd', '+']],
  [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6'], ['_', '']],
  [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3'], ['NumpadEnter', 'Ent']],
  [['Numpad0', '0', 2], ['NumpadDecimal', '.'], ['_', '']],
];
type Layout = 'full' | 'laptop' | 'mac';
const macLabel = (c: string, l: string) => (c.startsWith('Meta') ? '⌘ Cmd' : c.startsWith('Alt') ? '⌥ Opt' : c.startsWith('Control') ? '⌃ Ctrl' : c === 'ContextMenu' ? 'Fn' : c === 'Backspace' ? '⌫ Delete' : c === 'Enter' ? 'Return' : l);

export default function KeyboardTest() {
  const [layout, setLayout] = useState<Layout>('full');
  const [active, setActive] = useState(false);
  const [down, setDown] = useState<Set<string>>(new Set());
  const [tested, setTested] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<{ key: string; code: string; keyCode: number; location: number } | null>(null);
  const [maxAtOnce, setMaxAtOnce] = useState(0);
  const [count, setCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const kd = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      setLast({ key: e.key === ' ' ? 'Space' : e.key, code: e.code || '(none)', keyCode: e.keyCode, location: e.location });
      if (!e.repeat) setCount((c) => c + 1);
      setDown((d) => { const n = new Set(d); n.add(e.code); setMaxAtOnce((m) => Math.max(m, n.size)); return n; });
      setTested((t) => (t.has(e.code) ? t : new Set(t).add(e.code)));
    };
    const ku = (e: KeyboardEvent) => {
      e.preventDefault();
      // PrintScreen only fires keyup on Windows
      if (e.code === 'PrintScreen') setTested((t) => new Set(t).add('PrintScreen'));
      setDown((d) => { const n = new Set(d); n.delete(e.code); return n; });
    };
    const blur = () => setDown(new Set());
    window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); window.removeEventListener('blur', blur); };
  }, [active]);

  // stop the test when the user clicks outside the keyboard area
  useEffect(() => {
    const out = (e: PointerEvent) => { if (active && box.current && !box.current.contains(e.target as Node)) setActive(false); };
    document.addEventListener('pointerdown', out); return () => document.removeEventListener('pointerdown', out);
  }, [active]);

  const label = (c: string, l: string) => (layout === 'mac' ? macLabel(c, l) : l);
  const key = ([c, l, w = 1]: K, i: number) => c === '_' ? <span key={'g' + i} class="kb-gap" style={{ flexGrow: w, flexBasis: 0 }} /> :
    <span key={c} class={'kb-key' + (down.has(c) ? ' down' : tested.has(c) ? ' ok' : '')} style={{ flexGrow: w, flexBasis: 0 }} title={c}>{label(c, l)}</span>;
  const rows = (rs: K[][]) => rs.map((r, i) => <div class="kb-row" key={i}>{r.map(key)}</div>);
  const all = [...F, ...MAIN.flat(), ...(layout === 'full' ? [...NAV.flat(), ...NUM.flat()] : layout === 'laptop' ? NAV.slice(1).flat() : [])].filter((k) => k[0] !== '_');
  const total = all.length; const done = all.filter((k) => tested.has(k[0])).length;

  return (
    <div ref={box}>
      <div class="dt-bar">
        <div class="seg" role="group" aria-label="Keyboard layout">{([['full', 'Full keyboard'], ['laptop', 'Laptop'], ['mac', 'Mac']] as const).map(([v, t]) => <button type="button" aria-pressed={layout === v} onClick={() => setLayout(v)}>{t}</button>)}</div>
        <button type="button" class="btn btn-ghost" onClick={() => { setTested(new Set()); setDown(new Set()); setLast(null); setMaxAtOnce(0); setCount(0); }}>Reset</button>
      </div>
      <div class={'kb' + (active ? ' on' : '')} tabIndex={0} onClick={() => setActive(true)} onFocus={() => setActive(true)} aria-label="Keyboard test area. Press any key.">
        {!active && <div class="dt-overlay"><button type="button" class="btn btn-primary btn-lg">Start keyboard test</button><span>Then press every key once</span></div>}
        <div class="kb-main">
          <div class="kb-block" style={{ flex: 15 }}>
            <div class="kb-row kb-frow">{F.map(key)}</div>
            {rows(MAIN)}
          </div>
          {layout !== 'mac' && <div class="kb-block" style={{ flex: 3.2 }}>{rows(layout === 'full' ? NAV : NAV)}</div>}
          {layout === 'full' && <div class="kb-block kb-num" style={{ flex: 4.2 }}>{rows(NUM)}</div>}
        </div>
      </div>
      <div class="dt-results">
        <div><span>Keys tested</span><b>{done} / {total}</b></div>
        <div><span>Last key</span><b>{last ? last.key : '–'}</b><small>{last ? `code: ${last.code} · keyCode: ${last.keyCode}${last.location ? ` · ${['', 'left', 'right', 'numpad'][last.location]}` : ''}` : 'press a key'}</small></div>
        <div><span>Most keys at once</span><b>{maxAtOnce}</b><small>{maxAtOnce >= 6 ? 'good anti-ghosting' : 'hold several keys together'}</small></div>
        <div><span>Key presses</span><b>{count}</b></div>
      </div>
      <p class="status" style={{ textAlign: 'left' }}>Green = key works. Keys that never turn green may be faulty. Some keys (Fn, Win+L, media keys) are handled by your computer and can't be detected by a website.</p>
    </div>
  );
}
