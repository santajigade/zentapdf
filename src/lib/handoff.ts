// Pass a file chosen on the home page to the tool page that opens next (kept in IndexedDB for 2 minutes).
const DB = 'zentapdf-handoff', STORE = 'f';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function putHandoff(files: File[]) {
  const d = await db(); await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put({ files, at: Date.now() }, 'x'); t.oncomplete = res; t.onerror = () => rej(t.error); }); d.close();
}
export async function takeHandoff(): Promise<File[] | null> {
  try {
    const d = await db();
    const v: any = await new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); const s = t.objectStore(STORE); const g = s.get('x'); g.onsuccess = () => { s.delete('x'); res(g.result); }; g.onerror = () => res(null); });
    d.close();
    return v && Date.now() - v.at < 120000 ? v.files : null;
  } catch { return null; }
}
/** Does a file fit an <input accept="..."> list? */
export function accepts(accept: string, f: File) {
  if (!accept) return true;
  const name = f.name.toLowerCase(), type = (f.type || '').toLowerCase();
  return accept.split(',').map((a) => a.trim().toLowerCase()).some((a) => a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a);
}
