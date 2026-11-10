import assert from 'node:assert/strict';
import test from 'node:test';

import { archiveStateKey, mergeArchivePlayed, parseArchiveIntent } from './archive';

test('a past day is an archive play', () => {
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-0' }, 10), 0);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-9' }, 10), 9);
});

test('today, future days and malformed intents are a normal launch', () => {
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-10' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-11' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-05' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle--1' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 'puzzle-1.5' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play', roundKey: 3 }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'play' }, 10), null);
  assert.equal(parseArchiveIntent({ target: 'leaderboard', roundKey: 'puzzle-3' }, 10), null);
  assert.equal(parseArchiveIntent(null, 10), null);
});

test('archive progress never shares a key with today', () => {
  assert.equal(archiveStateKey(4), 'archive-4');
  assert.notEqual(archiveStateKey(0), 'today');
});

test('archive-played merges, dedupes and sorts', () => {
  assert.deepEqual(mergeArchivePlayed('[5,2,9]', 3), [2, 3, 5, 9]);
  assert.deepEqual(mergeArchivePlayed('[2,3]', 3), [2, 3]);
  assert.deepEqual(mergeArchivePlayed('[3,3,1]', 0), [0, 1, 3]);
});

test('archive-played tolerates a missing or invalid value', () => {
  assert.deepEqual(mergeArchivePlayed(null, 4), [4]);
  assert.deepEqual(mergeArchivePlayed(undefined, 4), [4]);
  assert.deepEqual(mergeArchivePlayed('', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('not json', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('{"a":1}', 4), [4]);
  assert.deepEqual(mergeArchivePlayed('[1,"2",-3,2.5,null,7]', 4), [1, 4, 7]);
});
