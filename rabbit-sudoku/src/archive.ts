// Playing a past Daily from the archive. The website's per-day pages open the
// game with `initialState: { target: 'play', roundKey: 'puzzle-N' }`. A past
// day is practice: no score row, no streak, its own save.

import { DAY_MS, EPOCH_MS } from './puzzle';

/**
 * The days the player solved from the archive, as a JSON array of puzzle
 * indexes, ascending. The website reads this key server-side, so its name and
 * shape are fixed.
 */
export const ARCHIVE_PLAYED_KEY = 'archive-played';

/** One past day's board in progress. Never `daily`, which is today's. */
export const archiveKey = (n: number): string => `archive-${n}`;

/**
 * The past day the host asked to open, or null to launch as normal: today's
 * own index, a future day or anything malformed is a normal launch.
 */
export function archiveIntent(initialState: Record<string, unknown> | null | undefined, today: number): number | null {
  if (!initialState || initialState.target !== 'play' || typeof initialState.roundKey !== 'string') return null;
  const match = /^puzzle-(\d{1,6})$/.exec(initialState.roundKey);
  if (!match) return null;
  const n = Number(match[1]);
  return n < today ? n : null;
}

/** The stored list, cleaned up; anything unreadable counts as empty. */
export function parseArchivePlayed(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
}

export function withArchivePlayed(raw: unknown, n: number): number[] {
  return parseArchivePlayed([...parseArchivePlayed(raw), n]);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Monday, Nov 16, 2026", the UTC day the puzzle was the Daily. */
export function archiveDate(n: number): string {
  const d = new Date(EPOCH_MS + n * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ---------- the in-app list of past puzzles ----------

/** How a past day shows in the list. */
export type PastStatus = 'solved' | 'progress' | 'new';

/**
 * A past day's status. Solved on the day (stats), solved from the archive
 * (`archive-played`) or a solved archive save all count. An unsolved archive
 * save is in progress: archive saves are only written once the board has been
 * touched (main.ts). A cleared save (Play again) is stored as null.
 */
export function pastStatus(n: number, solvedDays: readonly number[], archivePlayed: readonly number[], save: { solved?: unknown } | null): PastStatus {
  if (save?.solved === true) return 'solved';
  if (save) return 'progress';
  return solvedDays.includes(n) || archivePlayed.includes(n) ? 'solved' : 'new';
}

/** The list pages in this many days at a time. */
export const PAST_PAGE = 30;

/** The past days to list, newest first: the `shown` most recent before `today`. */
export function pastDays(today: number, shown: number): number[] {
  const days: number[] = [];
  for (let n = today - 1; n >= 0 && days.length < shown; n--) days.push(n);
  return days;
}

/** How many past days were never solved, either on the day or from the archive. */
export function unsolvedPast(today: number, solvedDays: readonly number[], archivePlayed: readonly number[]): number {
  const solved = new Set([...solvedDays, ...archivePlayed].filter((n) => n >= 0 && n < today));
  return Math.max(0, today - solved.size);
}
