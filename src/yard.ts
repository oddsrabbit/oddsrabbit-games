// The yard (docs/rabbit-pets-economy.md §2.6): buildings that produce clover
// every hour, whether or not the game is open. Clover piles up in storage,
// which holds 24 hours of output (36 and 48 with the shed), and is collected
// with a tap. Yard clover is flat: never boosted by the clover rate. Pure,
// tested in yard.test.ts.

import { byId } from './decor';
import { earn } from './economy';
import type { PetState } from './sim';
import { HOUR_MS, YARD_STORAGE_HOURS } from './tuning';

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
// each further one costs more. Capped (2026-10-06) where the last one still
// pays back in about four months: 6 patches, 3 hives, 2 logs. A save with
// more from before keeps them.
export const BUILDINGS: Record<BuildingId, Building> = {
  patch: { name: 'Clover patch', price: 84, perHour: 0.25, growth: 1.52, max: 6 },
  hive: { name: 'Beehive', price: 720, perHour: 1, growth: 1.93, max: 3, requires: { building: 'patch', count: 3 } },
  log: { name: 'Mushroom log', price: 2880, perHour: 2, growth: 1.99, max: 2, requires: { building: 'hive', count: 3 } },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
/** The most of each a yard can hold: the caps before 2026-10-06, which a save from then may have. */
export const MOST_EVER: Record<BuildingId, number> = { patch: 10, hive: 5, log: 5 };

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
  return BUILDING_IDS.reduce((sum, id) => sum + BUILDINGS[id].perHour * (y.counts[id] ?? 0), 0);
}

/** What the next one of a kind would make a day, and how many days until it has paid for itself. */
export function payback(s: PetState, id: BuildingId): { perDay: number; days: number } {
  const perDay = BUILDINGS[id].perHour * 24;
  return { perDay, days: Math.ceil(nextPrice(s, id) / perDay) };
}

/**
 * Note which pieces are out in the meadow (decor.ts meadowPieces), for
 * Getting started. A newer version's pieces, which this one can't see, are kept.
 */
export function setMeadow(s: PetState, pieces: string[]): PetState {
  const newer = (s.meadow ?? []).filter((id) => !byId(id));
  const next = [...new Set([...pieces, ...newer])].sort();
  if (JSON.stringify(next) === JSON.stringify([...(s.meadow ?? [])].sort())) return s;
  return { ...s, meadow: next };
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
