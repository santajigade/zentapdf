export function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'file';
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zip } = await import('fflate');
  const input: Record<string, [Uint8Array, { level: 0 }]> = {};
  const used = new Set<string>();
  for (const f of files) {
    let n = f.name, i = 2;
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, `-${i++}$1`);
    used.add(n);
    // Already-compressed formats (PDF/JPG/PNG/WebP): store without re-compressing (fast).
    input[n] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  return new Promise((resolve, reject) => {
    zip(input, (err, data) => (err ? reject(err) : resolve(new Blob([data as BlobPart], { type: 'application/zip' }))));
  });
}

export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message ?? e);
  if (/encrypt/i.test(msg)) return 'This PDF is password-protected. Please unlock it first, then try again.';
  if (/RangeError|memory|allocation|Array buffer/i.test(msg))
    return 'This file is too large for your device’s memory. Try fewer or smaller files, or use a computer.';
  if (/Invalid PDF|No PDF header|Failed to parse|InvalidPDF/i.test(msg))
    return 'This file does not look like a valid PDF. It may be damaged.';
  return 'Something went wrong: ' + msg;
}

/** Parse "1-3, 5, 8-10" into [[1,3],[5,5],[8,10]] (1-based, inclusive). */
export function parseRanges(text: string, pageCount: number): [number, number][] | string {
  const parts = text.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return 'Please type at least one page or range, e.g. 1-3, 5';
  const out: [number, number][] = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)\s*(?:[-–to]+\s*(\d+|end))?$/i);
    if (!m) return `"${p}" is not a valid page or range.`;
    const a = parseInt(m[1], 10);
    const b = m[2] ? (/end/i.test(m[2]) ? pageCount : parseInt(m[2], 10)) : a;
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) return `"${p}" is outside this PDF (it has ${pageCount} pages).`;
    out.push(a <= b ? [a, b] : [b, a]);
  }
  return out;
}

/** Read JPEG EXIF orientation (1-8). Returns 1 if none. */
export function jpegOrientation(buf: ArrayBuffer): number {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
      const t = off + 10;
      const le = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, le);
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > v.byteLength) break;
        if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le);
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00) break;
    off += 2 + size;
  }
  return 1;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
