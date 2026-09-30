// Getting started (docs/rabbit-pets-economy.md §2.1): a checklist of six
// steps, each paying a lump sum the player claims, and a free clover patch
// for the first. Steps go in order and the next opens as soon as the last is
// claimed. Some goals pace themselves (she has to be tired to nap, a crop
// takes hours, the gift opens once a day, bond takes time). Anything done
// early counts when its step opens. Pure, tested in economy.test.ts.

import { bondLevel, earn } from './economy';
import { hasUpgrade, soilLevel } from './extras';
import type { PetState } from './sim';
import { countOf, giveBuilding } from './yard';

export type StarterGoal =
  | 'feed' | 'bed' | 'toy' | 'lantern'
  | 'dress' | 'nap' | 'groom' | 'sprout' | 'bake'
  | 'earn' | 'yard' | 'patch2' | 'forage'
  | 'friend' | 'newtoy' | 'surface' | 'find'
  | 'streak3' | 'meadow' | 'meadowhelp' | 'pin'
  | 'patch3' | 'gardenup' | 'bond3';

export const GOAL_TEXT: Record<StarterGoal, string> = {
  feed: 'Feed her',
  bed: 'Get her a bed from the Shop (try the Cloud cushion bed)',
  toy: 'Play with her toy',
  lantern: 'Hang the honey lantern (it\'s waiting in storage)',
  dress: 'Dress her in an outfit',
  nap: 'Put her down for a nap when she\'s tired',
  groom: 'Brush her',
  sprout: 'Grow clover sprouts in the garden and pick them',
  bake: 'Bake a treat',
  earn: 'Tap your clover to see the ways to earn more',
  yard: 'Collect clover from the yard',
  patch2: 'Build a second clover patch in the yard',
  forage: 'Send her out foraging',
  friend: 'Visit a friend, or share Rabbit Pets',
  newtoy: 'Get her a new toy from the Shop',
  surface: 'Get new wallpaper or a new floor from the Shop',
  find: 'Find something for her collection',
  streak3: 'Open the daily gift 3 times',
  meadow: 'Open the meadow, past the yard',
  meadowhelp: 'Put out a meadow piece that helps the yard (try the stepping stones)',
  pin: 'Pick something in the Shop to save up for',
  patch3: 'Build a third clover patch (beehives and the shed come next)',
  gardenup: 'Buy a garden upgrade',
  bond3: 'Reach bond level 3',
};

export interface StarterStep { step: number; goals: StarterGoal[]; clover: number; patch?: boolean }

export const STARTER_STEPS: StarterStep[] = [
  // Step one can all be done in the first sitting. The lantern comes free in
  // storage: hanging it teaches arranging the room.
  { step: 1, goals: ['feed', 'bed', 'toy', 'lantern'], clover: 100, patch: true },
  // The first day: something to do (dress her, with step one's clover) while
  // she gets tired enough to nap, dusty enough to brush and sprouts grow (4 hours).
  { step: 2, goals: ['dress', 'nap', 'groom', 'sprout', 'bake'], clover: 70 },
  // Where clover comes from: the clover sheet, the yard and foraging. All of
  // it can be done the same day: nothing here waits on the calendar.
  { step: 3, goals: ['earn', 'yard', 'patch2', 'forage'], clover: 120 },
  // Spending on her and her room, and what foraging turns up.
  { step: 4, goals: ['friend', 'newtoy', 'surface', 'find'], clover: 120 },
  // The daily round (the gift takes three days) and the meadow, with a piece
  // that pays: about 700 clover of spending.
  { step: 5, goals: ['streak3', 'meadow', 'meadowhelp', 'pin'], clover: 200 },
  // The yard grows: the third patch opens beehives and the shed, which the
  // goals after Getting started (goals.ts) take up. With bond level 3, about
  // a week and a half in.
  { step: 6, goals: ['patch3', 'gardenup', 'bond3'], clover: 250 },
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
  // what she has counts however she got it (the burrow's, the bed, the
  // lantern and the surface, are marked by main.ts)
  if (goal === 'patch2') return countOf(s, 'patch') >= 2;
  if (goal === 'patch3') return countOf(s, 'patch') >= 3;
  if (goal === 'meadowhelp') return (s.meadow ?? []).length > 0;
  if (goal === 'pin') return !!s.goal || (c.pin ?? 0) > 0;
  if (goal === 'newtoy') return (s.toys ?? []).length > 0;
  if (goal === 'find') return Object.values(s.collection ?? {}).some((n) => n > 0);
  if (goal === 'gardenup') return soilLevel(s) > 0 || (['plot2', 'plot3', 'can', 'plot4', 'plot5'] as const).some((u) => hasUpgrade(s, u));
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
