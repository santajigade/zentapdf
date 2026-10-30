let p: Promise<any> | null = null;
export function loadPdfjs(): Promise<any> {
  return (p ??= (async () => {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    return pdfjs;
  })());
}
