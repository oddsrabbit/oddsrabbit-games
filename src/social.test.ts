import assert from 'node:assert/strict';
import test from 'node:test';

import { starterBurrow } from './decor';
import { newPet } from './sim';
import { applyGift, buildShowcase, readShowcase, showcaseSignature } from './social';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = () => newPet('p1', 'Clover', 'cocoa', NOON, 'UTC');

test('a showcase round-trips through a friend reading it', () => {
  const d = buildShowcase(pet(), starterBurrow());
  const back = readShowcase(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back, d);
  assert.ok(JSON.stringify(d).length < 8192);
});

test("a friend's snapshot is checked and clamped before it's drawn", () => {
  assert.equal(readShowcase({ v: 1, name: 'X', coat: 'plaid' }), null);
  assert.equal(readShowcase('nope'), null);
  const d = readShowcase({
    v: 1, name: 'A very long rabbit name indeed', coat: 'snow', needs: { hunger: 900, happy: 'x' },
    head: 'crown-of-doom', neck: 'bell', marking: '<script>',
    items: [{ id: 'plant', x: 9999, y: 50 }, { id: 'unknown', x: 1, y: 1 }, null],
  });
  assert.ok(d);
  assert.equal(d.name.length, 16);
  assert.equal(d.needs.hunger, 100);
  assert.equal(d.needs.happy, 70);
  assert.equal(d.head, null);
  assert.equal(d.neck, 'bell');
  assert.equal(d.marking, null);
  assert.deepEqual(d.items, [{ id: 'plant', x: 98, y: 50, flip: false }]);
});

test("a friend's ears come through, and older or odd snapshots read as long", () => {
  const lop = buildShowcase(newPet('p2', 'Bun', 'snow', NOON, 'UTC', 'lop'), starterBurrow());
  assert.equal(lop.ears, 'lop');
  assert.equal(readShowcase(JSON.parse(JSON.stringify(lop)))?.ears, 'lop');
  assert.equal(readShowcase({ v: 1, name: 'Old', coat: 'snow' })?.ears, 'long');
  assert.equal(readShowcase({ v: 1, name: 'Odd', coat: 'snow', ears: 'antennae' })?.ears, 'long');
});

test('needs drifting alone does not call for a new publish', () => {
  const s = pet();
  const a = buildShowcase(s, starterBurrow());
  s.needs.hunger -= 10;
  s.simAtMs += 600_000;
  assert.equal(showcaseSignature(buildShowcase(s, starterBurrow())), showcaseSignature(a));
  s.name = 'Pip';
  assert.notEqual(showcaseSignature(buildShowcase(s, starterBurrow())), showcaseSignature(a));
});

test('gifts pay out, and an unknown kind still gives clover', () => {
  const s = pet();
  assert.equal(applyGift(s, 'clover').clover, s.clover + 5);
  assert.equal(applyGift(s, 'berry').pantry?.berries, 1);
  s.needs.happy = 95;
  assert.equal(applyGift(s, 'hug').needs.happy, 100);
  assert.equal(applyGift(s, 'sparkly-new-thing').clover, s.clover + 5);
});
