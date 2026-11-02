import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, parseRanges, baseName, zipFiles } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';

type Out = { name: string; blob: Blob };

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [mode, setMode] = useState<'ranges' | 'every'>('ranges');
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<Out[] | null>(null);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setFile(f); setPages(0);
    setBusy({ done: 0, total: 0, label: 'Reading PDF…' });
    try {
      const buf = await f.arrayBuffer();
      const r = await runPdfJob<{ pages: number }>({ op: 'count', file: buf }, [buf]);
      setPages(r.pages);
      setRanges(r.pages > 1 ? `1-${Math.ceil(r.pages / 2)}, ${Math.ceil(r.pages / 2) + 1}-${r.pages}` : '1');
    } catch (e) {
      setError(friendlyError(e)); setFile(null);
    } finally { setBusy(null); }
  };

  const split = async () => {
    if (!file) return;
    let list: [number, number][];
    if (mode === 'every') list = Array.from({ length: pages }, (_, i) => [i + 1, i + 1] as [number, number]);
    else {
      const r = parseRanges(ranges, pages);
      if (typeof r === 'string') { setError(r); return; }
      list = r;
    }
    setError(''); setOut(null);
    setBusy({ done: 0, total: list.length, label: 'Splitting…' });
    try {
      const buf = await file.arrayBuffer();
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'split', file: buf, ranges: list }, [buf], setBusy);
      const base = baseName(file.name);
      setOut(r.files.map((b, i) => ({
        name: `${base}-${list[i][0] === list[i][1] ? 'page-' + list[i][0] : 'pages-' + list[i][0] + '-' + list[i][1]}.pdf`,
        blob: new Blob([b as BlobPart], { type: 'application/pdf' }),
      })));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const downloadAll = async () => {
    if (!out || !file) return;
    if (out.length === 1) return downloadBlob(out[0].blob, out[0].name);
    setBusy({ done: 0, total: 0, label: 'Creating ZIP…' });
    try { downloadBlob(await zipFiles(out), baseName(file.name) + '-split.zip'); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file)
    return <>
      <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const warn = sizeWarning(file.size);
  return (
    <div>
      <ul class="files">
        <li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{pages ? `${pages} pages · ` : ''}{formatBytes(file.size)}</span>
          <button type="button" class="mini" aria-label="Remove" onClick={() => { setFile(null); setOut(null); }}>✕</button></li>
      </ul>
      {pages > 0 && !out && (
        <div class="opts">
          <div class="seg" role="group" aria-label="Split mode">
            <button type="button" aria-pressed={mode === 'ranges'} onClick={() => setMode('ranges')}>Split by ranges</button>
            <button type="button" aria-pressed={mode === 'every'} onClick={() => setMode('every')}>Every page</button>
          </div>
          {mode === 'ranges' && (
            <label>Page ranges (e.g. 1-3, 5, 8-10)
              <input type="text" value={ranges} inputMode="numeric" onInput={(e) => setRanges((e.target as HTMLInputElement).value)} style={{ minWidth: '220px' }} />
            </label>
          )}
        </div>
      )}
      {mode === 'every' && pages > 0 && !out && <p class="status">You will get {pages} PDF files in a ZIP.</p>}
      {warn && <ErrorBox>{warn}</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Your PDF was split into {out.length} file{out.length > 1 ? 's' : ''}.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={downloadAll} disabled={!!busy}>{out.length > 1 ? 'Download all (ZIP)' : 'Download PDF'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Split again</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
          {out.length > 1 && out.length <= 50 && (
            <ul class="files" style={{ textAlign: 'left' }}>
              {out.map((o) => <li key={o.name}><span class="fname">{o.name}</span><span class="meta">{formatBytes(o.blob.size)}</span>
                <button type="button" class="dl-file" aria-label={'Download ' + o.name} onClick={() => downloadBlob(o.blob, o.name)}>Download</button></li>)}
            </ul>
          )}
        </div>
      ) : (
        pages > 0 && <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={split}>Split PDF</button></div>
      )}
    </div>
  );
}
