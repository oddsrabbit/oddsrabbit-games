import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveDate, archiveIntent, archiveKey, parseArchivePlayed, pastDays, pastStatus, unsolvedPast, withArchivePlayed } from './archive';

test('archiveIntent opens only a past day', () => {
  const play = (roundKey: unknown) => ({ target: 'play', roundKey });
  assert.equal(archiveIntent(play('puzzle-0'), 5), 0);
  assert.equal(archiveIntent(play('puzzle-4'), 5), 4);
  // Today, the future and anything malformed launch as normal.
  assert.equal(archiveIntent(play('puzzle-5'), 5), null);
  assert.equal(archiveIntent(play('puzzle-6'), 5), null);
  assert.equal(archiveIntent(play('puzzle--1'), 5), null);
  assert.equal(archiveIntent(play('puzzle-1.5'), 5), null);
  assert.equal(archiveIntent(play('puzzle-'), 5), null);
  assert.equal(archiveIntent(play(' puzzle-1'), 5), null);
  assert.equal(archiveIntent(play('draw-1'), 5), null);
  assert.equal(archiveIntent(play(3), 5), null);
  assert.equal(archiveIntent({ target: 'leaderboard', roundKey: 'puzzle-1' }, 5), null);
  assert.equal(archiveIntent({ roundKey: 'puzzle-1' }, 5), null);
  assert.equal(archiveIntent(null, 5), null);
  assert.equal(archiveIntent(undefined, 5), null);
});

test('archive-played merges, dedupes and sorts', () => {
  assert.deepEqual(withArchivePlayed(null, 3), [3]);
  assert.deepEqual(withArchivePlayed('garbage', 3), [3]);
  assert.deepEqual(withArchivePlayed({ days: [1] }, 3), [3]);
  assert.deepEqual(withArchivePlayed([5, 1, 3], 3), [1, 3, 5]);
  assert.deepEqual(withArchivePlayed([5, 'x', 1.5, -2, null, 1, 1], 2), [1, 2, 5]);
  assert.deepEqual(parseArchivePlayed([2, 0]), [0, 2]);
});

test('archive keys and dates', () => {
  assert.equal(archiveKey(4), 'archive-4');
  // puzzle-0 is launch day, Monday 2026-11-09.
  assert.equal(archiveDate(0), 'Monday, Nov 9, 2026');
  assert.equal(archiveDate(6), 'Sunday, Nov 15, 2026');
});

test('a past day is solved however it was solved, else in progress with a save', () => {
  assert.equal(pastStatus(2, [2], [], null), 'solved');
  assert.equal(pastStatus(2, [], [2], null), 'solved');
  assert.equal(pastStatus(2, [], [], { solved: true }), 'solved');
  assert.equal(pastStatus(2, [], [], { solved: false }), 'progress');
  // Played again after solving: in progress until it's solved again.
  assert.equal(pastStatus(2, [2], [2], { solved: false }), 'progress');
  assert.equal(pastStatus(2, [1, 3], [0], null), 'new');
});

test('the past list runs newest first and pages', () => {
  assert.deepEqual(pastDays(0, 30), []);
  assert.deepEqual(pastDays(4, 30), [3, 2, 1, 0]);
  assert.deepEqual(pastDays(100, 3), [99, 98, 97]);
});

test('unsolved past days count each day once and ignore today and later', () => {
  assert.equal(unsolvedPast(0, [], []), 0);
  assert.equal(unsolvedPast(5, [], []), 5);
  assert.equal(unsolvedPast(5, [0, 1], [1, 2]), 2);
  assert.equal(unsolvedPast(5, [5, 6], [9]), 5);
});
