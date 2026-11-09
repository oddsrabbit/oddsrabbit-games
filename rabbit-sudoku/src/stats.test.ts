import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestStreak, parseStats, streakOf, withDailySolved } from './stats';

test('a streak counts back from today, or from yesterday while today is still open', () => {
  assert.equal(streakOf([3, 4, 5], 5), 3);
  assert.equal(streakOf([3, 4, 5], 6), 3);
  assert.equal(streakOf([3, 4, 5], 7), 0);
  assert.equal(streakOf([1, 3, 4], 4), 2);
  assert.equal(streakOf([], 4), 0);
});

test('the best streak is the longest run', () => {
  assert.equal(bestStreak([1, 2, 3, 7, 8]), 3);
  assert.equal(bestStreak([]), 0);
});

test('solves are recorded once and parsed defensively', () => {
  const s = withDailySolved(withDailySolved(parseStats(null), 4), 4);
  assert.deepEqual(s.solvedDays, [4]);
  assert.deepEqual(parseStats({ solvedDays: [5, 'x', 2, 5] }).solvedDays, [2, 5]);
});
