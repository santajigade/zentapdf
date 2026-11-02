import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadBitmap } from '../../lib/imageOps';
import { blocksToPdf, readText, parseCsv, htmlToBlocks, textToBlocks, markdownToBlocks } from '../../lib/docpdf';
import { pdfPreview } from './DocToPdf';

const IMG = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const DOC = /\.(pdf|txt|csv|html?|md)$/i;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function ZipToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; pages: number; used: number; skipped: string[]; preview: string } | null>(null);

  const run = async (f: File) => {
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Opening ZIP…' });
    try {
      const { unzipSync } = await import('fflate');
      const all = unzipSync(new Uint8Array(await f.arrayBuffer()));
      const names = Object.keys(all).filter((n) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(n)).sort(collator.compare);
      const use = names.filter((n) => IMG.test(n) || DOC.test(n));
      const skipped = names.filter((n) => !use.includes(n)).map((n) => n.split('/').pop()!);
      if (!use.length) throw new Error('No PDFs, images or text files were found in this ZIP.');
      const { PDFDocument } = await import('pdf-lib');
      const outDoc = await PDFDocument.create();
      for (let i = 0; i < use.length; i++) {
        const n = use[i]; const data = all[n];
        setBusy({ done: i, total: use.length, label: `Adding ${n.split('/').pop()}` });
        try {
          if (/\.pdf$/i.test(n)) {
            const src = await PDFDocument.load(data, { ignoreEncryption: false });
            (await outDoc.copyPages(src, src.getPageIndices())).forEach((p) => outDoc.addPage(p));
          } else if (IMG.test(n)) {
            const bmp = await loadBitmap(new File([data as BlobPart], n.split('/').pop()!, { type: /\.png$/i.test(n) ? 'image/png' : '' }));
            const c = document.createElement('canvas'); const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
            c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
            const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
            const img = await outDoc.embedJpg(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => b!.arrayBuffer().then(r), 'image/jpeg', 0.9)));
            const [PW, PH] = c.width > c.height ? [841.89, 595.28] : [595.28, 841.89];
            const M = 24, k = Math.min((PW - M * 2) / c.width, (PH - M * 2) / c.height);
            const pg = outDoc.addPage([PW, PH]);
            pg.drawImage(img, { x: (PW - c.width * k) / 2, y: (PH - c.height * k) / 2, width: c.width * k, height: c.height * k });
          } else {
            const text = await readText(new Blob([data as BlobPart]));
            const blocks = /\.csv$/i.test(n) ? [{ t: 'table' as const, rows: parseCsv(text), header: true }]
              : /\.html?$/i.test(n) ? await htmlToBlocks(new DOMParser().parseFromString(text, 'text/html'))
              : /\.md$/i.test(n) ? markdownToBlocks(text) : textToBlocks(text, false);
            await blocksToPdf(blocks, { landscape: 'auto' }, undefined, outDoc as any);
          }
        } catch { skipped.push(n.split('/').pop()! + ' (could not be read)'); }
        (all as any)[n] = null;
      }
      if (!outDoc.getPageCount()) throw new Error('None of the files in this ZIP could be converted.');
      setBusy({ done: use.length, total: use.length, label: 'Saving PDF…' });
      outDoc.setProducer('ZentaPDF'); outDoc.setCreator('ZentaPDF');
      const bytes = await outDoc.save();
      setOut({ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages: outDoc.getPageCount(), used: use.length - skipped.filter((s) => s.endsWith('(could not be read)')).length, skipped, preview: await pdfPreview(bytes) });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const pick = (files: File[]) => {
    const f = files.find((x) => /\.zip$/i.test(x.name) || /zip/.test(x.type));
    if (!f) { setError('Please choose a ZIP file.'); return; }
    setFile(f); run(f);
  };

  if (!file) return <>
    <DropZone accept=".zip,application/zip" label="Choose ZIP file" hint="or drop a ZIP with PDFs, images or text files" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); setError(''); }}>✕</button></li></ul>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out && (
        <div class="done">
          <p class="big">Done! {out.used} file{out.used > 1 ? 's' : ''} combined into one PDF with {out.pages} pages ({formatBytes(out.blob.size)}).</p>
          {out.skipped.length > 0 && <p class="status">Skipped: {out.skipped.slice(0, 8).join(', ')}{out.skipped.length > 8 ? ` and ${out.skipped.length - 8} more` : ''}</p>}
          <div class="gif-prev"><img src={out.preview} alt="Preview of the first page" style={{ background: '#fff' }} /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New ZIP</button>
          </div>
        </div>
      )}
    </div>
  );
}
