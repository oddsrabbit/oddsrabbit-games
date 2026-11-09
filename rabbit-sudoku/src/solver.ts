// The fast solver: depth-first search over bitmasks, always branching on the
// cell with the fewest candidates. Used to check a puzzle has exactly one
// solution, to fill random complete grids for the generator, and in the game
// to find the solution behind "Show mistakes".
//
// It knows nothing about how a person solves; logic.ts does that.

import { boxOf, CELLS, colOf, digitsOf, popcount, rowOf, type Grid } from './sudoku';
import { shuffle } from './rng';

const ROW = Uint8Array.from({ length: CELLS }, (_, c) => rowOf(c));
const COL = Uint8Array.from({ length: CELLS }, (_, c) => colOf(c));
const BOX = Uint8Array.from({ length: CELLS }, (_, c) => boxOf(c));

interface Search {
  values: Int8Array;
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
}

/** The search state for a grid, or null when its givens already clash. */
function begin(grid: Grid): Search | null {
  const s: Search = {
    values: new Int8Array(CELLS),
    rows: new Uint16Array(9),
    cols: new Uint16Array(9),
    boxes: new Uint16Array(9),
  };
  for (let c = 0; c < CELLS; c++) {
    const d = grid[c] ?? 0;
    if (!d) continue;
    const m = 1 << (d - 1);
    const r = ROW[c]!;
    const k = COL[c]!;
    const b = BOX[c]!;
    if ((s.rows[r]! | s.cols[k]! | s.boxes[b]!) & m) return null;
    s.values[c] = d;
    s.rows[r]! |= m;
    s.cols[k]! |= m;
    s.boxes[b]! |= m;
  }
  return s;
}

/**
 * Calls `found` for each solution until it returns true. Returns true when
 * stopped that way. The state is left mid-search after a stop; callers copy
 * what they need inside `found`.
 */
function search(s: Search, found: (values: Int8Array) => boolean, rng?: () => number): boolean {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let c = 0; c < CELLS; c++) {
    if (s.values[c]) continue;
    const mask = ~(s.rows[ROW[c]!]! | s.cols[COL[c]!]! | s.boxes[BOX[c]!]!) & 0x1ff;
    const n = popcount(mask);
    if (n < bestCount) {
      best = c;
      bestMask = mask;
      bestCount = n;
      if (n <= 1) break;
    }
  }
  if (best < 0) return found(s.values);
  if (bestCount === 0) return false;

  const digits = digitsOf(bestMask);
  if (rng) shuffle(digits, rng);
  const r = ROW[best]!;
  const k = COL[best]!;
  const b = BOX[best]!;
  for (const d of digits) {
    const m = 1 << (d - 1);
    s.values[best] = d;
    s.rows[r]! |= m;
    s.cols[k]! |= m;
    s.boxes[b]! |= m;
    if (search(s, found, rng)) return true;
    s.values[best] = 0;
    s.rows[r]! &= ~m;
    s.cols[k]! &= ~m;
    s.boxes[b]! &= ~m;
  }
  return false;
}

/** How many solutions the grid has, counting no further than `limit`. */
export function countSolutions(grid: Grid, limit = 2): number {
  const s = begin(grid);
  if (!s) return 0;
  let n = 0;
  search(s, () => ++n >= limit);
  return n;
}

/** The first solution found, or null when there is none. */
export function solve(grid: Grid): Grid | null {
  const s = begin(grid);
  if (!s) return null;
  let solution: Grid | null = null;
  search(s, (values) => {
    solution = Array.from(values);
    return true;
  });
  return solution;
}

/** A complete, valid grid drawn from `rng`. */
export function randomSolution(rng: () => number): Grid {
  const s = begin(new Array<number>(CELLS).fill(0))!;
  let solution: Grid = [];
  search(
    s,
    (values) => {
      solution = Array.from(values);
      return true;
    },
    rng
  );
  return solution;
}
