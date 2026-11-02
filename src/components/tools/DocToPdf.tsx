import { useEffect, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';
import { blocksToPdf, readText, parseCsv, parseRtf, htmlToBlocks, textToBlocks, epubToBlocks, markdownToBlocks, type Block } from '../../lib/docpdf';

export type DocKind = 'txt' | 'csv' | 'html' | 'epub' | 'rtf' | 'md';
const ACCEPT: Record<DocKind, string> = {
  txt: '.txt,.text,.log,text/plain', csv: '.csv,.tsv,text/csv', html: '.html,.htm,text/html', epub: '.epub,application/epub+zip', rtf: '.rtf,application/rtf,text/rtf', md: '.md,.markdown,text/markdown',
};
const NAME: Record<DocKind, string> = { txt: 'text file', csv: 'CSV file', html: 'HTML file', epub: 'EPUB e-book', rtf: 'RTF document', md: 'Markdown file' };
const EXT: Record<DocKind, RegExp> = { txt: /\.(txt|text|log)$/i, csv: /\.(csv|tsv)$/i, html: /\.html?$/i, epub: /\.epub$/i, rtf: /\.rtf$/i, md: /\.(md|markdown)$/i };

/** Render page 1 of a PDF to a small preview image. */
export async function pdfPreview(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const pg = await doc.getPage(1); const vp0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 360 / vp0.width });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.85);
}

export default function DocToPdf({ kind }: { kind: DocKind }) {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<'a4' | 'letter'>('a4');
  const [orient, setOrient] = useState<'auto' | 'portrait' | 'landscape'>(kind === 'csv' ? 'auto' : 'portrait');
  const [size, setSize] = useState(kind === 'csv' ? 9 : 11);
  const [mono, setMono] = useState(false);
  const [header, setHeader] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; pages: number; preview: string } | null>(null);
  useEffect(() => { setOut(null); }, [page, orient, size, mono, header]);

  const pick = (files: File[]) => {
    const f = files.find((x) => EXT[kind].test(x.name)) ?? (kind === 'txt' ? files.find((x) => x.type.startsWith('text/')) : undefined);
    if (!f) { setError(`Please choose a ${NAME[kind]}.`); return; }
    setError(''); setOut(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Reading file…' });
    try {
      let blocks: Block[] = [];
      if (kind === 'epub') blocks = (await epubToBlocks(await file.arrayBuffer(), (d, t) => setBusy({ done: d, total: t, label: 'Reading chapters…' }))).blocks;
      else {
        const text = await readText(file);
        if (kind === 'txt') blocks = textToBlocks(text, mono);
        else if (kind === 'md') blocks = markdownToBlocks(text);
        else if (kind === 'csv') { const rows = parseCsv(text); if (!rows.length) throw new Error('This CSV file is empty.'); blocks = [{ t: 'table', rows, header }]; }
        else if (kind === 'rtf') { if (!/^\s*\{\\rtf/.test(text)) throw new Error('This file is not a valid RTF document.'); blocks = parseRtf(text); }
        else if (kind === 'html') {
          const doc = new DOMParser().parseFromString(text, 'text/html');
          blocks = await htmlToBlocks(doc, async (src) => {
            if (/^data:/i.test(src)) return (await fetch(src)).blob();
            if (/^https?:/i.test(src)) { const r = await fetch(src, { mode: 'cors' }); return r.ok ? r.blob() : null; }
            return null;
          });
        }
      }
      if (!blocks.length) throw new Error('No text was found in this file.');
      setBusy({ done: 0, total: blocks.length, label: 'Creating PDF…' });
      const doc = await blocksToPdf(blocks, { page, landscape: orient === 'auto' ? 'auto' : orient === 'landscape', size }, (d, t) => setBusy({ done: d, total: t, label: 'Creating PDF…' }));
      doc.setTitle(baseName(file.name)); doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
      const bytes = await doc.save();
      setOut({ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages: doc.getPageCount(), preview: await pdfPreview(bytes) });
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept={ACCEPT[kind]} label={`Choose ${NAME[kind]}`} hint={`or drop a ${NAME[kind]} here`} onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {!out && <div class="opts" data-title="Page settings">
        <label>Page size<select value={page} onChange={(e) => setPage((e.target as HTMLSelectElement).value as any)}><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
        <label>Orientation<select value={orient} onChange={(e) => setOrient((e.target as HTMLSelectElement).value as any)}>{kind === 'csv' && <option value="auto">Automatic</option>}<option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <label>Text size<select value={size} onChange={(e) => setSize(+(e.target as HTMLSelectElement).value)}>{(kind === 'csv' ? [[7, 'Small'], [9, 'Normal'], [11, 'Large']] : [[9, 'Small'], [11, 'Normal'], [13, 'Large'], [16, 'Extra large']]).map(([v, t]) => <option value={v}>{t}</option>)}</select></label>
        {kind === 'txt' && <label>Font<select value={mono ? 1 : 0} onChange={(e) => setMono((e.target as HTMLSelectElement).value === '1')}><option value={0}>Normal</option><option value={1}>Typewriter (keeps columns aligned)</option></select></label>}
        {kind === 'csv' && <label class="check"><input type="checkbox" checked={header} onChange={(e) => setHeader((e.target as HTMLInputElement).checked)} /> First row is the header</label>}
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Your PDF has {out.pages} page{out.pages > 1 ? 's' : ''} ({formatBytes(out.blob.size)}).</p>
          <div class="gif-prev"><img src={out.preview} alt="Preview of the first page" style={{ background: '#fff' }} /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Convert to PDF</button></div>}
    </div>
  );
}
