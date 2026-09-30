import assert from 'node:assert/strict';
import test from 'node:test';

import { claimGoal, GOALS_OPEN, goalsAllDone, goalsReady, LATER_GOALS, openGoals } from './goals';
import { newPet, type PetState } from './sim';
import { STARTER_STEPS } from './starter';

const NOON = Date.UTC(2026, 5, 15, 12);
const settled = (): PetState => {
  const s = newPet('goals-pet', 'Clover', 'snow', NOON, 'UTC');
  s.starter = { counts: {}, paid: STARTER_STEPS.map((st) => st.step) };
  return s;
};
const withYard = (s: PetState, counts: Record<string, number>, sheds = 0): PetState => ({
  ...s, yard: { counts, sheds, stored: 0, atMs: NOON },
});

test('later goals: none until Getting started is done', () => {
  const s = newPet('goals-pet', 'Clover', 'snow', NOON, 'UTC');
  assert.deepEqual(openGoals(s), []);
  assert.equal(openGoals(settled()).length, GOALS_OPEN);
});

test('later goals: the first few are open, and claiming one opens the next', () => {
  let s = withYard(settled(), { patch: 3 });
  assert.deepEqual(openGoals(s).map((g) => g.id), ['hive', 'set', 'patch5']);
  assert.deepEqual(goalsReady(s), []);
  assert.equal(claimGoal(s, 'hive'), null, 'not done yet');
  s = withYard(s, { patch: 3, hive: 1 });
  assert.deepEqual(goalsReady(s).map((g) => g.id), ['hive']);
  const before = s.clover;
  const r = claimGoal(s, 'hive')!;
  assert.equal(r.clover, 100);
  s = r.state;
  assert.equal(s.clover, before + 100);
  assert.equal(claimGoal(s, 'hive'), null, 'paid once');
  assert.deepEqual(openGoals(s).map((g) => g.id), ['set', 'patch5', 'shed']);
});

test('later goals: one done early waits until it opens', () => {
  const s = withYard(settled(), { patch: 3, log: 1 });
  assert.equal(claimGoal(s, 'log'), null, 'not open yet');
});

test('later goals: a stuck goal (no best friend) doesn\'t block the ones after it', () => {
  let s = withYard(settled(), { patch: 5, hive: 5, log: 1 }, 1);
  s.soilLevel = 2;
  s.meadow = ['sunflowers'];
  // everything but the set and the best friend
  let claimed = 0;
  for (let i = 0; i < 20; i++) {
    const g = goalsReady(s)[0];
    if (!g) break;
    s = claimGoal(s, g.id)!.state;
    claimed += 1;
  }
  assert.equal(claimed, LATER_GOALS.length - 2);
  assert.deepEqual(openGoals(s).map((g) => g.id).sort(), ['bestfriend', 'set']);
  assert.equal(goalsAllDone(s), false);
});
