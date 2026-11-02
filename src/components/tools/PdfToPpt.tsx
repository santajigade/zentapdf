import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';

const MAX_PAGES = 200;

export default function PdfToPpt() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(2);
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; slides: number } | null>(null);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const PptxGen = (await import('pptxgenjs')).default;
      const pres = new PptxGen();
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const W = 10, H = +(10 * first.height / first.width).toFixed(3);
      pres.defineLayout({ name: 'PDF', width: W, height: H }); pres.layout = 'PDF';
      pres.title = baseName(file.name); pres.company = 'ZentaPDF';
      const c = document.createElement('canvas');
      for (let i = 1; i <= n; i++) {
        setBusy({ done: i - 1, total: n, label: `Converting page ${i} of ${n}…` });
        const pg = await doc.getPage(i); const vp0 = pg.getViewport({ scale: 1 });
        const px = [1000, 1600, 2200][quality - 1];
        const vp = pg.getViewport({ scale: px / Math.max(vp0.width, vp0.height) });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: cx, viewport: vp }).promise;
        const slide = pres.addSlide();
        // fit the page on the slide (pages with a different shape are centred)
        const k = Math.min(W / vp0.width, H / vp0.height); const w = vp0.width * k, h = vp0.height * k;
        slide.addImage({ data: c.toDataURL('image/jpeg', 0.88), x: (W - w) / 2, y: (H - h) / 2, w, h });
        if (notes) {
          const tc = await pg.getTextContent();
          const text = tc.items.map((t: any) => t.str + (t.hasEOL ? '\n' : '')).join('').replace(/\n{3,}/g, '\n\n').trim();
          if (text) slide.addNotes(text.slice(0, 20000));
        }
        pg.cleanup();
      }
      setBusy({ done: n, total: n, label: 'Saving PowerPoint…' });
      const blob = await pres.write({ outputType: 'blob' }) as Blob;
      setOut({ blob, slides: n });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {!out && <div class="opts" data-title="Slide settings">
        <label>Image quality<select value={quality} onChange={(e) => setQuality(+(e.target as HTMLSelectElement).value)}><option value={1}>Normal (smaller file)</option><option value={2}>High</option><option value={3}>Very high</option></select></label>
        <label class="check"><input type="checkbox" checked={notes} onChange={(e) => setNotes((e.target as HTMLInputElement).checked)} /> Copy page text into speaker notes</label>
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! {out.slides} slides created ({formatBytes(out.blob.size)}).</p>
          <p class="status">Each PDF page is one slide. Add your own text boxes, notes or animations in PowerPoint or Google Slides.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.pptx`)}>Download PPTX</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Convert to PowerPoint</button></div>}
    </div>
  );
}
