import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { DropZone, ProgressBar, ErrorBox } from './shared';
import { formatBytes, downloadBlob, uid, zipFiles, friendlyError } from '../../lib/utils';
import { isImage, IMAGE_ACCEPT } from '../../lib/imageOps';
import type { Progress } from '../../lib/pdfJob';

export type Item = { id: string; file: File; url: string; out?: Blob; outName?: string; info?: string; err?: string };

interface Props {
  actionLabel: string; // e.g. "Resize"
  zipName: string;
  options: ComponentChildren;
  /** Shown above the list when there are items (e.g. a preview). */
  preview?: (items: Item[]) => ComponentChildren;
  process: (file: File) => Promise<{ blob: Blob; name: string; info?: string }>;
  /** Change this value whenever options change, so old results are cleared. */
  optionsKey: string;
  /** Maximum images per conversion (optional). */
  max?: number;
  accept?: string;
  hint?: string;
}

export default function ImageBatch({ actionLabel, zipName, options, preview, process, optionsKey, max, accept = IMAGE_ACCEPT, hint }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { setDone(false); setItems((cur) => cur.map((i) => ({ ...i, out: undefined, info: undefined, err: undefined }))); }, [optionsKey]);
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = (files: File[]) => {
    let imgs = files.filter(isImage);
    let msg = imgs.length < files.length ? 'Some files were skipped because they are not images.' : '';
    if (max && items.length + imgs.length > max) {
      imgs = imgs.slice(0, Math.max(0, max - items.length));
      msg = `You can convert up to ${max} images at a time. The first ${max} were added, convert them, then click "Start over" for the next ones.`;
    }
    setError(msg);
    setDone(false);
    setItems((cur) => [...cur.map((i) => ({ ...i, out: undefined, err: undefined })), ...imgs.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))]);
  };

  const run = async () => {
    setError(''); setDone(false);
    const next: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      setBusy({ done: i, total: items.length, label: `${actionLabel.replace(/e?$/, 'ing')} ${i + 1} of ${items.length}` });
      try {
        const r = await process(items[i].file);
        next.push({ ...items[i], out: r.blob, outName: r.name, info: r.info, err: undefined });
      } catch (e) {
        next.push({ ...items[i], err: friendlyError(e).replace('Something went wrong: ', '') });
      }
    }
    setItems(next); setBusy(null); setDone(true);
  };

  const downloadAll = async () => {
    const ok = items.filter((i) => i.out);
    if (ok.length === 1) return downloadBlob(ok[0].out!, ok[0].outName!);
    setBusy({ done: 0, total: 0, label: 'Creating ZIP…' });
    try { downloadBlob(await zipFiles(ok.map((i) => ({ name: i.outName!, blob: i.out! }))), zipName); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  if (!items.length)
    return <>
      <DropZone accept={accept} multiple label="Choose images" hint={hint ?? 'JPG, PNG, WebP, GIF…, or drop them here'} onFiles={add} />
      {error && <ErrorBox>{error}</ErrorBox>}
    </>;

  const okCount = items.filter((i) => i.out).length;
  return (
    <div>
      <div class="opts">{options}</div>
      {preview?.(items)}
      <ul class="files" aria-label="Images">
        {items.map((it, k) => (
          <li key={it.id}>
            <img class="thumb" src={it.url} alt="" loading="lazy" />
            <span class="fname" title={it.file.name}>{it.file.name}</span>
            <span class="meta">
              {formatBytes(it.file.size)}
              {it.out && <> → <b>{formatBytes(it.out.size)}</b>{it.info && <> · {it.info}</>}</>}
              {it.err && <span style={{ color: 'var(--err)' }}> {it.err}</span>}
            </span>
            {it.out
              ? <button type="button" class="dl-file" aria-label={'Download ' + it.outName} onClick={() => downloadBlob(it.out!, it.outName!)}>Download</button>
              : <button type="button" class="mini" aria-label="Remove" disabled={!!busy} onClick={() => { URL.revokeObjectURL(it.url); setItems(items.filter((_, j) => j !== k)); }}>✕</button>}
          </li>
        ))}
      </ul>
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && <ProgressBar {...busy} />}
      {done && !busy && okCount > 0 ? (
        <div class="done">
          <p class="big">Done! {okCount} image{okCount > 1 ? 's' : ''} ready.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary dl btn-lg" onClick={downloadAll}>{okCount > 1 ? 'Download all (ZIP)' : 'Download image'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]); setDone(false); }}>Start over</button>
          </div>
        </div>
      ) : (
        <div class="actions">
          {(!max || items.length < max) && <DropZone compact accept={accept} multiple label="Add more images" onFiles={add} />}
          <button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={run}>{actionLabel} {items.length > 1 ? `${items.length} images` : 'image'}</button>
        </div>
      )}
    </div>
  );
}
