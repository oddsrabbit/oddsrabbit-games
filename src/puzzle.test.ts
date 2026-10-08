import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY_MS, EPOCH_MS, parseCasual, parseDay, parseResults, puzzleIndexAt, shapeForPuzzle } from './puzzle';

test('puzzle 0 is the epoch day, and days roll at UTC midnight', () => {
  assert.equal(puzzleIndexAt(EPOCH_MS), 0);
  assert.equal(puzzleIndexAt(EPOCH_MS + DAY_MS - 1), 0);
  assert.equal(puzzleIndexAt(EPOCH_MS + DAY_MS), 1);
});

test('the week runs 4×4 Monday to Thursday, 5×5 at the weekend, a shape on Sunday', () => {
  // The epoch is a Monday.
  assert.equal(new Date(EPOCH_MS).getUTCDay(), 1);
  const week = Array.from({ length: 7 }, (_, i) => shapeForPuzzle(i).id);
  assert.deepEqual(week.slice(0, 6), ['square4', 'square4', 'square4', 'square4', 'square5', 'square5']);
  const sundays = [6, 13, 20, 27].map((i) => shapeForPuzzle(i).id);
  assert.deepEqual(sundays, ['corners', 'hollow', 'lantern', 'corners']);
});

test('parseCasual accepts the generated shape and rejects anything else', () => {
  const good = {
    shape: 'square4', rows: 2, cols: 2, tiles: ['A', 'QU', null, 'T'],
    words: ['QUAT'], bonus: [], star: 'QUAT',
  };
  assert.ok(parseCasual(good));
  assert.equal(parseCasual({ ...good, tiles: ['A', 'Q', null, 'T'] }), null);
  assert.equal(parseCasual({ ...good, tiles: ['A'] }), null);
  assert.equal(parseCasual({ ...good, star: 'NOPE' }), null);
  assert.equal(parseCasual({ ...good, words: ['lower'] }), null);
  assert.equal(parseCasual(null), null);
});

test('parseDay needs v2 with both boards', () => {
  const casual = { shape: 'square4', rows: 2, cols: 2, tiles: ['A', 'B', 'C', 'D'], words: ['ABCD'], bonus: [], star: 'ABCD' };
  const sprint = { shape: 'square4', rows: 2, cols: 2, tiles: ['C', 'A', 'B', 'T'], words: ['CAB', 'CAT'] };
  assert.ok(parseDay({ v: 2, sprint, casual }));
  assert.equal(parseDay({ v: 1, sprint, casual }), null);
  assert.equal(parseDay({ v: 2, casual }), null);
  assert.equal(parseDay({ v: 2, sprint: { ...sprint, words: [] }, casual }), null);
});

test('parseResults lines its counts up with the word list', () => {
  assert.deepEqual(parseResults({ players: 3, counts: [1, 0, 3] }, 3), { players: 3, counts: [1, 0, 3] });
  assert.equal(parseResults({ players: 3, counts: [1, 0] }, 3), null);
  assert.equal(parseResults({ players: 3, counts: [1, -1, 0] }, 3), null);
  assert.equal(parseResults(null, 3), null);
});

test('parseResults treats the sealer\'s placeholder as still tallying', () => {
  assert.equal(parseResults({ players: 0, counts: [0, 0, 0], sealing: true }, 3), null);
});
