import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';

const LV: [string, string, string][] = [['low', 'Light', 'Best quality, smaller saving'], ['recommended', 'Recommended', 'Good quality, good saving'], ['extreme', 'Strong', 'Smallest file, lower image quality']];

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState('recommended');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; images: number; changed: number } | null>(null);

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setResult(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setResult(null); setBusy({ done: 0, total: 0, label: 'Reading PDF…' });
    try {
      const buf = await file.arrayBuffer();
      const r1 = await runPdfJob<{ files: Uint8Array[]; stats: { images: number; changed: number } }>({ op: 'compress', file: buf.slice(0), level }, [], setBusy);
      setBusy({ done: 0, total: 0, label: 'Final optimisation…' });
      let best: Uint8Array = r1.files[0];
      try {
        const r2 = await runPdfJob<{ files: Uint8Array[] }>({ op: 'optimize', file: best.slice().buffer }, [], undefined, 'qpdf');
        if (r2.files[0].length < best.length) best = r2.files[0];
      } catch { /* optional step */ }
      const orig = new Uint8Array(buf);
      const out = best.length < orig.length ? best : orig;
      setResult({ blob: new Blob([out as BlobPart], { type: 'application/pdf' }), ...r1.stats });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const pct = result ? Math.min(99, Math.round((1 - result.blob.size / file.size) * 100)) : 0;
  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setResult(null); }}>✕</button></li></ul>
      {!result && (
        <div role="radiogroup" aria-label="Compression level" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', margin: '14px 0' }}>
          {LV.map(([v, t, d]) => (
            <button type="button" role="radio" aria-checked={level === v} onClick={() => setLevel(v)}
              style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', font: 'inherit', color: 'var(--text)', background: level === v ? 'var(--brand-50)' : 'var(--card)', border: `2px solid ${level === v ? 'var(--brand)' : 'var(--border)'}` }}>
              <strong style={{ display: 'block' }}>{t}</strong><span style={{ color: 'var(--muted)', fontSize: '.88rem' }}>{d}</span>
            </button>
          ))}
        </div>
      )}
      {sizeWarning(file.size) && <ErrorBox>{sizeWarning(file.size)}</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          {pct > 0
            ? <p class="big">Done! {formatBytes(file.size)} → {formatBytes(result.blob.size)} <span class="saving">(-{pct}%)</span></p>
            : <p class="big" style={{ color: 'var(--text)' }}>This PDF is already well optimised — it could not be made smaller.</p>}
          <p class="status">{result.changed} of {result.images} images were optimised. Text and vector graphics are kept exactly as they are.</p>
          <div class="actions">
            {pct > 0 && <button type="button" class="btn btn-primary btn-lg" onClick={() => downloadBlob(result.blob, `${baseName(file.name)}-compressed.pdf`)}>Download PDF</button>}
            <button type="button" class="btn btn-ghost" onClick={() => setResult(null)}>Try another level</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New file</button>
          </div>
        </div>
      ) : (
        !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Compress PDF</button></div>
      )}
    </div>
  );
}
