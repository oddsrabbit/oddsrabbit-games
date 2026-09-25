import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buyOutfit, CROPS, earnMarking, harvest, pickFind, plant, playsLeft, plots, recordPlay, startVacation, endVacation, wardrobe, wear,
  PLAYS_PER_DAY, COLLECTIBLES,
} from './extras';
import { act, advance, newPet, visit, type PetState } from './sim';
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
  assert.ok(fed.ok && fed.state.pantry?.berries === 1 && fed.state.clover === h.state.clover + 1);
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

test('her marking comes on day 7 and follows how she was cared for', () => {
  const s = pet();
  s.careCounts = { fed: 2, pet: 9, clean: 3 };
  s.daysVisited = 6;
  assert.equal(earnMarking(s), null);
  const v = visit(s, NOON + DAY_MS, UTC);
  assert.equal(v.marking, 'heart');
  assert.equal(v.state.marking, 'heart');
  assert.equal(earnMarking(v.state), null, 'only once');
  s.careCounts = { fed: 1, pet: 1, clean: 5 };
  s.daysVisited = 7;
  assert.equal(earnMarking(s), 'tuft');
});

test('three plays a day, with a capped clover reward', () => {
  let s = pet();
  for (let i = 0; i < PLAYS_PER_DAY; i++) {
    const r = recordPlay(s, 40, NOON, UTC);
    assert.ok(r.ok && r.clover === 10, 'capped at 10');
    s = r.ok ? r.state : s;
  }
  assert.equal(playsLeft(s, NOON, UTC), 0);
  assert.deepEqual(recordPlay(s, 5, NOON, UTC), { ok: false, reason: 'noPlays' });
  assert.equal(playsLeft(s, NOON + DAY_MS, UTC), PLAYS_PER_DAY);
});

test('wardrobe: buy, wear, swap and take off', () => {
  let s = pet();
  s.clover = 100;
  const b = buyOutfit(s, 'bow');
  assert.ok(b.ok);
  s = b.ok ? b.state : s;
  assert.equal(wardrobe(s).head, 'bow');
  assert.deepEqual(buyOutfit(s, 'bow'), { ok: false, reason: 'owned' });
  s = wear(s, 'head', null);
  assert.equal(wardrobe(s).head, null);
  assert.equal(wardrobe(wear(s, 'head', 'beanie')).head, null, "can't wear what she doesn't own");
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
