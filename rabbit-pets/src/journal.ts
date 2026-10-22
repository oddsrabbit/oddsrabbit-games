// Her journal: a short, dated story of your time together, kept under its own
// storage key (v1:journal) so the pet document stays small. Firsts are
// recorded once each (the first time she found a marble, her first loved
// meal), keyed so a second device or a replay can't write them twice.

/** `first`: the first it records, if it's one (so merging two devices' copies keeps one). */
export interface JournalEntry { atMs: number; text: string; art?: string; first?: string }
/**
 * A visit, kept in her guest book: who came (name and rabbit), when, what
 * they did (the visit's care kind), the note they left and the stamp they
 * signed with, if any, and how their rabbit looked, for its picture.
 */
export interface GuestEntry {
  visitUuid: string; atMs: number; from: string; rabbit: string; care: string; note?: string; stamp?: string;
  look?: { coat: string; ears?: string; head?: string | null; neck?: string | null };
}
/** `pinned`: signatures on her corkboard (guestbook.ts MAX_PINS), by visit. */
export interface Journal { v: 1; rev: number; entries: JournalEntry[]; firsts: string[]; guestbook?: GuestEntry[]; pinned?: string[] }

export const JOURNAL_MAX = 200;
export const GUESTBOOK_MAX = 60;

/**
 * Sign the guest book: new visits only, newest first, the last GUESTBOOK_MAX
 * (and any pinned ones older than that, so a pin never goes missing).
 * Returns the same journal if nothing's new.
 */
export function signGuestbook(j: Journal, visits: GuestEntry[]): Journal {
  const have = new Set((j.guestbook ?? []).map((g) => g.visitUuid));
  const fresh = visits.filter((v) => !have.has(v.visitUuid));
  if (!fresh.length) return j;
  const pinned = new Set(j.pinned ?? []);
  const all = [...fresh, ...(j.guestbook ?? [])].sort((a, b) => b.atMs - a.atMs);
  return { ...j, guestbook: all.filter((g, i) => i < GUESTBOOK_MAX || pinned.has(g.visitUuid)) };
}

/**
 * Her journal cut down to `maxBytes` (UTF-8 bytes of its JSON, as storage
 * counts them): everything she saves shares one 16 KB (store.ts
 * STORAGE_TOTAL_BYTES), so the journal gets what her own save leaves. The
 * oldest entries and the oldest unpinned signatures go together, in step, so
 * neither crowds the other out. Pinned signatures and firsts are always kept
 * (firsts stop a first being written twice). Returns the same journal if it
 * already fits.
 */
export function fitJournal(j: Journal, maxBytes: number): Journal {
  const size = (x: Journal) => new TextEncoder().encode(JSON.stringify(x)).length;
  if (size(j) <= maxBytes) return j;
  const pinned = new Set(j.pinned ?? []);
  const book = j.guestbook ?? [];
  // the newest `share` of each (both are newest first), pinned signatures whatever their age
  const keep = (share: number): Journal => {
    const loose = book.filter((g) => !pinned.has(g.visitUuid));
    const kept = new Set(loose.slice(0, Math.floor(loose.length * share)).map((g) => g.visitUuid));
    const out: Journal = { ...j, entries: j.entries.slice(0, Math.floor(j.entries.length * share)) };
    if (j.guestbook) out.guestbook = book.filter((g) => pinned.has(g.visitUuid) || kept.has(g.visitUuid));
    return out;
  };
  // the largest share that fits, to within a few entries
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (size(keep(mid)) <= maxBytes) lo = mid; else hi = mid;
  }
  return keep(lo);
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
