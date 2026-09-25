// Her journal: a short, dated story of your time together, kept under its own
// storage key (v1:journal) so the pet document stays small. Firsts are
// recorded once each (the first time she found a marble, her first loved
// meal), keyed so a second device or a replay can't write them twice.

export interface JournalEntry { atMs: number; text: string; art?: string }
export interface Journal { v: 1; rev: number; entries: JournalEntry[]; firsts: string[] }

export const JOURNAL_MAX = 200;

export function emptyJournal(): Journal {
  return { v: 1, rev: 0, entries: [], firsts: [] };
}

export function isJournal(x: unknown): x is Journal {
  const j = x as Journal;
  return !!j && j.v === 1 && Array.isArray(j.entries) && Array.isArray(j.firsts);
}

/**
 * Add an entry, newest first, keeping the last JOURNAL_MAX. With `first`, only
 * if that first hasn't happened yet. Returns the same journal when nothing was
 * added.
 */
export function addEntry(j: Journal, entry: JournalEntry, first?: string): Journal {
  if (first && j.firsts.includes(first)) return j;
  return {
    ...j,
    entries: [entry, ...j.entries].slice(0, JOURNAL_MAX),
    firsts: first ? [...j.firsts, first] : j.firsts,
  };
}

/** Days together worth a journal line. */
export const MILESTONE_DAYS = [3, 7, 14, 30, 50, 100, 200, 365];
