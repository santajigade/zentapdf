/// <reference lib="webworker" />
// Encodes RGBA frames into an animated GIF (gifenc), off the main thread.
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

self.onmessage = (ev: MessageEvent<{ width: number; height: number; frames: ArrayBuffer[]; delays: number[]; colors: number; repeat: number }>) => {
  const { width, height, frames, delays, colors, repeat } = ev.data;
  try {
    const enc = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      const rgba = new Uint8Array(frames[i]);
      let hasAlpha = false;
      for (let k = 3; k < rgba.length; k += 4 * 7) if (rgba[k] < 128) { hasAlpha = true; break; }
      const format = hasAlpha ? 'rgba4444' : 'rgb565';
      const palette = quantize(rgba, colors, { format, oneBitAlpha: hasAlpha });
      const index = applyPalette(rgba, palette, format);
      const ti = hasAlpha ? palette.findIndex((c: number[]) => c[3] === 0) : -1;
      enc.writeFrame(index, width, height, { palette, delay: delays[i], repeat, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: ti >= 0 ? 2 : -1 });
      (self as any).postMessage({ type: 'progress', done: i + 1, total: frames.length });
    }
    enc.finish();
    const bytes = enc.bytes();
    (self as any).postMessage({ type: 'result', bytes }, [bytes.buffer]);
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', message: String(e?.message ?? e) });
  }
};
