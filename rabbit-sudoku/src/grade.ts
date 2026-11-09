// A puzzle's difficulty is the hardest technique the logic solver needs for
// it, never its clue count. A puzzle it can't finish has no tier and is never
// served, which is what makes every puzzle solvable without guessing.

import { solveLogically, TECHNIQUES, type Technique } from './logic';
import type { Grid } from './sudoku';

export const TIERS = ['easy', 'medium', 'hard', 'expert'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_OF: Record<Technique, Tier> = {
  'full-house': 'easy',
  'hidden-single': 'easy',
  'naked-single': 'easy',
  pointing: 'medium',
  claiming: 'medium',
  'naked-pair': 'medium',
  'hidden-pair': 'medium',
  'naked-triple': 'hard',
  'hidden-triple': 'hard',
  'x-wing': 'hard',
  'xy-wing': 'hard',
  skyscraper: 'expert',
  'two-string-kite': 'expert',
  'xyz-wing': 'expert',
  swordfish: 'expert',
  'simple-colouring': 'expert',
};

export const tierRank = (tier: Tier): number => TIERS.indexOf(tier);

/** The techniques allowed up to and including `tier`. */
export function techniquesUpTo(tier: Tier): Technique[] {
  return TECHNIQUES.filter((t) => tierRank(TIER_OF[t]) <= tierRank(tier));
}

export interface Grade {
  tier: Tier;
  /** The hardest technique used. */
  hardest: Technique;
  steps: number;
  /** How often each technique was used. */
  uses: Partial<Record<Technique, number>>;
  /** Steps that needed the puzzle's own tier. */
  stepsAtTier: number;
}

/** How hard `givens` is, or null when logic alone can't solve it (within `upTo`). */
export function grade(givens: Grid, upTo: Tier = 'expert'): Grade | null {
  const result = solveLogically(givens, techniquesUpTo(upTo));
  if (!result.solved) return null;
  const uses: Partial<Record<Technique, number>> = {};
  let hardest: Technique = 'full-house';
  for (const s of result.steps) {
    uses[s.technique] = (uses[s.technique] ?? 0) + 1;
    if (TECHNIQUES.indexOf(s.technique) > TECHNIQUES.indexOf(hardest)) hardest = s.technique;
  }
  const tier = TIER_OF[hardest];
  const stepsAtTier = result.steps.filter((s) => TIER_OF[s.technique] === tier).length;
  return { tier, hardest, steps: result.steps.length, uses, stepsAtTier };
}
