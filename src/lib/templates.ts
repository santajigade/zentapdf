// Free Templates section: loads one JSON spec per template (src/data/templates/<slug>.json) plus the built file sizes
// (src/data/template-files.json, written by tools/templates/build.mjs). A spec without built files is skipped.
import cats from '../data/template-categories.json';
import built from '../data/template-files.json';

export interface TplCategory { id: string; slug: string; name: string; plural: string; title: string; description: string; intro: string; color: string; tint: string; strong: string; icon: string }
export interface TplFaq { q: string; a: string }
export interface Template {
  slug: string; category: string; name: string; h1: string; metaTitle: string; metaDescription: string; short: string; accent?: string;
  useCases: string[]; industries: string[]; date: string; updated?: string; intro: string; howTo: string[];
  guide: { h: string; p: string[] }[]; tips: string[]; faqs: TplFaq[]; related?: string[]; tools?: string[]; keywords?: string[];
  // computed
  cat: TplCategory; url: string; files: { ext: string; size: number; label: string; app: string }[]; formats: string[]; pages: number; previews: number; words: number; land: boolean;
}
export const tplCategories = cats as TplCategory[];
const FMT: Record<string, [string, string]> = { docx: ['Word', 'Microsoft Word, Google Docs, LibreOffice'], xlsx: ['Excel', 'Microsoft Excel, Google Sheets, LibreOffice'], pdf: ['PDF', 'any PDF reader, print ready'] };
const mods = import.meta.glob('../data/templates/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const B = built as Record<string, { files: Record<string, number>; pages: number; previews: number }>;
const count = (s: string) => s.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;

export const templates: Template[] = Object.values(mods).filter((t) => B[t.slug] && !t.draft).map((t) => {
  const cat = tplCategories.find((c) => c.id === t.category);
  if (!cat) throw new Error(`template ${t.slug}: unknown category ${t.category}`);
  const b = B[t.slug];
  const files = Object.entries(b.files).map(([ext, size]) => ({ ext, size, label: FMT[ext][0], app: FMT[ext][1] }));
  const words = count([t.intro, ...t.howTo, ...t.guide.flatMap((g: any) => [g.h, ...g.p]), ...t.tips, ...t.faqs.flatMap((f: any) => [f.q, f.a])].join(' '));
  const pg = t.doc?.page ?? t.sheet?.sheets?.[0]?.page ?? {};
  return { ...t, land: pg.orientation === 'landscape', cat, url: `/templates/${cat.slug}/${t.slug}/`, files, formats: files.map((f) => f.label), pages: b.pages, previews: b.previews, words };
}).sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));

export const tplByCategory = (id: string) => templates.filter((t) => t.category === id);
export const fileUrl = (t: Template, ext: string) => `/templates/files/${t.slug}/${t.slug}.${ext}`;
export const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
// related: listed slugs first, then same category, then shared use case
export function relatedTemplates(t: Template, n = 4) {
  const out: Template[] = []; const add = (x?: Template) => { if (x && x.slug !== t.slug && !out.includes(x)) out.push(x); };
  (t.related ?? []).forEach((s) => add(templates.find((x) => x.slug === s)));
  tplByCategory(t.category).forEach(add);
  templates.filter((x) => x.useCases.some((u) => t.useCases.includes(u)) || x.industries.some((u) => t.industries.includes(u))).forEach(add);
  templates.forEach(add);
  return out.slice(0, n);
}
// light markup used in specs: **bold**
export const md = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
export const plain = (s: string) => s.replace(/\*\*/g, '');
