import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archivePlayIntent, withArchivePlayed } from './archive';

test('archivePlayIntent: a past day from either round key', () => {
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'puzzle-3' }, 10), 3);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual-3' }, 10), 3);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual-0' }, 10), 0);
  // Older than the in-game list's 30 days still opens.
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual-5' }, 400), 5);
});

test('archivePlayIntent: today, the future and anything else are a normal launch', () => {
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'puzzle-10' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual-11' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'leaderboard', roundKey: 'puzzle-3' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'sprint-3' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual--1' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 'casual-3x' }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play', roundKey: 3 }, 10), null);
  assert.equal(archivePlayIntent({ target: 'play' }, 10), null);
  assert.equal(archivePlayIntent(null, 10), null);
  assert.equal(archivePlayIntent(undefined, 10), null);
});

test('withArchivePlayed: merges, dedupes and sorts', () => {
  assert.deepEqual(withArchivePlayed([7, 2], 4), [2, 4, 7]);
  assert.deepEqual(withArchivePlayed([2, 4], 4), [2, 4]);
  assert.deepEqual(withArchivePlayed([0], 0), [0]);
});

test('withArchivePlayed: tolerates a missing or invalid value', () => {
  assert.deepEqual(withArchivePlayed(undefined, 3), [3]);
  assert.deepEqual(withArchivePlayed(null, 3), [3]);
  assert.deepEqual(withArchivePlayed({ 0: 1 }, 3), [3]);
  assert.deepEqual(withArchivePlayed('[1,2]', 3), [3]);
  assert.deepEqual(withArchivePlayed([1, '2', -1, 1.5, null, 5, 1], 3), [1, 3, 5]);
});
