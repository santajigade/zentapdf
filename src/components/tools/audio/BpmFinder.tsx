import { useEffect, useRef, useState } from 'preact/hooks';
import { AudioDrop, FileLine, Wave, ProgressBar, ErrorBox, useBusy, friendlyAudioError, fmtTime } from './ui';
import { loadAudio } from './load';
import { AUDIO_ACCEPT, type Pcm } from '../../../lib/audio/core';
import { detectBpm } from '../../../lib/audio/dsp';

export default function BpmFinder() {
  const [file, setFile] = useState<File | null>(null);
  const [au, setAu] = useState<{ pcm: Pcm; url: string } | null>(null);
  const [res, setRes] = useState<ReturnType<typeof detectBpm> | null>(null);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const pick = async (fs: File[]) => {
    const f = fs[0]; if (!f) return; setError(''); setFile(f); setAu(null); setRes(null);
    try {
      const a = await loadAudio(f, status); setAu(a);
      status('Finding the beat…'); await new Promise((r) => setTimeout(r, 30));
      setRes(detectBpm(a.pcm));
    } catch (e) { setError(friendlyAudioError(e)); setFile(null); } finally { setBusy(null); }
  };
  return (
    <div class="au">
      {!file ? <AudioDrop accept={AUDIO_ACCEPT} label="Choose a song" onFiles={pick} /> : <FileLine file={file} onReset={() => { setFile(null); setAu(null); setRes(null); }} extra={au ? fmtTime(au.pcm.ch[0].length / au.pcm.rate, 0) : undefined} />}
      {busy && <ProgressBar {...busy} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {res && au && <>
        <div class="bpm-result">
          <div><span class="bpm-num">{Math.round(res.bpm)}</span><span class="bpm-unit">BPM</span></div>
          <p>Exact: <b>{res.bpm.toFixed(1)}</b> · Confidence: <b>{res.confidence > 0.6 ? 'high' : res.confidence > 0.3 ? 'medium' : 'low'}</b>{res.candidates.length > 0 && <> · Could also be counted as {res.candidates.map((c) => <b>{Math.round(c)}</b>).reduce((a: any, b: any) => [a, ' or ', b])} BPM</>}</p>
        </div>
        <Wave pcm={au.pcm} url={au.url} height={80} />
        <p class="hint">Not sure? Play the song and tap along below to check.</p>
      </>}
      <TapTempo />
    </div>
  );
}

function TapTempo() {
  const [taps, setTaps] = useState<number[]>([]);
  const last = useRef(0);
  const tap = () => {
    const now = performance.now();
    setTaps((t) => (now - last.current > 2500 ? [now] : [...t, now].slice(-16)));
    last.current = now;
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,select,textarea,button')) { e.preventDefault(); tap(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const ivs = taps.slice(1).map((t, i) => t - taps[i]);
  const bpm = ivs.length ? 60000 / (ivs.reduce((a, b) => a + b, 0) / ivs.length) : 0;
  return (
    <div class="opts tap" data-title="Tap tempo">
      <button type="button" class="tap-btn" onClick={tap}>{taps.length ? 'TAP' : 'Tap here to the beat'}</button>
      <div class="tap-out"><span class="bpm-num">{bpm ? Math.round(bpm) : '--'}</span><span class="bpm-unit">BPM</span><small>{taps.length < 2 ? 'Tap at least 4 times. On a computer you can press the space bar.' : `${taps.length} taps · exact ${bpm.toFixed(1)}`}</small>
        {taps.length > 0 && <button type="button" class="linkbtn" onClick={() => setTaps([])}>Reset</button>}</div>
    </div>
  );
}
