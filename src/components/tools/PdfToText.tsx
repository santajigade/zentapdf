import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import type { Progress } from '../../lib/pdfJob';

/** Rebuild reading-order lines from pdf.js text items. */
function pageText(items: any[]): string {
  const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
  for (const it of items) {
    if (!('str' in it)) continue;
    const x = it.transform[4], y = it.transform[5], h = Math.hypot(it.transform[2], it.transform[3]) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) < h * 0.5);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, s: it.str, w: it.width });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '', end = -Infinity;
    for (const p of r.parts) { if (line && p.x - end > 2 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' '; line += p.s; end = p.x + p.w; }
    return line.trimEnd();
  }).join('\n');
}

export default function PdfToText() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [empty, setEmpty] = useState(false);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setText(''); setFile(f); setEmpty(false);
    let doc: any;
    try {
      const pdfjs = await loadPdfjs();
      doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      const out: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        setBusy({ done: i - 1, total: doc.numPages, label: `Reading page ${i} of ${doc.numPages}` });
        const pg = await doc.getPage(i);
        out.push(pageText((await pg.getTextContent()).items)); pg.cleanup();
      }
      const all = out.map((t, i) => (doc.numPages > 1 ? `--- Page ${i + 1} ---\n` : '') + t).join('\n\n');
      setText(all); setEmpty(!out.join('').trim());
    } catch (e: any) {
      setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Please unlock it first, then try again.' : friendlyError(e)); setFile(null);
    } finally { doc?.destroy?.(); setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {busy && <ProgressBar {...busy} />}
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}{text && ` · ${text.length.toLocaleString()} characters`}</span>
        <button type="button" class="mini" aria-label="Remove file" onClick={() => { setFile(null); setText(''); }}>✕</button></li></ul>
      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {empty && <ErrorBox>No text was found. This PDF is probably a scan (pictures of pages). Text recognition (OCR) for scans is coming soon.</ErrorBox>}
      {text && !empty && <>
        <textarea readOnly aria-label="Extracted text" value={text}
          style={{ width: '100%', height: '320px', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text)' }} />
        <div class="actions">
          <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), baseName(file.name) + '.txt')}>Download .txt</button>
          <button type="button" class="btn btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Copy failed, select the text and press Ctrl+C.'); } }}>{copied ? 'Copied!' : 'Copy all'}</button>
          <DropZone compact accept="application/pdf,.pdf" label="New PDF" onFiles={pick} />
        </div>
      </>}
    </div>
  );
}
