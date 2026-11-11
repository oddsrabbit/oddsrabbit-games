// The daily calendar and the content blob the server hands out through
// `content.daily` (see docs/proposals/rabbit-sudoku.md §3).
//
// The epoch lives in three places that must agree: EPOCH below, `epoch` in
// data/rabbit-sudoku-puzzles.json (written by tools/gen-puzzles.ts from this
// constant), and the `rabbit-sudoku` entry in the backend's DailyGameRegistry.
// Launched 2026-11-09, a Monday. The weekday plan depends on it, so never
// change it on a live game: it would renumber every day and their scores.

import { TIERS, type Tier } from './grade';
import { duplicateCells, parseGrid } from './sudoku';

/** `puzzle-0` is this UTC day (launch day); it shows as #1. */
export const EPOCH = '2026-11-09';
export const EPOCH_MS = Date.parse(`${EPOCH}T00:00:00Z`);
export const DAY_MS = 86_400_000;

export function puzzleIndexAt(ms: number): number {
  return Math.floor((ms - EPOCH_MS) / DAY_MS);
}

export function roundKey(puzzleIndex: number): string {
  return `puzzle-${puzzleIndex}`;
}

/**
 * The Daily's tier by UTC weekday, Sunday first: Easy on Monday up to Expert
 * on Saturday, then a Medium Sunday to wind down. Two days in seven need the
 * advanced patterns, not three.
 */
export const WEEK: readonly Tier[] = ['medium', 'easy', 'easy', 'medium', 'medium', 'hard', 'expert'];

export function dailyTierFor(puzzleIndex: number): Tier {
  return WEEK[new Date(EPOCH_MS + puzzleIndex * DAY_MS).getUTCDay()]!;
}

/** One day's content, as stored under `puzzle-N` and served by `content.daily`. */
export interface DayContent {
  v: 2;
  tier: Tier;
  /** 81 characters, row by row, `.` for an empty cell. */
  givens: string;
}

/** The day's content if it's the shape this game plays, else null. Never trusted blind. */
export function parseDay(raw: unknown): DayContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== 2 || typeof c.tier !== 'string' || !(TIERS as readonly string[]).includes(c.tier)) return null;
  if (typeof c.givens !== 'string') return null;
  const grid = parseGrid(c.givens);
  if (!grid || duplicateCells(grid).length) return null;
  return { v: 2, tier: c.tier as Tier, givens: c.givens };
}
