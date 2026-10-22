import assert from 'node:assert/strict';
import test from 'node:test';

import { COLLECTIBLES } from './collectibles';
import { bestFriends, earn, mutualFriends, nextFriendMilestone, noteFriendship, rate, settleLumps } from './economy';
import { act, newPet, visit, type PetState } from './sim';
import { claimStarter, daysUntil, goalDone, markGoal, starterDone, starterReady, starterStep, starterView, STARTER_STEPS } from './starter';
import { DAY_MS, FRIEND_CLOVER } from './tuning';
import { countOf } from './yard';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (): PetState => newPet('econ-pet', 'Clover', 'snow', NOON, UTC);

test('a new rabbit starts with 200 clover and no bonus', () => {
  const s = pet();
  assert.equal(s.clover, 200);
  assert.equal(rate(s).total, 1);
});

test('earn: the rate boosts active clover only; fractions carry over; totals kept by reason', () => {
  const s = pet();
  s.bond = 35; // level 3: +20%
  assert.equal(rate(s).total, 1.2);
  const care = [0, 1, 2, 3, 4].map(() => earn(s, 'care', 2));
  assert.deepEqual(care, [2, 2, 3, 2, 3], '2.4 a time, paid in whole clover');
  assert.equal(earn(s, 'yard', 10), 10, 'the yard is flat');
  assert.equal(earn(s, 'bond', 50), 50, 'lump sums are flat');
  assert.equal(s.earned?.care, 12);
  assert.equal(s.clover, 200 + 12 + 10 + 50);
});

test('Supporters get 25% on everything but lump sums', () => {
  const s = pet();
  s.supporter = true;
  assert.equal(earn(s, 'yard', 100), 125);
  assert.equal(earn(s, 'gift', 20), 25);
  assert.equal(earn(s, 'starter', 100), 100);
});

test('the rate adds up: bond levels, finished sets, best friends', () => {
  const s = pet();
  s.bond = 280; // level 7: +60%
  assert.equal(rate(s).bond, 0.6);
  s.bond = 390; // level 8: +62%
  assert.equal(rate(s).bond, 0.62);
  s.collection = Object.fromEntries(COLLECTIBLES.filter((c) => c.rarity === 'common').map((c) => [c.id, 1]));
  assert.equal(rate(s).sets, 0.05);
  for (let d = 0; d < 20; d++) noteFriendship(s, 'best', 'out', NOON + d * DAY_MS, UTC);
  noteFriendship(s, 'best', 'out', NOON + 19 * DAY_MS, UTC); // same day twice counts once
  assert.equal(bestFriends(s), 1);
  assert.equal(rate(s).total, 1.7);
});

test('bond level-ups and gift-streak milestones pay once each', () => {
  let s = pet();
  s.bond = 35;
  const lumps = settleLumps(s);
  assert.deepEqual(lumps.map((l) => l.clover), [100, 150]);
  assert.deepEqual(settleLumps(s), [], 'only once');
  // the 7th gift pays the 7-day milestone (she isn't thriving: that's its own test)
  s.needs.clean = 40;
  s.gift.streak = 6;
  const r = act(s, 'gift', NOON, UTC);
  assert.ok(r.ok && r.lumps?.some((l) => l.what === '7-day gift streak' && l.clover === 100));
  s = r.ok ? r.state : s;
  assert.equal(r.ok && r.clover, 64, '(30 + 4 × 6) at bond level 3: × 1.2');
});

test('the gift grows 4 a day up to 80', () => {
  const s = pet();
  s.needs.clean = 40;
  s.gift.streak = 40;
  const r = act(s, 'gift', NOON, UTC);
  assert.ok(r.ok && r.clover === 80);
  // thriving, it's a quarter more
  s.needs.clean = 100;
  const t = act(s, 'gift', NOON, UTC);
  assert.ok(t.ok && t.clover === 100);
});

test('getting started: steps go in order, each waits to be claimed and for its day, and step one gives a clover patch', () => {
  let s = pet();
  assert.equal(starterStep(s), 1);
  assert.deepEqual(starterView(s).map((v) => v.status), ['open', 'locked', 'locked', 'locked', 'locked', 'locked']);
  for (const g of ['feed', 'toy', 'bed'] as const) markGoal(s, g);
  assert.equal(starterReady(s), false);
  assert.equal(claimStarter(s, NOON).paid, null, 'not all step-one goals done');
  markGoal(s, 'lantern');
  assert.equal(starterReady(s), true);
  assert.equal(countOf(s, 'patch'), 0, 'nothing paid until claimed');
  let r = claimStarter(s, NOON);
  assert.deepEqual(r.paid, { step: 1, clover: 200, patch: true });
  s = r.state;
  assert.equal(countOf(s, 'patch'), 1);
  assert.equal(claimStarter(s, NOON).paid, null, 'paid once');
  // step two opens straight away: it's for the first day too
  assert.equal(starterStep(s), 2);
  assert.equal(starterView(s)[1]!.status, 'open');
  // goals done early count when their step opens, but each step is its own claim
  for (const g of ['dress', 'nap', 'groom', 'sprout', 'bake', 'earn', 'yard', 'forage', 'friend', 'surface'] as const) markGoal(s, g);
  assert.equal(r.state.starter?.paid.length, 1);
  r = claimStarter(s, NOON);
  assert.equal(r.paid?.step, 2);
  s = r.state;
  // step three is for the second day: waiting, though its goals can be done already
  s.yard = { ...s.yard!, counts: { ...s.yard!.counts, patch: 2 } };
  assert.equal(starterView(s)[2]!.status, 'waiting');
  assert.equal(daysUntil(s, STARTER_STEPS[2]!), 1);
  assert.equal(starterReady(s), false);
  assert.equal(claimStarter(s, NOON).paid, null, 'not before its day');
  s.daysVisited = 2;
  assert.equal(starterView(s)[2]!.status, 'open');
  s.yard = { ...s.yard!, counts: { ...s.yard!.counts, patch: 1 } };
  assert.equal(claimStarter(s, NOON).paid, null, 'step three wants a second patch');
  // from here on, a day each: say she's been visited plenty
  s.daysVisited = 10;
  // goals that count what she has: however it came about
  s.yard = { ...s.yard!, counts: { ...s.yard!.counts, patch: 2 } };
  s.toys = ['yarn'];
  s.collection = { pebble: 1 };
  const paid: number[] = [];
  for (const step of [3, 4]) {
    r = claimStarter(s, NOON);
    assert.equal(r.paid?.step, step);
    paid.push(r.paid!.clover);
    s = r.state;
  }
  // step five: the gift three times, the meadow with a piece that helps, a pinned goal
  s.upgrades = ['meadow'];
  s.meadow = ['stones'];
  s.goal = 'decor:fireplace';
  assert.equal(claimStarter(s, NOON).paid, null, 'the gift takes three days');
  s.gift.streak = 3;
  r = claimStarter(s, NOON);
  paid.push(r.paid!.clover);
  s = r.state;
  // step six: a third patch, a garden upgrade and bond level 3
  s.yard = { ...s.yard!, counts: { ...s.yard!.counts, patch: 3 } };
  s.upgrades = ['meadow', 'plot2'];
  s.bond = 35; // bond level 3
  r = claimStarter(s, NOON);
  paid.push(r.paid!.clover);
  s = r.state;
  assert.deepEqual(paid, [240, 240, 400, 500]);
  assert.equal(starterDone(s), true);
  assert.equal(starterReady(s), false);
});

test('getting started: two steps on the first day, then one a day', () => {
  assert.deepEqual(STARTER_STEPS.map((st) => st.day), [1, 1, 2, 3, 4, 5]);
});

test('getting started: no step before the last two waits on the calendar', () => {
  const calendar = new Set(['streak3', 'bond3']);
  for (const st of STARTER_STEPS.slice(0, -2)) assert.ok(st.goals.every((g) => !calendar.has(g)), `step ${st.step}`);
});

test('getting started: a meadow piece only for looks doesn\'t count, a pinned goal does', () => {
  const s = pet();
  s.meadow = [];
  assert.equal(goalDone(s, 'meadowhelp'), false);
  s.meadow = ['birdbath'];
  assert.equal(goalDone(s, 'meadowhelp'), true);
  assert.equal(goalDone(s, 'pin'), false);
  s.goal = 'toy:kite';
  assert.equal(goalDone(s, 'pin'), true);
});

test('her save keeps a bounded number of friendships: best friends, then the most recent', () => {
  const s = newPet('f', 'Clover', 'snow', NOON, UTC);
  for (let d = 0; d < 20; d++) noteFriendship(s, 'best', 'out', NOON + d * DAY_MS, UTC);
  for (let i = 0; i < 100; i++) noteFriendship(s, `f${i}`, 'in', NOON + (20 + i) * DAY_MS, UTC);
  const kept = Object.keys(s.friends!);
  assert.equal(kept.length, FRIEND_CLOVER.kept);
  assert.ok(kept.includes('best'), 'a best friend stays');
  assert.ok(kept.includes('f99') && !kept.includes('f0'), 'then the newest');
  assert.equal(bestFriends(s), 1);
  assert.ok(JSON.stringify(s).length < 16_384);
});

test('friend milestones pay once each, counting only friends it goes both ways with', () => {
  const s = pet();
  for (let i = 0; i < 5; i++) noteFriendship(s, `f${i}`, 'out', NOON, UTC);
  noteFriendship(s, 'f0', 'in', NOON, UTC);
  noteFriendship(s, 'f1', 'in', NOON, UTC);
  assert.equal(mutualFriends(s), 2);
  assert.deepEqual(nextFriendMilestone(s), { friends: 3, clover: 500 });
  assert.deepEqual(settleLumps(s).filter((l) => l.what.endsWith('friends')), []);
  noteFriendship(s, 'f2', 'in', NOON, UTC);
  const before = s.clover;
  assert.deepEqual(settleLumps(s).filter((l) => l.what.endsWith('friends')), [{ what: '3 friends', clover: 500 }]);
  assert.equal(s.clover, before + 500);
  assert.deepEqual(settleLumps(s), [], 'only once');
  assert.deepEqual(nextFriendMilestone(s), { friends: 5, clover: 1_000 });
  s.supporter = true;
  noteFriendship(s, 'f3', 'in', NOON, UTC);
  noteFriendship(s, 'f4', 'in', NOON, UTC);
  assert.deepEqual(settleLumps(s).map((l) => l.clover), [1_000], 'a lump sum: no Supporter bonus');
});
