import { useEffect, useRef, useState } from 'preact/hooks';
import { ExportBar, ErrorBox, useBusy } from './ui';
import type { Pcm } from '../../../lib/audio/core';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
const NOTE = (f: number) => { const n = Math.round(12 * Math.log2(f / 440)); const names = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']; const oct = 4 + Math.floor((n + 9) / 12); return `${names[((n % 12) + 12) % 12]}${oct}`; };
const toSlider = (f: number) => Math.log10(f / 20) / 3; // 20 Hz .. 20 kHz
const fromSlider = (v: number) => Math.round(20 * Math.pow(10, v * 3) * 10) / 10;

export default function ToneGenerator() {
  const [freq, setFreq] = useState(440); const [type, setType] = useState<Wave>('sine');
  const [vol, setVol] = useState(0.5); const [secs, setSecs] = useState(10); const [pan, setPan] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const nodes = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode } | null>(null);

  const play = () => {
    try {
      const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); const p = ctx.createStereoPanner();
      osc.type = type; osc.frequency.value = freq; gain.gain.value = 0; p.pan.value = pan;
      osc.connect(gain).connect(p).connect(ctx.destination); osc.start();
      gain.gain.setTargetAtTime(vol * 0.5, ctx.currentTime, 0.02); // soft start, no click
      nodes.current = { ctx, osc, gain, pan: p }; setPlaying(true);
    } catch { setError('Sound could not start in this browser.'); }
  };
  const stop = () => { const n = nodes.current; if (!n) return; n.gain.gain.setTargetAtTime(0, n.ctx.currentTime, 0.02); setTimeout(() => n.ctx.close(), 150); nodes.current = null; setPlaying(false); };
  useEffect(() => () => stop(), []);
  useEffect(() => { const n = nodes.current; if (!n) return; n.osc.frequency.setTargetAtTime(freq, n.ctx.currentTime, 0.01); n.osc.type = type; n.gain.gain.setTargetAtTime(vol * 0.5, n.ctx.currentTime, 0.02); n.pan.pan.setTargetAtTime(pan, n.ctx.currentTime, 0.01); }, [freq, type, vol, pan]);

  const render = async (): Promise<Pcm> => {
    const rate = 44100; const ctx = new OfflineAudioContext(2, Math.round(secs * rate), rate);
    const osc = ctx.createOscillator(); const gain = ctx.createGain(); const p = ctx.createStereoPanner();
    osc.type = type; osc.frequency.value = freq; p.pan.value = pan;
    gain.gain.setValueAtTime(0, 0); gain.gain.linearRampToValueAtTime(vol * 0.5, 0.02); gain.gain.setValueAtTime(vol * 0.5, secs - 0.02); gain.gain.linearRampToValueAtTime(0, secs);
    osc.connect(gain).connect(p).connect(ctx.destination); osc.start();
    const b = await ctx.startRendering();
    return { rate, ch: [b.getChannelData(0), b.getChannelData(1)] };
  };
  const PRESETS: [number, string][] = [[50, '50 Hz hum'], [100, 'Bass 100 Hz'], [261.63, 'Middle C'], [440, 'A4 tuning'], [1000, '1 kHz test'], [10000, '10 kHz'], [15000, '15 kHz'], [17400, 'Mosquito 17.4 kHz']];
  return (
    <div class="au tone">
      <div class="tone-main">
        <div class="tone-freq">
          <input type="number" min={1} max={22000} step={0.1} value={freq} aria-label="Frequency in hertz" onInput={(e) => { const v = +(e.target as HTMLInputElement).value; if (v >= 1 && v <= 22000) setFreq(v); }} /><span>Hz</span>
          <small>{freq >= 27 && freq <= 4200 ? `Note ${NOTE(freq)}` : freq > 15000 ? 'Very high: many adults cannot hear this' : freq < 40 ? 'Very low: you may feel it more than hear it' : ''}</small>
        </div>
        <input class="tone-slider" type="range" min={0} max={1} step={0.001} value={toSlider(freq)} aria-label="Frequency" onInput={(e) => setFreq(fromSlider(+(e.target as HTMLInputElement).value))} />
        <div class="tone-scale" aria-hidden="true"><span>20</span><span>200</span><span>2k</span><span>20k Hz</span></div>
        <div class="tone-btns">
          <button type="button" class="mini" onClick={() => setFreq(Math.max(1, Math.round((freq / Math.pow(2, 1 / 12)) * 100) / 100))} aria-label="One semitone lower">−½</button>
          <button type="button" class="mini" onClick={() => setFreq(Math.max(1, Math.round(freq - 1)))} aria-label="1 hertz lower">−1</button>
          <button type="button" class={`btn btn-primary btn-lg tone-play ${playing ? 'on' : ''}`} onClick={() => (playing ? stop() : play())}>{playing ? '■ Stop' : '▶ Play'}</button>
          <button type="button" class="mini" onClick={() => setFreq(Math.min(22000, Math.round(freq + 1)))} aria-label="1 hertz higher">+1</button>
          <button type="button" class="mini" onClick={() => setFreq(Math.min(22000, Math.round(freq * Math.pow(2, 1 / 12) * 100) / 100))} aria-label="One semitone higher">+½</button>
        </div>
      </div>
      <div class="opts" data-title="Sound">
        <div class="pchoice full">{(['sine', 'square', 'sawtooth', 'triangle'] as Wave[]).map((w) => <button type="button" aria-pressed={type === w} onClick={() => setType(w)}><WaveIcon w={w} />{w === 'sawtooth' ? 'Sawtooth' : w[0].toUpperCase() + w.slice(1)}</button>)}</div>
        <label>Volume <b>{Math.round(vol * 100)}%</b><input type="range" min={0} max={1} step={0.01} value={vol} onInput={(e) => setVol(+(e.target as HTMLInputElement).value)} /></label>
        <label>Balance <b>{pan === 0 ? 'Both ears' : pan < 0 ? 'Left' : 'Right'}</b><input type="range" min={-1} max={1} step={1} value={pan} onInput={(e) => setPan(+(e.target as HTMLInputElement).value)} /></label>
        <p class="hint full">Start with a low volume, especially with headphones. To check left and right speakers, use our <a href="/device-test/speaker-test/">Speaker Test</a>.</p>
      </div>
      <div class="opts" data-title="Presets">
        <div class="pchoice full">{PRESETS.map(([f, l]) => <button type="button" aria-pressed={freq === f} onClick={() => setFreq(f)}>{l}</button>)}</div>
      </div>
      <div class="opts" data-title="Download the tone">
        <label>Length <b>{secs} s</b><input type="range" min={1} max={120} step={1} value={secs} onInput={(e) => setSecs(+(e.target as HTMLInputElement).value)} /></label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <ExportBar pcm={render} name={`tone-${freq}hz-${type}.x`} suffix={`${secs}s`} formats={['wav', 'mp3']} defFmt="wav" status={status} setBusy={setBusy} busy={busy} onError={setError} />
    </div>
  );
}
function WaveIcon({ w }: { w: Wave }) {
  const d = { sine: 'M2 12c3-8 5-8 8 0s5 8 8 0 3-4 4-4', square: 'M2 16V8h5v8h5V8h5v8h5', sawtooth: 'M2 16 9 8v8l7-8v8l6-7', triangle: 'M2 16l5-8 5 8 5-8 5 8' }[w];
  return <svg width="28" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
