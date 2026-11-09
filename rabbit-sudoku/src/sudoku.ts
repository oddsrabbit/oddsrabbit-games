// Grid basics shared by everything else: cells, units, peers, candidate
// masks, and the 81-character text form puzzles travel in.
//
// Cells are numbered 0–80, row by row. A candidate mask has bit d-1 set for
// digit d, so all nine digits are 0x1ff.

/** 81 digits, row by row; 0 is an empty cell. */
export type Grid = number[];

export const CELLS = 81;
export const ALL_DIGITS = 0x1ff;

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const colOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
export const bit = (digit: number): number => 1 << (digit - 1);

/** The 27 units: rows are 0–8, columns 9–17, boxes 18–26. Each lists its nine cells. */
export const UNITS: readonly (readonly number[])[] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    units.push(Array.from({ length: 9 }, (_, i) => (r0 + Math.floor(i / 3)) * 9 + c0 + (i % 3)));
  }
  return units;
})();

/** A cell's row, column and box, as unit indices. */
export function unitsOf(cell: number): [number, number, number] {
  return [rowOf(cell), 9 + colOf(cell), 18 + boxOf(cell)];
}

const SEES = new Uint8Array(CELLS * CELLS);

/** The 20 cells sharing a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = (() => {
  const peers: number[][] = [];
  for (let a = 0; a < CELLS; a++) {
    const list: number[] = [];
    for (let b = 0; b < CELLS; b++) {
      if (a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b))) {
        list.push(b);
        SEES[a * CELLS + b] = 1;
      }
    }
    peers.push(list);
  }
  return peers;
})();

/** Whether two different cells share a row, column or box. */
export function sees(a: number, b: number): boolean {
  return SEES[a * CELLS + b] === 1;
}

const POPCOUNT = Uint8Array.from({ length: 512 }, (_, m) => {
  let n = 0;
  for (let x = m; x; x &= x - 1) n++;
  return n;
});

export function popcount(mask: number): number {
  return POPCOUNT[mask & ALL_DIGITS]!;
}

/** The digits in a candidate mask, ascending. */
export function digitsOf(mask: number): number[] {
  const digits: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) digits.push(d);
  return digits;
}

/** The smallest digit in a non-empty mask. */
export function firstDigit(mask: number): number {
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) return d;
  return 0;
}

/** `.` or `0` for an empty cell, `1`–`9` for a digit; anything else, or the wrong length, is null. */
export function parseGrid(text: string): Grid | null {
  if (typeof text !== 'string' || text.length !== CELLS) return null;
  const grid: Grid = [];
  for (const ch of text) {
    if (ch === '.' || ch === '0') grid.push(0);
    else if (ch >= '1' && ch <= '9') grid.push(ch.charCodeAt(0) - 48);
    else return null;
  }
  return grid;
}

export function formatGrid(grid: Grid): string {
  return grid.map((d) => (d === 0 ? '.' : String(d))).join('');
}

export function clueCount(grid: Grid): number {
  return grid.reduce((n, d) => n + (d ? 1 : 0), 0);
}

/** Cells whose digit appears again in one of their units, sorted. */
export function duplicateCells(grid: Grid): number[] {
  const dupes = new Set<number>();
  for (const unit of UNITS) {
    const seen = new Map<number, number>();
    for (const cell of unit) {
      const d = grid[cell]!;
      if (!d) continue;
      const other = seen.get(d);
      if (other === undefined) {
        seen.set(d, cell);
      } else {
        dupes.add(other);
        dupes.add(cell);
      }
    }
  }
  return [...dupes].sort((a, b) => a - b);
}

/** Every cell filled and no digit repeated in a unit. */
export function isSolved(grid: Grid): boolean {
  return grid.length === CELLS && grid.every((d) => d >= 1 && d <= 9) && duplicateCells(grid).length === 0;
}

/** True when every given in `puzzle` is kept by `grid`. */
export function keepsGivens(puzzle: Grid, grid: Grid): boolean {
  return puzzle.every((d, i) => d === 0 || grid[i] === d);
}
