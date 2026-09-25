// Friends: what a player shows their friends (and the home-screen widget), and
// the small daily gifts between them. Pure: main.ts does the calls.
//
// The showcase is a snapshot published through OR.showcase.publish. Friends'
// snapshots are someone else's data: everything read back is checked and
// clamped here before it's drawn, and unknown ids are dropped.

import { bondLevel, COATS, earsOf, timer, type Coat, type Ears, type Needs, type PetState } from './sim';
import { byId, type BurrowState } from './decor';
import { outfitById } from './extras';
import type { Trait } from './world';
import { TRAITS, traitOf } from './world';

/** Widget and friends' view of a rabbit. Field names are a contract with the widget; add, don't rename. */
export interface ShowcaseData {
  v: 1;
  name: string;
  coat: Coat;
  /** Missing from snapshots published before the ear choice; read as long. */
  ears: Ears;
  needs: Needs;
  simAtMs: number;
  napEndsAtMs: number | null;
  vacationUntilMs: number | null;
  daysVisited: number;
  bondLevel: number;
  trait: Trait;
  head: string | null;
  neck: string | null;
  marking: string | null;
  /** Placed decor, where it sits. */
  items: { id: string; x: number; y: number; flip: boolean }[];
}

const MAX_ITEMS = 40;

export function buildShowcase(pet: PetState, burrow: BurrowState): ShowcaseData {
  const nap = timer(pet, 'nap');
  const round = (n: number) => Math.round(n);
  return {
    v: 1,
    name: pet.name,
    coat: pet.coat,
    ears: earsOf(pet),
    needs: { hunger: round(pet.needs.hunger), happy: round(pet.needs.happy), energy: round(pet.needs.energy), clean: round(pet.needs.clean) },
    simAtMs: pet.simAtMs,
    napEndsAtMs: nap ? nap.endsAtMs : null,
    vacationUntilMs: pet.vacationUntilMs ?? null,
    daysVisited: pet.daysVisited,
    bondLevel: bondLevel(pet.bond).level,
    trait: traitOf(pet.petId),
    head: pet.wardrobe?.head ?? null,
    neck: pet.wardrobe?.neck ?? null,
    marking: pet.marking ?? null,
    items: burrow.items.filter((i) => i.placed).slice(0, MAX_ITEMS).map((i) => ({ id: i.id, x: i.x, y: i.y, flip: i.flip })),
  };
}

/**
 * What changed enough to publish again: everything a friend would see, but
 * not the needs, which drift every ten minutes (a periodic publish covers
 * those, for the widget).
 */
export function showcaseSignature(d: ShowcaseData): string {
  const { needs: _n, simAtMs: _s, ...rest } = d;
  return JSON.stringify(rest);
}

const num = (x: unknown, lo: number, hi: number, dflt: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt;
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : null);

/** A friend's snapshot, checked. Null if it isn't a Rabbit Pets rabbit at all. */
export function readShowcase(raw: unknown): ShowcaseData | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.v !== 1) return null;
  const name = str(d.name, 16);
  const coat = (COATS as readonly string[]).includes(d.coat as string) ? (d.coat as Coat) : null;
  if (!name || !coat) return null;
  const n = (d.needs ?? {}) as Record<string, unknown>;
  const outfit = (id: unknown) => (typeof id === 'string' && outfitById(id) ? id : null);
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    v: 1,
    name,
    coat,
    ears: earsOf(d),
    needs: { hunger: num(n.hunger, 0, 100, 70), happy: num(n.happy, 0, 100, 70), energy: num(n.energy, 0, 100, 70), clean: num(n.clean, 0, 100, 70) },
    simAtMs: num(d.simAtMs, 0, 8.64e15, 0),
    napEndsAtMs: d.napEndsAtMs == null ? null : num(d.napEndsAtMs, 0, 8.64e15, 0),
    vacationUntilMs: d.vacationUntilMs == null ? null : num(d.vacationUntilMs, 0, 8.64e15, 0),
    daysVisited: Math.round(num(d.daysVisited, 1, 100_000, 1)),
    bondLevel: Math.round(num(d.bondLevel, 1, 99, 1)),
    trait: (TRAITS as string[]).includes(d.trait as string) ? (d.trait as Trait) : 'playful',
    head: outfit(d.head),
    neck: outfit(d.neck),
    marking: ['freckles', 'heart', 'tuft'].includes(d.marking as string) ? (d.marking as string) : null,
    items: items.slice(0, MAX_ITEMS).flatMap((i: unknown) => {
      const it = i as Record<string, unknown>;
      if (!it || typeof it.id !== 'string' || !byId(it.id)) return [];
      return [{ id: it.id, x: num(it.x, 0, 98, 49), y: num(it.y, 0, 118, 100), flip: it.flip === true }];
    }),
  };
}

// ---------------------------------------------------------------- gifts

export type GiftKind = 'clover' | 'berry' | 'hug';
export const GIFT_KINDS: GiftKind[] = ['clover', 'berry', 'hug'];

export const GIFT_INFO: Record<GiftKind, { name: string; art: string; gives: string }> = {
  clover: { name: 'A bundle of clover', art: 'clover', gives: '+5 clover' },
  berry: { name: 'A strawberry', art: 'strawberry', gives: 'for her pantry' },
  hug: { name: 'A warm hello', art: 'heart', gives: '+10 joy' },
};

/** Sending is free and earns the sender a little: the platform caps it at 10 a day. */
export const SEND_REWARD_CLOVER = 1;

/** Pay out a claimed gift. Unknown kinds (from a newer version) still give something. */
export function applyGift(s: PetState, kind: string): PetState {
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  if (kind === 'berry') {
    state.pantry = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
    state.pantry.berries += 1;
  } else if (kind === 'hug') {
    state.needs.happy = Math.min(100, state.needs.happy + 10);
  } else {
    state.clover += 5;
  }
  return state;
}
