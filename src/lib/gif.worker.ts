/// <reference lib="webworker" />
// Encodes RGBA frames into an animated GIF (gifenc), off the main thread.
import { GIFEncoder, quantize, applyPalette, nearestColorIndex } from 'gifenc';

type Msg = { width: number; height: number; frames: ArrayBuffer[]; delays: number[]; colors: number; repeat: number; dither?: boolean; stack?: boolean };

/** Floyd–Steinberg error diffusion onto a palette (transparent pixels keep the transparent index). */
function dither(rgba: Uint8Array, w: number, h: number, palette: number[][], ti: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const err = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; p < rgba.length; i++, p += 4) { err[i * 3] = rgba[p]; err[i * 3 + 1] = rgba[p + 1]; err[i * 3 + 2] = rgba[p + 2]; }
  const opaque = palette.map((c, i) => (i === ti ? [1e9, 1e9, 1e9] : [c[0], c[1], c[2]]));
  const cache = new Map<number, number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (ti >= 0 && rgba[i * 4 + 3] < 128) { out[i] = ti; continue; }
    const r = Math.max(0, Math.min(255, err[i * 3])), g = Math.max(0, Math.min(255, err[i * 3 + 1])), b = Math.max(0, Math.min(255, err[i * 3 + 2]));
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let k = cache.get(key);
    if (k === undefined) { k = nearestColorIndex(opaque, [r, g, b]); cache.set(key, k); }
    out[i] = k;
    const c = palette[k], er = r - c[0], eg = g - c[1], eb = b - c[2];
    const add = (j: number, f: number) => { err[j * 3] += er * f; err[j * 3 + 1] += eg * f; err[j * 3 + 2] += eb * f; };
    if (x + 1 < w) add(i + 1, 7 / 16);
    if (y + 1 < h) { if (x > 0) add(i + w - 1, 3 / 16); add(i + w, 5 / 16); if (x + 1 < w) add(i + w + 1, 1 / 16); }
  }
  return out;
}

self.onmessage = (ev: MessageEvent<Msg>) => {
  const { width, height, frames, delays, colors, repeat, dither: useDither = false, stack = false } = ev.data;
  try {
    const enc = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      const rgba = new Uint8Array(frames[i]);
      let hasAlpha = false;
      for (let k = 3; k < rgba.length; k += 4 * 7) if (rgba[k] < 128) { hasAlpha = true; break; }
      const format = hasAlpha ? 'rgba4444' : 'rgb565';
      const palette = quantize(rgba, colors, { format, oneBitAlpha: hasAlpha });
      const ti = hasAlpha ? palette.findIndex((c: number[]) => c[3] === 0) : -1;
      const index = useDither ? dither(rgba, width, height, palette, ti) : applyPalette(rgba, palette, format);
      // dispose 2 = clear before next frame ("don't stack"); 1 = keep previous frame underneath
      enc.writeFrame(index, width, height, { palette, delay: delays[i], repeat, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: ti >= 0 ? (stack ? 1 : 2) : -1 });
      (self as any).postMessage({ type: 'progress', done: i + 1, total: frames.length });
    }
    enc.finish();
    const bytes = enc.bytes();
    (self as any).postMessage({ type: 'result', bytes }, [bytes.buffer]);
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', message: String(e?.message ?? e) });
  }
};
