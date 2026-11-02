import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ErrorBox } from './shared';
import { friendlyError, downloadBlob } from '../../lib/utils';
import { loadPdfjs, viewRect } from '../../lib/pdfjs';

type Hit = { page: number; rect: [number, number, number, number] }; // page index, rect in PDF points (top-left)

export default function PdfReader() {
  const [file, setFile] = useState<File | null>(null);
  const [num, setNum] = useState(0);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [zoom, setZoom] = useState(1);        // 1 = fit width
  const [rot, setRot] = useState(0);
  const [cur, setCur] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [hi, setHi] = useState(-1);
  const [error, setError] = useState('');
  const [baseW, setBaseW] = useState(800);
  const docRef = useRef<any>(null);
  const pdfjsRef = useRef<any>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const rendered = useRef(new Map<number, string>()); // page → render key
  const textCache = useRef(new Map<number, any>());

  const pick = async (files: File[]) => {
    const f = files.find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f) { setError('Please choose a PDF file.'); return; }
    setError('');
    try {
      const pdfjs = await loadPdfjs(); pdfjsRef.current = pdfjs;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      docRef.current?.destroy?.(); docRef.current = doc; rendered.current.clear(); textCache.current.clear();
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      setSizes(Array.from({ length: doc.numPages }, () => ({ w: first.width, h: first.height })));
      setNum(doc.numPages); setCur(1); setPageInput('1'); setZoom(1); setRot(0); setHits([]); setHi(-1); setFile(f);
      // read the real size of every page in the background (mixed page sizes)
      (async () => { const s: { w: number; h: number }[] = []; for (let i = 1; i <= doc.numPages; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); s.push({ w: v.width, h: v.height }); } if (docRef.current === doc) setSizes(s); })();
    } catch (e) { setError(friendlyError(e)); }
  };

  // fit-width base size
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setBaseW(Math.max(200, el.clientWidth - 40)));
    ro.observe(el); return () => ro.disconnect();
  }, [file]);

  const pageCss = (i: number) => {
    const s = sizes[i]; if (!s) return { w: baseW, h: baseW * 1.414 };
    const [pw, ph] = rot % 180 ? [s.h, s.w] : [s.w, s.h];
    const fitW = Math.min(baseW, 1100) * zoom;
    return { w: fitW, h: fitW * ph / pw };
  };

  const renderPage = async (i: number, holder: HTMLElement) => {
    const doc = docRef.current; if (!doc) return;
    const { w } = pageCss(i); const key = `${w}|${rot}`;
    if (rendered.current.get(i) === key) return;
    rendered.current.set(i, key);
    const pg = await doc.getPage(i + 1);
    const v1 = pg.getViewport({ scale: 1, rotation: (pg.rotate + rot) % 360 });
    const scale = w / v1.width; const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const vp = pg.getViewport({ scale, rotation: (pg.rotate + rot) % 360 });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
    c.style.width = '100%'; c.style.height = '100%';
    await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
    if (rendered.current.get(i) !== key) return;
    holder.querySelector('canvas')?.remove(); holder.querySelector('.textLayer')?.remove();
    holder.prepend(c);
    try { // selectable text
      const tl = document.createElement('div'); tl.className = 'textLayer';
      tl.style.setProperty('--scale-factor', String(scale)); tl.style.setProperty('--total-scale-factor', String(scale));
      holder.appendChild(tl);
      const layer = new pdfjsRef.current.TextLayer({ textContentSource: pg.streamTextContent(), container: tl, viewport: vp });
      await layer.render();
    } catch { /* text layer is optional */ }
  };

  // lazy render visible pages
  useEffect(() => {
    const root = scroller.current; if (!root || !num) return;
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) renderPage(+(e.target as HTMLElement).dataset.i!, e.target as HTMLElement); }), { root, rootMargin: '600px 0px' });
    root.querySelectorAll<HTMLElement>('.rd-page').forEach((el) => io.observe(el));
    const onScroll = () => {
      const mid = root.scrollTop + root.clientHeight / 3; let k = 1;
      root.querySelectorAll<HTMLElement>('.rd-page').forEach((el, i) => { if (el.offsetTop <= mid) k = i + 1; });
      setCur(k); setPageInput(String(k));
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); root.removeEventListener('scroll', onScroll); };
  }, [num, zoom, rot, baseW, sizes]);

  const go = (p: number) => { const root = scroller.current; const el = root?.querySelectorAll<HTMLElement>('.rd-page')[p - 1]; if (root && el) root.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' }); };

  const search = async () => {
    const doc = docRef.current; const term = q.trim().toLowerCase(); if (!doc || !term) { setHits([]); return; }
    const found: Hit[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      let tc = textCache.current.get(i);
      const pg = await doc.getPage(i);
      if (!tc) { tc = await pg.getTextContent(); textCache.current.set(i, tc); }
      const vp = pg.getViewport({ scale: 1, rotation: 0 });
      for (const it of tc.items as any[]) {
        const s = (it.str || '').toLowerCase(); let k = s.indexOf(term);
        while (k >= 0) {
          const [, b, , d, e, f] = it.transform; const fh = Math.hypot(b, d) || 10; const per = it.width / Math.max(1, s.length);
          const r = viewRect(vp, [e + per * k, f - fh * 0.2, e + per * (k + term.length), f + fh * 0.9]);
          found.push({ page: i - 1, rect: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])] });
          k = s.indexOf(term, k + term.length);
        }
      }
    }
    setHits(found); setHi(found.length ? 0 : -1); if (found.length) go(found[0].page + 1);
  };
  const step = (d: number) => { if (!hits.length) return; const n = (hi + d + hits.length) % hits.length; setHi(n); go(hits[n].page + 1); };

  const fullscreen = () => { const el = shell.current; if (!el) return; document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => {}); };
  const print = () => {
    if (!file) return; const url = URL.createObjectURL(file);
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; fr.src = url;
    fr.onload = () => { try { fr.contentWindow?.focus(); fr.contentWindow?.print(); } catch { window.open(url); } };
    document.body.appendChild(fr); setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 60000);
  };

  if (!file) return <>
    <DropZone accept="application/pdf,.pdf" label="Open PDF file" hint="or drop a PDF here to read it" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;

  return (
    <div ref={shell} class="rd-shell">
      <div class="rd-bar" role="toolbar" aria-label="Reader controls">
        <div class="rd-grp">
          <button type="button" class="rd-b" aria-label="Previous page" disabled={cur <= 1} onClick={() => go(cur - 1)}>‹</button>
          <input class="rd-num" aria-label="Page number" value={pageInput} onInput={(e) => setPageInput((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { const p = Math.max(1, Math.min(num, +pageInput || 1)); go(p); } }} />
          <span class="rd-of">/ {num}</span>
          <button type="button" class="rd-b" aria-label="Next page" disabled={cur >= num} onClick={() => go(cur + 1)}>›</button>
        </div>
        <div class="rd-grp">
          <button type="button" class="rd-b" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}>−</button>
          <button type="button" class="rd-b rd-w" title="Fit to width" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" class="rd-b" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)))}>+</button>
          <button type="button" class="rd-b" aria-label="Rotate" title="Rotate" onClick={() => setRot((r) => (r + 90) % 360)}>⟳</button>
        </div>
        <div class="rd-grp rd-search">
          <input type="search" aria-label="Search in PDF" placeholder="Search…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && (hits.length && q ? step(1) : search())} />
          <button type="button" class="rd-b rd-w" onClick={search}>Find</button>
          {hits.length > 0 && <><span class="rd-of">{hi + 1}/{hits.length}</span><button type="button" class="rd-b" aria-label="Previous result" onClick={() => step(-1)}>↑</button><button type="button" class="rd-b" aria-label="Next result" onClick={() => step(1)}>↓</button></>}
          {q && hits.length === 0 && textCache.current.size > 0 && <span class="rd-of">0 results</span>}
        </div>
        <div class="rd-grp">
          <button type="button" class="rd-b" aria-label="Full screen" title="Full screen" onClick={fullscreen}>⛶</button>
          <button type="button" class="rd-b" aria-label="Print" title="Print" onClick={print}>🖶</button>
          <button type="button" class="rd-b" aria-label="Download" title="Download" onClick={() => downloadBlob(file, file.name)}>⤓</button>
          <button type="button" class="rd-b rd-w" onClick={() => { setFile(null); setNum(0); }}>Open another</button>
        </div>
      </div>
      <div ref={scroller} class="rd-scroll">
        {Array.from({ length: num }, (_, i) => {
          const { w, h } = pageCss(i); const s = sizes[i] ?? { w: 1, h: 1 };
          const [pw, ph] = rot % 180 ? [s.h, s.w] : [s.w, s.h];
          return (
            <div key={i + '-' + rot} class="rd-page" data-i={i} style={{ width: w + 'px', height: h + 'px' }}>
              {rot === 0 && hits.map((hh, k) => hh.page === i && <div class={'rd-hit' + (k === hi ? ' on' : '')} style={{ left: (hh.rect[0] / pw) * 100 + '%', top: (hh.rect[1] / ph) * 100 + '%', width: (hh.rect[2] / pw) * 100 + '%', height: (hh.rect[3] / ph) * 100 + '%' }} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
