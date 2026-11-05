import { unzlibSync, inflateSync } from 'fflate';

/**
 * Rebuild the page index (cross-reference table) of a damaged PDF by scanning the file for objects,
 * the way desktop repair tools do. The original bytes are kept; fixed objects and a fresh index are appended.
 * Handles: broken or missing xref, missing startxref/trailer, cut-off files, wrong stream lengths,
 * and objects stored inside object streams.
 */
export function rebuildXref(bytes: Uint8Array): { bytes: Uint8Array; notes: string[] } | null {
  const s = latin1(bytes);
  const notes = new Set<string>();
  type Obj = { num: number; gen: number; start: number; end: number; body: string };
  const objs = new Map<number, Obj>();
  const re = /(\d{1,7})[ \t\r\n\f\0]+(\d{1,5})[ \t\r\n\f\0]+obj\b/g;
  const starts: { num: number; gen: number; at: number; after: number }[] = [];
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    const at = m.index;
    if (at > 0 && /\d/.test(s[at - 1])) continue;
    starts.push({ num: +m[1], gen: +m[2], at, after: at + m[0].length });
  }
  if (!starts.length) return null;
  const appended: string[] = [];
  let cut = 0, lenFix = 0;
  for (let k = 0; k < starts.length; k++) {
    const st = starts[k]; const limit = k + 1 < starts.length ? starts[k + 1].at : s.length;
    let seg = s.slice(st.after, limit);
    const e = seg.lastIndexOf('endobj');
    const sm = /\bstream(\r\n|\n|\r)/.exec(seg);
    if (sm) {
      // stream: find the real end of the data, whatever /Length says
      const dataStart = sm.index + sm[0].length;
      let es = seg.indexOf('endstream', dataStart);
      if (es < 0) { cut++; continue; } // data cut off: drop the object
      let dataEnd = es; if (seg[dataEnd - 1] === '\n') dataEnd--; if (seg[dataEnd - 1] === '\r') dataEnd--;
      const dict = seg.slice(0, sm.index);
      const lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
      const real = dataEnd - dataStart;
      if (!lm || lm[2] || +lm[1] !== real) {
        // write a corrected copy at the end of the file
        const fixed = lm ? dict.replace(lm[0], `/Length ${real}`) : dict.replace(/>>\s*$/, `/Length ${real}>>`);
        objs.set(st.num, { num: st.num, gen: st.gen, start: -1, end: -1, body: `${fixed}stream\n${seg.slice(dataStart, dataEnd)}\nendstream` });
        if (lm && !lm[2]) lenFix++;
        continue;
      }
      if (e < 0 || e < es) seg = seg.slice(0, es + 9) + '\nendobj';
      objs.set(st.num, { num: st.num, gen: st.gen, start: st.at, end: limit, body: '' });
      if (e < 0) { objs.get(st.num)!.start = -1; objs.get(st.num)!.body = seg.slice(0, es + 9); }
      continue;
    }
    if (e < 0) {
      // no endobj: keep it only if it is a complete small value (a dictionary, number, array)
      const v = seg.replace(/\b(xref|trailer|startxref)\b[\s\S]*$/, '').trim();
      if (!v || !balanced(v)) { cut++; continue; }
      objs.set(st.num, { num: st.num, gen: st.gen, start: -1, end: -1, body: v });
      continue;
    }
    objs.set(st.num, { num: st.num, gen: st.gen, start: st.at, end: limit, body: '' });
  }
  if (cut) notes.add('Recovered a cut-off (truncated) file');
  if (lenFix) notes.add('Fixed wrong data lengths');

  // objects packed inside object streams
  for (const st of starts) {
    const o = objs.get(st.num); const raw = o && o.start === st.at ? s.slice(st.after, o.end) : o && o.start < 0 && o.body;
    if (!raw || !/\/Type\s*\/ObjStm/.test(raw.slice(0, 2000))) continue;
    try {
      const sm = /\bstream(\r\n|\n|\r)/.exec(raw)!; const dict = raw.slice(0, sm.index);
      const n = +(/\/N\s+(\d+)/.exec(dict)![1]); const first = +(/\/First\s+(\d+)/.exec(dict)![1]);
      const lm = /\/Length\s+(\d+)/.exec(dict); const ds = sm.index + sm[0].length;
      let end = raw.indexOf('endstream', ds); if (lm && !/\/Length\s+\d+\s+\d+\s+R/.test(dict)) end = Math.min(end, ds + +lm[1]);
      let data = bytesOf(raw.slice(ds, end));
      if (/\/FlateDecode/.test(dict)) { try { data = unzlibSync(data); } catch { data = inflateSync(data.subarray(2)); } }
      else if (/\/Filter/.test(dict)) continue;
      const t = latin1(data); const head = t.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < n; k++) {
        const num = head[2 * k], off = head[2 * k + 1]; if (objs.has(num) && objs.get(num)!.start >= 0) continue;
        const next = k + 1 < n ? head[2 * k + 3] : t.length - first;
        objs.set(num, { num, gen: 0, start: -1, end: -1, body: t.slice(first + off, first + next).trim() });
      }
    } catch { /* unreadable (for example encrypted) object stream */ }
  }
  // drop the object streams and old xref streams themselves: their contents are now plain objects
  for (const [num, o] of [...objs]) {
    const head = o.start >= 0 ? s.slice(o.start, Math.min(o.end, o.start + 600)) : o.body.slice(0, 600);
    if (/\/Type\s*\/(ObjStm|XRef)\b/.test(head)) objs.delete(num);
  }

  // trailer: Root, Info, Encrypt and ID from the last readable trailer, else search for the catalog
  const trailers = [...s.matchAll(/trailer\s*<<([\s\S]*?)>>\s*(startxref|$)/g)].map((m) => m[1]);
  const xrefDicts = starts.map((st) => s.slice(st.after, st.after + 1500)).filter((d) => /\/Type\s*\/XRef/.test(d));
  const all = [...xrefDicts, ...trailers];
  const pick = (key: string) => { for (let k = all.length - 1; k >= 0; k--) { const m = new RegExp(`/${key}\\s*(\\d+\\s+\\d+\\s+R|<[^>]*>|\\[[^\\]]*\\])`).exec(all[k]); if (m) return m[1]; } return ''; };
  let root = pick('Root');
  if (!root || !objs.has(+root.split(/\s+/)[0])) {
    root = '';
    for (const [num, o] of objs) { const b = o.start >= 0 ? s.slice(o.start, Math.min(o.end, o.start + 3000)) : o.body; if (/\/Type\s*\/Catalog\b/.test(b)) root = `${num} ${o.gen} R`; }
    if (!root) {
      // the document catalog itself is lost (often at the end of a cut-off file): build a new one from the pages we can still find
      const pages: number[] = [];
      for (const [num, o] of [...objs].sort((a, b) => (a[1].start < 0 ? 1e12 : a[1].start) - (b[1].start < 0 ? 1e12 : b[1].start))) {
        const b = o.start >= 0 ? s.slice(o.start, Math.min(o.end, o.start + 4000)) : o.body.slice(0, 4000);
        if (/\/Type\s*\/Page\b(?!s)/.test(b) && !/\bstream(\r|\n)/.test(b.slice(0, b.indexOf('>>') + 2))) pages.push(num);
      }
      if (!pages.length) return null;
      const top = Math.max(...objs.keys()) + 1;
      objs.set(top, { num: top, gen: 0, start: -1, end: -1, body: `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((n) => `${n} ${objs.get(n)!.gen} R`).join(' ')}] >>` });
      objs.set(top + 1, { num: top + 1, gen: 0, start: -1, end: -1, body: `<< /Type /Catalog /Pages ${top} 0 R >>` });
      for (const n of pages) {
        const o = objs.get(n)!; const body = o.start >= 0 ? s.slice(starts.find((x) => x.at === o.start)!.after, s.lastIndexOf('endobj', o.end)) : o.body;
        objs.set(n, { ...o, start: -1, body: body.replace(/\/Parent\s+\d+\s+\d+\s+R/, `/Parent ${top} 0 R`).trim() });
      }
      root = `${top + 1} 0 R`; notes.add('Rebuilt the lost page list');
    }
    notes.add('Rebuilt the missing file trailer');
  }
  const info = pick('Info'), enc = pick('Encrypt'), id = pick('ID');

  // write: original bytes, then corrected objects, then a fresh index
  const parts: string[] = [];
  let pos = bytes.length + 1; const offsets = new Map<number, [number, number]>();
  for (const o of objs.values()) {
    if (o.start >= 0) { offsets.set(o.num, [o.start, o.gen]); continue; }
    const txt = `${o.num} ${o.gen} obj\n${o.body}\nendobj\n`;
    offsets.set(o.num, [pos, o.gen]); parts.push(txt); pos += txt.length;
  }
  const size = Math.max(...offsets.keys()) + 1;
  let x = `xref\n0 ${size}\n`;
  for (let k = 0; k < size; k++) { const v = offsets.get(k); x += v ? `${String(v[0]).padStart(10, '0')} ${String(v[1]).padStart(5, '0')} n\r\n` : `0000000000 ${k ? '00000' : '65535'} f\r\n`; }
  x += `trailer\n<< /Size ${size} /Root ${root}${info && objs.has(+info.split(/\s+/)[0]) ? ` /Info ${info}` : ''}${enc ? ` /Encrypt ${enc}` : ''}${id ? ` /ID ${id}` : ''} >>\nstartxref\n${pos}\n%%EOF\n`;
  const tail = bytesOf('\n' + parts.join('') + x);
  const out = new Uint8Array(bytes.length + tail.length); out.set(bytes); out.set(tail, bytes.length);
  notes.add('Rebuilt the damaged page index (cross-reference table)');
  return { bytes: out, notes: [...notes] };
}

function balanced(v: string) { let d = 0; for (const c of v.replace(/\([^)]*\)/g, '')) { if (c === '<' || c === '[') d++; else if (c === '>' || c === ']') d--; } return d === 0; }
function latin1(b: Uint8Array) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as any); return s; }
function bytesOf(s: string) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
