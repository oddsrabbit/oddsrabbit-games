// The whole simulation, pure: no DOM, no SDK, no Date.now(). Time always comes
// in as an argument, so catch-up after an absence and the live game are the
// same code, and every rule here is testable (sim.test.ts).

import { dayKey, isNewDay, localHour } from './localtime';
import { roll } from './rng';
import { activeEvents } from './world';
import { onVacation, pickFind, ownsToy, type Plot } from './extras';
import { conditionsAt, critterAt, leavesKeepsake, stayMs, visitClover } from './wildlife';
import { hoursOut, isOut, trip, tripLoot, unpack, type Loot } from './forage';
import { bondLevel, earn, settleLumps, type EarnReason, type Lump } from './economy';
import type { StarterState } from './starter';
import type { YardState } from './yard';

export { bondLevel } from './economy';
import {
  BOND_DAILY_CAP,
  BOND_PER_CARE,
  BOND_PER_DAY_VISITED,
  CARE,
  CLOVER,
  FOOD_REACTIONS,
  FOODS,
  LOVES_BONUS_HAPPY,
  DAWN_HOUR,
  DAY_ROLLOVER_HOUR,
  DECAY_ASLEEP,
  DUSK_HOUR,
  HOUR_MS,
  DECAY_AWAKE,
  LOW_NEED,
  MAX_CATCH_UP_MS,
  MAX_TREATS,
  PEBBLE_CHANCE,
  WILDLIFE,
  FORAGE,
  SLEEP,
  THRIVING,
  STEP_MS,
  TIMERS,
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

/** `nap` is her sleep, however long; the name is kept for saved games. */
/** `forage`: out on a trip (forage.ts), ending when she's home. */
export type TimerKind = 'nap' | 'forage' | keyof typeof TIMERS;
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
  // (Older saves may also hold `careCounts` and `marking`, from a marking she
  // earned on day 7; that's gone, and the fields are kept as they are.)
  /** Welcome pieces bought back when they raised what visits pay (decor.ts WELCOME_BOUGHT): each still comes with her. */
  welcome?: number;
  /** Festival raffle tickets bought, by event id (raffle.ts). */
  raffle?: Record<string, number>;
  /** Wild visitors (wildlife.ts): how often each has come, and who's here now. */
  critters?: { seen: Record<string, number>; here: { id: string; untilMs: number } | null };
  /** Things she found while you were away: id -> count. */
  collection?: Record<string, number>;
  garden?: { plots: (Plot | null)[] };
  /** Garden produce waiting to be eaten. */
  pantry?: { berries: number; golden: number };
  /** Needs pause until then. */
  vacationUntilMs?: number | null;
  /** Carrot catch plays, from before it was removed. Ignored. */
  plays?: { day: string; count: number };
  wardrobe?: { owned: string[]; head: string | null; neck: string | null };
  /** Seasonal gifts already handed out, by event id. */
  eventGifts?: string[];
  /** Chosen at adoption. Rabbits from before the choice have long ears (see earsOf). */
  ears?: Ears;
  // ---- The economy (economy.ts). All optional, as above.
  /** Set from the signed-in user each session: +25% clover. */
  supporter?: boolean;
  /** The fraction of a clover earn() owes, carried to the next payout. */
  cloverCarry?: number;
  /** Clover earned so far, by reason. */
  earned?: Partial<Record<EarnReason, number>>;
  /** One-off payouts already made: `bond:3`, `streak:7`… */
  paid?: string[];
  /** Friend rewards paid today, by kind (only the first few a day pay). */
  friendToday?: { day: string; counts: Partial<Record<'visit' | 'giftSent' | 'hosted' | 'giftClover', number>> };
  /** Friendship by friend uuid: a point a day each way; enough makes a best friend. */
  friends?: Record<string, { points: number; out: string | null; in: string | null }>;
  yard?: YardState;
  starter?: StarterState;
  /** Garden upgrades bought: `plot2`, `can`… (extras.ts UPGRADES). */
  upgrades?: string[];
  soilLevel?: number;
  /** Toys owned besides the ball she starts with. */
  toys?: string[];
  /** What the player is saving up for, pinned in the shop: `decor:fireplace`… */
  goal?: string | null;
  /** Pieces out in the garden's meadow (decor.ts meadowPieces), for Getting started. */
  meadow?: string[];
  /** Friends' visits today that boosted her needs (only the first few do). */
  visitCare?: { day: string; count: number };
  /** Guest book covers bought (guestbook.ts COVERS), and the one on it. */
  covers?: string[];
  cover?: string;
}

export type PetEvent =
  | { kind: 'napDone'; atMs: number }
  | { kind: 'treatBaked'; atMs: number }
  | { kind: 'found'; atMs: number; item: string }
  /** Home from foraging with her basket; `clover` is what it paid, after the rate. */
  | { kind: 'forageDone'; atMs: number; loot: Loot; clover: number }
  /** A wild visitor dropped by, left `clover`, and maybe its keepsake. */
  | { kind: 'critter'; atMs: number; critter: string; clover: number; keepsake?: string }
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
    paid: [],
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Whether it's dark outside for the player. Only the window and lighting use it. */
export function isNight(ms: number, tz: string): boolean {
  const h = localHour(ms, tz);
  return DUSK_HOUR > DAWN_HOUR ? h >= DUSK_HOUR || h < DAWN_HOUR : h >= DUSK_HOUR && h < DAWN_HOUR;
}

/** How long she sleeps from this energy: until it's full, in whole steps. */
export function sleepMs(energy: number): number {
  const hours = Math.max(0, 100 - energy) / -DECAY_ASLEEP.energy;
  return Math.max(1, Math.ceil((hours * HOUR_MS) / STEP_MS)) * STEP_MS;
}

export function timer(state: PetState, kind: TimerKind): Timer | undefined {
  return state.timers.find((t) => t.kind === kind);
}

/** Asleep while her sleep timer runs, whatever the time of day. `tz` is unused, kept for callers. */
export function isAsleep(state: PetState, ms: number, _tz?: string): boolean {
  const nap = timer(state, 'nap');
  return !!nap && nap.endsAtMs > ms;
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
      // a newer version's timer: leave it for that version to finish
      if (tm.kind !== 'nap' && tm.kind !== 'bake' && tm.kind !== 'forage') continue;
      if (tm.endsAtMs > t) continue;
      state.timers = state.timers.filter((x) => x !== tm);
      if (tm.kind === 'forage') {
        const loot = tripLoot(state.petId, tm.startedAtMs, hoursOut(tm, tm.endsAtMs), activeEvents(tm.startedAtMs, tz).flatMap((e) => e.finds));
        events.push({ kind: 'forageDone', atMs: tm.endsAtMs, loot, clover: unpack(state, loot) });
        continue;
      }
      if (tm.kind === 'nap') {
        state.needs.energy = 100;
        events.push({ kind: 'napDone', atMs: tm.endsAtMs });
      } else if (tm.kind === 'bake') {
        state.treats = Math.min(MAX_TREATS, state.treats + 1);
        events.push({ kind: 'treatBaked', atMs: tm.endsAtMs });
      }
    }

    // Nobody put her to bed and she's worn out: she dozes off where she is
    // (out foraging, she keeps going until she's home).
    if (!isAsleep(state, t) && !onVacation(state, t) && !isOut(state, t) && state.needs.energy < SLEEP.dozeBelow) {
      state.timers.push({ kind: 'nap', startedAtMs: t, endsAtMs: t + sleepMs(state.needs.energy) });
    }

    const asleep = isAsleep(state, t, tz);
    if (asleep !== wasAsleep) events.push({ kind: asleep ? 'fellAsleep' : 'wokeUp', atMs: t });
    wasAsleep = asleep;

    // On vacation her needs hold and nothing happens.
    if (onVacation(state, t)) continue;

    const rates = asleep ? DECAY_ASLEEP : DECAY_AWAKE;
    const per = STEP_MS / 3_600_000;
    state.needs.hunger = clamp(state.needs.hunger - rates.hunger * per);
    state.needs.happy = clamp(state.needs.happy - rates.happy * per);
    state.needs.energy = clamp(state.needs.energy - rates.energy * per);
    state.needs.clean = clamp(state.needs.clean - rates.clean * per);

    // her finds at home; out foraging, her basket is her finds. Thriving, she finds more.
    const odds = thriving(state.needs) ? THRIVING.odds : 1;
    if (!asleep && !isOut(state, t) && roll(state.petId, state.stepIndex, 'pebble') < PEBBLE_CHANCE * odds) {
      const find = pickFind(state.petId, state.stepIndex, activeEvents(t, tz).flatMap((e) => e.finds));
      earn(state, 'find', find.rarity === 'rare' ? CLOVER.rareFind : CLOVER.pebble);
      state.collection = { ...(state.collection ?? {}), [find.id]: (state.collection?.[find.id] ?? 0) + 1 };
      events.push({ kind: 'found', atMs: t, item: find.id });
    }

    // A wild visitor, one at a time, asleep or awake (they tiptoe).
    const here = state.critters?.here;
    if (here && here.untilMs <= t) state.critters = { ...state.critters!, here: null };
    if (!state.critters?.here && roll(state.petId, state.stepIndex, 'critter') < WILDLIFE.chancePerStep * odds) {
      const c = critterAt(state.petId, state.stepIndex, conditionsAt(t, tz));
      if (c) {
        const clover = earn(state, 'critter', visitClover(state.petId, state.stepIndex));
        const keepsake = leavesKeepsake(state.petId, state.stepIndex) ? c.keepsake : undefined;
        if (keepsake) state.collection = { ...(state.collection ?? {}), [keepsake]: (state.collection?.[keepsake] ?? 0) + 1 };
        const seen = state.critters?.seen ?? {};
        state.critters = { seen: { ...seen, [c.id]: (seen[c.id] ?? 0) + 1 }, here: { id: c.id, untilMs: t + stayMs(state.petId, state.stepIndex) } };
        events.push({ kind: 'critter', atMs: t, critter: c.id, clover, ...(keepsake ? { keepsake } : {}) });
      }
    }
  }
  return { state, events };
}

/** Food, joy and clean all looked after: better finds, more wild visitors, a bigger gift (THRIVING). */
export function thriving(n: Needs): boolean {
  return n.hunger >= THRIVING.above && n.happy >= THRIVING.above && n.clean >= THRIVING.above;
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

// ---------------------------------------------------------------- visits

/** Call once per visit, after catch-up. Counts a new day visited. */
export function visit(input: PetState, nowMs: number, tz: string): { state: PetState; newDay: boolean; lumps: Lump[] } {
  const state = structuredCloneState(input);
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  if (!isNewDay(state.lastVisitDay, today)) return { state, newDay: false, lumps: settleLumps(state) };
  state.lastVisitDay = today;
  state.daysVisited += 1;
  state.bond += BOND_PER_DAY_VISITED;
  return { state, newDay: true, lumps: settleLumps(state) };
}

// ---------------------------------------------------------------- actions

export type Action = 'feed' | 'pet' | 'play' | 'clean' | 'nap' | 'wake' | 'bake' | 'gift' | 'forage' | 'recall';
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
  if (r < odds.loves) return 'loves';
  if (r >= 1 - odds.okay) return 'okay';
  return 'happy';
}
export type ActionResult =
  | { ok: true; state: PetState; clover: number; bond: number; note?: 'gently'; reaction?: FoodReaction; lumps?: Lump[]; loot?: Loot }
  | { ok: false; reason: 'full' | 'clean' | 'asleep' | 'notTired' | 'notNapping' | 'busy' | 'claimed' | 'noTreats' | 'broke' | 'noToy' | 'out' | 'tooTired' | 'notOut' };

function careReward(state: PetState, nowMs: number, tz: string): { clover: number; bond: number; lumps: Lump[] } {
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  if (isNewDay(state.bondDay, today)) {
    state.bondDay = today;
    state.bondToday = 0;
  }
  if (state.bondToday >= BOND_DAILY_CAP) return { clover: 0, bond: 0, lumps: [] };
  state.bondToday += BOND_PER_CARE;
  state.bond += BOND_PER_CARE;
  const clover = earn(state, 'care', CLOVER.perCare);
  return { clover, bond: BOND_PER_CARE, lumps: settleLumps(state) };
}
const NO_REWARD = { clover: 0, bond: 0, lumps: [] as Lump[] };

export function act(input: PetState, action: Action, nowMs: number, tz: string, opts: { food?: FoodId; toy?: string; hours?: number } = {}): ActionResult {
  const state = structuredCloneState(input);
  const asleep = isAsleep(state, nowMs, tz);
  const n = state.needs;
  // out foraging, she isn't here to be looked after
  const out = isOut(state, nowMs);
  if (out && (action === 'feed' || action === 'pet' || action === 'play' || action === 'clean' || action === 'nap' || action === 'wake' || action === 'forage')) {
    return { ok: false, reason: 'out' };
  }

  switch (action) {
    case 'forage': {
      // one trip at a time: a finished one waits for its step to bring her
      // home (and trip() only ever sees the first, so a second would hide)
      if (trip(state)) return { ok: false, reason: 'out' };
      if (asleep) return { ok: false, reason: 'asleep' };
      if (n.energy < FORAGE.minEnergy) return { ok: false, reason: 'tooTired' };
      const hours = (FORAGE.hours as readonly number[]).includes(opts.hours ?? 0) ? opts.hours! : FORAGE.hours[0];
      // home on a step, the one that brings her home: ending between steps,
      // she'd look home before she was
      state.timers.push({ kind: 'forage', startedAtMs: nowMs, endsAtMs: Math.ceil((nowMs + hours * HOUR_MS) / STEP_MS) * STEP_MS });
      return { ok: true, state, clover: 0, bond: 0 };
    }
    case 'recall': {
      // home early, with what she'd gathered in the whole hours she was out
      const t = trip(state);
      if (!t || !out) return { ok: false, reason: 'notOut' };
      state.timers = state.timers.filter((x) => x.kind !== 'forage');
      const loot = tripLoot(state.petId, t.startedAtMs, hoursOut(t, nowMs), activeEvents(t.startedAtMs, tz).flatMap((e) => e.finds));
      return { ok: true, state, clover: unpack(state, loot), bond: 0, loot };
    }
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
      const meal = state.meals ?? 0;
      state.meals = meal + 1;
      const reaction = foodReaction(state.petId, meal, id);
      n.hunger = clamp(n.hunger + food.hunger);
      const joy = reaction === 'okay' ? 0 : food.happy + (reaction === 'loves' ? LOVES_BONUS_HAPPY : 0);
      n.happy = clamp(n.happy + joy);
      return { ok: true, state, ...careReward(state, nowMs, tz), reaction };
    }
    case 'pet': {
      n.happy = clamp(n.happy + (asleep ? CARE.petAsleep.happy : CARE.pet.happy));
      const r = n.happy >= 100 && !asleep ? NO_REWARD : careReward(state, nowMs, tz);
      return { ok: true, state, ...r, note: asleep ? 'gently' : undefined };
    }
    case 'play': {
      // Toy play: no score, no limit. Joy and a care point, like petting.
      if (asleep) return { ok: false, reason: 'asleep' };
      if (!ownsToy(state, opts.toy ?? 'ball')) return { ok: false, reason: 'noToy' };
      const r = n.happy >= 100 ? NO_REWARD : careReward(state, nowMs, tz);
      n.happy = clamp(n.happy + CARE.play.happy);
      n.energy = clamp(n.energy - CARE.play.energy);
      return { ok: true, state, ...r };
    }
    case 'clean': {
      if (asleep) return { ok: false, reason: 'asleep' };
      if (n.clean >= CARE.full) return { ok: false, reason: 'clean' };
      n.clean = 100;
      return { ok: true, state, ...careReward(state, nowMs, tz) };
    }
    case 'nap': {
      // Bedtime, at any hour: she sleeps until she's rested.
      // one sleep at a time, as with trips: a finished one waits for its step
      if (asleep || timer(state, 'nap')) return { ok: false, reason: 'asleep' };
      if (n.energy >= CARE.napBelowEnergy) return { ok: false, reason: 'notTired' };
      // she wakes on a step, the one that finishes her sleep: ending between
      // steps, she'd look awake (and could be sent foraging) before it did
      const wakeAt = nowMs + sleepMs(n.energy);
      state.timers.push({ kind: 'nap', startedAtMs: nowMs, endsAtMs: Math.ceil(wakeAt / STEP_MS) * STEP_MS });
      return { ok: true, state, clover: 0, bond: 0 };
    }
    case 'wake': {
      // Waking her, at any hour, keeps the energy she has regained so far and
      // skips the refill at the end. She's drowsy, not wrecked.
      const nap = timer(state, 'nap');
      if (!nap || nap.endsAtMs <= nowMs) return { ok: false, reason: 'notNapping' };
      state.timers = state.timers.filter((t) => t !== nap);
      n.energy = Math.max(n.energy, SLEEP.wokenEnergy);
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
      if (!isNewDay(state.gift.lastClaimDay, today)) return { ok: false, reason: 'claimed' };
      // A missed day pauses the streak; nothing ever resets it.
      state.gift.streak += 1;
      state.gift.lastClaimDay = today;
      const base = Math.min(CLOVER.giftMax, CLOVER.giftBase + CLOVER.giftStep * (state.gift.streak - 1));
      const amount = Math.round(base * (thriving(n) ? THRIVING.gift : 1));
      const clover = earn(state, 'gift', amount);
      return { ok: true, state, clover, bond: 0, lumps: settleLumps(state) };
    }
  }
}

export function giftReady(state: PetState, nowMs: number, tz: string): boolean {
  return isNewDay(state.gift.lastClaimDay, dayKey(nowMs, tz, DAY_ROLLOVER_HOUR));
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

/**
 * Guard for state read back from storage: everything the game reads without a
 * fallback, so a half-written save shows "can't load" instead of crashing
 * later. Fields added since the first version are optional and not checked.
 */
export function isPetState(x: unknown): x is PetState {
  const s = x as PetState;
  const num = (v: unknown) => typeof v === 'number';
  return !!s && s.v === 1 && typeof s.petId === 'string' && typeof s.name === 'string'
    && (COATS as readonly string[]).includes(s.coat)
    && num(s.simAtMs) && num(s.stepIndex) && num(s.rev) && num(s.bond) && num(s.bondToday)
    && num(s.daysVisited) && num(s.clover) && num(s.treats)
    && typeof s.bondDay === 'string' && typeof s.lastVisitDay === 'string'
    && !!s.needs && num(s.needs.hunger) && num(s.needs.happy) && num(s.needs.energy) && num(s.needs.clean)
    && Array.isArray(s.timers)
    && !!s.gift && num(s.gift.streak) && (s.gift.lastClaimDay === null || typeof s.gift.lastClaimDay === 'string');
}
