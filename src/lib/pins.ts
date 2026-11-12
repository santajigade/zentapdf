// Pinterest pins: one tall image per page, released to /pins/feed.xml on the dates in src/data/pins.json.
import { tools, categories } from '../data/tools';
import { deviceTests } from '../data/devicetests';
import { guides } from './guides';
import { SITE_URL } from '../config.js';
import SCHEDULE from '../data/pins.json';
import MANUAL from '../data/pins-manual.json';

export interface Pin {
  id: string; // stable id used in pins.json, e.g. tool/merge-pdf
  title: string; // big text on the pin
  feedTitle: string; // pin title in the feed / csv
  sub: string; // one line under the title
  kicker: string; // category pill
  group: string; // category id for colour and round robin
  color: string;
  icon: string; // icon name from data/icons.ts
  ticks: string[];
  tags: string[];
  url: string; // page path
  img: string; // pin image path
  added?: string; // date the page went live, when known
}

// Pin background colour per category (multicolour feed)
export const PIN_COLORS: Record<string, string> = {
  organise: '#2563eb', edit: '#7c3aed', convert: '#059669', topdf: '#0891b2', security: '#b45309', utility: '#475569',
  imgconv: '#0d9488', gif: '#db2777', audio: '#ea580c', image: '#e11d48', device: '#4f46e5', guide: '#ca8a04',
};
const TAGS: Record<string, string[]> = {
  organise: ['#PDFtools', '#PDFtips', '#productivity'], edit: ['#PDFeditor', '#EditPDF', '#productivity'],
  convert: ['#PDFconverter', '#PDFtips', '#officetips'], topdf: ['#PDFconverter', '#officetips', '#PDFtips'],
  security: ['#PDFsecurity', '#privacy', '#PDFtools'], utility: ['#QRcode', '#freetools', '#smallbusiness'],
  imgconv: ['#imageconverter', '#photoediting', '#freetools'], gif: ['#GIF', '#GIFmaker', '#socialmedia'],
  audio: ['#audiotools', '#MP3', '#musicproduction'], image: ['#imageeditor', '#photoediting', '#freetools'],
  device: ['#techtips', '#laptop', '#gadgets'], guide: ['#PDFtips', '#howto', '#techtips'],
};
const cleanTitle = (s: string) => s.replace(/\s*\([^)]*\)/g, '').replace(/\s*[–—]\s*/g, ', ').trim();
const plain = (s: string) => s.replace(/\*\*|`/g, '').replace(/\s*[–—]\s*/g, ', ').replace(/₹\s?/g, 'Rs ');

function build(): Pin[] {
  const out: Pin[] = [];
  for (const t of tools.filter((x) => x.live)) {
    const cat = categories.find((c) => c.id === t.category)!;
    const audio = t.category === 'audio';
    out.push({
      id: `tool/${t.slug}`, title: cleanTitle(t.h1 && t.h1.length <= 30 ? t.h1 : t.name), feedTitle: cleanTitle(t.title), sub: plain(t.short),
      kicker: cat.name, group: t.category, color: PIN_COLORS[t.category], icon: t.icon,
      ticks: [audio ? 'Files never leave your device' : 'No watermark, no sign-up', 'Works on phone and PC', 'Free with no daily limits'],
      tags: TAGS[t.category], url: `/${t.slug}/`, img: `/pins/${t.slug}.jpg`,
    });
  }
  for (const d of deviceTests.filter((x) => x.live)) out.push({
    id: `test/${d.slug}`, title: cleanTitle(d.name), feedTitle: cleanTitle(d.title ?? d.name), sub: plain(d.short), kicker: 'Device Test', group: 'device',
    color: PIN_COLORS.device, icon: d.icon, ticks: ['Instant result in your browser', 'Nothing to install', 'Free, no sign-up'],
    tags: TAGS.device, url: `/device-test/${d.slug}/`, img: `/pins/device-test/${d.slug}.jpg`,
  });
  for (const g of guides) out.push({
    id: `guide/${g.slug}`, title: cleanTitle(g.h1), feedTitle: cleanTitle(g.title), sub: plain(g.description).split(/(?<=\.)\s/)[0], kicker: 'Free Guide', group: 'guide',
    color: PIN_COLORS.guide, icon: tools.find((t) => t.slug === g.tool)?.icon ?? 'text', ticks: ['Easy step-by-step guide', 'Free tool, no sign-up', 'Works on phone and PC'],
    tags: TAGS.guide, url: `/guides/${g.slug}/`, img: `/pins/guides/${g.slug}.jpg`, added: g.date,
  });
  return out;
}
export const allPins: Pin[] = build();

/** Pins uploaded by hand (.csv); they get images but stay out of the RSS feed so Pinterest never posts them twice. */
export const manualPins = new Set(MANUAL as string[]);

const DAY = 864e5;
export const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(+new Date(d) + DAY).toISOString().slice(0, 10);

/** Release date: the schedule, else the day after the page went live. */
export const pinDate = (p: Pin) => (SCHEDULE as Record<string, string>)[p.id] ?? (p.added ? nextDay(p.added) : undefined);

/** Released pins, newest first. */
export function pinQueue(): { pin: Pin; date: string }[] {
  const t = todayIST();
  return allPins.map((pin) => ({ pin, date: pinDate(pin)! }))
    .filter((p) => p.date && p.date <= t)
    .sort((a, b) => b.date.localeCompare(a.date) || a.pin.id.localeCompare(b.pin.id));
}

export const pinLink = (p: Pin) => `${SITE_URL}${p.url}?utm_source=pinterest&utm_medium=social&utm_campaign=pins`;
export const pinDescription = (p: Pin) => `${p.sub} Free online at ZentaPDF, no sign-up and no watermark. ${[...p.tags, '#ZentaPDF'].join(' ')}`;
