// Goals after Getting started (docs/rabbit-pets-economy.md §2.1): the long
// ones, from the first beehive to the first mushroom log, each paying a lump
// sum the player claims. A few are open at once, in order, so one that's
// stuck (a best friend needs friends) never blocks the rest. Each counts what
// she has, so doing one early counts. Pure, tested in goals.test.ts.

import { COLLECTION_SETS, setComplete } from './collectibles';
import { bestFriends, earn } from './economy';
import { soilLevel } from './extras';
import type { PetState } from './sim';
import { starterDone } from './starter';
import { countOf, yardOf } from './yard';
import { byId } from './decor';

export type LaterGoalId =
  | 'hive' | 'set' | 'patch5' | 'shed' | 'soil2'
  | 'hivehelp' | 'hive3' | 'bestfriend' | 'hive5' | 'log';

export interface LaterGoal {
  id: LaterGoalId;
  text: string;
  /** Where or how, a line under it. */
  how: string;
  clover: number;
  /** How far along: [have, need]. Done when have ≥ need. */
  progress: (s: PetState) => [number, number];
}

export const LATER_GOALS: LaterGoal[] = [
  { id: 'hive', text: 'Build your first beehive', how: 'In the yard, after 3 clover patches. It makes 24 clover a day.', clover: 100, progress: (s) => [countOf(s, 'hive'), 1] },
  { id: 'set', text: 'Finish a set in her collection', how: 'Foraging and wild visitors bring finds. A set raises all the clover she earns.', clover: 100, progress: (s) => [COLLECTION_SETS.some((set) => setComplete(s.collection, set)) ? 1 : 0, 1] },
  { id: 'patch5', text: 'Grow the yard to 5 clover patches', how: 'Each one makes 6 clover a day.', clover: 100, progress: (s) => [countOf(s, 'patch'), 5] },
  { id: 'shed', text: 'Build the yard shed', how: 'The yard holds 36 hours of clover instead of 24.', clover: 120, progress: (s) => [yardOf(s).sheds, 1] },
  { id: 'soil2', text: 'Enrich the garden soil to level 2', how: 'Richer soil makes every sprout harvest pay more.', clover: 150, progress: (s) => [soilLevel(s), 2] },
  {
    id: 'hivehelp', text: 'Put out a meadow piece that helps the beehives', how: 'The sunflower patch or the trellis arch: every hive makes 10% more.', clover: 150,
    progress: (s) => [(s.meadow ?? []).some((id) => byId(id)?.boost === 'hive') ? 1 : 0, 1],
  },
  { id: 'hive3', text: 'Keep 3 beehives', how: 'Each extra one costs more, and makes 24 clover a day.', clover: 200, progress: (s) => [countOf(s, 'hive'), 3] },
  { id: 'bestfriend', text: 'Become best friends with someone', how: 'Visit each other for about 2 weeks. Each best friend raises her clover rate.', clover: 150, progress: (s) => [bestFriends(s), 1] },
  { id: 'hive5', text: 'Fill the yard with 5 beehives', how: 'Mushroom logs open after the fifth.', clover: 300, progress: (s) => [countOf(s, 'hive'), 5] },
  { id: 'log', text: 'Build a mushroom log', how: 'The yard\'s biggest building: 48 clover a day.', clover: 500, progress: (s) => [countOf(s, 'log'), 1] },
];

/** How many goals are open at once. */
export const GOALS_OPEN = 3;

const key = (id: LaterGoalId) => `goal:${id}`;
const claimed = (s: PetState, id: LaterGoalId) => (s.paid ?? []).includes(key(id));
export const laterDone = (s: PetState, g: LaterGoal): boolean => { const [have, need] = g.progress(s); return have >= need; };

/** The open goals, first to last: the first few not yet claimed. None until Getting started is done. */
export function openGoals(s: PetState): LaterGoal[] {
  if (!starterDone(s)) return [];
  return LATER_GOALS.filter((g) => !claimed(s, g.id)).slice(0, GOALS_OPEN);
}

/** Open goals that are done and waiting to be claimed. */
export const goalsReady = (s: PetState): LaterGoal[] => openGoals(s).filter((g) => laterDone(s, g));

/** Every goal has been claimed. */
export const goalsAllDone = (s: PetState): boolean => LATER_GOALS.every((g) => claimed(s, g.id));

/** Claim an open goal's reward, if it's done. The next goal opens in its place. */
export function claimGoal(s: PetState, id: LaterGoalId): { state: PetState; clover: number } | null {
  const g = openGoals(s).find((x) => x.id === id);
  if (!g || !laterDone(s, g)) return null;
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  state.paid = [...(state.paid ?? []), key(id)];
  return { state, clover: earn(state, 'goal', g.clover) };
}
