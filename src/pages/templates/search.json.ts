// Search index for the templates home page: /templates/search.json (fetched only when someone uses the search box)
import { templates } from '../../lib/templates';
export function GET() {
  const rows = templates.map((t) => ({
    n: t.name, u: t.url, s: t.slug, d: t.short, c: t.cat.name, f: t.formats, k: [...t.useCases, ...t.industries, ...(t.keywords ?? [])].join(' '),
  }));
  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}
