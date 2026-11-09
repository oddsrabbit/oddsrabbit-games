// The daily calendar and the content blob the server hands out through
// `content.daily` (see docs/proposals/rabbit-sudoku.md §3).
//
// The epoch lives in three places that must agree: EPOCH below, `epoch` in
// data/rabbit-sudoku-puzzles.json (written by tools/gen-puzzles.ts from this
// constant), and the `rabbit-sudoku` entry in the backend's DailyGameRegistry.
// EPOCH is a placeholder until the launch day is picked; the weekday plan
// depends on it, so regenerate the file when it changes.

import { TIERS, type Tier } from './grade';
import { duplicateCells, parseGrid } from './sudoku';

/** `puzzle-0` is this UTC day; it shows as #1. Placeholder until launch. */
export const EPOCH = '2026-12-01';
export const EPOCH_MS = Date.parse(`${EPOCH}T00:00:00Z`);
export const DAY_MS = 86_400_000;

export function puzzleIndexAt(ms: number): number {
  return Math.floor((ms - EPOCH_MS) / DAY_MS);
}

export function roundKey(puzzleIndex: number): string {
  return `puzzle-${puzzleIndex}`;
}

/** The Daily's tier by UTC weekday, Sunday first: Easy on Monday up to Expert on Saturday. */
export const WEEK: readonly Tier[] = ['hard', 'easy', 'easy', 'medium', 'medium', 'hard', 'expert'];

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
