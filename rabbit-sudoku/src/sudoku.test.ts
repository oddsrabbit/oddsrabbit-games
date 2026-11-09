import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxOf, duplicateCells, formatGrid, isSolved, keepsGivens, parseGrid, PEERS, sees, UNITS, unitsOf } from './sudoku';

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

test('parse and format round-trip, and bad text is refused', () => {
  const grid = parseGrid(PUZZLE)!;
  assert.equal(grid.length, 81);
  assert.equal(grid[0], 5);
  assert.equal(grid[2], 0);
  assert.equal(formatGrid(grid), PUZZLE);
  assert.equal(formatGrid(parseGrid(PUZZLE.replace(/\./g, '0'))!), PUZZLE);
  assert.equal(parseGrid(PUZZLE.slice(1)), null);
  assert.equal(parseGrid(`x${PUZZLE.slice(1)}`), null);
});

test('units and peers', () => {
  assert.equal(UNITS.length, 27);
  for (const unit of UNITS) assert.equal(new Set(unit).size, 9);
  for (let c = 0; c < 81; c++) {
    assert.equal(PEERS[c]!.length, 20);
    for (const u of unitsOf(c)) assert.ok(UNITS[u]!.includes(c));
  }
  assert.equal(boxOf(80), 8);
  assert.equal(boxOf(30), 4);
  assert.ok(sees(0, 8) && sees(0, 72) && sees(0, 20));
  assert.ok(!sees(0, 0) && !sees(0, 30));
});

test('duplicates, solved, givens kept', () => {
  const grid = parseGrid(PUZZLE)!;
  assert.deepEqual(duplicateCells(grid), []);
  grid[2] = 5; // a second 5 in row 0
  assert.deepEqual(duplicateCells(grid), [0, 2]);
  assert.ok(!isSolved(grid));
  assert.ok(keepsGivens(parseGrid(PUZZLE)!, grid));
  grid[0] = 1;
  assert.ok(!keepsGivens(parseGrid(PUZZLE)!, grid));
});
