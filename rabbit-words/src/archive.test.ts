import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveStateKey, mergeArchivePlayed, parseArchiveIntent } from './archive';

test('parseArchiveIntent accepts a past day', () => {
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-0' }, 10), 0);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-9' }, 10), 9);
});

test('parseArchiveIntent treats today and future days as a normal launch', () => {
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-10' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-11' }, 10), null);
});

test('parseArchiveIntent ignores malformed or other intents', () => {
  assert.equal(parseArchiveIntent(null, 10), null);
  assert.equal(parseArchiveIntent(undefined, 10), null);
  assert.equal(parseArchiveIntent({}, 10), null);
  assert.equal(parseArchiveIntent({ target: 'leaderboard', roundKey: 'puzzle-3' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 3 }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle--1' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-1.5' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'day-3' }, 10), null);
});

test('mergeArchivePlayed adds, dedupes and sorts', () => {
  assert.deepEqual(mergeArchivePlayed('[5,2]', 3), [2, 3, 5]);
  assert.deepEqual(mergeArchivePlayed('[2,3,5]', 3), [2, 3, 5]);
  assert.deepEqual(mergeArchivePlayed('[3,3,1]', 0), [0, 1, 3]);
});

test('mergeArchivePlayed tolerates missing or invalid stored values', () => {
  assert.deepEqual(mergeArchivePlayed(null, 4), [4]);
  assert.deepEqual(mergeArchivePlayed(undefined, 4), [4]);
  assert.deepEqual(mergeArchivePlayed('', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('not json', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('{"a":1}', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('[1,"2",-3,2.5,null,7]', 4), [1, 4, 7]);
});

test('archiveStateKey is per day and never today', () => {
  assert.equal(archiveStateKey(12), 'archive-12');
});
