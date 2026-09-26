// Getting started (docs/rabbit-pets-economy.md §2.1): a checklist of seven
// steps, each paying a lump sum, and a free clover patch for the first. One
// more step opens for each day the player visits (days visited, not the
// calendar), so a slow starter loses nothing and the clover is spread out.
// The steps are never called days. Anything done early counts when its step
// opens. Pure, tested in economy.test.ts.

import { bondLevel, earn } from './economy';
import { hasUpgrade } from './extras';
import type { PetState } from './sim';
import { giveBuilding } from './yard';

export type StarterGoal =
  | 'feed' | 'nap' | 'bed' | 'decor' | 'dress'
  | 'toy' | 'harvest' | 'bake'
  | 'streak3' | 'yard'
  | 'friend'
  | 'decor3'
  | 'upgrade'
  | 'meadow'
  | 'bond3';

export const GOAL_TEXT: Record<StarterGoal, string> = {
  feed: 'Feed her',
  nap: 'Put her to bed when she\'s tired',
  bed: 'Get her a bed from the Shop',
  decor: 'Place a piece of decor',
  dress: 'Dress her in an outfit',
  toy: 'Play with her toy',
  harvest: 'Harvest the garden',
  bake: 'Bake a treat',
  streak3: 'Open the daily gift 3 times',
  yard: 'Collect clover from the yard',
  friend: 'Visit a friend, or share Rabbit Pets',
  decor3: 'Place 3 pieces of decor',
  upgrade: 'Buy a garden upgrade',
  meadow: 'Open the meadow, past the yard',
  bond3: 'Reach bond level 3',
};

export interface StarterStep { step: number; goals: StarterGoal[]; clover: number; patch?: boolean }

export const STARTER_STEPS: StarterStep[] = [
  // Step one can all be done in the first sitting. (Bedtime waits for step
  // two: a new rabbit isn't tired for an hour or more.)
  { step: 1, goals: ['feed', 'bed', 'toy', 'dress'], clover: 100, patch: true },
  { step: 2, goals: ['nap', 'harvest', 'bake'], clover: 70 },
  { step: 3, goals: ['streak3', 'yard'], clover: 70 },
  { step: 4, goals: ['friend'], clover: 50 },
  { step: 5, goals: ['decor3'], clover: 30 },
  { step: 6, goals: ['meadow'], clover: 30 },
  { step: 7, goals: ['bond3'], clover: 100 },
];

/** `paid` holds step numbers (saves from the "starter week" hold the same numbers as days). */
export interface StarterState { counts: Partial<Record<StarterGoal, number>>; paid: number[] }

function starterOf(s: PetState): StarterState {
  return { counts: {}, paid: [], ...(s.starter ?? {}) };
}

/** Done once every step is paid; the checklist goes away. */
export function starterDone(s: PetState): boolean {
  return STARTER_STEPS.every((st) => starterOf(s).paid.includes(st.step));
}

/** The next step to finish: the first one not yet paid. */
export function starterStep(s: PetState): number {
  const paid = starterOf(s).paid;
  return STARTER_STEPS.find((st) => !paid.includes(st.step))?.step ?? STARTER_STEPS.length;
}

/** Steps opened so far: one more for each day visited. */
export function starterOpened(s: PetState): number {
  return Math.min(STARTER_STEPS.length, Math.max(1, s.daysVisited));
}

/** The next step is waiting for the player's next visit on a new day. */
export function starterWaiting(s: PetState): boolean {
  return !starterDone(s) && starterStep(s) > starterOpened(s);
}

/** Record that the player did something a goal asks for. Mutates `state`. */
export function markGoal(state: PetState, goal: StarterGoal): void {
  if (starterDone(state)) return;
  const st = starterOf(state);
  state.starter = { ...st, counts: { ...st.counts, [goal]: (st.counts[goal] ?? 0) + 1 } };
}

export function goalDone(s: PetState, goal: StarterGoal): boolean {
  const c = starterOf(s).counts;
  if (goal === 'streak3') return s.gift.streak >= 3;
  if (goal === 'bond3') return bondLevel(s.bond).level >= 3;
  if (goal === 'meadow') return hasUpgrade(s, 'meadow');
  if (goal === 'decor3') return (c.decor ?? 0) >= 3;
  return (c[goal] ?? 0) > 0;
}

/** What to show: steps paid so far and the open one, with their goals. */
export function starterView(s: PetState): { step: StarterStep; done: boolean[]; paid: boolean }[] {
  const st = starterOf(s);
  const open = Math.min(starterStep(s), starterOpened(s));
  return STARTER_STEPS.filter((x) => x.step <= open || st.paid.includes(x.step)).map((step) => ({
    step, done: step.goals.map((g) => goalDone(s, g)), paid: st.paid.includes(step.step),
  }));
}

/**
 * Pay the next step if it's open and its goals are all done, then the one
 * after, while they're open: goals done early pay as soon as their step
 * opens. Returns the new state and what was paid, for a toast.
 */
export function settleStarter(s: PetState, nowMs: number): { state: PetState; paid: { step: number; clover: number; patch: boolean }[] } {
  if (starterDone(s)) return { state: s, paid: [] };
  let state = JSON.parse(JSON.stringify(s)) as PetState;
  const out: { step: number; clover: number; patch: boolean }[] = [];
  while (!starterDone(state) && !starterWaiting(state)) {
    const step = STARTER_STEPS.find((x) => x.step === starterStep(state))!;
    if (!step.goals.every((g) => goalDone(state, g))) break;
    const st = starterOf(state);
    state.starter = { ...st, paid: [...st.paid, step.step] };
    const clover = earn(state, 'starter', step.clover);
    if (step.patch) state = giveBuilding(state, 'patch', nowMs);
    out.push({ step: step.step, clover, patch: !!step.patch });
  }
  return { state, paid: out };
}
