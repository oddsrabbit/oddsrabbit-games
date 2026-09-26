import assert from 'node:assert/strict';
import test from 'node:test';

import { drawRabbit } from './art/rabbit';
import { CATALOG, starterBurrow } from './decor';
import { OUTFITS } from './extras';
import { COATS, newPet } from './sim';
import { buildShowcase } from './social';
import { decodeFace, encodeSprites, WIDGET_FACES, widgetSprites } from './widgetSprites';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const HEADS = [null, ...OUTFITS.filter((o) => o.slot === 'head').map((o) => o.id)];
const NECKS = [null, ...OUTFITS.filter((o) => o.slot === 'neck').map((o) => o.id)];

test('every face decodes back to exactly what drawRabbit drew', () => {
  const dress = { head: 'witchhat', neck: 'bell', ears: 'lop' as const };
  const s = widgetSprites('midnight', dress);
  assert.ok(s);
  assert.deepEqual([s.w, s.h], [40, 40]);
  for (const face of WIDGET_FACES) {
    const grid = drawRabbit('midnight', face, 0, dress);
    const pixels = decodeFace(s.faces[face], s.w, s.h, s.palette.length);
    assert.ok(pixels, face);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const p = grid.px[y]![x]!;
        const i: number = pixels[y * s.w + x]!;
        if (p[3] === 0) assert.equal(i, -1, `${face} ${x},${y}`);
        else assert.equal(s.palette[i], p.slice(0, 3).map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join(''), `${face} ${x},${y}`);
      }
    }
  }
});

test('every look fits: under 52 colours, and a full burrow still publishes under 8 KB', () => {
  // The 40-item cap placed, all the longest id, which is the biggest a showcase gets.
  const burrow = starterBurrow();
  const longest = CATALOG.reduce((a, b) => (b.id.length > a.id.length ? b : a)).id;
  burrow.items = Array.from({ length: 40 }, (_, i) => ({ uid: `u${i}`, id: longest, placed: true, x: 90 + (i % 9), y: 110 + (i % 9), flip: true }));
  let biggest = 0;
  for (const coat of COATS) for (const ears of ['short', 'long', 'lop'] as const) {
    for (const head of HEADS) for (const neck of NECKS) {
      const pet = { ...newPet('p', 'Wwwwwwwwwwwwwwww', coat, NOON, 'UTC', ears), wardrobe: { owned: [], head, neck } };
      const d = buildShowcase(pet, burrow);
      assert.ok(d.widget, `${coat}/${ears}/${head}/${neck}`);
      biggest = Math.max(biggest, JSON.stringify(d).length);
    }
  }
  assert.ok(biggest < 8192, `largest showcase is ${biggest} bytes`);
});

test('malformed codes are refused, not half-drawn', () => {
  assert.equal(decodeFace('4A', 2, 2, 1)?.length, 4);
  assert.equal(decodeFace('3A', 2, 2, 1), null); // short
  assert.equal(decodeFace('5A', 2, 2, 1), null); // long
  assert.equal(decodeFace('4B', 2, 2, 1), null); // off the palette
  assert.equal(decodeFace('2A2?', 2, 2, 1), null); // not a code
  assert.equal(decodeFace('0A4A', 2, 2, 1), null); // zero run
});

test('more than 52 colours cannot be encoded', () => {
  const px = [Array.from({ length: 53 }, (_, i) => [i, 0, 0, 255] as const)];
  assert.equal(encodeSprites({ a: { w: 53, h: 1, px } }), null);
});
