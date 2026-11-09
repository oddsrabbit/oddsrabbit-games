// The logic solver: finds the next step a person could take, using named
// techniques from easiest to hardest. One solver serves three jobs:
//
//   - grading (grade.ts): a puzzle's tier is the hardest step it needs;
//   - the "logic only" guarantee: a puzzle this can't finish is never served;
//   - hints in the game: the step it finds is the hint it explains.
//
// It works on candidates: for each empty cell, a mask of the digits still
// possible there. Every step either places a digit or removes candidates, and
// only does what the rules force, so a step is never wrong on a board whose
// candidates still include the solution (logic.test.ts checks this on every
// step of many puzzles).

import { ALL_DIGITS, bit, boxOf, CELLS, colOf, digitsOf, firstDigit, PEERS, popcount, rowOf, sees, UNITS, type Grid } from './sudoku';

/** In the order nextStep() tries them: easiest first. */
export const TECHNIQUES = [
  'full-house',
  'hidden-single',
  'naked-single',
  'pointing',
  'claiming',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'hidden-triple',
  'x-wing',
  'xy-wing',
  'skyscraper',
  'two-string-kite',
  'xyz-wing',
  'swordfish',
  'simple-colouring',
] as const;

export type Technique = (typeof TECHNIQUES)[number];

export interface CellDigit {
  cell: number;
  digit: number;
}

export interface Step {
  technique: Technique;
  /** A digit this step places, for the singles. */
  place?: CellDigit;
  /** Candidates this step removes. */
  eliminate: CellDigit[];
  /** The cells that make the pattern, for the hint to highlight. */
  cells: number[];
  /** The digits the pattern is about. */
  digits: number[];
  /** Units the pattern lives in (see UNITS), for the hint to highlight. */
  units: number[];
}

export interface LogicState {
  values: number[];
  /** Per cell: a mask of the digits still possible; 0 for a filled cell. */
  cands: number[];
}

/** A state with every candidate the placed digits allow. */
export function stateFrom(values: Grid): LogicState {
  const cands = values.map((v, cell) => {
    if (v) return 0;
    let m = ALL_DIGITS;
    for (const p of PEERS[cell]!) {
      const d = values[p]!;
      if (d) m &= ~bit(d);
    }
    return m;
  });
  return { values: values.slice(), cands };
}

export function placeDigit(s: LogicState, cell: number, digit: number): void {
  s.values[cell] = digit;
  s.cands[cell] = 0;
  const m = ~bit(digit);
  for (const p of PEERS[cell]!) s.cands[p] = s.cands[p]! & m;
}

export function applyStep(s: LogicState, step: Step): void {
  if (step.place) placeDigit(s, step.place.cell, step.place.digit);
  for (const e of step.eliminate) s.cands[e.cell] = s.cands[e.cell]! & ~bit(e.digit);
}

// ---------- helpers ----------

const has = (s: LogicState, cell: number, digit: number): boolean => (s.cands[cell]! & bit(digit)) !== 0;

/** Empty cells of a unit that can still hold `digit`. */
function cellsWith(s: LogicState, unit: number, digit: number): number[] {
  return UNITS[unit]!.filter((c) => has(s, c, digit));
}

function placedMask(s: LogicState, unit: number): number {
  let m = 0;
  for (const c of UNITS[unit]!) {
    const v = s.values[c]!;
    if (v) m |= bit(v);
  }
  return m;
}

function* combinations<T>(items: readonly T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked.slice();
    return;
  }
  for (let i = start; i <= items.length - (k - picked.length); i++) {
    picked.push(items[i]!);
    yield* combinations(items, k, i + 1, picked);
    picked.pop();
  }
}

/** Cells (not in `except`) holding `digit` that see every cell in `targets`. */
function seeingAll(s: LogicState, digit: number, targets: readonly number[], except: readonly number[]): CellDigit[] {
  const out: CellDigit[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (!has(s, c, digit) || except.includes(c)) continue;
    if (targets.every((t) => sees(c, t))) out.push({ cell: c, digit });
  }
  return out;
}

const step = (
  technique: Technique,
  fields: Partial<Omit<Step, 'technique'>> & { cells: number[]; digits: number[] }
): Step => ({ technique, eliminate: [], units: [], ...fields });

// ---------- singles ----------

function fullHouse(s: LogicState): Step | null {
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u]!.filter((c) => !s.values[c]);
    if (empty.length !== 1) continue;
    const cell = empty[0]!;
    const missing = ALL_DIGITS & ~placedMask(s, u);
    if (popcount(missing) !== 1 || !(s.cands[cell]! & missing)) continue;
    const digit = firstDigit(missing);
    return step('full-house', { place: { cell, digit }, cells: [cell], digits: [digit], units: [u] });
  }
  return null;
}

function hiddenSingle(s: LogicState): Step | null {
  // Boxes first: that's where people look for them.
  for (const u of [...Array(9).keys()].map((b) => 18 + b).concat([...Array(18).keys()])) {
    const placed = placedMask(s, u);
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const cells = cellsWith(s, u, d);
      if (cells.length === 1) {
        const cell = cells[0]!;
        return step('hidden-single', { place: { cell, digit: d }, cells: [cell], digits: [d], units: [u] });
      }
    }
  }
  return null;
}

function nakedSingle(s: LogicState): Step | null {
  for (let cell = 0; cell < CELLS; cell++) {
    if (s.values[cell] || popcount(s.cands[cell]!) !== 1) continue;
    const digit = firstDigit(s.cands[cell]!);
    return step('naked-single', { place: { cell, digit }, cells: [cell], digits: [digit] });
  }
  return null;
}

// ---------- locked candidates ----------

/** A box's candidates for a digit all sit in one row or column: the rest of that line can't have it. */
function pointing(s: LogicState): Step | null {
  for (let b = 0; b < 9; b++) {
    const box = 18 + b;
    for (let d = 1; d <= 9; d++) {
      const cells = cellsWith(s, box, d);
      if (cells.length < 2) continue;
      for (const line of [rowOf(cells[0]!), 9 + colOf(cells[0]!)]) {
        if (!cells.every((c) => UNITS[line]!.includes(c))) continue;
        const eliminate = UNITS[line]!.filter((c) => boxOf(c) !== b && has(s, c, d)).map((cell) => ({ cell, digit: d }));
        if (eliminate.length) return step('pointing', { eliminate, cells, digits: [d], units: [box, line] });
      }
    }
  }
  return null;
}

/** A row's or column's candidates for a digit all sit in one box: the rest of that box can't have it. */
function claiming(s: LogicState): Step | null {
  for (let line = 0; line < 18; line++) {
    for (let d = 1; d <= 9; d++) {
      const cells = cellsWith(s, line, d);
      if (cells.length < 2) continue;
      const b = boxOf(cells[0]!);
      if (!cells.every((c) => boxOf(c) === b)) continue;
      const inLine = new Set(UNITS[line]!);
      const eliminate = UNITS[18 + b]!.filter((c) => !inLine.has(c) && has(s, c, d)).map((cell) => ({ cell, digit: d }));
      if (eliminate.length) return step('claiming', { eliminate, cells, digits: [d], units: [line, 18 + b] });
    }
  }
  return null;
}

// ---------- subsets ----------

/** n cells of a unit share exactly n candidates between them: no other cell of the unit can have those. */
function nakedSubset(s: LogicState, n: number, technique: Technique): Step | null {
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u]!.filter((c) => !s.values[c]);
    if (empty.length <= n) continue;
    const pool = empty.filter((c) => {
      const k = popcount(s.cands[c]!);
      return k >= 2 && k <= n;
    });
    for (const cells of combinations(pool, n)) {
      const union = cells.reduce((m, c) => m | s.cands[c]!, 0);
      if (popcount(union) !== n) continue;
      const eliminate: CellDigit[] = [];
      for (const c of empty) {
        if (cells.includes(c)) continue;
        for (const digit of digitsOf(s.cands[c]! & union)) eliminate.push({ cell: c, digit });
      }
      if (eliminate.length) return step(technique, { eliminate, cells, digits: digitsOf(union), units: [u] });
    }
  }
  return null;
}

/** n digits of a unit fit only in the same n cells: those cells can't hold anything else. */
function hiddenSubset(s: LogicState, n: number, technique: Technique): Step | null {
  for (let u = 0; u < 27; u++) {
    const placed = placedMask(s, u);
    const options: { digit: number; cells: number[] }[] = [];
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const cells = cellsWith(s, u, d);
      if (cells.length >= 2 && cells.length <= n) options.push({ digit: d, cells });
    }
    for (const combo of combinations(options, n)) {
      const cells = [...new Set(combo.flatMap((o) => o.cells))];
      if (cells.length !== n) continue;
      const keep = combo.reduce((m, o) => m | bit(o.digit), 0);
      const eliminate: CellDigit[] = [];
      for (const c of cells) for (const digit of digitsOf(s.cands[c]! & ~keep)) eliminate.push({ cell: c, digit });
      if (eliminate.length) {
        return step(technique, { eliminate, cells: cells.sort((a, b) => a - b), digits: digitsOf(keep), units: [u] });
      }
    }
  }
  return null;
}

// ---------- fish ----------

/**
 * In n rows a digit fits only within the same n columns (or the other way
 * round): those columns can't have it anywhere else. X-Wing is n = 2,
 * Swordfish n = 3.
 */
function fish(s: LogicState, n: number, technique: Technique): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const byCols of [false, true]) {
      const cellAt = (line: number, pos: number): number => (byCols ? pos * 9 + line : line * 9 + pos);
      const lines: { line: number; positions: number }[] = [];
      for (let line = 0; line < 9; line++) {
        let positions = 0;
        for (let pos = 0; pos < 9; pos++) if (has(s, cellAt(line, pos), d)) positions |= 1 << pos;
        const k = popcount(positions);
        if (k >= 2 && k <= n) lines.push({ line, positions });
      }
      for (const base of combinations(lines, n)) {
        const cover = base.reduce((m, l) => m | l.positions, 0);
        if (popcount(cover) !== n) continue;
        const baseLines = new Set(base.map((l) => l.line));
        const eliminate: CellDigit[] = [];
        for (let pos = 0; pos < 9; pos++) {
          if (!(cover & (1 << pos))) continue;
          for (let line = 0; line < 9; line++) {
            const c = cellAt(line, pos);
            if (!baseLines.has(line) && has(s, c, d)) eliminate.push({ cell: c, digit: d });
          }
        }
        if (!eliminate.length) continue;
        const cells: number[] = [];
        for (const l of base) for (let pos = 0; pos < 9; pos++) if (l.positions & (1 << pos)) cells.push(cellAt(l.line, pos));
        const units = base.map((l) => (byCols ? 9 + l.line : l.line));
        return step(technique, { eliminate, cells: cells.sort((a, b) => a - b), digits: [d], units });
      }
    }
  }
  return null;
}

// ---------- wings ----------

/**
 * A pivot with candidates {a, b} sees one cell with {a, c} and another with
 * {b, c}. Whichever the pivot is, one of those two is c, so any cell that sees
 * both can't be c.
 */
function xyWing(s: LogicState): Step | null {
  for (let p = 0; p < CELLS; p++) {
    const pm = s.cands[p]!;
    if (popcount(pm) !== 2) continue;
    const wings = PEERS[p]!.filter((c) => popcount(s.cands[c]!) === 2 && popcount(s.cands[c]! & pm) === 1);
    for (const q of wings) {
      const qm = s.cands[q]!;
      const z = qm & ~pm;
      const want = (pm & ~qm) | z;
      for (const r of wings) {
        if (r === q || s.cands[r] !== want) continue;
        const digit = firstDigit(z);
        const eliminate = seeingAll(s, digit, [q, r], [p, q, r]);
        if (eliminate.length) return step('xy-wing', { eliminate, cells: [p, q, r], digits: digitsOf(pm | z) });
      }
    }
  }
  return null;
}

/**
 * A pivot with {a, b, c} sees a cell with {a, c} and one with {b, c}. One of
 * the three is c, so a cell that sees all three can't be.
 */
function xyzWing(s: LogicState): Step | null {
  for (let p = 0; p < CELLS; p++) {
    const pm = s.cands[p]!;
    if (popcount(pm) !== 3) continue;
    const wings = PEERS[p]!.filter((c) => popcount(s.cands[c]!) === 2 && (s.cands[c]! & ~pm) === 0);
    for (const [q, r] of combinations(wings, 2)) {
      const qm = s.cands[q!]!;
      const rm = s.cands[r!]!;
      if (qm === rm || (qm | rm) !== pm) continue;
      const digit = firstDigit(qm & rm);
      const eliminate = seeingAll(s, digit, [p, q!, r!], [p, q!, r!]);
      if (eliminate.length) return step('xyz-wing', { eliminate, cells: [p, q!, r!], digits: digitsOf(pm) });
    }
  }
  return null;
}

// ---------- single-digit patterns ----------

/** Lines (rows, or columns) where a digit fits in exactly two cells. */
function conjugateLines(s: LogicState, digit: number, byCols: boolean): { line: number; cells: [number, number] }[] {
  const out: { line: number; cells: [number, number] }[] = [];
  for (let line = 0; line < 9; line++) {
    const cells = cellsWith(s, byCols ? 9 + line : line, digit);
    if (cells.length === 2) out.push({ line, cells: [cells[0]!, cells[1]!] });
  }
  return out;
}

/**
 * Two rows each hold a digit in exactly two cells, and one end of each shares
 * a column. Those two can't both be the digit, so one of the other ends is,
 * and a cell seeing both other ends can't be. (Or the same with columns.)
 */
function skyscraper(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const byCols of [false, true]) {
      const across = byCols ? rowOf : colOf;
      for (const [a, b] of combinations(conjugateLines(s, d, byCols), 2)) {
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const baseA = a!.cells[i]!;
            const baseB = b!.cells[j]!;
            const roofA = a!.cells[1 - i]!;
            const roofB = b!.cells[1 - j]!;
            if (across(baseA) !== across(baseB) || across(roofA) === across(roofB)) continue;
            const four = [baseA, roofA, baseB, roofB];
            const eliminate = seeingAll(s, d, [roofA, roofB], four);
            if (eliminate.length) {
              const units = byCols ? [9 + a!.line, 9 + b!.line] : [a!.line, b!.line];
              return step('skyscraper', { eliminate, cells: four.sort((x, y) => x - y), digits: [d], units });
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * A row and a column each hold a digit in exactly two cells, and one end of
 * each sits in the same box. Those two can't both be the digit, so one of the
 * other ends is, and a cell seeing both other ends can't be.
 */
function twoStringKite(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const row of conjugateLines(s, d, false)) {
      for (const col of conjugateLines(s, d, true)) {
        const four = [...row.cells, ...col.cells];
        if (new Set(four).size !== 4) continue;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (boxOf(row.cells[i]!) !== boxOf(col.cells[j]!)) continue;
            const endA = row.cells[1 - i]!;
            const endB = col.cells[1 - j]!;
            const eliminate = seeingAll(s, d, [endA, endB], four);
            if (eliminate.length) {
              return step('two-string-kite', { eliminate, cells: four.sort((x, y) => x - y), digits: [d], units: [row.line, 9 + col.line] });
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Join every pair of cells that are a unit's only two places for a digit, and
 * colour each chain in two alternating colours: one colour is all true, the
 * other all false. Two cells of one colour seeing each other means that
 * colour is the false one. A cell seeing both colours can't be the digit.
 */
function simpleColouring(s: LogicState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = new Map<number, number[]>();
    for (let u = 0; u < 27; u++) {
      const cells = cellsWith(s, u, d);
      if (cells.length !== 2) continue;
      const [a, b] = [cells[0]!, cells[1]!];
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    }
    const colour = new Map<number, 0 | 1>();
    for (const startCell of [...links.keys()].sort((x, y) => x - y)) {
      if (colour.has(startCell)) continue;
      const groups: [number[], number[]] = [[], []];
      colour.set(startCell, 0);
      const queue = [startCell];
      while (queue.length) {
        const c = queue.shift()!;
        const k = colour.get(c)!;
        groups[k].push(c);
        for (const n of links.get(c) ?? []) {
          if (!colour.has(n)) {
            colour.set(n, k === 0 ? 1 : 0);
            queue.push(n);
          }
        }
      }
      if (groups[0].length + groups[1].length < 3) continue;
      const chain = [...groups[0], ...groups[1]].sort((x, y) => x - y);

      // Colour wrap: one colour contradicts itself.
      for (const k of [0, 1] as const) {
        const g = groups[k];
        const clash = g.some((a, i) => g.slice(i + 1).some((b) => sees(a, b)));
        if (clash) {
          const eliminate = g.map((cell) => ({ cell, digit: d }));
          return step('simple-colouring', { eliminate, cells: chain, digits: [d] });
        }
      }
      // Colour trap: an outside cell sees both colours.
      const eliminate: CellDigit[] = [];
      for (let c = 0; c < CELLS; c++) {
        if (!has(s, c, d) || colour.has(c)) continue;
        if (groups[0].some((x) => sees(c, x)) && groups[1].some((x) => sees(c, x))) eliminate.push({ cell: c, digit: d });
      }
      if (eliminate.length) return step('simple-colouring', { eliminate, cells: chain, digits: [d] });
    }
  }
  return null;
}

// ---------- driver ----------

const FINDERS: Record<Technique, (s: LogicState) => Step | null> = {
  'full-house': fullHouse,
  'hidden-single': hiddenSingle,
  'naked-single': nakedSingle,
  pointing,
  claiming,
  'naked-pair': (s) => nakedSubset(s, 2, 'naked-pair'),
  'hidden-pair': (s) => hiddenSubset(s, 2, 'hidden-pair'),
  'naked-triple': (s) => nakedSubset(s, 3, 'naked-triple'),
  'hidden-triple': (s) => hiddenSubset(s, 3, 'hidden-triple'),
  'x-wing': (s) => fish(s, 2, 'x-wing'),
  'xy-wing': xyWing,
  skyscraper,
  'two-string-kite': twoStringKite,
  'xyz-wing': xyzWing,
  swordfish: (s) => fish(s, 3, 'swordfish'),
  'simple-colouring': simpleColouring,
};

/**
 * The easiest step available, or null when none of `allowed` finds one (the
 * puzzle is solved, stuck, or the board has a contradiction).
 */
export function nextStep(s: LogicState, allowed: readonly Technique[] = TECHNIQUES): Step | null {
  for (const technique of allowed) {
    const found = FINDERS[technique](s);
    if (found) return found;
  }
  return null;
}

export interface LogicSolve {
  solved: boolean;
  steps: Step[];
  values: Grid;
}

/** Solve step by step with `allowed` techniques until done or stuck. */
export function solveLogically(givens: Grid, allowed: readonly Technique[] = TECHNIQUES): LogicSolve {
  const s = stateFrom(givens);
  const steps: Step[] = [];
  for (;;) {
    if (s.values.every((v) => v !== 0)) return { solved: true, steps, values: s.values };
    const found = nextStep(s, allowed);
    if (!found) return { solved: false, steps, values: s.values };
    applyStep(s, found);
    steps.push(found);
  }
}
