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
  // Easy Monday up to Expert Saturday, then a Medium Sunday, whatever weekday the epoch is.
  const week = ['medium', 'easy', 'easy', 'medium', 'medium', 'hard', 'expert'];
  for (let i = 0; i < 7; i++) {
    const weekday = new Date(EPOCH_MS + i * DAY_MS).getUTCDay();
    assert.equal(dailyTierFor(i), week[weekday]);
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
