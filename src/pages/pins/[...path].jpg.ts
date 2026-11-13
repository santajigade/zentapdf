import type { APIRoute } from 'astro';
import { allPins } from '../../lib/pins';
import { pinJpg } from '../../lib/pinimg';

// Tall Pinterest images for every page (pins are uploaded by .csv, scheduled ahead). Cached in .og-cache so rebuilds stay fast.
export function getStaticPaths() {
  const list = allPins;
  return list.map((pin) => ({ params: { path: pin.img.replace(/^\/pins\//, '').replace(/\.jpg$/, '') }, props: { pin } }));
}
export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await pinJpg((props as any).pin)), { headers: { 'Content-Type': 'image/jpeg' } });
