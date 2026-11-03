import { useState } from 'preact/hooks';

type Phase = 'idle' | 'locate' | 'download' | 'upload' | 'done' | 'error';
let loaded: Promise<any> | null = null;
const loadNdt7 = () => (loaded ??= new Promise((res, rej) => { if ((window as any).ndt7) return res((window as any).ndt7); const s = document.createElement('script'); s.src = '/vendor/ndt7/ndt7.js'; s.onload = () => res((window as any).ndt7); s.onerror = () => rej(new Error('Could not load the speed test.')); document.head.appendChild(s); }));

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  // logarithmic-ish scale 0..1000 Mbps
  const k = Math.min(1, Math.log10(1 + value) / 3); const a = -210 + k * 240;
  const r = 90, cx = 110, cy = 110; const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(-210), [x1, y1] = pt(30), [xv, yv] = pt(a);
  return (
    <svg viewBox="0 0 220 170" class="gauge" aria-label={`${label} ${value.toFixed(1)} Mbps`}>
      <path d={`M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1}`} fill="none" stroke="var(--border)" stroke-width="16" stroke-linecap="round" />
      {k > 0.003 && <path d={`M${x0} ${y0} A${r} ${r} 0 ${k > 0.75 ? 1 : 0} 1 ${xv} ${yv}`} fill="none" stroke={color} stroke-width="16" stroke-linecap="round" />}
      <text x="110" y="108" text-anchor="middle" font-size="36" font-weight="800" fill="currentColor">{value < 10 ? value.toFixed(1) : Math.round(value)}</text>
      <text x="110" y="132" text-anchor="middle" font-size="14" fill="var(--muted)">Mbps · {label}</text>
    </svg>
  );
}

export default function SpeedTest() {
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [dl, setDl] = useState(0); const [ul, setUl] = useState(0);
  const [ping, setPing] = useState<number | null>(null);
  const [server, setServer] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setError(''); setDl(0); setUl(0); setPing(null); setServer(''); setPhase('locate');
    try {
      const ndt7 = await loadNdt7();
      let failed = false;
      await ndt7.test({ userAcceptedDataPolicy: true, downloadworkerfile: '/vendor/ndt7/ndt7-download-worker.js', uploadworkerfile: '/vendor/ndt7/ndt7-upload-worker.js', metadata: { client_name: 'zentapdf-device-test', client_version: '1.0' } }, {
        serverChosen: (s: any) => setServer([s?.location?.city, s?.location?.country].filter(Boolean).join(', ') || s?.machine || ''),
        downloadStart: () => setPhase('download'),
        downloadMeasurement: (m: any) => { if (m.Source === 'client') setDl(m.Data.MeanClientMbps); else if (m.Data?.TCPInfo?.MinRTT) setPing(m.Data.TCPInfo.MinRTT / 1000); },
        downloadComplete: (d: any) => { if (d?.LastClientMeasurement) setDl(d.LastClientMeasurement.MeanClientMbps); if (d?.LastServerMeasurement?.TCPInfo?.MinRTT) setPing(d.LastServerMeasurement.TCPInfo.MinRTT / 1000); },
        uploadStart: () => setPhase('upload'),
        uploadMeasurement: (m: any) => { if (m.Source === 'server' && m.Data?.TCPInfo?.BytesReceived && m.Data?.TCPInfo?.ElapsedTime) setUl((m.Data.TCPInfo.BytesReceived / m.Data.TCPInfo.ElapsedTime) * 8); else if (m.Source === 'client' && m.Data?.MeanClientMbps) setUl(m.Data.MeanClientMbps); },
        uploadComplete: (d: any) => { const t = d?.LastServerMeasurement?.TCPInfo; if (t?.BytesReceived && t?.ElapsedTime) setUl((t.BytesReceived / t.ElapsedTime) * 8); },
        error: (e: any) => { failed = true; setError('The speed test could not connect. Check your internet connection, turn off VPN or ad-blockers for this page, and try again.' + (e ? ` (${String(e).slice(0, 80)})` : '')); setPhase('error'); },
      });
      if (!failed) setPhase('done');
    } catch (e: any) { setError(String(e?.message ?? e)); setPhase('error'); }
  };

  const busy = phase === 'locate' || phase === 'download' || phase === 'upload';
  const verdict = dl >= 100 ? 'Excellent — great for 4K streaming, gaming and big downloads.' : dl >= 25 ? 'Good — fine for HD/4K video, video calls and working from home.' : dl >= 10 ? 'OK — fine for HD video and calls, slow for big downloads.' : 'Slow — video may buffer; try moving closer to your Wi-Fi router.';
  return (
    <div>
      <div class="speed-gauges">
        <Gauge value={dl} label="Download" color="#4f46e5" />
        <Gauge value={ul} label="Upload" color="#16a34a" />
      </div>
      <div class="dt-results">
        <div><span>Download</span><b>{dl ? `${dl.toFixed(1)} Mbps` : '–'}</b></div>
        <div><span>Upload</span><b>{ul ? `${ul.toFixed(1)} Mbps` : '–'}</b></div>
        <div><span>Ping (latency)</span><b>{ping !== null ? `${Math.round(ping)} ms` : '–'}</b></div>
        <div><span>Test server</span><b style={{ fontSize: '1rem' }}>{server || '–'}</b><small>nearest M-Lab server</small></div>
      </div>
      {phase === 'done' && <div class="mic-verdict ok">{verdict}</div>}
      {busy && <p class="status">{phase === 'locate' ? 'Finding the nearest test server…' : phase === 'download' ? 'Testing download speed…' : 'Testing upload speed…'}</p>}
      {!busy && (
        <div class="dt-start">
          <label class="check" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', textAlign: 'left', maxWidth: '640px', margin: '0 auto 12px', fontSize: '.9rem' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree((e.target as HTMLInputElement).checked)} style={{ marginTop: '3px' }} />
            <span>The test is run by Measurement Lab (M-Lab), a non-profit. M-Lab publishes all test results, including your IP address, as open data for internet research. I agree to M-Lab's <a href="https://www.measurementlab.net/privacy/" target="_blank" rel="noopener">data policy</a>.</span>
          </label>
          <button type="button" class="btn btn-primary btn-lg" disabled={!agree} onClick={run}>{phase === 'done' || phase === 'error' ? 'Test again' : 'Start speed test'}</button>
        </div>
      )}
      {error && <div class="error" role="alert">{error}</div>}
    </div>
  );
}
