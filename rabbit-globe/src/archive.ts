/**
 * Archive play: replaying a past day from the website's per-day archive pages.
 * Pure (no SDK, no DOM, no Leaflet) so it can be unit-tested; main.ts does the
 * I/O. The contract is shared with the other daily games, so the intent shape
 * and the `archive-played` key and shape must not drift.
 */

/**
 * Days the player has finished in the archive: a JSON array of day indexes,
 * deduped and sorted ascending. The website reads this key server-side to mark
 * archive pages as played.
 */
export const ARCHIVE_PLAYED_KEY = 'archive-played';

/** Storage key for one archived day's progress. Never today's `today` key. */
export function archiveStateKey(puzzleIndex: number): string {
  return `archive-${puzzleIndex}`;
}

/**
 * The past day `initialState` asks to play, or null for a normal launch.
 * Expected: `{ target: 'play', roundKey: 'puzzle-N' }`. Only 0 <= N < today is
 * an archive play; today itself, a future day, or anything malformed is a
 * normal launch. No leading zeros, matching the server's round keys.
 */
export function parseArchiveIntent(
  initialState: Record<string, unknown> | null,
  today: number
): number | null {
  if (!initialState || initialState.target !== 'play') return null;
  const roundKey = initialState.roundKey;
  if (typeof roundKey !== 'string') return null;
  const match = /^puzzle-(0|[1-9]\d*)$/.exec(roundKey);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index < today ? index : null;
}

/**
 * `raw` (the stored `archive-played` value) with `puzzleIndex` added. A missing
 * or invalid value starts a fresh list; stray non-integer entries are dropped.
 */
export function mergeArchivePlayed(raw: string | null | undefined, puzzleIndex: number): number[] {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const days = Array.isArray(parsed)
    ? parsed.filter((d): d is number => Number.isSafeInteger(d) && (d as number) >= 0)
    : [];
  return [...new Set([...days, puzzleIndex])].sort((a, b) => a - b);
}
