import assert from 'node:assert/strict';
import test from 'node:test';

import { isOut, tripLoot } from './forage';
import { act, advance, newPet, type PetState } from './sim';
import { desiredReminders } from './reminders';
import { DECAY_AWAKE, FORAGE, HOUR_MS } from './tuning';

const UTC = 'UTC';
// a day with no seasonal event, so finds come from the everyday pools
const NOON = Date.UTC(2026, 5, 10, 12, 0);
const pet = (): PetState => newPet('forager', 'Mochi', 'snow', NOON, UTC);
const ok = (r: ReturnType<typeof act>) => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<typeof r, { ok: true }>; };

test('a trip: she leaves, the burrow is empty, her needs keep dropping, and she comes home with a basket', () => {
  const s = ok(act(pet(), 'forage', NOON, UTC, { hours: 8 })).state;
  assert.ok(isOut(s, NOON + HOUR_MS));
  for (const a of ['feed', 'pet', 'play', 'clean', 'nap'] as const) assert.deepEqual(act(s, a, NOON + HOUR_MS, UTC), { ok: false, reason: 'out' });
  assert.equal(ok(act(s, 'bake', NOON + HOUR_MS, UTC)).state.timers.some((t) => t.kind === 'bake'), true, 'you can still bake');
  const { state, events } = advance(s, NOON + 9 * HOUR_MS, UTC);
  assert.ok(!isOut(state, NOON + 9 * HOUR_MS));
  const done = events.find((e) => e.kind === 'forageDone');
  assert.ok(done && done.kind === 'forageDone');
  const expected = tripLoot('forager', NOON, 8);
  assert.deepEqual(done.loot, expected, 'rolled once per hour, from when she left');
  assert.ok(state.needs.hunger < s.needs.hunger - DECAY_AWAKE.hunger * 8 + 1, 'hungrier: nobody fed her');
  assert.equal(state.clover - s.clover >= expected.clover, true);
  assert.equal((state.pantry?.berries ?? 0), expected.berries);
  assert.ok(!events.some((e) => e.kind === 'found'), 'no finds at home while she was out');
});

test('calling her home early brings what she gathered in whole hours', () => {
  const s = ok(act(pet(), 'forage', NOON, UTC, { hours: 8 })).state;
  const r = ok(act(s, 'recall', NOON + 3.5 * HOUR_MS, UTC));
  assert.deepEqual(r.loot, tripLoot('forager', NOON, 3));
  assert.ok(!isOut(r.state, NOON + 4 * HOUR_MS));
  assert.deepEqual(act(r.state, 'recall', NOON + 4 * HOUR_MS, UTC), { ok: false, reason: 'notOut' });
  const soon = ok(act(s, 'recall', NOON + 20 * 60_000, UTC));
  assert.deepEqual(soon.loot, { clover: 0, berries: 0, golden: 0, finds: [] }, 'back straight away: empty-handed');
});

test("she won't go asleep or worn out, and doesn't doze off while she's out", () => {
  const tired = pet();
  tired.needs.energy = FORAGE.minEnergy - 1;
  assert.deepEqual(act(tired, 'forage', NOON, UTC, { hours: 2 }), { ok: false, reason: 'tooTired' });
  const s = pet();
  s.needs.energy = FORAGE.minEnergy;
  const out = ok(act(s, 'forage', NOON, UTC, { hours: 8 })).state;
  const later = advance(out, NOON + 7 * HOUR_MS, UTC).state;
  assert.equal(later.timers.some((t) => t.kind === 'nap'), false, 'no nap timer out in the woods');
  const home = advance(later, NOON + 8 * HOUR_MS + 20 * 60_000, UTC).state;
  assert.equal(home.timers.some((t) => t.kind === 'nap'), true, 'home and worn out, she dozes off');
});

test('the basket: over many trips, mostly clover, then berries, finds, and a rare golden carrot', () => {
  const total = { clover: 0, berries: 0, golden: 0, finds: 0 };
  for (let i = 0; i < 400; i++) {
    const l = tripLoot('p', NOON + i * 97 * 60_000, 8);
    total.clover += l.clover; total.berries += l.berries; total.golden += l.golden; total.finds += l.finds.length;
  }
  assert.ok(total.berries > total.finds && total.finds > total.golden && total.golden > 0, JSON.stringify(total));
  assert.ok(total.clover / 400 > 15 && total.clover / 400 < 40, `${total.clover / 400} clover a trip`);
});

test('a reminder for when she is home', () => {
  const s = ok(act(pet(), 'forage', NOON, UTC, { hours: 4 })).state;
  const r = desiredReminders(s, NOON + 60_000, UTC).find((x) => x.key === 'forage-home');
  assert.equal(r?.fireAtMs, NOON + 4 * HOUR_MS);
});
