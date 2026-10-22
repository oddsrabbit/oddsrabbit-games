// The Sprint's rules, free of the DOM: classic Boggle points, the day-close
// maths, and the timer.
//
// MIRRORED IN PHP. The backend recomputes base points from the submission's
// bitmask (AppScoreVerifier, `puzzle-N` rounds) and closes the day with the
// same formulas (WordSprintSealer). Change them together.
//
// While the day runs, a player's stored score is their BASE points: the
// classic length score of every word they found. When the day closes:
//   final  = base + the points of every word nobody else found (they score double)
//   rating = round(1000 × final / the day's best final)
// and the stored score becomes the rating, so a 4×4 day and a 5×5 day weigh
// the same on the month's board. Metadata then carries base, bonus, final,
// rating and how many words were unique, for the leaderboards and results.

import { encodeMask } from './scoring';
import { DAY_MS, EPOCH_MS, type ShapeId, type SprintContent } from './puzzle';

/**
 * How long a Ranked run lasts, by board: 90 seconds on a 4×4 (Word Hunt's
 * pace, about the right length for tracing with a finger), 2 minutes on the
 * bigger 5×5 and shaped boards, which take longer just to scan. Days are only
 * ever compared with themselves (and the month uses per-day ratings), so
 * different lengths on different days are fair.
 */
export function sprintMs(shape: ShapeId): number {
  return shape === 'square4' ? 90_000 : 120_000;
}

/** Time a finished run's score gets to reach the server before the day closes at midnight UTC. */
export const CLOSE_MARGIN_MS = 15_000;

/**
 * Whether a run started at `now` ends in time to be scored. The day closes at
 * midnight UTC and the server refuses scores after that, so a run that would
 * cross midnight can't start.
 */
export function runFitsDay(puzzleIndex: number, now: number, ms: number): boolean {
  return now + ms + CLOSE_MARGIN_MS <= EPOCH_MS + (puzzleIndex + 1) * DAY_MS;
}

/** "90 seconds" / "2 minutes", for the copy. */
export function sprintLabel(shape: ShapeId): string {
  const s = sprintMs(shape) / 1000;
  return s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`;
}

/** Classic Boggle points by length: 3–4 letters 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11. "QU" counts as two letters. */
export function pointsFor(word: string): number {
  const n = word.length;
  if (n < 3) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

export function basePoints(words: readonly string[]): number {
  return words.reduce((sum, w) => sum + pointsFor(w), 0);
}

/** A player's words once the day has closed: which were theirs alone. */
export function finalPoints(
  found: readonly string[],
  counts: ReadonlyMap<string, number>
): { base: number; bonus: number; final: number; unique: string[] } {
  const base = basePoints(found);
  const unique = found.filter((w) => (counts.get(w) ?? 0) <= 1);
  const bonus = basePoints(unique);
  return { base, bonus, final: base + bonus, unique };
}

export function ratingFor(final: number, dayBest: number): number {
  return dayBest > 0 ? Math.round((1000 * final) / dayBest) : 0;
}

// ---------- One player's Sprint ----------

export interface SprintProgress {
  puzzleIndex: number;
  /** Server time (ms) the timer started; null before Start. */
  startedAt: number | null;
  /** Words found, in order. */
  found: string[];
  /** The score went to the server (or the server already had one). */
  submitted: boolean;
  /** The server refused it because the day had closed. */
  closed?: boolean;
}

export function freshSprint(puzzleIndex: number): SprintProgress {
  return { puzzleIndex, startedAt: null, found: [], submitted: false };
}

export function isSprintProgress(v: unknown): v is SprintProgress {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<SprintProgress>;
  return (
    typeof p.puzzleIndex === 'number' &&
    (p.startedAt === null || typeof p.startedAt === 'number') &&
    Array.isArray(p.found) &&
    p.found.every((w) => typeof w === 'string') &&
    typeof p.submitted === 'boolean'
  );
}

export type SprintPhase = 'ready' | 'playing' | 'done';

export function phaseOf(p: SprintProgress, now: number, ms: number): SprintPhase {
  if (p.startedAt === null) return 'ready';
  return now < p.startedAt + ms ? 'playing' : 'done';
}

export function remainingMs(p: SprintProgress, now: number, ms: number): number {
  return p.startedAt === null ? ms : Math.max(0, p.startedAt + ms - now);
}

export type SprintWordResult =
  | { kind: 'found'; word: string; points: number }
  | { kind: 'already'; word: string }
  | { kind: 'short'; word: string }
  | { kind: 'unknown'; word: string };

export function checkSprintWord(content: SprintContent, p: SprintProgress, word: string): SprintWordResult {
  if (word.length < 3) return { kind: 'short', word };
  if (!content.words.includes(word)) return { kind: 'unknown', word };
  if (p.found.includes(word)) return { kind: 'already', word };
  return { kind: 'found', word, points: pointsFor(word) };
}

export function sprintMetadata(content: SprintContent, p: SprintProgress): { f: string } {
  return { f: encodeMask(content.words, new Set(p.found)) };
}

/** "2:05" */
export function clockLabel(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Metadata on a Sprint score row, as the server writes it. Sealed rows carry the day-close fields. */
export interface SprintRowMeta {
  base?: number;
  words?: number;
  bonus?: number;
  final?: number;
  rating?: number;
  unique?: number;
  sealed?: boolean;
}

export function rowMeta(metadata: Record<string, unknown> | null): SprintRowMeta {
  const m = metadata ?? {};
  const num = (k: string): number | undefined => (typeof m[k] === 'number' ? (m[k] as number) : undefined);
  return {
    base: num('base'),
    words: num('words'),
    bonus: num('bonus'),
    final: num('final'),
    rating: num('rating'),
    unique: num('unique'),
    sealed: m.sealed === true,
  };
}

/** A row's points as players read them: final once sealed, base while the day runs. */
export function rowPoints(score: number, metadata: Record<string, unknown> | null): number {
  const m = rowMeta(metadata);
  if (m.sealed) return m.final ?? score;
  return m.base ?? score;
}
