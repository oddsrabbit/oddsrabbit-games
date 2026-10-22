import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY_MS, EPOCH_MS, type SprintContent } from './puzzle';
import { decodeMask } from './scoring';
import {
  basePoints,
  checkSprintWord,
  clockLabel,
  CLOSE_MARGIN_MS,
  finalPoints,
  freshSprint,
  phaseOf,
  pointsFor,
  runFitsDay,
  ratingFor,
  remainingMs,
  rowPoints,
  sprintMetadata,
  sprintLabel,
  sprintMs,
} from './sprint-rules';

const content: SprintContent = {
  shape: 'square4',
  rows: 4,
  cols: 4,
  tiles: Array.from('ABCDEFGHIJKLMNOP'),
  words: ['ACE', 'BEAD', 'CRANE', 'PLANET', 'PLANETS', 'PLANETARY'],
};

test('classic points by length', () => {
  assert.deepEqual(['CAT', 'BEAD', 'CRANE', 'PLANET', 'PLANETS', 'PLANETARY'].map(pointsFor), [1, 1, 2, 3, 5, 11]);
  assert.equal(pointsFor('QUIT'), 1); // "QU" is two letters
  assert.equal(pointsFor('AT'), 0);
  assert.equal(basePoints(['ACE', 'CRANE', 'PLANETARY']), 14);
});

test('day close: words nobody else found score double', () => {
  const counts = new Map([['ACE', 3], ['CRANE', 1], ['PLANETARY', 1]]);
  assert.deepEqual(finalPoints(['ACE', 'CRANE', 'PLANETARY'], counts), {
    base: 14,
    bonus: 13,
    final: 27,
    unique: ['CRANE', 'PLANETARY'],
  });
});

test('ratings are out of 1000 against the day best', () => {
  assert.equal(ratingFor(27, 27), 1000);
  assert.equal(ratingFor(10, 27), 370);
  assert.equal(ratingFor(0, 0), 0);
});

test('a run lasts 90 seconds on a 4×4 and 2 minutes on bigger boards', () => {
  assert.equal(sprintMs('square4'), 90_000);
  assert.equal(sprintMs('square5'), 120_000);
  assert.equal(sprintMs('lantern'), 120_000);
  assert.equal(sprintLabel('square4'), '90 seconds');
  assert.equal(sprintLabel('corners'), '2 minutes');
  const ms = sprintMs('square4');
  const p = freshSprint(4);
  assert.equal(phaseOf(p, 1000, ms), 'ready');
  p.startedAt = 10_000;
  assert.equal(phaseOf(p, 10_000 + ms - 1, ms), 'playing');
  assert.equal(phaseOf(p, 10_000 + ms, ms), 'done');
  assert.equal(remainingMs(p, 10_000 + 30_000, ms), 60_000);
  assert.equal(remainingMs(p, 10_000 + ms + 5, ms), 0);
  assert.equal(clockLabel(85_000), '1:25');
  assert.equal(clockLabel(400), '0:01');
});

test('words: found, repeats, misses and three-letter minimum', () => {
  const p = freshSprint(4);
  assert.deepEqual(checkSprintWord(content, p, 'CRANE'), { kind: 'found', word: 'CRANE', points: 2 });
  p.found.push('CRANE');
  assert.equal(checkSprintWord(content, p, 'CRANE').kind, 'already');
  assert.equal(checkSprintWord(content, p, 'ZZZ').kind, 'unknown');
  assert.equal(checkSprintWord(content, p, 'AC').kind, 'short');
  assert.deepEqual(decodeMask(content.words, sprintMetadata(content, p).f), ['CRANE']);
});

test('row points read base during the day and final once sealed', () => {
  assert.equal(rowPoints(14, { base: 14, words: 3 }), 14);
  assert.equal(rowPoints(1000, { base: 14, final: 27, rating: 1000, sealed: true }), 27);
  assert.equal(rowPoints(9, null), 9);
});

test('a run can only start if it ends before the day closes', () => {
  const midnight = EPOCH_MS + 3 * DAY_MS; // the end of puzzle-2
  const ms = 90_000;
  const last = midnight - ms - CLOSE_MARGIN_MS;
  assert.equal(runFitsDay(2, last, ms), true);
  assert.equal(runFitsDay(2, last + 1, ms), false);
  assert.equal(runFitsDay(2, midnight - 1, ms), false);
  assert.equal(runFitsDay(2, EPOCH_MS + 2 * DAY_MS, ms), true);
});
