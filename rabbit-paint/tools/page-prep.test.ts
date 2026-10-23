import assert from 'node:assert/strict';
import { prepare } from './lib/regions';
import { darkParts, greyOf, inkMask, pickStyle, prepPicture, scaledOptions } from '../src/worker/page-prep';

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

/** Grey pixels as RGB. */
const rgbOf = (grey: Uint8Array) => { const rgb = new Uint8Array(grey.length * 3); grey.forEach((g, p) => rgb.fill(g, p * 3, p * 3 + 3)); return rgb; };
/** A flat picture: `paint(x, y)` gives each pixel's colour. */
function picture(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(paint(x, y), (y * w + x) * 3);
  return rgb;
}
const inkShareOf = (ink: Uint8Array) => ink.reduce((a, v) => a + v, 0) / ink.length;

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
  const r = prepPicture(rgbOf(img), w, h, 1);
  assert.equal(r.style, 'lines');
  assert.equal(r.regions.length, 2);
  assert.equal(r.ids.length, w * h);
  assert.deepEqual([r.thumbW, r.thumbH], [360, 180]);
  // Inside the box is one region at full size and in the thumbnail.
  const inside = r.ids[300 * w + 600];
  assert.equal(r.thumbIds[90 * 360 + 180], inside);
  assert.ok(r.thumbInk.some((a) => a > 128), 'thumbnail ink is visible');
});

test('line art stays lines; a colour picture or a black background gets outlined', () => {
  const w = 400;
  const h = 300;
  const art = new Uint8Array(w * h).fill(255);
  box(art, w, 60, 60, 340, 240, 255);
  const artRgb = rgbOf(art);
  assert.equal(pickStyle(artRgb, darkParts(greyOf(artRgb), w, h).solidShare), 'lines');
  const orange = picture(w, h, (x) => (x < 200 ? [245, 160, 70] : [255, 255, 255]));
  assert.equal(pickStyle(orange, darkParts(greyOf(orange), w, h).solidShare), 'outline');
  const logo = picture(w, h, (x, y) => (x > 150 && x < 250 && y > 100 && y < 200 ? [128, 128, 128] : [0, 0, 0]));
  assert.equal(pickStyle(logo, darkParts(greyOf(logo), w, h).solidShare), 'outline');
});

test('outline: two light colours side by side become two areas with a line between', () => {
  const w = 1000;
  const h = 600;
  const rgb = picture(w, h, (x) => (x < 500 ? [245, 160, 70] : [250, 230, 160]));
  const r = prepPicture(rgb, w, h, 1);
  assert.equal(r.style, 'outline');
  assert.equal(r.regions.length, 2);
  assert.equal(r.ink[300 * w + 500] || r.ink[300 * w + 499], 1, 'a line where the colours meet');
  assert.notEqual(r.ids[300 * w + 100], r.ids[300 * w + 900]);
});

test('outline: a black background is an area to color, not solid ink', () => {
  const w = 1000;
  const h = 1000;
  const rgb = picture(w, h, (x, y) => ((x - 500) ** 2 + (y - 500) ** 2 < 250 ** 2 ? [245, 196, 0] : [0, 0, 0]));
  const lines = prepPicture(rgb, w, h, 1, 'lines');
  assert.ok(inkShareOf(lines.ink) > 0.5, 'as drawn, the black is ink');
  const outline = prepPicture(rgb, w, h, 1);
  assert.ok(inkShareOf(outline.ink) < 0.05, `ink share ${inkShareOf(outline.ink)}`);
  assert.equal(outline.regions.length, 2);
});

test('outline: thin dark strokes in a colour picture stay lines', () => {
  const w = 1000;
  const h = 600;
  // Two colours split by a 6 px black stroke at x = 300.
  const rgb = picture(w, h, (x) => (Math.abs(x - 300) < 3 ? [10, 10, 10] : x < 300 ? [120, 190, 240] : [245, 160, 70]));
  const r = prepPicture(rgb, w, h, 1, 'outline');
  assert.equal(r.ink[300 * w + 300], 1);
  assert.equal(r.regions.length, 2);
});

test('outline: a grainy photo is simplified to a few dozen areas', () => {
  const w = 1200;
  const h = 900;
  // Soft shading over the whole picture, with grain on every pixel.
  let seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 60; };
  const rgb = picture(w, h, (x, y) => {
    const v = 120 + 80 * Math.sin(x / 90) * Math.cos(y / 70) + noise();
    return [v + 40, v, v * 0.6].map((c) => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
  });
  for (const [gaps, most] of [[0, 100], [1, 60], [2, 30]] as const) {
    const r = prepPicture(rgb, w, h, gaps, 'outline');
    assert.ok(r.regions.length >= 2 && r.regions.length <= most * 1.2, `gaps ${gaps}: ${r.regions.length} areas`);
  }
});

if (failures) process.exit(1);
