import { useMemo, useState } from 'preact/hooks';
import { AudioDrop, FileLine, Wave, ExportBar, ProgressBar, ErrorBox, useBusy, bigWarning, friendlyAudioError, fmtTime, useObjectUrl } from './ui';
import { loadAudio } from './load';
import { AUDIO_ACCEPT, encodeWav, type Pcm } from '../../../lib/audio/core';
import { gainLimit, dbToGain, peak, loudness, reverse, stretch, gainToDb } from '../../../lib/audio/dsp';

type Mode = 'volume' | 'normalize' | 'reverse' | 'pitch' | 'speed';
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function AudioEffect({ mode }: { mode: Mode }) {
  const [file, setFile] = useState<File | null>(null);
  const [au, setAu] = useState<{ pcm: Pcm; url: string } | null>(null);
  const [out, setOut] = useState<Pcm | null>(null);
  const [db, setDb] = useState(6); const [limit, setLimit] = useState(true);
  const [norm, setNorm] = useState<'peak' | '-14' | '-16' | '-23'>('-14');
  const [semi, setSemi] = useState(2); const [key, setKey] = useState('');
  const [speed, setSpeed] = useState(1.25);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const outBlob = useMemo(() => (out ? encodeWav(out) : null), [out]);
  const outUrl = useObjectUrl(outBlob);
  const stats = useMemo(() => (au && (mode === 'volume' || mode === 'normalize') ? { peak: gainToDb(peak(au.pcm)), lufs: loudness(au.pcm) } : null), [au]);
  const outStats = useMemo(() => (out && (mode === 'volume' || mode === 'normalize') ? { peak: gainToDb(peak(out)), lufs: loudness(out) } : null), [out]);

  const pick = async (fs: File[]) => {
    const f = fs[0]; if (!f) return; setError(''); setFile(f); setAu(null); setOut(null);
    try { setAu(await loadAudio(f, status)); } catch (e) { setError(friendlyAudioError(e)); setFile(null); } finally { setBusy(null); }
  };
  const reset = () => { if (au) URL.revokeObjectURL(au.url); setFile(null); setAu(null); setOut(null); setError(''); };
  const apply = async () => {
    if (!au) return; setError(''); setOut(null); status('Processing…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const p = au.pcm; let r: Pcm;
      if (mode === 'volume') r = limit ? gainLimit(p, db, -1) : { rate: p.rate, ch: p.ch.map((x) => x.map((v) => Math.max(-1, Math.min(1, v * dbToGain(db))))) };
      else if (mode === 'normalize') {
        if (norm === 'peak') r = gainLimit(p, -1 - stats!.peak, -1);
        else r = gainLimit(p, +norm - stats!.lufs, -1);
      } else if (mode === 'reverse') r = reverse(p);
      else if (mode === 'pitch') r = await stretch(p, { semitones: semi }, status);
      else r = await stretch(p, { tempo: speed }, status);
      setOut(r);
    } catch (e) { setError(friendlyAudioError(e)); } finally { setBusy(null); }
  };
  const clipRisk = stats && mode === 'volume' && stats.peak + db > 0;

  if (!file) return <>
    <AudioDrop accept={AUDIO_ACCEPT} label="Choose audio file" onFiles={pick} />
    {error && <ErrorBox>{error}</ErrorBox>}
  </>;
  const dur = au ? au.pcm.ch[0].length / au.pcm.rate : 0;
  const suffix = { volume: db >= 0 ? 'louder' : 'quieter', normalize: 'normalized', reverse: 'reversed', pitch: `pitch${semi > 0 ? '+' : ''}${semi}`, speed: `${speed}x` }[mode];
  const btn = { volume: 'Apply volume', normalize: 'Normalize', reverse: 'Reverse audio', pitch: 'Change pitch', speed: 'Change speed' }[mode];
  return (
    <div class="au">
      <FileLine file={file} onReset={reset} extra={au ? fmtTime(dur, 0) : undefined} />
      {bigWarning(file.size) && <p class="hint">{bigWarning(file.size)}</p>}
      {!au && busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {au && <>
        <p class="au-label">Original</p>
        <Wave pcm={au.pcm} url={au.url} height={90} normalize={mode !== 'volume' && mode !== 'normalize'} />
        {stats && <p class="au-meter">Loudest peak <b>{stats.peak.toFixed(1)} dB</b> · Loudness <b>{stats.lufs.toFixed(1)} LUFS</b></p>}
        {mode === 'volume' && <div class="opts" data-title="Volume">
          <label class="full">Change <b>{db > 0 ? '+' : ''}{db} dB</b> ({Math.round(dbToGain(db) * 100)}% volume)<input type="range" min={-20} max={20} step={1} value={db} onInput={(e) => { setDb(+(e.target as HTMLInputElement).value); setOut(null); }} /></label>
          <div class="pchoice">{[-6, 3, 6, 10, 15].map((v) => <button type="button" aria-pressed={db === v} onClick={() => { setDb(v); setOut(null); }}>{v > 0 ? '+' : ''}{v} dB</button>)}</div>
          <label class="chk full"><input type="checkbox" checked={limit} onChange={(e) => { setLimit((e.target as HTMLInputElement).checked); setOut(null); }} /> Prevent distortion (smart limiter)</label>
          {clipRisk && <p class="hint full">{limit ? 'This boost would clip. The limiter gently turns down only the loudest moments, so it stays clean.' : 'Warning: this boost will clip and distort. Turn on the limiter.'}</p>}
        </div>}
        {mode === 'normalize' && <div class="opts" data-title="Target">
          <div class="pchoice full">
            {([['-14', 'Streaming', '-14 LUFS · YouTube, Spotify'], ['-16', 'Podcast', '-16 LUFS · Apple, voice'], ['-23', 'Broadcast', '-23 LUFS · TV, EBU R128'], ['peak', 'Peak', 'loudest point at -1 dB']] as const).map(([v, l, s]) => <button type="button" aria-pressed={norm === v} onClick={() => { setNorm(v); setOut(null); }}>{l}<small>{s}</small></button>)}
          </div>
          <p class="hint full">Loudness targets make every file sound equally loud. A limiter keeps peaks below -1 dB.</p>
        </div>}
        {mode === 'pitch' && <div class="opts" data-title="Pitch">
          <label class="full">Shift <b>{semi > 0 ? '+' : ''}{semi} semitone{Math.abs(semi) === 1 ? '' : 's'}</b>{key && ` · ${key} → ${NOTES[(NOTES.indexOf(key) + Math.round(semi) + 120) % 12]}`}<input type="range" min={-12} max={12} step={0.5} value={semi} onInput={(e) => { setSemi(+(e.target as HTMLInputElement).value); setOut(null); }} /></label>
          <label>Song key (optional)<select value={key} onChange={(e) => setKey((e.target as HTMLSelectElement).value)}><option value="">Not set</option>{NOTES.map((n) => <option>{n}</option>)}</select></label>
          <div class="pchoice">{[-2, -1, 1, 2, 12].map((v) => <button type="button" aria-pressed={semi === v} onClick={() => { setSemi(v); setOut(null); }}>{v > 0 ? '+' : ''}{v}{v === 12 ? ' (octave)' : ''}</button>)}</div>
          <p class="hint full">The speed stays exactly the same. 12 semitones = one octave.</p>
        </div>}
        {mode === 'speed' && <div class="opts" data-title="Speed">
          <label class="full">Speed <b>{speed.toFixed(2)}x</b> · new length {fmtTime(dur / speed, 0)}<input type="range" min={0.5} max={2} step={0.05} value={speed} onInput={(e) => { setSpeed(+(e.target as HTMLInputElement).value); setOut(null); }} /></label>
          <div class="pchoice">{[0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2].map((v) => <button type="button" aria-pressed={speed === v} onClick={() => { setSpeed(v); setOut(null); }}>{v}x</button>)}</div>
          <p class="hint full">The pitch stays the same, so voices do not sound like chipmunks or slow motion.</p>
        </div>}
        {busy && !out && au && <ProgressBar {...busy} />}
        <div class="actions"><button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onClick={apply}>{btn}</button></div>
        {out && outUrl && <>
          <p class="au-label">Result: listen before you download</p>
          <Wave key={outUrl} pcm={out} url={outUrl} height={90} normalize={mode !== 'volume' && mode !== 'normalize'} />
          {outStats && <p class="au-meter">Loudest peak <b>{outStats.peak.toFixed(1)} dB</b> · Loudness <b>{outStats.lufs.toFixed(1)} LUFS</b></p>}
          <ExportBar pcm={() => out} name={file.name} suffix={suffix} formats={['mp3', 'wav', 'm4a']} status={status} setBusy={setBusy} busy={busy} onError={setError} />
        </>}
      </>}
    </div>
  );
}
