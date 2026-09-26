// The yard (docs/rabbit-pets-economy.md §2.6): buildings that produce clover
// every hour, whether or not the game is open. Clover piles up in storage,
// which holds 24 hours of output (36 and 48 with the shed), and is collected
// with a tap. Yard clover is flat: never boosted by the clover rate. Pure,
// tested in yard.test.ts.

import { byId } from './decor';
import { earn } from './economy';
import type { PetState } from './sim';
import { HOUR_MS, MEADOW, YARD_STORAGE_HOURS } from './tuning';

export type BuildingId = 'patch' | 'hive' | 'log';

export interface Building {
  name: string;
  /** The first one; each extra costs `growth` times the last. */
  price: number;
  perHour: number;
  growth: number;
  max: number;
  /** Shown locked until this is true. */
  requires?: { building: BuildingId; count: number };
}

// Front-loaded (docs/rabbit-pets-economy.md §2.6): the first of each kind
// pays for itself fast (a patch in 14 days, a hive in 30, a log in 60), and
// each further one costs more, so the last few are long-term goals. A whole
// set costs about what it did before (10.5k, 20k and 88k).
export const BUILDINGS: Record<BuildingId, Building> = {
  patch: { name: 'Clover patch', price: 84, perHour: 0.25, growth: 1.52, max: 10 },
  hive: { name: 'Beehive', price: 720, perHour: 1, growth: 1.93, max: 5, requires: { building: 'patch', count: 3 } },
  log: { name: 'Mushroom log', price: 2880, perHour: 2, growth: 1.99, max: 5, requires: { building: 'hive', count: 5 } },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** The shed, bought up to twice: each stretches storage (YARD_STORAGE_HOURS). */
export const SHED_PRICES = [1000, 3000] as const;
export const SHED_REQUIRES = { building: 'patch' as BuildingId, count: 3 };

export interface YardState {
  counts: Partial<Record<BuildingId, number>>;
  sheds: number;
  /** Clover waiting to be collected, fractional. */
  stored: number;
  /** When `stored` was last brought up to date. Null before the first building. */
  atMs: number | null;
}

export function yardOf(s: PetState): YardState {
  return { counts: {}, sheds: 0, stored: 0, atMs: null, ...(s.yard ?? {}) };
}

export const countOf = (s: PetState, id: BuildingId): number => yardOf(s).counts[id] ?? 0;

export function perHour(s: PetState): number {
  const y = yardOf(s);
  return BUILDING_IDS.reduce((sum, id) => sum + BUILDINGS[id].perHour * (1 + meadowShare(s, id)) * (y.counts[id] ?? 0), 0);
}

/**
 * How much the meadow adds to each building of a kind, as a share of its own
 * output: MEADOW.boost for each helping piece out in the meadow, each piece
 * counted once. A per-building amount, so it's flat like the rest of the yard.
 */
export function meadowShare(s: PetState, id: BuildingId): number {
  return [...new Set(s.meadow ?? [])].filter((m) => byId(m)?.boost === id).length * MEADOW.boost;
}

/** Clover a day the meadow adds to one building of a kind, for the yard's line. */
export const meadowPerDay = (s: PetState, id: BuildingId): number => BUILDINGS[id].perHour * 24 * meadowShare(s, id);

/** What the next one of a kind would make a day (with the meadow's help), and how many days until it has paid for itself. */
export function payback(s: PetState, id: BuildingId): { perDay: number; days: number } {
  const perDay = BUILDINGS[id].perHour * 24 * (1 + meadowShare(s, id));
  return { perDay, days: Math.ceil(nextPrice(s, id) / perDay) };
}

/**
 * Set which helping pieces are out in the meadow (decor.ts meadowHelpers),
 * after something was placed or put away. Storage fills at the old rate up to
 * now and the new rate from now, as when a building is bought.
 */
export function setMeadow(s: PetState, helpers: string[], nowMs: number): PetState {
  // a newer version's helping pieces aren't in `helpers` (this version can't see them); keep them
  const newer = (s.meadow ?? []).filter((id) => !byId(id));
  const next = [...new Set([...helpers, ...newer])].sort();
  if (JSON.stringify(next) === JSON.stringify([...(s.meadow ?? [])].sort())) return s;
  const state = clone(s);
  accrue(state, nowMs);
  state.meadow = next;
  return state;
}

export function storageHours(s: PetState): number {
  return YARD_STORAGE_HOURS[Math.min(yardOf(s).sheds, YARD_STORAGE_HOURS.length - 1)]!;
}

export function capacity(s: PetState): number {
  return perHour(s) * storageHours(s);
}

/** Clover in storage at `nowMs`, without changing anything. */
export function stored(s: PetState, nowMs: number): number {
  const y = yardOf(s);
  if (y.atMs === null || nowMs <= y.atMs) return y.stored;
  return Math.min(capacity(s), y.stored + perHour(s) * (nowMs - y.atMs) / HOUR_MS);
}

/** Bring storage up to `nowMs`. A clock that went backwards changes nothing. */
function accrue(state: PetState, nowMs: number): void {
  const y = yardOf(state);
  const atMs = y.atMs === null ? nowMs : Math.max(y.atMs, nowMs);
  state.yard = { ...y, stored: stored(state, nowMs), atMs };
}

export function nextPrice(s: PetState, id: BuildingId): number {
  const b = BUILDINGS[id];
  return Math.round(b.price * b.growth ** countOf(s, id));
}

export function unlocked(s: PetState, id: BuildingId): boolean {
  const r = BUILDINGS[id].requires;
  return !r || countOf(s, r.building) >= r.count;
}

export type YardRefusal = 'max' | 'locked' | 'broke';

export function buyBuilding(s: PetState, id: BuildingId, nowMs: number): { ok: true; state: PetState } | { ok: false; reason: YardRefusal } {
  if (countOf(s, id) >= BUILDINGS[id].max) return { ok: false, reason: 'max' };
  if (!unlocked(s, id)) return { ok: false, reason: 'locked' };
  const price = nextPrice(s, id);
  if (s.clover < price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= price;
  return { ok: true, state: add(state, id, nowMs) };
}

/** A free building (the starter week's patch). */
export function giveBuilding(s: PetState, id: BuildingId, nowMs: number): PetState {
  if (countOf(s, id) >= BUILDINGS[id].max) return s;
  return add(clone(s), id, nowMs);
}

function add(state: PetState, id: BuildingId, nowMs: number): PetState {
  // Storage fills at the old rate up to now, the new rate from now.
  accrue(state, nowMs);
  const y = yardOf(state);
  state.yard = { ...y, counts: { ...y.counts, [id]: (y.counts[id] ?? 0) + 1 } };
  return state;
}

export function shedPrice(s: PetState): number | null {
  return SHED_PRICES[yardOf(s).sheds] ?? null;
}

export function buyShed(s: PetState, nowMs: number): { ok: true; state: PetState } | { ok: false; reason: YardRefusal } {
  const price = shedPrice(s);
  if (price === null) return { ok: false, reason: 'max' };
  if (countOf(s, SHED_REQUIRES.building) < SHED_REQUIRES.count) return { ok: false, reason: 'locked' };
  if (s.clover < price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= price;
  accrue(state, nowMs);
  const y = yardOf(state);
  state.yard = { ...y, sheds: y.sheds + 1 };
  return { ok: true, state };
}

/** Collect the whole clover in storage; fractions stay for next time. */
export function collect(s: PetState, nowMs: number): { state: PetState; clover: number } {
  const state = clone(s);
  accrue(state, nowMs);
  const y = yardOf(state);
  const whole = Math.floor(y.stored);
  state.yard = { ...y, stored: y.stored - whole };
  return { state, clover: earn(state, 'yard', whole) };
}

function clone(s: PetState): PetState {
  return JSON.parse(JSON.stringify(s)) as PetState;
}
