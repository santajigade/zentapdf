import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';

export default function PdfPassword({ mode }: { mode: 'protect' | 'unlock' }) {
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [perm, setPerm] = useState({ allowPrint: true, allowCopy: false, allowModify: false });
  const [needPw, setNeedPw] = useState(false);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Blob | null>(null);

  const decrypt = async (f: File, password: string) => {
    setError(''); setBusy({ done: 0, total: 0, label: 'Unlocking…' });
    try {
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'decrypt', file: await f.arrayBuffer(), password }, [], undefined, 'qpdf');
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' })); setNeedPw(false);
    } catch (e: any) {
      if (e?.message === 'WRONG_PASSWORD') { setNeedPw(true); if (password) setError('That password is not correct. Please try again.'); }
      else setError(friendlyError(e));
    } finally { setBusy(null); }
  };

  const pick = (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setResult(null); setFile(f); setPw(''); setPw2(''); setNeedPw(false);
    if (mode === 'unlock') decrypt(f, ''); // PDFs with only an owner password open without one
  };

  const protect = async () => {
    if (!file) return;
    if (pw.length < 4) { setError('Please use a password with at least 4 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setError(''); setBusy({ done: 0, total: 0, label: 'Encrypting with AES-256…' });
    try {
      const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'encrypt', file: await file.arrayBuffer(), user: pw, owner: '', ...perm }, [], undefined, 'qpdf');
      setResult(new Blob([r.files[0] as BlobPart], { type: 'application/pdf' }));
    } catch (e: any) {
      setError(e?.message === 'WRONG_PASSWORD' ? 'This PDF is already password-protected. Unlock it first with our Unlock PDF tool.' : friendlyError(e));
    } finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF file" hint="or drop a PDF here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const pwInput = (val: string, set: (v: string) => void, label: string, auto: string) => (
    <label style={{ flex: '1 1 220px' }}>{label}
      <input type={show ? 'text' : 'password'} value={val} autoComplete={auto} onInput={(e) => { set((e.target as HTMLInputElement).value); setResult(null); }}
        onKeyDown={(e) => e.key === 'Enter' && (mode === 'unlock' ? decrypt(file, pw) : protect())}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card)', color: 'var(--text)', font: 'inherit' }} />
    </label>
  );
  const check = (k: keyof typeof perm, label: string) => (
    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 500 }}><input type="checkbox" checked={perm[k]} onChange={(e) => { setPerm({ ...perm, [k]: (e.target as HTMLInputElement).checked }); setResult(null); }} />{label}</label>
  );

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setResult(null); }}>✕</button></li></ul>
      {!result && mode === 'protect' && <>
        <div class="opts" data-title="Password">
          {pwInput(pw, setPw, 'Password', 'new-password')}
          {pwInput(pw2, setPw2, 'Repeat password', 'new-password')}
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={show} onChange={(e) => setShow((e.target as HTMLInputElement).checked)} /> Show</label>
        </div>
        <div class="opts" data-title="Permissions" style={{ gap: '10px 22px' }}>{check('allowPrint', 'Allow printing')}{check('allowCopy', 'Allow copying text')}{check('allowModify', 'Allow editing')}</div>
        <p class="status" style={{ textAlign: 'left' }}>Keep your password safe, if you forget it, nobody (including us) can open the file.</p>
      </>}
      {!result && mode === 'unlock' && needPw && <>
        <p class="status" style={{ textAlign: 'left' }}>This PDF needs a password to open. Type the password you know:</p>
        <div class="opts" data-title="Password">{pwInput(pw, setPw, 'Password', 'current-password')}
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={show} onChange={(e) => setShow((e.target as HTMLInputElement).checked)} /> Show</label></div>
      </>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {result ? (
        <div class="done">
          <p class="big">{mode === 'protect' ? 'Done! Your PDF is now password-protected (AES-256).' : 'Done! The password and restrictions were removed.'}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(result, `${baseName(file.name)}-${mode === 'protect' ? 'protected' : 'unlocked'}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setResult(null); }}>New file</button>
          </div>
        </div>
      ) : (
        !busy && (mode === 'protect' || needPw) && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={() => (mode === 'protect' ? protect() : decrypt(file, pw))}>{mode === 'protect' ? 'Protect PDF' : 'Unlock PDF'}</button></div>
      )}
    </div>
  );
}
