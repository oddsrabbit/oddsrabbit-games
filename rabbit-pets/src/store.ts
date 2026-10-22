// Saving to OR.storage. Everything a player saves shares one 16 KB, counted
// in bytes across all keys (the server's per-(app, user) cap: see
// STORAGE_TOTAL_BYTES), not 16 KB a key:
//   v1:pet       the simulation state (needs, timers, bond, clover, gift)
//   v1:burrow    decor and where it sits
//   v1:settings  reminder choice and what's been scheduled
//   v1:journal   her journal (journal.ts), capped at 200 entries and cut to fit
//
// OR.storage is last-writer-wins with no compare-and-set. Each document
// carries a `rev` that goes up when the player changes something (not when
// time merely passes: replaying time gives the same rabbit on any device). On
// returning to the page the game re-reads and adopts another device's newer
// copy before replaying time, and each batch of writes first checks nobody
// else has written since (main.ts othersHaventWritten); if someone has, this
// device takes their copy instead. The journal is merged rather than taken.
// A hidden page doesn't save.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { readBurrow, type BurrowState } from './decor';
import { isJournal, type Journal } from './journal';
import { isPetState, type PetState } from './sim';

export const KEYS = { pet: 'v1:pet', burrow: 'v1:burrow', settings: 'v1:settings', journal: 'v1:journal' } as const;

export interface Settings {
  v: 1;
  rev: number;
  /** null = never asked. */
  reminders: 'on' | 'off' | null;
  /** Reminder kinds switched off one by one in Settings (reminders.ts REMINDER_KEYS). Missing: none. */
  quiet?: string[];
  /** The stamp she signs friends' guest books with (guestbook.ts STAMPS). Missing: the heart. */
  stamp?: string;
  /** Sound effects. Missing in saves from before sound existed, which means on. */
  sound?: boolean;
  /** Reminder key -> ISO fireAt last scheduled, to avoid re-sending the same one. */
  scheduled: Record<string, string>;
  /** The newest guest book signature seen, so newer ones show as new. Missing: not looked yet. */
  guestbookSeenMs?: number;
}

export function defaultSettings(): Settings {
  return { v: 1, rev: 0, reminders: null, scheduled: {}, sound: true };
}

function isSettings(x: unknown): x is Settings {
  const s = x as Settings;
  return !!s && s.v === 1 && typeof s.scheduled === 'object' && s.scheduled !== null;
}

// ---------------------------------------------------------------- versions
//
// A version of the game must never lose what a newer version saved. Two rules:
//
// 1. Keep what you don't understand. Pieces, fields and ids this version
//    doesn't know are kept and written back untouched (decor.ts readBurrow and
//    burrowForSave; the pet, journal and settings are kept whole as parsed).
//    That covers additive changes: new decor, new fields, new ids.
// 2. Don't write over a newer save. Every save carries SAVE_SCHEMA. Bump it
//    when a change would make an older version get a save *wrong* even while
//    keeping unknowns: renaming or restructuring a field, changing what a value
//    means. A version that finds a save from a newer schema saves nothing and
//    asks for a reload (main.ts). Additive changes don't need a bump.
//
// A save that exists but can't be read is never treated as missing: that's
// how a fresh burrow or the adoption screen would end up saved over the real
// thing.

export const SAVE_SCHEMA = 1;

/**
 * All of a player's saves together, in bytes. The server (AppStorageService
 * TUPLE_MAX_BYTES) refuses any write that would take the total of every key
 * past it, with `storage/tuple-size-exceeded`: so a journal that fills the
 * room leaves no space for her own save, and every change to her bounces.
 *
 * The server is moving to 64 KB (the SDK's STORAGE_TOTAL_MAX_BYTES). Raise
 * this to match only once that's live: raised first, saves bounce again.
 */
export const STORAGE_TOTAL_BYTES = 16 * 1024;

/** A document's size as stored: UTF-8 bytes of its JSON, schema stamp included. */
export function savedBytes(doc: unknown): number {
  return new TextEncoder().encode(JSON.stringify(doc && typeof doc === 'object' ? { ...doc, schema: SAVE_SCHEMA } : doc)).length;
}

/** What reading a save found. `error`: storage couldn't be reached; `broken`: it's there but unreadable. */
export type Loaded<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'missing' }
  | { kind: 'newer'; schema: number }
  | { kind: 'broken' }
  | { kind: 'error' };

/** Read one save. `parse` returns null for something it can't use. Pure apart from `get`, for store.test.ts. */
export async function load<T>(get: (key: string) => Promise<string | null>, key: string, parse: (x: unknown) => T | null): Promise<Loaded<T>> {
  let raw: string | null;
  try {
    raw = await get(key);
  } catch {
    return { kind: 'error' };
  }
  if (!raw) return { kind: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'broken' };
  }
  const schema = (parsed as { schema?: unknown } | null)?.schema;
  if (typeof schema === 'number' && schema > SAVE_SCHEMA) return { kind: 'newer', schema };
  const value = parse(parsed);
  return value === null ? { kind: 'broken' } : { kind: 'ok', value };
}

const guarded = <T>(guard: (x: unknown) => x is T) => (x: unknown): T | null => (guard(x) ? x : null);
const getter = (OR: OddsRabbitGlobal) => (key: string) => OR.storage.get(key);

export const loadPet = (OR: OddsRabbitGlobal): Promise<Loaded<PetState>> => load(getter(OR), KEYS.pet, guarded(isPetState));
export const loadBurrow = (OR: OddsRabbitGlobal): Promise<Loaded<BurrowState>> => load(getter(OR), KEYS.burrow, readBurrow);
export const loadJournal = (OR: OddsRabbitGlobal): Promise<Loaded<Journal>> => load(getter(OR), KEYS.journal, guarded(isJournal));
export const loadSettings = (OR: OddsRabbitGlobal): Promise<Loaded<Settings>> => load(getter(OR), KEYS.settings, guarded(isSettings));

/** Starting over: delete her, her burrow and her journal. Settings stay. */
export async function deleteGame(OR: OddsRabbitGlobal): Promise<void> {
  await Promise.all([KEYS.pet, KEYS.burrow, KEYS.journal].map((k) => OR.storage.delete(k)));
}

/**
 * Checked before each batch is written, with the documents about to be
 * written, by key. Returns the documents to write (it may swap some, say for
 * a copy merged with what's stored), or null to write none of them and drop
 * anything queued: another device has written since (see main.ts). The whole
 * batch at once, so a purchase can't land half from each device.
 */
export type BatchGuard = (docs: Map<string, unknown>) => Promise<Map<string, unknown> | null>;

/** How long before a failed write is tried again: doubling from 5s up to a minute. */
const RETRY_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
/**
 * Failures in a row before the player hears about it: a write that fails as
 * the app wakes (the connection or sign-in still coming back) nearly always
 * goes through on a retry, so only one still failing after about a minute
 * and a quarter of retries (5 + 10 + 20 + 40 s) is worth a word.
 */
const QUIET_FAILURES = 4;

/**
 * How long one step of a batch (the guard's reads, or one write) may take
 * before it counts as failed and is retried. Nothing below the saver times a
 * request out, and batches go one after another, so a single request that
 * never answers would otherwise stop every save after it, silently: all of
 * it gone on the next launch.
 */
const STEP_TIMEOUT_MS = 30_000;

function timeLimit<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Storage did not answer')), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Coalesced writer: many changes in a burst become one write per key, and at
 * most one batch is in flight. `flush()` sends anything pending now (on pause
 * / pagehide). A write that fails is queued again, unless something newer for
 * that key has been queued since, and retried after a pause (so is one that
 * doesn't answer within `timeoutMs`); `onError` is told once per run of failures.
 */
export class Saver {
  private pending = new Map<string, () => unknown>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = Promise.resolve();
  private frozen = false;
  private held = false;
  private failures = 0;

  constructor(
    private readonly OR: Pick<OddsRabbitGlobal, 'storage'>,
    private readonly onError: (e: unknown) => void,
    private readonly guard?: BatchGuard,
    private readonly timeoutMs = STEP_TIMEOUT_MS,
  ) {}

  queue(key: string, snapshot: () => unknown): void {
    if (this.frozen) return;
    this.pending.set(key, snapshot);
    this.schedule(700);
  }

  /** Forget unsent writes (starting over), after any in flight have landed. */
  drop(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.pending.clear();
    this.failures = 0;
    return this.inflight;
  }

  /** Write nothing until `release()`: queued writes wait (main.ts, while the clock is unsure). */
  hold(): void {
    this.held = true;
  }

  release(): void {
    this.held = false;
    if (this.pending.size) this.schedule(0);
  }

  /** Never write again (a newer version has saved: see the top of this file). */
  freeze(): void {
    this.frozen = true;
    void this.drop();
  }

  flush(): Promise<void> {
    if (this.frozen || this.held) return this.inflight;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batch = [...this.pending.entries()];
    this.pending.clear();
    if (!batch.length) return this.inflight;
    this.inflight = this.inflight.then(async () => {
      let failed: unknown = null;
      // try again later, unless a newer write for that key is already waiting
      const retry = (key: string) => {
        const snap = batch.find(([k]) => k === key)![1];
        if (!this.frozen && !this.pending.has(key)) this.pending.set(key, snap);
      };
      let docs: Map<string, unknown>;
      try {
        docs = new Map(batch.map(([k, snap]) => [k, snap()]));
        if (this.guard) {
          const ok = await timeLimit(this.guard(docs), this.timeoutMs);
          if (!ok) { void this.drop(); return; }
          docs = ok;
        }
      } catch (e) {
        failed = e;
        docs = new Map();
        for (const [k] of batch) retry(k);
      }
      // in order, and none after a failed one: the guard orders the batch so
      // that stopping part way never leaves a purchase paid for but not had
      for (const [key, doc] of docs) {
        if (failed !== null) { retry(key); continue; }
        try {
          // every save says which schema wrote it
          await timeLimit(this.OR.storage.set(key, JSON.stringify(doc && typeof doc === 'object' ? { ...doc, schema: SAVE_SCHEMA } : doc)), this.timeoutMs);
        } catch (e) {
          failed = e;
          retry(key);
        }
      }
      if (failed === null) { this.failures = 0; return; }
      if (this.failures === QUIET_FAILURES - 1) this.onError(failed);
      this.schedule(RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)]!);
      this.failures++;
    });
    return this.inflight;
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }
}
