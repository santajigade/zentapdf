import { useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { blocksToPdf, type Block } from '../../lib/docpdf';
import { pdfPreview } from './DocToPdf';

export type OfficeKind = 'word' | 'excel' | 'ppt' | 'odt' | 'ods' | 'odp';
const INFO: Record<OfficeKind, { accept: string; re: RegExp; label: string; old?: RegExp; oldMsg?: string }> = {
  word: { accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', re: /\.docx$/i, label: 'Word document', old: /\.(doc|dot)$/i, oldMsg: 'Old .doc files are not supported. Open the file in Word or Google Docs and save it as .docx, then try again.' },
  excel: { accept: '.xlsx,.xls,.xlsm,.xlsb,.ods,.csv', re: /\.(xlsx|xls|xlsm|xlsb|ods|csv)$/i, label: 'Excel file' },
  ppt: { accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', re: /\.pptx$/i, label: 'PowerPoint file', old: /\.(ppt|pps)$/i, oldMsg: 'Old .ppt files are not supported. Open the file in PowerPoint or Google Slides and save it as .pptx, then try again.' },
  odt: { accept: '.odt,application/vnd.oasis.opendocument.text', re: /\.odt$/i, label: 'ODT document' },
  ods: { accept: '.ods,application/vnd.oasis.opendocument.spreadsheet', re: /\.ods$/i, label: 'ODS spreadsheet' },
  odp: { accept: '.odp,application/vnd.oasis.opendocument.presentation', re: /\.odp$/i, label: 'ODP presentation' },
};

export default function OfficeToPdf({ kind }: { kind: OfficeKind }) {
  const I = INFO[kind];
  const sheet = kind === 'excel' || kind === 'ods', slides = kind === 'ppt' || kind === 'odp';
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<'a4' | 'letter'>('a4');
  const [orient, setOrient] = useState<'auto' | 'portrait' | 'landscape'>(sheet ? 'auto' : 'portrait');
  const [size, setSize] = useState(sheet ? 9 : 11);
  const [grid, setGrid] = useState<'auto' | 'on' | 'off'>('auto');
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ blob: Blob; pages: number; preview: string; note: string } | null>(null);

  const pick = (files: File[]) => {
    const f = files.find((x) => I.re.test(x.name));
    if (!f) { const o = I.old && files.find((x) => I.old!.test(x.name)); setError(o ? I.oldMsg! : `Please choose a ${I.label}.`); return; }
    setError(''); setOut(null); setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Reading file…' });
    try {
      const buf = await file.arrayBuffer();
      const office = await import('../../lib/office');
      let bytes: Uint8Array; let pages = 0; let note = '';
      if (kind === 'word') {
        try {
          bytes = await office.docxToPdfExact(file, (d, t) => setBusy({ done: d, total: t, label: `Drawing page ${d + 1} of ${t}…` }));
          const { PDFDocument } = await import('pdf-lib'); pages = (await PDFDocument.load(bytes)).getPageCount();
          note = 'Your document keeps its layout, fonts, colours, tables, pictures, headers and footers. The text is real text you can search and copy.';
        } catch (e) {
          console.warn(e);
          const r = await office.docxToBlocks(buf);
          const doc = await blocksToPdf(r.blocks, { page, size }); bytes = await doc.save(); pages = doc.getPageCount();
          note = 'This document used features we could not reproduce exactly, so a simplified layout was used.';
        }
      } else if (kind === 'excel' && /\.(xlsx|xlsm)$/i.test(file.name)) {
        bytes = await office.xlsxToPdfExact(buf, { page, orient, grid }, (d, t) => setBusy({ done: d, total: t, label: `Drawing sheet ${d + 1} of ${t}…` }));
        const { PDFDocument } = await import('pdf-lib'); pages = (await PDFDocument.load(bytes)).getPageCount();
        note = 'Each sheet keeps its fonts, colours, borders, merged cells and column widths, scaled to fit the page width. The text is real text you can search and copy.';
      } else if (slides) {
        const list = kind === 'ppt' ? await office.pptxSlides(buf) : await office.odpSlides(buf);
        bytes = await office.slidesToPdf(list, (d, t) => setBusy({ done: d, total: t, label: `Drawing slide ${d + 1} of ${t}…` }));
        pages = list.length;
        note = 'Slides are saved as high-quality pictures. Animations, videos and some special effects are not included.';
      } else {
        let blocks: Block[];
        if (kind === 'word') { const r = await office.docxToBlocks(buf); blocks = r.blocks; }
        else if (kind === 'odt') blocks = await office.odtToBlocks(buf);
        else blocks = await office.sheetsToBlocks(buf);
        if (!blocks.length) throw new Error('No content was found in this file.');
        setBusy({ done: 0, total: blocks.length, label: 'Creating PDF…' });
        const doc = await blocksToPdf(blocks, { page, landscape: orient === 'auto' ? 'auto' : orient === 'landscape', size }, (d, t) => setBusy({ done: d, total: t, label: 'Creating PDF…' }));
        doc.setTitle(baseName(file.name)); doc.setProducer('ZentaPDF'); doc.setCreator('ZentaPDF');
        bytes = await doc.save(); pages = doc.getPageCount();
        note = sheet ? 'Each sheet starts on a new page and the header row repeats on every page.' : 'Text, headings, lists, tables and pictures are kept. Headers, footers and special layouts are simplified.';
      }
      setOut({ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages, preview: await pdfPreview(bytes), note });
    } catch (e: any) {
      setError(/zip|central directory|End of data|invalid/i.test(String(e?.message)) ? `This file could not be opened. Make sure it is a real ${I.label} and not password-protected.` : friendlyError(e));
    } finally { setBusy(null); }
  };

  if (!file) return <>
    <DropZone accept={I.accept + (I.old ? ',.doc,.ppt' : '')} label={`Choose ${I.label}`} hint={`or drop a ${I.label} here`} onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {!out && !slides && kind !== 'word' && <div class="opts" data-title="Page settings">
        <label>Page size<select value={page} onChange={(e) => setPage((e.target as HTMLSelectElement).value as any)}><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
        <label>Orientation<select value={orient} onChange={(e) => setOrient((e.target as HTMLSelectElement).value as any)}>{sheet && <option value="auto">Automatic</option>}<option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        {kind === 'excel' && <label>Gridlines<select value={grid} onChange={(e) => setGrid((e.target as HTMLSelectElement).value as any)}><option value="auto">Automatic</option><option value="on">Show</option><option value="off">Hide</option></select></label>}
        {kind !== 'excel' && <label>Text size<select value={size} onChange={(e) => setSize(+(e.target as HTMLSelectElement).value)}>{(sheet ? [[7, 'Small'], [9, 'Normal'], [11, 'Large']] : [[9, 'Small'], [11, 'Normal'], [13, 'Large']]).map(([v, t]) => <option value={v}>{t}</option>)}</select></label>}
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Your PDF has {out.pages} page{out.pages > 1 ? 's' : ''} ({formatBytes(out.blob.size)}).</p>
          <p class="status">{out.note}</p>
          <div class="gif-prev"><img src={out.preview} alt="Preview of the first page" style={{ background: '#fff' }} /></div>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(file.name)}.pdf`)}>Download PDF</button>
            {!slides && kind !== 'word' && <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Change settings</button>}
            <button type="button" class="btn btn-ghost" onClick={() => { setFile(null); setOut(null); }}>New file</button>
          </div>
        </div>
      ) : !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={run}>Convert to PDF</button></div>}
    </div>
  );
}
