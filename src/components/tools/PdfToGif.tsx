import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { encodeGif, fitFrame, frameCanvas } from '../../lib/gif';

const MAX_PAGES = 60;

export default function PdfToGif() {
  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState(640);
  const [delay, setDelay] = useState(1.5);
  const [loop, setLoop] = useState(0);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; url: string; info: string } | null>(null);
  useEffect(() => () => { out && URL.revokeObjectURL(out.url); }, [out]);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setFile(f);
  };

  const make = async () => {
    if (!file) return; setError(''); setOut(null);
    setBusy({ done: 0, total: 0, label: 'Opening PDF…' });
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const n = Math.min(doc.numPages, MAX_PAGES);
      const p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
      const W = width, H = Math.round(W * p1.height / p1.width);
      const ctx = frameCanvas(W, H); const frames: Uint8ClampedArray[] = [];
      const c = document.createElement('canvas');
      for (let i = 1; i <= n; i++) {
        const pg = await doc.getPage(i); const vp0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: Math.min(W / vp0.width, H / vp0.height) * 2 });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cc = c.getContext('2d')!; cc.fillStyle = '#fff'; cc.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: cc, viewport: vp }).promise;
        frames.push(fitFrame(ctx, c, c.width, c.height, 'contain', '#ffffff'));
        setBusy({ done: i, total: n, label: 'Reading pages…' });
      }
      const total = doc.numPages; doc.cleanup?.();
      const blob = await encodeGif({ width: W, height: H, frames, delays: frames.map(() => Math.round(delay * 1000)) }, { repeat: loop }, (d, t) => setBusy({ done: d, total: t, label: 'Creating GIF…' }));
      setOut({ blob, url: URL.createObjectURL(blob), info: `${W}×${H}, ${frames.length} pages${total > MAX_PAGES ? ` (first ${MAX_PAGES} of ${total})` : ''}` });
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
      {!out && <div class="opts">
        <label>Width<select value={width} onChange={(e) => setWidth(+(e.target as HTMLSelectElement).value)}>{[320, 480, 640, 800, 1080].map((v) => <option value={v}>{v} px</option>)}</select></label>
        <label>Time per page<select value={delay} onChange={(e) => setDelay(+(e.target as HTMLSelectElement).value)}>{[0.5, 1, 1.5, 2, 3, 5].map((v) => <option value={v}>{v} sec</option>)}</select></label>
        <label>Repeat<select value={loop} onChange={(e) => setLoop(+(e.target as HTMLSelectElement).value)}><option value={0}>Forever</option><option value={-1}>Play once</option></select></label>
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big" style={{ color: 'var(--text)' }}>Done! {out.info} · {formatBytes(out.blob.size)}</p>
          <div class="gif-prev"><img src={out.url} alt="PDF pages as animated GIF" /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.gif`)}>Download GIF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New PDF</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={make}>Make GIF</button></div>}
    </div>
  );
}
