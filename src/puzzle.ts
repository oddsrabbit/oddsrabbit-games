// The daily puzzle: its calendar, its shapes, and the content blob the server
// hands out through `content.daily`.
//
// A day has two boards: Ranked (90 seconds or 2 minutes, everyone races the same grid)
// and the casual board (untimed, find the list). Both follow the weekday plan.
//
// The epoch lives in three places that must agree: EPOCH below, `epoch` in
// data/word-rush-boards.json (written by tools/gen-boards.ts from this
// constant), and the `word-rush` entry in the backend's DailyGameRegistry.
// WordGridProvider refuses a boards file whose epoch doesn't match the
// registry, so a mismatch shows up as "today unavailable" rather than as every
// day serving the wrong board.

import type { Board } from './board';

/** `puzzle-0` is this UTC day; it shows as #1. */
export const EPOCH = '2026-10-12';
export const EPOCH_MS = Date.parse(`${EPOCH}T00:00:00Z`);
export const DAY_MS = 86_400_000;

export function puzzleIndexAt(ms: number): number {
  return Math.floor((ms - EPOCH_MS) / DAY_MS);
}

/**
 * The day's Sprint round: its scores, its content row, the leaderboards, the
 * end-of-day push. Every backend feature keyed on `puzzle-N` is the Sprint's.
 */
export function roundKey(puzzleIndex: number): string {
  return `puzzle-${puzzleIndex}`;
}

/** The casual board's scores (no leaderboard; feeds "X% cleared" and friends). */
export function casualRoundKey(puzzleIndex: number): string {
  return `casual-${puzzleIndex}`;
}

/** Written by the backend when the day's Sprint closes: how many players found each word. */
export function resultsRoundKey(puzzleIndex: number): string {
  return `results-${puzzleIndex}`;
}

// ---------- Shapes ----------

export type ShapeId = 'square4' | 'square5' | 'corners' | 'hollow' | 'lantern';

export interface Shape {
  id: ShapeId;
  name: string;
  /** `#` is a tile, `.` a hole. */
  mask: string[];
}

export const SHAPES: Record<ShapeId, Shape> = {
  square4: { id: 'square4', name: '4×4', mask: ['####', '####', '####', '####'] },
  square5: { id: 'square5', name: '5×5', mask: ['#####', '#####', '#####', '#####', '#####'] },
  corners: { id: 'corners', name: 'Corners', mask: ['.###.', '#####', '#####', '#####', '.###.'] },
  hollow: { id: 'hollow', name: 'Hollow', mask: ['#####', '#####', '##.##', '#####', '#####'] },
  lantern: { id: 'lantern', name: 'Lantern', mask: ['.###.', '#####', '##.##', '#####', '.###.'] },
};

const SUNDAY_SHAPES: ShapeId[] = ['corners', 'hollow', 'lantern'];

/**
 * The week builds like a newspaper crossword: a quick 4×4 Monday to Thursday,
 * a bigger 5×5 on Friday and Saturday, and a shaped board on Sunday, rotating
 * through the three shapes week by week.
 */
export function shapeForPuzzle(puzzleIndex: number): Shape {
  const date = new Date(EPOCH_MS + puzzleIndex * DAY_MS);
  const weekday = date.getUTCDay(); // 0 = Sunday
  if (weekday === 0) {
    const week = Math.floor(puzzleIndex / 7);
    return SHAPES[SUNDAY_SHAPES[week % SUNDAY_SHAPES.length]!];
  }
  if (weekday === 5 || weekday === 6) return SHAPES.square5;
  return SHAPES.square4;
}

// ---------- Content ----------

/**
 * One day's content, as stored server-side under `puzzle-N` and served by
 * `content.daily`. Word lists are in a fixed order that score submissions'
 * bitmasks index into, so they're never re-sorted after generation (the
 * backend's AppScoreVerifier and WordSprintSealer read them by position).
 */
export interface DayContent {
  v: 2;
  sprint: SprintContent;
  casual: CasualContent;
}

interface Grid {
  shape: ShapeId;
  rows: number;
  cols: number;
  tiles: (string | null)[];
}

/** The Ranked board: every acceptable word of 3+ letters on it. */
export interface SprintContent extends Grid {
  words: string[];
}

/**
 * The casual board. `words` are the required words: common words on the
 * board, all of which finish it. `bonus` are the other dictionary words; they
 * count as bonus words and never toward finishing.
 */
export interface CasualContent extends Grid {
  words: string[];
  bonus: string[];
  /** The longest required word: the day's "star word". */
  star: string;
}

/** Written when the Sprint closes. `counts[i]` is how many players found `sprint.words[i]`. */
export interface SprintResults {
  players: number;
  counts: number[];
}

// Any letter but a bare Q, which can only appear as the "QU" tile.
const TILE = /^(?:[A-PR-Z]|QU)$/;
const WORD = /^[A-Z]{2,25}$/;

const isWords = (list: unknown): list is string[] =>
  Array.isArray(list) && list.every((w) => typeof w === 'string' && WORD.test(w));

function parseGrid(raw: unknown): (Grid & Record<string, unknown>) | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.shape !== 'string' || !(c.shape in SHAPES)) return null;
  const rows = c.rows;
  const cols = c.cols;
  if (typeof rows !== 'number' || typeof cols !== 'number') return null;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows > 6 || cols > 6) return null;
  if (!Array.isArray(c.tiles) || c.tiles.length !== rows * cols) return null;
  if (!c.tiles.every((t) => t === null || (typeof t === 'string' && TILE.test(t)))) return null;
  return { ...c, shape: c.shape as ShapeId, rows, cols, tiles: c.tiles as (string | null)[] };
}

export function parseSprint(raw: unknown): SprintContent | null {
  const g = parseGrid(raw);
  if (!g || !isWords(g.words) || g.words.length === 0) return null;
  return { shape: g.shape, rows: g.rows, cols: g.cols, tiles: g.tiles, words: g.words };
}

/** The casual board if it's the shape this game plays, else null. Never trusted blind. */
export function parseCasual(raw: unknown): CasualContent | null {
  const g = parseGrid(raw);
  if (!g || !isWords(g.words) || g.words.length === 0 || !isWords(g.bonus)) return null;
  if (typeof g.star !== 'string' || !g.words.includes(g.star)) return null;
  return { shape: g.shape, rows: g.rows, cols: g.cols, tiles: g.tiles, words: g.words, bonus: g.bonus, star: g.star };
}

export function parseDay(raw: unknown): DayContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== 2) return null;
  const sprint = parseSprint(c.sprint);
  const casual = parseCasual(c.casual);
  return sprint && casual ? { v: 2, sprint, casual } : null;
}

export function parseResults(raw: unknown, wordCount: number): SprintResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  // The sealer writes a placeholder (`sealing: true`, every count 0) before it
  // tallies. A seal that failed partway leaves it there: still tallying, not
  // "nobody found anything".
  if (c.sealing === true) return null;
  if (typeof c.players !== 'number' || !Number.isInteger(c.players) || c.players < 0) return null;
  if (!Array.isArray(c.counts) || c.counts.length !== wordCount) return null;
  if (!c.counts.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) return null;
  return { players: c.players, counts: c.counts as number[] };
}

export function boardOf(content: Grid): Board {
  return { rows: content.rows, cols: content.cols, tiles: content.tiles };
}
