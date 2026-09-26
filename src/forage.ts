// Foraging trips: send her out for a few hours and she comes home with a
// basket: clover, strawberries for the pantry, finds for the shelf, and now
// and then a golden carrot. While she's out the burrow is empty and nobody
// can look after her, so her needs keep dropping at her awake rate. The
// basket is rolled once per whole hour out, seeded on her id and when she
// left, so calling her home early brings what she'd gathered so far, and
// every device agrees. Pure; sim.ts runs the trip, tested in forage.test.ts.

import { earn } from './economy';
import { pickFind } from './extras';
import { roll } from './rng';
import type { PetState } from './sim';
import { FORAGE, HOUR_MS, STEP_MS } from './tuning';

export interface Loot { clover: number; berries: number; golden: number; finds: string[] }

/** Her trip, if she's out: the `forage` timer. */
export function trip(s: PetState): { startedAtMs: number; endsAtMs: number } | undefined {
  return s.timers.find((t) => t.kind === 'forage');
}

export function isOut(s: PetState, ms: number): boolean {
  const t = trip(s);
  return !!t && t.endsAtMs > ms;
}

/** What she's gathered in `hours` whole hours out, on a trip that began at `startedAtMs`. */
export function tripLoot(petId: string, startedAtMs: number, hours: number, eventFinds: string[] = []): Loot {
  const loot: Loot = { clover: 0, berries: 0, golden: 0, finds: [] };
  // far from any step index the simulation uses, so these never echo her finds at home
  const base = 10_000_000 + Math.floor(startedAtMs / STEP_MS) * 16;
  for (let i = 0; i < hours; i++) {
    const r = roll(petId, base + i, 'forage');
    const { odds } = FORAGE;
    if (r < odds.clover) {
      const { min, max } = FORAGE.clover;
      loot.clover += min + Math.floor(roll(petId, base + i, 'forage-clover') * (max - min + 1));
    } else if (r < odds.clover + odds.berry) loot.berries += 1;
    else if (r < odds.clover + odds.berry + odds.find) loot.finds.push(pickFind(petId, base + i, eventFinds).id);
    else loot.golden += 1;
  }
  return loot;
}

/** Whole hours she was out, up to `ms` (or the trip's end). */
export function hoursOut(t: { startedAtMs: number; endsAtMs: number }, ms: number): number {
  return Math.floor((Math.min(ms, t.endsAtMs) - t.startedAtMs) / HOUR_MS);
}

/** Bring her basket in. Returns the clover actually paid (the rate boosts it). Mutates `state`. */
export function unpack(state: PetState, loot: Loot): number {
  const clover = loot.clover ? earn(state, 'forage', loot.clover) : 0;
  if (loot.berries || loot.golden) {
    const p = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
    state.pantry = { ...p, berries: p.berries + loot.berries, golden: p.golden + loot.golden };
  }
  for (const id of loot.finds) state.collection = { ...(state.collection ?? {}), [id]: (state.collection?.[id] ?? 0) + 1 };
  return clover;
}
