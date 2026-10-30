/// <reference lib="webworker" />
// Compresses one image per message using OffscreenCanvas.
self.onmessage = async (ev: MessageEvent<{ id: string; blob: Blob; type: string; quality: number; maxWidth: number }>) => {
  const { id, blob, type, quality, maxWidth } = ev.data;
  try {
    const bmp = await createImageBitmap(blob);
    let w = bmp.width, h = bmp.height; const ow = w;
    if (maxWidth && w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d')!;
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await c.convertToBlob({ type, quality });
    (self as any).postMessage({ id, blob: out, w, h, ow });
  } catch (e: any) {
    (self as any).postMessage({ id, error: String(e?.message ?? e) });
  }
};
