// Systems that hang off the pet state: the garden and its upgrades, what she
// finds while you're away, her wardrobe, her toys and vacation
// mode. Pure functions over PetState, tested in extras.test.ts.

import { roll } from './rng';
import { bondLevel, earn } from './economy';
import { COLLECTIBLES, EVENT_SHARE, RARE_SHARE, type Collectible } from './collectibles';
import type { PetState } from './sim';
import { MEADOW, CAN_SPEED, DAY_MS, HOUR_MS, SOIL, SPROUT_CLOVER } from './tuning';

// ---------------------------------------------------------------- garden

export type CropId = 'berry' | 'golden' | 'sprout';
export interface Plot { crop: CropId; plantedAtMs: number; readyAtMs: number }

export const CROPS: Record<CropId, { name: string; seedCost: number; growMs: number; yields: string }> = {
  berry: { name: 'Strawberries', seedCost: 4, growMs: 8 * HOUR_MS, yields: '2 strawberries' },
  golden: { name: 'Golden carrot', seedCost: 8, growMs: 12 * HOUR_MS, yields: '1 golden carrot' },
  sprout: { name: 'Clover sprouts', seedCost: 2, growMs: 4 * HOUR_MS, yields: 'clover' },
};

// ---------------------------------------------------------------- garden upgrades

export type UpgradeId = 'plot2' | 'plot3' | 'plot4' | 'plot5' | 'can' | 'meadow';
export interface Upgrade {
  id: UpgradeId;
  name: string;
  price: number;
  what: string;
  /** Shown locked until met. */
  requires?: { upgrade?: UpgradeId; soil?: number };
}
export const UPGRADES: Upgrade[] = [
  { id: 'plot2', name: 'Second garden plot', price: 300, what: 'One more plot to grow in.' },
  { id: 'plot3', name: 'Third garden plot', price: 600, what: 'One more plot to grow in.', requires: { upgrade: 'plot2' } },
  { id: 'can', name: 'Watering can', price: 1000, what: 'Crops grow 25% faster.' },
  { id: 'plot4', name: 'Fourth garden plot', price: 2000, what: 'One more plot to grow in.', requires: { upgrade: 'plot3', soil: 3 } },
  { id: 'plot5', name: 'Fifth garden plot', price: 5000, what: 'One more plot to grow in.', requires: { upgrade: 'plot4', soil: 5 } },
  { id: 'meadow', name: 'Meadow gate', price: MEADOW.gate, what: 'Opens the meadow: outdoor decor, some of which helps the yard.' },
];
export const upgradeById = (id: string): Upgrade | undefined => UPGRADES.find((u) => u.id === id);

export const hasUpgrade = (s: PetState, id: UpgradeId): boolean => (s.upgrades ?? []).includes(id);
export const soilLevel = (s: PetState): number => s.soilLevel ?? 0;
/** Richer soil: each level 1.8× the price of the last, up to SOIL.maxLevel. */
export const soilPrice = (s: PetState): number => Math.round(SOIL.basePrice * SOIL.growth ** soilLevel(s));
export const soilMaxed = (s: PetState): boolean => soilLevel(s) >= SOIL.maxLevel;

/** What a harvest of this crop brings at her soil level: strawberries or golden carrots (sprouts pay clover: sproutClover). */
export function cropYield(s: PetState, crop: 'berry' | 'golden', level = soilLevel(s)): number {
  if (crop === 'berry') return 2 + SOIL.berryAt.filter((l) => level >= l).length;
  return level >= SOIL.goldenAt ? 2 : 1;
}
/** Clover from one sprout harvest. Flat: the clover rate doesn't touch it. */
export const sproutClover = (s: PetState): number => SPROUT_CLOVER + SOIL.perLevel * soilLevel(s);

export function upgradeUnlocked(s: PetState, u: Upgrade): boolean {
  const r = u.requires;
  return !r || ((!r.upgrade || hasUpgrade(s, r.upgrade)) && soilLevel(s) >= (r.soil ?? 0));
}

export function buyUpgrade(s: PetState, id: UpgradeId | 'soil'): { ok: true; state: PetState } | { ok: false; reason: 'owned' | 'locked' | 'broke' | 'unknown' } {
  if (id === 'soil') {
    if (soilMaxed(s)) return { ok: false, reason: 'owned' };
    const price = soilPrice(s);
    if (s.clover < price) return { ok: false, reason: 'broke' };
    const state = clone(s);
    state.clover -= price;
    state.soilLevel = soilLevel(s) + 1;
    return { ok: true, state };
  }
  const u = upgradeById(id);
  if (!u) return { ok: false, reason: 'unknown' };
  if (hasUpgrade(s, id)) return { ok: false, reason: 'owned' };
  if (!upgradeUnlocked(s, u)) return { ok: false, reason: 'locked' };
  if (s.clover < u.price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= u.price;
  state.upgrades = [...(s.upgrades ?? []), id];
  return { ok: true, state };
}

/** She starts with one plot; the rest are bought. */
export function plotCount(s: PetState): number {
  return 1 + (['plot2', 'plot3', 'plot4', 'plot5'] as UpgradeId[]).filter((id) => hasUpgrade(s, id)).length;
}

export function plots(s: PetState): (Plot | null)[] {
  const p = s.garden?.plots ?? [];
  return Array.from({ length: plotCount(s) }, (_, i) => p[i] ?? null);
}

export function growMs(s: PetState, crop: CropId): number {
  return Math.round(CROPS[crop].growMs / (hasUpgrade(s, 'can') ? CAN_SPEED : 1));
}

export function plant(s: PetState, index: number, crop: CropId, nowMs: number): { ok: true; state: PetState } | { ok: false; reason: 'busy' | 'broke' | 'noPlot' } {
  const ps = plots(s);
  if (index < 0 || index >= ps.length) return { ok: false, reason: 'noPlot' };
  if (ps[index]) return { ok: false, reason: 'busy' };
  const c = CROPS[crop];
  if (s.clover < c.seedCost) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= c.seedCost;
  const next = plots(state);
  next[index] = { crop, plantedAtMs: nowMs, readyAtMs: nowMs + growMs(s, crop) };
  state.garden = { plots: next };
  return { ok: true, state };
}

export function harvest(s: PetState, index: number, nowMs: number): { ok: true; state: PetState; crop: CropId; clover: number } | { ok: false; reason: 'empty' | 'growing' } {
  const p = plots(s)[index];
  if (!p) return { ok: false, reason: 'empty' };
  if (p.readyAtMs > nowMs) return { ok: false, reason: 'growing' };
  const state = clone(s);
  const pantry = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
  if (p.crop === 'berry') pantry.berries += cropYield(s, 'berry');
  if (p.crop === 'golden') pantry.golden += cropYield(s, 'golden');
  const clover = p.crop === 'sprout' ? earn(state, 'harvest', sproutClover(state)) : 0;
  state.pantry = pantry;
  const next = plots(state);
  next[index] = null;
  state.garden = { plots: next };
  return { ok: true, state, crop: p.crop, clover };
}

/** Growth stage for drawing: 0 seed, 1 sprout, 2 growing, 3 ready. */
export function stage(p: Plot, nowMs: number): 0 | 1 | 2 | 3 {
  if (nowMs >= p.readyAtMs) return 3;
  const t = (nowMs - p.plantedAtMs) / (p.readyAtMs - p.plantedAtMs);
  return t < 0.25 ? 0 : t < 0.65 ? 1 : 2;
}

// ---------------------------------------------------------------- finds

export { COLLECTIBLES, RARE_SHARE, type Collectible } from './collectibles';

/**
 * Which collectible a find is, seeded like everything else that happens away.
 * While an event runs, most finds are that event's (`eventFinds`).
 */
export function pickFind(petId: string, stepIndex: number, eventFinds: string[] = []): Collectible {
  const common = COLLECTIBLES.filter((c) => c.rarity === 'common');
  const rare = COLLECTIBLES.filter((c) => c.rarity === 'rare');
  const seasonal = COLLECTIBLES.filter((c) => eventFinds.includes(c.id));
  const pool = seasonal.length && roll(petId, stepIndex, 'event') < EVENT_SHARE ? seasonal
    : roll(petId, stepIndex, 'rare') < RARE_SHARE ? rare : common;
  return pool[Math.floor(roll(petId, stepIndex, 'which') * pool.length)] ?? common[0]!;
}

// ---------------------------------------------------------------- wardrobe

export type Slot = 'head' | 'neck';
export interface Outfit {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  /** Sold only during a seasonal event (world.ts EVENTS). */
  limited?: boolean;
  /** Only ever given (an event's free item), never sold. */
  giftOnly?: boolean;
  /** Bond level needed to buy it. */
  bond?: number;
}
/**
 * Outfits are for saving up: a few days' clover each, a week or more for the
 * seasonal ones. The bandana stays cheap so the first-day "dress her" goal
 * is reachable from the starting clover.
 */
export const OUTFITS: Outfit[] = [
  { id: 'bandana', name: 'Bandana', slot: 'neck', price: 40 },
  { id: 'bow', name: 'Ribbon bow', slot: 'head', price: 250 },
  { id: 'bell', name: 'Bell collar', slot: 'neck', price: 300 },
  { id: 'beanie', name: 'Knit beanie', slot: 'head', price: 450 },
  { id: 'crown', name: 'Tiny crown', slot: 'head', price: 10000, bond: 10 },
  // seasonal
  { id: 'earmuffs', name: 'Earmuffs', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'flowercrown', name: 'Flower crown', slot: 'head', price: 800, limited: true },
  { id: 'daisychain', name: 'Daisy chain', slot: 'neck', price: 0, limited: true, giftOnly: true },
  { id: 'strawhat', name: 'Straw hat', slot: 'head', price: 800, limited: true },
  { id: 'acorncap', name: 'Acorn cap', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'witchhat', name: 'Little witch hat', slot: 'head', price: 900, limited: true },
  { id: 'redscarf', name: 'Cozy scarf', slot: 'neck', price: 0, limited: true, giftOnly: true },
  // festival raffle prizes: only ever won (raffle.ts)
  { id: 'flakeclip', name: 'Snowflake clip', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'beeclip', name: 'Bumblebee clip', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'lei', name: 'Flower lei', slot: 'neck', price: 0, limited: true, giftOnly: true },
  { id: 'leafclip', name: 'Maple leaf clip', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'batclip', name: 'Little bat clip', slot: 'head', price: 0, limited: true, giftOnly: true },
  { id: 'startopper', name: 'Star topper', slot: 'head', price: 0, limited: true, giftOnly: true },
];
export const outfitById = (id: string): Outfit | undefined => OUTFITS.find((o) => o.id === id);

export function wardrobe(s: PetState): { owned: string[]; head: string | null; neck: string | null } {
  return { owned: [], head: null, neck: null, ...(s.wardrobe ?? {}) };
}

export function buyOutfit(s: PetState, id: string): { ok: true; state: PetState } | { ok: false; reason: 'owned' | 'broke' | 'unknown' | 'locked' } {
  const o = outfitById(id);
  if (!o || o.giftOnly) return { ok: false, reason: 'unknown' };
  const w = wardrobe(s);
  if (w.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (o.bond && bondLevel(s.bond).level < o.bond) return { ok: false, reason: 'locked' };
  if (s.clover < o.price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= o.price;
  state.wardrobe = { ...w, owned: [...w.owned, id], [o.slot]: id };
  return { ok: true, state };
}

/** A free outfit (an event gift): owned, not worn. The player chooses to put it on. */
export function giveOutfit(s: PetState, id: string): PetState {
  const o = outfitById(id);
  const w = wardrobe(s);
  if (!o || w.owned.includes(id)) return s;
  const state = clone(s);
  state.wardrobe = { ...w, owned: [...w.owned, id] };
  return state;
}

/** Put on an owned outfit, or take off whatever is in that slot (id null). */
export function wear(s: PetState, slot: Slot, id: string | null): PetState {
  const w = wardrobe(s);
  if (id && !w.owned.includes(id)) return s;
  const state = clone(s);
  state.wardrobe = { ...w, [slot]: id };
  return state;
}

// ---------------------------------------------------------------- toys

/** Toy play (sim.ts act 'play'): no score, no limit. She starts with the ball. */
export interface Toy { id: string; name: string; price: number; /** Shown locked until this toy is owned. */ after?: string }
export const TOYS: Toy[] = [
  { id: 'ball', name: 'Ball', price: 0 },
  { id: 'yarn', name: 'Yarn ball', price: 50 },
  { id: 'box', name: 'Cardboard box', price: 80 },
  { id: 'tunnel', name: 'Tunnel', price: 150 },
  { id: 'swing', name: 'Rope swing', price: 250 },
  // long-term goals
  { id: 'ballpit', name: 'Ball pit', price: 400, after: 'swing' },
  { id: 'maze', name: 'Hay bale maze', price: 700, after: 'ballpit' },
  { id: 'kite', name: 'Kite', price: 1000, after: 'maze' },
];
export const toyById = (id: string): Toy | undefined => TOYS.find((t) => t.id === id);

export function ownsToy(s: PetState, id: string): boolean {
  return id === 'ball' || (s.toys ?? []).includes(id);
}

export function buyToy(s: PetState, id: string): { ok: true; state: PetState } | { ok: false; reason: 'owned' | 'broke' | 'unknown' | 'locked' } {
  const t = toyById(id);
  if (!t) return { ok: false, reason: 'unknown' };
  if (ownsToy(s, id)) return { ok: false, reason: 'owned' };
  if (t.after && !ownsToy(s, t.after)) return { ok: false, reason: 'locked' };
  if (s.clover < t.price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= t.price;
  state.toys = [...(s.toys ?? []), id];
  return { ok: true, state };
}

// ---------------------------------------------------------------- vacation

export const VACATION_CHOICES = [1, 3, 7, 14];

export function onVacation(s: PetState, nowMs: number): boolean {
  return !!s.vacationUntilMs && s.vacationUntilMs > nowMs;
}

export function startVacation(s: PetState, days: number, nowMs: number): PetState {
  const state = clone(s);
  state.vacationUntilMs = nowMs + Math.max(1, Math.min(14, days)) * DAY_MS;
  return state;
}

export function endVacation(s: PetState): PetState {
  const state = clone(s);
  state.vacationUntilMs = null;
  return state;
}

function clone(s: PetState): PetState {
  return JSON.parse(JSON.stringify(s)) as PetState;
}
