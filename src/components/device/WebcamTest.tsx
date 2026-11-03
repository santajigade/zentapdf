import { useEffect, useRef, useState } from 'preact/hooks';

export default function WebcamTest() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [cam, setCam] = useState('');
  const [mirror, setMirror] = useState(true);
  const [want, setWant] = useState(1080);
  const [info, setInfo] = useState<{ w: number; h: number; fps: number; label: string; facing?: string } | null>(null);
  const [mfps, setMfps] = useState(0);
  const [snap, setSnap] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); };
  useEffect(() => () => stop(), []);

  const start = async (id = cam, height = want) => {
    stop(); setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Your browser cannot use the camera. Please use the latest Chrome, Edge, Firefox or Safari.'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: Math.round(height * 16 / 9) }, height: { ideal: height }, frameRate: { ideal: 60 } }, audio: false });
      stream.current = s; const v = video.current!; v.srcObject = s; await v.play().catch(() => {});
      setCams((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
      const tr = s.getVideoTracks()[0]; const st = tr.getSettings(); setCam(st.deviceId ?? '');
      setInfo({ w: st.width ?? v.videoWidth, h: st.height ?? v.videoHeight, fps: Math.round(st.frameRate ?? 0), label: tr.label || 'Camera', facing: st.facingMode });
      setOn(true);
      // measure real frames per second
      let n = 0, t0 = performance.now();
      const tick = () => { if (!stream.current) return; n++; const t = performance.now(); if (t - t0 >= 1000) { setMfps(Math.round((n * 1000) / (t - t0))); n = 0; t0 = t; } (v as any).requestVideoFrameCallback ? (v as any).requestVideoFrameCallback(tick) : requestAnimationFrame(tick); };
      (v as any).requestVideoFrameCallback ? (v as any).requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera access was blocked. Click the camera icon in the address bar, allow the camera, then try again.' : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'No camera was found. Connect a webcam (or check the laptop camera switch) and try again.' : e?.name === 'NotReadableError' ? 'The camera is being used by another app (Zoom, Teams, Skype…). Close it and try again.' : 'The camera could not be started: ' + (e?.message ?? e));
    }
  };

  const takeSnap = () => {
    const v = video.current; if (!v) return; const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!; if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { snap && URL.revokeObjectURL(snap); setSnap(URL.createObjectURL(b)); } }, 'image/png');
  };
  const mp = info ? ((info.w * info.h) / 1e6).toFixed(1) : '';
  const name = info ? (info.h >= 2160 ? '4K' : info.h >= 1440 ? '1440p (2K)' : info.h >= 1080 ? '1080p Full HD' : info.h >= 720 ? '720p HD' : info.h >= 480 ? '480p' : `${info.h}p`) : '';
  return (
    <div>
      <div class="cam-wrap" style={{ display: on ? undefined : 'none' }}><video ref={video} playsInline muted style={{ transform: mirror ? 'scaleX(-1)' : undefined }} /></div>
      {!on && (
        <div class="dt-start">
          <button type="button" class="btn btn-primary btn-lg" onClick={() => start()}>📷 Start webcam test</button>
          <p class="status">Your browser will ask to use the camera. The video stays on your device — nothing is recorded or uploaded.</p>
        </div>
      )}
      {on && info && <>
        <div class="dt-results">
          <div><span>Resolution</span><b>{info.w} × {info.h}</b><small>{name} · {mp} MP</small></div>
          <div><span>Frame rate</span><b>{mfps || info.fps} fps</b><small>camera reports {info.fps} fps</small></div>
          <div><span>Camera</span><b style={{ fontSize: '1rem' }}>{info.label}</b><small>{info.facing ? info.facing : ''}</small></div>
        </div>
        <div class="opts" data-title="Options">
          {cams.length > 1 && <label>Camera<select value={cam} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setCam(v); start(v); }}>{cams.map((d, i) => <option value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}</select></label>}
          <label>Try resolution<select value={want} onChange={(e) => { const v = +(e.target as HTMLSelectElement).value; setWant(v); start(cam, v); }}>{[[2160, '4K (2160p)'], [1440, '2K (1440p)'], [1080, 'Full HD (1080p)'], [720, 'HD (720p)'], [480, '480p']].map(([v, t]) => <option value={v}>{t}</option>)}</select></label>
          <label class="check"><input type="checkbox" checked={mirror} onChange={(e) => setMirror((e.target as HTMLInputElement).checked)} /> Mirror image</label>
        </div>
        <div class="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" class="btn btn-primary" onClick={takeSnap}>📸 Take a photo</button>
          <button type="button" class="btn btn-ghost" onClick={stop}>Stop camera</button>
        </div>
        {snap && <div class="cam-snap"><img src={snap} alt="Webcam snapshot" /><a class="btn btn-ghost" href={snap} download="webcam-photo.png">Download photo</a></div>}
      </>}
      {error && <div class="error" role="alert">{error}</div>}
    </div>
  );
}
