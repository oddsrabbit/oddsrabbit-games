import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buyOutfit, buyToy, giveOutfit, buyUpgrade, CROPS, cropYield, harvest, ownsToy, pickFind, plant, plotCount, plots, soilMaxed, soilPrice,
  startVacation, endVacation, wardrobe, wear, COLLECTIBLES,
} from './extras';
import { act, advance, newPet, type PetState } from './sim';
import { DAY_MS, HOUR_MS } from './tuning';
import { activeEvents, limitedAvailable, seasonOf, TRAITS, traitOf, weatherOf } from './world';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (id = 'test-pet'): PetState => newPet(id, 'Clover', 'snow', NOON, UTC);
/** A pet id with a given personality, found by searching ids. */
function petWithTrait(trait: string): PetState {
  for (let i = 0; i < 500; i++) if (traitOf(`p${i}`) === trait) return pet(`p${i}`);
  throw new Error('no id for ' + trait);
}

test('personality is fixed by id, and all three occur', () => {
  assert.equal(traitOf('abc'), traitOf('abc'));
  const seen = new Set(Array.from({ length: 200 }, (_, i) => traitOf(`p${i}`)));
  assert.deepEqual([...seen].sort(), [...TRAITS].sort());
});

test('a greedy rabbit gets hungry faster; a playful one gets bored faster', () => {
  const plain = advance(petWithTrait('shy'), NOON + HOUR_MS, UTC).state;
  const greedy = advance(petWithTrait('greedy'), NOON + HOUR_MS, UTC).state;
  const playful = advance(petWithTrait('playful'), NOON + HOUR_MS, UTC).state;
  assert.ok(greedy.needs.hunger < plain.needs.hunger);
  assert.ok(playful.needs.happy < plain.needs.happy);
});

test('petting: playful gets more, shy gets less until bond level 3', () => {
  const gain = (s: PetState) => { s.needs.happy = 20; const r = act(s, 'pet', NOON, UTC); return r.ok ? r.state.needs.happy - 20 : NaN; };
  const shy = petWithTrait('shy');
  const playful = petWithTrait('playful');
  assert.ok(gain(playful) > gain(petWithTrait('greedy')));
  assert.ok(gain(shy) < gain(petWithTrait('greedy')));
  shy.bond = 100;
  assert.equal(gain(shy), gain(petWithTrait('greedy')), 'warmed up');
});

test('on vacation her needs hold and she finds nothing', () => {
  const s = startVacation(pet(), 3, NOON);
  const later = advance(s, NOON + 2 * DAY_MS, UTC).state;
  assert.deepEqual(later.needs, s.needs);
  assert.deepEqual(later.collection ?? {}, {});
  const back = advance(endVacation(later), NOON + 2 * DAY_MS + 2 * HOUR_MS, UTC).state;
  assert.ok(back.needs.hunger < s.needs.hunger, 'needs resume after');
});

test('finds while away go into the collection and pay a little clover', () => {
  const r = advance(pet('finder'), NOON + 6 * DAY_MS, UTC);
  const found = r.events.filter((e) => e.kind === 'found');
  assert.ok(found.length > 0);
  const total = Object.values(r.state.collection ?? {}).reduce((a, b) => a + b, 0);
  assert.equal(total, found.length);
  const ids = COLLECTIBLES.map((c) => c.id);
  for (const e of found) assert.ok(e.kind === 'found' && ids.includes(e.item));
  assert.equal(pickFind('x', 5).id, pickFind('x', 5).id, 'seeded');
});

test('garden: plant with clover, wait, harvest into the pantry', () => {
  let s = pet();
  s.clover = 20;
  const p = plant(s, 0, 'berry', NOON);
  assert.ok(p.ok);
  if (!p.ok) return;
  s = p.state;
  assert.equal(s.clover, 20 - CROPS.berry.seedCost);
  assert.deepEqual(plant(s, 0, 'sprout', NOON), { ok: false, reason: 'busy' });
  assert.deepEqual(harvest(s, 0, NOON + HOUR_MS), { ok: false, reason: 'growing' });
  const h = harvest(s, 0, NOON + CROPS.berry.growMs);
  assert.ok(h.ok);
  if (!h.ok) return;
  assert.equal(h.state.pantry?.berries, 2);
  assert.equal(plots(h.state)[0], null);
  // a home-grown berry is eaten before any clover is spent
  h.state.needs.hunger = 20;
  const fed = act(h.state, 'feed', NOON + CROPS.berry.growMs, UTC, { food: 'strawberry' });
  assert.ok(fed.ok && fed.state.pantry?.berries === 1 && fed.state.clover === h.state.clover + 2);
});

test('a golden carrot is always loved', () => {
  const s = pet();
  s.pantry = { berries: 0, golden: 3 };
  s.needs.hunger = 10;
  for (let i = 0; i < 3; i++) {
    const r = act(s, 'feed', NOON, UTC, { food: 'golden' });
    assert.ok(r.ok && r.reaction === 'loves');
    s.meals = (s.meals ?? 0) + 1;
  }
  s.pantry = { berries: 0, golden: 0 };
  assert.deepEqual(act(s, 'feed', NOON, UTC, { food: 'golden' }), { ok: false, reason: 'noTreats' });
});

test('toy play: she starts with a ball; other toys are bought; no limit on plays', () => {
  let s = pet();
  s.needs.happy = 20;
  assert.ok(ownsToy(s, 'ball'));
  assert.deepEqual(act(s, 'play', NOON, UTC, { toy: 'yarn' }), { ok: false, reason: 'noToy' });
  for (let i = 0; i < 5; i++) {
    const r = act(s, 'play', NOON + i * 60_000, UTC);
    assert.ok(r.ok);
    s = r.ok ? r.state : s;
  }
  assert.equal(s.needs.happy, 70, '+10 joy a play');
  s.clover = 40;
  assert.deepEqual(buyToy(s, 'yarn'), { ok: false, reason: 'broke' });
  s.clover = 60;
  const b = buyToy(s, 'yarn');
  assert.ok(b.ok && b.state.clover === 10 && ownsToy(b.state, 'yarn'));
  const tired = pet();
  tired.needs.energy = 40;
  const bed = act(tired, 'nap', NOON, UTC);
  assert.ok(bed.ok);
  assert.deepEqual(act(bed.state, 'play', NOON + 60_000, UTC), { ok: false, reason: 'asleep' });
});

test('garden upgrades: one plot to start, plots in order, soil repeats and pays more per sprout', () => {
  let s = pet();
  assert.equal(plotCount(s), 1);
  s.clover = 10_000;
  assert.deepEqual(buyUpgrade(s, 'plot3'), { ok: false, reason: 'locked' });
  for (const id of ['plot2', 'plot3'] as const) {
    const r = buyUpgrade(s, id);
    assert.ok(r.ok);
    s = r.ok ? r.state : s;
  }
  assert.equal(plotCount(s), 3);
  assert.equal(plots(s).length, 3);
  assert.deepEqual(buyUpgrade(s, 'plot4'), { ok: false, reason: 'locked' }, 'needs soil 3');
  assert.equal(soilPrice(s), 600);
  const soil = buyUpgrade(s, 'soil');
  assert.ok(soil.ok && soil.state.soilLevel === 1 && soilPrice(soil.state) === 1080);
  s = soil.ok ? soil.state : s;
  const p = plant(s, 0, 'sprout', NOON);
  assert.ok(p.ok);
  const h = p.ok ? harvest(p.state, 0, NOON + CROPS.sprout.growMs) : null;
  assert.ok(h?.ok && h.clover === 8, '6 + 2 per soil level');
});

test('the watering can makes crops grow 25% faster', () => {
  const s = pet();
  s.clover = 2000;
  const c = buyUpgrade(s, 'can');
  assert.ok(c.ok);
  const p = c.ok ? plant(c.state, 0, 'berry', NOON) : null;
  assert.ok(p?.ok && plots(p.state)[0]?.readyAtMs === NOON + CROPS.berry.growMs / 1.25);
});

test('wardrobe: buy, wear, swap and take off', () => {
  let s = pet();
  s.clover = 249;
  assert.deepEqual(buyOutfit(s, 'bow'), { ok: false, reason: 'broke' });
  s.clover = 250;
  const b = buyOutfit(s, 'bow');
  assert.ok(b.ok);
  s = b.ok ? b.state : s;
  assert.equal(wardrobe(s).head, 'bow');
  assert.deepEqual(buyOutfit(s, 'bow'), { ok: false, reason: 'owned' });
  s = wear(s, 'head', null);
  assert.equal(wardrobe(s).head, null);
  assert.equal(wardrobe(wear(s, 'head', 'beanie')).head, null, "can't wear what she doesn't own");
});

test('the bandana is affordable from the starting clover, for the first-day goal', () => {
  const b = buyOutfit(pet(), 'bandana');
  assert.ok(b.ok);
});

test('a new rabbit owns no outfits, and a gifted one waits in the wardrobe unworn', () => {
  const s = pet();
  assert.deepEqual(wardrobe(s), { owned: [], head: null, neck: null });
  const g = giveOutfit(s, 'acorncap');
  assert.deepEqual(wardrobe(g), { owned: ['acorncap'], head: null, neck: null });
});

test('seasons, the weather and events come from the date', () => {
  assert.equal(seasonOf(NOON, UTC), 'autumn');
  assert.equal(seasonOf(Date.UTC(2026, 0, 5), UTC), 'winter');
  assert.equal(weatherOf('2026-09-24', 'autumn'), weatherOf('2026-09-24', 'autumn'), 'same for everyone');
  for (let d = 1; d <= 28; d++) assert.notEqual(weatherOf(`2026-07-${String(d).padStart(2, '0')}`, 'summer'), 'snow');
  assert.deepEqual(activeEvents(NOON, UTC).map((e) => e.id), ['harvest']);
  assert.deepEqual(activeEvents(Date.UTC(2026, 11, 31), UTC).map((e) => e.id), ['winterfest'], 'wraps the new year');
  assert.equal(limitedAvailable('pumpkin', NOON, UTC), true);
  assert.equal(limitedAvailable('jackolantern', NOON, UTC), false);
  assert.equal(limitedAvailable('cushion', NOON, UTC), true, 'regular items always');
});

test('soil stops at level 5, and on the way richer soil grows more strawberries and golden carrots', () => {
  const s = newPet('soil', 'Mochi', 'snow', NOON, UTC);
  s.clover = 1e6;
  const yieldsAt = (lvl: number) => { const p = { ...s, soilLevel: lvl }; return [cropYield(p, 'berry'), cropYield(p, 'golden')]; };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(yieldsAt), [[2, 1], [2, 1], [3, 1], [3, 1], [4, 1], [4, 2]]);
  let t = s;
  for (let i = 0; i < 5; i++) { const r = buyUpgrade(t, 'soil'); assert.ok(r.ok); t = r.state; }
  assert.equal(t.soilLevel, 5);
  assert.equal(soilMaxed(t), true);
  assert.deepEqual(buyUpgrade(t, 'soil'), { ok: false, reason: 'owned' });
  // a harvest at level 5
  const planted = plant({ ...t, clover: 100 }, 0, 'berry', NOON);
  assert.ok(planted.ok);
  const picked = harvest(planted.state, 0, NOON + 9 * HOUR_MS);
  assert.ok(picked.ok && (picked.state.pantry?.berries ?? 0) === 4);
});
