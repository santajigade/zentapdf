// Quality gate for the Free Templates section. Run after build.mjs and before publishing:
//   node tools/templates/check.mjs            -> checks every template; exit code 1 if anything is wrong
// Checks: required fields, SEO lengths, word count, FAQs, no em/en dashes, valid category/tools/related,
// unique slugs and titles, files built and present, previews present, and Excel formulas recalculated without errors.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPECS = path.join(ROOT, 'src/data/templates');
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/template-categories.json'), 'utf8'));
const built = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/template-files.json'), 'utf8'));
const toolsSrc = fs.readFileSync(path.join(ROOT, 'src/data/tools.ts'), 'utf8');
const liveTool = (s) => new RegExp(`slug: '${s}',[^\\n]*live: true`).test(toolsSrc);
const specs = fs.readdirSync(SPECS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(SPECS, f), 'utf8')));
const slugs = new Set(specs.map((s) => s.slug));
const problems = [];
const bad = (slug, msg) => problems.push(`${slug}: ${msg}`);
const seen = { metaTitle: {}, metaDescription: {}, name: {} };

for (const t of specs) {
  const s = t.slug;
  for (const k of ['slug', 'category', 'name', 'h1', 'metaTitle', 'metaDescription', 'short', 'useCases', 'industries', 'date', 'intro', 'howTo', 'guide', 'tips', 'faqs']) if (!t[k] || (Array.isArray(t[k]) && !t[k].length)) bad(s, `missing ${k}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) bad(s, 'slug must be lowercase words joined by hyphens');
  if (!cats.some((c) => c.id === t.category)) bad(s, `unknown category ${t.category}`);
  if (t.metaTitle?.length > 60 || t.metaTitle?.length < 30) bad(s, `metaTitle ${t.metaTitle?.length} chars (30 to 60)`);
  if (t.metaDescription?.length > 160 || t.metaDescription?.length < 120) bad(s, `metaDescription ${t.metaDescription?.length} chars (120 to 160)`);
  if (t.short?.length > 120) bad(s, 'short text over 120 chars');
  if (t.faqs?.length < 4 || t.faqs?.length > 6) bad(s, `${t.faqs?.length} FAQs (4 to 6)`);
  if (t.howTo?.length < 4 || t.howTo?.length > 8) bad(s, `${t.howTo?.length} how-to steps (4 to 8)`);
  if (t.tips?.length < 3) bad(s, 'fewer than 3 tips');
  const text = [t.name, t.h1, t.metaTitle, t.metaDescription, t.short, t.intro, ...(t.howTo || []), ...(t.guide || []).flatMap((g) => [g.h, ...g.p]), ...(t.tips || []), ...(t.faqs || []).flatMap((f) => [f.q, f.a])].join(' ');
  const words = text.split(/\s+/).length;
  if (words < 450 || words > 900) bad(s, `${words} words of page content (aim 500 to 750)`);
  if (/[–—]/.test(JSON.stringify(t))) bad(s, 'contains an em or en dash (not allowed)');
  if (/lorem ipsum/i.test(JSON.stringify(t))) bad(s, 'contains lorem ipsum');
  for (const x of t.tools || []) if (!liveTool(x)) bad(s, `tool "${x}" is not a live ZentaPDF tool`);
  for (const x of t.related || []) if (!slugs.has(x)) bad(s, `related template "${x}" does not exist`);
  if (!t.doc && !t.sheet) bad(s, 'needs a "doc" (Word) or "sheet" (Excel) design');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) bad(s, 'date must be YYYY-MM-DD');
  for (const k of Object.keys(seen)) { if (seen[k][t[k]]) bad(s, `same ${k} as ${seen[k][t[k]]}`); seen[k][t[k]] = s; }
  if (t.draft) continue;
  const b = built[s];
  if (!b) { bad(s, 'files not built (run node tools/templates/build.mjs)'); continue; }
  for (const ext of Object.keys(b.files)) if (!fs.existsSync(path.join(ROOT, `public/templates/files/${s}/${s}.${ext}`))) bad(s, `missing file .${ext}`);
  if (t.doc && !b.files.docx) bad(s, 'Word file missing'); if (t.sheet && !b.files.xlsx) bad(s, 'Excel file missing');
  for (const f of [`public/templates/img/${s}.webp`, `public/templates/img/${s}-sm.webp`, `public/og/templates/${s}.png`]) if (!fs.existsSync(path.join(ROOT, f))) bad(s, `missing ${f}`);
  const maxPages = t.maxPages ?? (t.category === 'resume' || t.category === 'certificates' || t.category === 'planners' ? 1 : 2);
  if (b.pages > maxPages) bad(s, `PDF has ${b.pages} pages (max ${maxPages}); tighten the layout`);
  // Excel: recalculate in LibreOffice and look for formula errors in every sheet
  if (b.files.xlsx) {
    const out = `/tmp/ztpl-check/${s}`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
    try {
      execFileSync('soffice', ['-env:UserInstallation=file:///tmp/ztpl-lo', '--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', '--outdir', out, path.join(ROOT, `public/templates/files/${s}/${s}.xlsx`)], { stdio: 'pipe', timeout: 120000 });
      for (const f of fs.readdirSync(out)) { const csv = fs.readFileSync(path.join(out, f), 'utf8'); const m = csv.match(/#(VALUE|NAME\?|REF|DIV\/0|N\/A|NUM)!?|Err:\d+/); if (m) bad(s, `formula error ${m[0]} in ${f}`); }
    } catch (e) { bad(s, 'LibreOffice could not open the Excel file: ' + String(e).slice(0, 120)); }
  }
}
// queue sanity
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/templates/QUEUE.json'), 'utf8'));
const qs = {}; for (const q of Q.items) { if (qs[q.slug]) problems.push(`QUEUE: duplicate slug ${q.slug}`); qs[q.slug] = 1; if (q.status === 'published' && !slugs.has(q.slug)) problems.push(`QUEUE: ${q.slug} is marked published but has no spec`); }

console.log(`${specs.length} templates checked, ${problems.length} problems`);
for (const p of problems) console.log(' -', p);
process.exit(problems.length ? 1 : 0);
