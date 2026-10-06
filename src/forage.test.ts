import assert from 'node:assert/strict';
import test from 'node:test';

import { isOut, tripLoot } from './forage';
import { act, advance, newPet, type PetState } from './sim';
import { desiredReminders } from './reminders';
import { DECAY_AWAKE, FORAGE, HOUR_MS, STEP_MS } from './tuning';

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

test("put to bed off the step, she's asleep until the step that wakes her, so she can't slip out first", () => {
  const s = pet();
  s.needs.energy = 60;
  const bed = ok(act(s, 'nap', NOON + 3 * 60_000, UTC)).state;
  const nap = bed.timers.find((t) => t.kind === 'nap')!;
  assert.equal(nap.endsAtMs % STEP_MS, 0, 'she wakes on a step');
  // any moment before the step that finishes her sleep, she's still asleep
  const before = advance(bed, nap.endsAtMs - 1, UTC).state;
  assert.deepEqual(act(before, 'forage', nap.endsAtMs - 1, UTC, { hours: 4 }), { ok: false, reason: 'asleep' });
  // once it's run, she's rested and can go, and no waking-up news follows her out
  const up = advance(bed, nap.endsAtMs, UTC).state;
  const out = ok(act(up, 'forage', nap.endsAtMs + 60_000, UTC, { hours: 4 })).state;
  const { events } = advance(out, nap.endsAtMs + 3 * STEP_MS, UTC);
  assert.deepEqual(events.filter((e) => e.kind === 'napDone' || e.kind === 'wokeUp' || e.kind === 'fellAsleep'), []);
});

test("back from one trip, she can't be sent on a second, or put to bed, before the first has brought her home", () => {
  const s = pet();
  s.needs.energy = 90;
  const out = ok(act(s, 'forage', NOON + 3 * 60_000, UTC, { hours: 2 })).state;
  const tr = out.timers.find((t) => t.kind === 'forage')!;
  assert.equal(tr.endsAtMs % STEP_MS, 0, 'she comes home on a step');
  assert.ok(tr.endsAtMs >= NOON + 3 * 60_000 + 2 * HOUR_MS, 'no shorter than the trip she was sent on');
  // just before that step she's still out, whatever she's asked to do
  const before = advance(out, tr.endsAtMs - 1, UTC).state;
  assert.equal(isOut(before, tr.endsAtMs - 1), true);
  // a save from before trips ended on a step: the trip is over but its step hasn't come
  const old = structuredClone(before);
  old.timers = [{ kind: 'forage', startedAtMs: NOON + 3 * 60_000, endsAtMs: NOON + 2 * HOUR_MS + 3 * 60_000 }];
  const at = NOON + 2 * HOUR_MS + 4 * 60_000;
  assert.equal(isOut(old, at), false);
  assert.deepEqual(act(old, 'forage', at, UTC, { hours: 4 }), { ok: false, reason: 'out' });
  // the nap on its own is fine, and then she stays home until she's rested
  const bed = ok(act(old, 'nap', at, UTC)).state;
  assert.equal(act(bed, 'forage', at + 60_000, UTC, { hours: 4 }).ok, false);
  const home = advance(bed, at + 2 * HOUR_MS, UTC).state;
  assert.equal(isOut(home, at + 2 * HOUR_MS), false);
  assert.equal(home.timers.filter((t) => t.kind === 'forage').length, 0);
});

test('the basket: over many trips, mostly clover, then berries, finds, and a rare golden carrot', () => {
  const total = { clover: 0, berries: 0, golden: 0, finds: 0 };
  for (let i = 0; i < 400; i++) {
    const l = tripLoot('p', NOON + i * 97 * 60_000, 8);
    total.clover += l.clover; total.berries += l.berries; total.golden += l.golden; total.finds += l.finds.length;
  }
  assert.ok(total.berries > total.finds && total.finds > total.golden && total.golden > 0, JSON.stringify(total));
  assert.ok(total.clover / 400 > 22.5 && total.clover / 400 < 60, `${total.clover / 400} clover a trip`);
});

test('a reminder for when she is home', () => {
  const s = ok(act(pet(), 'forage', NOON, UTC, { hours: 4 })).state;
  const r = desiredReminders(s, NOON + 60_000, UTC).find((x) => x.key === 'forage-home');
  assert.equal(r?.fireAtMs, NOON + 4 * HOUR_MS);
});
