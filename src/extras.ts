// Update 1 systems that hang off the pet state: the garden, what she finds
// while you're away, her wardrobe, her marking, the mini-game's daily plays
// and vacation mode. Pure functions over PetState, tested in extras.test.ts.

import { dayKey } from './localtime';
import { roll } from './rng';
import type { PetState } from './sim';
import { DAY_ROLLOVER_HOUR, HOUR_MS, DAY_MS } from './tuning';

// ---------------------------------------------------------------- garden

export type CropId = 'berry' | 'golden' | 'sprout';
export interface Plot { crop: CropId; plantedAtMs: number; readyAtMs: number }

export const CROPS: Record<CropId, { name: string; seedCost: number; growMs: number; yields: string }> = {
  berry: { name: 'Strawberries', seedCost: 4, growMs: 8 * HOUR_MS, yields: '2 strawberries' },
  golden: { name: 'Golden carrot', seedCost: 8, growMs: 12 * HOUR_MS, yields: '1 golden carrot' },
  sprout: { name: 'Clover sprouts', seedCost: 2, growMs: 4 * HOUR_MS, yields: '6 clover' },
};
export const PLOTS = 3;

export function plots(s: PetState): (Plot | null)[] {
  const p = s.garden?.plots ?? [];
  return Array.from({ length: PLOTS }, (_, i) => p[i] ?? null);
}

export function plant(s: PetState, index: number, crop: CropId, nowMs: number): { ok: true; state: PetState } | { ok: false; reason: 'busy' | 'broke' } {
  const ps = plots(s);
  if (ps[index]) return { ok: false, reason: 'busy' };
  const c = CROPS[crop];
  if (s.clover < c.seedCost) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= c.seedCost;
  const next = plots(state);
  next[index] = { crop, plantedAtMs: nowMs, readyAtMs: nowMs + c.growMs };
  state.garden = { plots: next };
  return { ok: true, state };
}

export function harvest(s: PetState, index: number, nowMs: number): { ok: true; state: PetState; crop: CropId } | { ok: false; reason: 'empty' | 'growing' } {
  const p = plots(s)[index];
  if (!p) return { ok: false, reason: 'empty' };
  if (p.readyAtMs > nowMs) return { ok: false, reason: 'growing' };
  const state = clone(s);
  const pantry = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
  if (p.crop === 'berry') pantry.berries += 2;
  if (p.crop === 'golden') pantry.golden += 1;
  if (p.crop === 'sprout') state.clover += 6;
  state.pantry = pantry;
  const next = plots(state);
  next[index] = null;
  state.garden = { plots: next };
  return { ok: true, state, crop: p.crop };
}

/** Growth stage for drawing: 0 seed, 1 sprout, 2 growing, 3 ready. */
export function stage(p: Plot, nowMs: number): 0 | 1 | 2 | 3 {
  if (nowMs >= p.readyAtMs) return 3;
  const t = (nowMs - p.plantedAtMs) / (p.readyAtMs - p.plantedAtMs);
  return t < 0.25 ? 0 : t < 0.65 ? 1 : 2;
}

// ---------------------------------------------------------------- finds

export interface Collectible { id: string; name: string; rarity: 'common' | 'rare' }
export const COLLECTIBLES: Collectible[] = [
  { id: 'pebble', name: 'Shiny pebble', rarity: 'common' },
  { id: 'feather', name: 'Blue feather', rarity: 'common' },
  { id: 'acorn', name: 'Acorn', rarity: 'common' },
  { id: 'flower', name: 'Pressed flower', rarity: 'common' },
  { id: 'seaglass', name: 'Sea glass', rarity: 'common' },
  { id: 'shell', name: 'Snail shell', rarity: 'common' },
  { id: 'pinecone', name: 'Pine cone', rarity: 'common' },
  { id: 'button', name: 'Lost button', rarity: 'common' },
  { id: 'marble', name: 'Marble', rarity: 'rare' },
  { id: 'lucky', name: 'Four-leaf clover', rarity: 'rare' },
  { id: 'key', name: 'Tiny key', rarity: 'rare' },
  { id: 'star', name: 'Star stone', rarity: 'rare' },
];
/** Share of finds that are one of the rare ones. */
export const RARE_SHARE = 0.12;

/** Which collectible a find is, seeded like everything else that happens away. */
export function pickFind(petId: string, stepIndex: number): Collectible {
  const common = COLLECTIBLES.filter((c) => c.rarity === 'common');
  const rare = COLLECTIBLES.filter((c) => c.rarity === 'rare');
  const pool = roll(petId, stepIndex, 'rare') < RARE_SHARE ? rare : common;
  return pool[Math.floor(roll(petId, stepIndex, 'which') * pool.length)] ?? common[0]!;
}

// ---------------------------------------------------------------- wardrobe

export type Slot = 'head' | 'neck';
export interface Outfit { id: string; name: string; slot: Slot; price: number; limited?: boolean }
export const OUTFITS: Outfit[] = [
  { id: 'bow', name: 'Ribbon bow', slot: 'head', price: 30 },
  { id: 'beanie', name: 'Knit beanie', slot: 'head', price: 45 },
  { id: 'flowercrown', name: 'Flower crown', slot: 'head', price: 40, limited: true },
  { id: 'witchhat', name: 'Little witch hat', slot: 'head', price: 45, limited: true },
  { id: 'bandana', name: 'Bandana', slot: 'neck', price: 25 },
  { id: 'bell', name: 'Bell collar', slot: 'neck', price: 30 },
  { id: 'redscarf', name: 'Cozy scarf', slot: 'neck', price: 35, limited: true },
];
export const outfitById = (id: string): Outfit | undefined => OUTFITS.find((o) => o.id === id);

export function wardrobe(s: PetState): { owned: string[]; head: string | null; neck: string | null } {
  return { owned: [], head: null, neck: null, ...(s.wardrobe ?? {}) };
}

export function buyOutfit(s: PetState, id: string): { ok: true; state: PetState } | { ok: false; reason: 'owned' | 'broke' | 'unknown' } {
  const o = outfitById(id);
  if (!o) return { ok: false, reason: 'unknown' };
  const w = wardrobe(s);
  if (w.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (s.clover < o.price) return { ok: false, reason: 'broke' };
  const state = clone(s);
  state.clover -= o.price;
  state.wardrobe = { ...w, owned: [...w.owned, id], [o.slot]: id };
  return { ok: true, state };
}

/** A free outfit (an event gift): owned and worn, no charge. */
export function giveOutfit(s: PetState, id: string): PetState {
  const o = outfitById(id);
  const w = wardrobe(s);
  if (!o || w.owned.includes(id)) return s;
  const state = clone(s);
  state.wardrobe = { ...w, owned: [...w.owned, id], [o.slot]: id };
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

// ---------------------------------------------------------------- marking

export type Marking = 'freckles' | 'heart' | 'tuft';
export const MARKING_DAY = 7;
export const MARKING_INFO: Record<Marking, { name: string; why: string }> = {
  freckles: { name: 'Freckles', why: 'from all the good meals' },
  heart: { name: 'A heart', why: 'from all the cuddles' },
  tuft: { name: 'A fluffy tuft', why: 'from all the grooming' },
};

/**
 * On her seventh day together she gains a permanent marking shaped by how
 * she's been looked after. Returns null until then, or once she has one.
 */
export function earnMarking(s: PetState): Marking | null {
  if (s.marking || s.daysVisited < MARKING_DAY) return null;
  const c = { fed: 0, pet: 0, clean: 0, ...(s.careCounts ?? {}) };
  if (c.fed >= c.pet && c.fed >= c.clean) return 'freckles';
  if (c.pet >= c.clean) return 'heart';
  return 'tuft';
}

// ---------------------------------------------------------------- mini-game

export const PLAYS_PER_DAY = 3;
export function playsLeft(s: PetState, nowMs: number, tz: string): number {
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  return s.plays?.day === today ? Math.max(0, PLAYS_PER_DAY - s.plays.count) : PLAYS_PER_DAY;
}

/** Clover for a round of carrot catch, and a little joy for playing at all. */
export function playReward(caught: number): { clover: number; happy: number } {
  return { clover: Math.min(10, Math.floor(caught / 2)), happy: 10 };
}

export function recordPlay(s: PetState, caught: number, nowMs: number, tz: string): { ok: true; state: PetState; clover: number } | { ok: false; reason: 'noPlays' } {
  if (playsLeft(s, nowMs, tz) <= 0) return { ok: false, reason: 'noPlays' };
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  const state = clone(s);
  state.plays = { day: today, count: (s.plays?.day === today ? s.plays.count : 0) + 1 };
  const r = playReward(caught);
  state.clover += r.clover;
  state.needs.happy = Math.min(100, state.needs.happy + r.happy);
  state.needs.energy = Math.max(0, state.needs.energy - 5);
  return { ok: true, state, clover: r.clover };
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
