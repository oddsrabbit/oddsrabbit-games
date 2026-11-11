// Puzzle generation, seeded so a day's puzzles rebuild exactly:
//
//   1. fill a random complete grid;
//   2. take clues out in 180°-symmetric pairs, keeping a removal only while
//      the puzzle has one solution and logic up to the target tier solves it,
//      and never going under the tier's clue floor;
//   3. accept the result only if it really needs the target tier, and (for
//      Hard) mixes its techniques without piling them up.
//
// Runs offline (tools/gen-puzzles.ts). Hard and Expert take the most tries.

import { grade, TIER_OF, type Grade, type Tier } from './grade';
import type { Technique } from './logic';
import { shuffle } from './rng';
import { countSolutions, randomSolution } from './solver';
import { CELLS, clueCount, formatGrid, type Grid } from './sudoku';

/** Fewest clues a puzzle of each tier may have. More clues keep the easy tiers gentle. */
export const CLUE_FLOOR: Record<Tier, number> = { easy: 32, medium: 27, hard: 24, expert: 22 };

export interface Puzzle {
  tier: Tier;
  givens: string;
  solution: string;
  clues: number;
  grade: Grade;
}

/**
 * Steps a puzzle must take at its own tier. One X-Wing in a sea of singles
 * plays like the tier below, so the harder tiers need their technique twice.
 */
export const MIN_STEPS_AT_TIER: Record<Tier, number> = { easy: 1, medium: 2, hard: 2, expert: 2 };

/**
 * Different techniques a puzzle must use at its own tier. Left alone, Hard is
 * nearly always XY-Wing after XY-Wing, since that's the Hard step random grids
 * need most; asking for two kinds brings in the X-Wings and triples.
 */
export const MIN_KINDS_AT_TIER: Record<Tier, number> = { easy: 1, medium: 1, hard: 2, expert: 1 };

/** Most steps a puzzle may take at its own tier, so Hard stays a step below Expert. */
export const MAX_STEPS_AT_TIER: Record<Tier, number> = { easy: Infinity, medium: Infinity, hard: 3, expert: Infinity };

/** How many different techniques of its own tier `g` used. */
export function kindsAtTier(g: Grade): number {
  return (Object.keys(g.uses) as Technique[]).filter((t) => TIER_OF[t] === g.tier).length;
}

/** True when a graded puzzle is a fair example of `target`. */
export function qualifies(g: Grade | null, target: Tier): g is Grade {
  return (
    !!g &&
    g.tier === target &&
    g.stepsAtTier >= MIN_STEPS_AT_TIER[target] &&
    g.stepsAtTier <= MAX_STEPS_AT_TIER[target] &&
    kindsAtTier(g) >= MIN_KINDS_AT_TIER[target]
  );
}

export interface GenerateOptions {
  /** Give up after this many complete grids. */
  maxAttempts?: number;
  /** Keep the best of this many puzzles that qualify (most steps at the tier, then fewest clues). */
  pick?: number;
}

/** Higher is more interesting: more steps at the puzzle's tier, then fewer clues. */
const interest = (p: Puzzle): number => p.grade.stepsAtTier * 100 - p.clues;

/** One attempt from one complete grid: the dug puzzle, whatever tier it ended up. */
function dig(solution: Grid, target: Tier, rng: () => number): Grid {
  const puzzle = solution.slice();
  let clues = CELLS;
  const pairs = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rng
  );
  for (const i of pairs) {
    const cells = i === 40 ? [40] : [i, 80 - i];
    if (clues - cells.length < CLUE_FLOOR[target]) continue;
    for (const c of cells) puzzle[c] = 0;
    if (countSolutions(puzzle, 2) === 1 && grade(puzzle, target)) {
      clues -= cells.length;
    } else {
      for (const c of cells) puzzle[c] = solution[c]!;
    }
  }
  return puzzle;
}

/**
 * A unique, logic-only puzzle that needs exactly `target`, or null when none
 * qualified in `maxAttempts`.
 */
export function generatePuzzle(rng: () => number, target: Tier, options: GenerateOptions = {}): Puzzle | null {
  const maxAttempts = options.maxAttempts ?? 500;
  const pick = options.pick ?? 1;
  let best: Puzzle | null = null;
  let found = 0;
  for (let attempt = 0; attempt < maxAttempts && found < pick; attempt++) {
    const solution = randomSolution(rng);
    const puzzle = dig(solution, target, rng);
    const g = grade(puzzle);
    if (!qualifies(g, target)) continue;
    const p: Puzzle = { tier: target, givens: formatGrid(puzzle), solution: formatGrid(solution), clues: clueCount(puzzle), grade: g };
    found++;
    if (!best || interest(p) > interest(best)) best = p;
  }
  return best;
}
