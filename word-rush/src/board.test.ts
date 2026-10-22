import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrie, findPath, isAdjacent, neighbours, solve, startTiles, wordForPath, type Board } from './board';

// C A T S
// O R E Q
// . N D U     (a hole at row 2, col 0)
const board: Board = {
  rows: 3,
  cols: 4,
  tiles: ['C', 'A', 'T', 'S', 'O', 'R', 'E', 'QU', null, 'N', 'D', 'U'],
};

test('neighbours skip holes and the grid edge', () => {
  const adj = neighbours(board);
  assert.deepEqual(adj[0], [1, 4, 5]);
  assert.deepEqual(adj[4], [0, 1, 5, 9]); // 8 is a hole
  assert.deepEqual(adj[8], []);
});

test('isAdjacent covers diagonals only one step away', () => {
  assert.ok(isAdjacent(board, 0, 5));
  assert.ok(!isAdjacent(board, 0, 2));
  assert.ok(!isAdjacent(board, 3, 4)); // row wrap is not adjacency
  assert.ok(!isAdjacent(board, 5, 5));
});

test('solve finds traceable words of the minimum length, with their paths', () => {
  const trie = buildTrie(['CART', 'CARE', 'CARS', 'TREND', 'STAR', 'CAT', 'QUEST', 'QUED', 'RACE']);
  const found = solve(board, trie);
  assert.deepEqual([...found.keys()].sort(), ['CARE', 'CART', 'QUED', 'QUEST', 'STAR', 'TREND']);
  assert.equal(wordForPath(board, found.get('QUEST')!), 'QUEST');
  // CARS: S isn't next to R. RACE: C isn't next to E. CAT: too short.
  assert.ok(!found.has('CARS') && !found.has('RACE') && !found.has('CAT'));
});

test('a Qu tile spells two letters', () => {
  assert.deepEqual(findPath(board, 'QUED'), [7, 6, 10]);
  assert.equal(findPath(board, 'QED'), null);
});

test('findPath reuses no tile and respects a fixed start', () => {
  assert.equal(findPath(board, 'TATA'), null);
  assert.deepEqual(findPath(board, 'STAR', 3), [3, 2, 1, 5]);
  assert.equal(findPath(board, 'STAR', 0), null);
});

test('startTiles lists every tile a word can begin on', () => {
  const twoWays: Board = { rows: 2, cols: 3, tiles: ['A', 'B', 'A', 'X', 'X', 'X'] };
  assert.deepEqual(startTiles(twoWays, 'AB'), [0, 2]);
});
