import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { loadPdfjs } from '../../lib/pdfjs';

type Kind = 'text' | 'multiline' | 'check' | 'radio' | 'select' | 'list';
type Widget = { field: string; kind: Kind; page: number; x: number; y: number; w: number; h: number; option?: string; options?: string[]; readOnly?: boolean; maxLen?: number };
type PageInfo = { w: number; h: number; url: string };

export default function FormFiller() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [noFields, setNoFields] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const bytes = useRef<ArrayBuffer | null>(null);
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError(''); setOut(null); setNoFields(false); setWidgets([]); setPages([]); setFile(f);
    setBusy({ done: 0, total: 0, label: 'Reading form…' });
    try {
      const buf = await f.arrayBuffer(); bytes.current = buf;
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = await import('pdf-lib');
      const doc = await PDFDocument.load(buf.slice(0));
      const pgs = doc.getPages();
      const pageOf = (w: any) => { const ref = w.P(); let k = ref ? pgs.findIndex((p) => p.ref === ref) : -1; if (k < 0) k = pgs.findIndex((p) => (p.node.Annots()?.asArray() ?? []).some((a: any) => a === w.dict || (doc.context.lookup(a) === w.dict))); return k; };
      const ws: Widget[] = []; const vals: Record<string, string | boolean> = {};
      for (const fld of doc.getForm().getFields()) {
        const name = fld.getName(); const ro = fld.isReadOnly();
        let kind: Kind | null = null; let options: string[] | undefined; let maxLen: number | undefined;
        if (fld instanceof PDFTextField) { kind = fld.isMultiline() ? 'multiline' : 'text'; vals[name] = fld.getText() ?? ''; maxLen = fld.getMaxLength(); }
        else if (fld instanceof PDFCheckBox) { kind = 'check'; vals[name] = fld.isChecked(); }
        else if (fld instanceof PDFRadioGroup) { kind = 'radio'; options = fld.getOptions(); vals[name] = fld.getSelected() ?? ''; }
        else if (fld instanceof PDFDropdown) { kind = 'select'; options = fld.getOptions(); vals[name] = fld.getSelected()[0] ?? ''; }
        else if (fld instanceof PDFOptionList) { kind = 'list'; options = fld.getOptions(); vals[name] = fld.getSelected()[0] ?? ''; }
        if (!kind) continue;
        fld.acroField.getWidgets().forEach((w: any, k: number) => {
          const p = pageOf(w); if (p < 0) return;
          const r = w.getRectangle(); const ph = pgs[p].getHeight();
          ws.push({ field: name, kind: kind!, page: p, x: r.x, y: ph - r.y - r.height, w: r.width, h: r.height, options, option: kind === 'radio' ? options?.[k] : undefined, readOnly: ro, maxLen });
        });
      }
      setValues(vals); setWidgets(ws);
      if (!ws.length) { setNoFields(true); return; }
      // render pages without form appearances (our own inputs sit on top)
      const pdfjs = await loadPdfjs();
      const pdoc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
      const list: PageInfo[] = []; const c = document.createElement('canvas');
      const usedPages = new Set(ws.map((w) => w.page));
      for (let i = 1; i <= pdoc.numPages; i++) {
        setBusy({ done: i - 1, total: pdoc.numPages, label: 'Loading pages…' });
        const pg = await pdoc.getPage(i); const v1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 1100 / v1.width });
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: cx, viewport: vp, annotationMode: usedPages.has(i - 1) ? pdfjs.AnnotationMode.DISABLE : pdfjs.AnnotationMode.ENABLE }).promise;
        list.push({ w: v1.width, h: v1.height, url: URL.createObjectURL(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.88))) });
        setPages(list.slice());
      }
    } catch (e) { setError(friendlyError(e)); setFile(null); }
    finally { setBusy(null); }
  };

  const save = async () => {
    if (!bytes.current) return;
    setError(''); setOut(null); setBusy({ done: 0, total: 0, label: 'Saving form…' });
    try {
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes.current.slice(0));
      const form = doc.getForm();
      const needsUnicode = Object.values(values).some((v) => typeof v === 'string' && /[^\x00-\xFF]/.test(v));
      for (const fld of form.getFields()) {
        const v = values[fld.getName()]; if (v === undefined || fld.isReadOnly()) continue;
        try {
          if (fld instanceof PDFTextField) fld.setText(String(v) || undefined);
          else if (fld instanceof PDFCheckBox) v ? fld.check() : fld.uncheck();
          else if (fld instanceof PDFRadioGroup) { if (v) fld.select(String(v)); else fld.clear(); }
          else if (fld instanceof PDFDropdown) { if (v) fld.select(String(v)); else fld.clear(); }
          else if (fld instanceof PDFOptionList) { if (v) fld.select(String(v)); else fld.clear(); }
        } catch { /* skip a field that can't take this value */ }
      }
      if (needsUnicode) { const { embedUnicodeFont } = await import('../../lib/docpdf'); form.updateFieldAppearances(await embedUnicodeFont(doc)); }
      if (flatten) form.flatten();
      const out = await doc.save();
      setOut(new Blob([out as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const set = (name: string, v: string | boolean) => { setValues((o) => ({ ...o, [name]: v })); setOut(null); };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Choose PDF form" hint="or drop a fillable PDF form here" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const filled = Object.values(values).filter((v) => v !== '' && v !== false).length;
  return (
    <div>
      <ul class="files"><li><span class="fname" title={file.name}>{file.name}</span><span class="meta">{formatBytes(file.size)}{widgets.length > 0 && ` · ${Object.keys(values).length} fields`}</span>
        <button type="button" class="mini" aria-label="Remove file" disabled={!!busy} onClick={() => { setFile(null); setOut(null); }}>✕</button></li></ul>
      {noFields && <div class="note-box note-sky">This PDF has no fillable form fields. To type on it anyway, use <a href="/edit-pdf/">Edit PDF</a>, click "Add text" and type anywhere on the page.</div>}
      {widgets.length > 0 && <div class="opts" data-title="Form">
        <span class="status">{filled} of {Object.keys(values).length} fields filled · type directly in the blue boxes on the pages below</span>
        <label class="check"><input type="checkbox" checked={flatten} onChange={(e) => { setFlatten((e.target as HTMLInputElement).checked); setOut(null); }} /> Lock the answers (flatten, can't be changed later)</label>
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {out ? (
        <div class="done">
          <p class="big">Done! Your filled form is ready ({formatBytes(out.size)}).</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out, `${baseName(file.name)}-filled.pdf`)}>Download PDF</button>
            <button type="button" class="btn btn-ghost" onClick={() => setOut(null)}>Keep editing</button>
          </div>
        </div>
      ) : widgets.length > 0 && !busy && <div class="actions"><button type="button" class="btn btn-primary btn-lg" onClick={save}>Save filled PDF</button></div>}
      <div class="rpages">
        {pages.map((p, i) => (
          <figure key={i} class="rpage">
            <div class="rpage-in ff" style={{ aspectRatio: `${p.w} / ${p.h}`, containerType: 'inline-size' } as any}>
              <img src={p.url} alt={`Page ${i + 1}`} draggable={false} />
              {widgets.filter((w) => w.page === i).map((w) => {
                const st: any = { left: (w.x / p.w) * 100 + '%', top: (w.y / p.h) * 100 + '%', width: (w.w / p.w) * 100 + '%', height: (w.h / p.h) * 100 + '%', fontSize: `min(${(Math.min(w.h * 0.62, 14) / p.w) * 100}cqw, 22px)` };
                const v = values[w.field];
                if (w.kind === 'text') return <input class="ffw" style={st} type="text" title={w.field} aria-label={w.field} value={String(v ?? '')} maxLength={w.maxLen} disabled={w.readOnly} onInput={(e) => set(w.field, (e.target as HTMLInputElement).value)} />;
                if (w.kind === 'multiline') return <textarea class="ffw" style={st} title={w.field} aria-label={w.field} value={String(v ?? '')} disabled={w.readOnly} onInput={(e) => set(w.field, (e.target as HTMLTextAreaElement).value)} />;
                if (w.kind === 'check') return <label class="ffw ffc" style={st} title={w.field}><input type="checkbox" aria-label={w.field} checked={!!v} disabled={w.readOnly} onChange={(e) => set(w.field, (e.target as HTMLInputElement).checked)} /></label>;
                if (w.kind === 'radio') return <label class="ffw ffc" style={st} title={`${w.field}: ${w.option}`}><input type="radio" name={'r-' + w.field} aria-label={`${w.field}: ${w.option}`} checked={v === w.option} disabled={w.readOnly} onChange={() => set(w.field, w.option!)} /></label>;
                return <select class="ffw" style={st} title={w.field} aria-label={w.field} value={String(v ?? '')} disabled={w.readOnly} onChange={(e) => set(w.field, (e.target as HTMLSelectElement).value)}><option value="">—</option>{w.options!.map((o) => <option value={o}>{o}</option>)}</select>;
              })}
            </div>
            <figcaption>Page {i + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
