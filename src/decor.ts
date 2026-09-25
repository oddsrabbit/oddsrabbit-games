// Decor: what can be bought, and where it can go. Placement is free: each
// piece has a position in scene pixels, clamped to its zone (floor pieces on
// the floor, rugs flat on the floor, hanging pieces on the upper wall). Pieces
// layer by depth, so a pot further back is drawn behind one in front, and she
// can walk in front of or behind them.

import type { ItemArt } from './art/items';

export type Zone = 'floor' | 'hang' | 'rug';

export interface DecorDef {
  id: string;
  name: string;
  price: number;
  art: ItemArt;
  zone: Zone;
  /** Bond level needed to buy it. */
  bond: number;
  /** Sold only during a seasonal event (world.ts EVENTS). */
  limited?: boolean;
}

export const CATALOG: DecorDef[] = [
  { id: 'cushion', name: 'Cloud cushion', price: 30, art: 'cushion', zone: 'floor', bond: 1 },
  { id: 'plant', name: 'Clover pot', price: 25, art: 'plant', zone: 'floor', bond: 1 },
  { id: 'rug', name: 'Berry rug', price: 40, art: 'rug', zone: 'rug', bond: 1 },
  { id: 'lantern', name: 'Honey lantern', price: 60, art: 'lantern', zone: 'hang', bond: 1 },
  { id: 'mushroom', name: 'Toadstool seat', price: 35, art: 'mushroom', zone: 'floor', bond: 2 },
  { id: 'jar', name: 'Dandelion jar', price: 30, art: 'jar', zone: 'floor', bond: 2 },
  { id: 'garland', name: 'Star garland', price: 50, art: 'garland', zone: 'hang', bond: 3 },
  { id: 'pumpkin', name: 'Harvest pumpkin', price: 40, art: 'pumpkin', zone: 'floor', bond: 1, limited: true },
  { id: 'jackolantern', name: 'Jack-o-lantern', price: 45, art: 'jackolantern', zone: 'floor', bond: 1, limited: true },
  { id: 'snowglobe', name: 'Snow globe', price: 50, art: 'snowglobe', zone: 'floor', bond: 1, limited: true },
];

export const byId = (id: string): DecorDef | undefined => CATALOG.find((d) => d.id === id);

/**
 * Where each zone's anchor may sit, in scene pixels, and where a new piece
 * lands. The anchor is the bottom centre for floor pieces, the centre for rugs
 * and the top centre for hanging pieces.
 */
export const ZONES: Record<Zone, { minX: number; maxX: number; minY: number; maxY: number; x: number; y: number }> = {
  floor: { minX: 6, maxX: 92, minY: 96, maxY: 116, x: 49, y: 108 },
  rug: { minX: 16, maxX: 82, minY: 98, maxY: 112, x: 49, y: 106 },
  hang: { minX: 12, maxX: 86, minY: 8, maxY: 44, x: 60, y: 14 },
};

export function clampToZone(zone: Zone, x: number, y: number): { x: number; y: number } {
  const z = ZONES[zone];
  return {
    x: Math.round(Math.max(z.minX, Math.min(z.maxX, x))),
    y: Math.round(Math.max(z.minY, Math.min(z.maxY, y))),
  };
}

export interface PlacedItem {
  uid: string;
  id: string;
  x: number;
  y: number;
  flip: boolean;
  /** False when owned but put away. */
  placed: boolean;
}

export interface BurrowState {
  v: 2;
  rev: number;
  items: PlacedItem[];
}

/** A new rabbit arrives to a cushion and a pot, so the room isn't bare. */
export function starterBurrow(): BurrowState {
  return {
    v: 2,
    rev: 0,
    items: [
      { uid: 'starter-cushion', id: 'cushion', x: 70, y: 99, flip: false, placed: true },
      { uid: 'starter-plant', id: 'plant', x: 12, y: 99, flip: false, placed: true },
    ],
  };
}

/** Anchors of the fixed spots the first version used, for converting old saves. */
const V1_SLOTS: Record<string, { x: number; y: number }> = {
  b1: { x: 12, y: 99 }, b2: { x: 70, y: 99 }, b3: { x: 87, y: 99 },
  f1: { x: 10, y: 113 }, f2: { x: 73, y: 113 }, f3: { x: 89, y: 113 },
  h1: { x: 46, y: 12 }, h2: { x: 64, y: 13 }, h3: { x: 80, y: 18 },
  r1: { x: 44, y: 106 }, r2: { x: 26, y: 110 }, r3: { x: 62, y: 110 },
};

/**
 * Read a stored burrow of either version. v1 kept pieces in fixed slots
 * (`slot: 'b2'` or null when put away); those become positions. Unknown
 * pieces are dropped; anything malformed returns null (start fresh).
 */
export function readBurrow(x: unknown): BurrowState | null {
  const b = x as { v?: number; rev?: number; items?: unknown[] };
  if (!b || !Array.isArray(b.items) || (b.v !== 1 && b.v !== 2)) return null;
  const items: PlacedItem[] = [];
  for (const raw of b.items) {
    const it = raw as Partial<PlacedItem> & { slot?: string | null };
    const def = typeof it.id === 'string' ? byId(it.id) : undefined;
    if (!def || typeof it.uid !== 'string') continue;
    if (b.v === 1) {
      const at = it.slot ? V1_SLOTS[it.slot] : undefined;
      const z = ZONES[def.zone];
      const pos = clampToZone(def.zone, at?.x ?? z.x, at?.y ?? z.y);
      items.push({ uid: it.uid, id: def.id, ...pos, flip: false, placed: !!at });
    } else if (typeof it.x === 'number' && typeof it.y === 'number') {
      const pos = clampToZone(def.zone, it.x, it.y);
      items.push({ uid: it.uid, id: def.id, ...pos, flip: !!it.flip, placed: it.placed !== false });
    }
  }
  return { v: 2, rev: typeof b.rev === 'number' ? b.rev : 0, items };
}
