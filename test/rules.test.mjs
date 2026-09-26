// The client rules mirror is a preview of the server's TilesRules.php, so these
// check the few cases a player sees most. Parity with the PHP is checked
// against the server's own suite (tools/test-match-rules.php in the WordPress
// repo), not here.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../js/rules.js', import.meta.url), 'utf8'), { window });
const R = window.TilesRules;

const empty = () => Array.from({ length: R.SIZE }, () => new Array(R.SIZE).fill(null));
const lay = R.layout();
const word = (s, row, col, down = false) =>
  [...s].map((letter, i) => ({ row: down ? row + i : row, col: down ? col : col + i, letter }));

test('layout is symmetric with a double word at the centre', () => {
  assert.equal(lay.length, R.SIZE);
  assert.equal(lay[R.CENTER].charAt(R.CENTER), 'w');
  for (let r = 0; r < R.SIZE; r++) {
    for (let c = 0; c < R.SIZE; c++) assert.equal(lay[r].charAt(c), lay[c].charAt(r));
  }
});

test('first word must cover the centre and score its premium', () => {
  assert.equal(R.evaluate(empty(), word('CAT', 0, 0), lay, true).ok, false);
  const res = R.evaluate(empty(), word('CAT', 7, 6), lay, true);
  assert.equal(res.ok, true);
  assert.equal(res.words[0].word, 'CAT');
  assert.equal(res.score, (3 + 1 + 1) * 2);
});

test('blanks score zero', () => {
  const tiles = word('CAT', 7, 6);
  tiles[0].blank = true;
  assert.equal(R.evaluate(empty(), tiles, lay, true).score, (0 + 1 + 1) * 2);
});

test('tiles must be in one unbroken line', () => {
  const diag = [{ row: 7, col: 7, letter: 'A' }, { row: 8, col: 8, letter: 'T' }];
  assert.equal(R.evaluate(empty(), diag, lay, true).ok, false);
  const gap = [{ row: 7, col: 7, letter: 'A' }, { row: 7, col: 9, letter: 'T' }];
  assert.equal(R.evaluate(empty(), gap, lay, true).ok, false);
});

test('later moves must connect, and cross-words count', () => {
  const board = empty();
  word('CAT', 7, 6).forEach((t) => (board[t.row][t.col] = { l: t.letter, b: false }));
  assert.equal(R.evaluate(board, word('DOG', 0, 0), lay, false).ok, false);
  // T under the A of CAT makes AT down.
  const res = R.evaluate(board, [{ row: 8, col: 7, letter: 'T' }], lay, false);
  assert.equal(res.ok, true);
  assert.equal(res.words.map((w) => w.word).join(), 'AT');
});

test('using all seven tiles adds the bingo bonus', () => {
  const res = R.evaluate(empty(), word('RETAINS', 7, 4), lay, true);
  assert.equal(res.bingo, true);
  assert.ok(res.score >= R.BINGO);
});
