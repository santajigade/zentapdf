import type { APIRoute } from 'astro';
import { pinQueue, allPins } from '../../lib/pins';
import { pinJpg } from '../../lib/pinimg';

// Tall Pinterest images, only for pages already released (keeps builds fast).
export function getStaticPaths() {
  // PINS_ALL=1 renders every pin (local preview only)
  const list = process.env.PINS_ALL ? allPins : pinQueue().map((p) => p.pin);
  return list.map((pin) => ({ params: { path: pin.img.replace(/^\/pins\//, '').replace(/\.jpg$/, '') }, props: { pin } }));
}
export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await pinJpg((props as any).pin)), { headers: { 'Content-Type': 'image/jpeg' } });
