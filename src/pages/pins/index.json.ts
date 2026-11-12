import type { APIRoute } from 'astro';
import { allPins, pinDate, manualPins, pinLink, pinDescription } from '../../lib/pins';
import { SITE_URL } from '../../config.js';

// Machine list of every pin (used by tools/pins/*.py for the schedule and the bulk-upload .csv).
export const GET: APIRoute = () => new Response(JSON.stringify(allPins.map((p) => ({
  id: p.id, group: p.group, date: pinDate(p) ?? null, manual: manualPins.has(p.id), title: p.feedTitle, link: pinLink(p), image: SITE_URL + p.img,
  description: pinDescription(p), keywords: p.tags.map((t) => t.slice(1)).join(', '),
}))), { headers: { 'Content-Type': 'application/json' } });
