// Sound processing on PCM: cut, fade, gain with limiter, normalise, reverse, join, pitch and tempo, BPM.
import type { Pcm } from './core';
import type { Status } from './ffmpeg';

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-9));

export function slice(p: Pcm, a: number, b: number): Pcm {
  const s = Math.max(0, Math.round(a * p.rate)), e = Math.min(p.ch[0].length, Math.round(b * p.rate));
  return { rate: p.rate, ch: p.ch.map((x) => x.slice(s, Math.max(s, e))) };
}
/** Remove the part between a and b and join what is left (with a 10 ms crossfade so there is no click). */
export function cutOut(p: Pcm, a: number, b: number): Pcm {
  const head = slice(p, 0, a), tail = slice(p, b, p.ch[0].length / p.rate);
  return join([head, tail], 0.01);
}

/** Fade in and out with smooth (equal power) curves. */
export function fade(p: Pcm, fin: number, fout: number): Pcm {
  const n = p.ch[0].length; const a = Math.min(n, Math.round(fin * p.rate)), b = Math.min(n, Math.round(fout * p.rate));
  const ch = p.ch.map((x) => {
    const y = x.slice();
    for (let i = 0; i < a; i++) y[i] *= Math.sin((i / a) * Math.PI / 2) ** 2;
    for (let i = 0; i < b; i++) y[n - 1 - i] *= Math.sin((i / b) * Math.PI / 2) ** 2;
    return y;
  });
  return { rate: p.rate, ch };
}

export function peak(p: Pcm) { let m = 0; for (const x of p.ch) for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }

/**
 * Gain with a look-ahead peak limiter: loud parts are turned down just before they would clip,
 * so boosting never causes the harsh distortion of hard clipping.
 */
export function gainLimit(p: Pcm, gainDb: number, ceilingDb = -1): Pcm {
  const g = dbToGain(gainDb), ceil = dbToGain(ceilingDb), n = p.ch[0].length;
  const look = Math.max(1, Math.round(0.005 * p.rate)); // 5 ms
  const rel = Math.exp(-1 / (0.12 * p.rate)); // 120 ms release
  // required gain per sample from the loudest channel
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (const x of p.ch) { const v = Math.abs(x[i]) * g; if (v > m) m = v; } need[i] = m > ceil ? ceil / m : 1; }
  // look ahead: minimum over the next window (sliding minimum with a deque)
  const minAhead = new Float32Array(n); const dq: number[] = []; let h = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > h && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i); while (dq[h] > i + look) h++;
    minAhead[i] = need[dq[h]];
  }
  // smooth: attack follows instantly over the look-ahead window, release slowly
  const env = new Float32Array(n); let e = 1;
  for (let i = 0; i < n; i++) { const t = minAhead[i]; e = t < e ? t : t + (e - t) * rel; env[i] = e; }
  const ch = p.ch.map((x) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) { const v = x[i] * g * env[i]; y[i] = v > ceil ? ceil : v < -ceil ? -ceil : v; } return y; });
  return { rate: p.rate, ch };
}

/** Integrated loudness (LUFS, ITU BS.1770 with gating). */
export function loudness(p: Pcm): number {
  const r = p.rate;
  const biquad = (b0: number, b1: number, b2: number, a1: number, a2: number) => (x: Float32Array) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  // K-weighting filters (same design as pyloudnorm)
  const shelf = (() => { const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319; const A = 10 ** (G / 40), w = 2 * Math.PI * fc / r, al = Math.sin(w) / (2 * Q), c = Math.cos(w); const a0 = (A + 1) - (A - 1) * c + 2 * Math.sqrt(A) * al; return biquad(A * ((A + 1) + (A - 1) * c + 2 * Math.sqrt(A) * al) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - 2 * Math.sqrt(A) * al) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - 2 * Math.sqrt(A) * al) / a0); })();
  const hp = (() => { const Q = 0.5003270373253953, fc = 38.13547087613982; const w = 2 * Math.PI * fc / r, al = Math.sin(w) / (2 * Q), c = Math.cos(w); const a0 = 1 + al; return biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); })();
  const kw = p.ch.map((x) => hp(shelf(x)));
  const B = Math.round(0.4 * r), S = Math.round(0.1 * r); const blocks: number[] = [];
  for (let s = 0; s + B <= kw[0].length; s += S) { let z = 0; for (const x of kw) { let m = 0; for (let i = s; i < s + B; i++) m += x[i] * x[i]; z += m / B; } blocks.push(z); }
  if (!blocks.length) { let z = 0; for (const x of kw) { let m = 0; for (let i = 0; i < x.length; i++) m += x[i] * x[i]; z += m / Math.max(1, x.length); } blocks.push(z); }
  const L = (z: number) => -0.691 + 0.26 + 10 * Math.log10(Math.max(z, 1e-12));
  const abs = blocks.filter((z) => L(z) > -70); if (!abs.length) return -70;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((z) => L(z) > rel); return L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
}

export function reverse(p: Pcm): Pcm { return { rate: p.rate, ch: p.ch.map((x) => x.slice().reverse()) }; }

/** Join clips one after another, with an optional equal-power crossfade (seconds) or silence gap (negative value). */
export function join(list: Pcm[], cross: number, gap = 0): Pcm {
  const rate = list[0].rate, chN = Math.max(...list.map((p) => p.ch.length));
  const norm = list.map((p) => (p.ch.length === chN ? p : { rate, ch: Array.from({ length: chN }, (_, k) => p.ch[Math.min(k, p.ch.length - 1)]) }));
  const X = Math.round(cross * rate), G = Math.round(gap * rate);
  let total = 0; norm.forEach((p, i) => { total += p.ch[0].length; if (i) total += G - Math.min(X, p.ch[0].length, norm[i - 1].ch[0].length); });
  const out = Array.from({ length: chN }, () => new Float32Array(Math.max(0, total)));
  let pos = 0;
  norm.forEach((p, i) => {
    const len = p.ch[0].length; let x = 0;
    if (i) { x = Math.min(X, len, norm[i - 1].ch[0].length); pos += G - x; }
    for (let k = 0; k < chN; k++) {
      const src = p.ch[k], dst = out[k];
      for (let j = 0; j < len; j++) {
        if (j < x) { const t = (j + 0.5) / x; dst[pos + j] = dst[pos + j] * Math.cos(t * Math.PI / 2) + src[j] * Math.sin(t * Math.PI / 2); }
        else dst[pos + j] = src[j];
      }
    }
    pos += len;
  });
  return { rate, ch: out };
}

/** Change pitch (semitones) and/or speed with SoundTouch, in a worker. */
export function stretch(p: Pcm, o: { semitones?: number; tempo?: number }, status?: Status): Promise<Pcm> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./stretch.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.progress != null) status?.('Processing…', e.data.progress, 100);
      else if (e.data.error) { w.terminate(); reject(new Error(e.data.error)); }
      else { w.terminate(); resolve({ rate: p.rate, ch: e.data.ch }); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    const copy = p.ch.map((x) => x.slice());
    w.postMessage({ ch: copy, rate: p.rate, ...o }, copy.map((x) => x.buffer));
  });
}

/** Mono, downsampled peaks for drawing a waveform. */
export function peaks(p: Pcm, n = 4000): Float32Array {
  const x = p.ch[0], y = p.ch[1]; const len = x.length; const step = Math.max(1, Math.floor(len / n)); const out = new Float32Array(Math.ceil(len / step) * 2);
  for (let i = 0, k = 0; i < len; i += step) { let mn = 0, mx = 0; for (let j = i; j < Math.min(len, i + step); j++) { const v = y ? (x[j] + y[j]) / 2 : x[j]; if (v < mn) mn = v; if (v > mx) mx = v; } out[k++] = mx; out[k++] = mn; }
  return out;
}

/**
 * Tempo (BPM) from the beat pattern: an onset strength envelope is built from the energy rise in a few
 * frequency bands, then autocorrelation finds the strongest repeating interval between 60 and 200 BPM.
 */
export function detectBpm(p: Pcm): { bpm: number; confidence: number; candidates: number[] } {
  const r = p.rate; const hop = Math.round(r / 200); // 5 ms frames
  const mono = p.ch.length > 1 ? p.ch[0].map((v, i) => (v + p.ch[1][i]) / 2) : p.ch[0];
  // low band (kick) and full band energy
  const lp = (x: Float32Array, fc: number) => { const y = new Float32Array(x.length); const a = Math.exp(-2 * Math.PI * fc / r); let s = 0; for (let i = 0; i < x.length; i++) { s = (1 - a) * x[i] + a * s; y[i] = s; } return y; };
  const low = lp(mono, 150);
  const frames = Math.floor(mono.length / hop);
  const env = new Float32Array(frames);
  let pl = 0, pf = 0;
  for (let f = 0; f < frames; f++) {
    let el = 0, ef = 0; for (let i = f * hop; i < (f + 1) * hop; i++) { el += low[i] * low[i]; ef += mono[i] * mono[i]; }
    el = Math.log1p(1000 * el); ef = Math.log1p(1000 * ef);
    env[f] = Math.max(0, el - pl) * 1.5 + Math.max(0, ef - pf); pl = el; pf = ef;
  }
  // remove the slow trend
  const W = 40; const on = new Float32Array(frames); let acc = 0;
  for (let f = 0; f < frames; f++) { acc += env[f]; if (f >= W) acc -= env[f - W]; on[f] = Math.max(0, env[f] - acc / Math.min(f + 1, W)); }
  // soften each onset over a few frames so beats that do not land on an exact frame still line up
  const sm = new Float32Array(frames); for (let f = 0; f < frames; f++) sm[f] = (on[f - 2] ?? 0) + 2 * (on[f - 1] ?? 0) + 3 * on[f] + 2 * (on[f + 1] ?? 0) + (on[f + 2] ?? 0);
  on.set(sm);
  const fps = r / hop; const minLag = Math.floor((fps * 60) / 200), maxLag = Math.ceil((fps * 60) / 60);
  const ac = new Float32Array(maxLag + 2);
  const N = Math.min(frames, Math.round(fps * 120)); // first 2 minutes are plenty
  for (let lag = minLag; lag <= maxLag + 1; lag++) { let s = 0; for (let f = 0; f + lag < N; f++) s += on[f] * on[f + lag]; ac[lag] = s / (N - lag); }
  // weight towards common tempos (around 120 BPM)
  let best = minLag, bestS = -1; const score = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag; const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    score[lag] = ac[lag] * w;
    if (score[lag] > bestS) { bestS = score[lag]; best = lag; }
  }
  // refine with parabolic interpolation
  const y0 = score[best - 1] ?? 0, y1 = score[best], y2 = score[best + 1] ?? 0; const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  const bpm = (60 * fps) / (best + (Math.abs(d) < 1 ? d : 0));
  const mean = score.slice(minLag, maxLag + 1).reduce((a, b) => a + b, 0) / (maxLag - minLag + 1);
  const confidence = Math.max(0, Math.min(1, (bestS / (mean || 1) - 1) / 3));
  const r1 = Math.round(bpm * 10) / 10;
  return { bpm: r1, confidence, candidates: [r1 / 2, r1 * 2].filter((b) => b >= 40 && b <= 240).map((b) => Math.round(b * 10) / 10) };
}
