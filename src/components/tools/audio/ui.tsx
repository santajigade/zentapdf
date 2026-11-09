import { useEffect, useRef, useState } from 'preact/hooks';
import { DropZone, ProgressBar, ErrorBox } from '../shared';
import { formatBytes, downloadBlob, baseName } from '../../../lib/utils';
import { encode, friendlyAudioError, fmtTime, parseTime, type Fmt, type Pcm, LOSSY } from '../../../lib/audio/core';
import { peaks as mkPeaks } from '../../../lib/audio/dsp';

export type Busy = { done: number; total: number; label: string } | null;
export function useBusy() {
  const [busy, setBusy] = useState<Busy>(null);
  const status = (label: string, done = 0, total = 0) => setBusy({ label, done, total });
  return { busy, setBusy, status };
}
export { ProgressBar, ErrorBox, friendlyAudioError, formatBytes, fmtTime };

export function AudioDrop({ accept, label, hint, multiple, compact, onFiles }: { accept: string; label: string; hint?: string; multiple?: boolean; compact?: boolean; onFiles: (f: File[]) => void }) {
  return <DropZone accept={accept} multiple={multiple} compact={compact} label={label} hint={hint ?? 'or drop a file here · MP3, WAV, M4A, AAC, OGG, FLAC and more'} onFiles={onFiles} />;
}

export function bigWarning(bytes: number): string | null {
  if (bytes > 300 * 1024 * 1024) return 'This is a very large file. It can take a few minutes and needs a lot of memory; a computer works best.';
  if (bytes > 100 * 1024 * 1024) return 'Large file: this may take a little longer. Keep this tab open until it finishes.';
  return null;
}

export function FileLine({ file, onReset, extra }: { file: File; onReset: () => void; extra?: string }) {
  return (
    <div class="au-file">
      <span class="au-file-ic" aria-hidden="true">♪</span>
      <span class="au-file-name"><b>{file.name}</b><small>{formatBytes(file.size)}{extra ? ` · ${extra}` : ''}</small></span>
      <button type="button" class="btn btn-ghost" onClick={onReset}>Choose another file</button>
    </div>
  );
}

/** Waveform with playback and, optionally, a selection with drag handles. */
export function Wave({ pcm, url, sel, onSel, maxLen, height = 120, normalize = true }: { pcm: Pcm; url: string; sel?: [number, number]; onSel?: (a: number, b: number) => void; maxLen?: number; height?: number; normalize?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<any>(null); const reg = useRef<any>(null);
  const [playing, setPlaying] = useState(false); const [t, setT] = useState(0); const [zoom, setZoom] = useState(0);
  const dur = pcm.ch[0].length / pcm.rate;
  useEffect(() => {
    let dead = false;
    (async () => {
      const [{ default: WaveSurfer }, { default: Regions }] = await Promise.all([import('wavesurfer.js'), import('wavesurfer.js/dist/plugins/regions.esm.js')]);
      if (dead || !box.current) return;
      const css = getComputedStyle(box.current);
      const w = WaveSurfer.create({
        container: box.current, height, url, peaks: [mkPeaks(pcm, 6000)], duration: dur, normalize,
        waveColor: css.getPropertyValue('--au-wave').trim() || '#c4b5fd', progressColor: css.getPropertyValue('--au-prog').trim() || '#7c3aed',
        cursorColor: '#ef4444', cursorWidth: 2, barWidth: 2, barGap: 1, barRadius: 2, dragToSeek: true,
      });
      ws.current = w;
      w.on('timeupdate', (x: number) => setT(x)); w.on('play', () => setPlaying(true)); w.on('pause', () => setPlaying(false)); w.on('finish', () => setPlaying(false));
      if (sel && onSel) {
        const r = w.registerPlugin(Regions.create());
        const region = r.addRegion({ start: sel[0], end: sel[1], color: 'rgba(124, 58, 237, 0.18)', drag: true, resize: true, minLength: 0.2, maxLength: maxLen });
        reg.current = region;
        region.on('update-end', () => onSel(region.start, region.end));
        region.on('update', () => onSel(region.start, region.end));
        // keep playback inside the selection
        w.on('timeupdate', (x: number) => { if ((w as any).__sel && x >= region.end) { w.pause(); (w as any).__sel = false; } });
      }
    })();
    return () => { dead = true; ws.current?.destroy(); ws.current = null; };
  }, [url]);
  // outside changes to the selection (typed times)
  useEffect(() => { if (reg.current && sel && (Math.abs(reg.current.start - sel[0]) > 0.01 || Math.abs(reg.current.end - sel[1]) > 0.01)) reg.current.setOptions({ start: sel[0], end: sel[1] }); }, [sel?.[0], sel?.[1]]);
  useEffect(() => { ws.current?.zoom(zoom ? (box.current!.clientWidth / dur) * zoom : 0); }, [zoom]);
  const playSel = () => { const w = ws.current; if (!w || !sel) return; (w as any).__sel = true; w.setTime(sel[0]); w.play(); };
  return (
    <div class="au-wave">
      <div ref={box} class="au-wave-box" />
      <div class="au-controls">
        <button type="button" class="btn btn-primary au-play" onClick={() => ws.current?.playPause()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        {sel && <button type="button" class="btn btn-ghost" onClick={playSel}>▶ Play selection</button>}
        <span class="au-time">{fmtTime(t)} / {fmtTime(dur)}</span>
        <label class="au-zoom">Zoom<input type="range" min={0} max={20} value={zoom} onInput={(e) => setZoom(+(e.target as HTMLInputElement).value)} /></label>
      </div>
    </div>
  );
}

export function TimeInput({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  const [txt, setTxt] = useState(fmtTime(value, 2));
  useEffect(() => setTxt(fmtTime(value, 2)), [value]);
  return (
    <label class="au-ti">{label}
      <span>
        <button type="button" class="mini" aria-label={`${label} 0.1 second earlier`} onClick={() => onChange(Math.max(0, value - 0.1))}>−</button>
        <input value={txt} inputMode="decimal" onInput={(e) => setTxt((e.target as HTMLInputElement).value)} onBlur={() => { const v = parseTime(txt); if (!isNaN(v)) onChange(Math.min(max, Math.max(0, v))); else setTxt(fmtTime(value, 2)); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <button type="button" class="mini" aria-label={`${label} 0.1 second later`} onClick={() => onChange(Math.min(max, value + 0.1))}>+</button>
      </span>
    </label>
  );
}

export const BITRATES = [64, 96, 128, 160, 192, 256, 320];
export const FMT_LABEL: Record<Fmt, string> = { mp3: 'MP3', wav: 'WAV', m4a: 'M4A', m4r: 'M4R (iPhone)', aac: 'AAC', ogg: 'OGG', flac: 'FLAC' };

/** Choose output format and quality, then build and download the file. */
export function ExportBar({ pcm, name, suffix, formats, defFmt = 'mp3', defKbps = 192, status, setBusy, busy, onError, label = 'Download' }: {
  pcm: () => Pcm | Promise<Pcm>; name: string; suffix: string; formats: Fmt[]; defFmt?: Fmt; defKbps?: number; status: (l: string, d?: number, t?: number) => void; setBusy: (b: Busy) => void; busy: Busy; onError: (s: string) => void; label?: string;
}) {
  const [fmt, setFmt] = useState<Fmt>(defFmt); const [kbps, setKbps] = useState(defKbps);
  const [done, setDone] = useState<{ blob: Blob; file: string } | null>(null);
  const go = async () => {
    onError(''); setDone(null);
    try {
      status('Preparing…'); const p = await pcm();
      const blob = await encode(p, fmt, { kbps }, status);
      const file = `${baseName(name)}${suffix ? '-' + suffix : ''}.${fmt}`;
      setDone({ blob, file }); downloadBlob(blob, file);
    } catch (e) { onError(friendlyAudioError(e)); } finally { setBusy(null); }
  };
  return (
    <div class="au-export">
      <div class="opts" data-title="Save as">
        {formats.length > 1 && <label>Format<select value={fmt} onChange={(e) => { setFmt((e.target as HTMLSelectElement).value as Fmt); setDone(null); }}>{formats.map((f) => <option value={f}>{FMT_LABEL[f]}</option>)}</select></label>}
        {LOSSY.includes(fmt) && <label>Quality<select value={kbps} onChange={(e) => { setKbps(+(e.target as HTMLSelectElement).value); setDone(null); }}>{BITRATES.map((b) => <option value={b}>{b} kbps{b === 128 ? ' (good)' : b === 192 ? ' (high)' : b === 320 ? ' (best)' : ''}</option>)}</select></label>}
      </div>
      {busy && <ProgressBar {...busy} />}
      <div class="actions">
        <button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={go}>{label} {FMT_LABEL[fmt].replace(' (iPhone)', '')}</button>
        {done && <button type="button" class="btn btn-ghost dl" onClick={() => downloadBlob(done.blob, done.file)}>Download again ({formatBytes(done.blob.size)})</button>}
      </div>
    </div>
  );
}

export function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!blob) { setUrl(''); return; } const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  return url;
}
