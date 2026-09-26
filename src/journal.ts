// Her journal: a short, dated story of your time together, kept under its own
// storage key (v1:journal) so the pet document stays small. Firsts are
// recorded once each (the first time she found a marble, her first loved
// meal), keyed so a second device or a replay can't write them twice.

/** `first`: the first it records, if it's one (so merging two devices' copies keeps one). */
export interface JournalEntry { atMs: number; text: string; art?: string; first?: string }
/**
 * A visit, kept in her guest book: who came (name and rabbit), when, what
 * they did (the visit's care kind) and the note they left, if any.
 */
export interface GuestEntry { visitUuid: string; atMs: number; from: string; rabbit: string; care: string; note?: string }
export interface Journal { v: 1; rev: number; entries: JournalEntry[]; firsts: string[]; guestbook?: GuestEntry[] }

export const JOURNAL_MAX = 200;
export const GUESTBOOK_MAX = 60;

/** Sign the guest book: new visits only, newest first, the last GUESTBOOK_MAX. Returns the same journal if nothing's new. */
export function signGuestbook(j: Journal, visits: GuestEntry[]): Journal {
  const have = new Set((j.guestbook ?? []).map((g) => g.visitUuid));
  const fresh = visits.filter((v) => !have.has(v.visitUuid));
  if (!fresh.length) return j;
  return { ...j, guestbook: [...fresh, ...(j.guestbook ?? [])].sort((a, b) => b.atMs - a.atMs).slice(0, GUESTBOOK_MAX) };
}

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
    entries: [first ? { ...entry, first } : entry, ...j.entries].slice(0, JOURNAL_MAX),
    firsts: first ? [...j.firsts, first] : j.firsts,
  };
}

/**
 * Two devices' copies of her journal as one: every entry either has, newest
 * first. An entry both have counts once, and so does a first both wrote
 * (the earlier one stays).
 */
export function mergeJournal(a: Journal, b: Journal): Journal {
  const seen = new Set<string>();
  const entries = [...a.entries, ...b.entries]
    .sort((x, y) => x.atMs - y.atMs)
    .filter((e) => {
      const k = e.first ?? `${e.atMs}|${e.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .reverse()
    .slice(0, JOURNAL_MAX);
  const merged: Journal = { ...b, ...a, rev: Math.max(a.rev, b.rev), entries, firsts: [...new Set([...a.firsts, ...b.firsts])] };
  return b.guestbook?.length ? signGuestbook(merged, b.guestbook) : merged;
}

/** Days together worth a journal line. */
export const MILESTONE_DAYS = [3, 7, 14, 30, 50, 100, 200, 365];
