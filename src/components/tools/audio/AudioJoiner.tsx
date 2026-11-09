import { useState } from 'preact/hooks';
import { AudioDrop, ExportBar, ProgressBar, ErrorBox, useBusy, bigWarning, friendlyAudioError, fmtTime, formatBytes } from './ui';
import { decodeFile, AUDIO_ACCEPT, type Pcm } from '../../../lib/audio/core';
import { join } from '../../../lib/audio/dsp';
import { moveItem } from '../shared';

type Item = { id: number; file: File; pcm?: Pcm; err?: string };
let uid = 0;

export default function AudioJoiner() {
  const [items, setItems] = useState<Item[]>([]);
  const [cross, setCross] = useState(0); const [gap, setGap] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();

  const add = async (fs: File[]) => {
    setError('');
    const next = fs.map((file) => ({ id: ++uid, file }));
    setItems((x) => [...x, ...next]);
    for (const it of next) {
      try { it.pcm = await decodeFile(it.file, it.file.name, (l, d, t) => status(`${it.file.name}: ${l}`, d, t)); }
      catch (e) { it.err = friendlyAudioError(e); }
      setItems((x) => [...x]);
    }
    setBusy(null);
  };
  const ready = items.filter((i) => i.pcm);
  const total = ready.reduce((a, i) => a + i.pcm!.ch[0].length / i.pcm!.rate, 0) - (ready.length > 1 ? (ready.length - 1) * (cross - gap) : 0);
  const loading = items.some((i) => !i.pcm && !i.err);

  if (!items.length) return <>
    <AudioDrop accept={AUDIO_ACCEPT} multiple label="Choose audio files" hint="or drop 2 or more files here · MP3, WAV, M4A, OGG, FLAC and more" onFiles={add} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;
  return (
    <div class="au">
      {bigWarning(items.reduce((a, i) => a + i.file.size, 0)) && <p class="hint">{bigWarning(items.reduce((a, i) => a + i.file.size, 0))}</p>}
      <p class="hint">Drag the files (or use the arrows) to set the order. They are joined from top to bottom.</p>
      <ol class="au-rows au-join">
        {items.map((it, i) => (
          <li class={`au-row ${drag === i ? 'dragging' : ''}`} draggable
            onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
            onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { setItems(moveItem(items, drag, i)); setDrag(i); } }}>
            <span class="au-grip" aria-hidden="true">⠿</span>
            <span class="au-num">{i + 1}</span>
            <span class="au-row-main"><b>{it.file.name}</b><small>{formatBytes(it.file.size)}{it.pcm ? ` · ${fmtTime(it.pcm.ch[0].length / it.pcm.rate, 0)}` : it.err ? '' : ' · reading…'}</small>{it.err && <small class="err">{it.err}</small>}</span>
            <span class="au-row-btns">
              <button type="button" class="mini" aria-label="Move up" disabled={i === 0} onClick={() => setItems(moveItem(items, i, i - 1))}>↑</button>
              <button type="button" class="mini" aria-label="Move down" disabled={i === items.length - 1} onClick={() => setItems(moveItem(items, i, i + 1))}>↓</button>
              <button type="button" class="mini" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.id !== it.id))}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      <AudioDrop accept={AUDIO_ACCEPT} multiple label="Add more files" compact hint="" onFiles={add} />
      <div class="opts" data-title="Join">
        <label>Crossfade <b>{cross.toFixed(1)} s</b><input type="range" min={0} max={10} step={0.5} value={cross} onInput={(e) => { setCross(+(e.target as HTMLInputElement).value); if (+(e.target as HTMLInputElement).value) setGap(0); }} /></label>
        <label>Silence between <b>{gap.toFixed(1)} s</b><input type="range" min={0} max={5} step={0.5} value={gap} onInput={(e) => { setGap(+(e.target as HTMLInputElement).value); if (+(e.target as HTMLInputElement).value) setCross(0); }} /></label>
        <p class="hint full">Total length: <b>{fmtTime(Math.max(0, total), 0)}</b> from {ready.length} file{ready.length === 1 ? '' : 's'}. Crossfade blends the end of one file into the start of the next.</p>
      </div>
      {loading && busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {ready.length < 2 ? <p class="status">{loading ? 'Reading files…' : 'Add at least 2 files to join them.'}</p>
        : <ExportBar pcm={() => join(ready.map((i) => i.pcm!), cross, gap)} name="joined-audio" suffix={`${ready.length}-files`} formats={['mp3', 'wav', 'm4a']} status={status} setBusy={setBusy} busy={loading ? null : busy} onError={setError} label="Join and download" />}
    </div>
  );
}
