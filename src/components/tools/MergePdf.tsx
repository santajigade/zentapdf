import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, MoveButtons, moveItem, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, uid } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';

type Item = { id: string; file: File };

export default function MergePdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Blob | null>(null);

  const add = (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    setError(pdfs.length < files.length ? 'Some files were skipped because they are not PDFs.' : '');
    setResult(null);
    setItems((cur) => [...cur, ...pdfs.map((file) => ({ id: uid(), file }))]);
  };

  const merge = async () => {
    setError(''); setResult(null);
    setBusy({ done: 0, total: items.length, label: 'Reading files…' });
    try {
      const bufs = await Promise.all(items.map((i) => i.file.arrayBuffer()));
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'merge', files: bufs }, bufs, setBusy);
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const total = items.reduce((s, i) => s + i.file.size, 0);
  const warn = sizeWarning(total);

  if (!items.length)
    return <>
      <DropZone accept="application/pdf,.pdf" multiple label="Choose PDF files" hint="or drop PDFs here, select two or more" onFiles={add} />
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  return (
    <div>
      <ul class="files" aria-label="Files to merge (in order)">
        {items.map((it, i) => (
          <li key={it.id}>
            <span class="num">{i + 1}</span>
            <span class="fname" title={it.file.name}>{it.file.name}</span>
            <span class="meta">{formatBytes(it.file.size)}</span>
            <MoveButtons i={i} n={items.length} move={(a, b) => { setItems(moveItem(items, a, b)); setResult(null); }} remove={(k) => { setItems(items.filter((_, j) => j !== k)); setResult(null); }} />
          </li>
        ))}
      </ul>
      {warn && <ErrorBox>{warn}</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          <p class="big">Done! Your PDFs were merged.</p>
          <p class="status">{items.length} files → 1 PDF ({formatBytes(result.size)})</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result, 'merged.pdf')}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setItems([]); setResult(null); }}>Start over</button>
          </div>
        </div>
      ) : (
        <div class="actions">
          <DropZone compact accept="application/pdf,.pdf" multiple label="Add more PDFs" onFiles={add} />
          <button type="button" class="btn btn-primary btn-lg" disabled={!!busy || items.length < 2} onClick={merge}>
            {items.length < 2 ? 'Add at least 2 PDFs' : 'Merge PDF'}
          </button>
        </div>
      )}
    </div>
  );
}
