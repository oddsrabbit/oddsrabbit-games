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

/** e.g. "Sat, Nov 28" for the list and the play note; the year only when it isn't `today`'s. */
export function shortDate(n: number, today: number): string {
  const d = new Date(EPOCH_MS + n * DAY_MS);
  const year = d.getUTCFullYear() === new Date(EPOCH_MS + today * DAY_MS).getUTCFullYear() ? '' : `, ${d.getUTCFullYear()}`;
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year}`;
}

/** Empty cells left on a saved board (`.` in its text form): the list's "41 to go". */
export function cellsToGo(values: string): number {
  let n = 0;
  for (const ch of values) if (ch === '.') n++;
  return n;
}

/** The list pages in this many days at a time. */
export const PAST_PAGE = 30;

/** The list's chips. Solved means ever solved: on the day or from the archive. */
export type PastFilter = 'all' | 'unsolved' | 'solved';

/** The past days ever solved, on the day (stats) or from the archive (`archive-played`). */
export function solvedPast(today: number, solvedDays: readonly number[], archivePlayed: readonly number[]): Set<number> {
  return new Set([...solvedDays, ...archivePlayed].filter((n) => Number.isInteger(n) && n >= 0 && n < today));
}

/**
 * One page of the list, newest first: the `shown` most recent days before
 * `today` that the filter keeps, and whether older ones are left.
 */
export function pastPage(today: number, shown: number, filter: PastFilter, solved: ReadonlySet<number>): { days: number[]; more: boolean } {
  const keep = (n: number): boolean => filter === 'all' || (filter === 'solved') === solved.has(n);
  const days: number[] = [];
  for (let n = today - 1; n >= 0; n--) {
    if (!keep(n)) continue;
    if (days.length === shown) return { days, more: true };
    days.push(n);
  }
  return { days, more: false };
}
