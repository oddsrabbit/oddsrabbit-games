// The whole simulation, pure: no DOM, no SDK, no Date.now(). Time always comes
// in as an argument, so catch-up after an absence and the live game are the
// same code, and every rule here is testable (sim.test.ts).

import { dayKey, localHour } from './localtime';
import { roll } from './rng';
import { SHY_WARM_BOND, TRAIT_MODS, traitOf } from './world';
import { earnMarking, onVacation, pickFind, type Marking, type Plot } from './extras';
import {
  BEDTIME_HOUR,
  BOND_DAILY_CAP,
  BOND_LEVELS,
  BOND_PER_CARE,
  BOND_PER_DAY_VISITED,
  CARE,
  CLOVER,
  FOOD_REACTIONS,
  FOODS,
  LOVES_BONUS_HAPPY,
  DAY_ROLLOVER_HOUR,
  DECAY_ASLEEP,
  DECAY_AWAKE,
  LOW_NEED,
  MAX_CATCH_UP_MS,
  MAX_TREATS,
  PEBBLE_CHANCE,
  STEP_MS,
  TIMERS,
  WAKE_HOUR,
} from './tuning';

export const COATS = ['snow', 'cream', 'cocoa', 'silver', 'midnight', 'ginger'] as const;
export type Coat = (typeof COATS)[number];
export const EARS = ['short', 'long', 'lop'] as const;
export type Ears = (typeof EARS)[number];

export interface Needs {
  hunger: number;
  happy: number;
  energy: number;
  clean: number;
}
export type NeedKey = keyof Needs;

export type TimerKind = keyof typeof TIMERS;
export interface Timer {
  kind: TimerKind;
  startedAtMs: number;
  endsAtMs: number;
}

export interface PetState {
  v: 1;
  petId: string;
  name: string;
  coat: Coat;
  bornAtMs: number;
  /** Time of the last simulated 10-minute step. Only ever moves forward. */
  simAtMs: number;
  /** Total steps simulated; keys the seeded randomness. */
  stepIndex: number;
  /** Bumped on every save, so two devices can tell whose copy is newer. */
  rev: number;
  needs: Needs;
  bond: number;
  bondToday: number;
  bondDay: string;
  daysVisited: number;
  lastVisitDay: string | null;
  timers: Timer[];
  treats: number;
  /** Meals eaten, to key each meal's reaction roll. Missing in older saves. */
  meals?: number;
  clover: number;
  gift: { lastClaimDay: string | null; streak: number };
  /** Kept for saves from when a daily visitor brought gifts; unused for now. */
  visitorsClaimed: string[];
  // ---- Update 1. All optional: saves from before them simply lack the field.
  /** How often she's been fed, petted and cleaned; shapes her marking. */
  careCounts?: { fed: number; pet: number; clean: number };
  /** Earned on her seventh day together; permanent. */
  marking?: Marking | null;
  /** Things she found while you were away: id -> count. */
  collection?: Record<string, number>;
  garden?: { plots: (Plot | null)[] };
  /** Garden produce waiting to be eaten. */
  pantry?: { berries: number; golden: number };
  /** Needs pause until then. */
  vacationUntilMs?: number | null;
  /** Mini-game plays today. */
  plays?: { day: string; count: number };
  wardrobe?: { owned: string[]; head: string | null; neck: string | null };
  /** Seasonal gifts already handed out, by event id. */
  eventGifts?: string[];
  /** Chosen at adoption. Rabbits from before the choice have long ears (see earsOf). */
  ears?: Ears;
}

export type PetEvent =
  | { kind: 'napDone'; atMs: number }
  | { kind: 'treatBaked'; atMs: number }
  | { kind: 'found'; atMs: number; item: string }
  | { kind: 'fellAsleep'; atMs: number }
  | { kind: 'wokeUp'; atMs: number };

export function newPet(petId: string, name: string, coat: Coat, nowMs: number, tz: string, ears: Ears = 'short'): PetState {
  return {
    v: 1,
    petId,
    name,
    coat,
    ears,
    bornAtMs: nowMs,
    simAtMs: nowMs - (nowMs % STEP_MS),
    stepIndex: 0,
    rev: 0,
    needs: { hunger: 80, happy: 80, energy: 90, clean: 95 },
    bond: 0,
    bondToday: 0,
    bondDay: dayKey(nowMs, tz, DAY_ROLLOVER_HOUR),
    daysVisited: 1,
    lastVisitDay: dayKey(nowMs, tz, DAY_ROLLOVER_HOUR),
    timers: [],
    treats: 0,
    clover: CLOVER.start,
    gift: { lastClaimDay: null, streak: 0 },
    visitorsClaimed: [],
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function isNight(ms: number, tz: string): boolean {
  const h = localHour(ms, tz);
  return BEDTIME_HOUR > WAKE_HOUR ? h >= BEDTIME_HOUR || h < WAKE_HOUR : h >= BEDTIME_HOUR && h < WAKE_HOUR;
}

export function timer(state: PetState, kind: TimerKind): Timer | undefined {
  return state.timers.find((t) => t.kind === kind);
}

export function isAsleep(state: PetState, ms: number, tz: string): boolean {
  const nap = timer(state, 'nap');
  return isNight(ms, tz) || (!!nap && nap.endsAtMs > ms);
}

/**
 * Replay time from the last simulated step up to `toMs`, in fixed 10-minute
 * steps at absolute times, so advancing in one call or in several lands on
 * exactly the same state. Absences longer than MAX_CATCH_UP_MS are cut short.
 * `toMs` earlier than the last step (a clock that went backwards) does nothing.
 */
export function advance(input: PetState, toMs: number, tz: string): { state: PetState; events: PetEvent[] } {
  const state: PetState = structuredCloneState(input);
  const events: PetEvent[] = [];
  if (!(toMs > state.simAtMs)) return { state, events };

  if (toMs - state.simAtMs > MAX_CATCH_UP_MS) {
    const skip = toMs - MAX_CATCH_UP_MS - state.simAtMs;
    state.simAtMs += skip - (skip % STEP_MS);
  }

  let wasAsleep = isAsleep(state, state.simAtMs, tz);
  while (state.simAtMs + STEP_MS <= toMs) {
    const t = state.simAtMs + STEP_MS;
    state.simAtMs = t;
    state.stepIndex += 1;

    // Timers that finished during this step.
    for (const tm of [...state.timers]) {
      if (tm.endsAtMs > t) continue;
      state.timers = state.timers.filter((x) => x !== tm);
      if (tm.kind === 'nap') {
        state.needs.energy = 100;
        events.push({ kind: 'napDone', atMs: tm.endsAtMs });
      } else if (tm.kind === 'bake') {
        state.treats = Math.min(MAX_TREATS, state.treats + 1);
        events.push({ kind: 'treatBaked', atMs: tm.endsAtMs });
      }
    }

    const asleep = isAsleep(state, t, tz);
    if (asleep !== wasAsleep) events.push({ kind: asleep ? 'fellAsleep' : 'wokeUp', atMs: t });
    wasAsleep = asleep;

    // On vacation her needs hold and nothing happens.
    if (onVacation(state, t)) continue;

    const rates = asleep ? DECAY_ASLEEP : DECAY_AWAKE;
    const mods = TRAIT_MODS[traitOf(state.petId)];
    const per = STEP_MS / 3_600_000;
    state.needs.hunger = clamp(state.needs.hunger - rates.hunger * mods.hungerDecay * per);
    state.needs.happy = clamp(state.needs.happy - rates.happy * mods.happyDecay * per);
    state.needs.energy = clamp(state.needs.energy - rates.energy * per);
    state.needs.clean = clamp(state.needs.clean - rates.clean * per);

    if (!asleep && roll(state.petId, state.stepIndex, 'pebble') < PEBBLE_CHANCE) {
      const find = pickFind(state.petId, state.stepIndex);
      state.clover += CLOVER.pebble;
      state.collection = { ...(state.collection ?? {}), [find.id]: (state.collection?.[find.id] ?? 0) + 1 };
      events.push({ kind: 'found', atMs: t, item: find.id });
    }
  }
  return { state, events };
}

function structuredCloneState(s: PetState): PetState {
  return JSON.parse(JSON.stringify(s)) as PetState;
}

// ---------------------------------------------------------------- mood

export type Mood = 'asleep' | 'grumpy' | 'peckish' | 'lonely' | 'sleepy' | 'dusty' | 'content';

export function mood(state: PetState, ms: number, tz: string): Mood {
  if (isAsleep(state, ms, tz)) return 'asleep';
  const n = state.needs;
  const low = (['hunger', 'happy', 'energy', 'clean'] as NeedKey[]).filter((k) => n[k] < LOW_NEED);
  if (low.length >= 2) return 'grumpy';
  const one: Record<NeedKey, Mood> = { hunger: 'peckish', happy: 'lonely', energy: 'sleepy', clean: 'dusty' };
  const first = low[0];
  return first ? one[first] : 'content';
}

export function bondLevel(bond: number): { level: number; into: number; span: number | null } {
  let level = 1;
  for (let i = 0; i < BOND_LEVELS.length; i++) if (bond >= (BOND_LEVELS[i] ?? Infinity)) level = i + 1;
  const floor = BOND_LEVELS[level - 1] ?? 0;
  const next = BOND_LEVELS[level];
  return { level, into: bond - floor, span: next === undefined ? null : next - floor };
}

// ---------------------------------------------------------------- visits

/**
 * Call once per visit, after catch-up. Counts a new day visited, and on her
 * seventh day hands out her marking.
 */
export function visit(input: PetState, nowMs: number, tz: string): { state: PetState; newDay: boolean; marking: Marking | null } {
  const state = structuredCloneState(input);
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  if (state.lastVisitDay === today) return { state, newDay: false, marking: null };
  state.lastVisitDay = today;
  state.daysVisited += 1;
  state.bond += BOND_PER_DAY_VISITED;
  const marking = earnMarking(state);
  if (marking) state.marking = marking;
  return { state, newDay: true, marking };
}

function countCare(state: PetState, k: 'fed' | 'pet' | 'clean'): void {
  const c = { fed: 0, pet: 0, clean: 0, ...(state.careCounts ?? {}) };
  c[k] += 1;
  state.careCounts = c;
}

// ---------------------------------------------------------------- actions

export type Action = 'feed' | 'pet' | 'clean' | 'nap' | 'wake' | 'bake' | 'gift';
export type FoodId = keyof typeof FOODS;
export const FOOD_IDS = Object.keys(FOODS) as FoodId[];

export type FoodReaction = 'loves' | 'happy' | 'okay';

/**
 * How she takes a meal. Seeded on her id and her meal count, so reopening the
 * game can't re-roll it: the only way to try again is to feed her again.
 */
export function foodReaction(petId: string, meal: number, food: FoodId): FoodReaction {
  const r = roll(petId, meal, `meal:${food}`);
  const odds = FOOD_REACTIONS[food];
  // a greedy rabbit loves her food a little more often
  if (r < odds.loves + TRAIT_MODS[traitOf(petId)].lovesBonus) return 'loves';
  if (r >= 1 - odds.okay) return 'okay';
  return 'happy';
}
export type ActionResult =
  | { ok: true; state: PetState; clover: number; bond: number; note?: 'gently'; reaction?: FoodReaction }
  | { ok: false; reason: 'full' | 'clean' | 'asleep' | 'notTired' | 'notNapping' | 'busy' | 'night' | 'claimed' | 'noTreats' | 'broke' };

function careReward(state: PetState, nowMs: number, tz: string): { clover: number; bond: number } {
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  if (state.bondDay !== today) {
    state.bondDay = today;
    state.bondToday = 0;
  }
  if (state.bondToday >= BOND_DAILY_CAP) return { clover: 0, bond: 0 };
  state.bondToday += BOND_PER_CARE;
  state.bond += BOND_PER_CARE;
  state.clover += CLOVER.perCare;
  return { clover: CLOVER.perCare, bond: BOND_PER_CARE };
}

export function act(input: PetState, action: Action, nowMs: number, tz: string, opts: { food?: FoodId } = {}): ActionResult {
  const state = structuredCloneState(input);
  const asleep = isAsleep(state, nowMs, tz);
  const n = state.needs;

  switch (action) {
    case 'feed': {
      if (asleep) return { ok: false, reason: 'asleep' };
      if (n.hunger >= CARE.full) return { ok: false, reason: 'full' };
      const id = opts.food ?? 'carrot';
      const food = FOODS[id];
      const pantry = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
      if (id === 'treat') {
        if (state.treats <= 0) return { ok: false, reason: 'noTreats' };
        state.treats -= 1;
      } else if (id === 'golden') {
        if (pantry.golden <= 0) return { ok: false, reason: 'noTreats' };
        pantry.golden -= 1;
        state.pantry = pantry;
      } else if (id === 'strawberry' && pantry.berries > 0) {
        // home-grown strawberries are free
        pantry.berries -= 1;
        state.pantry = pantry;
      } else if (food.clover > 0) {
        if (state.clover < food.clover) return { ok: false, reason: 'broke' };
        state.clover -= food.clover;
      }
      countCare(state, 'fed');
      const meal = state.meals ?? 0;
      state.meals = meal + 1;
      const reaction = foodReaction(state.petId, meal, id);
      n.hunger = clamp(n.hunger + food.hunger);
      const joy = reaction === 'okay' ? 0 : food.happy + (reaction === 'loves' ? LOVES_BONUS_HAPPY : 0);
      n.happy = clamp(n.happy + joy);
      return { ok: true, state, ...careReward(state, nowMs, tz), reaction };
    }
    case 'pet': {
      const trait = traitOf(state.petId);
      // a shy rabbit's petting penalty fades once she trusts you
      const bonus = trait === 'shy' && bondLevel(state.bond).level >= SHY_WARM_BOND ? 0 : TRAIT_MODS[trait].petBonus;
      n.happy = clamp(n.happy + (asleep ? CARE.petAsleep.happy : Math.max(1, CARE.pet.happy + bonus)));
      countCare(state, 'pet');
      const r = n.happy >= 100 && !asleep ? { clover: 0, bond: 0 } : careReward(state, nowMs, tz);
      return { ok: true, state, ...r, note: asleep ? 'gently' : undefined };
    }
    case 'clean': {
      if (asleep) return { ok: false, reason: 'asleep' };
      if (n.clean >= CARE.full) return { ok: false, reason: 'clean' };
      n.clean = 100;
      countCare(state, 'clean');
      return { ok: true, state, ...careReward(state, nowMs, tz) };
    }
    case 'nap': {
      if (isNight(nowMs, tz)) return { ok: false, reason: 'night' };
      if (asleep) return { ok: false, reason: 'asleep' };
      if (n.energy >= CARE.napBelowEnergy) return { ok: false, reason: 'notTired' };
      state.timers.push({ kind: 'nap', startedAtMs: nowMs, endsAtMs: nowMs + TIMERS.nap.ms });
      return { ok: true, state, clover: 0, bond: 0 };
    }
    case 'wake': {
      // Ending a nap early keeps the energy she has regained so far and skips
      // the refill at the end. Night sleep can't be interrupted.
      const nap = timer(state, 'nap');
      if (isNight(nowMs, tz)) return { ok: false, reason: 'night' };
      if (!nap || nap.endsAtMs <= nowMs) return { ok: false, reason: 'notNapping' };
      state.timers = state.timers.filter((t) => t !== nap);
      return { ok: true, state, clover: 0, bond: 0 };
    }
    case 'bake': {
      if (timer(state, 'bake')) return { ok: false, reason: 'busy' };
      if (state.treats >= MAX_TREATS) return { ok: false, reason: 'full' };
      state.timers.push({ kind: 'bake', startedAtMs: nowMs, endsAtMs: nowMs + TIMERS.bake.ms });
      return { ok: true, state, clover: 0, bond: 0 };
    }
    case 'gift': {
      const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
      if (state.gift.lastClaimDay === today) return { ok: false, reason: 'claimed' };
      // A missed day pauses the streak; nothing ever resets it.
      state.gift.streak += 1;
      state.gift.lastClaimDay = today;
      const amount = CLOVER.giftBase + Math.min(CLOVER.giftStreakMax, state.gift.streak - 1);
      state.clover += amount;
      return { ok: true, state, clover: amount, bond: 0 };
    }
  }
}

export function giftReady(state: PetState, nowMs: number, tz: string): boolean {
  return state.gift.lastClaimDay !== dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
}

export function spendClover(input: PetState, amount: number): PetState | null {
  if (input.clover < amount) return null;
  const state = structuredCloneState(input);
  state.clover -= amount;
  return state;
}

export function refundClover(input: PetState, amount: number): PetState {
  const state = structuredCloneState(input);
  state.clover += amount;
  return state;
}

/** Her ears. Missing or unknown means long: the only ears rabbits had before the choice. */
export function earsOf(pet: { ears?: unknown }): Ears {
  return (EARS as readonly unknown[]).includes(pet.ears) ? (pet.ears as Ears) : 'long';
}

/** Guard for state read back from storage: anything malformed starts over. */
export function isPetState(x: unknown): x is PetState {
  const s = x as PetState;
  return !!s && s.v === 1 && typeof s.petId === 'string' && typeof s.simAtMs === 'number'
    && !!s.needs && typeof s.needs.hunger === 'number' && Array.isArray(s.timers)
    && (COATS as readonly string[]).includes(s.coat);
}
