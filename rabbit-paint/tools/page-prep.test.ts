import assert from 'node:assert/strict';
import { prepare } from './lib/regions';
import { inkMask, prepPicture, scaledOptions } from '../src/worker/page-prep';

let failures = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}

/** A grey page whose paper darkens left to right, like a photo by a window. */
function shadedPage(w: number, h: number, paperFrom: number, paperTo: number) {
  const img = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img[y * w + x] = Math.round(paperFrom + ((paperTo - paperFrom) * x) / (w - 1));
  return img;
}
/** A box outline drawn `ink` darker than the paper under it. */
function box(img: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, ink: number, t = 6) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x - x0 < t || x1 - x < t || y - y0 < t || y1 - y < t) img[y * w + x] = Math.max(0, img[y * w + x] - ink);
  }
}

test('options scale with the picture', () => {
  const big = scaledOptions(2100, 2100, 1);
  assert.deepEqual(big, { closeRadius: 4, minArea: 600, maxStrokePx: 4000 });
  const small = scaledOptions(1050, 700, 1);
  assert.equal(small.minArea, 150);
  assert.ok(scaledOptions(1050, 700, 0).closeRadius! < small.closeRadius!);
  assert.ok(scaledOptions(1050, 700, 2).closeRadius! > small.closeRadius!);
});

test('pencil lines on shaded paper are ink; the shade is not', () => {
  const w = 400;
  const h = 300;
  const img = shadedPage(w, h, 235, 150);
  box(img, w, 60, 60, 340, 240, 60);
  // A plain cutoff calls the dark side of the paper ink and fills the box.
  const plain = prepare(img, w, h, { minArea: 500, maxStrokePx: 100, closeRadius: 2 });
  assert.notEqual(plain.regions.length, 2);
  const { grey, inkShare } = inkMask(img, w, h);
  assert.ok(inkShare < 0.1, `ink share ${inkShare}`);
  assert.equal(prepare(grey, w, h, { minArea: 500, maxStrokePx: 100, closeRadius: 2 }).regions.length, 2);
});

test('a wide picture keeps its shape in the thumbnails', () => {
  const w = 1200;
  const h = 600;
  const img = new Uint8Array(w * h).fill(255);
  box(img, w, 100, 100, 1100, 500, 255, 8);
  const r = prepPicture(img, w, h, 1);
  assert.equal(r.regions.length, 2);
  assert.equal(r.ids.length, w * h);
  assert.deepEqual([r.thumbW, r.thumbH], [360, 180]);
  // Inside the box is one region at full size and in the thumbnail.
  const inside = r.ids[300 * w + 600];
  assert.equal(r.thumbIds[90 * 360 + 180], inside);
  assert.ok(r.thumbInk.some((a) => a > 128), 'thumbnail ink is visible');
});

if (failures) process.exit(1);
