import assert from 'node:assert/strict';
import test from 'node:test';

import { newPet, type PetState } from './sim';
import { HOUR_MS } from './tuning';
import { BUILDINGS, buyBuilding, buyShed, capacity, collect, giveBuilding, nextPrice, payback, perHour, stored } from './yard';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (): PetState => newPet('yard-pet', 'Clover', 'snow', NOON, 'UTC');

test('buildings cost more each time and produce the same', () => {
  let s = pet();
  s.clover = 10_000;
  assert.equal(nextPrice(s, 'patch'), 84);
  const r = buyBuilding(s, 'patch', NOON);
  assert.ok(r.ok);
  s = r.ok ? r.state : s;
  assert.equal(s.clover, 10_000 - 84);
  assert.equal(nextPrice(s, 'patch'), 128);
  assert.equal(perHour(s), 0.25);
  assert.deepEqual(buyBuilding(s, 'hive', NOON), { ok: false, reason: 'locked' }, 'after three patches');
});

test('storage fills at the hourly rate and stops at 24 hours of output', () => {
  const s = giveBuilding(pet(), 'patch', NOON);
  assert.equal(stored(s, NOON + 4 * HOUR_MS), 1);
  assert.equal(stored(s, NOON + 24 * HOUR_MS), 6);
  assert.equal(stored(s, NOON + 72 * HOUR_MS), 6, 'full: a long absence is no windfall');
  assert.equal(stored(s, NOON - HOUR_MS), 0, 'a clock that went backwards changes nothing');
});

test('collecting pays whole clover, flat, and keeps the fraction', () => {
  let s = giveBuilding(pet(), 'patch', NOON);
  s.bond = 280; // a +60% rate must not touch the yard
  const c = collect(s, NOON + 10 * HOUR_MS);
  assert.equal(c.clover, 2);
  assert.equal(c.state.clover, s.clover + 2);
  s = c.state;
  assert.equal(stored(s, NOON + 10 * HOUR_MS), 0.5);
  assert.equal(collect(s, NOON + 12 * HOUR_MS).clover, 1);
});

test('a new building fills at the old rate until it arrives', () => {
  let s = giveBuilding(pet(), 'patch', NOON);
  s = giveBuilding(s, 'patch', NOON + 4 * HOUR_MS);
  assert.equal(stored(s, NOON + 8 * HOUR_MS), 1 + 2);
});

test('the shed stretches storage to 36, then 48 hours', () => {
  let s = pet();
  s.clover = 100_000;
  for (let i = 0; i < 3; i++) {
    const r = buyBuilding(s, 'patch', NOON);
    s = r.ok ? r.state : s;
  }
  assert.equal(capacity(s), 0.75 * 24);
  for (const hours of [36, 48]) {
    const r = buyShed(s, NOON);
    assert.ok(r.ok);
    s = r.ok ? r.state : s;
    assert.equal(capacity(s), 0.75 * hours);
  }
  assert.deepEqual(buyShed(s, NOON), { ok: false, reason: 'max' });
});

test('front-loaded: the first of each kind pays back fast, later ones slowly, and a full set costs about what it did', () => {
  const s = pet();
  assert.deepEqual(payback(s, 'patch'), { perDay: 6, days: 14 });
  assert.equal(payback(s, 'hive').days, 30);
  assert.equal(payback(s, 'log').days, 60);
  const full = (id: 'patch' | 'hive' | 'log') => {
    let t = pet();
    let spent = 0;
    for (let i = 0; i < BUILDINGS[id].max; i++) { spent += nextPrice(t, id); t = giveBuilding(t, id, NOON); }
    return { spent, lastDays: Math.ceil(nextPrice({ ...t, yard: { ...t.yard!, counts: { [id]: BUILDINGS[id].max - 1 } } }, id) / payback(t, id).perDay) };
  };
  assert.ok(Math.abs(full('patch').spent - 10_500) < 300);
  assert.ok(Math.abs(full('hive').spent - 20_000) < 300);
  assert.ok(Math.abs(full('log').spent - 88_000) < 500);
  assert.ok(full('log').lastDays > 900, 'the last log is a long-term goal');
});
