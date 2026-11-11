// The opt-in race (docs/proposals/rabbit-sudoku.md §2.9): today's own puzzle
// against a clock that runs on real time and doesn't stop, with no hints and
// no mistake check. You choose it before you've seen the grid, and leaving it
// drops you into the calm game on the same board.
//
// Two rows on `race-N`, both keepBest: the start (0), sent before the grid
// shows, whose server timestamp is the race's start; then the finish,
// RACE_DAY_SEC - seconds, so a faster time scores higher on the usual board.
// The server times the finish from the start row and refuses a time under
// the tier's floor (AppScoreVerifier::verifySudokuRace in the web repo, which
// mirrors the constants here).

import type { Tier } from './grade';

/** Mirrors SUDOKU_RACE_DAY_SEC. A finish scores this less its seconds. */
export const RACE_DAY_SEC = 86_400;

/** Fastest believable race per tier, in seconds. Mirrors SUDOKU_RACE_FLOOR_SEC. */
export const RACE_FLOOR_SEC: Record<Tier, number> = { easy: 60, medium: 90, hard: 120, expert: 180 };

/** A race started but not finished. Below every finish, and never listed. */
export const RACE_STARTED_SCORE = 0;

export const raceKey = (n: number): string => `race-${n}`;

/** A finish's score: fewer seconds score higher, and every finish beats a start. */
export function raceScore(seconds: number): number {
  const s = Number.isFinite(seconds) ? Math.min(RACE_DAY_SEC - 1, Math.max(0, Math.round(seconds))) : RACE_DAY_SEC - 1;
  return RACE_DAY_SEC - s;
}

export const isFinishedRace = (row: { score: number }): boolean => row.score > RACE_STARTED_SCORE;

/** A row's race time in seconds: the server's own `seconds`, else from the score; null for a start. */
export function raceSeconds(row: { score: number; metadata?: Record<string, unknown> | null }): number | null {
  if (!isFinishedRace(row)) return null;
  const s = row.metadata?.seconds;
  if (typeof s === 'number' && Number.isFinite(s) && s >= 0) return Math.round(s);
  return RACE_DAY_SEC - row.score;
}

/** `0:47`, `12:34`, `1:02:03`. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * How many of the other finishers you beat, as a whole percent: rank 1 of 10
 * is 100, rank 10 of 10 is 0. Null when there's nobody else to compare with.
 */
export function fasterThan(rank: number, finishers: number): number | null {
  if (!Number.isFinite(rank) || !Number.isFinite(finishers) || finishers < 2 || rank < 1) return null;
  return Math.round((100 * Math.max(0, finishers - Math.min(rank, finishers))) / (finishers - 1));
}

/** Today's race, as saved with the day (`daily.race`). */
export interface RaceState {
  /** Server time (ms) the race began: once the start row landed, as the grid appeared. */
  startedAt: number;
  /** Seconds on the clock at the solve. */
  finishedSec?: number;
  /** The finish hasn't reached the server yet. */
  pending?: boolean;
  /** The server refused the finish for good (e.g. too fast); never resent. */
  refused?: boolean;
  /** The player left the race and finished calmly. */
  left?: boolean;
}

export function parseRace(raw: unknown): RaceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt)) return null;
  const out: RaceState = { startedAt: r.startedAt };
  if (typeof r.finishedSec === 'number' && Number.isFinite(r.finishedSec) && r.finishedSec >= 0) out.finishedSec = Math.round(r.finishedSec);
  if (r.pending === true) out.pending = true;
  if (r.refused === true) out.refused = true;
  if (r.left === true) out.left = true;
  return out;
}

/** Whether a race is under way: begun, not finished and not left. */
export const isRacing = (r: RaceState | null | undefined): r is RaceState => !!r && r.finishedSec === undefined && !r.left;

/** Refusals that will never change on a resend: stop trying, and say the time didn't count. */
export function isFinalRefusal(code: unknown): boolean {
  return typeof code === 'string' && (code.startsWith('scores/race-') || code === 'scores/round-closed' || code === 'scores/unverifiable');
}
