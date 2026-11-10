// Archive play: replaying a past day from the website's per-day archive pages.
// Pure helpers, kept out of main.ts (which touches the DOM at import time) so
// they can be unit-tested.

/**
 * Storage key the website reads server-side to mark days a signed-in player
 * has already finished. Name and shape (sorted, deduped int array) are a
 * cross-game contract — don't change either.
 */
export const ARCHIVE_PLAYED_KEY = 'archive-played';

/** A past day's in-progress save. Separate from `today` so an archive game can never clobber it. */
export function archiveStateKey(puzzleIndex: number): string {
  return `archive-${puzzleIndex}`;
}

/**
 * The past day the host asked to play, or null for a normal launch.
 *
 * Expected shape: `{ target: 'play', roundKey: 'puzzle-N' }`. Only a day that
 * has already opened and isn't today counts — today is just a normal launch,
 * and a future or malformed key is ignored rather than trusted.
 */
export function parseArchiveIntent(
  initialState: Record<string, unknown> | null | undefined,
  todayIndex: number
): number | null {
  if (!initialState || initialState.target !== 'play') return null;
  const roundKey = initialState.roundKey;
  if (typeof roundKey !== 'string') return null;
  const match = /^puzzle-(\d+)$/.exec(roundKey);
  if (!match) return null;
  const index = parseInt(match[1]!, 10);
  return index < todayIndex ? index : null;
}

/**
 * `archive-played` with `puzzleIndex` added. Tolerates a missing, corrupt or
 * wrongly-shaped stored value (drops what isn't a non-negative int) so one bad
 * write can't wedge the list forever.
 */
export function mergeArchivePlayed(raw: string | null | undefined, puzzleIndex: number): number[] {
  let parsed: unknown = [];
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }
  const days = Array.isArray(parsed)
    ? parsed.filter((d): d is number => Number.isInteger(d) && d >= 0)
    : [];
  days.push(puzzleIndex);
  return [...new Set(days)].sort((a, b) => a - b);
}
