import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions, randomSolution, solve } from './solver';
import { mulberry32 } from './rng';
import { formatGrid, isSolved, keepsGivens, parseGrid } from './sudoku';

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

test('solves a puzzle, keeping its givens', () => {
  const givens = parseGrid(PUZZLE)!;
  const solution = solve(givens)!;
  assert.ok(isSolved(solution));
  assert.ok(keepsGivens(givens, solution));
  assert.equal(countSolutions(givens), 1);
});

test('counts up to the limit, and clashing givens have no solution', () => {
  assert.equal(countSolutions(new Array(81).fill(0), 2), 2);
  assert.equal(countSolutions(new Array(81).fill(0), 5), 5);
  const clash = parseGrid(PUZZLE)!;
  clash[2] = 5;
  assert.equal(countSolutions(clash), 0);
  assert.equal(solve(clash), null);
});

test('random solutions are valid and follow the seed', () => {
  const a = randomSolution(mulberry32(1));
  const b = randomSolution(mulberry32(1));
  const c = randomSolution(mulberry32(2));
  assert.ok(isSolved(a));
  assert.equal(formatGrid(a), formatGrid(b));
  assert.notEqual(formatGrid(a), formatGrid(c));
});
