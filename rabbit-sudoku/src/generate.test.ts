import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUE_FLOOR, generatePuzzle, MIN_STEPS_AT_TIER } from './generate';
import { grade, TIERS } from './grade';
import { mulberry32 } from './rng';
import { countSolutions } from './solver';
import { keepsGivens, parseGrid } from './sudoku';

for (const tier of TIERS) {
  test(`generates a unique, symmetric ${tier} puzzle that needs ${tier}`, () => {
    const p = generatePuzzle(mulberry32(42), tier)!;
    assert.ok(p, `no ${tier} puzzle`);
    const givens = parseGrid(p.givens)!;
    assert.equal(countSolutions(givens, 2), 1);
    assert.ok(keepsGivens(givens, parseGrid(p.solution)!));
    const g = grade(givens)!;
    assert.equal(g.tier, tier);
    assert.ok(g.stepsAtTier >= MIN_STEPS_AT_TIER[tier]);
    assert.ok(p.clues >= CLUE_FLOOR[tier]);
    for (let c = 0; c < 81; c++) assert.equal(givens[c] === 0, givens[80 - c] === 0, `not symmetric at ${c}`);
    // Same seed, same puzzle.
    assert.equal(generatePuzzle(mulberry32(42), tier)!.givens, p.givens);
  });
}
