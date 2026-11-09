import { useState } from 'preact/hooks';
import { AudioDrop, FileLine, Wave, TimeInput, ExportBar, ProgressBar, ErrorBox, useBusy, bigWarning, friendlyAudioError, fmtTime } from './ui';
import { loadAudio } from './load';
import { AUDIO_ACCEPT, type Pcm } from '../../../lib/audio/core';
import { slice, fade, cutOut } from '../../../lib/audio/dsp';

/** MP3 Cutter (mode "cut") and Ringtone Maker (mode "ringtone"). */
export default function AudioCutter({ mode = 'cut' }: { mode?: 'cut' | 'ringtone' }) {
  const ring = mode === 'ringtone';
  const [file, setFile] = useState<File | null>(null);
  const [au, setAu] = useState<{ pcm: Pcm; url: string } | null>(null);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [fin, setFin] = useState(ring ? 1 : 0); const [fout, setFout] = useState(ring ? 2 : 0);
  const [keep, setKeep] = useState<'keep' | 'remove'>('keep');
  const [maxLen, setMaxLen] = useState(30);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const dur = au ? au.pcm.ch[0].length / au.pcm.rate : 0;

  const pick = async (fs: File[]) => {
    const f = fs[0]; if (!f) return;
    setError(''); setFile(f); setAu(null);
    try {
      const r = await loadAudio(f, status);
      const d = r.pcm.ch[0].length / r.pcm.rate;
      setAu(r); setSel(ring ? [Math.min(d * 0.25, Math.max(0, d - 30)), Math.min(d, Math.min(d * 0.25, Math.max(0, d - 30)) + 30)] : [0, d]);
    } catch (e) { setError(friendlyAudioError(e)); setFile(null); }
    finally { setBusy(null); }
  };
  const reset = () => { if (au) URL.revokeObjectURL(au.url); setFile(null); setAu(null); setError(''); };
  const setA = (v: number) => setSel([Math.min(v, sel[1] - 0.2), ring ? Math.min(sel[1], v + maxLen) : sel[1]]);
  const setB = (v: number) => setSel([ring ? Math.max(sel[0], v - maxLen) : sel[0], Math.max(v, sel[0] + 0.2)]);
  const len = sel[1] - sel[0];
  const build = () => { const p = keep === 'remove' && !ring ? cutOut(au!.pcm, sel[0], sel[1]) : slice(au!.pcm, sel[0], sel[1]); return fin || fout ? fade(p, fin, fout) : p; };

  if (!file) return <>
    <AudioDrop accept={AUDIO_ACCEPT + ',' + 'video/*'} label="Choose audio file" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;
  return (
    <div class="au">
      <FileLine file={file} onReset={reset} extra={au ? fmtTime(dur, 0) : undefined} />
      {bigWarning(file.size) && <p class="hint">{bigWarning(file.size)}</p>}
      {!au && busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {au && <>
        <Wave pcm={au.pcm} url={au.url} sel={sel} onSel={(a, b) => setSel([a, b])} maxLen={ring ? maxLen : undefined} />
        <div class="opts" data-title={ring ? 'Ringtone part' : 'Selection'}>
          <TimeInput label="Start" value={sel[0]} max={dur} onChange={setA} />
          <TimeInput label="End" value={sel[1]} max={dur} onChange={setB} />
          <span class="au-len">Length <b>{fmtTime(len, 1)}</b>{ring && len > 30 && <small> (over 30 s: fine for iPhone up to 40 s)</small>}</span>
          {ring && <label>Max length<select value={maxLen} onChange={(e) => { const m = +(e.target as HTMLSelectElement).value; setMaxLen(m); if (len > m) setSel([sel[0], sel[0] + m]); }}><option value={30}>30 seconds</option><option value={40}>40 seconds (iPhone limit)</option></select></label>}
          {!ring && <label>Do this<select value={keep} onChange={(e) => setKeep((e.target as HTMLSelectElement).value as any)}><option value="keep">Keep the selection</option><option value="remove">Remove the selection</option></select></label>}
          <button type="button" class="btn btn-ghost" onClick={() => setSel(ring ? [0, Math.min(dur, maxLen)] : [0, dur])}>Select all</button>
        </div>
        <div class="opts" data-title="Fade">
          <label>Fade in <b>{fin.toFixed(1)} s</b><input type="range" min={0} max={5} step={0.5} value={fin} onInput={(e) => setFin(+(e.target as HTMLInputElement).value)} /></label>
          <label>Fade out <b>{fout.toFixed(1)} s</b><input type="range" min={0} max={5} step={0.5} value={fout} onInput={(e) => setFout(+(e.target as HTMLInputElement).value)} /></label>
        </div>
        <ExportBar pcm={build} name={file.name} suffix={ring ? 'ringtone' : 'cut'} formats={ring ? ['mp3', 'm4r'] : ['mp3', 'wav', 'm4a']} defFmt="mp3" defKbps={ring ? 192 : 192} status={status} setBusy={setBusy} busy={busy} onError={setError} label={ring ? 'Download ringtone' : 'Cut and download'} />
        {ring && <RingtoneHelp />}
      </>}
    </div>
  );
}

function RingtoneHelp() {
  const [os, setOs] = useState<'android' | 'iphone'>(/iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : 'android');
  return (
    <div class="au-help">
      <div class="seg" role="group" aria-label="Phone type"><button type="button" aria-pressed={os === 'android'} onClick={() => setOs('android')}>Android</button><button type="button" aria-pressed={os === 'iphone'} onClick={() => setOs('iphone')}>iPhone</button></div>
      {os === 'android' ? (
        <ol>
          <li>Download the <b>MP3</b>. It is saved in your Downloads folder.</li>
          <li>Open <b>Settings → Sound and vibration → Ringtone</b> (the names differ a little by brand).</li>
          <li>Tap <b>+</b> or <b>From internal storage</b>, pick the file and tap <b>Done</b>.</li>
        </ol>
      ) : (
        <ol>
          <li>Download the <b>M4R</b> file (40 seconds or less) on your computer.</li>
          <li>Connect the iPhone. On a Mac open <b>Finder</b>, on Windows open <b>Apple Devices</b> or <b>iTunes</b>, and select the iPhone.</li>
          <li>Drag the M4R file onto the iPhone (on iTunes: onto <b>Tones</b> under On My Device).</li>
          <li>On the iPhone go to <b>Settings → Sounds and Haptics → Ringtone</b> and choose it.</li>
        </ol>
      )}
    </div>
  );
}
