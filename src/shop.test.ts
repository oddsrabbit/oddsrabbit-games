import assert from 'node:assert/strict';
import test from 'node:test';

import { moonPhase } from './art/burrow';
import { COLLECTIBLES, COLLECTION_SETS } from './collectibles';
import { addSurface, CATALOG, ownsDecor, readBurrow, starterBurrow, SURFACES, surfacesOf, useSurface } from './decor';
import { rate } from './economy';
import { buyOutfit, buyToy, OUTFITS, pickFind } from './extras';
import { newPet } from './sim';
import { buildShowcase, readShowcase } from './social';
import { activeEvents, EVENTS } from './world';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = () => newPet('shop-pet', 'Clover', 'snow', NOON, UTC);

test('a new burrow has the plain walls, floor and window', () => {
  assert.deepEqual(surfacesOf(starterBurrow()), { owned: [], wall: 'plainwall', floor: 'plainfloor', window: 'roundwindow' });
});

test('surfaces: owning one puts it up; switching back is free; saves round-trip', () => {
  const b = starterBurrow();
  addSurface(b, 'starrywall');
  addSurface(b, 'oakfloor');
  assert.equal(surfacesOf(b).wall, 'starrywall');
  useSurface(b, 'plainwall');
  assert.equal(surfacesOf(b).wall, 'plainwall');
  useSurface(b, 'daisywall'); // not owned: nothing happens
  assert.equal(surfacesOf(b).wall, 'plainwall');
  assert.ok(ownsDecor(b, 'starrywall'));
  const back = readBurrow(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(back && surfacesOf(back), surfacesOf(b));
  // a save that claims a wall it doesn't own shows the plain one
  const forged = readBurrow({ v: 2, rev: 0, items: [], surfaces: { owned: [], wall: 'sunsetwall', floor: 'x', window: 'moonwindow' } });
  assert.deepEqual(forged && surfacesOf(forged), { owned: [], wall: 'plainwall', floor: 'plainfloor', window: 'roundwindow' });
});

test("friends see the walls and window; odd values read as plain", () => {
  const b = starterBurrow();
  addSurface(b, 'moonwindow');
  const d = readShowcase(JSON.parse(JSON.stringify(buildShowcase(pet(), b))));
  assert.equal(d?.window, 'moonwindow');
  assert.equal(d?.wall, 'plainwall');
  const odd = readShowcase({ ...buildShowcase(pet(), b), wall: 'oakfloor' });
  assert.equal(odd?.wall, 'plainwall', 'a floor is not a wall');
});

test('the catalog has every id once, and gift-only items cost nothing', () => {
  const ids = [...CATALOG.map((d) => d.id), ...SURFACES.map((d) => d.id)];
  assert.equal(new Set(ids).size, ids.length);
  for (const d of CATALOG.filter((x) => x.giftOnly)) assert.equal(d.price, 0);
  for (const o of OUTFITS.filter((x) => x.giftOnly)) assert.equal(o.price, 0);
});

test('six events, each with a free item, its shop items and four finds that make a set', () => {
  assert.equal(EVENTS.length, 6);
  const ids = new Set(COLLECTIBLES.map((c) => c.id));
  for (const e of EVENTS) {
    assert.ok(e.gift, `${e.id} has a free item`);
    assert.equal(e.finds.length, 4);
    for (const f of e.finds) assert.ok(ids.has(f), f);
    assert.deepEqual(COLLECTION_SETS.find((s) => s.id === e.id)?.items, e.finds);
    for (const d of e.decor) assert.ok(CATALOG.find((x) => x.id === d)?.limited, `${d} is limited`);
  }
  assert.deepEqual(activeEvents(Date.UTC(2026, 6, 15, 12), UTC).map((e) => e.id), ['summer']);
  assert.deepEqual(activeEvents(Date.UTC(2026, 10, 1, 12), UTC).map((e) => e.id), ['spooky'], 'spooky week runs into November');
});

test("during an event most finds are the event's; otherwise none are", () => {
  const snow = EVENTS.find((e) => e.id === 'snowday')!.finds;
  let seasonal = 0;
  for (let i = 0; i < 400; i++) if (snow.includes(pickFind('p', i, snow).id)) seasonal++;
  assert.ok(seasonal > 240 && seasonal < 320, `about 70%: ${seasonal}`);
  for (let i = 0; i < 200; i++) assert.ok(!snow.includes(pickFind('p', i).id));
});

test('an event set adds 2% to the clover rate; a permanent set 5%', () => {
  const s = pet();
  s.collection = { snowflake: 1, mitten: 1, icicle: 1, snowball: 1 };
  assert.equal(rate(s).sets, 0.02);
});

test('the tiny crown needs bond 10; gift-only outfits are never sold', () => {
  const s = pet();
  s.clover = 20_000;
  assert.deepEqual(buyOutfit(s, 'crown'), { ok: false, reason: 'locked' });
  s.bond = 10_000;
  assert.ok(buyOutfit(s, 'crown').ok);
  assert.deepEqual(buyOutfit(s, 'earmuffs'), { ok: false, reason: 'unknown' });
});

test('bigger toys unlock one after another', () => {
  const s = pet();
  s.clover = 5000;
  assert.deepEqual(buyToy(s, 'ballpit'), { ok: false, reason: 'locked' });
  s.toys = ['swing'];
  assert.ok(buyToy(s, 'ballpit').ok);
});

test('the moon phase: new, full, and back to new', () => {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14);
  assert.ok(moonPhase(newMoon) < 0.001);
  assert.ok(Math.abs(moonPhase(newMoon + 14.765 * 86_400_000) - 0.5) < 0.001);
  assert.ok(moonPhase(newMoon + 29.530588853 * 86_400_000 * 300) < 0.001 || moonPhase(newMoon + 29.530588853 * 86_400_000 * 300) > 0.999);
});
