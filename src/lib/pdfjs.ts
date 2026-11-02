let p: Promise<any> | null = null;
export function loadPdfjs(): Promise<any> {
  return (p ??= (async () => {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    return pdfjs;
  })());
}

/** PDF-space rectangle [x0, y0, x1, y1] → viewport (top-left) coordinates. */
export function viewRect(vp: any, r: number[]): number[] {
  const [a, b] = vp.convertToViewportPoint(r[0], r[1]); const [c, d] = vp.convertToViewportPoint(r[2], r[3]);
  return [a, b, c, d];
}
