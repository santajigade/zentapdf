// LAME MP3 encoder (lamejs) running off the main thread.
import { Mp3Encoder } from '@breezystack/lamejs';

self.onmessage = (e: MessageEvent) => {
  try {
    const { ch, rate, kbps } = e.data as { ch: Float32Array[]; rate: number; kbps: number };
    const c = ch.length; const n = ch[0].length;
    const enc = new Mp3Encoder(c, rate, kbps);
    const toI16 = (x: Float32Array, a: number, b: number) => { const o = new Int16Array(b - a); for (let i = a; i < b; i++) { const s = Math.max(-1, Math.min(1, x[i])); o[i - a] = s < 0 ? s * 0x8000 : s * 0x7fff; } return o; };
    const parts: Uint8Array[] = []; const B = 1152 * 20; let last = -1;
    for (let i = 0; i < n; i += B) {
      const end = Math.min(n, i + B);
      const l = toI16(ch[0], i, end); const r = c > 1 ? toI16(ch[1], i, end) : undefined;
      const out = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
      if (out.length) parts.push(new Uint8Array(out));
      const pct = Math.floor((end / n) * 100); if (pct !== last) { last = pct; (self as any).postMessage({ progress: pct }); }
    }
    const tail = enc.flush(); if (tail.length) parts.push(new Uint8Array(tail));
    (self as any).postMessage({ parts });
  } catch (err: any) { (self as any).postMessage({ error: String(err?.message ?? err) }); }
};
