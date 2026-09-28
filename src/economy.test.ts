import assert from 'node:assert/strict';
import test from 'node:test';

import { COLLECTIBLES } from './collectibles';
import { bestFriends, earn, mutualFriends, nextFriendMilestone, noteFriendship, rate, settleLumps } from './economy';
import { act, newPet, visit, type PetState } from './sim';
import { claimStarter, markGoal, starterDone, starterReady, starterStep, starterView } from './starter';
import { DAY_MS, FRIEND_CLOVER } from './tuning';
import { countOf } from './yard';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = (): PetState => newPet('econ-pet', 'Clover', 'snow', NOON, UTC);

test('a new rabbit starts with 100 clover and no bonus', () => {
  const s = pet();
  assert.equal(s.clover, 100);
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
  assert.equal(s.clover, 100 + 12 + 10 + 50);
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
  assert.deepEqual(lumps.map((l) => l.clover), [50, 75]);
  assert.deepEqual(settleLumps(s), [], 'only once');
  // the 7th gift pays the 7-day milestone
  s.gift.streak = 6;
  const r = act(s, 'gift', NOON, UTC);
  assert.ok(r.ok && r.lumps?.some((l) => l.what === '7-day gift streak' && l.clover === 50));
  s = r.ok ? r.state : s;
  assert.equal(r.ok && r.clover, 32, '(15 + 2 × 6) at bond level 3: × 1.2');
});

test('the gift grows 2 a day up to 40', () => {
  const s = pet();
  s.gift.streak = 40;
  const r = act(s, 'gift', NOON, UTC);
  assert.ok(r.ok && r.clover === 40);
});

test('getting started: steps go in order, each waits to be claimed, and step one gives a clover patch', () => {
  let s = pet();
  assert.equal(starterStep(s), 1);
  assert.deepEqual(starterView(s).map((v) => v.status), ['open', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
  for (const g of ['feed', 'toy', 'bed'] as const) markGoal(s, g);
  assert.equal(starterReady(s), false);
  assert.equal(claimStarter(s, NOON).paid, null, 'not all step-one goals done');
  markGoal(s, 'dress');
  assert.equal(starterReady(s), true);
  assert.equal(countOf(s, 'patch'), 0, 'nothing paid until claimed');
  let r = claimStarter(s, NOON);
  assert.deepEqual(r.paid, { step: 1, clover: 100, patch: true });
  s = r.state;
  assert.equal(countOf(s, 'patch'), 1);
  assert.equal(claimStarter(s, NOON).paid, null, 'paid once');
  // the next step opens straight away, no new day needed
  assert.equal(starterStep(s), 2);
  assert.equal(starterView(s)[1]!.status, 'open');
  // goals done early count when their step opens, but each step is its own claim
  for (const g of ['nap', 'harvest', 'bake', 'yard', 'friend', 'decor', 'decor', 'decor'] as const) markGoal(s, g);
  s.gift.streak = 3;
  s.upgrades = ['meadow'];
  s.bond = 35; // bond level 3
  for (const step of [2, 3, 4, 5, 6, 7]) {
    r = claimStarter(s, NOON);
    assert.equal(r.paid?.step, step);
    s = r.state;
  }
  assert.equal(starterDone(s), true);
  assert.equal(starterReady(s), false);
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
  assert.deepEqual(nextFriendMilestone(s), { friends: 3, clover: 250 });
  assert.deepEqual(settleLumps(s).filter((l) => l.what.endsWith('friends')), []);
  noteFriendship(s, 'f2', 'in', NOON, UTC);
  const before = s.clover;
  assert.deepEqual(settleLumps(s).filter((l) => l.what.endsWith('friends')), [{ what: '3 friends', clover: 250 }]);
  assert.equal(s.clover, before + 250);
  assert.deepEqual(settleLumps(s), [], 'only once');
  assert.deepEqual(nextFriendMilestone(s), { friends: 5, clover: 500 });
  s.supporter = true;
  noteFriendship(s, 'f3', 'in', NOON, UTC);
  noteFriendship(s, 'f4', 'in', NOON, UTC);
  assert.deepEqual(settleLumps(s).map((l) => l.clover), [500], 'a lump sum: no Supporter bonus');
});
