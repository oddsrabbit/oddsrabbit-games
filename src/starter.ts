// Getting started (docs/rabbit-pets-economy.md §2.1): a checklist of seven
// steps, each paying a lump sum the player claims, and a free clover patch
// for the first. Steps go in order and the next opens as soon as the last is
// claimed. Some goals pace themselves (she has to be tired to nap, the gift
// opens once a day, bond takes time). Anything done early counts when its
// step opens. Pure, tested in economy.test.ts.

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
  nap: 'Put her down for a nap when she\'s tired',
  bed: 'Get her a bed from the Shop (try the Cloud cushion bed)',
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
  // Step one can all be done in the first sitting. (The nap waits for step
  // two: a new rabbit isn't tired for an hour or more.)
  { step: 1, goals: ['feed', 'bed', 'toy', 'dress'], clover: 100, patch: true },
  { step: 2, goals: ['nap', 'harvest', 'bake'], clover: 70 },
  { step: 3, goals: ['streak3', 'yard'], clover: 70 },
  { step: 4, goals: ['friend'], clover: 50 },
  { step: 5, goals: ['decor3'], clover: 30 },
  { step: 6, goals: ['meadow'], clover: 30 },
  { step: 7, goals: ['bond3'], clover: 100 },
];

/** `paid` holds claimed step numbers (saves from the "starter week" hold the same numbers as days). */
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

export type StepStatus = 'claimed' | 'open' | 'locked';

/** Every step, with how far along it is. Only the next unclaimed step is open. */
export function starterView(s: PetState): { step: StarterStep; done: boolean[]; status: StepStatus }[] {
  const st = starterOf(s);
  const open = starterStep(s);
  return STARTER_STEPS.map((step) => ({
    step,
    done: step.goals.map((g) => goalDone(s, g)),
    status: st.paid.includes(step.step) ? 'claimed' : step.step === open ? 'open' : 'locked',
  }));
}

/** The open step's goals are all done and its reward is waiting to be claimed. */
export function starterReady(s: PetState): boolean {
  if (starterDone(s)) return false;
  const step = STARTER_STEPS.find((x) => x.step === starterStep(s))!;
  return step.goals.every((g) => goalDone(s, g));
}

/**
 * Claim the open step's reward, if its goals are all done; the next step
 * opens at once. One step per claim, so each reward gets its moment.
 */
export function claimStarter(s: PetState, nowMs: number): { state: PetState; paid: { step: number; clover: number; patch: boolean } | null } {
  if (!starterReady(s)) return { state: s, paid: null };
  let state = JSON.parse(JSON.stringify(s)) as PetState;
  const step = STARTER_STEPS.find((x) => x.step === starterStep(state))!;
  const st = starterOf(state);
  state.starter = { ...st, paid: [...st.paid, step.step] };
  const clover = earn(state, 'starter', step.clover);
  if (step.patch) state = giveBuilding(state, 'patch', nowMs);
  return { state, paid: { step: step.step, clover, patch: !!step.patch } };
}
