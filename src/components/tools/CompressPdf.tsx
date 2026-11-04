import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox, sizeWarning } from './shared';
import { formatBytes, downloadBlob, friendlyError, baseName } from '../../lib/utils';
import { runPdfJob, type Progress } from '../../lib/pdfJob';
import { loadPdfjs } from '../../lib/pdfjs';

type Lv = 'low' | 'recommended' | 'extreme' | 'custom';
type Set = { dpi: number; q: number; meta: boolean; icc: number };
const SETS: Record<Exclude<Lv, 'custom'>, Set> = {
  low: { dpi: 220, q: 0.82, meta: false, icc: 200_000 },
  recommended: { dpi: 150, q: 0.72, meta: true, icc: 60_000 },
  extreme: { dpi: 96, q: 0.55, meta: true, icc: 20_000 },
};
const INFO: Record<Lv, [string, string]> = {
  low: ['Light', 'Best quality · 220 DPI'],
  recommended: ['Recommended', 'Good quality · 150 DPI'],
  extreme: ['Strong', 'Smallest file · 96 DPI'],
  custom: ['Custom', 'Choose resolution and quality'],
};
type Out = { blob: Blob; changed: number };
type Entry = { id: number; file: File; status: 'wait' | 'busy' | 'done' | 'error'; err?: string; res: Partial<Record<Lv, Out>>; customKey?: string; images?: number };
const MAX_FILES = 20;
let nextId = 1;

async function optimise(bytes: Uint8Array): Promise<Uint8Array> {
  try { const r = await runPdfJob<{ files: Uint8Array[] }>({ op: 'optimize', file: bytes.slice().buffer }, [], undefined, 'qpdf'); return r.files[0].length < bytes.length ? r.files[0] : bytes; }
  catch { return bytes; }
}
/** Compress one file with several settings; never return something bigger than the original. */
async function compressFile(file: File, sets: Set[], onP: (p: Progress) => void): Promise<{ outs: Out[]; images: number }> {
  let buf = await file.arrayBuffer();
  const job = (b: ArrayBuffer) => runPdfJob<{ files: Uint8Array[]; stats: { images: number; changed: number[] } }>({ op: 'compress', file: b.slice(0), sets }, [], onP);
  let r;
  try { r = await job(buf); }
  catch (e: any) {
    // PDFs locked only against editing (they open without a password): remove the lock and try again
    if (!/encrypt|password/i.test(String(e?.message))) throw e;
    onP({ done: 0, total: 0, label: 'Removing edit lock…' });
    const d = await runPdfJob<{ files: Uint8Array[] }>({ op: 'decrypt', file: buf.slice(0), password: '' }, [], undefined, 'qpdf');
    buf = d.files[0].slice().buffer; r = await job(buf);
  }
  const outs: Out[] = [];
  for (let i = 0; i < r.files.length; i++) {
    onP({ done: i, total: r.files.length, label: 'Final optimisation…' });
    const best = await optimise(r.files[i]);
    const smaller = best.length < file.size;
    outs.push({ blob: smaller ? new Blob([best as BlobPart], { type: 'application/pdf' }) : file, changed: smaller ? r.stats.changed[i] : 0 });
  }
  return { outs, images: r.stats.images };
}
const pct = (a: number, b: number) => Math.max(0, Math.min(99, Math.round((1 - b / a) * 100)));
const keyOf = (s: Set) => `${s.dpi}|${s.q}|${s.meta}`;

export default function CompressPdf() {
  const [list, setList] = useState<Entry[]>([]);
  const [sel, setSel] = useState(0);
  const [level, setLevel] = useState<Lv>('recommended');
  const [custom, setCustom] = useState<Set>({ dpi: 120, q: 0.65, meta: true, icc: 60_000 });
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [zipping, setZipping] = useState(false);
  const listRef = useRef(list); listRef.current = list;
  const working = useRef(false);

  const update = (id: number, f: (e: Entry) => Entry) => setList((l) => l.map((e) => (e.id === id ? f(e) : e)));

  const pick = (files: File[]) => {
    const pdfs = files.filter((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!pdfs.length) { setError('Please choose PDF files.'); return; }
    setError('');
    setList((l) => [...l, ...pdfs.slice(0, Math.max(0, MAX_FILES - l.length)).map((file) => ({ id: nextId++, file, status: 'wait' as const, res: {} }))]);
    if (listRef.current.length + pdfs.length > MAX_FILES) setError(`Up to ${MAX_FILES} files at a time.`);
  };

  // work queue: every new file gets all three levels right away
  useEffect(() => {
    if (working.current) return;
    const next = list.find((e) => e.status === 'wait');
    if (!next) return;
    working.current = true;
    update(next.id, (e) => ({ ...e, status: 'busy' }));
    (async () => {
      try {
        const { outs, images } = await compressFile(next.file, [SETS.low, SETS.recommended, SETS.extreme], setBusy);
        update(next.id, (e) => ({ ...e, status: 'done', images, res: { ...e.res, low: outs[0], recommended: outs[1], extreme: outs[2] } }));
      } catch (er) { update(next.id, (e) => ({ ...e, status: 'error', err: friendlyError(er) })); }
      finally { setBusy(null); working.current = false; setList((l) => [...l]); }
    })();
  }, [list]);

  // custom settings: recalculate the selected file shortly after the sliders stop moving
  const cur = list[Math.min(sel, list.length - 1)];
  useEffect(() => {
    if (level !== 'custom' || !cur || cur.status !== 'done' || cur.customKey === keyOf(custom) || working.current) return;
    const t = setTimeout(async () => {
      if (working.current) return;
      working.current = true;
      const want = keyOf(custom);
      try {
        const { outs } = await compressFile(cur.file, [custom], setBusy);
        update(cur.id, (e) => ({ ...e, customKey: want, res: { ...e.res, custom: outs[0] } }));
      } catch (er) { setError(friendlyError(er)); }
      finally { setBusy(null); working.current = false; setList((l) => [...l]); }
    }, 500);
    return () => clearTimeout(t);
  }, [level, custom, cur?.id, cur?.status, cur?.customKey, busy === null]);

  const downloadAll = async () => {
    // custom level: make sure every file has it
    setZipping(true);
    try {
      const want = keyOf(custom);
      const ready: Entry[] = [];
      for (const e of listRef.current) {
        if (e.status !== 'done') continue;
        if (level === 'custom' && e.customKey !== want) {
          working.current = true;
          const { outs } = await compressFile(e.file, [custom], setBusy);
          working.current = false; setBusy(null);
          const ne = { ...e, customKey: want, res: { ...e.res, custom: outs[0] } }; update(e.id, () => ne); ready.push(ne);
        } else ready.push(e);
      }
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {}; const used = new Set<string>();
      for (const e of ready) { const o = e.res[level]; if (!o) continue; let n = `${baseName(e.file.name)}-compressed.pdf`; let k = 2; while (used.has(n)) n = `${baseName(e.file.name)}-compressed-${k++}.pdf`; used.add(n); files[n] = new Uint8Array(await o.blob.arrayBuffer()); }
      downloadBlob(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), 'compressed-pdfs.zip');
    } catch (er) { setError(friendlyError(er)); }
    finally { setZipping(false); working.current = false; setBusy(null); }
  };

  if (!list.length) return <>
    <DropZone accept="application/pdf,.pdf" multiple label="Choose PDF files" hint="or drop PDFs here · up to 20 files" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  const out = cur?.res[level];
  const done = list.filter((e) => e.status === 'done');
  const totIn = done.reduce((a, e) => a + e.file.size, 0), totOut = done.reduce((a, e) => a + (e.res[level]?.blob.size ?? e.file.size), 0);
  const allDone = list.every((e) => e.status === 'done' || e.status === 'error');

  return (
    <div class="cmpz">
      {/* level cards with the real result size for the selected file */}
      <div role="radiogroup" aria-label="Compression level" class="cmp-levels">
        {(['low', 'recommended', 'extreme', 'custom'] as Lv[]).map((v) => {
          const r = cur?.res[v]; const wait = cur && (cur.status === 'busy' || cur.status === 'wait' || (v === 'custom' && level === 'custom' && cur.customKey !== keyOf(custom)));
          return (
            <button type="button" role="radio" aria-checked={level === v} class={`cmp-lv ${level === v ? 'on' : ''}`} onClick={() => setLevel(v)}>
              <span class="t">{INFO[v][0]}{v === 'recommended' && <em>Best choice</em>}</span>
              <span class="d">{INFO[v][1]}</span>
              <span class="r">{r && !(v === 'custom' && cur?.customKey !== keyOf(custom)) ? <><b>{formatBytes(r.blob.size)}</b>{pct(cur!.file.size, r.blob.size) > 0 ? <i>-{pct(cur!.file.size, r.blob.size)}%</i> : <i class="z">no change</i>}</> : wait ? <span class="shim" /> : v === 'custom' ? <span class="hint">Pick to set</span> : <span class="shim" />}</span>
            </button>
          );
        })}
      </div>

      {level === 'custom' && (
        <div class="opts cmp-custom" data-title="Custom settings">
          <label>Image resolution <b>{custom.dpi} DPI</b>
            <input type="range" min={50} max={300} step={10} value={custom.dpi} onInput={(e) => setCustom({ ...custom, dpi: +(e.target as HTMLInputElement).value })} />
            <small>72 screen · 150 e-book · 300 print</small></label>
          <label>Image quality <b>{Math.round(custom.q * 100)}%</b>
            <input type="range" min={20} max={95} step={5} value={Math.round(custom.q * 100)} onInput={(e) => setCustom({ ...custom, q: +(e.target as HTMLInputElement).value / 100 })} />
            <small>Lower = smaller file</small></label>
          <label class="chk"><input type="checkbox" checked={custom.meta} onChange={(e) => setCustom({ ...custom, meta: (e.target as HTMLInputElement).checked })} /> Remove hidden data (XMP metadata, editor data)</label>
        </div>
      )}

      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {sizeWarning(list.reduce((a, e) => a + e.file.size, 0)) && <ErrorBox>{sizeWarning(list.reduce((a, e) => a + e.file.size, 0))}</ErrorBox>}

      {/* selected file: size bars and before/after preview */}
      {cur && cur.status === 'error' && <ErrorBox>{cur.file.name}: {cur.err}</ErrorBox>}
      {cur && out && (
        <div class="cmp-sum">
          <div class="bars">
            <div><span>Original</span><div class="bar"><div style={{ width: '100%' }} /></div><b>{formatBytes(cur.file.size)}</b></div>
            <div><span>Compressed</span><div class="bar"><div class="new" style={{ width: `${Math.max(2, (out.blob.size / cur.file.size) * 100)}%` }} /></div><b>{formatBytes(out.blob.size)}</b></div>
          </div>
          <p class="status">{pct(cur.file.size, out.blob.size) > 0
            ? <>Saved <b>{formatBytes(cur.file.size - out.blob.size)}</b> ({pct(cur.file.size, out.blob.size)}% smaller). {out.changed} of {cur.images} images optimised; text and vector graphics are unchanged.</>
            : <>This PDF is already well optimised at this level. Try <b>Strong</b> or <b>Custom</b> for a smaller file.</>}</p>
        </div>
      )}
      {cur && cur.status === 'done' && out && <Compare key={cur.id + level + (cur.customKey ?? '')} original={cur.file} result={out.blob} />}

      {/* files */}
      {list.length > 1 && (
        <ul class="files cmp-files">
          {list.map((e, i) => {
            const o = e.res[level];
            return (
              <li class={i === sel ? 'cur' : ''} onClick={() => setSel(i)}>
                <span class="fname" title={e.file.name}>{e.file.name}</span>
                <span class="meta">{formatBytes(e.file.size)}{o ? <> → <b>{formatBytes(o.blob.size)}</b> {pct(e.file.size, o.blob.size) > 0 && <i class="saving">-{pct(e.file.size, o.blob.size)}%</i>}</> : e.status === 'error' ? ' · failed' : e.status === 'busy' ? ' · working…' : level === 'custom' && e.status === 'done' ? '' : ' · waiting'}</span>
                {o && pct(e.file.size, o.blob.size) > 0 && <button type="button" class="dl-file" aria-label={`Download ${e.file.name}`} onClick={(ev) => { ev.stopPropagation(); downloadBlob(o.blob, `${baseName(e.file.name)}-compressed.pdf`); }} />}
                <button type="button" class="mini" aria-label="Remove file" disabled={e.status === 'busy'} onClick={(ev) => { ev.stopPropagation(); setList((l) => l.filter((x) => x.id !== e.id)); setSel(0); }}>✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <div class="actions">
        {list.length === 1 && out && pct(cur!.file.size, out.blob.size) > 0 && <button type="button" class="btn btn-primary dl btn-lg" onClick={() => downloadBlob(out.blob, `${baseName(cur!.file.name)}-compressed.pdf`)}>Download PDF</button>}
        {list.length > 1 && <button type="button" class="btn btn-primary dl btn-lg" disabled={!allDone || zipping || !done.length} onClick={downloadAll}>{zipping ? 'Preparing ZIP…' : `Download all (ZIP)${done.length ? ` · ${formatBytes(totOut)}` : ''}`}</button>}
        <DropZone compact accept="application/pdf,.pdf" multiple label="Add files" onFiles={pick} />
        <button type="button" class="btn btn-ghost" disabled={!!busy} onClick={() => { setList([]); setSel(0); setError(''); }}>Start over</button>
      </div>
      {list.length > 1 && done.length > 1 && totOut < totIn && <p class="status">All files: {formatBytes(totIn)} → {formatBytes(totOut)} ({pct(totIn, totOut)}% smaller)</p>}
    </div>
  );
}

/** Before / after view: drag the line to compare, zoom in to check small text and photos. */
function Compare({ original, result }: { original: Blob; result: Blob }) {
  const box = useRef<HTMLDivElement>(null);
  const cA = useRef<HTMLCanvasElement>(null), cB = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1); const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1); const [split, setSplit] = useState(50);
  const [rendering, setRendering] = useState(true);
  const [boxH, setBoxH] = useState(560);
  const docs = useRef<{ a?: any; b?: any }>({});
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const pdfjs = await loadPdfjs();
      const a = await pdfjs.getDocument({ data: new Uint8Array(await original.arrayBuffer()), isEvalSupported: false }).promise;
      const b = original === result ? a : await pdfjs.getDocument({ data: new Uint8Array(await result.arrayBuffer()), isEvalSupported: false }).promise;
      if (dead) return;
      docs.current = { a, b }; setPages(a.numPages); setPage(1); setRendering(true);
      draw(1, zoom);
    })().catch(() => setRendering(false));
    return () => { dead = true; };
  }, [original, result]);

  const draw = async (pg: number, z: number) => {
    const { a, b } = docs.current; if (!a || !b || !box.current) return;
    setRendering(true);
    const w = box.current.clientWidth;
    for (const [doc, cv] of [[a, cA.current], [b, cB.current]] as const) {
      if (!cv) continue;
      const p = await doc.getPage(pg); const vp1 = p.getViewport({ scale: 1 });
      const maxH = Math.min(window.innerHeight * 0.72, 680); const hb = Math.min(maxH, (w / vp1.width) * vp1.height + 16);
      if (cv === cA.current) setBoxH(hb);
      const fit = Math.min(w / vp1.width, (hb - 16) / vp1.height); const css = fit * z; const scale = Math.min(css * Math.min(2, devicePixelRatio || 1), 6000 / vp1.width);
      const vp = p.getViewport({ scale });
      const off = document.createElement('canvas'); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      await p.render({ canvasContext: off.getContext('2d')!, viewport: vp }).promise;
      cv.width = off.width; cv.height = off.height; cv.getContext('2d')!.drawImage(off, 0, 0);
      cv.style.width = `${vp1.width * css}px`; cv.style.height = `${vp1.height * css}px`;
    }
    setRendering(false);
    // zoom into the middle of the page
    const bx = box.current; if (bx) { bx.scrollLeft = (bx.scrollWidth - bx.clientWidth) / 2; bx.scrollTop = (bx.scrollHeight - bx.clientHeight) / 2; setSplit((x) => x + 0); }
  };
  useEffect(() => { draw(page, zoom); }, [page, zoom]);

  const moveSplit = (clientX: number) => { const r = box.current!.getBoundingClientRect(); setSplit(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))); };
  const sl = box.current?.scrollLeft ?? 0, vw = box.current?.clientWidth ?? 1;
  const clipX = sl + (split / 100) * vw;
  return (
    <div class="cmp-view">
      <div class="cmp-bar">
        <span><b>Before</b> ◂ drag ▸ <b>After</b></span>
        <span class="zm">{[1, 2, 4].map((z) => <button type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>{z === 1 ? 'Fit' : `${z}×`}</button>)}</span>
        {pages > 1 && <span class="pg"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>Page {page} of {pages}<button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></span>}
      </div>
      <div class="cmp-wrap">
        <div class="cmp-box" ref={box} style={{ cursor: zoom > 1 ? 'grab' : 'default', height: `${boxH}px` }}
          onScroll={() => setSplit((s) => s + 0)}
          onPointerDown={(e) => { if (zoom > 1 && !(e.target as HTMLElement).closest('.cmp-h')) { drag.current = { x: e.clientX, y: e.clientY, sl: box.current!.scrollLeft, st: box.current!.scrollTop }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } }}
          onPointerMove={(e) => { if (drag.current) { box.current!.scrollLeft = drag.current.sl - (e.clientX - drag.current.x); box.current!.scrollTop = drag.current.st - (e.clientY - drag.current.y); } }}
          onPointerUp={() => { drag.current = null; }}>
          <div class="cmp-stack">
            <canvas ref={cB} />
            <canvas ref={cA} class="a" style={{ clipPath: `inset(0 calc(100% - ${clipX}px) 0 0)` }} />
            <div class="cmp-h" style={{ left: `${clipX}px` }}
              onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) moveSplit(e.clientX); }}
              role="slider" aria-label="Compare before and after" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - 5)); if (e.key === 'ArrowRight') setSplit((s) => Math.min(100, s + 5)); }}>
              <span style={{ top: `${(box.current?.scrollTop ?? 0) + (box.current?.clientHeight ?? 400) / 2 - 19}px` }}>⟷</span>
            </div>
          </div>
        </div>
        <span class="cmp-tag l">Before</span><span class="cmp-tag r">After</span>
        {rendering && <div class="cmp-load"><span class="spin" /></div>}
      </div>
    </div>
  );
}
