// Saving to OR.storage. Three keys, each well under the 16 KB value cap:
//   v1:pet       the simulation state (needs, timers, bond, clover, gift)
//   v1:burrow    decor and where it sits
//   v1:settings  reminder choice and what's been scheduled
//   v1:journal   her journal (journal.ts), capped at 200 entries
//
// OR.storage is last-writer-wins with no compare-and-set. Each document
// carries a `rev` that only ever goes up; on returning to the page the game
// re-reads and adopts a higher rev from another device before replaying time,
// and because the simulation is deterministic, adopting and replaying can't
// change what already happened.

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
  /** Sound effects. Missing in saves from before sound existed, which means on. */
  sound?: boolean;
  /** Reminder key -> ISO fireAt last scheduled, to avoid re-sending the same one. */
  scheduled: Record<string, string>;
}

export function defaultSettings(): Settings {
  return { v: 1, rev: 0, reminders: null, scheduled: {}, sound: true };
}

function isSettings(x: unknown): x is Settings {
  const s = x as Settings;
  return !!s && s.v === 1 && typeof s.scheduled === 'object' && s.scheduled !== null;
}

async function read<T>(OR: OddsRabbitGlobal, key: string, guard: (x: unknown) => x is T): Promise<T | null> {
  try {
    const raw = await OR.storage.get(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadPet(OR: OddsRabbitGlobal): Promise<PetState | null> {
  return read(OR, KEYS.pet, isPetState);
}
export async function loadBurrow(OR: OddsRabbitGlobal): Promise<BurrowState | null> {
  try {
    const raw = await OR.storage.get(KEYS.burrow);
    return raw ? readBurrow(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function loadJournal(OR: OddsRabbitGlobal): Promise<Journal | null> {
  return read(OR, KEYS.journal, isJournal);
}
export function loadSettings(OR: OddsRabbitGlobal): Promise<Settings | null> {
  return read(OR, KEYS.settings, isSettings);
}

/**
 * Coalesced writer: many changes in a burst become one write per key, and at
 * most one write per key is in flight. `flush()` sends anything pending now
 * (on pause / pagehide).
 */
export class Saver {
  private pending = new Map<string, () => unknown>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = Promise.resolve();

  constructor(private readonly OR: OddsRabbitGlobal, private readonly onError: (e: unknown) => void) {}

  queue(key: string, snapshot: () => unknown): void {
    this.pending.set(key, snapshot);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  }

  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batch = [...this.pending.entries()];
    this.pending.clear();
    if (!batch.length) return this.inflight;
    this.inflight = this.inflight.then(async () => {
      for (const [key, snap] of batch) {
        try {
          await this.OR.storage.set(key, JSON.stringify(snap()));
        } catch (e) {
          this.onError(e);
        }
      }
    });
    return this.inflight;
  }
}
