import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveIntent, archiveKey, cellsToGo, parseArchivePlayed, pastPage, pastStatus, shortDate, solvedPast, withArchivePlayed } from './archive';

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

test('archive keys', () => {
  assert.equal(archiveKey(4), 'archive-4');
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
  const none = new Set<number>();
  assert.deepEqual(pastPage(0, 30, 'all', none), { days: [], more: false });
  assert.deepEqual(pastPage(4, 30, 'all', none), { days: [3, 2, 1, 0], more: false });
  assert.deepEqual(pastPage(100, 3, 'all', none), { days: [99, 98, 97], more: true });
  // Exactly a page left: nothing older.
  assert.deepEqual(pastPage(3, 3, 'all', none), { days: [2, 1, 0], more: false });
});

test('the chips filter the whole history, not just the page shown', () => {
  const solved = solvedPast(10, [9, 7, 1], [8, 7]);
  assert.deepEqual([...solved].sort(), [1, 7, 8, 9]);
  assert.deepEqual(pastPage(10, 30, 'solved', solved), { days: [9, 8, 7, 1], more: false });
  assert.deepEqual(pastPage(10, 30, 'unsolved', solved), { days: [6, 5, 4, 3, 2, 0], more: false });
  assert.deepEqual(pastPage(10, 2, 'unsolved', solved), { days: [6, 5], more: true });
  // Today and later never count, nor anything malformed.
  assert.deepEqual([...solvedPast(5, [5, 6, 2], [-1, 1.5, 3])].sort(), [2, 3]);
});

test('short dates drop the year within the same year', () => {
  // puzzle-0 is launch day, Monday 2026-11-09.
  assert.equal(shortDate(6, 25), 'Sun, Nov 15');
  assert.equal(shortDate(19, 25), 'Sat, Nov 28');
  assert.equal(shortDate(0, 400), 'Mon, Nov 9, 2026');
});

test('cells to go count the empty cells of a saved board', () => {
  assert.equal(cellsToGo('.'.repeat(81)), 81);
  assert.equal(cellsToGo('5'.repeat(81)), 0);
  assert.equal(cellsToGo(`12.4${'.'.repeat(77)}`), 78);
});
