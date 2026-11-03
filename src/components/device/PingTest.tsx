import { useRef, useState } from 'preact/hooks';

type Target = { id: string; name: string; url: string };
const TARGETS: Target[] = [
  { id: 'cf', name: 'Cloudflare (nearest city)', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/generate_204' },
  { id: 'site', name: 'ZentaPDF server', url: '/api/ping.php' },
];
type Res = { samples: (number | null)[]; done: boolean };
const COUNT = 20;

async function once(url: string, timeout = 3000): Promise<number | null> {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), timeout);
  const u = url + (url.includes('?') ? '&' : '?') + 'z=' + Math.random().toString(36).slice(2);
  const t0 = performance.now();
  try { await fetch(u, { mode: url.startsWith('/') ? 'same-origin' : 'no-cors', cache: 'no-store', signal: ctl.signal, credentials: 'omit' }); return performance.now() - t0; }
  catch { return null; } finally { clearTimeout(to); }
}
const stats = (s: (number | null)[]) => {
  const ok = s.filter((x): x is number => x !== null); if (!ok.length) return null;
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  let j = 0; for (let i = 1; i < ok.length; i++) j += Math.abs(ok[i] - ok[i - 1]);
  return { min: Math.min(...ok), max: Math.max(...ok), avg, jitter: ok.length > 1 ? j / (ok.length - 1) : 0, loss: ((s.length - ok.length) / s.length) * 100 };
};
const grade = (avg: number, jit: number) => (avg < 30 && jit < 5 ? ['Excellent', 'great for competitive gaming'] : avg < 60 && jit < 15 ? ['Good', 'fine for gaming and video calls'] : avg < 120 && jit < 30 ? ['OK', 'fine for calls; games may feel a little slow'] : ['Poor', 'calls may break up and games will lag']);

export default function PingTest() {
  const [res, setRes] = useState<Record<string, Res>>({});
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const run = async () => {
    setRunning(true); stopRef.current = false; const init: Record<string, Res> = {}; TARGETS.forEach((t) => (init[t.id] = { samples: [], done: false })); setRes(init);
    for (const t of TARGETS) {
      await once(t.url, 4000); // warm-up: DNS + secure connection
      const s: (number | null)[] = [];
      for (let i = 0; i < COUNT && !stopRef.current; i++) {
        s.push(await once(t.url)); setRes((r) => ({ ...r, [t.id]: { samples: s.slice(), done: false } }));
        await new Promise((r) => setTimeout(r, 120));
      }
      setRes((r) => ({ ...r, [t.id]: { samples: s.slice(), done: true } }));
    }
    setRunning(false);
  };

  const main = stats(res.cf?.samples ?? []) ?? stats(res.google?.samples ?? []);
  return (
    <div>
      <div class="dt-start" style={{ paddingTop: '10px' }}>
        <button type="button" class="btn btn-primary btn-lg" disabled={running} onClick={run}>{running ? 'Testing…' : Object.keys(res).length ? 'Test again' : 'Start ping test'}</button>
        {running && <button type="button" class="btn btn-ghost" style={{ marginLeft: '8px' }} onClick={() => (stopRef.current = true)}>Stop</button>}
      </div>
      {main && <div class={'mic-verdict' + (main.avg < 120 ? ' ok' : '')}>{grade(main.avg, main.jitter)[0]} — {grade(main.avg, main.jitter)[1]}</div>}
      <div class="ping-list">
        {TARGETS.map((t) => { const r = res[t.id]; const st = r && stats(r.samples); const mx = Math.max(100, ...(r?.samples.filter((x): x is number => x !== null) ?? [0]));
          return (
            <div class="ping-card" key={t.id}>
              <div class="ping-head"><strong>{t.name}</strong>{r && !r.done && <span class="status">measuring {r.samples.length}/{COUNT}…</span>}</div>
              <div class="ping-bars">{Array.from({ length: COUNT }, (_, i) => { const v = r?.samples[i]; return <span title={v == null ? (i < (r?.samples.length ?? 0) ? 'lost' : '') : `${Math.round(v)} ms`} class={v === null ? 'lost' : ''} style={{ height: v == null ? (i < (r?.samples.length ?? 0) ? '100%' : '3%') : Math.max(4, (v / mx) * 100) + '%' }} />; })}</div>
              <div class="dt-results" style={{ margin: '8px 0 0' }}>
                <div><span>Ping</span><b>{st ? `${Math.round(st.avg)} ms` : '–'}</b><small>{st ? `min ${Math.round(st.min)} · max ${Math.round(st.max)}` : ''}</small></div>
                <div><span>Jitter</span><b>{st ? `${st.jitter.toFixed(1)} ms` : '–'}</b></div>
                <div><span>Packet loss</span><b>{st ? `${Math.round(st.loss)}%` : '–'}</b></div>
              </div>
            </div>
          ); })}
      </div>
      <p class="status" style={{ textAlign: 'left' }}>Browsers can't send real "ping" (ICMP) packets, so this test measures the round-trip time of tiny web requests over an already-open connection — very close to what games and video calls experience.</p>
    </div>
  );
}
