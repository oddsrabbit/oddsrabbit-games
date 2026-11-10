import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveDate, archiveIntent, archiveKey, parseArchivePlayed, withArchivePlayed } from './archive';

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
