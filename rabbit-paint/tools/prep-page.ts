// Prepares one coloring page from art/<slug>/:
//
//   node tools/run.mjs prep-page monkey-sun-hat
//   node tools/run.mjs prep-page --all
//
// Reads  source.(png|jpg)  the line art, any background (transparent → white)
//        page.config.json  title, category, merge hints, option overrides
// Writes lineart.png       kept ink, black on transparent: drawn over the fills
//        lineart.svg       the same ink traced into smooth outlines: what the paint screen shows
//        regions.png       region id per pixel as RGB (id + 1, little-endian): what a tap fills
//        page.json         size, regions (area, bbox, label point), stats
//        preview.png       every region a distinct pastel: for the curator to check merges
//        thumb-*.png       copies of lineart and regions 360 px on the long side, for thumbnails

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { dilate, prepare, type PrepOptions } from './lib/regions';
import { inkSvg } from './lib/trace';

interface PageConfig {
  title: string;
  category: string;
  /** Username of the player who sent it in, for pages from submissions. */
  credit?: string;
  /** Groups of [x, y] source pixels to join into one region. */
  merges?: PrepOptions['merges'];
  options?: Partial<Omit<PrepOptions, 'merges'>>;
}

const ART = 'art';
const THUMB = 360;

async function prepOne(slug: string) {
  const dir = join(ART, slug);
  const source = ['source.png', 'source.jpg', 'source.jpeg'].map((f) => join(dir, f)).find(existsSync);
  if (!source) throw new Error(`${dir}: no source.png or source.jpg`);
  const config = JSON.parse(readFileSync(join(dir, 'page.config.json'), 'utf8')) as PageConfig;

  // Flatten onto white first: transparent line art otherwise reads as all ink.
  const { data, info } = await sharp(source).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const res = prepare(new Uint8Array(data.buffer, data.byteOffset, data.length), w, h, { ...config.options, merges: config.merges ?? [] });

  const n = w * h;
  const lineart = Buffer.alloc(n * 4);
  const regions = Buffer.alloc(n * 3);
  const preview = Buffer.alloc(n * 3);
  const tint = res.regions.map((r) => pastel(r.id));
  for (let p = 0; p < n; p++) {
    const id = res.owner[p];
    if (res.ink[p]) lineart[p * 4 + 3] = 255;
    regions[p * 3] = (id + 1) & 255;
    regions[p * 3 + 1] = (id + 1) >> 8;
    const c = res.ink[p] ? [0, 0, 0] : tint[id];
    preview.set(c, p * 3);
  }
  await sharp(lineart, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(dir, 'lineart.png'));
  writeFileSync(join(dir, 'lineart.svg'), inkSvg(res.ink, w, h));
  await sharp(regions, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(dir, 'regions.png'));
  await sharp(preview, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(dir, 'preview.png'));
  // Small copies for home cards and gallery thumbnails, the same shape as the
  // page (art.ts maps taps by width alone). Nearest-neighbour for the id map:
  // averaging ids would invent regions.
  const fit = { width: THUMB, height: THUMB, fit: 'inside' } as const;
  await sharp(regions, { raw: { width: w, height: h, channels: 3 } }).resize({ ...fit, kernel: 'nearest' }).png().toFile(join(dir, 'thumb-regions.png'));
  // Thicken the ink first: a 5 px line shrunk ~6× would fade to a grey hairline.
  const bold = dilate(res.ink, w, h, Math.max(1, Math.round(w / THUMB / 2)));
  const thumbInk = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) if (bold[p]) thumbInk[p * 4 + 3] = 255;
  await sharp(thumbInk, { raw: { width: w, height: h, channels: 4 } }).resize(fit).png().toFile(join(dir, 'thumb-lineart.png'));

  const smallest = Math.min(...res.regions.map((r) => r.area));
  writeFileSync(join(dir, 'page.json'), JSON.stringify({
    slug, title: config.title, category: config.category, ...(config.credit ? { credit: config.credit } : {}), width: w, height: h,
    regions: res.regions, stats: { ...res.stats, regions: res.regions.length, smallestArea: smallest },
  }, null, 1) + '\n');
  console.log(`${slug}: ${res.stats.rawRegions} raw → ${res.regions.length} regions (dropped ${res.stats.droppedStrokes} loose strokes, merged ${res.stats.tinyMerged} tiny areas, smallest ${smallest} px²)`);
}

function pastel(id: number): number[] {
  const h = (id * 137.508) % 360;
  const s = 0.55;
  const l = 0.78;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const args = process.argv.slice(2);
const slugs = args[0] === '--all'
  ? readdirSync(ART, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ART, d.name, 'page.config.json'))).map((d) => d.name)
  : args;
if (!slugs.length) {
  console.error('usage: node tools/run.mjs prep-page <slug>... | --all');
  process.exit(1);
}
for (const slug of slugs) await prepOne(slug);
