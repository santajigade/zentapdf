// Animated GIF helpers: decode (gifuct-js), frame transforms (canvas), encode (worker with gifenc), MP4 export (WebCodecs).
export type Anim = { width: number; height: number; frames: Uint8ClampedArray[]; delays: number[] };

export const MAX_PIXELS = 160_000_000; // total pixels across frames kept in memory

export async function decodeGif(buf: ArrayBuffer): Promise<Anim> {
  const { parseGIF, decompressFrames } = await import('gifuct-js');
  const gif = parseGIF(buf);
  const raw = decompressFrames(gif, true) as any[];
  const W = gif.lsd.width, H = gif.lsd.height;
  if (!raw.length) throw new Error('This GIF has no frames.');
  if (W * H * raw.length > MAX_PIXELS) throw new Error('This GIF is too large for your device memory (too many frames or too big). Try a smaller GIF.');
  const canvas = new Uint8ClampedArray(W * H * 4);
  const frames: Uint8ClampedArray[] = [], delays: number[] = [];
  let prevDisposal = 0, prevDims: any = null, saved: Uint8ClampedArray | null = null;
  for (const f of raw) {
    if (prevDisposal === 2 && prevDims) {
      for (let y = prevDims.top; y < prevDims.top + prevDims.height; y++) canvas.fill(0, (y * W + prevDims.left) * 4, (y * W + prevDims.left + prevDims.width) * 4);
    } else if (prevDisposal === 3 && saved) canvas.set(saved);
    if (f.disposalType === 3) saved = canvas.slice();
    const { left, top, width, height } = f.dims; const p = f.patch as Uint8ClampedArray;
    for (let y = 0; y < height; y++) {
      const cy = top + y; if (cy >= H) break;
      for (let x = 0; x < width; x++) {
        const cx = left + x; if (cx >= W) continue;
        const s = (y * width + x) * 4; if (p[s + 3] === 0) continue;
        const d = (cy * W + cx) * 4; canvas[d] = p[s]; canvas[d + 1] = p[s + 1]; canvas[d + 2] = p[s + 2]; canvas[d + 3] = p[s + 3];
      }
    }
    frames.push(canvas.slice()); delays.push(Math.max(20, f.delay || 100));
    prevDisposal = f.disposalType; prevDims = f.dims;
  }
  return { width: W, height: H, frames, delays };
}

export function encodeGif(a: Anim, opts: { colors?: number; repeat?: number; dither?: boolean; stack?: boolean } = {}, onProgress?: (d: number, t: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress?.(d.done, d.total);
      else if (d.type === 'result') { w.terminate(); resolve(new Blob([d.bytes], { type: 'image/gif' })); }
      else { w.terminate(); reject(new Error(d.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Out of memory')); };
    const bufs = a.frames.map((f) => f.slice().buffer);
    w.postMessage({ width: a.width, height: a.height, frames: bufs, delays: a.delays, colors: opts.colors ?? 256, repeat: opts.repeat ?? 0, dither: !!opts.dither, stack: !!opts.stack }, bufs);
  });
}

/** Apply a drawing function to every frame (resize, crop…). */
export function mapFrames(a: Anim, W: number, H: number, draw: (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => void): Anim {
  const src = document.createElement('canvas'); src.width = a.width; src.height = a.height;
  const sctx = src.getContext('2d')!;
  const dst = document.createElement('canvas'); dst.width = W; dst.height = H;
  const dctx = dst.getContext('2d', { willReadFrequently: true })!; dctx.imageSmoothingQuality = 'high';
  const frames = a.frames.map((f) => {
    sctx.putImageData(new ImageData(new Uint8ClampedArray(f), a.width, a.height), 0, 0);
    dctx.clearRect(0, 0, W, H); draw(dctx, src);
    return dctx.getImageData(0, 0, W, H).data;
  });
  return { width: W, height: H, frames, delays: a.delays.slice() };
}

export const resize = (a: Anim, W: number, H: number) => mapFrames(a, W, H, (ctx, src) => ctx.drawImage(src, 0, 0, W, H));
export const crop = (a: Anim, x: number, y: number, w: number, h: number) => mapFrames(a, w, h, (ctx, src) => ctx.drawImage(src, x, y, w, h, 0, 0, w, h));

/** Export as MP4 (H.264 via WebCodecs). Returns null if the browser can't encode H.264. */
export async function toMp4(a: Anim, loops: number, onProgress?: (d: number, t: number) => void): Promise<Blob | null> {
  if (typeof (window as any).VideoEncoder === 'undefined') return null;
  const W = a.width - (a.width % 2), H = a.height - (a.height % 2);
  const VE = (window as any).VideoEncoder;
  const base = { width: W, height: H, bitrate: Math.min(8_000_000, Math.max(500_000, W * H * 6)), framerate: 30 };
  let config: any = null, muxCodec: 'avc' | 'vp9' | 'av1' = 'avc';
  for (const [codec, mc] of [['avc1.42E01F', 'avc'], ['avc1.640028', 'avc'], ['vp09.00.10.08', 'vp9'], ['av01.0.04M.08', 'av1']] as const) {
    try { const c = { ...base, codec, ...(mc === 'avc' ? { avc: { format: 'avc' } } : {}) }; if ((await VE.isConfigSupported(c)).supported) { config = c; muxCodec = mc; break; } } catch { /* try next */ }
  }
  if (!config) return null;
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: muxCodec, width: W, height: H }, fastStart: 'in-memory' });
  const enc = new VE({ output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta), error: (e: any) => { throw e; } });
  enc.configure(config);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d')!;
  const src = document.createElement('canvas'); src.width = a.width; src.height = a.height; const sctx = src.getContext('2d')!;
  let t = 0, n = 0; const total = a.frames.length * loops;
  for (let l = 0; l < loops; l++) for (let i = 0; i < a.frames.length; i++) {
    sctx.putImageData(new ImageData(new Uint8ClampedArray(a.frames[i]), a.width, a.height), 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(src, 0, 0);
    const vf = new (window as any).VideoFrame(c, { timestamp: t * 1000, duration: a.delays[i] * 1000 });
    enc.encode(vf, { keyFrame: n % 60 === 0 }); vf.close();
    t += a.delays[i]; n++; if (n % 10 === 0) { onProgress?.(n, total); await new Promise((r) => setTimeout(r)); }
  }
  await enc.flush(); muxer.finalize();
  return new Blob([(muxer.target as any).buffer], { type: 'video/mp4' });
}

/** Draw a source into a W×H frame (contain or cover) and return its RGBA pixels. */
export function fitFrame(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, fit: 'contain' | 'cover' | 'stretch', bg: string | null, ax = 0.5, ay = 0.5): Uint8ClampedArray {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  ctx.imageSmoothingQuality = 'high';
  if (fit === 'stretch') { ctx.drawImage(src, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; }
  const s = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) * ax, (H - dh) * ay, dw, dh);
  return ctx.getImageData(0, 0, W, H).data;
}

export function frameCanvas(W: number, H: number) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  return c.getContext('2d', { willReadFrequently: true })!;
}
