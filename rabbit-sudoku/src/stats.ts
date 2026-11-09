// The player's own record, saved under `stats`: which Dailies they solved,
// for the streak and the week strip.

export interface Stats {
  /** Puzzle indexes of solved Dailies, ascending, the last ~120. */
  solvedDays: number[];
}

const KEEP_DAYS = 120;

export function parseStats(raw: unknown): Stats {
  const days = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).solvedDays : null;
  const solvedDays = Array.isArray(days)
    ? [...new Set(days.filter((n): n is number => Number.isInteger(n)))].sort((a, b) => a - b)
    : [];
  return { solvedDays };
}

export function withDailySolved(stats: Stats, index: number): Stats {
  return { solvedDays: [...new Set([...stats.solvedDays, index])].sort((a, b) => a - b).slice(-KEEP_DAYS) };
}

/**
 * Days in a row with the Daily solved, ending today, or yesterday while
 * today's isn't done yet (a streak isn't lost until the day is over).
 */
export function streakOf(solvedDays: readonly number[], today: number): number {
  const solved = new Set(solvedDays);
  let day = solved.has(today) ? today : today - 1;
  let n = 0;
  while (solved.has(day)) {
    n++;
    day--;
  }
  return n;
}

/** The longest run of consecutive solved days. */
export function bestStreak(solvedDays: readonly number[]): number {
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const d of solvedDays) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
