// Writes simple placeholder pages (the mockups' doodles drawn at full size) so
// shelves and the daily rotation have more than one page during development.
// Each is marked `"sample": true`; the build leaves samples out unless
// SAMPLES=1, so they can't ship by accident.
//
//   node tools/run.mjs sample-pages && npm run prep-page -- --all

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SIZE = 2100;

const DOODLES: Array<{ slug: string; title: string; category: string; d: string }> = [
  { slug: 'sample-goldfish', title: 'Goldfish', category: 'animals', d: 'M10 32c8-12 26-14 36 0-10 14-28 12-36 0z M46 32l10-8v16z M20 29a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M30 24c2 5 2 11 0 16 M4 58c8-4 16 4 24 0s16-4 24 0 8 4 12 2' },
  { slug: 'sample-cat', title: 'Sleepy Cat', category: 'animals', d: 'M16 52V22l9 9h14l9-9v30z M25 40a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M35 40a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M30 46h4 M8 44h10 M46 44h10 M4 56h56' },
  { slug: 'sample-butterfly', title: 'Butterfly', category: 'animals', d: 'M32 18v32 M32 26c-10-14-24-8-20 4 3 8 14 6 20 0z M32 26c10-14 24-8 20 4-3 8-14 6-20 0z M32 34c-8 2-16 10-10 16 4 3 10-4 10-10z M32 34c8 2 16 10 10 16-4 3-10-4-10-10z M28 14l4 4 4-4 M18 24a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M40 24a3 3 0 1 0 6 0a3 3 0 1 0-6 0' },
  { slug: 'sample-daisy', title: 'Daisy', category: 'garden', d: 'M25 15a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M36 26a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M25 37a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M14 26a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M27 26a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M31 44h2v14h-2z M32 52c-6-6-12-4-12-4 6 6 12 4 12 4z M4 58h56' },
  { slug: 'sample-sunny-day', title: 'Sunny Day', category: 'garden', d: 'M22 32a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M31 8h2v8h-2z M31 48h2v8h-2z M8 31h8v2H8z M48 31h8v2h-8z M15 17l2-2 4 4-2 2z M43 45l2-2 4 4-2 2z M15 47l4-4 2 2-4 4z M43 19l4-4 2 2-4 4z' },
  { slug: 'sample-rocket', title: 'Rocket', category: 'vehicles', d: 'M32 8c8 8 10 20 6 32H26c-4-12-2-24 6-32z M28 24a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M26 40l-6 8 8-2z M38 40l6 8-8-2z M30 46l2 8 2-8z M8 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M50 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0' },
  { slug: 'sample-road-trip', title: 'Road Trip', category: 'vehicles', d: 'M8 42v-8l6-2 6-10h22l8 10 6 2v8z M14 46a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M40 46a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M23 24h10v8H18z M35 24h6l6 8H35z M2 56h60' },
  { slug: 'sample-cottage', title: 'Cottage', category: 'home', d: 'M12 30L32 14l20 16z M17 30v22h30V30 M28 52V40h8v12 M21 34h6v6h-6z M37 34h6v6h-6z M42 18h4v8l-4-3z M2 56h60' },
];

const CATEGORIES = [
  { id: 'animals', name: 'Animals' },
  { id: 'garden', name: 'Garden' },
  { id: 'vehicles', name: 'Things that go' },
  { id: 'home', name: 'Home' },
];

for (const p of DOODLES) {
  const dir = join('art', p.slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff"/><path d="${p.d}" fill="none" stroke="#000" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(dir, 'source.png'));
  writeFileSync(join(dir, 'page.config.json'), JSON.stringify({ title: p.title, category: p.category, sample: true }, null, 2) + '\n');
  console.log(`wrote ${dir}`);
}
console.log(`categories used: ${CATEGORIES.map((c) => c.id).join(', ')}`);
