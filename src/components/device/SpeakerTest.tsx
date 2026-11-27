import { useEffect, useRef, useState } from 'preact/hooks';

type Now = 'left' | 'right' | 'both' | 'sweep' | 'tone' | 'phase' | null;

export default function SpeakerTest() {
  const [now, setNow] = useState<Now>(null);
  const [vol, setVol] = useState(0.5);
  const [freq, setFreq] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const nodes = useRef<AudioNode[]>([]);
  const timer = useRef<any>(0);

  const ac = () => { if (!ctx.current) ctx.current = new AudioContext(); ctx.current.resume(); return ctx.current; };
  const stop = () => { clearTimeout(timer.current); nodes.current.forEach((n: any) => { try { n.stop?.(); n.disconnect(); } catch { /* done */ } }); nodes.current = []; setNow(null); setFreq(0); };
  useEffect(() => () => { stop(); ctx.current?.close(); }, []);

  /** A friendly 3-note chime, panned left (-1), right (1) or centre (0). */
  const chime = (pan: number, which: Now) => {
    stop(); const c = ac(); setNow(which);
    const p = c.createStereoPanner(); p.pan.value = pan; const g = c.createGain(); g.gain.value = vol; p.connect(g).connect(c.destination); nodes.current.push(p, g);
    const t0 = c.currentTime + 0.05;
    [523.25, 659.25, 783.99, 523.25, 659.25, 783.99].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const e = c.createGain();
      const t = t0 + i * 0.32 + (i >= 3 ? 0.4 : 0);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.8, t + 0.02); e.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(e).connect(p); o.start(t); o.stop(t + 0.32); nodes.current.push(o, e);
    });
    timer.current = setTimeout(() => setNow(null), 2400);
  };
  const sweep = () => {
    stop(); const c = ac(); setNow('sweep');
    const o = c.createOscillator(); o.type = 'sine'; const g = c.createGain(); g.gain.value = vol * 0.5; o.connect(g).connect(c.destination);
    const t = c.currentTime + 0.05, D = 10; o.frequency.setValueAtTime(20, t); o.frequency.exponentialRampToValueAtTime(20000, t + D);
    o.start(t); o.stop(t + D); nodes.current.push(o, g);
    const st = performance.now(); const up = () => { const k = (performance.now() - st) / (D * 1000); if (k >= 1 || !nodes.current.length) { setFreq(0); setNow(null); return; } setFreq(Math.round(20 * Math.pow(1000, k))); timer.current = setTimeout(up, 100); }; up();
  };
  const tone = (f: number) => {
    stop(); const c = ac(); setNow('tone'); setFreq(f);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = vol * 0.4; o.connect(g).connect(c.destination); o.start(); nodes.current.push(o, g);
    timer.current = setTimeout(stop, 3000);
  };
  /** Same sound in both speakers, then one speaker inverted: the second should sound thinner/wider if wiring is correct. */
  const phase = () => {
    stop(); const c = ac(); setNow('phase');
    const mk = (t: number, invert: boolean) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110; const sp = c.createChannelSplitter(2), m = c.createChannelMerger(2);
      const gl = c.createGain(), gr = c.createGain(); gl.gain.value = vol * 0.25; gr.gain.value = (invert ? -1 : 1) * vol * 0.25;
      o.connect(gl).connect(m, 0, 0); o.connect(gr).connect(m, 0, 1); m.connect(c.destination); o.start(t); o.stop(t + 2); nodes.current.push(o, gl, gr, m, sp);
    };
    const t = c.currentTime + 0.05; mk(t, false); mk(t + 2.4, true);
    timer.current = setTimeout(() => setNow(null), 4600);
  };

  const spk = (side: 'left' | 'right') => (
    <button type="button" class={'spk' + (now === side || now === 'both' ? ' on' : '')} onClick={() => chime(side === 'left' ? -1 : 1, side)} aria-label={`Play on the ${side} speaker`}>
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true"><rect x="12" y="6" width="40" height="52" rx="8" fill="currentColor" opacity=".15" /><circle cx="32" cy="40" r="11" fill="none" stroke="currentColor" stroke-width="4" /><circle cx="32" cy="18" r="5" fill="currentColor" /></svg>
      <strong>{side === 'left' ? 'Left' : 'Right'}</strong>
    </button>
  );
  return (
    <div>
      <div class="spk-row">
        {spk('left')}
        <button type="button" class={'spk mid' + (now === 'both' ? ' on' : '')} onClick={() => chime(0, 'both')}><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9z" /><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" /></svg><strong>Both</strong></button>
        {spk('right')}
      </div>
      <p class="status">{now === 'left' ? 'Playing on the LEFT speaker…' : now === 'right' ? 'Playing on the RIGHT speaker…' : now === 'both' ? 'Playing on BOTH speakers…' : now === 'sweep' ? `Frequency sweep: ${freq.toLocaleString()} Hz` : now === 'tone' ? `Test tone: ${freq.toLocaleString()} Hz` : now === 'phase' ? 'Phase test: normal… then one side inverted' : 'Click Left, Right or Both. Put your headphones on the right way round first (L and R).'}</p>
      <div class="opts" data-title="More tests">
        <button type="button" class="btn btn-ghost" onClick={sweep}>Frequency sweep 20 Hz, 20 kHz</button>
        <button type="button" class="btn btn-ghost" onClick={phase}>Phase / polarity test</button>
        <label>Test tone<select value="" onChange={(e) => { const v = +(e.target as HTMLSelectElement).value; if (v) tone(v); }}><option value="">Choose…</option>{[50, 100, 250, 440, 1000, 5000, 10000, 15000].map((f) => <option value={f}>{f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}</option>)}</select></label>
        <label>Volume<input type="range" min={0.05} max={1} step={0.05} value={vol} onInput={(e) => setVol(+(e.target as HTMLInputElement).value)} /></label>
        {now && <button type="button" class="btn btn-ghost" onClick={stop}>■ Stop</button>}
      </div>
      <p class="status" style={{ textAlign: 'left' }}>Start with a low volume, high-pitched tones can be uncomfortable with headphones.</p>
    </div>
  );
}
