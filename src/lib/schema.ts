import { SITE_URL, SITE_NAME } from '../config.js';
export const abs = (p: string) => new URL(p, SITE_URL).href;
export const breadcrumbSchema = (items: { name: string; href: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.href) })),
});
export const faqSchema = (faqs: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
export const howToSchema = (name: string, steps: string[]) => ({
  '@context': 'https://schema.org', '@type': 'HowTo', name,
  step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
});
export const appSchema = (name: string, description: string, url: string) => ({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: `${name} – ${SITE_NAME}`,
  applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', url: abs(url), description,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});
