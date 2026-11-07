// Builds the downloadable files for the Free Templates section from the JSON specs in src/data/templates/.
//   node tools/templates/build.mjs            -> build every template whose files are missing or older than its spec
//   node tools/templates/build.mjs all        -> rebuild everything
//   node tools/templates/build.mjs slug1 slug2
// Output: public/templates/files/<slug>/<slug>.(docx|xlsx|pdf), images via images.py, sizes in src/data/template-files.json
// Needs: LibreOffice (soffice) for PDF, poppler (pdftoppm) and Python Pillow for previews. Run in the Claude sandbox, not on Hostinger.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeDocx } from './docx-engine.mjs';
import { makeXlsx } from './xlsx-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPECS = path.join(ROOT, 'src/data/templates');
const FILES = path.join(ROOT, 'public/templates/files');
const MANIFEST = path.join(ROOT, 'src/data/template-files.json');
const TMP = '/tmp/ztpl';

const all = fs.readdirSync(SPECS).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const args = process.argv.slice(2);
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const stale = (slug) => {
  const m = manifest[slug]; if (!m) return true;
  const specTime = fs.statSync(path.join(SPECS, slug + '.json')).mtimeMs;
  return Object.keys(m.files).some((ext) => { const p = path.join(FILES, slug, `${slug}.${ext}`); return !fs.existsSync(p) || fs.statSync(p).mtimeMs < specTime; });
};
const list = args[0] === 'all' ? all : args.length ? args : all.filter(stale);
if (!list.length) { console.log('All template files are up to date.'); process.exit(0); }

fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const toPdf = [];
for (const slug of list) {
  const spec = JSON.parse(fs.readFileSync(path.join(SPECS, slug + '.json'), 'utf8'));
  if (spec.slug !== slug) throw new Error(`${slug}.json: slug field must be "${slug}"`);
  const dir = path.join(FILES, slug); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const accent = spec.accent || '#4F46E5';
  // a template can have a Word version, an Excel version or both; the PDF comes from Word when both exist
  let src;
  if (spec.sheet) { const p = path.join(dir, `${slug}.xlsx`); fs.writeFileSync(p, await makeXlsx(spec.sheet, accent, spec.name)); src = p; console.log('made', path.relative(ROOT, p)); }
  if (spec.doc) { const p = path.join(dir, `${slug}.docx`); fs.writeFileSync(p, await makeDocx(spec.doc, accent, spec.name)); src = p; console.log('made', path.relative(ROOT, p)); }
  if (!src) throw new Error(`${slug}: needs "doc" or "sheet"`);
  toPdf.push({ slug, src, dir });
}

// PDF with LibreOffice (one run for all files: much faster). Own profile so it never clashes with a running office.
execFileSync('soffice', ['-env:UserInstallation=file:///tmp/ztpl-lo', '--headless', '--convert-to', 'pdf', '--outdir', TMP, ...toPdf.map((x) => x.src)], { stdio: 'pipe', timeout: 300000 });
for (const { slug, src, dir } of toPdf) {
  const pdf = path.join(TMP, `${slug}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`${slug}: LibreOffice made no PDF`);
  fs.copyFileSync(pdf, path.join(dir, `${slug}.pdf`));
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  const pages = +(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 1);
  // page images for previews (page 1 big, up to 3 pages for the gallery)
  execFileSync('pdftoppm', ['-r', '130', '-f', '1', '-l', String(Math.min(3, pages)), '-png', pdf, path.join(TMP, slug)]);
  const files = {};
  for (const f of fs.readdirSync(dir)) files[f.split('.').pop()] = fs.statSync(path.join(dir, f)).size;
  const ordered = {}; for (const ext of ['docx', 'xlsx', 'pdf']) if (files[ext]) ordered[ext] = files[ext];
  manifest[slug] = { files: ordered, pages, previews: Math.min(3, pages), built: new Date().toISOString().slice(0, 10) };
  void src;
}
execFileSync('python3', [path.join(ROOT, 'tools/templates/images.py'), TMP, ...toPdf.map((x) => x.slug)], { stdio: 'inherit' });

// Share image (1200 x 630) per template: light category tint, title, page preview. public/og/templates/<slug>.jpg
{
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/template-categories.json'), 'utf8'));
  const logo = fs.readFileSync(path.join(ROOT, 'public/logo.svg'), 'utf8').replace('<svg ', '<svg width="52" height="52" ');
  const OG = path.join(ROOT, 'public/og/templates'); fs.mkdirSync(OG, { recursive: true });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const { slug } of toPdf) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPECS, slug + '.json'), 'utf8'));
    const c = cats.find((x) => x.id === spec.category) ?? cats[0];
    const img = 'data:image/png;base64,' + fs.readFileSync(path.join(TMP, `${slug}-og-src.png`)).toString('base64');
    const land = (spec.doc?.page?.orientation || spec.sheet?.sheets?.[0]?.page?.orientation) === 'landscape';
    const fmts = Object.keys(manifest[slug].files).map((e) => e.toUpperCase()).join(' · ');
    const h = spec.name || spec.title;
    await page.setContent(`<html><body style="margin:0"><div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#0f172a;background:linear-gradient(135deg,${c.tint} 0%,#fff 55%,${c.tint} 100%)">
      <div style="position:absolute;right:-90px;top:-140px;width:560px;height:560px;border-radius:50%;background:${c.strong};opacity:.75"></div>
      <div style="position:absolute;left:64px;top:54px;display:flex;align-items:center;gap:14px">${logo}<span style="font-size:32px;font-weight:800">Zenta<span style="color:#4F46E5">PDF</span></span></div>
      <img src="${img}" style="position:absolute;${land ? 'right:56px;top:120px;width:500px' : 'right:96px;top:46px;height:600px'};border-radius:8px;box-shadow:0 30px 60px -20px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.08)">
      <div style="position:absolute;left:64px;top:160px;width:${land ? 520 : 600}px">
        <div style="display:inline-block;background:${c.strong};color:${c.color};border-radius:999px;padding:8px 20px;font-size:21px;font-weight:800;letter-spacing:.08em">FREE TEMPLATE</div>
        <div style="font-size:${h.length > 40 ? 50 : 58}px;font-weight:800;line-height:1.12;letter-spacing:-.02em;margin-top:22px">${esc(h)}</div>
        <div style="font-size:26px;color:#475569;margin-top:18px">${esc(fmts)} · Instant download</div>
      </div>
      <div style="position:absolute;left:64px;bottom:50px;background:${c.color};color:#fff;border-radius:999px;padding:10px 26px;font-size:25px;font-weight:800">zentapdf.com/templates</div>
    </div></body></html>`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(OG, `${slug}.jpg`), type: 'jpeg', quality: 86 });
  }
  await browser.close();
}

// keep manifest tidy: drop entries for deleted specs
for (const k of Object.keys(manifest)) if (!all.includes(k)) delete manifest[k];
const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1) + '\n');
console.log(`Built ${toPdf.length} template(s).`);
