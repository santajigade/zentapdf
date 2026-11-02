import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { SITE_URL } from './src/config.js';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [preact(), sitemap({ filter: (p) => !p.includes('/404'), serialize: (item) => ({ ...item, lastmod: new Date().toISOString(), changefreq: item.url.includes('/guides/') ? 'monthly' : 'weekly', priority: item.url.endsWith('.com/') ? 1 : item.url.includes('/guides/') ? 0.6 : 0.8 }) })],
  vite: { worker: { format: 'es' } },
});
