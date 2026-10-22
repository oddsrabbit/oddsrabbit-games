// The garden's meadow (docs/rabbit-pets-garden.md §6): outdoor pieces, where
// they go. All decor: none of them changes what anything pays.
import assert from 'node:assert/strict';
import test from 'node:test';

import { byId, CATALOG, clampToZone, isOutdoor, meadowItems, meadowPieces, readBurrow, starterBurrow, ZONES, type BurrowState } from './decor';
import { buyUpgrade, hasUpgrade } from './extras';
import { AREA_W } from './garden';
import { newPet, type PetState } from './sim';
import { buildShowcase } from './social';
import { HOUR_MS, MEADOW } from './tuning';
import { perHour, setMeadow, stored } from './yard';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (): PetState => newPet('meadow-pet', 'Clover', 'snow', NOON, 'UTC');
/** A full yard: 10 patches, 5 hives, 5 logs, storage counted from noon. */
function fullYard(): PetState {
  const s = pet();
  s.yard = { counts: { patch: 10, hive: 5, log: 5 }, sheds: 0, stored: 0, atMs: NOON };
  return s;
}
const OUTDOOR = CATALOG.filter(isOutdoor);

test('thirteen outdoor pieces, all decor: none of them changes what anything pays', () => {
  assert.equal(OUTDOOR.length, 13);
  assert.ok(OUTDOOR.every((d) => !d.limited), 'none seasonal');
  assert.ok(OUTDOOR.every((d) => d.price > 0 && d.price <= 1500), 'priced like decor');
  assert.deepEqual(OUTDOOR.filter((d) => d.seats).map((d) => d.id).sort(), ['guestchairs', 'teacorner'], 'friends sit at these');
  assert.ok(byId('fencelights')!.glow);
});

test('outdoor zones sit wholly in the meadow, the third area', () => {
  for (const z of [ZONES.lawn, ZONES.fence]) {
    assert.ok(z.minX >= 2 * AREA_W && z.maxX <= 3 * AREA_W);
    assert.ok(z.x >= z.minX && z.x <= z.maxX && z.y >= z.minY && z.y <= z.maxY);
  }
  assert.deepEqual(clampToZone('lawn', 0, 0), { x: ZONES.lawn.minX, y: ZONES.lawn.minY });
});

test('the meadow gate is a garden upgrade, 300 clover', () => {
  const s = pet();
  s.clover = 299;
  assert.deepEqual(buyUpgrade(s, 'meadow'), { ok: false, reason: 'broke' });
  s.clover = MEADOW.gate;
  const r = buyUpgrade(s, 'meadow');
  assert.ok(r.ok && hasUpgrade(r.state, 'meadow') && r.state.clover === 0);
});

test("the yard makes what its buildings make, whatever's out in the meadow", () => {
  const s = fullYard();
  const base = perHour(s);
  assert.equal(base, 10 * 0.25 + 5 * 1 + 5 * 2, 'a yard built before the cap keeps every building');
  s.meadow = ['sunflowers', 'trellis', 'stones', 'birdbath', 'wheelbarrow', 'gnome'];
  assert.equal(perHour(s), base);
  assert.equal(stored(s, NOON + 2 * HOUR_MS), base * 2);
});

test('pet.meadow notes every piece out in the meadow, each once, keeping ids from a newer version', () => {
  const b: BurrowState = starterBurrow();
  b.items.push(
    { uid: 'a', id: 'sunflowers', x: 230, y: 100, flip: false, placed: true },
    { uid: 'b', id: 'sunflowers', x: 260, y: 100, flip: false, placed: true },
    { uid: 'c', id: 'gnome', x: 250, y: 90, flip: false, placed: false },
    { uid: 'd', id: 'bench', x: 240, y: 110, flip: false, placed: true },
  );
  assert.deepEqual(meadowPieces(b), ['bench', 'sunflowers']);
  assert.deepEqual(meadowItems(b).map((i) => i.uid), ['a', 'b', 'd']);
  let s = pet();
  s.meadow = ['futurepiece'];
  s = setMeadow(s, meadowPieces(b));
  assert.deepEqual(s.meadow, ['bench', 'futurepiece', 'sunflowers']);
  assert.equal(setMeadow(s, meadowPieces(b)), s, 'no change, no new state');
});

test('saves keep outdoor pieces in their zones, and friends never see them in the burrow', () => {
  const b = starterBurrow();
  b.items.push({ uid: 'x', id: 'birdbath', x: 5, y: 5, flip: false, placed: true });
  const back = readBurrow(JSON.parse(JSON.stringify(b)))!;
  const bath = back.items.find((i) => i.uid === 'x')!;
  assert.deepEqual({ x: bath.x, y: bath.y }, { x: ZONES.lawn.minX, y: ZONES.lawn.minY });
  const show = buildShowcase(pet(), back);
  assert.deepEqual(show.items.map((i) => i.id), ['plant'], 'the showcase is the burrow only');
});
