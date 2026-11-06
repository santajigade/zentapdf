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

// ===== Batch 2 scenes =====
const lockSvg = (sz, open, col = 'var(--ac)') => `<svg width="${sz}" height="${sz * 1.15}" viewBox="0 0 100 115"><path d="M28 52 V34 a22 22 0 0 1 44 0 V${52 - open * 22}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" transform="translate(0 ${-open * 14}) rotate(${open * -18} 72 40)"/><rect x="12" y="50" width="76" height="60" rx="14" fill="${col}"/><circle cx="50" cy="76" r="8" fill="#fff"/><rect x="46" y="78" width="8" height="16" rx="3" fill="#fff"/></svg>`;
const field = (lbl, val, on, w = '100%') => `<div style="width:${w}"><div style="font-size:24px;font-weight:700;color:#64748b;margin-bottom:8px">${lbl}</div><div style="height:72px;border-radius:16px;border:2px solid ${on ? 'var(--ac)' : '#e2e8f0'};background:#fff;display:flex;align-items:center;padding:0 22px;font-weight:800;font-size:34px;color:var(--ink);box-shadow:${on ? '0 0 0 5px color-mix(in srgb,var(--ac) 15%,transparent)' : 'none'}">${val}</div></div>`;
const caret = (tl, on) => (on && Math.floor(tl * 4) % 2 === 0 ? '<span style="display:inline-block;width:3px;height:38px;background:var(--ac);margin-left:4px"></span>' : '');
const pill = (txt, a, bg = 'var(--ac)') => `<div style="display:inline-block;background:${bg};color:#fff;font-weight:800;font-size:26px;padding:10px 20px;border-radius:999px;opacity:${a};transform:scale(${0.7 + 0.3 * a})">${txt}</div>`;
const chipSel = (items, sel, fs = 26) => items.map((x, i) => `<div style="padding:12px 22px;border-radius:14px;font-weight:800;font-size:${fs}px;white-space:nowrap;border:2px solid ${i === sel ? 'var(--ac)' : '#e2e8f0'};background:${i === sel ? 'var(--ac)' : '#fff'};color:${i === sel ? '#fff' : '#334155'}">${x}</div>`).join('');

Object.assign(SCENES, {
  split(tl, ci) {
    const D = [
      { name: 'Annual report.pdf', n: 12, size: '4.8 MB', g: [[1, 4], [5, 8], [9, 12]], out: ['1.6 MB', '1.5 MB', '1.7 MB'] },
      { name: 'Exam papers.pdf', n: 9, size: '2.7 MB', g: [[1, 3], [4, 6], [7, 9]], out: ['910 KB', '880 KB', '940 KB'] },
      { name: 'Contracts.pdf', n: 10, size: '3.2 MB', g: [[1, 2], [3, 7], [8, 10]], out: ['640 KB', '1.6 MB', '960 KB'] },
    ][ci];
    const GC = ['#ef4444', '#f59e0b', '#3b82f6'];
    const grp = (p) => D.g.findIndex((r) => p >= r[0] && p <= r[1]);
    const a = sg(tl, 0, 0.35);
    const cols = Math.ceil(D.n / 2), gap = 18, tw = Math.min(118, (880 - (cols - 1) * gap) / cols), th = tw * 1.36;
    const left = (912 - (cols * tw + (cols - 1) * gap)) / 2;
    const gather = sg(tl, 1.8, 2.4);
    let html = `<div class="file" style="opacity:${a}">${fileIcon('PDF', '#e5484d')}<div style="flex:1"><div class="fn">${D.name}</div><div class="fs">${D.n} pages · ${D.size}</div></div></div>`;
    if (tl < 2.4) {
      for (let p = 1; p <= D.n; p++) {
        const r = Math.floor((p - 1) / cols), c = (p - 1) % cols, gi = grp(p);
        const x0 = left + c * (tw + gap), y0 = 140 + r * (th + 24);
        const tx = 40 + gi * 300 + 60, ty = 190;
        const x = lerp(x0, tx, gather), y = lerp(y0, ty, gather);
        const on = sg(tl, 0.5 + gi * 0.28, 0.7 + gi * 0.28);
        html += `<div style="position:absolute;left:${x}px;top:${y}px;width:${tw}px;height:${th}px;background:#fff;border-radius:10px;opacity:${sg(tl, p * 0.02, 0.3 + p * 0.02) * (1 - gather)};box-shadow:0 0 0 ${2 + on * 2}px ${on ? GC[gi] : '#e2e8f0'},0 12px 24px -16px rgb(0 0 0 / .4);overflow:hidden">
          <div style="height:${th * 0.12}px;background:${on ? GC[gi] : '#cbd5e1'}"></div><div style="padding:${tw * 0.1}px">${'<div style="height:6px;background:#e2e8f0;border-radius:3px;margin:7px 0"></div>'.repeat(5)}</div>
          <div style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-weight:800;font-size:22px;color:#475569">${p}</div></div>`;
      }
      html += `<div style="position:absolute;left:0;right:0;top:${140 + 2 * (th + 24) + 2}px;display:flex;gap:14px;justify-content:center;opacity:${1 - sg(tl, 1.6, 1.9)}">${D.g.map((r, i) => pill(`Pages ${r[0]} to ${r[1]}`, sg(tl, 0.5 + i * 0.28, 0.7 + i * 0.28), GC[i])).join('')}</div>`;
      html += `<div style="position:absolute;left:0;right:0;top:572px;text-align:center;opacity:${1 - gather}">${btn('Split PDF', tl > 1.45 && tl < 1.75)}</div>`;
    }
    if (tl >= 2.0) {
      const b = sg(tl, 2.0, 2.5);
      D.g.forEach((r, i) => {
        html += `<div style="position:absolute;left:${16 + i * 300}px;top:180px;width:280px;opacity:${b};transform:translateY(${(1 - b) * 40}px) scale(${0.8 + 0.2 * b})">
          <div style="height:250px;border-radius:18px;background:#fff;box-shadow:0 0 0 3px ${GC[i]},0 20px 40px -22px rgb(0 0 0 / .45);position:relative;overflow:hidden">
            <div style="height:56px;background:${GC[i]}"></div><div style="padding:16px 22px">${'<div style="height:10px;background:#e2e8f0;border-radius:5px;margin:12px 0"></div>'.repeat(5)}</div>
            <div class="bdg" style="right:12px;bottom:12px;background:#e5484d">PDF</div><div class="bdg" style="left:12px;top:10px;background:rgb(0 0 0 / .22)">${r[1] - r[0] + 1} pages</div></div>
          <div style="text-align:center;margin-top:14px;font-weight:800;font-size:28px;color:var(--ink)">Pages ${r[0]} to ${r[1]}</div>
          <div style="text-align:center;font-size:24px;color:#64748b;font-weight:600">${D.out[i]}</div></div>`;
      });
      html += `<div style="position:absolute;left:0;right:0;top:560px;text-align:center;opacity:${sg(tl, 2.5, 2.8)}">${btn(dlIcon(tl) + 'Download all (ZIP)', false)}</div>`;
    }
    return html;
  },

  pdf2jpg(tl, ci) {
    const D = [
      { name: 'Annual report', dpi: 1, px: '1240 × 1754', s: ['437 KB', '345 KB', '437 KB'], n: 12 },
      { name: 'Brochure', dpi: 2, px: '2480 × 3508', s: ['1.2 MB', '980 KB', '1.1 MB'], n: 8 },
      { name: 'Certificate', dpi: 0, px: '827 × 1170', s: ['198 KB', '176 KB', '204 KB'], n: 3 },
    ][ci];
    const a = sg(tl, 0, 0.35);
    const fan = sg(tl, 1.0, 1.8);
    let html = `<div style="display:flex;gap:12px;justify-content:center;opacity:${a}">${chipSel(['Normal (100 DPI)', 'High (150 DPI)', 'Very high (300 DPI)'], D.dpi, 25)}</div>`;
    const W = 270, H = 382;
    const page = (i, pv) => `<div style="position:absolute;inset:0">${docPage(W, H, i === 0 ? D.name : 'Page ' + (i + 1), { hc: ['#b91c1c', '#0369a1', '#15803d'][ci] })}</div>${pv ? `<div style="position:absolute;left:${W * 0.08}px;right:${W * 0.08}px;bottom:${H * 0.08}px;height:${H * 0.22}px;border-radius:6px;overflow:hidden">${photo(ci + i, W * 0.84, H * 0.22)}</div>` : ''}`;
    for (let i = 2; i >= 0; i--) {
      const x = lerp(321 + i * 10, 18 + i * 300, fan), y = lerp(100 + i * 10, 96, fan);
      const jpg = tl >= 1.0 + i * 0.25;
      html += `<div class="doc" style="left:${x}px;top:${y}px;width:${W}px;height:${H}px;opacity:${a};transform:rotate(${(1 - fan) * (i - 1) * 4}deg)">${page(i, true)}
        <div class="bdg" style="right:10px;bottom:10px;background:${jpg ? 'var(--ac)' : '#e5484d'}">${jpg ? 'JPG' : 'PDF'}</div></div>`;
      if (fan > 0.5) html += `<div style="position:absolute;left:${18 + i * 300}px;top:${96 + H + 12}px;width:${W}px;text-align:center;opacity:${sg(tl, 1.5 + i * 0.15, 1.8 + i * 0.15)}"><div style="font-weight:800;font-size:27px;color:var(--ink)">Page ${i + 1} · ${D.s[i]}</div><div style="font-size:22px;color:#64748b;font-weight:600">${D.px} px</div></div>`;
    }
    if (tl < 1.0) html += spinner(tl, 'Reading ' + D.n + ' pages…', Math.min(sg(tl, 0.35, 0.5), 1 - sg(tl, 0.85, 1.0)));
    html += `<div style="position:absolute;left:0;right:0;top:580px;text-align:center">${tl < 2.2 ? btn('Convert to images', tl > 0.3 && tl < 0.6) : btn(dlIcon(tl) + `Download all ${D.n} (ZIP)`, false)}</div>`;
    return html;
  },

  word2pdf(tl, ci) {
    const name = ['Offer letter', 'Invoice', 'Resume'][ci];
    const rows = [[['Basic pay', '45,000'], ['HRA', '18,000'], ['Allowance', '6,500']], [['Flow meter', '12,500'], ['Level switch', '9,400'], ['Installation', '4,000']], [['Python', '5 years'], ['Excel', '7 years'], ['Power BI', '3 years']]][ci];
    const cols = [['Salary', 'Monthly (₹)'], ['Item', 'Price (₹)'], ['Skill', 'Experience']][ci];
    const info = ['2 pages · 148 KB', '1 page · 96 KB', '2 pages · 212 KB'][ci];
    const pdf = tl >= 1.75;
    const flip = tl < 1.5 ? 1 : tl < 1.75 ? 1 - sg(tl, 1.5, 1.75) : sg(tl, 1.75, 2.0);
    const slide = (1 - sg(tl, 0, 0.5)) * 500;
    const W = 560, H = 630;
    let html = `<div class="doc" style="left:${40 + slide}px;top:0;width:${W}px;height:${H}px;transform:scaleX(${Math.max(0.001, flip)})">
      ${!pdf ? `<div style="height:44px;background:#2b579a;display:flex;gap:10px;align-items:center;padding:0 16px">${'<div style="width:60px;height:12px;border-radius:6px;background:rgb(255 255 255 / .5)"></div>'.repeat(4)}</div>` : ''}
      ${docPage(W, H - (pdf ? 0 : 44), name, { rows, cols, hc: '#1f4e79' })}
      <div class="bdg" style="right:14px;bottom:14px;background:${pdf ? '#e5484d' : '#2b579a'}">${pdf ? 'PDF' : 'W .docx'}</div></div>`;
    ['Fonts', 'Tables', 'Colours', 'Layout'].forEach((c, i) => {
      const k = sg(tl, 2.1 + i * 0.2, 2.3 + i * 0.2);
      html += `<div style="position:absolute;left:640px;top:${70 + i * 110}px;width:250px;opacity:${k};transform:translateX(${(1 - k) * 40}px);background:#fff;border:2px solid #bbf7d0;border-radius:16px;padding:16px 18px;font-weight:800;font-size:30px;color:#166534;box-shadow:0 12px 24px -16px rgb(0 0 0 / .3)">✓ ${c}</div>`;
    });
    if (tl < 1.75) html += `<div style="position:absolute;left:640px;top:200px;width:250px;text-align:center;opacity:${1 - sg(tl, 0.5, 0.7)}">${btn('Convert', tl > 0.3 && tl < 0.6)}</div>`;
    if (tl >= 0.6 && tl < 1.75) html += spinner(tl, 'Converting to PDF…', Math.min(sg(tl, 0.6, 0.8), 1 - sg(tl, 1.55, 1.75)));
    if (tl >= 3.1) html += toast(`✓ ${name}.pdf · ${info}`, sg(tl, 3.1, 3.4));
    return html;
  },

  protect(tl, ci) {
    const D = [['Salary slip.pdf', '2 pages · 186 KB', 10], ['Bank statement.pdf', '6 pages · 1.1 MB', 12], ['Medical report.pdf', '4 pages · 740 KB', 9]][ci];
    const a = sg(tl, 0, 0.35);
    const n1 = Math.max(0, Math.min(D[2], Math.floor((tl - 0.4) / 0.07))), n2 = Math.max(0, Math.min(D[2], Math.floor((tl - 1.2) / 0.05)));
    const dots = (n) => '●'.repeat(n);
    const str = n1 / D[2];
    const done = tl >= 2.3;
    let html = `<div class="file" style="opacity:${a}">${fileIcon('PDF', '#e5484d')}<div style="flex:1"><div class="fn">${D[0]}</div><div class="fs">${D[1]}</div></div>${done ? `<div style="transform:scale(${sg(tl, 2.3, 2.55)})">${lockSvg(56, 0)}</div>` : ''}</div>`;
    if (!done) {
      const fa = 1 - sg(tl, 2.0, 2.3);
      html += `<div style="opacity:${fa * a}"><div style="margin-top:26px">${field('Password', `<span style="letter-spacing:.12em">${dots(n1)}</span>` + caret(tl, tl < 1.2), tl < 1.2)}</div>
        <div style="display:flex;align-items:center;gap:16px;margin-top:12px"><div style="flex:1;height:12px;border-radius:6px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:${str * 100}%;background:${str < 0.5 ? '#f59e0b' : '#16a34a'}"></div></div><div style="font-weight:800;font-size:24px;color:${str < 0.5 ? '#b45309' : '#16a34a'};width:110px">${n1 ? (str < 0.5 ? 'Weak' : 'Strong') : ''}</div></div>
        <div style="margin-top:14px">${field('Repeat password', `<span style="letter-spacing:.12em">${dots(n2)}</span>` + caret(tl, tl >= 1.2 && tl < 1.85), tl >= 1.2 && tl < 1.85)}</div>
        <div style="display:flex;gap:26px;margin-top:22px;font-size:25px;font-weight:700;color:#334155">${[['Allow printing', 1], ['Allow copying text', 0], ['Allow editing', 0]].map(([l, c]) => `<span style="display:flex;align-items:center;gap:8px"><span style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font-size:20px;color:#fff;background:${c ? 'var(--ac)' : '#fff'};border:2px solid ${c ? 'var(--ac)' : '#cbd5e1'}">${c ? '✓' : ''}</span>${l}</span>`).join('')}</div>
        <div style="text-align:center;margin-top:26px">${btn('Protect PDF', tl > 1.9 && tl < 2.2)}</div></div>`;
    } else {
      const k = sg(tl, 2.3, 2.7);
      html += `<div style="text-align:center;margin-top:30px;opacity:${k};transform:scale(${0.85 + 0.15 * k})">${lockSvg(150, 0)}
        <div style="font-weight:900;font-size:46px;color:var(--ink);margin-top:14px">Password protected</div>
        <div style="display:inline-block;margin-top:14px;background:#dcfce7;color:#166534;font-weight:800;font-size:28px;padding:10px 22px;border-radius:12px">Encrypted with AES-256</div>
        <div style="margin-top:30px">${btn(dlIcon(tl) + 'Download PDF', false)}</div></div>`;
    }
    return html;
  },

  unlock(tl, ci) {
    const D = [['Bank statement.pdf', 'Statement', 8], ['Salary slip.pdf', 'Salary slip', 10], ['Tax return.pdf', 'Tax return', 8]][ci];
    const a = sg(tl, 0, 0.35);
    const n = Math.max(0, Math.min(D[2], Math.floor((tl - 0.4) / 0.08)));
    const open = sg(tl, 1.9, 2.25), clear = sg(tl, 2.1, 2.6), gone = sg(tl, 2.4, 2.8);
    const W = 420, H = 580;
    let html = `<div class="doc" style="left:0;top:20px;width:${W}px;height:${H}px;opacity:${a}"><div style="filter:blur(${(1 - clear) * 9}px)">${docPage(W, H, D[1], { hc: '#7c2d12', rows: [['Opening', '42,150'], ['Credits', '68,400'], ['Debits', '51,275']], cols: ['Summary', 'Amount (₹)'] })}</div>
      <div style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) scale(${1 + gone * 0.3});opacity:${1 - gone}">${lockSvg(130, open, open > 0.5 ? '#16a34a' : 'var(--ac)')}</div>
      <div class="bdg" style="right:12px;bottom:12px;background:#e5484d">PDF</div></div>`;
    html += `<div style="position:absolute;left:460px;top:20px;width:452px;opacity:${a}">
      <div style="font-weight:800;font-size:30px;color:var(--ink)">${D[0]}</div><div style="font-size:24px;color:#64748b;margin-top:4px">${clear < 1 ? '🔒 Password needed' : '🔓 No password'}</div>
      <div style="margin-top:36px">${field('Password', `<span style="letter-spacing:.12em">${'●'.repeat(n)}</span>` + caret(tl, tl < 1.5), tl < 1.5)}</div>
      <div style="margin-top:36px">${tl < 2.6 ? btn('Unlock PDF', tl > 1.55 && tl < 1.85, 'width:100%;justify-content:center') : btn(dlIcon(tl) + 'Download PDF', false, 'width:100%;justify-content:center')}</div>
      <div style="margin-top:40px;opacity:${sg(tl, 2.6, 2.9)}">${['Password removed', 'Print and copy allowed', 'Opens on any device'].map((t) => `<div style="font-weight:800;font-size:28px;color:#166534;margin:12px 0">✓ ${t}</div>`).join('')}</div></div>`;
    return html;
  },

  watermark(tl, ci) {
    const D = [['CONFIDENTIAL', '#dc2626', 'Proposal', 8], ['DRAFT', '#64748b', 'Contract', 5], ['SAMPLE', '#2563eb', 'Price list', 3]][ci];
    const word = D[0];
    const n = Math.max(0, Math.min(word.length, Math.floor((tl - 0.3) / 0.09)));
    const txt = word.slice(0, n);
    const W = 450, H = 620;
    const fs = Math.min(120, (W * 1.05) / (word.length * 0.68));
    const op = lerp(0.6, 0.3, sg(tl, 1.6, 2.0));
    let html = `<div class="doc" style="left:0;top:0;width:${W}px;height:${H}px">${docPage(W, H, D[2], { hc: '#334155' })}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg);color:${D[1]};opacity:${op};font-weight:900;font-size:${fs}px;letter-spacing:.04em;white-space:nowrap;font-family:Inter,sans-serif">${txt}</div></div>`;
    const sw = ['#dc2626', '#64748b', '#2563eb', '#16a34a'];
    html += `<div style="position:absolute;left:484px;top:0;width:428px">
      ${field('Text', `<span style="font-size:${word.length > 8 ? 28 : 34}px">${txt}</span>` + caret(tl, tl < 1.5), tl < 1.5)}
      <div style="font-size:24px;font-weight:700;color:#64748b;margin:24px 0 10px">Angle</div><div style="display:flex;gap:10px">${chipSel(['Diagonal 45°', 'Horizontal'], 0, 24)}</div>
      <div style="font-size:24px;font-weight:700;color:#64748b;margin:24px 0 10px">Opacity: ${Math.round(op * 100)}%</div>
      <div style="height:12px;border-radius:6px;background:#e2e8f0;position:relative"><div style="height:100%;width:${op * 100}%;background:var(--ac);border-radius:6px"></div><div style="position:absolute;left:calc(${op * 100}% - 16px);top:-10px;width:32px;height:32px;border-radius:50%;background:#fff;border:4px solid var(--ac)"></div></div>
      <div style="font-size:24px;font-weight:700;color:#64748b;margin:28px 0 10px">Colour</div><div style="display:flex;gap:14px">${sw.map((c) => `<div style="width:52px;height:52px;border-radius:14px;background:${c};box-shadow:${c === D[1] ? '0 0 0 4px #fff,0 0 0 7px ' + c : 'none'}"></div>`).join('')}</div>
      <div style="margin-top:34px">${tl < 2.4 ? btn('Add watermark', tl > 2.0 && tl < 2.3, 'width:100%;justify-content:center') : btn(dlIcon(tl) + 'Download PDF', false, 'width:100%;justify-content:center')}</div></div>`;
    if (tl >= 2.5) html += toast(`✓ Watermark added to ${D[3]} pages`, sg(tl, 2.5, 2.8));
    return html;
  },

  resize(tl, ci) {
    const D = [[4032, 3024, 1080, 810, '3.41 MB', '152 KB', 'IMG_2041.jpg'], [6000, 4000, 1920, 1280, '6.74 MB', '455 KB', 'DSC_0193.jpg'], [3000, 4000, 600, 800, '3.27 MB', '107 KB', 'Portrait.jpg']][ci];
    const tw = String(D[2]);
    const n = Math.max(0, Math.min(tw.length, Math.floor((tl - 0.4) / 0.13) + (tl >= 0.4 ? 1 : 0)));
    const hOn = n >= tw.length;
    const k = sg(tl, 1.7, 2.4);
    const land = D[0] > D[1];
    const bw = land ? 520 : 270, bh = land ? bw * D[1] / D[0] : 360;
    const s = lerp(1, Math.max(0.45, D[2] / D[0] * 1.6), k);
    const curW = Math.round(lerp(D[0], D[2], k)), curH = Math.round(lerp(D[1], D[3], k));
    let html = `<div style="position:absolute;left:${456 - bw / 2}px;top:${(360 - bh) / 2}px;width:${bw}px;height:${bh}px;border-radius:12px;border:3px dashed ${k > 0 ? 'color-mix(in srgb,var(--ac) 40%,#fff)' : 'transparent'}"></div>
      <div style="position:absolute;left:${456 - bw / 2}px;top:${(360 - bh) / 2}px;width:${bw}px;height:${bh}px;border-radius:12px;overflow:hidden;transform:scale(${s});box-shadow:0 24px 50px -24px rgb(0 0 0 / .5)">${photo(ci + 2, bw, bh)}</div>
      <div style="position:absolute;left:0;right:0;top:${(360 - bh) / 2 + bh / 2 - 34}px;text-align:center"><span class="num" style="background:rgb(0 0 0 / .66);color:#fff;font-weight:800;font-size:40px;padding:10px 22px;border-radius:14px">${curW} × ${curH}</span></div>`;
    if (tl >= 2.4) html += `<div style="position:absolute;left:0;right:0;top:${(360 - bh) / 2 + bh / 2 + 34}px;text-align:center;transform:scale(${0.7 + 0.3 * sg(tl, 2.4, 2.6)})"><span style="background:#16a34a;color:#fff;font-weight:800;font-size:30px;padding:8px 18px;border-radius:12px">${D[4]} → ${D[5]}</span></div>`;
    html += `<div style="position:absolute;left:0;right:0;top:384px;display:flex;align-items:flex-end;gap:16px">
        ${field('Width (px)', (tl < 0.4 ? D[0] : tw.slice(0, n)) + caret(tl, tl >= 0.3 && tl < 1.0), tl >= 0.3 && tl < 1.0, '40%')}
        <div style="height:72px;display:grid;place-items:center;font-size:36px;width:60px">🔗</div>
        ${field('Height (px)', `<span style="color:${hOn ? 'var(--ac)' : 'var(--ink)'}">${hOn ? D[3] : D[1]}</span>`, false, '40%')}</div>
      <div style="position:absolute;left:0;right:0;top:500px;display:flex;justify-content:space-between;align-items:center"><div style="display:flex;gap:10px">${chipSel(['By pixels', 'By percent'], 0, 24)}</div>
        <span style="display:flex;align-items:center;gap:10px;font-size:26px;font-weight:700;color:#334155"><span style="width:30px;height:30px;border-radius:8px;background:var(--ac);color:#fff;display:grid;place-items:center;font-size:20px">✓</span>Keep proportions</span></div>
      <div style="position:absolute;left:0;right:0;top:575px;text-align:center">${tl < 2.4 ? btn('Resize', tl > 1.3 && tl < 1.6) : btn(dlIcon(tl) + 'Download JPG', false)}</div>`;
    return html;
  },

  vid2gif(tl, ci) {
    const D = [{ f: 'Holiday clip.mp4', len: 10, s: 2, e: 6, fps: 10, w: 480, h: 270, mb: '3.22 MB' }, { f: 'Product demo.mp4', len: 8, s: 0, e: 3, fps: 15, w: 320, h: 180, mb: '1.61 MB' }, { f: 'Funny moment.mp4', len: 12, s: 5, e: 8, fps: 12, w: 640, h: 360, mb: '5.15 MB' }][ci];
    const frames = Math.round((D.e - D.s) * D.fps);
    const VW = 600, VH = 338;
    const done = tl >= 2.3;
    const play = tl < 0.9 ? D.s + (tl / 0.9) * (D.e - D.s) * 0.6 : D.s + (D.e - D.s) * 0.6;
    const drift = done ? Math.sin((tl - 2.3) * 4) * 20 : 0;
    let html = `<div style="position:absolute;left:${(912 - VW) / 2}px;top:0;width:${VW}px;height:${VH}px;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 24px 50px -24px rgb(0 0 0 / .5)">
      <div style="transform:scale(1.12) translateX(${drift}px)">${photo(ci + 3, VW, VH)}</div>
      ${!done ? `<div style="position:absolute;left:16px;top:14px;background:rgb(0 0 0 / .6);color:#fff;font-weight:700;font-size:24px;padding:6px 14px;border-radius:10px">${D.f}</div>` : `<div class="bdg" style="left:16px;top:14px;background:var(--ac);font-size:28px">GIF</div><div style="position:absolute;right:16px;top:14px;background:rgb(0 0 0 / .6);color:#fff;font-weight:800;font-size:24px;padding:6px 14px;border-radius:10px">${D.w} × ${D.h}</div>`}
      ${tl >= 1.0 && tl < 2.3 ? `<div style="position:absolute;inset:0;background:rgb(255 255 255 / .55);display:grid;place-items:center"><div style="font-weight:900;font-size:40px;color:var(--ink)">Creating GIF… ${Math.round(sg(tl, 1.0, 2.2) * frames)} / ${frames}</div></div>` : ''}</div>`;
    const TW = 860, x0 = 26;
    const px = (t) => x0 + (t / D.len) * TW;
    html += `<div style="position:absolute;left:${x0}px;top:368px;width:${TW}px;height:56px;border-radius:12px;background:#e2e8f0;overflow:hidden;display:flex">${Array.from({ length: 12 }, (_, i) => `<div style="flex:1;opacity:.35;border-right:2px solid #fff">${photo(ci + 3 + (i % 3), 72, 56)}</div>`).join('')}</div>
      <div style="position:absolute;left:${px(D.s)}px;top:362px;width:${px(D.e) - px(D.s)}px;height:68px;border:5px solid var(--ac);border-radius:12px;background:color-mix(in srgb,var(--ac) 18%,transparent)"></div>
      ${!done ? `<div style="position:absolute;left:${px(play)}px;top:354px;width:4px;height:84px;background:var(--ink);border-radius:2px"></div>` : ''}
      <div style="position:absolute;left:0;right:0;top:452px;display:flex;gap:12px;justify-content:center">${[`Start ${D.s.toFixed(1)} s`, `End ${D.e.toFixed(1)} s`, `${D.fps} fps`, `${D.w} px`].map((t) => `<div style="padding:12px 20px;border-radius:14px;border:2px solid #e2e8f0;background:#fff;font-weight:800;font-size:27px;color:var(--ink)">${t}</div>`).join('')}</div>
      <div style="position:absolute;left:0;right:0;top:560px;text-align:center">${!done ? btn('Make GIF', tl > 0.7 && tl < 1.0) : btn(dlIcon(tl) + `Download GIF · ${D.mb}`, false)}</div>`;
    if (done && tl < 3.0) html += `<div style="position:absolute;left:0;right:0;top:300px;text-align:center;opacity:${Math.min(sg(tl, 2.3, 2.5), 1 - sg(tl, 2.8, 3.0))}">${pill(`✓ ${frames} frames · ${D.mb}`, 1, '#16a34a')}</div>`;
    return html;
  },

  mic(tl, ci) {
    const D = [['Laptop microphone', '48.0 kHz', -18, -6], ['USB headset', '44.1 kHz', -22, -9], ['Bluetooth earbuds', '16.0 kHz', -26, -12]][ci];
    const env = (t) => (t < 0.4 ? 0.04 : Math.max(0.05, Math.abs(Math.sin(t * 5.3)) * (0.55 + 0.45 * Math.sin(t * 13.1 + ci))));
    const lvl = env(tl);
    const heard = tl >= 0.9;
    let wave = '';
    for (let i = 0; i < 120; i++) { const t = tl - (119 - i) * 0.012; const e = env(t); const v = e * Math.sin(i * 1.9 + tl * 40) * 70 * (0.6 + 0.4 * Math.sin(i * 0.37)); wave += `${i ? 'L' : 'M'}${i * 7.6} ${80 - v}`; }
    let bars = '';
    for (let i = 0; i < 24; i++) { const h = Math.max(6, lvl * 130 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.9 + tl * 9)))); bars += `<rect x="${i * 37.5 + 4}" y="${150 - h}" width="28" height="${h}" rx="6" fill="var(--ac)" opacity="${0.45 + 0.55 * (i % 3 === 0)}"/>`; }
    const tileS = (l, v, s) => `<div style="flex:1;background:#f8fafc;border:2px solid #e2e8f0;border-radius:18px;padding:16px;text-align:center"><div style="font-size:23px;color:#64748b;font-weight:700">${l}</div><div style="font-size:${v.length > 12 ? 27 : 40}px;font-weight:900;color:var(--ink);margin-top:4px;white-space:nowrap">${v}</div><div style="font-size:21px;color:#64748b">${s}</div></div>`;
    const db = Math.round(D[2] + (lvl - 0.5) * 8);
    return `<div style="height:44px;border-radius:999px;background:#f1f5f9;overflow:hidden;position:relative"><div style="height:100%;width:${lvl * 92}%;background:linear-gradient(90deg,#22c55e,#84cc16 70%,#f59e0b)"></div></div>
      <svg width="912" height="160" style="display:block;margin-top:18px"><path d="${wave}" fill="none" stroke="var(--ac)" stroke-width="4" stroke-linejoin="round"/></svg>
      <svg width="912" height="150" style="display:block">${bars}</svg>
      <div style="margin-top:14px;text-align:center;font-weight:900;font-size:36px;color:${heard ? '#16a34a' : '#64748b'};transform:scale(${heard ? 0.9 + 0.1 * sg(tl, 0.9, 1.1) : 1})">${heard ? '✓ Your microphone is working' : 'Say something… waiting for sound'}</div>
      <div style="display:flex;gap:16px;margin-top:22px">${tileS('Input level', tl < 0.4 ? '…' : db + ' dB', 'peak ' + D[3] + ' dB')}${tileS('Microphone', D[0], 'default device')}${tileS('Sample rate', D[1], 'mono')}</div>`;
  },

  webcam(tl, ci) {
    const D = [['Laptop webcam', 1280, 720, 30, ['#e0e7ff', '#fde68a', '#334155']], ['USB webcam', 1920, 1080, 30, ['#dcfce7', '#fecaca', '#7c2d12']], ['Full HD camera', 1920, 1080, 60, ['#fce7f3', '#bae6fd', '#1e293b']]][ci];
    const VW = 832, VH = 468, C = D[4];
    const bob = Math.sin(tl * 3) * 6;
    const flash = tl >= 2.0 && tl < 2.4 ? 1 - sg(tl, 2.0, 2.4) : 0;
    const a = sg(tl, 0, 0.4);
    let html = `<div style="position:absolute;left:40px;top:0;width:${VW}px;height:${VH}px;border-radius:22px;overflow:hidden;opacity:${a};box-shadow:0 24px 50px -24px rgb(0 0 0 / .5)">
      <svg width="${VW}" height="${VH}" viewBox="0 0 832 468"><rect width="832" height="468" fill="${C[0]}"/><rect x="520" y="50" width="240" height="190" rx="10" fill="${C[1]}" stroke="#fff" stroke-width="10"/><line x1="640" y1="50" x2="640" y2="240" stroke="#fff" stroke-width="8"/>
        <rect x="60" y="250" width="120" height="218" fill="#fff" opacity=".5"/><circle cx="120" cy="230" r="44" fill="#4ade80" opacity=".8"/>
        <g transform="translate(0 ${bob})"><path d="M236 468 C 250 360, 330 330, 416 330 S 582 360, 596 468 Z" fill="${C[2]}"/><circle cx="416" cy="250" r="86" fill="#f1c7a3"/><path d="M330 240 C 330 160, 500 150, 504 236 C 480 200, 380 196, 330 240Z" fill="#3f2a1d"/>
        <circle cx="386" cy="258" r="8" fill="#1f2937"/><circle cx="446" cy="258" r="8" fill="#1f2937"/><path d="M392 292 Q416 ${306 + Math.sin(tl * 2) * 4} 440 292" stroke="#9a3412" stroke-width="5" fill="none" stroke-linecap="round"/></g></svg>
      <div style="position:absolute;left:18px;top:16px;background:rgb(0 0 0 / .6);color:#fff;font-weight:800;font-size:24px;padding:6px 14px;border-radius:10px"><span style="color:#ef4444;opacity:${Math.floor(tl * 2) % 2 ? 1 : 0.35}">●</span> LIVE</div>
      <div style="position:absolute;right:18px;top:16px;background:rgb(0 0 0 / .6);color:#fff;font-weight:800;font-size:24px;padding:6px 14px;border-radius:10px">${D[1]} × ${D[2]} · ${D[3]} fps</div>
      <div style="position:absolute;inset:0;background:#fff;opacity:${flash}"></div></div>`;
    const tileS = (l, v) => `<div style="flex:1;background:#f8fafc;border:2px solid #e2e8f0;border-radius:18px;padding:14px;text-align:center"><div style="font-size:23px;color:#64748b;font-weight:700">${l}</div><div style="font-size:${v.length > 11 ? 28 : 36}px;font-weight:900;color:var(--ink);margin-top:4px;white-space:nowrap">${v}</div></div>`;
    html += `<div style="position:absolute;left:0;right:0;top:490px;display:flex;gap:14px;opacity:${sg(tl, 0.5, 0.9)}">${tileS('Camera', D[0])}${tileS('Resolution', D[1] + ' × ' + D[2])}${tileS('Frame rate', D[3] + ' fps')}</div>`;
    html += `<div style="position:absolute;left:0;right:0;top:590px;text-align:center">${btn(tl >= 2.4 ? dlIcon(tl) + 'Download photo' : '📷 Take photo', tl > 1.75 && tl < 2.0)}</div>`;
    if (tl >= 2.4) { const k = sg(tl, 2.4, 2.8); html += `<div style="position:absolute;left:${lerp(40, 690, k)}px;top:${lerp(0, 330, k)}px;width:${lerp(VW, 180, k)}px;height:${lerp(VH, 101, k)}px;border-radius:12px;border:5px solid #fff;box-shadow:0 16px 30px -12px rgb(0 0 0 / .5);background:${C[0]};opacity:${1 - sg(tl, 3.6, 4.0)}"></div>`; }
    if (tl >= 2.9) html += `<div style="position:absolute;left:0;right:0;top:396px;text-align:center">${pill(`✓ Photo saved · ${D[1]} × ${D[2]}`, sg(tl, 2.9, 3.2), '#16a34a')}</div>`;
    return html;
  },
});
Object.assign(SOUND, {
  split: { pop: [0.5, 0.78, 1.06, 1.5], ding: [2.5] },
  pdf2jpg: { pop: [0.35, 1.0, 1.25, 1.5], ding: [2.2] },
  word2pdf: { pop: [0.35, 1.75, 2.1, 2.3, 2.5, 2.7], ding: [3.1] },
  protect: { pop: [1.95], tick: Array.from({ length: 10 }, (_, i) => 0.4 + i * 0.07).concat(Array.from({ length: 10 }, (_, i) => 1.2 + i * 0.05)), ding: [2.35] },
  unlock: { pop: [1.6, 1.9], tick: Array.from({ length: 9 }, (_, i) => 0.4 + i * 0.08), ding: [2.4] },
  watermark: { pop: [2.05], tick: Array.from({ length: 8 }, (_, i) => 0.3 + i * 0.12), ding: [2.5] },
  resize: { pop: [1.4], tick: [0.4, 0.53, 0.66, 0.79], ding: [2.4] },
  vid2gif: { pop: [0.75], tick: [1.2, 1.5, 1.8, 2.1], ding: [2.3] },
  mic: { pop: [0.4], ding: [0.9] },
  webcam: { pop: [0.5, 1.85], ding: [2.9] },
});

// ===== Batch 3 scenes =====
const typed = (s, tl, t0, cps) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((tl - t0) * cps))));
const thumbPg = (w, h, n, hc, big = true) => `<div style="width:${w}px;height:${h}px;background:#fff;border-radius:10px;overflow:hidden;position:relative;box-shadow:0 0 0 2px #e2e8f0,0 14px 28px -18px rgb(0 0 0 / .45)">
  <div style="height:${h * 0.13}px;background:${hc}"></div><div style="padding:${w * 0.09}px">${'<div style="height:7px;background:#e2e8f0;border-radius:4px;margin:8px 0"></div>'.repeat(4)}</div>
  ${big ? `<div style="position:absolute;left:0;right:0;bottom:${h * 0.12}px;text-align:center;font-weight:900;font-size:${w * 0.32}px;color:${hc};opacity:.85">${n}</div>` : ''}</div>`;
const PAL = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

Object.assign(SCENES, {
  editpdf(tl, ci) {
    const D = [
      { t: 'Quotation', l: ['Quotation No. Q 2611', 'Customer: Sharma Traders'], pre: 'Total: ', old: '₹12,500', neu: '₹11,900', hl: 'Valid for 30 days from today' },
      { t: 'Letter', l: ['Kobe Industries Pvt Ltd', 'Subject: Order confirmation'], pre: 'Date: ', old: '01 Oct 2026', neu: '06 Nov 2026', hl: 'Delivery in two weeks' },
      { t: 'Certificate', l: ['Certificate of Completion', 'Excel for Beginners'], pre: 'Awarded to ', old: 'Rahul Shah', neu: 'Priya Patil', hl: 'Completed with distinction' },
    ][ci];
    const del = Math.max(0, Math.min(D.old.length, Math.floor((tl - 0.5) / 0.04)));
    const val = tl < 0.95 ? D.old.slice(0, D.old.length - del) : typed(D.neu, tl, 0.95, 16);
    const editing = tl >= 0.35 && tl < 1.75;
    const hlW = sg(tl, 1.95, 2.45);
    const tool = tl < 1.85 ? 0 : 3;
    const a = sg(tl, 0, 0.35);
    const W = 720, X = 96;
    let html = `<div style="display:flex;gap:10px;justify-content:center;opacity:${a}">${chipSel(['Edit text', 'Add text', 'Draw', 'Highlight', 'Image'], tool, 24)}</div>
    <div class="doc" style="left:${X}px;top:84px;width:${W}px;height:470px;opacity:${a}">
      <div style="height:64px;background:#1f2937;display:flex;align-items:center;padding:0 30px;color:#fff;font-weight:800;font-size:30px">${D.t}</div>
      <div style="padding:22px 36px;font-size:32px;color:#1e293b;font-weight:600;line-height:1.25">
        ${D.l.map((x) => `<div style="margin:10px 0">${x}</div>`).join('')}
        <div><div style="margin:12px 0;display:inline-block;position:relative;padding:6px 10px;margin-left:-10px;border-radius:8px;outline:${editing ? '3px dashed var(--ac)' : 'none'};background:${editing ? 'color-mix(in srgb,var(--ac) 8%,#fff)' : 'transparent'}">${D.pre}<b>${val}</b>${caret(tl, editing && tl >= 0.5)}
          ${editing ? `<div style="position:absolute;left:calc(100% + 14px);top:8px;background:var(--ink);color:#fff;font-size:22px;font-weight:700;padding:6px 14px;border-radius:10px;white-space:nowrap">Arial · 14 · Bold</div>` : ''}</div></div>
        <div><div style="margin:8px 0;position:relative;display:inline-block"><span style="position:absolute;left:-6px;top:4px;height:38px;width:calc(${hlW * 100}% + 12px);background:#fde047;opacity:.65;border-radius:4px"></span><span style="position:relative">${D.hl}</span></div></div>
        ${[92, 80, 86, 60].map((w) => `<div style="height:14px;background:#e2e8f0;border-radius:7px;margin:20px 0;width:${w}%"></div>`).join('')}
      </div><div class="bdg" style="right:14px;bottom:14px;background:#e5484d">PDF</div></div>
    <div style="position:absolute;left:0;right:0;top:580px;text-align:center">${tl < 2.6 ? btn('Apply changes', tl > 2.45 && tl < 2.6) : btn(dlIcon(tl) + 'Download PDF', false)}</div>`;
    if (tl >= 2.7) html += `<div style="position:absolute;left:0;right:0;top:500px;text-align:center">${pill('✓ Text changed, layout kept', sg(tl, 2.7, 3.0), '#16a34a')}</div>`;
    return html;
  },

  rotate(tl, ci) {
    const D = [{ from: [-90, -90, -90], dir: 0, lbl: 'Rotate right ↻' }, { from: [0, 180, 0], dir: 2, lbl: '180°' }, { from: [90, 0, 90], dir: 1, lbl: 'Rotate left ↺' }][ci];
    const a = sg(tl, 0, 0.35);
    let html = `<div style="display:flex;gap:12px;justify-content:center;opacity:${a}">${chipSel(['Rotate right ↻', 'Rotate left ↺', '180°'], D.dir, 26)}</div>`;
    let k = 0;
    D.from.forEach((f, i) => {
      const t0 = 0.8 + k * 0.35; const moving = f !== 0; if (moving) k++;
      const r = moving ? lerp(f, 0, sg(tl, t0, t0 + 0.4)) : 0;
      const done = !moving || tl >= t0 + 0.4;
      const cx = 18 + i * 300 + 138, cy = 250;
      html += `<div style="position:absolute;left:${cx - 105}px;top:${cy - 140}px;transform:rotate(${r}deg);opacity:${a}">
        <div style="width:210px;height:280px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 0 0 ${done && moving && tl < t0 + 1.0 ? 4 : 2}px ${done && moving && tl < t0 + 1.0 ? 'var(--ac)' : '#e2e8f0'},0 14px 28px -18px rgb(0 0 0 / .45)">
          <div style="padding:18px 16px"><div style="font-weight:900;font-size:26px;color:#1e293b">Invoice ${i + 1}</div>${'<div style="height:8px;background:#e2e8f0;border-radius:4px;margin:12px 0"></div>'.repeat(5)}<div style="height:54px;border-radius:6px;background:${PAL[i + 2]};opacity:.35;margin-top:14px"></div></div></div></div>
        <div style="position:absolute;left:${cx - 120}px;top:430px;width:240px;text-align:center;opacity:${a}">
          <div style="font-weight:800;font-size:27px;color:var(--ink)">Page ${i + 1}</div>
          <div style="display:inline-block;margin-top:8px;width:58px;height:58px;border-radius:50%;line-height:58px;font-size:30px;color:#fff;background:${moving ? 'var(--ac)' : '#cbd5e1'};transform:scale(${moving && tl > t0 - 0.15 && tl < t0 + 0.1 ? 0.85 : 1})">${moving ? (f < 0 ? '↻' : f === 180 ? '⟳' : '↺') : '✓'}</div></div>`;
    });
    html += `<div style="position:absolute;left:0;right:0;top:580px;text-align:center">${btn(tl < 2.4 ? 'Rotate PDF' : dlIcon(tl) + 'Download PDF', tl > 2.2 && tl < 2.4)}</div>`;
    return html;
  },

  pagenum(tl, ci) {
    const D = [{ pos: 1, fmt: 2, n: 12 }, { pos: 2, fmt: 1, n: 8 }, { pos: 1, fmt: 0, n: 20 }][ci];
    const lab = (i) => (D.fmt === 0 ? `${i}` : D.fmt === 1 ? `Page ${i}` : `${i} of ${D.n}`);
    const a = sg(tl, 0, 0.35);
    let html = `<div style="display:flex;gap:10px;justify-content:center;opacity:${a}">${chipSel(['Bottom left', 'Bottom centre', 'Bottom right'], D.pos, 25)}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;opacity:${a}">${chipSel(['1, 2, 3', 'Page 1', `1 of ${D.n}`], D.fmt, 25)}</div>`;
    for (let i = 0; i < 3; i++) {
      const k = sg(tl, 1.15 + i * 0.25, 1.4 + i * 0.25);
      const al = ['left', 'center', 'right'][D.pos];
      html += `<div class="doc" style="left:${18 + i * 300}px;top:150px;width:270px;height:380px;opacity:${a}">${docPage(270, 380, i === 0 ? 'Report' : 'Section ' + (i + 1), { hc: '#334155' })}
        <div style="position:absolute;left:18px;right:18px;bottom:14px;text-align:${al}"><span style="display:inline-block;font-weight:800;font-size:24px;color:#1e293b;padding:4px 10px;border-radius:8px;opacity:${k};transform:scale(${0.5 + 0.5 * k});background:${tl < 1.6 + i * 0.25 && k > 0 ? 'color-mix(in srgb,var(--ac) 22%,#fff)' : 'transparent'}">${lab(i + 1)}</span></div></div>`;
    }
    html += `<div style="position:absolute;left:0;right:0;top:575px;text-align:center">${tl < 2.2 ? btn('Add page numbers', tl > 0.85 && tl < 1.1) : btn(dlIcon(tl) + `Download PDF · ${D.n} pages`, false)}</div>`;
    return html;
  },

  reorder(tl, ci) {
    const before = [1, 2, 3, 4, 5, 6];
    const after = [[5, 1, 2, 3, 4, 6], [2, 3, 4, 5, 6, 1], [6, 5, 4, 3, 2, 1]][ci];
    const drag = [5, 1, 0][ci];
    const pos = (idx) => [20 + (idx % 3) * 300 + 63, 10 + Math.floor(idx / 3) * 262];
    const tm = sg(tl, 0.7, 1.6), to = sg(tl, 0.85, 1.55);
    const a = sg(tl, 0, 0.35);
    let html = '';
    for (const p of before) {
      const [x0, y0] = pos(before.indexOf(p)), [x1, y1] = pos(after.indexOf(p));
      const isD = p === drag;
      const k = drag ? (isD ? tm : to) : sg(tl, 0.8 + (p - 1) * 0.05, 1.5 + (p - 1) * 0.05);
      const lift = isD && tl > 0.5 && tl < 1.75 ? 1 : 0;
      const x = lerp(x0, x1, k), y = lerp(y0, y1, k) - Math.sin(k * Math.PI) * (isD ? 50 : 0);
      html += `<div style="position:absolute;left:${x}px;top:${y}px;z-index:${isD ? 5 : 1};opacity:${a};transform:scale(${1 + lift * 0.08}) rotate(${lift * 3}deg)">${thumbPg(150, 200, p, PAL[p - 1])}
        ${isD && lift ? `<div style="position:absolute;right:-20px;bottom:-14px;font-size:50px">✋</div>` : ''}</div>`;
    }
    for (let i = 0; i < 6; i++) { const [x, y] = pos(i); html += `<div style="position:absolute;left:${x}px;top:${y + 208}px;width:150px;text-align:center;font-size:22px;font-weight:700;color:#94a3b8">${i + 1}</div>`; }
    html += `<div style="position:absolute;left:0;right:0;top:560px;display:flex;gap:16px;justify-content:center">${ci === 2 ? btn('⇅ Reverse order', tl > 0.5 && tl < 0.8) : ''}${tl < 2.1 ? btn('Save new order', tl > 1.9 && tl < 2.1) : btn(dlIcon(tl) + 'Download PDF', false)}</div>`;
    return html;
  },

  excel2pdf(tl, ci) {
    const D = [
      { name: 'Sales report', h: ['Region', 'Q1', 'Q2', 'Q3', 'Total'], r: [['North', '4.2', '4.8', '5.1', '14.1'], ['South', '3.6', '3.9', '4.4', '11.9'], ['East', '2.8', '3.1', '3.3', '9.2'], ['West', '3.9', '4.0', '4.6', '12.5']], info: '1 page · 64 KB' },
      { name: 'Budget 2027', h: ['Item', 'Jan', 'Feb', 'Mar', 'Total'], r: [['Rent', '45k', '45k', '45k', '135k'], ['Salaries', '3.2L', '3.2L', '3.4L', '9.8L'], ['Travel', '18k', '22k', '15k', '55k'], ['Marketing', '60k', '75k', '80k', '2.2L']], info: '2 pages · 88 KB' },
      { name: 'Attendance', h: ['Name', 'Mon', 'Tue', 'Wed', 'Days'], r: [['Asha', '✓', '✓', '✓', '22'], ['Vikram', '✓', '✕', '✓', '20'], ['Neha', '✓', '✓', '✓', '23'], ['Imran', '✓', '✓', '✕', '21']], info: '1 page · 52 KB' },
    ][ci];
    const pdf = tl >= 1.75;
    const flip = tl < 1.5 ? 1 : tl < 1.75 ? 1 - sg(tl, 1.5, 1.75) : sg(tl, 1.75, 2.0);
    const slide = (1 - sg(tl, 0, 0.5)) * 500;
    const W = 600, H = 470;
    const cell = (v, i, hd) => `<td style="padding:${pdf ? '12px 10px' : '10px'};border:${pdf ? '0' : '1px solid #d1d5db'};border-bottom:${pdf ? '2px solid #e2e8f0' : '1px solid #d1d5db'};font-weight:${hd ? 800 : 600};font-size:24px;text-align:${i ? 'right' : 'left'};color:${hd && pdf ? '#fff' : '#1e293b'};background:${hd ? (pdf ? '#1f6f43' : '#e8f5ec') : '#fff'}">${v}</td>`;
    let html = `<div class="doc" style="left:${20 + slide}px;top:30px;width:${W}px;height:${H}px;transform:scaleX(${Math.max(0.001, flip)})">
      ${!pdf ? `<div style="height:46px;background:#217346;display:flex;gap:10px;align-items:center;padding:0 16px">${'<div style="width:60px;height:12px;border-radius:6px;background:rgb(255 255 255 / .5)"></div>'.repeat(4)}</div>
        <div style="display:flex;background:#f3f4f6;font-size:20px;color:#6b7280;font-weight:700"><div style="width:40px"></div>${'ABCDE'.split('').map((c) => `<div style="flex:1;text-align:center;padding:4px;border-left:1px solid #d1d5db">${c}</div>`).join('')}</div>` : `<div style="padding:30px 30px 10px;font-weight:900;font-size:34px;color:#1e293b">${D.name}</div>`}
      <table style="border-collapse:collapse;width:${pdf ? 'calc(100% - 60px)' : '100%'};margin:${pdf ? '0 30px' : '0'}">
        <tr>${D.h.map((v, i) => cell(v, i, true)).join('')}</tr>${D.r.map((r) => `<tr>${r.map((v, i) => cell(v, i, false)).join('')}</tr>`).join('')}</table>
      <div class="bdg" style="right:14px;bottom:14px;background:${pdf ? '#e5484d' : '#217346'}">${pdf ? 'PDF' : 'X .xlsx'}</div></div>`;
    const opts = [['Orientation', 'Landscape'], ['Page size', 'A4'], ['Gridlines', 'Show']];
    opts.forEach(([l, v], i) => {
      html += `<div style="position:absolute;left:650px;top:${50 + i * 120}px;width:250px;background:#fff;border:2px solid ${pdf ? '#bbf7d0' : '#e2e8f0'};border-radius:16px;padding:12px 18px;opacity:${sg(tl, 0.3 + i * 0.12, 0.5 + i * 0.12)}"><div style="font-size:21px;font-weight:700;color:#64748b">${l}</div><div style="font-weight:900;font-size:30px;color:${pdf ? '#166534' : 'var(--ink)'}">${pdf ? '✓ ' : ''}${v}</div></div>`;
    });
    html += `<div style="position:absolute;left:0;right:0;top:${H + 60}px;text-align:center">${tl < 1.75 ? btn('Convert to PDF', tl > 0.35 && tl < 0.6) : btn(dlIcon(tl) + 'Download PDF', false)}</div>`;
    if (tl >= 0.6 && tl < 1.75) html += spinner(tl, 'Converting to PDF…', Math.min(sg(tl, 0.6, 0.8), 1 - sg(tl, 1.55, 1.75)));
    if (tl >= 2.3) html += `<div style="position:absolute;left:640px;width:270px;top:420px;text-align:center">${pill(`✓ ${D.info}`, sg(tl, 2.3, 2.6), '#16a34a')}</div>`;
    return html;
  },

  ppt2pdf(tl, ci) {
    const D = [{ name: 'Pitch deck', n: 12, mb: '1.4 MB', t: ['Our Story', 'Market', 'Growth', 'Team'] }, { name: 'Training', n: 18, mb: '2.1 MB', t: ['Safety First', 'Rules', 'Steps', 'Quiz'] }, { name: 'Product launch', n: 9, mb: '960 KB', t: ['Meet Nova', 'Features', 'Price', 'Launch'] }][ci];
    const SC = [['#1e3a8a', '#3b82f6'], ['#7c2d12', '#f97316'], ['#14532d', '#22c55e'], ['#581c87', '#a855f7']];
    const slide = (w, h, j) => `<div style="width:${w}px;height:${h}px;border-radius:${w / 40}px;overflow:hidden;background:linear-gradient(135deg,${SC[j][0]},${SC[j][1]});position:relative;padding:${w * 0.06}px;box-sizing:border-box">
      <div style="color:#fff;font-weight:900;font-size:${w * 0.075}px">${D.t[j]}</div><div style="width:40%;height:${w * 0.012}px;background:rgb(255 255 255 / .6);border-radius:9px;margin-top:${w * 0.03}px"></div>
      <div style="position:absolute;right:${w * 0.06}px;bottom:${w * 0.06}px;display:flex;gap:${w * 0.02}px;align-items:flex-end">${[0.35, 0.55, 0.45, 0.8].map((v) => `<div style="width:${w * 0.06}px;height:${h * v * 0.6}px;background:rgb(255 255 255 / .75);border-radius:4px"></div>`).join('')}</div></div>`;
    const pdf = tl >= 1.75;
    const flip = tl < 1.5 ? 1 : tl < 1.75 ? 1 - sg(tl, 1.5, 1.75) : sg(tl, 1.75, 2.0);
    const a = sg(tl, 0, 0.35);
    let html = `<div style="position:absolute;left:156px;top:0;transform:scaleX(${Math.max(0.001, flip)});opacity:${a};box-shadow:0 24px 50px -24px rgb(0 0 0 / .5);border-radius:15px">${slide(600, 338, 0)}
      <div class="bdg" style="right:14px;bottom:14px;background:${pdf ? '#e5484d' : '#c43e1c'}">${pdf ? 'PDF' : 'P .pptx'}</div></div>`;
    for (let j = 0; j < 4; j++) {
      const k = sg(tl, 0.15 + j * 0.1, 0.45 + j * 0.1); const pj = tl >= 1.9 + j * 0.15;
      html += `<div style="position:absolute;left:${16 + j * 224}px;top:370px;opacity:${k};transform:translateY(${(1 - k) * 30}px)">${slide(208, 117, j)}
        <div class="bdg" style="right:6px;bottom:6px;font-size:16px;padding:3px 8px;background:${pj ? '#e5484d' : '#c43e1c'}">${pj ? 'PDF' : 'PPT'}</div>
        <div style="text-align:center;font-weight:700;font-size:22px;color:#64748b;margin-top:6px">${pj ? 'Page' : 'Slide'} ${j + 1}</div></div>`;
    }
    if (tl < 1.75) html += `<div style="position:absolute;left:0;right:0;top:560px;text-align:center">${btn('Convert to PDF', tl > 0.6 && tl < 0.85)}</div>`;
    if (tl >= 0.85 && tl < 1.75) html += spinner(tl, `Converting ${D.n} slides…`, Math.min(sg(tl, 0.85, 1.0), 1 - sg(tl, 1.55, 1.75)));
    if (tl >= 2.4) html += `<div style="position:absolute;left:0;right:0;top:560px;text-align:center">${btn(dlIcon(tl) + `${D.name}.pdf · ${D.n} pages · ${D.mb}`, false)}</div>`;
    return html;
  },

  redact(tl, ci) {
    const D = [
      [['Name', 'Rahul Sharma', 0], ['Email', 'rahul@sharmatraders.in', 1], ['Phone', '+91 98220 41567', 2], ['Account', '5010 0223 1908', 3], ['Amount', '₹48,200', 0]],
      [['Employee', 'Neha Joshi', 0], ['Email', 'neha.joshi@acme.co', 1], ['Phone', '+91 90110 55432', 2], ['Salary', '₹62,000 per month', 3], ['Joining', '12 Jan 2026', 0]],
      [['Patient', 'Amit Kulkarni', 3], ['Email', 'amit.k@mailbox.in', 1], ['Phone', '+91 70200 18934', 2], ['Patient ID', 'MR 20871', 0], ['Visit', '28 Oct 2026', 0]],
    ][ci];
    const title = ['Invoice', 'Offer letter', 'Lab report'][ci];
    const mk = [0, sg(tl, 0.5, 0.7), sg(tl, 0.95, 1.15), sg(tl, 1.3, 1.75)];
    const black = sg(tl, 2.0, 2.3);
    const a = sg(tl, 0, 0.35);
    let html = `<div class="doc" style="left:0;top:0;width:530px;height:610px;opacity:${a}"><div style="height:60px;background:#1f2937;color:#fff;font-weight:800;font-size:28px;display:flex;align-items:center;padding:0 26px">${title}</div>
      <div style="padding:20px 26px">${D.map(([l, v, g]) => {
        const m = mk[g];
        return `<div style="margin:22px 0;font-size:24px;color:#64748b;font-weight:700">${l}<div><div style="margin-top:6px;font-size:29px;color:#1e293b;font-weight:700;position:relative;display:inline-block;white-space:nowrap">${v}
          ${g ? `<span style="position:absolute;left:-6px;top:-4px;bottom:-4px;width:${g === 3 ? `calc(${m * 100}% + 12px)` : 'calc(100% + 12px)'};opacity:${g === 3 ? (m > 0 ? 1 : 0) : m};border:3px dashed ${black ? 'transparent' : '#ef4444'};background:${black ? `rgb(17 17 17 / ${black})` : 'rgb(239 68 68 / .12)'};border-radius:4px"></span>` : ''}</div></div></div>`;
      }).join('')}</div><div class="bdg" style="right:14px;bottom:14px;background:#e5484d">PDF</div></div>`;
    if (tl > 1.3 && tl < 1.85) html += `<div style="position:absolute;left:${lerp(40, 330, sg(tl, 1.3, 1.75))}px;top:${135 + D.findIndex((d) => d[2] === 3) * 106}px;font-size:44px">✋</div>`;
    const b = (t, on, hit) => `<div style="padding:16px 18px;border-radius:14px;font-weight:800;font-size:25px;text-align:center;border:2px solid ${on ? 'var(--ac)' : '#e2e8f0'};background:${on ? 'color-mix(in srgb,var(--ac) 12%,#fff)' : '#fff'};color:var(--ink);transform:scale(${hit ? 0.94 : 1});margin-bottom:14px">${t}</div>`;
    html += `<div style="position:absolute;left:556px;top:0;width:356px;opacity:${a}">
      ${field('Word or phrase', '', false)}<div style="height:20px"></div>
      ${b('✉ Mark emails', mk[1] > 0, tl > 0.4 && tl < 0.6)}${b('☎ Mark phone numbers', mk[2] > 0, tl > 0.85 && tl < 1.05)}${b('▭ Draw a box', mk[3] > 0, tl > 1.2 && tl < 1.4)}
      <div style="font-size:23px;font-weight:700;color:#64748b;margin:6px 0 10px">Box colour</div><div style="display:flex;gap:10px">${chipSel(['Black', 'White'], 0, 23)}</div>
      <div style="margin-top:28px">${tl < 2.3 ? btn('Redact PDF', tl > 1.9 && tl < 2.1, 'width:100%;justify-content:center') : btn(dlIcon(tl) + 'Download PDF', false, 'width:100%;justify-content:center')}</div></div>`;
    if (tl >= 2.4) html += `<div style="position:absolute;left:556px;width:356px;top:585px;text-align:center">${pill('✓ Removed for good', sg(tl, 2.4, 2.7), '#16a34a')}</div>`;
    return html;
  },

  cropimg(tl, ci) {
    const D = [{ r: 1, sel: 1, px: '3024 × 3024', use: 'Instagram post' }, { r: 16 / 9, sel: 4, px: '4032 × 2268', use: 'YouTube thumbnail' }, { r: 9 / 16, sel: 5, px: '1701 × 3024', use: 'Story and Reels' }][ci];
    const PW = 600, PH = 450, X = 156;
    let bw = PW, bh = PW / D.r; if (bh > PH) { bh = PH; bw = PH * D.r; }
    const k = sg(tl, 0.55, 1.2);
    const cw = lerp(PW, bw, k), ch = lerp(PH, bh, k), cx = (PW - cw) / 2, cy = (PH - ch) / 2;
    const z = sg(tl, 2.05, 2.5);
    const s = lerp(1, Math.min(PW / bw, PH / bh), z);
    let html = `<div style="position:absolute;left:${X}px;top:0;width:${PW}px;height:${PH}px;border-radius:14px;overflow:hidden;background:#0f172a">
      <div style="position:absolute;inset:0;transform:scale(${s});transform-origin:50% 50%">${photo(ci + 5, PW, PH)}
      ${z < 1 ? `<div style="position:absolute;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px;box-shadow:0 0 0 2000px rgb(0 0 0 / ${0.55 * (1 - z)});outline:4px solid rgb(255 255 255 / ${1 - z})">
        ${[1, 2].map((q) => `<div style="position:absolute;left:${(q * 100) / 3}%;top:0;bottom:0;width:2px;background:rgb(255 255 255 / ${0.5 * (1 - z)})"></div><div style="position:absolute;top:${(q * 100) / 3}%;left:0;right:0;height:2px;background:rgb(255 255 255 / ${0.5 * (1 - z)})"></div>`).join('')}
        ${[[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => `<div style="position:absolute;left:${u ? 'calc(100% - 16px)' : '-8px'};top:${v ? 'calc(100% - 16px)' : '-8px'};width:24px;height:24px;background:#fff;border-radius:5px;opacity:${1 - z}"></div>`).join('')}</div>` : ''}</div>
      <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center"><span style="background:rgb(0 0 0 / .65);color:#fff;font-weight:800;font-size:30px;padding:8px 18px;border-radius:12px">${k < 1 ? '4032 × 3024' : D.px}</span></div></div>`;
    html += `<div style="position:absolute;left:0;right:0;top:474px;display:flex;gap:10px;justify-content:center">${chipSel(['Free', '1:1', '4:3', '3:2', '16:9', '9:16'], tl < 0.45 ? 0 : D.sel, 25)}</div>
      <div style="position:absolute;left:0;right:0;top:560px;text-align:center">${tl < 2.05 ? btn('Crop image', tl > 1.8 && tl < 2.05) : btn(dlIcon(tl) + 'Download image', false)}</div>`;
    if (tl >= 2.6) html += `<div style="position:absolute;left:0;right:0;top:20px;text-align:center">${pill('✓ Perfect for ' + D.use, sg(tl, 2.6, 2.9), '#16a34a')}</div>`;
    return html;
  },

  webp2jpg(tl, ci) {
    const F = [
      [['beach-photo', '78 KB', '224 KB', '1600 × 1200'], ['product', '118 KB', '265 KB', '1600 × 1067'], ['banner', '98 KB', '254 KB', '1200 × 1600']],
      [['sunset', '118 KB', '265 KB', '1600 × 1067'], ['logo-design', '98 KB', '254 KB', '1200 × 1600'], ['team-photo', '78 KB', '224 KB', '1600 × 1200']],
      [['recipe', '98 KB', '254 KB', '1200 × 1600'], ['screenshot', '78 KB', '224 KB', '1600 × 1200'], ['poster', '118 KB', '265 KB', '1600 × 1067']],
    ][ci];
    const a = sg(tl, 0, 0.35);
    let html = '';
    F.forEach(([n, s0, s1, px], i) => {
      const k = sg(tl, 0.15 + i * 0.12, 0.45 + i * 0.12);
      const t0 = 0.95 + i * 0.3, done = tl >= t0 + 0.35;
      html += `<div class="file" style="margin-bottom:16px;opacity:${k};transform:translateX(${(1 - k) * 60}px)">${fileIcon(done ? 'JPG' : 'WEBP', done ? 'var(--ac)' : '#0ea5e9')}
        <div style="flex:1"><div class="fn">${n}.${done ? 'jpg' : 'webp'}</div><div class="fs">${done ? `${s0} → ${s1} · ${px}` : s0 + ' · ' + px}</div></div>
        ${tl >= t0 && !done ? `<div style="width:44px;height:44px;border-radius:50%;border:5px solid #e2e8f0;border-top-color:var(--ac);transform:rotate(${tl * 720}deg)"></div>` : done ? `<div style="font-size:38px;color:#16a34a;font-weight:900">✓</div>` : ''}</div>`;
    });
    html += `<div style="margin-top:12px;opacity:${a}"><div style="font-size:24px;font-weight:700;color:#64748b;margin-bottom:12px">Quality: 90%</div>
      <div style="height:12px;border-radius:6px;background:#e2e8f0;position:relative"><div style="height:100%;width:83%;background:var(--ac);border-radius:6px"></div><div style="position:absolute;left:calc(83% - 16px);top:-10px;width:32px;height:32px;border-radius:50%;background:#fff;border:4px solid var(--ac)"></div></div></div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:30px">${['Opens in WhatsApp', 'Word', 'Any phone'].map((t, i) => pill('✓ ' + t, sg(tl, 2.2 + i * 0.15, 2.45 + i * 0.15), '#16a34a')).join('')}</div>
      <div style="position:absolute;left:0;right:0;top:575px;text-align:center">${tl < 2.1 ? btn('Convert to JPG', tl > 0.75 && tl < 0.95) : btn(dlIcon(tl) + 'Download all (ZIP)', false)}</div>`;
    return html;
  },

  qr(tl, ci) {
    const D = [
      { tab: 0, f: [['Website address', 'zentapdf.com']], q: 'https://zentapdf.com', col: '#111111' },
      { tab: 2, f: [['Network name (SSID)', 'Cafe Guest'], ['Password', 'coffee2026']], q: 'WIFI:T:WPA;S:Cafe Guest;P:coffee2026;;', col: '#1e3a8a' },
      { tab: 1, f: [['Text', 'Happy Diwali from ZentaPDF!']], q: 'Happy Diwali from ZentaPDF!', col: '#9f1239' },
    ][ci];
    const a = sg(tl, 0, 0.35);
    let t0 = 0.4, html = `<div style="display:flex;gap:10px;justify-content:center;opacity:${a}">${chipSel(['Website', 'Text', 'Wi-Fi', 'WhatsApp', 'Email'], D.tab, 25)}</div>
      <div style="position:absolute;left:0;top:90px;width:420px;opacity:${a}">`;
    D.f.forEach(([l, v], i) => {
      const cps = Math.max(14, v.length / 0.9); const s = typed(v, tl, t0, cps); const on = tl >= t0 && tl < t0 + v.length / cps + 0.1;
      html += `<div style="margin-bottom:22px">${field(l, `<span style="font-size:${v.length > 16 ? 26 : 32}px;white-space:nowrap">${s}</span>` + caret(tl, on), on)}</div>`;
      t0 += v.length / cps + 0.15;
    });
    const done = sg(tl, t0 - 0.1, t0 + 0.4);
    const sw = ['#111111', '#1e3a8a', '#9f1239', '#166534'];
    html += `<div style="font-size:24px;font-weight:700;color:#64748b;margin:8px 0 12px">Colour</div><div style="display:flex;gap:14px">${sw.map((c) => `<div style="width:52px;height:52px;border-radius:14px;background:${c};box-shadow:${c === D.col ? '0 0 0 4px #fff,0 0 0 7px ' + c : 'none'}"></div>`).join('')}</div>
      <div style="font-size:24px;font-weight:700;color:#64748b;margin:24px 0 12px">Size</div><div style="display:flex;gap:10px">${chipSel(['512 px', '1024 px'], 1, 23)}</div></div>`;
    const svg = (QR[D.q] || '').replace(/#111111/g, D.col);
    html += `<div style="position:absolute;left:470px;top:90px;width:420px;height:420px;background:#fff;border-radius:22px;box-shadow:0 0 0 3px ${done >= 1 ? 'var(--ac)' : '#e2e8f0'},0 24px 50px -24px rgb(0 0 0 / .45);display:grid;place-items:center">
      <div style="width:340px;height:340px;opacity:${0.12 + 0.88 * done};filter:blur(${(1 - done) * 6}px);transform:scale(${0.9 + 0.1 * done})">${svg.replace('<svg ', '<svg width="340" height="340" ')}</div></div>`;
    html += `<div style="position:absolute;left:0;right:0;top:560px;display:flex;gap:16px;justify-content:center">${btn(dlIcon(tl) + 'Download PNG', tl > 2.3 && tl < 2.5)}${btn('SVG', false, 'background:#fff;color:var(--ink);box-shadow:0 0 0 2px #e2e8f0')}</div>`;
    if (tl >= 2.6) html += `<div style="position:absolute;left:470px;width:420px;top:30px;text-align:center">${pill('✓ Ready to scan · never expires', sg(tl, 2.6, 2.9), '#16a34a')}</div>`;
    return html;
  },
});
Object.assign(SOUND, {
  editpdf: { pop: [0.35, 2.5], tick: [0.55, 0.65, 0.75, 0.85, 1.0, 1.1, 1.2, 1.3, 1.4], whoosh: [1.95], ding: [2.7] },
  rotate: { pop: [0.8, 1.15, 1.5, 2.25], ding: [2.45] },
  pagenum: { pop: [0.9, 1.15, 1.4, 1.65], ding: [2.2] },
  reorder: { pop: [0.6, 1.6, 2.0], whoosh: [0.8], ding: [2.15] },
  excel2pdf: { pop: [0.4, 1.75], whoosh: [1.5], ding: [2.3] },
  ppt2pdf: { pop: [0.7, 1.9, 2.05, 2.2, 2.35], whoosh: [1.5], ding: [2.4] },
  redact: { pop: [0.5, 0.95, 1.3, 1.95], whoosh: [2.05], ding: [2.4] },
  cropimg: { pop: [0.45, 1.85], whoosh: [2.1], ding: [2.6] },
  webp2jpg: { pop: [0.8, 1.3, 1.6, 1.9], ding: [2.2] },
  qr: { tick: [0.45, 0.6, 0.75, 0.9, 1.05, 1.2], pop: [2.35], ding: [1.5] },
});
