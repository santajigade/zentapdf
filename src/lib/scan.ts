// Document-scan helpers: perspective correction and "scanner" filters on a canvas.
export type Pt = [number, number];
export type Filter = 'original' | 'magic' | 'gray' | 'bw';

/** Warp the quadrilateral `q` (TL, TR, BR, BL in source pixels) of `src` into a flat rectangle. */
export function warp(src: HTMLCanvasElement, q: Pt[], maxSide: number): HTMLCanvasElement {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(W, H)); W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, c, dd, e, f, g = 0, h = 0;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; dd = y1 - y0; e = y2 - y1; f = y0; }
  else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; dd = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d')!; const od = octx.createImageData(W, H); const o = od.data;
  for (let yy = 0; yy < H; yy++) {
    const v = (yy + 0.5) / H;
    for (let xx = 0; xx < W; xx++) {
      const u = (xx + 0.5) / W; const z = g * u + h * v + 1;
      let sx = (a * u + b * v + c) / z - 0.5, sy = (dd * u + e * v + f) / z - 0.5;
      if (sx < 0) sx = 0; if (sy < 0) sy = 0; if (sx > sw - 1.001) sx = sw - 1.001; if (sy > sh - 1.001) sy = sh - 1.001;
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
      const p00 = (iy * sw + ix) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
      const oi = (yy * W + xx) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const t = sd[p00 + ch] * (1 - fx) + sd[p10 + ch] * fx, bt = sd[p01 + ch] * (1 - fx) + sd[p11 + ch] * fx;
        o[oi + ch] = t * (1 - fy) + bt * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

export function applyFilter(c: HTMLCanvasElement, f: Filter) {
  if (f === 'original') return;
  const ctx = c.getContext('2d', { willReadFrequently: true })!; const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  const n = c.width * c.height; const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // percentiles for contrast stretch
  const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[lum[i] | 0]++;
  const pct = (p: number) => { let s = 0; for (let k = 0; k < 256; k++) { s += hist[k]; if (s >= n * p) return k; } return 255; };
  const lo = pct(0.02), hi = Math.max(lo + 30, pct(0.9));
  const stretch = (v: number) => Math.max(0, Math.min(255, ((v - lo) / (hi - lo)) * 255));
  if (f === 'gray') { for (let i = 0; i < n; i++) { const v = stretch(lum[i]); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; } }
  else if (f === 'magic') {
    for (let i = 0; i < n; i++) {
      const L = lum[i], nl = stretch(L), k = L > 1 ? nl / L : 1;
      for (let ch = 0; ch < 3; ch++) { const v = d[i * 4 + ch]; const s = L + (v - L) * 1.25; d[i * 4 + ch] = Math.max(0, Math.min(255, s * k)); }
    }
  } else if (f === 'bw') {
    // adaptive threshold using an integral image (handles shadows on paper)
    const W = c.width, H = c.height; const integ = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += lum[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
    const r = Math.max(8, Math.round(Math.max(W, H) / 40));
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const sum = integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = lum[y * W + x] < mean * 0.86 ? 0 : 255;
        const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function rotateCanvas(c: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  if (!deg) return c;
  const o = document.createElement('canvas'); const sw = deg % 180 !== 0;
  o.width = sw ? c.height : c.width; o.height = sw ? c.width : c.height;
  const x = o.getContext('2d')!; x.translate(o.width / 2, o.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
