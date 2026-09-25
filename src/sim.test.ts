import assert from 'node:assert/strict';
import test from 'node:test';

import { dayKey, localParts, nextLocalHour } from './localtime';
import { act, advance, bondLevel, earsOf, foodReaction, giftReady, isAsleep, isPetState, mood, newPet, visit, type FoodId, type PetState } from './sim';
import { BOND_DAILY_CAP, DAY_MS, FOODS, HOUR_MS, LOVES_BONUS_HAPPY, MAX_CATCH_UP_MS, STEP_MS } from './tuning';
import { traitOf } from './world';

const UTC = 'UTC';
// 2026-09-24 12:00 UTC, a Thursday afternoon.
const NOON = Date.UTC(2026, 8, 24, 12, 0);

function pet(at = NOON): PetState {
  return newPet('test-pet', 'Clover', 'snow', at, UTC);
}

test('she keeps the ears chosen at adoption; rabbits from before the choice have long ears', () => {
  assert.equal(earsOf(newPet('a', 'Clover', 'snow', NOON, UTC, 'lop')), 'lop');
  assert.equal(earsOf(pet()), 'short');
  const old = pet() as Partial<PetState>;
  delete old.ears;
  assert.ok(isPetState(old));
  assert.equal(earsOf(old), 'long');
  assert.equal(earsOf({ ears: 'antennae' }), 'long');
});

test('an awake hour costs 3 hunger, 3 happiness, 4 energy and 2 cleanliness', () => {
  const { state } = advance(pet(), NOON + HOUR_MS, UTC);
  assert.equal(state.stepIndex, 6);
  assert.ok(Math.abs(state.needs.hunger - 77) < 1e-9);
  assert.ok(Math.abs(state.needs.happy - 77) < 1e-9);
  assert.ok(Math.abs(state.needs.energy - 86) < 1e-9);
  assert.ok(Math.abs(state.needs.clean - 93) < 1e-9);
});

test('asleep at night: happiness and cleanliness hold, energy refills', () => {
  const start = Date.UTC(2026, 8, 24, 23, 0);
  const s0 = pet(start);
  s0.needs.energy = 40;
  const { state } = advance(s0, start + 2 * HOUR_MS, UTC);
  assert.equal(state.needs.happy, 80);
  assert.equal(state.needs.clean, 95);
  assert.ok(state.needs.energy > 60);
  assert.equal(mood(state, start + 2 * HOUR_MS, UTC), 'asleep');
});

test('advancing in pieces lands exactly where one long advance does', () => {
  const s = pet();
  const end = NOON + 3 * DAY_MS + 17 * 60_000;
  const whole = advance(s, end, UTC).state;
  let parts = s;
  for (const t of [NOON + 7 * 60_000, NOON + 5 * HOUR_MS + 3_000, NOON + DAY_MS + 1, end]) parts = advance(parts, t, UTC).state;
  assert.deepEqual(parts, whole);
});

test('the same absence replayed twice produces the same events (seeded)', () => {
  const s = pet();
  const a = advance(s, NOON + 5 * DAY_MS, UTC);
  const b = advance(s, NOON + 5 * DAY_MS, UTC);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.state, b.state);
});

test('a clock that goes backwards changes nothing', () => {
  const s = advance(pet(), NOON + HOUR_MS, UTC).state;
  const { state, events } = advance(s, NOON, UTC);
  assert.deepEqual(state, s);
  assert.equal(events.length, 0);
});

test('a month away is replayed as at most a week, and needs bottom out at zero', () => {
  const { state } = advance(pet(), NOON + 30 * DAY_MS, UTC);
  assert.ok(state.stepIndex <= MAX_CATCH_UP_MS / STEP_MS + 1);
  assert.equal(state.needs.hunger, 0);
  assert.equal(mood(state, NOON + 30 * DAY_MS, UTC) === 'grumpy' || mood(state, NOON + 30 * DAY_MS, UTC) === 'asleep', true);
});

test('a nap refills energy when it ends, and she is asleep until then', () => {
  let s = pet();
  s.needs.energy = 50;
  const r = act(s, 'nap', NOON, UTC);
  assert.ok(r.ok);
  s = r.state;
  assert.equal(isAsleep(s, NOON + HOUR_MS, UTC), true);
  const { state, events } = advance(s, NOON + 2 * HOUR_MS + STEP_MS, UTC);
  assert.equal(events.filter((e) => e.kind === 'napDone').length, 1);
  assert.equal(state.timers.length, 0);
  assert.equal(isAsleep(state, NOON + 2 * HOUR_MS + STEP_MS, UTC), false);
  assert.ok(state.needs.energy > 98);
});

test('a nap can be ended early: she keeps what she regained, and no refill later', () => {
  let s = pet();
  s.needs.energy = 40;
  const napped = act(s, 'nap', NOON, UTC);
  assert.ok(napped.ok);
  s = advance(napped.state, NOON + HOUR_MS, UTC).state;
  const regained = s.needs.energy;
  assert.ok(regained > 40);
  const woke = act(s, 'wake', NOON + HOUR_MS, UTC);
  assert.ok(woke.ok);
  if (!woke.ok) return;
  assert.equal(isAsleep(woke.state, NOON + HOUR_MS, UTC), false);
  assert.equal(woke.state.timers.length, 0);
  assert.equal(woke.state.needs.energy, regained);
  const later = advance(woke.state, NOON + 3 * HOUR_MS, UTC);
  assert.equal(later.events.filter((e) => e.kind === 'napDone').length, 0);
  assert.ok(later.state.needs.energy < 100);
});

test('waking only works on a daytime nap', () => {
  assert.deepEqual(act(pet(), 'wake', NOON, UTC), { ok: false, reason: 'notNapping' });
  const night = Date.UTC(2026, 8, 24, 23, 30);
  assert.deepEqual(act(pet(night), 'wake', night, UTC), { ok: false, reason: 'night' });
});

test('no nap when she is not tired, and never at night', () => {
  assert.deepEqual(act(pet(), 'nap', NOON, UTC), { ok: false, reason: 'notTired' });
  const night = pet(Date.UTC(2026, 8, 24, 23, 30));
  night.needs.energy = 10;
  assert.deepEqual(act(night, 'nap', Date.UTC(2026, 8, 24, 23, 30), UTC), { ok: false, reason: 'night' });
});

test('a baked treat waits in the pantry until she is fed one', () => {
  let s = act(pet(), 'bake', NOON, UTC);
  assert.ok(s.ok);
  const baked = advance(s.state, NOON + HOUR_MS + STEP_MS, UTC);
  assert.equal(baked.state.treats, 1);
  baked.state.needs.hunger = 20;
  const fed = act(baked.state, 'feed', NOON + 2 * HOUR_MS, UTC, { food: 'treat' });
  assert.ok(fed.ok);
  if (fed.ok) {
    assert.equal(fed.state.treats, 0);
    assert.equal(fed.state.needs.hunger, 70);
  }
  assert.deepEqual(act(fed.ok ? fed.state : pet(), 'bake', NOON + 2 * HOUR_MS, UTC).ok, true);
});

test('care pays bond and clover up to the daily cap, then keeps working for free', () => {
  let s = pet();
  s.needs.happy = 0;
  let bond = 0;
  for (let i = 0; i < BOND_DAILY_CAP + 4; i++) {
    const r = act(s, 'pet', NOON + i * 60_000, UTC);
    assert.ok(r.ok);
    if (r.ok) { bond += r.bond; s = r.state; }
  }
  assert.equal(bond, BOND_DAILY_CAP);
  assert.equal(s.bond, BOND_DAILY_CAP);
  // next day the cap resets (and she has room to be happier)
  s.needs.happy = 50;
  const r = act(s, 'pet', NOON + DAY_MS, UTC);
  assert.ok(r.ok && r.bond === 1);
});

test('full or clean says so instead of acting', () => {
  const s = pet();
  s.needs.hunger = 95;
  assert.deepEqual(act(s, 'feed', NOON, UTC), { ok: false, reason: 'full' });
  assert.deepEqual(act(s, 'clean', NOON, UTC), { ok: false, reason: 'clean' });
});

test('the gift is once a day, rolls over at 05:00 local, and a missed day only pauses the streak', () => {
  const tz = 'America/New_York';
  const day1 = Date.parse('2026-09-24T09:00:00-04:00');
  let s = newPet('p', 'Clover', 'snow', day1, tz);
  let r = act(s, 'gift', day1, tz);
  assert.ok(r.ok && r.clover === 10);
  s = r.ok ? r.state : s;
  assert.equal(giftReady(s, Date.parse('2026-09-25T04:59:00-04:00'), tz), false);
  assert.equal(giftReady(s, Date.parse('2026-09-25T05:00:00-04:00'), tz), true);
  // skip the 25th entirely; the streak continues on the 26th
  r = act(s, 'gift', Date.parse('2026-09-26T10:00:00-04:00'), tz);
  assert.ok(r.ok && r.state.gift.streak === 2 && r.clover === 11);
});

test('two low needs make her grumpy; one low need names what she wants', () => {
  const s = pet();
  s.needs.hunger = 10;
  assert.equal(mood(s, NOON, UTC), 'peckish');
  s.needs.clean = 10;
  assert.equal(mood(s, NOON, UTC), 'grumpy');
});

test('a new day visited counts once, however many times she is opened', () => {
  let s = pet();
  assert.equal(visit(s, NOON + HOUR_MS, UTC).newDay, false);
  const next = visit(s, NOON + DAY_MS, UTC);
  assert.equal(next.newDay, true);
  s = next.state;
  assert.equal(s.daysVisited, 2);
  assert.equal(visit(s, NOON + DAY_MS + HOUR_MS, UTC).newDay, false);
});

test('bond levels report progress to the next level', () => {
  assert.deepEqual(bondLevel(0), { level: 1, into: 0, span: 12 });
  assert.equal(bondLevel(12).level, 2);
  assert.equal(bondLevel(10_000).span, null);
});

test('local time: day keys and the next 05:00 survive a DST change', () => {
  const tz = 'America/New_York';
  // US clocks go back at 02:00 on 2026-11-01.
  const before = Date.parse('2026-10-31T23:00:00-04:00');
  const t = nextLocalHour(before, tz, 5);
  const p = localParts(t, tz);
  assert.equal(p.hour, 5);
  assert.equal(p.minute, 0);
  assert.equal(p.day, 1);
  assert.equal(dayKey(Date.parse('2026-11-01T04:30:00-05:00'), tz, 5), '2026-10-31');
});

test('each food feeds her its amount, and joy depends on how she takes it', () => {
  for (const id of ['carrot', 'greens', 'strawberry'] as FoodId[]) {
    const s = pet();
    s.needs.hunger = 20;
    s.needs.happy = 20;
    const r = act(s, 'feed', NOON, UTC, { food: id });
    assert.ok(r.ok);
    if (!r.ok) continue;
    assert.equal(r.state.needs.hunger, 20 + FOODS[id].hunger);
    const joy = { loves: FOODS[id].happy + LOVES_BONUS_HAPPY, happy: FOODS[id].happy, okay: 0 }[r.reaction!];
    assert.equal(r.state.needs.happy, 20 + joy, `${id} ${r.reaction}`);
    assert.equal(r.state.meals, 1);
  }
});

test('the paid foods need their cost', () => {
  const s = pet();
  s.needs.hunger = 20;
  const berry = act(s, 'feed', NOON, UTC, { food: 'strawberry' });
  assert.ok(berry.ok && berry.state.clover === s.clover - 3 + 1, 'costs 3, care pays 1 back');
  s.clover = 2;
  assert.deepEqual(act(s, 'feed', NOON, UTC, { food: 'strawberry' }), { ok: false, reason: 'broke' });
  assert.deepEqual(act(s, 'feed', NOON, UTC, { food: 'treat' }), { ok: false, reason: 'noTreats' });
});

test('reactions follow the odds: treats and berries delight her far more often', () => {
  const rate = (food: FoodId, kind: 'loves' | 'okay') => {
    // greedy rabbits love their food more often; measure the base odds
    let n = 0, total = 0;
    for (let i = 0; total < 4000; i++) {
      if (traitOf(`pet-${i}`) === 'greedy') continue;
      total++;
      if (foodReaction(`pet-${i}`, i % 50, food) === kind) n++;
    }
    return n / total;
  };
  assert.ok(Math.abs(rate('carrot', 'loves') - 0.15) < 0.03);
  assert.ok(Math.abs(rate('strawberry', 'loves') - 0.45) < 0.03);
  assert.ok(Math.abs(rate('treat', 'loves') - 0.6) < 0.03);
  assert.equal(rate('treat', 'okay'), 0, 'a baked treat is never just okay');
  assert.ok(rate('strawberry', 'loves') > rate('greens', 'loves') * 2);
});

test('a meal\'s reaction is fixed: reopening the game cannot re-roll it', () => {
  const s = pet();
  s.needs.hunger = 20;
  const a = act(s, 'feed', NOON, UTC, { food: 'carrot' });
  const b = act(s, 'feed', NOON + 5 * 60_000, UTC, { food: 'carrot' });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(a.reaction, b.reaction);
});
