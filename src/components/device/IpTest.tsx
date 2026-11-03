import { useEffect, useState } from 'preact/hooks';

type Info = { ip?: string; version?: number; host?: string | null; v4?: string; v6?: string; country?: string; colo?: string; err?: string };
const parseTrace = (t: string) => Object.fromEntries(t.trim().split('\n').map((l) => l.split('=')));
const NAMES = typeof Intl !== 'undefined' && (Intl as any).DisplayNames ? new (Intl as any).DisplayNames(['en'], { type: 'region' }) : null;

export default function IpTest() {
  const [info, setInfo] = useState<Info>({});
  const [copied, setCopied] = useState('');
  const load = async () => {
    setInfo({});
    const out: Info = {};
    try { const r = await fetch('/api/ip.php?host=1', { cache: 'no-store' }); const j = await r.json(); Object.assign(out, { ip: j.ip, version: j.version, host: j.host && j.host !== j.ip ? j.host : null }); } catch { /* fall back below */ }
    const trace = async (u: string) => { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000); const r = await fetch(u, { cache: 'no-store', signal: c.signal }); clearTimeout(t); return parseTrace(await r.text()); } catch { return null; } };
    const [a, b] = await Promise.all([trace('https://1.1.1.1/cdn-cgi/trace'), trace('https://[2606:4700:4700::1111]/cdn-cgi/trace')]);
    if (a?.ip) { out.v4 = a.ip; out.country = a.loc; out.colo = a.colo; }
    if (b?.ip && b.ip.includes(':')) { out.v6 = b.ip; out.country ??= b.loc; }
    if (!out.ip) out.ip = out.v4 ?? out.v6;
    if (!out.ip) out.err = 'Your IP address could not be found. Check your internet connection or turn off blocking extensions and try again.';
    setInfo(out);
  };
  useEffect(() => { load(); }, []);
  const copy = (v: string) => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(''), 1500); };
  const country = info.country && info.country !== 'XX' ? `${NAMES?.of(info.country) ?? info.country} ${info.country.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))}` : '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div>
      <div class="ip-big">
        <span>Your public IP address</span>
        <b>{info.ip ?? (info.err ? '—' : 'Finding…')}</b>
        {info.ip && <button type="button" class="btn btn-ghost" onClick={() => copy(info.ip!)}>{copied === info.ip ? '✓ Copied' : 'Copy'}</button>}
      </div>
      {info.err && <div class="error" role="alert">{info.err}</div>}
      <div class="dt-results">
        <div><span>IPv4</span><b style={{ fontSize: '1.05rem' }}>{info.v4 ?? (info.version === 4 ? info.ip : 'not detected')}</b></div>
        <div><span>IPv6</span><b style={{ fontSize: '1.05rem', wordBreak: 'break-all' }}>{info.v6 ?? (info.version === 6 ? info.ip : 'not available')}</b><small>{info.v6 || info.version === 6 ? 'your connection supports IPv6' : 'your network uses IPv4 only'}</small></div>
        <div><span>Country (approx.)</span><b style={{ fontSize: '1.05rem' }}>{country || '–'}</b><small>from your internet provider</small></div>
        <div><span>Host name</span><b style={{ fontSize: '.95rem', wordBreak: 'break-all' }}>{info.host || '–'}</b></div>
        <div><span>Time zone</span><b style={{ fontSize: '1.05rem' }}>{tz}</b><small>set on this device</small></div>
        <div><span>Browser language</span><b style={{ fontSize: '1.05rem' }}>{navigator.language}</b></div>
      </div>
      <div class="actions" style={{ justifyContent: 'flex-start' }}><button type="button" class="btn btn-ghost" onClick={load}>Refresh</button></div>
      <p class="status" style={{ textAlign: 'left' }}>Using a VPN or proxy? You will see the VPN's address and country instead of your own — that is how you can check that a VPN works.</p>
    </div>
  );
}
