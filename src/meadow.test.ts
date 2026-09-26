// The garden's meadow (docs/rabbit-pets-garden.md §6): outdoor pieces, where
// they go, and the yard help from the ones placed there.
import assert from 'node:assert/strict';
import test from 'node:test';

import { byId, CATALOG, clampToZone, isOutdoor, meadowHelpers, meadowItems, readBurrow, starterBurrow, ZONES, type BurrowState } from './decor';
import { buyUpgrade, hasUpgrade } from './extras';
import { AREA_W } from './garden';
import { newPet, type PetState } from './sim';
import { buildShowcase } from './social';
import { HOUR_MS, MEADOW } from './tuning';
import { meadowPerDay, meadowShare, perHour, setMeadow, stored } from './yard';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (): PetState => newPet('meadow-pet', 'Clover', 'snow', NOON, 'UTC');
/** A full yard: 10 patches, 5 hives, 5 logs, storage counted from noon. */
function fullYard(): PetState {
  const s = pet();
  s.yard = { counts: { patch: 10, hive: 5, log: 5 }, sheds: 0, stored: 0, atMs: NOON };
  return s;
}
const OUTDOOR = CATALOG.filter(isOutdoor);

test('eight outdoor pieces: six help one kind of building each, two per kind; two are for looks', () => {
  // (and the five welcome pieces, bought in their own line: social.ts buyWelcome)
  assert.equal(OUTDOOR.filter((d) => !d.welcome).length, 8);
  assert.equal(OUTDOOR.filter((d) => d.welcome).length, 5);
  const helps = OUTDOOR.filter((d) => d.boost).map((d) => d.boost);
  assert.deepEqual(helps.sort(), ['hive', 'hive', 'log', 'log', 'patch', 'patch']);
  assert.ok(byId('bench') && !byId('bench')!.boost && byId('fencelights')!.glow);
  assert.ok(OUTDOOR.every((d) => !d.limited), 'no seasonal piece pays');
  assert.ok(CATALOG.filter((d) => !isOutdoor(d)).every((d) => !d.boost), 'burrow decor stays cosmetic');
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

test('each helping piece adds 10% to every building of its kind; two stack; a piece counts once', () => {
  const s = fullYard();
  const base = perHour(s);
  assert.equal(base, 10 * 0.25 + 5 * 1 + 5 * 2);
  s.meadow = ['sunflowers'];
  assert.ok(Math.abs(perHour(s) - (base + 5 * 1 * 0.1)) < 1e-9);
  assert.ok(Math.abs(meadowPerDay(s, 'hive') - 2.4) < 1e-9);
  s.meadow = ['sunflowers', 'trellis', 'sunflowers'];
  assert.ok(Math.abs(meadowShare(s, 'hive') - 0.2) < 1e-9, 'a duplicate id counts once');
  s.meadow = ['stones', 'birdbath', 'sunflowers', 'trellis', 'wheelbarrow', 'gnome'];
  assert.ok(Math.abs(perHour(s) * 24 - 504) < 1e-9, 'everything placed: 420 a day becomes 504');
  s.meadow = ['bench', 'fencelights', 'nonsense'];
  assert.equal(perHour(s), base, 'looks-only and unknown pieces help nothing');
});

test('help starts when a piece is placed and never reaches back into storage already earned', () => {
  let s = fullYard();
  const before = stored(s, NOON + 2 * HOUR_MS);
  s = setMeadow(s, ['sunflowers'], NOON + 2 * HOUR_MS);
  assert.equal(stored(s, NOON + 2 * HOUR_MS), before, 'nothing changes at the moment it goes out');
  const later = stored(s, NOON + 3 * HOUR_MS) - stored(s, NOON + 2 * HOUR_MS);
  assert.ok(Math.abs(later - (17.5 + 0.5)) < 1e-9, 'the next hour earns 17.5 + 0.5 from the sunflowers');
  // put away: back to the plain rate from then on
  s = setMeadow(s, [], NOON + 3 * HOUR_MS);
  const after = stored(s, NOON + 4 * HOUR_MS) - stored(s, NOON + 3 * HOUR_MS);
  assert.ok(Math.abs(after - 17.5) < 1e-9);
  assert.equal(setMeadow(s, [], NOON + 5 * HOUR_MS), s, 'no change, no new state');
});

test('the helpers are the placed outdoor pieces with a boost, each once', () => {
  const b: BurrowState = starterBurrow();
  b.items.push(
    { uid: 'a', id: 'sunflowers', x: 230, y: 100, flip: false, placed: true },
    { uid: 'b', id: 'sunflowers', x: 260, y: 100, flip: false, placed: true },
    { uid: 'c', id: 'gnome', x: 250, y: 90, flip: false, placed: false },
    { uid: 'd', id: 'bench', x: 240, y: 110, flip: false, placed: true },
  );
  assert.deepEqual(meadowHelpers(b), ['sunflowers']);
  assert.deepEqual(meadowItems(b).map((i) => i.uid), ['a', 'b', 'd']);
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
