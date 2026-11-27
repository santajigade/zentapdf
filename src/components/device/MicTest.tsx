import { useEffect, useRef, useState } from 'preact/hooks';

export default function MicTest() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [dev, setDev] = useState('');
  const [proc, setProc] = useState(false);
  const [info, setInfo] = useState<{ label: string; rate: number; ch: number } | null>(null);
  const [level, setLevel] = useState(-100);
  const [peak, setPeak] = useState(-100);
  const [heard, setHeard] = useState(false);
  const [rec, setRec] = useState<'idle' | 'rec' | 'done'>('idle');
  const [clip, setClip] = useState('');
  const [left, setLeft] = useState(5);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const wave = useRef<HTMLCanvasElement>(null);
  const bars = useRef<HTMLCanvasElement>(null);

  const stop = () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; ctx.current?.close().catch(() => {}); ctx.current = null; setOn(false); setLevel(-100); };
  useEffect(() => () => { stop(); clip && URL.revokeObjectURL(clip); }, []);

  const start = async (deviceId = dev, processing = proc) => {
    stop(); setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Your browser cannot use the microphone. Please use the latest Chrome, Edge, Firefox or Safari.'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing } });
      stream.current = s;
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); setDevices(list);
      const tr = s.getAudioTracks()[0]; const st = tr.getSettings();
      setDev(st.deviceId ?? ''); 
      const ac = new AudioContext(); ctx.current = ac;
      const src = ac.createMediaStreamSource(s); const an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.6; src.connect(an);
      setInfo({ label: tr.label || 'Microphone', rate: ac.sampleRate, ch: st.channelCount ?? 1 });
      const td = new Float32Array(an.fftSize); const fd = new Uint8Array(an.frequencyBinCount);
      let pk = -100, pkT = 0;
      const loop = () => {
        an.getFloatTimeDomainData(td); an.getByteFrequencyData(fd);
        let sum = 0, mx = 0; for (const v of td) { sum += v * v; mx = Math.max(mx, Math.abs(v)); }
        const db = Math.max(-100, 20 * Math.log10(Math.sqrt(sum / td.length) || 1e-6));
        const now = performance.now(); const pdb = 20 * Math.log10(mx || 1e-6);
        if (pdb > pk || now - pkT > 1500) { pk = pdb; pkT = now; }
        setLevel(db); setPeak(pk); if (db > -45) setHeard(true);
        const w = wave.current; if (w) { const g = w.getContext('2d')!; g.clearRect(0, 0, w.width, w.height); g.strokeStyle = '#4f46e5'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < td.length; i += 4) { const x = (i / td.length) * w.width, y = (0.5 - td[i] * 0.48) * w.height; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
        const b = bars.current; if (b) { const g = b.getContext('2d')!; g.clearRect(0, 0, b.width, b.height); const n = 48; for (let i = 0; i < n; i++) { const idx = Math.floor(Math.pow(i / n, 2) * fd.length * 0.6) + 1; const v = fd[idx] / 255; const h = v * b.height; g.fillStyle = `hsl(${240 - v * 120},75%,55%)`; g.fillRect(i * (b.width / n) + 1, b.height - h, b.width / n - 2, h); } }
        raf.current = requestAnimationFrame(loop);
      };
      loop(); setOn(true);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Microphone access was blocked. Click the lock or camera icon in the address bar, allow the microphone, then try again.' : e?.name === 'NotFoundError' ? 'No microphone was found. Plug one in (or connect your headset) and try again.' : e?.name === 'NotReadableError' ? 'The microphone is being used by another app (Zoom, Teams, Discord…). Close it and try again.' : 'The microphone could not be started: ' + (e?.message ?? e));
    }
  };

  const record = () => {
    if (!stream.current || typeof MediaRecorder === 'undefined') return;
    const mr = new MediaRecorder(stream.current); const parts: Blob[] = [];
    mr.ondataavailable = (e) => parts.push(e.data);
    mr.onstop = () => { clip && URL.revokeObjectURL(clip); setClip(URL.createObjectURL(new Blob(parts, { type: mr.mimeType }))); setRec('done'); };
    mr.start(); setRec('rec'); setLeft(5);
    let n = 5; const iv = setInterval(() => { n--; setLeft(n); if (n <= 0) { clearInterval(iv); mr.stop(); } }, 1000);
  };

  const pct = Math.max(0, Math.min(100, ((level + 70) / 70) * 100));
  return (
    <div>
      {!on ? (
        <div class="dt-start">
          <button type="button" class="btn btn-primary btn-lg" onClick={() => start()}>🎤 Start mic test</button>
          <p class="status">Your browser will ask to use the microphone. The sound stays on your device, nothing is recorded or uploaded.</p>
        </div>
      ) : (
        <>
          <div class="mic-meter" aria-label={`Level ${Math.round(level)} dB`}><div style={{ width: pct + '%' }} /><span style={{ left: Math.max(0, Math.min(100, ((peak + 70) / 70) * 100)) + '%' }} /></div>
          <div class="mic-graphs"><canvas ref={wave} width={600} height={140} /><canvas ref={bars} width={600} height={140} /></div>
          <div class={'mic-verdict' + (heard ? ' ok' : '')}>{heard ? '✓ Your microphone is working' : 'Say something… waiting for sound'}</div>
          <div class="dt-results">
            <div><span>Input level</span><b>{level <= -99 ? '–' : `${Math.round(level)} dB`}</b><small>peak {Math.round(peak)} dB</small></div>
            <div><span>Microphone</span><b style={{ fontSize: '1rem' }}>{info?.label}</b></div>
            <div><span>Sample rate</span><b>{info ? `${(info.rate / 1000).toFixed(1)} kHz` : '–'}</b><small>{info?.ch === 2 ? 'stereo' : 'mono'}</small></div>
          </div>
          <div class="opts" data-title="Options">
            {devices.length > 1 && <label>Microphone<select value={dev} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setDev(v); setHeard(false); start(v); }}>{devices.map((d, i) => <option value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}</select></label>}
            <label class="check"><input type="checkbox" checked={proc} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setProc(v); start(dev, v); }} /> Noise suppression &amp; echo cancellation (like video calls)</label>
          </div>
          <div class="actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" class="btn btn-primary" disabled={rec === 'rec'} onClick={record}>{rec === 'rec' ? `● Recording… ${left}s` : '● Record 5 seconds'}</button>
            <button type="button" class="btn btn-ghost" onClick={stop}>Stop</button>
          </div>
          {clip && <div class="mic-play"><span>Your recording (only on this device):</span><audio controls src={clip} /></div>}
        </>
      )}
      {error && <div class="error" role="alert">{error}</div>}
    </div>
  );
}
