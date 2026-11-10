// The website's per-day archive pages: their Play deep link, and the record of
// past boards played that those pages read back. Pure, so it's unit-tested.

/** Storage key the website reads server-side: keep its name and shape (sorted, deduped day indexes). */
export const ARCHIVE_PLAYED_KEY = 'archive-played';

/**
 * `{ target: 'play', roundKey: 'puzzle-N' | 'casual-N' }` from a web archive
 * page: day N, but only a past one. Today is a normal launch, and a past Sprint
 * is never playable (ranked, timed), so either key means that day's casual board.
 */
export function archivePlayIntent(state: Record<string, unknown> | null | undefined, today: number): number | null {
  if (!state || state.target !== 'play' || typeof state.roundKey !== 'string') return null;
  const m = /^(?:puzzle|casual)-(\d+)$/.exec(state.roundKey);
  if (!m) return null;
  const day = Number(m[1]);
  return Number.isSafeInteger(day) && day < today ? day : null;
}

/** The stored list with `day` added. Anything unreadable in it is dropped rather than failing the write. */
export function withArchivePlayed(stored: unknown, day: number): number[] {
  const days = new Set<number>([day]);
  if (Array.isArray(stored)) {
    for (const d of stored) if (Number.isSafeInteger(d) && d >= 0) days.add(d);
  }
  return [...days].sort((a, b) => a - b);
}
