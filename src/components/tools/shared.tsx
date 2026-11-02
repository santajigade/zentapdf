import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

const UploadIcon = () => (
  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

export function PrivateNote() {
  return (
    <div class="private-note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
      Your files stay on your device — nothing is uploaded.
    </div>
  );
}

interface DropProps {
  accept: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}

export function DropZone({ accept, multiple, label, hint, compact, onFiles }: DropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => input.current?.click();
  const handle = (list: FileList | null) => {
    if (!list || !list.length) return;
    onFiles(Array.from(list));
    if (input.current) input.current.value = '';
  };
  if (compact) {
    return (
      <>
        <button type="button" class="btn btn-ghost" onClick={pick}>+ {label}</button>
        <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => handle((e.target as HTMLInputElement).files)} />
      </>
    );
  }
  return (
    <div>
      <div
        class={'drop' + (over ? ' over' : '')}
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={pick}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer?.files ?? null); }}
      >
        <UploadIcon />
        <span class="btn btn-primary btn-lg">{label}</span>
        <p>{hint ?? 'or drop files here'}</p>
      </div>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => handle((e.target as HTMLInputElement).files)} />
    </div>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div role="status" aria-live="polite">
      <div class="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
      <p class="status">{label || 'Working…'} {total > 0 && `(${pct}%)`}</p>
    </div>
  );
}

export function ErrorBox({ children }: { children: ComponentChildren }) {
  return <div class="error" role="alert">{children}</div>;
}

export function MoveButtons({ i, n, move, remove }: { i: number; n: number; move: (from: number, to: number) => void; remove: (i: number) => void }) {
  return (
    <>
      <button type="button" class="mini" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
      <button type="button" class="mini" aria-label="Move down" disabled={i === n - 1} onClick={() => move(i, i + 1)}>↓</button>
      <button type="button" class="mini" aria-label="Remove" onClick={() => remove(i)}>✕</button>
    </>
  );
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

// Rough device memory guard: warn when total input is very large for phones.
export function sizeWarning(totalBytes: number): string | null {
  const mem = (navigator as any).deviceMemory as number | undefined; // GB, Chrome only
  const limit = mem && mem <= 4 ? 300 * 1024 * 1024 : 1024 * 1024 * 1024;
  return totalBytes > limit
    ? 'These files are very large for this device. If the page becomes slow or fails, try fewer files or use a computer.'
    : null;
}
