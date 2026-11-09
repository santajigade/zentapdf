// SoundTouch (time stretch and pitch shift) off the main thread.
import { SoundTouch, SimpleFilter } from 'soundtouchjs';

self.onmessage = (e: MessageEvent) => {
  try {
    const { ch, rate, semitones = 0, tempo = 1 } = e.data as { ch: Float32Array[]; rate: number; semitones?: number; tempo?: number };
    const L = ch[0], R = ch[1] ?? ch[0]; const n = L.length;
    // feed a little silence after the end so SoundTouch pushes out its last samples
    const pad = Math.round(rate * 0.6);
    const source = { extract(target: Float32Array, frames: number, pos: number) { const k = Math.max(0, Math.min(frames, n + pad - pos)); for (let i = 0; i < k; i++) { const j = pos + i; target[i * 2] = j < n ? L[j] : 0; target[i * 2 + 1] = j < n ? R[j] : 0; } return k; } };
    const st = new SoundTouch(); st.pitchSemitones = semitones; st.tempo = tempo;
    const filter = new SimpleFilter(source, st);
    const expect = Math.ceil((n + pad) / tempo) + 8192;
    const outL = new Float32Array(expect), outR = new Float32Array(expect);
    const buf = new Float32Array(8192 * 2); let got = 0, last = -1;
    for (;;) {
      const k = filter.extract(buf, 8192); if (!k) break;
      for (let i = 0; i < k && got < expect; i++, got++) { outL[got] = buf[i * 2]; outR[got] = buf[i * 2 + 1]; }
      const pct = Math.min(99, Math.floor((filter.sourcePosition / n) * 100)); if (pct !== last) { last = pct; (self as any).postMessage({ progress: pct }); }
      if (got >= expect) break;
    }
    const len = Math.min(got, Math.round(n / tempo));
    const out = ch.length > 1 ? [outL.slice(0, len), outR.slice(0, len)] : [outL.slice(0, len)];
    (self as any).postMessage({ ch: out }, out.map((x) => x.buffer));
  } catch (err: any) { (self as any).postMessage({ error: String(err?.message ?? err) }); }
};
