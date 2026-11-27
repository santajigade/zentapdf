import { useState } from 'preact/hooks';
import { DropZone, ErrorBox } from './shared';
import { formatBytes, downloadBlob } from '../../lib/utils';
import { isImage } from '../../lib/imageOps';

const read = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export default function ImageToBase64() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState('');
  const [fmt, setFmt] = useState<'uri' | 'raw' | 'css' | 'html'>('uri');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const pick = async (files: File[]) => {
    const f = files.find(isImage);
    if (!f) { setError('Please choose an image file.'); return; }
    setError(''); setFile(f); setCopied(false);
    try { setData(await read(f)); } catch { setError('Could not read this image.'); }
  };

  if (!file) return <>
    <DropZone accept="image/*" label="Choose image" hint="JPG, PNG, WebP, GIF, SVG…, or drop it here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const text = fmt === 'raw' ? data.slice(data.indexOf(',') + 1)
    : fmt === 'css' ? `background-image: url("${data}");`
    : fmt === 'html' ? `<img src="${data}" alt="">` : data;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Copy failed, select the text and press Ctrl+C instead.'); }
  };
  return (
    <div>
      <ul class="files"><li>
        <img class="thumb" src={data} alt="" />
        <span class="fname" title={file.name}>{file.name}</span>
        <span class="meta">{formatBytes(file.size)} → {formatBytes(text.length)} of text</span>
        <button type="button" class="mini" aria-label="Remove" onClick={() => { setFile(null); setData(''); }}>✕</button>
      </li></ul>
      {file.size > 100 * 1024 && <p class="status">Tip: Base64 is about 33% bigger than the file. It is best for small images such as icons and logos.</p>}
      <div class="opts">
        <div class="seg" role="group" aria-label="Output format">
          <button type="button" aria-pressed={fmt === 'uri'} onClick={() => setFmt('uri')}>Data URI</button>
          <button type="button" aria-pressed={fmt === 'raw'} onClick={() => setFmt('raw')}>Base64 only</button>
          <button type="button" aria-pressed={fmt === 'css'} onClick={() => setFmt('css')}>CSS</button>
          <button type="button" aria-pressed={fmt === 'html'} onClick={() => setFmt('html')}>HTML</button>
        </div>
      </div>
      <textarea readOnly aria-label="Base64 output" value={text.length > 2_000_000 ? text.slice(0, 2_000_000) + '… (too long to show, use Download)' : text}
        style={{ width: '100%', height: '180px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text)', wordBreak: 'break-all' }}
        onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div class="actions">
        <button type="button" class="btn btn-primary btn-lg" onClick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
        <button type="button" class="btn btn-ghost" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), file.name.replace(/\.[^.]+$/, '') + '-base64.txt')}>Download .txt</button>
        <DropZone compact accept="image/*" label="New image" onFiles={pick} />
      </div>
    </div>
  );
}
