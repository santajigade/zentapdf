export type Progress = { done: number; total: number; label: string };

export function runPdfJob<T = any>(msg: any, transfer: Transferable[], onProgress?: (p: Progress) => void, kind: 'pdf' | 'qpdf' = 'pdf'): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = kind === 'qpdf' ? new Worker(new URL('./qpdf.worker.ts', import.meta.url), { type: 'module' }) : new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress?.(d);
      else if (d.type === 'result') { w.terminate(); resolve(d); }
      else if (d.type === 'error') { w.terminate(); const err = new Error(d.message); err.name = d.name || 'Error'; reject(err); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'The browser stopped the task (possibly out of memory).')); };
    w.postMessage(msg, transfer);
  });
}
