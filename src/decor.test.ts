import assert from 'node:assert/strict';
import test from 'node:test';

import { clampToZone, readBurrow, starterBurrow, ZONES } from './decor';

test('positions are clamped to their zone and rounded to whole pixels', () => {
  assert.deepEqual(clampToZone('floor', -20, 500), { x: ZONES.floor.minX, y: ZONES.floor.maxY });
  assert.deepEqual(clampToZone('hang', 50.4, 20.6), { x: 50, y: 21 });
  assert.deepEqual(clampToZone('rug', 49, 0), { x: 49, y: ZONES.rug.minY });
});

test('a v1 save with fixed slots becomes free positions', () => {
  const b = readBurrow({
    v: 1,
    rev: 4,
    items: [
      { uid: 'a', id: 'cushion', slot: 'b2' },
      { uid: 'b', id: 'lantern', slot: 'h2' },
      { uid: 'c', id: 'rug', slot: null },
      { uid: 'd', id: 'no-such-thing', slot: 'b1' },
    ],
  });
  assert.ok(b);
  assert.equal(b.v, 2);
  assert.equal(b.rev, 4);
  assert.deepEqual(b.items, [
    { uid: 'a', id: 'cushion', x: 70, y: 99, flip: false, placed: true },
    { uid: 'b', id: 'lantern', x: 64, y: 13, flip: false, placed: true },
    { uid: 'c', id: 'rug', x: ZONES.rug.x, y: ZONES.rug.y, flip: false, placed: false },
  ]);
});

test('a v2 save round-trips, with positions re-clamped', () => {
  const s = starterBurrow();
  s.items[0]!.x = 999;
  const b = readBurrow(JSON.parse(JSON.stringify(s)));
  assert.ok(b);
  assert.equal(b.items[0]!.x, ZONES.floor.maxX);
  assert.equal(b.items[1]!.placed, true);
});

test('malformed saves are rejected', () => {
  assert.equal(readBurrow(null), null);
  assert.equal(readBurrow({ v: 3, items: [] }), null);
  assert.equal(readBurrow({ v: 2 }), null);
});
