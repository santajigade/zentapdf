import type { APIRoute } from 'astro';
import { SITE_URL } from '../../config.js';
import { pinQueue, manualPins, pinLink, pinDescription } from '../../lib/pins';

// RSS feed for Pinterest "Connect RSS feed": a few new pins every day (latest 60).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const GET: APIRoute = () => {
  const items = pinQueue().filter((p) => !manualPins.has(p.pin.id)).slice(0, 60).map(({ pin: p, date }) => {
    const img = SITE_URL + p.img;
    return `<item><title>${esc(p.feedTitle)}</title><link>${esc(pinLink(p))}</link><guid isPermaLink="false">zentapdf-pin-${p.id}</guid>
<pubDate>${new Date(date + 'T06:00:00+05:30').toUTCString()}</pubDate><category>${esc(p.kicker)}</category>
<description>${esc(pinDescription(p))}</description>
<enclosure url="${img}" type="image/jpeg" length="0"/><media:content url="${img}" medium="image" type="image/jpeg" width="1000" height="1500"/></item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>ZentaPDF: free PDF, image and audio tools</title><link>${SITE_URL}/</link><description>Free online PDF, image, audio and device test tools. No sign-up, no watermark.</description><language>en</language>
${items.join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
