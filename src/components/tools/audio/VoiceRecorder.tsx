import { useEffect, useRef, useState } from 'preact/hooks';
import { Wave, ExportBar, ErrorBox, useBusy, fmtTime, friendlyAudioError } from './ui';
import { decodeFile, encodeWav, type Pcm } from '../../../lib/audio/core';

type State = 'idle' | 'rec' | 'paused' | 'done';

export default function VoiceRecorder() {
  const [state, setState] = useState<State>('idle');
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]); const [mic, setMic] = useState('');
  const [echo, setEcho] = useState(true);
  const [time, setTime] = useState(0); const [level, setLevel] = useState(0);
  const [rec, setRec] = useState<{ pcm: Pcm; url: string } | null>(null);
  const [error, setError] = useState('');
  const { busy, setBusy, status } = useBusy();
  const mr = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]); const raf = useRef(0); const t0 = useRef(0); const acc = useRef(0); const ctx = useRef<AudioContext | null>(null);

  const listMics = async () => { try { const d = await navigator.mediaDevices.enumerateDevices(); setMics(d.filter((x) => x.kind === 'audioinput')); } catch { /* not allowed yet */ } };
  useEffect(() => { listMics(); return () => stop(true); }, []);

  const start = async () => {
    setError(''); setRec(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Recording is not supported in this browser. Please use a recent Chrome, Edge, Firefox or Safari.'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: mic ? { exact: mic } : undefined, echoCancellation: echo, noiseSuppression: echo, autoGainControl: echo } });
      stream.current = s; listMics();
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const r = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 192000 } : undefined);
      chunks.current = []; r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = finish; r.start(1000); mr.current = r;
      // live level meter
      const ac = new AudioContext(); ctx.current = ac; const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      acc.current = 0; t0.current = performance.now();
      const loop = () => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); setLevel(m); if (mr.current?.state === 'recording') setTime(acc.current + (performance.now() - t0.current) / 1000); raf.current = requestAnimationFrame(loop); };
      loop(); setState('rec');
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow the microphone in your browser (the icon in the address bar) and try again.' : e?.name === 'NotFoundError' ? 'No microphone was found. Plug one in, or check it with our Mic Test.' : 'The microphone could not be started: ' + (e?.message ?? e));
    }
  };
  const pause = () => { const r = mr.current; if (!r) return; if (r.state === 'recording') { r.pause(); acc.current += (performance.now() - t0.current) / 1000; setState('paused'); } else { r.resume(); t0.current = performance.now(); setState('rec'); } };
  const stop = (silent = false) => {
    cancelAnimationFrame(raf.current); ctx.current?.close().catch(() => {}); ctx.current = null;
    if (mr.current && mr.current.state !== 'inactive') { if (silent) mr.current.onstop = null; mr.current.stop(); }
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setLevel(0);
  };
  const finish = async () => {
    const blob = new Blob(chunks.current, { type: mr.current?.mimeType || 'audio/webm' }); mr.current = null;
    try { status('Preparing your recording…'); const pcm = await decodeFile(blob, /mp4/.test(blob.type) ? 'rec.m4a' : 'rec.webm', status); setRec({ pcm, url: URL.createObjectURL(encodeWav(pcm)) }); setState('done'); }
    catch (e) { setError(friendlyAudioError(e)); setState('idle'); } finally { setBusy(null); }
  };
  const date = new Date(); const name = `recording-${date.toISOString().slice(0, 10)}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return (
    <div class="au rec">
      <div class="rec-panel">
        <button type="button" class={`rec-btn ${state === 'rec' ? 'on' : ''}`} onClick={() => (state === 'rec' || state === 'paused' ? stop() : start())} aria-label={state === 'rec' || state === 'paused' ? 'Stop recording' : 'Start recording'}>
          {state === 'rec' || state === 'paused' ? <span class="sq" /> : <span class="dot" />}
        </button>
        <div class="rec-info">
          <span class="rec-time">{fmtTime(time, 1)}</span>
          <span class="rec-state">{state === 'rec' ? '● Recording' : state === 'paused' ? 'Paused' : state === 'done' ? 'Recording ready' : 'Press the red button to start'}</span>
          <div class="rec-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, level * 140)}%`, background: level > 0.95 ? '#dc2626' : level > 0.6 ? '#f59e0b' : '#16a34a' }} /></div>
        </div>
        {(state === 'rec' || state === 'paused') && <button type="button" class="btn btn-ghost" onClick={pause}>{state === 'paused' ? '● Resume' : '❚❚ Pause'}</button>}
      </div>
      {state === 'idle' && <div class="opts" data-title="Microphone">
        <label>Microphone<select value={mic} onChange={(e) => setMic((e.target as HTMLSelectElement).value)}><option value="">Default microphone</option>{mics.filter((m) => m.deviceId && m.deviceId !== 'default').map((m, i) => <option value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>)}</select></label>
        <label class="chk"><input type="checkbox" checked={echo} onChange={(e) => setEcho((e.target as HTMLInputElement).checked)} /> Reduce noise and echo (best for voice)</label>
        <p class="hint full">Mic not working? Check it first with our <a href="/device-test/mic-test/">Mic Test</a>.</p>
      </div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy && !rec && <p class="status">{busy.label}</p>}
      {rec && state === 'done' && <>
        <Wave key={rec.url} pcm={rec.pcm} url={rec.url} height={90} />
        <ExportBar pcm={() => rec.pcm} name={name + '.x'} suffix="" formats={['mp3', 'wav', 'm4a']} defKbps={128} status={status} setBusy={setBusy} busy={busy} onError={setError} />
        <div class="actions"><button type="button" class="btn btn-ghost" onClick={() => { setRec(null); setState('idle'); setTime(0); }}>New recording</button></div>
      </>}
    </div>
  );
}
