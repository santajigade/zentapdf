// Demo scenes for the tool card. Each gets the time inside its 4.2 s cycle (tl) and the cycle number (ci).
// Scene area: 912 × 650 px.
const sg = (t, a, b) => window.seg(t, a, b);
const lerp = (a, b, k) => a + (b - a) * k;
const fmt = (n, d = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const sizeTxt = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : (kb >= 100 ? Math.round(kb) : kb.toFixed(1)) + ' KB');
const spinner = (tl, label, x = 0) => `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;border-radius:999px;padding:22px 36px;display:flex;gap:18px;align-items:center;font-weight:800;font-size:32px;color:var(--ac);box-shadow:0 24px 50px -20px var(--ac);white-space:nowrap;opacity:${x}"><div class="spin" style="transform:rotate(${tl * 720}deg)"></div>${label}</div>`;
const btn = (label, on, extra = '') => `<div style="display:inline-flex;align-items:center;gap:14px;background:${on ? 'var(--ac)' : 'color-mix(in srgb,var(--ac) 85%,#fff)'};color:#fff;font-weight:800;font-size:32px;padding:20px 38px;border-radius:18px;box-shadow:0 16px 30px -14px var(--ac);transform:scale(${on ? 0.97 : 1});${extra}">${label}</div>`;
const dlIcon = (tl) => `<svg width="34" height="34" viewBox="0 0 24 24" style="transform:translateY(${Math.sin(tl * 8) * 3}px)"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 20h16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const fileIcon = (txt, col) => `<div class="fi" style="background:${col}">${txt}</div>`;
const toast = (txt, a) => `<div style="position:absolute;left:50%;bottom:6px;transform:translate(-50%,${(1 - a) * 30}px);opacity:${a};background:var(--ink);color:#fff;font-weight:700;font-size:30px;padding:16px 30px;border-radius:16px;white-space:nowrap">${txt}</div>`;

// little illustrations (no real photos)
function photo(v, w, h) {
  const P = [['#fde68a', '#fb923c', '#7c2d12', '#c2410c'], ['#bae6fd', '#38bdf8', '#0c4a6e', '#0369a1'], ['#bbf7d0', '#4ade80', '#14532d', '#15803d'], ['#fbcfe8', '#f472b6', '#831843', '#be185d'], ['#ddd6fe', '#a78bfa', '#3b0764', '#6d28d9']][v % 5];
  return `<svg width="${w}" height="${h}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style="display:block">
    <defs><linearGradient id="g${v}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P[0]}"/><stop offset="1" stop-color="${P[1]}"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#g${v})"/><circle cx="${280 - v * 30}" cy="${90 + v * 8}" r="38" fill="#fff" opacity=".85"/>
    <path d="M0 230 L90 140 L160 200 L240 110 L320 190 L400 150 V300 H0Z" fill="${P[3]}"/><path d="M0 260 L120 200 L210 250 L300 210 L400 240 V300 H0Z" fill="${P[2]}"/></svg>`;
}
function docPage(w, h, title, opts = {}) {
  const lines = (n, wd = [92, 86, 95, 70]) => Array.from({ length: n }, (_, i) => `<div style="height:${h * 0.016}px;width:${wd[i % wd.length]}%;background:#e2e8f0;border-radius:4px;margin:${h * 0.014}px 0"></div>`).join('');
  const rows = opts.rows ?? [['Flow meter', '12,500'], ['Level switch', '9,400'], ['Transmitter', '18,900']];
  const fs = h * 0.026;
  return `<div style="padding:${h * 0.06}px ${w * 0.08}px;font-family:Arial,'Liberation Sans',sans-serif;color:#111">
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;font-size:${h * 0.042}px;color:${opts.hc ?? '#1f4e79'}">${title}</div><div style="width:${w * 0.12}px;height:${w * 0.12}px;border-radius:8px;background:${opts.hc ?? '#1f4e79'};opacity:.85"></div></div>
    ${lines(3)}
    <table style="width:100%;border-collapse:collapse;margin-top:${h * 0.03}px;font-size:${fs}px">
      <tr><td style="background:${opts.hc ?? '#1f4e79'};color:#fff;font-weight:700;padding:${fs * 0.5}px">${opts.cols?.[0] ?? 'Item'}</td><td style="background:${opts.hc ?? '#1f4e79'};color:#fff;font-weight:700;padding:${fs * 0.5}px;text-align:right">${opts.cols?.[1] ?? 'Price (₹)'}</td></tr>
      ${rows.map((r, i) => `<tr><td style="border-bottom:1px solid #cbd5e1;padding:${fs * 0.5}px">${r[0]}</td><td style="border-bottom:1px solid #cbd5e1;padding:${fs * 0.5}px;text-align:right">${i === 0 && opts.edit != null ? opts.edit : r[1]}</td></tr>`).join('')}
    </table>
    ${lines(4)}
    ${opts.sig ?? ''}
  </div>`;
}

const SCENES = {
  pdf2word(tl, ci) {
    const name = ['Quotation', 'Offer letter', 'Datasheet'][ci];
    const rows = [[['Flow meter', '12,500'], ['Level switch', '9,400'], ['Transmitter', '18,900']], [['Basic pay', '45,000'], ['HRA', '18,000'], ['Allowance', '6,500']], [['Range', '0.5 to 50'], ['Accuracy', '± 1 %'], ['Pressure', '16 bar']]][ci];
    const cols = [['Item', 'Price (₹)'], ['Salary', 'Monthly (₹)'], ['Spec', 'Value']][ci];
    const newv = ['11,900', '48,000', '0.2 to 60'][ci];
    const word = tl >= 1.75;
    const flip = tl < 1.5 ? 1 : tl < 1.75 ? 1 - sg(tl, 1.5, 1.75) : sg(tl, 1.75, 2.0);
    const slide = (1 - sg(tl, 0, 0.5)) * 500;
    let edit = null;
    if (word && tl >= 2.3) {
      if (tl < 2.6) edit = `<span style="background:#93c5fd">${rows[0][1]}</span>`;
      else { const n = Math.min(newv.length, Math.floor((tl - 2.6) / 0.11) + 1); edit = newv.slice(0, n) + (tl < 3.5 && Math.floor(tl * 4) % 2 === 0 ? '<span style="border-left:2px solid #111;margin-left:1px"></span>' : ''); }
    }
    const W = 580, H = 640;
    const page = `<div class="doc" style="left:${166 + slide}px;top:0;width:${W}px;height:${H}px;transform:scaleX(${Math.max(0.001, flip)})">
      ${word ? `<div style="height:44px;background:#2b579a;display:flex;gap:10px;align-items:center;padding:0 16px">${'<div style="width:60px;height:12px;border-radius:6px;background:rgb(255 255 255 / .5)"></div>'.repeat(4)}</div>` : ''}
      ${docPage(W, H - (word ? 44 : 0), name, { rows, edit, cols, hc: '#1f4e79' })}
      <div class="bdg" style="right:14px;bottom:14px;background:${word ? '#2b579a' : '#e5484d'}">${word ? 'W .docx' : 'PDF'}</div></div>`;
    const spin = tl >= 0.6 && tl < 1.75 ? spinner(tl, 'Converting to Word…', Math.min(sg(tl, 0.6, 0.8), 1 - sg(tl, 1.55, 1.75))) : '';
    const done = tl >= 3.5 ? toast(`✓ ${name}.docx ready to edit`, sg(tl, 3.5, 3.8)) : '';
    return page + spin + done;
  },

  pdf2excel(tl, ci) {
    const D = [
      { name: 'Quotation', h: ['Item', 'Qty', 'Rate', 'Amount'], r: [['Flow meter', 2, 12500], ['Level switch', 4, 9400], ['Transmitter', 5, 18900], ['PT100 sensor', 10, 3250]] },
      { name: 'Price list', h: ['Model', 'Qty', 'Price', 'Total'], r: [['KDF-9291', 1, 14200], ['NEK-1100', 3, 8600], ['SEN-8600', 2, 21400], ['DPM-1500', 6, 4100]] },
      { name: 'Statement', h: ['Date', 'No.', 'Credit', 'Amount'], r: [['01 Oct', 1, 25000], ['09 Oct', 2, 18250], ['17 Oct', 1, 42000], ['28 Oct', 3, 9600]] },
    ][ci];
    const rows = D.r.map((r) => [r[0], r[1], r[2], r[1] * r[2]]);
    const total = rows.reduce((a, r) => a + r[3], 0);
    const xl = tl >= 1.6; const flip = tl < 1.35 ? 1 : tl < 1.6 ? 1 - sg(tl, 1.35, 1.6) : sg(tl, 1.6, 1.85);
    const W = 912;
    if (!xl) {
      const slide = (1 - sg(tl, 0, 0.5)) * 600;
      return `<div class="doc" style="left:${106 + slide}px;top:40px;width:700px;height:560px;transform:scaleX(${Math.max(.001, flip)})">${docPage(700, 560, D.name, { rows: D.r.map((r) => [r[0], fmt(r[2])]) })}<div class="bdg" style="right:14px;bottom:14px;background:#e5484d">PDF</div></div>` + (tl >= 0.6 ? spinner(tl, 'Converting to Excel…', Math.min(sg(tl, 0.6, 0.8), 1 - sg(tl, 1.15, 1.35))) : '');
    }
    const shown = Math.floor(sg(tl, 1.9, 2.6) * (rows.length + 2) + 0.001);
    const sel = tl >= 2.8; const selN = sel ? Math.min(4, Math.floor((tl - 2.8) / 0.1) + 1) : 0;
    const cols = [56, 300, 120, 190, 246];
    const cell = (v, st = '') => `<div style="height:62px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:0 14px;display:flex;align-items:center;font-size:27px;white-space:nowrap;${st}">${v}</div>`;
    let g = '';
    g += cell('', 'background:#f1f5f9;height:40px') + ['A', 'B', 'C', 'D'].map((c) => cell(c, 'background:#f1f5f9;height:40px;justify-content:center;color:#64748b;font-size:22px')).join('');
    const all = [['h', ...D.h], ...rows.map((r) => ['r', r[0], r[1], fmt(r[2]), fmt(r[3])]), ['t', 'Total', '', '', fmt(total)]];
    all.forEach((r, i) => {
      const vis = i < shown;
      g += cell(i + 1, 'background:#f1f5f9;justify-content:center;color:#64748b;font-size:22px');
      for (let c = 1; c <= 4; c++) {
        let st = r[0] === 'h' ? 'background:#1f4e79;color:#fff;font-weight:700;' : r[0] === 't' ? 'background:#fff2cc;font-weight:700;' : '';
        if (c > 1) st += 'justify-content:flex-end;';
        if (r[0] === 'r' && c === 4 && i <= selN) st += 'background:#bbf7d0;box-shadow:inset 0 0 0 3px #107c41;';
        g += cell(vis ? r[c] : '', vis ? st : '');
      }
    });
    const sumA = sg(tl, 3.2, 3.45);
    return `<div class="doc" style="left:0;top:20px;width:${W}px;transform:scaleX(${Math.max(.001, flip)})">
      <div style="height:58px;background:#107c41;color:#fff;display:flex;align-items:center;gap:14px;padding:0 20px;font-weight:800;font-size:28px"><span style="background:#fff;color:#107c41;border-radius:8px;width:38px;height:38px;display:grid;place-items:center">X</span>${D.name}.xlsx</div>
      <div style="display:grid;grid-template-columns:${cols.join('px ')}px;font-family:Arial,'Liberation Sans',sans-serif;color:#111">${g}</div>
      <div style="height:52px;background:#f8fafc;display:flex;justify-content:flex-end;align-items:center;gap:30px;padding:0 22px;font-size:26px;color:#334155"><span style="opacity:${sumA}">Count: 4</span><span style="opacity:${sumA};font-weight:800;color:#107c41">Sum: ${fmt(rows.reduce((a, r) => a + r[3], 0))}</span></div></div>`;
  },

  compress(tl, ci) {
    const D = [['Brochure.pdf', 20.0 * 1024, 523], ['Scanned invoices.pdf', 8.4 * 1024, 1.2 * 1024], ['Project report.pdf', 3.6 * 1024, 690]][ci];
    const k = sg(tl, 0.9, 2.4);
    const cur = lerp(D[1], D[2], k);
    const pct = Math.round((1 - D[2] / D[1]) * 100);
    const a = sg(tl, 0, 0.4);
    const levels = ['Less', 'Recommended', 'Extreme'];
    return `<div style="opacity:${a};transform:translateY(${(1 - a) * 40}px)">
      <div class="file">${fileIcon('PDF', '#e5484d')}<div style="flex:1"><div class="fn">${D[0]}</div><div class="fs">${tl < 2.4 ? 'Original size' : 'Compressed'}</div></div>
        ${tl >= 2.4 ? `<div style="background:#dcfce7;color:#166534;font-weight:900;font-size:34px;padding:10px 20px;border-radius:14px;transform:scale(${0.6 + 0.4 * sg(tl, 2.4, 2.6)})">-${pct}%</div>` : ''}</div>
      <div style="margin-top:44px;text-align:center;font-weight:900;font-size:120px;letter-spacing:-.03em;color:${tl >= 2.4 ? 'var(--ac)' : 'var(--ink)'}" class="num">${sizeTxt(cur)}</div>
      <div style="margin:26px 30px 0;height:30px;border-radius:999px;background:#f1f5f9;overflow:hidden"><div style="height:100%;width:${Math.max(3, (cur / D[1]) * 100)}%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:999px"></div></div>
      <div style="display:flex;justify-content:space-between;margin:12px 34px 0;font-size:24px;color:#64748b"><span>0</span><span>${sizeTxt(D[1])}</span></div>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:46px">${levels.map((l, i) => `<div style="padding:14px 26px;border-radius:14px;font-weight:700;font-size:28px;border:2px solid ${i === 1 ? 'var(--ac)' : '#e2e8f0'};color:${i === 1 ? 'var(--ac)' : '#475569'};background:${i === 1 ? 'color-mix(in srgb,var(--ac) 8%,#fff)' : '#fff'}">${l}</div>`).join('')}</div>
      <div style="text-align:center;margin-top:44px">${tl < 2.4 ? btn('Compress PDF', tl > 0.6 && tl < 0.9) : btn(dlIcon(tl) + 'Download PDF', false)}</div></div>`;
  },

  merge(tl, ci) {
    const F = [[['Invoice.pdf', 2, '#e5484d'], ['Photos.pdf', 3, '#f59e0b'], ['Report.pdf', 5, '#3b82f6']], [['Cover.pdf', 1, '#8b5cf6'], ['Chapter 1.pdf', 6, '#10b981'], ['Chapter 2.pdf', 4, '#ec4899']], [['Form.pdf', 2, '#0ea5e9'], ['ID proof.pdf', 1, '#f97316'], ['Marksheet.pdf', 2, '#22c55e']]][ci];
    const total = F.reduce((a, f) => a + f[1], 0);
    // order swap: tile 2 and 3 swap places between 0.5 and 1.2
    const sw = sg(tl, 0.5, 1.1);
    const pos = [0, 1 + sw, 2 - sw];
    const gather = sg(tl, 1.5, 2.3);
    const done = tl >= 2.3;
    let html = '';
    if (!done) {
      F.forEach((f, i) => {
        const x0 = 20 + pos[i] * 300, y0 = 60;
        const x = lerp(x0, 306, gather), y = lerp(y0, 110, gather);
        const lift = i === 2 && tl > 0.5 && tl < 1.1 ? -30 : 0;
        html += `<div style="position:absolute;left:${x}px;top:${y + lift}px;width:260px;opacity:${1 - gather * 0.6};transform:rotate(${(i - 1) * 4 * (1 - gather)}deg)">
          <div style="height:310px;border-radius:18px;background:#fff;box-shadow:0 20px 40px -20px rgb(0 0 0 / .4),0 0 0 1px rgb(0 0 0 / .06);overflow:hidden;position:relative">
            <div style="height:70px;background:${f[2]}"></div><div style="padding:18px">${'<div style="height:12px;background:#e2e8f0;border-radius:6px;margin:12px 0"></div>'.repeat(6)}</div>
            <div class="bdg" style="left:12px;top:14px;background:rgb(0 0 0 / .25)">${f[1]} p</div></div>
          <div style="font-weight:700;font-size:26px;color:var(--ink);margin-top:14px;text-align:center">${f[0]}</div></div>`;
      });
      if (tl > 0.5 && tl < 1.3) html += `<div style="position:absolute;left:0;right:0;top:470px;text-align:center;font-size:28px;color:#64748b;font-weight:600;opacity:${Math.min(sg(tl, .5, .7), 1 - sg(tl, 1.1, 1.3))}">Drag to change the order</div>`;
      html += `<div style="position:absolute;left:0;right:0;top:520px;text-align:center;opacity:${1 - gather}">${btn('Merge PDF', tl > 1.25 && tl < 1.5)}</div>`;
    } else {
      const a = sg(tl, 2.3, 2.7);
      html += `<div style="position:absolute;left:306px;top:${70}px;width:300px;transform:scale(${0.85 + 0.15 * a})">
        ${[2, 1, 0].map((k) => `<div style="position:absolute;left:${k * 16}px;top:${k * 16}px;width:268px;height:340px;border-radius:18px;background:#fff;box-shadow:0 20px 40px -20px rgb(0 0 0 / .4),0 0 0 1px rgb(0 0 0 / .06);overflow:hidden"><div style="height:70px;background:${F[2 - k][2]}"></div></div>`).join('')}
        <div class="bdg" style="left:60px;top:150px;background:var(--ac);font-size:30px">${total} pages</div></div>
        <div style="position:absolute;left:0;right:0;top:450px;text-align:center;font-weight:800;font-size:40px;color:var(--ink);opacity:${a}">Merged.pdf</div>
        <div style="position:absolute;left:0;right:0;top:520px;text-align:center;opacity:${a}">${btn(dlIcon(tl) + 'Download PDF', false)}</div>`;
    }
    return html;
  },

  jpg2pdf(tl, ci) {
    const base = ci * 2;
    const fly = sg(tl, 1.1, 2.1);
    let html = '';
    for (let i = 0; i < 3; i++) {
      const a = sg(tl, 0.1 + i * 0.15, 0.45 + i * 0.15);
      const x0 = 20 + i * 300, y0 = 20;
      const x1 = 60 + i * 280 + 40, y1 = 340;
      const x = lerp(x0, x1, fly), y = lerp(y0, y1, fly), s = lerp(1, 0.72, fly);
      if (fly < 1) html += `<div style="position:absolute;left:${x}px;top:${y}px;width:270px;height:200px;border-radius:16px;overflow:hidden;opacity:${a * (1 - sg(tl, 1.9, 2.1))};transform:scale(${s}) rotate(${(i - 1) * 3}deg);transform-origin:0 0;box-shadow:0 16px 30px -16px rgb(0 0 0 / .5)">${photo(base + i, 270, 200)}</div>`;
      if (fly < 1) html += `<div style="position:absolute;left:${x0}px;top:${y0 + 210}px;width:270px;text-align:center;font-size:24px;color:#475569;opacity:${a * (1 - fly)}">IMG_${2041 + i + ci * 3}.jpg</div>`;
    }
    // A4 pages appear
    const pa = sg(tl, 1.8, 2.3);
    for (let i = 0; i < 3; i++) {
      html += `<div style="position:absolute;left:${30 + i * 290}px;top:${tl < 1.8 ? 140 : 110}px;width:270px;height:382px;background:#fff;border-radius:10px;box-shadow:0 20px 40px -22px rgb(0 0 0 / .5),0 0 0 1px rgb(0 0 0 / .06);opacity:${pa};padding:22px;display:flex;align-items:center">
        <div style="width:100%;height:170px;border-radius:6px;overflow:hidden">${photo(base + i, 226, 170)}</div>
        <div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:20px;color:#94a3b8">${i + 1}</div></div>`;
    }
    if (tl < 1.1) html += `<div style="position:absolute;left:0;right:0;top:420px;text-align:center">${btn('Convert to PDF', tl > 0.8)}</div>`;
    if (tl >= 2.6) html += toast(`✓ Photos.pdf · 3 pages · A4`, sg(tl, 2.6, 2.9));
    return html;
  },

  imgkb(tl, ci) {
    const target = [100, 50, 20][ci], fin = [98, 49, 19.6][ci], orig = [4.2, 3.1, 5.6][ci] * 1024;
    const k = sg(tl, 0.9, 2.4); const cur = lerp(orig, fin, k);
    const done = tl >= 2.4;
    const targets = [20, 50, 100, 200];
    return `<div style="position:absolute;left:136px;top:0;width:640px;height:400px;border-radius:22px;overflow:hidden;box-shadow:0 24px 50px -24px rgb(0 0 0 / .5)">${photo(ci + 1, 640, 400)}
        <div style="position:absolute;right:16px;top:16px;background:rgb(0 0 0 / .65);color:#fff;font-weight:800;font-size:40px;padding:10px 20px;border-radius:14px" class="num">${sizeTxt(cur)}</div>
        ${done ? `<div style="position:absolute;left:16px;bottom:16px;background:#16a34a;color:#fff;font-weight:800;font-size:30px;padding:10px 18px;border-radius:12px;transform:scale(${0.7 + 0.3 * sg(tl, 2.4, 2.6)})">✓ Under ${target} KB</div>` : ''}</div>
      <div style="position:absolute;left:0;right:0;top:430px;text-align:center;font-size:26px;color:#64748b;font-weight:700;letter-spacing:.06em">TARGET SIZE</div>
      <div style="position:absolute;left:0;right:0;top:476px;display:flex;gap:16px;justify-content:center">${targets.map((x) => `<div style="padding:14px 28px;border-radius:14px;font-weight:800;font-size:32px;border:2px solid ${x === target ? 'var(--ac)' : '#e2e8f0'};background:${x === target ? 'var(--ac)' : '#fff'};color:${x === target ? '#fff' : '#334155'}">${x} KB</div>`).join('')}</div>
      <div style="position:absolute;left:0;right:0;top:570px;text-align:center">${done ? btn(dlIcon(tl) + 'Download JPG', false) : btn('Compress', tl > 0.6 && tl < 0.9)}</div>`;
  },

  heic(tl, ci) {
    const n = [3, 4, 4][ci];
    let html = '';
    for (let i = 0; i < n; i++) {
      const a = sg(tl, i * 0.08, 0.3 + i * 0.08);
      const p = sg(tl, 0.7 + i * 0.3, 1.2 + i * 0.3);
      const name = `IMG_${4100 + ci * 10 + i}`;
      html += `<div class="file" style="margin-bottom:16px;padding:14px 20px;opacity:${a}">
        <div style="width:84px;height:84px;border-radius:12px;overflow:hidden;flex:none">${photo(i + ci, 84, 84)}</div>
        <div style="flex:1"><div class="fn" style="font-size:30px">${name}.${p >= 1 ? 'JPG' : 'HEIC'}</div>
          <div style="height:12px;border-radius:6px;background:#e2e8f0;margin-top:12px;overflow:hidden"><div style="height:100%;width:${p * 100}%;background:var(--ac)"></div></div></div>
        <div style="width:150px;text-align:right;font-weight:800;font-size:28px;${p >= 1 ? 'color:#16a34a' : 'color:#64748b'}">${p >= 1 ? '✓ Done' : p > 0 ? Math.round(p * 100) + '%' : '2.8 MB'}</div></div>`;
    }
    const allDone = tl >= 1.3 + n * 0.3;
    html = `<div style="height:${n > 4 ? 560 : 520}px;overflow:hidden">${html}</div>`;
    html += `<div style="position:absolute;left:0;right:0;top:${n > 4 ? 570 : 540}px;text-align:center;opacity:${allDone ? 1 : 0.35}">${btn((allDone ? dlIcon(tl) : '') + `Download all (ZIP)`, false)}</div>`;
    return html;
  },

  sign(tl, ci) {
    const mode = ['Draw', 'Type', 'Draw'][ci];
    const name = ['S. Kulkarni', 'Priya Sharma', 'A. Mehta'][ci];
    const draw = sg(tl, 0.4, 1.8);
    const path = ['M20 90 C 60 10, 90 120, 120 60 S 170 20, 190 80 S 250 100, 270 50 C 290 20, 300 90, 340 70 L 380 60', 'M20 70 C 50 20, 80 110, 120 70 S 180 40, 200 80 S 260 90, 300 60 L 380 55', 'M30 80 C 70 20, 100 110, 140 50 C 170 20, 190 100, 230 70 S 300 30, 330 80 L 380 70'][ci];
    const sigSvg = (w, h, frac) => mode === 'Draw'
      ? `<svg width="${w}" height="${h}" viewBox="0 0 400 130"><path d="${path}" fill="none" stroke="#1e3a8a" stroke-width="5" stroke-linecap="round" stroke-dasharray="1000" stroke-dashoffset="${1000 * (1 - frac)}"/></svg>`
      : `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;white-space:nowrap;font:italic ${h * 0.5}px 'DejaVu Serif',serif;color:#1e3a8a">${name.slice(0, Math.ceil(name.length * frac))}</div>`;
    const place = sg(tl, 2.1, 2.8);
    const padA = 1 - sg(tl, 2.0, 2.3);
    const docW = 560, docH = 600;
    const sigLine = `<div style="position:absolute;right:46px;bottom:60px;width:230px;border-top:2px solid #94a3b8;text-align:center;font-size:16px;color:#64748b;padding-top:6px">Signature</div>`;
    let html = `<div class="doc" style="left:176px;top:30px;width:${docW}px;height:${docH}px">${docPage(docW, docH, 'Agreement', { rows: [['Start date', '01 Dec'], ['Duration', '12 months'], ['Fee (₹)', '24,000']], cols: ['Term', 'Details'] })}${sigLine}
      ${tl >= 2.1 ? `<div style="position:absolute;right:${lerp(-60, 50, place)}px;bottom:${lerp(260, 70, place)}px;transform:scale(${lerp(1.4, 0.55, place)});transform-origin:100% 100%">${sigSvg(400, 130, 1)}</div>` : ''}</div>`;
    if (padA > 0) html += `<div style="position:absolute;left:96px;top:120px;width:720px;background:#fff;border-radius:24px;box-shadow:0 30px 60px -24px rgb(0 0 0 / .45);opacity:${padA};padding:22px">
      <div style="display:flex;gap:12px;margin-bottom:16px">${['Draw', 'Type', 'Upload'].map((m) => `<div style="padding:10px 22px;border-radius:12px;font-weight:800;font-size:26px;background:${m === mode ? 'var(--ac)' : '#f1f5f9'};color:${m === mode ? '#fff' : '#475569'}">${m}</div>`).join('')}</div>
      <div style="height:220px;border:2px dashed #cbd5e1;border-radius:16px;display:flex;align-items:center;justify-content:center">${sigSvg(560, 180, draw)}</div></div>`;
    if (tl >= 3.1) html += toast('✓ Signed. Download PDF', sg(tl, 3.1, 3.4));
    return html;
  },

  keyboard(tl, ci) {
    const words = ['HELLO', 'ZENTAPDF', 'QWERTY 2026'];
    const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const word = words[ci]; const per = 0.22;
    const typedN = Math.max(0, Math.min(word.length, Math.floor((tl - 0.4) / per) + 1));
    const cur = tl >= 0.4 && typedN <= word.length && (tl - 0.4) % per < per * 0.6 ? word[typedN - 1] : null;
    const done = new Set([...words.slice(0, ci).join(''), ...word.slice(0, typedN)].map((c) => (c === ' ' ? 'SPACE' : c)));
    const kw = 78;
    const key = (c, w = kw) => { const id = c === ' ' ? 'SPACE' : c; const on = cur === c; return `<div class="k ${on ? 'on' : done.has(id) ? 'done' : ''}" style="width:${w}px;margin:5px">${c === ' ' ? 'Space' : c}</div>`; };
    const off = [0, 20, 44, 80];
    const kb = rows.map((r, i) => `<div style="display:flex;margin-left:${off[i]}px">${[...r].map((c) => key(c)).join('')}</div>`).join('') + `<div style="display:flex;margin-left:200px">${key(' ', 420)}</div>`;
    const tested = done.size;
    return `<div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:18px;height:110px;display:flex;align-items:center;padding:0 26px;font-weight:800;font-size:52px;letter-spacing:.1em;color:var(--ink)" class="mono">${word.slice(0, typedN)}<span style="width:4px;height:56px;background:var(--ac);margin-left:4px;opacity:${Math.floor(tl * 3) % 2 ? 1 : 0}"></span></div>
      <div style="margin-top:34px;padding:16px;background:#fff;border-radius:22px;box-shadow:0 0 0 2px #e2e8f0">${kb}</div>
      <div style="display:flex;justify-content:space-between;margin-top:28px;font-size:30px;font-weight:700;color:#334155"><span>Keys tested: <span style="color:var(--ac)">${tested}</span></span><span class="ok">● Working</span></div>`;
  },

  speed(tl, ci) {
    const D = [[94.6, 38.2, 12, 'Home Wi-Fi'], [212.4, 96.8, 8, 'Office fibre'], [48.3, 21.5, 19, 'Mobile hotspot']][ci];
    const dl = tl < 0.5 ? 0 : tl < 2.0 ? D[0] * sg(tl, 0.5, 1.8) * (1 + 0.04 * Math.sin(tl * 25)) : D[0];
    const ul = tl < 2.2 ? 0 : tl < 3.4 ? D[1] * sg(tl, 2.2, 3.2) * (1 + 0.05 * Math.sin(tl * 23)) : D[1];
    const phase = tl < 2.1 ? 'Download' : 'Upload';
    const v = tl < 2.1 ? dl : tl < 2.2 ? 0 : ul;
    const max = D[0] > 150 ? 300 : 150;
    const ang = -120 + 240 * Math.min(1, v / max);
    const R = 180, cx = 456, cy = 205;
    const arc = (a0, a1, col, w) => { const p = (a) => [cx + R * Math.sin(a * Math.PI / 180), cy - R * Math.cos(a * Math.PI / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`; };
    const tile = (lbl, val, unit, on) => `<div style="flex:1;background:${on ? 'color-mix(in srgb,var(--ac) 8%,#fff)' : '#f8fafc'};border:2px solid ${on ? 'var(--ac)' : '#e2e8f0'};border-radius:18px;padding:18px;text-align:center"><div style="font-size:24px;color:#64748b;font-weight:700">${lbl}</div><div style="font-size:44px;font-weight:900;color:var(--ink);margin-top:4px">${val}<span style="font-size:24px;color:#64748b;font-weight:700"> ${unit}</span></div></div>`;
    return `<svg width="912" height="400" style="position:absolute;left:0;top:0">${arc(-120, 120, '#e2e8f0', 30)}${v > 0.1 ? arc(-120, ang, 'url(#sg)', 30) : ''}
        <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="var(--ac2)"/><stop offset="1" stop-color="var(--ac)"/></linearGradient></defs>
        <line x1="${cx}" y1="${cy}" x2="${cx + (R - 50) * Math.sin(ang * Math.PI / 180)}" y2="${cy - (R - 50) * Math.cos(ang * Math.PI / 180)}" stroke="var(--ink)" stroke-width="8" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="16" fill="var(--ink)"/></svg>
      <div style="position:absolute;left:0;right:0;top:300px;text-align:center"><div style="font-size:84px;font-weight:900;color:var(--ink);letter-spacing:-.02em">${v.toFixed(1)}<span style="font-size:34px;color:#64748b"> Mbps</span></div><div style="font-size:28px;font-weight:700;color:var(--ac)">${phase} · ${D[3]}</div></div>
      <div style="position:absolute;left:0;right:0;top:500px;display:flex;gap:18px">${tile('Download', dl ? dl.toFixed(1) : '…', 'Mbps', tl < 2.1)}${tile('Upload', ul ? ul.toFixed(1) : '…', 'Mbps', tl >= 2.1 && tl < 3.4)}${tile('Ping', tl > 0.3 ? D[2] : '…', 'ms', false)}</div>`;
  },
};
// sound cues inside each 4.2 s cycle: pops (taps), ticks (typing), ding (result)
const SOUND = {
  pdf2word: { pop: [0.1, 1.75], tick: [2.6, 2.71, 2.82, 2.93, 3.04, 3.15], ding: [3.5] },
  pdf2excel: { pop: [0.1, 1.6, 2.0, 2.2, 2.4], tick: [2.8, 2.9, 3.0, 3.1], ding: [3.2] },
  compress: { pop: [0.1, 0.65], ding: [2.4] },
  merge: { pop: [0.1, 0.5, 1.3], ding: [2.4] },
  jpg2pdf: { pop: [0.1, 0.25, 0.4, 0.85], ding: [2.6] },
  imgkb: { pop: [0.1, 0.65], ding: [2.4] },
  heic: { pop: [0.0, 0.1, 0.2, 0.3], ding: [2.6] },
  sign: { pop: [0.1, 2.1], tick: [0.5, 0.7, 0.9, 1.1, 1.3, 1.5], ding: [3.1] },
  keyboard: { tick: Array.from({ length: 11 }, (_, i) => 0.4 + i * 0.22), ding: [3.4] },
  speed: { pop: [0.3, 2.2], ding: [2.0, 3.4] },
};
window.SCENES = SCENES; window.SOUND = SOUND;
