// The garden as a place (docs/rabbit-pets-garden.md): one strip three areas
// wide, the veg patch, the yard and the meadow, each one burrow-width. Plots
// and buildings keep no position of their own: plot i is the i-th bed and the
// n-th hive stands in the n-th hive spot, so this module is a fixed table of
// spots plus what's at a point. Pure, tested in garden.test.ts.

import { SCENE_H, SCENE_W } from './art/burrow';
import { plotCount, plots } from './extras';
import type { PetState } from './sim';
import { BUILDING_IDS, BUILDINGS, countOf, SHED_REQUIRES, unlocked, yardOf, type BuildingId } from './yard';

export const AREA_W = SCENE_W;
export const STRIP_W = 3 * AREA_W;
export const STRIP_H = SCENE_H;
export type AreaId = 'patch' | 'yard' | 'meadow';
export const AREAS: AreaId[] = ['patch', 'yard', 'meadow'];

/** The left edge of an area, in strip pixels. */
export const areaX = (a: AreaId): number => AREAS.indexOf(a) * AREA_W;
/** The area a strip x falls in. */
export function areaAt(x: number): AreaId {
  return AREAS[Math.max(0, Math.min(AREAS.length - 1, Math.floor(x / AREA_W)))]!;
}

/** Ground lines the background is drawn to (art/garden.ts). */
export const GROUND = {
  /** Top of the fence posts; grass starts just below. */
  fence: 41,
  /** The path running the whole strip. */
  pathY: 69,
  pathH: 6,
} as const;

/** A spot: the bottom-centre of whatever stands there, in strip pixels. */
export interface Spot { x: number; y: number }

/**
 * The five beds: three up front, two behind the path's far side. Bed i holds
 * plot i, so the first plot is always front and centre-left.
 */
export const PLOT_SPOTS: Spot[] = [
  { x: 18, y: 84 }, { x: 49, y: 84 }, { x: 80, y: 84 },
  { x: 27, y: 63 }, { x: 63, y: 63 },
];
/** The soil a bed's frame surrounds, for the background: width, and the soil's height. */
export const BED = { w: 26, h: 5 } as const;

const Y = AREA_W; // the yard's left edge
/** Every building of a kind, first to last. As many spots as the kind's max. */
export const BUILDING_SPOTS: Record<BuildingId, Spot[]> = {
  // two rows of five behind the path
  patch: Array.from({ length: 10 }, (_, i) => ({ x: Y + 26 + (i % 5) * 14, y: i < 5 ? 60 : 67 })),
  hive: Array.from({ length: 5 }, (_, i) => ({ x: Y + 10 + i * 18, y: 94 })),
  log: Array.from({ length: 5 }, (_, i) => ({ x: Y + 12 + i * 16, y: 112 })),
};
export const SHED_SPOT: Spot = { x: Y + 10, y: 66 };

/**
 * Tap targets, centred on a spot and standing on it: at least 12 px wide so
 * they're easy to hit at 4x, and never overlapping a neighbour's.
 */
export const HIT: Record<'plot' | 'shed' | BuildingId, { w: number; h: number }> = {
  plot: { w: 20, h: 20 },
  patch: { w: 13, h: 7 },
  hive: { w: 12, h: 12 },
  log: { w: 14, h: 12 },
  shed: { w: 14, h: 12 },
};

export interface Box { x: number; y: number; w: number; h: number }
export function hitBox(kind: keyof typeof HIT, s: Spot): Box {
  const { w, h } = HIT[kind];
  return { x: s.x - w / 2, y: s.y - h, w, h };
}
const inside = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

// ---------------------------------------------------------------- what's where

export type PlotState = 'locked' | 'empty' | 'growing' | 'ready';
/** owned: built. free: the "+" that builds the next one. locked: the "+", dimmed, with a condition. */
export type SpotState = 'owned' | 'free' | 'locked';

export type GardenThing =
  | { kind: 'plot'; index: number; spot: Spot; state: PlotState }
  | { kind: 'building'; id: BuildingId; index: number; spot: Spot; state: SpotState }
  | { kind: 'shed'; spot: Spot; state: SpotState };

function plotState(pet: PetState, i: number, nowMs: number): PlotState {
  if (i >= plotCount(pet)) return 'locked';
  const p = plots(pet)[i];
  return !p ? 'empty' : p.readyAtMs <= nowMs ? 'ready' : 'growing';
}

function buildingState(pet: PetState, id: BuildingId, i: number): SpotState {
  if (i < countOf(pet, id)) return 'owned';
  return unlocked(pet, id) ? 'free' : 'locked';
}

function shedState(pet: PetState): SpotState {
  if (yardOf(pet).sheds > 0) return 'owned';
  return countOf(pet, SHED_REQUIRES.building) >= SHED_REQUIRES.count ? 'free' : 'locked';
}

/** Everything the garden shows, back to front (by spot y), for drawing. */
export function gardenView(pet: PetState, nowMs: number): GardenThing[] {
  const out: GardenThing[] = PLOT_SPOTS.map((spot, index) => ({ kind: 'plot' as const, index, spot, state: plotState(pet, index, nowMs) }));
  for (const id of BUILDING_IDS) {
    BUILDING_SPOTS[id].forEach((spot, index) => out.push({ kind: 'building', id, index, spot, state: buildingState(pet, id, index) }));
  }
  out.push({ kind: 'shed', spot: SHED_SPOT, state: shedState(pet) });
  return out.sort((a, b) => a.spot.y - b.spot.y);
}

/** What's under a strip point, front-most first, or null for bare ground. */
export function hitTest(pet: PetState, x: number, y: number, nowMs: number): GardenThing | null {
  const view = gardenView(pet, nowMs);
  for (let i = view.length - 1; i >= 0; i--) {
    const t = view[i]!;
    const kind = t.kind === 'building' ? t.id : t.kind;
    if (inside(hitBox(kind, t.spot), x, y)) return t;
  }
  return null;
}

/** How many of each kind can ever be built: one spot each. */
export const maxOf = (id: BuildingId): number => BUILDINGS[id].max;
