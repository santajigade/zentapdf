import { createRequire } from 'module'; const require = createRequire(import.meta.url); const QR = require('qrcode');
import fs from 'fs';
const urls = JSON.parse(fs.readFileSync('urls.json', 'utf8')); const out = {};
for (const u of urls) out[u] = await QR.toString(u, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
fs.writeFileSync('qr.js', 'window.QR=' + JSON.stringify(out) + ';');
