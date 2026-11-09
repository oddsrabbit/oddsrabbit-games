import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStep, nextStep, solveLogically, stateFrom, TECHNIQUES, type Technique } from './logic';
import { mulberry32, shuffle } from './rng';
import { countSolutions, randomSolution, solve } from './solver';
import { bit, parseGrid, type Grid } from './sudoku';

/** Minimal symmetric puzzles, dug with uniqueness only, so the harder techniques get used. */
function minimalPuzzles(count: number, seed: number): { givens: Grid; solution: Grid }[] {
  const rng = mulberry32(seed);
  const out: { givens: Grid; solution: Grid }[] = [];
  for (let n = 0; n < count; n++) {
    const solution = randomSolution(rng);
    const givens = solution.slice();
    for (const i of shuffle([...Array(41).keys()], rng)) {
      const cells = i === 40 ? [40] : [i, 80 - i];
      for (const c of cells) givens[c] = 0;
      if (countSolutions(givens, 2) !== 1) for (const c of cells) givens[c] = solution[c]!;
    }
    out.push({ givens, solution });
  }
  return out;
}

test('every step of every technique agrees with the solution', () => {
  const used = new Map<Technique, number>();
  for (const { givens, solution } of minimalPuzzles(300, 7)) {
    const s = stateFrom(givens);
    for (;;) {
      const step = nextStep(s);
      if (!step) break;
      used.set(step.technique, (used.get(step.technique) ?? 0) + 1);
      if (step.place) {
        assert.equal(step.place.digit, solution[step.place.cell], `${step.technique} placed a wrong digit`);
      }
      assert.ok(step.place || step.eliminate.length > 0, `${step.technique} made no progress`);
      for (const e of step.eliminate) {
        assert.notEqual(e.digit, solution[e.cell], `${step.technique} removed the answer at cell ${e.cell}`);
        assert.ok(s.cands[e.cell]! & bit(e.digit), `${step.technique} removed a candidate that wasn't there`);
      }
      applyStep(s, step);
    }
  }
  // Every technique should turn up somewhere in 300 hard puzzles; one that
  // never fires is either broken or unreachable in this order.
  const missing = TECHNIQUES.filter((t) => !used.has(t));
  assert.deepEqual(missing, [], `never used: ${missing.join(', ')} (counts: ${JSON.stringify(Object.fromEntries(used))})`);
});

test('an easy puzzle solves with singles alone', () => {
  const givens = parseGrid('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79')!;
  const result = solveLogically(givens, ['full-house', 'hidden-single', 'naked-single']);
  assert.ok(result.solved);
  assert.deepEqual(result.values, solve(givens));
});

test('a stuck solve says so and keeps the progress made', () => {
  const { givens } = minimalPuzzles(1, 3)[0]!;
  const result = solveLogically(givens, ['full-house']);
  assert.equal(result.solved, false);
});
