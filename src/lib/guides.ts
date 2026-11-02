export interface GuideFaq { q: string; a: string }
export interface GuideMeta {
  title: string; // <title> (≤ 60 chars)
  h1: string;
  description: string; // 120–160 chars
  date: string; // YYYY-MM-DD
  updated?: string;
  tool: string; // main tool slug
  tools?: string[]; // other related tools
  faqs?: GuideFaq[];
}
export interface Guide extends GuideMeta { slug: string; words: number; minutes: number; Content: any; headings: { depth: number; slug: string; text: string }[] }

const mods = import.meta.glob('../content/guides/*.md', { eager: true }) as Record<string, any>;
const raws = import.meta.glob('../content/guides/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

export const guides: Guide[] = Object.entries(mods).map(([path, m]) => {
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  const raw: string = (raws[path] ?? '').replace(/^---[\s\S]*?---/, '');
  const words = raw.split(/\s+/).filter(Boolean).length;
  return { ...(m.frontmatter as GuideMeta), slug, words, minutes: Math.max(2, Math.round(words / 220)), Content: m.Content, headings: m.getHeadings?.() ?? [] };
}).sort((a, b) => (b.updated ?? b.date).localeCompare(a.updated ?? a.date));

export const guidesForTool = (slug: string) => guides.filter((g) => g.tool === slug || g.tools?.includes(slug));
