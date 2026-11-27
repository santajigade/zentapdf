import { useEffect, useState } from 'preact/hooks';

type B = { level: number; charging: boolean; chargingTime: number; dischargingTime: number };
const fmt = (s: number) => (!isFinite(s) || s <= 0 ? '–' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

export default function BatteryTest() {
  const [b, setB] = useState<B | null>(null);
  const [state, setState] = useState<'wait' | 'ok' | 'none'>('wait');
  const [log, setLog] = useState<{ t: number; level: number }[]>([]);
  useEffect(() => {
    const nav: any = navigator; if (!nav.getBattery) { setState('none'); return; }
    let bat: any; const upd = () => { const v = { level: bat.level, charging: bat.charging, chargingTime: bat.chargingTime, dischargingTime: bat.dischargingTime }; setB(v); setLog((l) => (l.length && l[l.length - 1].level === v.level ? l : [...l, { t: Date.now(), level: v.level }].slice(-50))); };
    nav.getBattery().then((x: any) => { bat = x; upd(); setState('ok'); ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => bat.addEventListener(e, upd)); }).catch(() => setState('none'));
    return () => { if (bat) ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => bat.removeEventListener(e, upd)); };
  }, []);
  if (state === 'wait') return <p class="status">Reading battery…</p>;
  if (state === 'none') return (
    <div class="note-box note-sky">Your browser does not share battery information (Firefox and Safari, including all iPhone browsers, don't allow it). Open this page in <b>Chrome</b> or <b>Edge</b> on a laptop or Android phone, or use the battery health steps below for your device.</div>
  );
  const pct = Math.round((b!.level) * 100);
  const desktop = b!.charging && pct === 100 && b!.chargingTime === 0 && !isFinite(b!.dischargingTime);
  const col = pct > 50 ? '#16a34a' : pct > 20 ? '#f59e0b' : '#dc2626';
  return (
    <div>
      <div class="bat-wrap"><div class="bat"><div style={{ width: pct + '%', background: col }} /><b>{pct}%</b></div><div class="bat-tip" /></div>
      <p class="status">{desktop ? 'Plugged in, no battery detected, this may be a desktop computer.' : b!.charging ? '⚡ Charging' : 'On battery'}</p>
      <div class="dt-results">
        <div><span>Battery level</span><b>{pct}%</b></div>
        <div><span>Status</span><b style={{ fontSize: '1.05rem' }}>{b!.charging ? 'Charging' : 'Discharging'}</b></div>
        <div><span>{b!.charging ? 'Full in' : 'Time left'}</span><b style={{ fontSize: '1.05rem' }}>{b!.charging ? (b!.chargingTime === 0 ? 'Full' : fmt(b!.chargingTime)) : fmt(b!.dischargingTime)}</b><small>estimate by your device</small></div>
      </div>
      {log.length > 1 && <p class="status" style={{ textAlign: 'left' }}>Level changes this session: {log.map((l) => Math.round(l.level * 100) + '%').join(' → ')}</p>}
      <p class="status" style={{ textAlign: 'left' }}>Websites can see the charge level and charging state, but not the battery's health (wear). See below how to check battery health on Windows, Mac, Android and iPhone.</p>
    </div>
  );
}
