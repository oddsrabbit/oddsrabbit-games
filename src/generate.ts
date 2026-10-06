// Board generation, run offline by tools/gen-boards.ts (never in the game).
//
// Each day gets two boards of the day's shape: the Sprint board and the
// casual board, drawn from different seeds. Letters come from our own weights
// (not any commercial dice set), then the solver checks the board:
//   - casual: its required (common) words land inside the shape's band and it
//     has a long enough star word;
//   - sprint: its total word count (3+ letters, the whole dictionary) lands
//     inside the shape's band and it has a long word to race for.
// Neither may have a blocked word traceable on it, and the day's content has
// to fit the backend's 16 KB content cap. Everything is seeded from the puzzle
// index, so regenerating the file reproduces every board.

import { buildTrie, MIN_WORD, solve, type Board, type TrieNode } from './board';
import { shapeForPuzzle, type CasualContent, type DayContent, type Shape, type ShapeId, type SprintContent } from './puzzle';
import { hashString, mulberry32 } from './rng';

export interface Dictionaries {
  /** Every acceptable word (ENABLE), upper-case. */
  all: TrieNode;
  /** Common words: the ones that are required to finish. */
  common: ReadonlySet<string>;
  /** Never accepted, never traceable on a published board. */
  blocked: TrieNode;
}

export function dictionaries(all: Iterable<string>, common: Iterable<string>, blocked: Iterable<string>): Dictionaries {
  return { all: buildTrie(all), common: new Set(common), blocked: buildTrie(blocked) };
}

export interface Band {
  /** Required words, inclusive. */
  minWords: number;
  maxWords: number;
  /** The star word is at least this long. */
  minStar: number;
}

/**
 * Casual required-word bands per shape. Wide enough to fill quickly, narrow enough
 * that a 4×4 is a coffee break and a 5×5 a proper hunt. Tuned against the
 * spread `npm run gen-boards -- --stats` reports.
 */
export const BANDS: Record<ShapeId, Band> = {
  square4: { minWords: 25, maxWords: 45, minStar: 6 },
  square5: { minWords: 55, maxWords: 85, minStar: 7 },
  corners: { minWords: 50, maxWords: 80, minStar: 7 },
  hollow: { minWords: 50, maxWords: 80, minStar: 7 },
  lantern: { minWords: 40, maxWords: 70, minStar: 7 },
};

// Roughly English letter frequency, flattened at the top so boards aren't all
// E, and with the awkward letters rare. "QU" is one tile.
const WEIGHTS: Array<[string, number]> = [
  ['E', 11], ['A', 8.5], ['I', 7.5], ['O', 7], ['U', 3.5],
  ['R', 7], ['T', 7], ['N', 6.5], ['S', 5], ['L', 5.5], ['C', 3.5], ['D', 3.5],
  ['P', 3], ['M', 3], ['H', 3], ['G', 2.8], ['B', 2.2], ['F', 1.8], ['Y', 1.8],
  ['W', 1.5], ['K', 1.2], ['V', 1.1], ['X', 0.4], ['Z', 0.4], ['J', 0.3], ['QU', 0.4],
];
const WEIGHT_TOTAL = WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const RARE = new Set(['J', 'QU', 'X', 'Z']);

function drawLetter(rand: () => number): string {
  let r = rand() * WEIGHT_TOTAL;
  for (const [letter, w] of WEIGHTS) {
    r -= w;
    if (r < 0) return letter;
  }
  return 'E';
}

/** Letters for the shape's tiles, within the mix rules, or null to redraw. */
function drawLetters(count: number, rand: () => number): string[] | null {
  const letters: string[] = [];
  const seen = new Map<string, number>();
  const cap = count <= 16 ? 2 : 3;
  const sCap = count <= 16 ? 1 : 2;
  let rare = 0;
  for (let guard = 0; letters.length < count && guard < count * 20; guard++) {
    const l = drawLetter(rand);
    const n = seen.get(l) ?? 0;
    if (n >= (l === 'S' ? sCap : cap)) continue;
    if (RARE.has(l) && rare >= 1) continue;
    if (RARE.has(l)) rare++;
    seen.set(l, n + 1);
    letters.push(l);
  }
  if (letters.length < count) return null;
  const vowels = letters.filter((l) => VOWELS.has(l)).length / count;
  return vowels >= 0.3 && vowels <= 0.45 ? letters : null;
}

export function boardForShape(shape: Shape, letters: readonly string[]): Board {
  const rows = shape.mask.length;
  const cols = shape.mask[0]!.length;
  const tiles: (string | null)[] = [];
  let k = 0;
  for (const line of shape.mask) {
    for (const cell of line) tiles.push(cell === '#' ? letters[k++]! : null);
  }
  return { rows, cols, tiles };
}

export interface Candidate {
  content: CasualContent;
  /** All dictionary words on the board, for stats. */
  wordCount: number;
}

/** Score a casual board against the dictionaries; null when it fails the rules. */
export function evaluate(shape: Shape, board: Board, dicts: Dictionaries): Candidate | null {
  if (solve(board, dicts.blocked, 3).size > 0) return null;
  const found = solve(board, dicts.all, MIN_WORD);
  const words: string[] = [];
  const bonus: string[] = [];
  for (const word of found.keys()) (dicts.common.has(word) ? words : bonus).push(word);
  const band = BANDS[shape.id];
  if (words.length < band.minWords || words.length > band.maxWords) return null;
  words.sort();
  bonus.sort();
  let star = '';
  for (const w of words) if (w.length > star.length) star = w;
  if (star.length < band.minStar) return null;
  return {
    content: { shape: shape.id, rows: board.rows, cols: board.cols, tiles: board.tiles, words, bonus, star },
    wordCount: found.size,
  };
}

/**
 * How interesting a passing board is: long required words are what make a
 * board feel worth hunting, so they count most.
 */
function interest(c: { words: string[] }): number {
  let long = 0;
  let longest = 0;
  for (const w of c.words) {
    if (w.length >= 6) long += w.length - 5;
    longest = Math.max(longest, w.length);
  }
  return long + longest;
}

/** Up to `pick` passing boards for a seed, the most interesting kept. */
function pickBest<T extends { words: string[] }>(
  shape: Shape,
  seed: string,
  attempts: number,
  pick: number,
  judge: (board: Board) => T | null
): T | null {
  const rand = mulberry32(hashString(seed));
  const tileCount = shape.mask.join('').split('').filter((c) => c === '#').length;
  let best: T | null = null;
  let passed = 0;
  for (let i = 0; i < attempts && passed < pick; i++) {
    const letters = drawLetters(tileCount, rand);
    if (!letters) continue;
    const result = judge(boardForShape(shape, letters));
    if (!result) continue;
    passed++;
    if (!best || interest(result) > interest(best)) best = result;
  }
  return best;
}

/**
 * The casual board for one day, or null if nothing passed within the attempt
 * budget. Takes the most interesting of the first `pick` boards that pass.
 */
export function generatePuzzle(
  puzzleIndex: number,
  dicts: Dictionaries,
  salt: string,
  { attempts = 6000, pick = 12 } = {}
): Candidate | null {
  const shape = shapeForPuzzle(puzzleIndex);
  const found = pickBest(shape, `word-rush:${salt}:${puzzleIndex}`, attempts, pick, (board) => {
    const c = evaluate(shape, board, dicts);
    return c ? { ...c, words: c.content.words } : null;
  });
  return found ? { content: found.content, wordCount: found.wordCount } : null;
}

// ---------- Sprint ----------

/** Shortest Sprint word: three, as in classic Boggle. */
export const SPRINT_MIN_WORD = 3;

/**
 * Sprint total-word bands per shape (3+ letters, whole dictionary). Enough to
 * keep a run busy; capped so a day's content fits in 16 KB.
 */
export const SPRINT_BANDS: Record<ShapeId, Band> = {
  square4: { minWords: 90, maxWords: 220, minStar: 6 },
  square5: { minWords: 220, maxWords: 520, minStar: 7 },
  corners: { minWords: 180, maxWords: 460, minStar: 7 },
  hollow: { minWords: 180, maxWords: 480, minStar: 7 },
  lantern: { minWords: 150, maxWords: 420, minStar: 7 },
};

export function evaluateSprint(shape: Shape, board: Board, dicts: Dictionaries): SprintContent | null {
  if (solve(board, dicts.blocked, 3).size > 0) return null;
  const words = [...solve(board, dicts.all, SPRINT_MIN_WORD).keys()];
  const band = SPRINT_BANDS[shape.id];
  if (words.length < band.minWords || words.length > band.maxWords) return null;
  if (!words.some((w) => w.length >= band.minStar)) return null;
  words.sort();
  return { shape: shape.id, rows: board.rows, cols: board.cols, tiles: board.tiles, words };
}

export function generateSprint(
  puzzleIndex: number,
  dicts: Dictionaries,
  salt: string,
  { attempts = 6000, pick = 8 } = {}
): SprintContent | null {
  const shape = shapeForPuzzle(puzzleIndex);
  return pickBest(shape, `word-rush-sprint:${salt}:${puzzleIndex}`, attempts, pick, (b) => evaluateSprint(shape, b, dicts));
}

/** What the backend stores per round (AppRoundContentService::CONTENT_MAX_BYTES), less some headroom. */
export const DAY_MAX_BYTES = 15_500;

/** Both boards for one day, or null when either couldn't be generated or they don't fit. */
export function generateDay(puzzleIndex: number, dicts: Dictionaries, salt: string): DayContent | null {
  const casual = generatePuzzle(puzzleIndex, dicts, salt);
  const sprint = generateSprint(puzzleIndex, dicts, salt);
  if (!casual || !sprint) return null;
  const day: DayContent = { v: 2, sprint, casual: casual.content };
  return JSON.stringify(day).length <= DAY_MAX_BYTES ? day : null;
}
