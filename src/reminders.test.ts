import assert from 'node:assert/strict';
import test from 'node:test';

import { CROPS, plant, startVacation } from './extras';
import { desiredReminders } from './reminders';
import { act, newPet } from './sim';
import { DAY_MS, HOUR_MS } from './tuning';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);

const keys = (xs: { key: string }[]) => xs.map((x) => x.key).sort();

test('with nothing running, only "misses you" is wanted, a day out', () => {
  const r = desiredReminders(newPet('p', 'Clover', 'snow', NOON, UTC), NOON, UTC);
  assert.deepEqual(keys(r), ['misses-you']);
  assert.equal(r[0]!.fireAtMs, NOON + DAY_MS);
});

test('a nap and a bake each want a reminder at their end time', () => {
  let s = newPet('p', 'Clover', 'snow', NOON, UTC);
  s.needs.energy = 40;
  const napped = act(s, 'nap', NOON, UTC);
  assert.ok(napped.ok);
  s = napped.state;
  const baked = act(s, 'bake', NOON, UTC);
  assert.ok(baked.ok);
  const r = desiredReminders(baked.state, NOON + 60_000, UTC);
  assert.deepEqual(keys(r), ['misses-you', 'nap-done', 'treat-ready']);
  // from 40 energy she sleeps until full: 60 / 12 an hour
  assert.equal(r.find((x) => x.key === 'nap-done')!.fireAtMs, NOON + 5 * HOUR_MS);
  assert.match(r.find((x) => x.key === 'nap-done')!.body, /Clover is awake/);
});

test("tomorrow's gift reminder only once today's gift is opened, at 09:00", () => {
  const s = newPet('p', 'Clover', 'snow', NOON, UTC);
  assert.ok(!keys(desiredReminders(s, NOON, UTC)).includes('daily-gift'));
  const opened = act(s, 'gift', NOON, UTC);
  assert.ok(opened.ok);
  const gift = desiredReminders(opened.state, NOON, UTC).find((x) => x.key === 'daily-gift');
  assert.ok(gift);
  assert.equal(new Date(gift.fireAtMs).toISOString(), '2026-09-25T09:00:00.000Z');
});

test('a gift opened just after the rollover is announced the NEXT morning, not at 09:00 today', () => {
  const sixAm = Date.UTC(2026, 8, 24, 6, 0);
  const opened = act(newPet('p', 'Clover', 'snow', sixAm, UTC), 'gift', sixAm, UTC);
  assert.ok(opened.ok);
  const gift = desiredReminders(opened.state, sixAm, UTC).find((x) => x.key === 'daily-gift');
  assert.ok(gift);
  assert.equal(new Date(gift.fireAtMs).toISOString(), '2026-09-25T09:00:00.000Z');
});

test('a growing crop wants a reminder when the soonest plot is ready', () => {
  const s = newPet('p', 'Clover', 'snow', NOON, UTC);
  s.clover = 50;
  s.upgrades = ['plot2'];
  const a = plant(s, 0, 'golden', NOON);
  assert.ok(a.ok);
  const b = a.ok ? plant(a.state, 1, 'berry', NOON) : a;
  assert.ok(b.ok);
  if (!b.ok) return;
  const r = desiredReminders(b.state, NOON + 60_000, UTC);
  assert.equal(r.find((x) => x.key === 'garden-ready')!.fireAtMs, NOON + CROPS.berry.growMs);
  assert.ok(r.length <= 5, 'fits the per-game pending cap');
});

test('on vacation, only a welcome-home note', () => {
  const s = startVacation(newPet('p', 'Clover', 'snow', NOON, UTC), 3, NOON);
  const r = desiredReminders(s, NOON + HOUR_MS, UTC);
  assert.deepEqual(keys(r), ['misses-you']);
  assert.equal(r[0]!.fireAtMs, NOON + 3 * DAY_MS);
});
