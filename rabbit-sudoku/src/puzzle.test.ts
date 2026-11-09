import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyTierFor, EPOCH_MS, DAY_MS, parseDay, puzzleIndexAt, roundKey } from './puzzle';

const GRID = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const day = { v: 2, tier: 'medium', givens: GRID };

test('calendar', () => {
  assert.equal(puzzleIndexAt(EPOCH_MS), 0);
  assert.equal(puzzleIndexAt(EPOCH_MS + DAY_MS - 1), 0);
  assert.equal(puzzleIndexAt(EPOCH_MS + DAY_MS), 1);
  assert.equal(roundKey(3), 'puzzle-3');
  // Easy Monday, Expert Saturday, whatever weekday the epoch is.
  for (let i = 0; i < 7; i++) {
    const weekday = new Date(EPOCH_MS + i * DAY_MS).getUTCDay();
    if (weekday === 1) assert.equal(dailyTierFor(i), 'easy');
    if (weekday === 6) assert.equal(dailyTierFor(i), 'expert');
  }
});

test('parseDay takes the real shape and refuses anything else', () => {
  assert.deepEqual(parseDay(day), day);
  assert.equal(parseDay({ ...day, v: 1 }), null);
  assert.equal(parseDay({ ...day, tier: 'impossible' }), null);
  assert.equal(parseDay({ ...day, givens: GRID.slice(1) }), null);
  assert.equal(parseDay({ ...day, givens: `55${GRID.slice(2)}` }), null);
  assert.equal(parseDay(null), null);
});
