export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

export const isHeicFile = (f: Blob & { name?: string }) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name ?? '');
export const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|svg|heic|heif)$/i.test(f.name);
/** File-picker filter for images, including iPhone HEIC photos (often missing from image/* on Windows). */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/** Output type for "keep original": JPG/PNG/WebP stay, anything else becomes PNG. */
export const sameType = (f: File) => (EXT[f.type] && f.type !== 'image/avif' ? f.type : 'image/png');

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file); }
  catch (e) {
    if (isHeicFile(file as any)) {
      // Most browsers (except Safari) can't decode HEIC: use libheif (WebAssembly), loaded only when needed
      const { heicTo } = await import('heic-to');
      return heicTo({ blob: file, type: 'bitmap' });
    }
    // Fallback (e.g. SVG): decode through an <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  }
}

export function canvasFor(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
}

export function encode(c: HTMLCanvasElement, type: string, quality = 0.92): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => {
      c.width = c.height = 0; // free memory
      b ? res(b) : rej(new Error('Could not create the image (the device may be out of memory).'));
    }, type, quality));
}

/** Fill white behind transparent pixels when the target has no alpha. */
export function prepBackground(ctx: CanvasRenderingContext2D, type: string, w: number, h: number) {
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
}

const support = new Map<string, boolean>();
/** True if this browser can encode the given type (Safari can't do WebP/AVIF in some versions). */
export async function canEncode(type: string): Promise<boolean> {
  if (support.has(type)) return support.get(type)!;
  const { c } = canvasFor(2, 2);
  const ok = await new Promise<boolean>((r) => c.toBlob((b) => r(!!b && b.type === type), type));
  support.set(type, ok);
  return ok;
}

export const outName = (name: string, suffix: string, type: string) =>
  `${name.replace(/\.[^.]+$/, '') || 'image'}${suffix}.${EXT[type] ?? 'png'}`;
