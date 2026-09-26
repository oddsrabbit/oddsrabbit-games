// Decor: what can be bought, and where it can go. Placement is free: each
// piece has a position in scene pixels, clamped to its zone (floor pieces on
// the floor, rugs flat on the floor, hanging pieces on the upper wall). Pieces
// layer by depth, so a pot further back is drawn behind one in front, and she
// can walk in front of or behind them.

import type { ItemArt } from './art/items';

/**
 * floor, hang and rug are the burrow's; lawn and fence are the garden
 * meadow's (docs/rabbit-pets-garden.md), in strip pixels. A piece's zone says
 * which room it's in, so the burrow simply never draws a lawn or fence piece.
 */
export type Zone = 'floor' | 'hang' | 'rug' | 'lawn' | 'fence';

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
  /** Price band (docs/rabbit-pets-economy.md §3). 5 = a long-term goal. */
  tier?: 1 | 2 | 3 | 4 | 5;
  /** Shown locked until this piece is owned. */
  after?: string;
  /** Only ever given, never sold (an event's free item). */
  giftOnly?: boolean;
  /** Lights up at night. */
  glow?: boolean;
  /** She sleeps on it. */
  bed?: boolean;
  /** Placed in the meadow, it helps this kind of yard building (yard.ts perHour). */
  boost?: 'patch' | 'hive' | 'log';
  /** One of the welcome line's pieces (tuning.ts WELCOME), its place in it from 1: bought with buyWelcome, not sold like decor. */
  welcome?: number;
}

export const CATALOG: DecorDef[] = [
  // tier 1: everyday
  { id: 'cushion', name: 'Cloud cushion', price: 30, art: 'cushion', zone: 'floor', bond: 1, tier: 1, bed: true },
  { id: 'plant', name: 'Clover pot', price: 25, art: 'plant', zone: 'floor', bond: 1, tier: 1 },
  { id: 'rug', name: 'Berry rug', price: 40, art: 'rug', zone: 'rug', bond: 1, tier: 1 },
  { id: 'lantern', name: 'Honey lantern', price: 60, art: 'lantern', zone: 'hang', bond: 1, tier: 1, glow: true },
  { id: 'mushroom', name: 'Toadstool seat', price: 35, art: 'mushroom', zone: 'floor', bond: 2, tier: 1 },
  { id: 'jar', name: 'Dandelion jar', price: 30, art: 'jar', zone: 'floor', bond: 2, tier: 1 },
  { id: 'garland', name: 'Star garland', price: 50, art: 'garland', zone: 'hang', bond: 3, tier: 1 },
  // tier 2: saving up (walls and floors are in SURFACES)
  { id: 'flowerbox', name: 'Flower box', price: 150, art: 'flowerbox', zone: 'floor', bond: 1, tier: 2 },
  { id: 'herbs', name: 'Hanging herbs', price: 180, art: 'herbs', zone: 'hang', bond: 1, tier: 2 },
  { id: 'kettle', name: 'Tea kettle', price: 200, art: 'kettle', zone: 'floor', bond: 1, tier: 2 },
  { id: 'patchcushion', name: 'Patchwork cushion', price: 220, art: 'patchcushion', zone: 'floor', bond: 1, tier: 2, bed: true },
  { id: 'bunting', name: 'Bunting', price: 300, art: 'bunting', zone: 'hang', bond: 1, tier: 2 },
  { id: 'lamp', name: 'Reading lamp', price: 350, art: 'lamp', zone: 'floor', bond: 1, tier: 2, glow: true },
  { id: 'bookshelf', name: 'Bookshelf nook', price: 400, art: 'bookshelf', zone: 'floor', bond: 1, tier: 2 },
  { id: 'hayloft', name: 'Hay loft bed', price: 550, art: 'hayloft', zone: 'floor', bond: 1, tier: 2, bed: true },
  { id: 'rocker', name: 'Rocking chair', price: 600, art: 'rocker', zone: 'floor', bond: 1, tier: 2 },
  { id: 'windowseat', name: 'Window seat', price: 700, art: 'windowseat', zone: 'floor', bond: 1, tier: 2 },
  // tier 3 and long-term goals (the moon window is a surface)
  { id: 'fireplace', name: 'Fireplace', price: 2000, art: 'fireplace', zone: 'floor', bond: 1, tier: 3, glow: true },
  { id: 'teatable', name: 'Tea table set', price: 1500, art: 'teatable', zone: 'floor', bond: 1, tier: 5, after: 'hayloft' },
  { id: 'clock', name: 'Grandfather clock', price: 6000, art: 'clock', zone: 'floor', bond: 1, tier: 5, after: 'moonwindow' },
  // showpieces: the longest goals, each after the last; they change and move (render.ts)
  { id: 'seasontree', name: 'Four-seasons tree', price: 7000, art: 'tree_summer', zone: 'floor', bond: 1, tier: 5, after: 'fireplace' },
  { id: 'fireflies', name: 'Firefly lantern', price: 15000, art: 'fireflies', zone: 'hang', bond: 1, tier: 5, after: 'seasontree', glow: true },
  { id: 'wishingwell', name: 'Wishing well', price: 30000, art: 'wishingwell', zone: 'floor', bond: 1, tier: 5, after: 'fireflies' },
  // seasonal (world.ts EVENTS)
  { id: 'sled', name: 'Sled', price: 400, art: 'sled', zone: 'floor', bond: 1, limited: true },
  { id: 'snowman', name: 'Snow rabbit', price: 500, art: 'snowman', zone: 'floor', bond: 1, limited: true },
  { id: 'icicles', name: 'Icicle garland', price: 350, art: 'icicles', zone: 'hang', bond: 1, limited: true },
  { id: 'tulips', name: 'Tulip pot', price: 350, art: 'tulips', zone: 'floor', bond: 1, limited: true },
  { id: 'birdhouse', name: 'Birdhouse', price: 500, art: 'birdhouse', zone: 'hang', bond: 1, limited: true },
  { id: 'blossom', name: 'Blossom branch', price: 600, art: 'blossom', zone: 'hang', bond: 1, limited: true },
  { id: 'fan', name: 'Paper fan', price: 0, art: 'fan', zone: 'floor', bond: 1, limited: true, giftOnly: true },
  { id: 'fairlights', name: 'Fair lanterns', price: 400, art: 'fairlights', zone: 'hang', bond: 1, limited: true, glow: true },
  { id: 'lemonade', name: 'Lemonade stand', price: 600, art: 'lemonade', zone: 'floor', bond: 1, limited: true },
  { id: 'pool', name: 'Paddling pool', price: 800, art: 'pool', zone: 'rug', bond: 1, limited: true },
  { id: 'pumpkin', name: 'Harvest pumpkin', price: 300, art: 'pumpkin', zone: 'floor', bond: 1, limited: true },
  { id: 'applecrate', name: 'Apple crate', price: 400, art: 'applecrate', zone: 'floor', bond: 1, limited: true },
  { id: 'scarecrow', name: 'Scarecrow', price: 700, art: 'scarecrow', zone: 'floor', bond: 1, limited: true },
  // the garden's meadow (docs/rabbit-pets-economy.md §2.6, "The meadow")
  { id: 'fencelights', name: 'Fence lights', price: 250, art: 'fencelights', zone: 'fence', bond: 1, glow: true },
  { id: 'bench', name: 'Garden bench', price: 350, art: 'bench', zone: 'lawn', bond: 1 },
  { id: 'stones', name: 'Stepping stones', price: 400, art: 'stones', zone: 'lawn', bond: 1, boost: 'patch' },
  { id: 'birdbath', name: 'Birdbath', price: 500, art: 'birdbath', zone: 'lawn', bond: 1, boost: 'patch' },
  { id: 'sunflowers', name: 'Sunflower patch', price: 1200, art: 'sunflowers', zone: 'lawn', bond: 1, boost: 'hive' },
  { id: 'trellis', name: 'Trellis arch', price: 1500, art: 'trellis', zone: 'lawn', bond: 1, boost: 'hive' },
  { id: 'wheelbarrow', name: 'Wheelbarrow', price: 4000, art: 'wheelbarrow', zone: 'lawn', bond: 1, boost: 'log' },
  { id: 'gnome', name: 'Garden gnome', price: 4500, art: 'gnome', zone: 'lawn', bond: 1, boost: 'log' },
  // the welcome line: each makes every visit pay 3 more (social.ts visitPay). Prices are WELCOME's.
  { id: 'welcomemat', name: 'Welcome mat', price: 1000, art: 'welcomemat', zone: 'lawn', bond: 1, welcome: 1 },
  { id: 'guestchairs', name: 'Guest chairs', price: 3000, art: 'guestchairs', zone: 'lawn', bond: 1, welcome: 2 },
  { id: 'teacorner', name: 'Tea corner', price: 6000, art: 'teatable', zone: 'lawn', bond: 1, welcome: 3 },
  { id: 'lanternpath', name: 'Lantern path', price: 12000, art: 'lanternpath', zone: 'lawn', bond: 1, welcome: 4 },
  { id: 'friendtree', name: 'Friendship tree', price: 25000, art: 'friendtree', zone: 'lawn', bond: 1, welcome: 5 },
  { id: 'candybasket', name: 'Candy basket', price: 0, art: 'candybasket', zone: 'floor', bond: 1, limited: true, giftOnly: true },
  { id: 'jackolantern', name: 'Jack-o-lantern', price: 350, art: 'jackolantern', zone: 'floor', bond: 1, limited: true, glow: true },
  { id: 'ghost', name: 'Friendly ghost mobile', price: 500, art: 'ghost', zone: 'hang', bond: 1, limited: true },
  { id: 'snowglobe', name: 'Snow globe', price: 400, art: 'snowglobe', zone: 'floor', bond: 1, limited: true },
  { id: 'tinytree', name: 'Tiny tree', price: 600, art: 'tinytree', zone: 'floor', bond: 1, limited: true },
  { id: 'stockings', name: 'Knitted stockings', price: 350, art: 'stockings', zone: 'hang', bond: 1, limited: true },
];

// ---------------------------------------------------------------- walls, floors and the window

/**
 * Surfaces change the room itself rather than sitting in it: one wall, one
 * floor and one window at a time. Owned ones can be swapped freely. The
 * plain ones are always owned.
 */
export type SurfaceKind = 'wall' | 'floor' | 'window';
export interface SurfaceDef {
  id: string;
  name: string;
  kind: SurfaceKind;
  price: number;
  tier: 1 | 2 | 3 | 4 | 5;
  /** Shown locked until this decor or surface is owned. */
  after?: string;
  bond?: number;
}
export const SURFACES: SurfaceDef[] = [
  { id: 'plainwall', name: 'Earthen walls', kind: 'wall', price: 0, tier: 1 },
  { id: 'plainfloor', name: 'Plank floor', kind: 'floor', price: 0, tier: 1 },
  { id: 'roundwindow', name: 'Round window', kind: 'window', price: 0, tier: 1 },
  { id: 'oakfloor', name: 'Oak floorboards', kind: 'floor', price: 250, tier: 2 },
  { id: 'daisywall', name: 'Daisy wallpaper', kind: 'wall', price: 280, tier: 2 },
  { id: 'birchfloor', name: 'Birch floorboards', kind: 'floor', price: 450, tier: 2 },
  { id: 'starrywall', name: 'Starry wallpaper', kind: 'wall', price: 500, tier: 2 },
  { id: 'moonwindow', name: 'Moon window', kind: 'window', price: 3000, tier: 4, after: 'fireplace', bond: 5 },
  { id: 'cherryfloor', name: 'Cherry floorboards', kind: 'floor', price: 800, tier: 5, after: 'birchfloor' },
  { id: 'cloverwall', name: 'Clover wallpaper', kind: 'wall', price: 1000, tier: 5, after: 'starrywall' },
  { id: 'checkerfloor', name: 'Checkered floor', kind: 'floor', price: 1200, tier: 5, after: 'cherryfloor' },
  { id: 'sunsetwall', name: 'Sunset wallpaper', kind: 'wall', price: 1500, tier: 5, after: 'cloverwall' },
];
export const surfaceById = (id: string): SurfaceDef | undefined => SURFACES.find((d) => d.id === id);
const PLAIN: Record<SurfaceKind, string> = { wall: 'plainwall', floor: 'plainfloor', window: 'roundwindow' };

export interface Surfaces { owned: string[]; wall: string; floor: string; window: string }

export function surfacesOf(b: BurrowState): Surfaces {
  const s = b.surfaces;
  const pick = (kind: SurfaceKind, id: string | undefined) =>
    id && surfaceById(id)?.kind === kind && (id === PLAIN[kind] || s?.owned.includes(id)) ? id : PLAIN[kind];
  return { owned: s?.owned ?? [], wall: pick('wall', s?.wall), floor: pick('floor', s?.floor), window: pick('window', s?.window) };
}

export function ownsSurface(b: BurrowState, id: string): boolean {
  return Object.values(PLAIN).includes(id) || surfacesOf(b).owned.includes(id);
}

/** Owned: decor in the burrow (placed or put away), or a surface. Used for `after` conditions. */
export function ownsDecor(b: BurrowState, id: string): boolean {
  return b.items.some((i) => i.id === id) || ownsSurface(b, id);
}

/** Put an owned surface up (mutates `b`). */
export function useSurface(b: BurrowState, id: string): void {
  const def = surfaceById(id);
  if (!def || !ownsSurface(b, id)) return;
  // start from what's stored, not surfacesOf, so a newer version's choice for another kind survives
  const cur = b.surfaces ?? surfacesOf(b);
  b.surfaces = { ...cur, [def.kind]: id };
}

/** Own a surface and put it up (mutates `b`). The caller has taken the clover. */
export function addSurface(b: BurrowState, id: string): void {
  const cur = b.surfaces ?? surfacesOf(b);
  b.surfaces = { ...cur, owned: cur.owned.includes(id) ? cur.owned : [...cur.owned, id] };
  useSurface(b, id);
}

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
  // the meadow is the strip's third area, x 196-294 (garden.ts)
  lawn: { minX: 204, maxX: 288, minY: 58, maxY: 116, x: 245, y: 100 },
  fence: { minX: 214, maxX: 280, minY: 42, maxY: 46, x: 247, y: 43 },
};

/** Lawn and fence pieces go in the garden's meadow, not the burrow. */
export const isOutdoor = (def: DecorDef): boolean => def.zone === 'lawn' || def.zone === 'fence';

/** The meadow's placed pieces. */
export function meadowItems(b: BurrowState): PlacedItem[] {
  return b.items.filter((i) => { const d = byId(i.id); return i.placed && !!d && isOutdoor(d); });
}

/** Ids of the helping pieces out in the meadow, each once: what pet.meadow should hold. */
export function meadowHelpers(b: BurrowState): string[] {
  return [...new Set(meadowItems(b).map((i) => i.id).filter((id) => !!byId(id)?.boost))].sort();
}

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
  /** Which room it's placed in, if not the first (a dug-out room: ROOMS). Put away, it has none. */
  room?: ExtraRoom;
}

// ---------------------------------------------------------------- rooms
//
// The burrow starts as one room; more are dug out with clover, in order.
// In memory every piece is in `items`, tagged with its `room` if it's in a
// dug-out one. Stored, those pieces go under `rooms[room].items` instead, so
// a version from before rooms (which keeps fields it doesn't know) leaves them
// alone rather than piling them into the first room.

export type RoomId = 'main' | ExtraRoom;
export type ExtraRoom = 'nook' | 'loft';
export const EXTRA_ROOMS: ExtraRoom[] = ['nook', 'loft'];
export const ROOMS: Record<RoomId, { name: string; price: number; blurb: string; after?: RoomId }> = {
  main: { name: 'Burrow', price: 0, blurb: '' },
  nook: { name: 'Nook', price: 15_000, blurb: 'A cozy nook dug out beside the burrow, with a window of its own.' },
  loft: { name: 'Loft', price: 30_000, blurb: 'A loft up among the roots, with beams overhead.', after: 'nook' },
};

/** The rooms she has, in order. */
export function roomsOf(b: BurrowState): RoomId[] {
  return ['main', ...EXTRA_ROOMS.filter((r) => b.rooms?.[r])];
}

export const itemRoom = (i: PlacedItem): RoomId => (i.placed && i.room) || 'main';

/** The burrow as seen from one room: its placed pieces, and everything put away. */
export function inRoom(b: BurrowState, room: RoomId): BurrowState {
  return { ...b, items: b.items.filter((i) => !i.placed || itemRoom(i) === room) };
}

/** Dig out a room (the clover is paid separately, from her). Returns the burrow unchanged if she has it. */
export function digRoom(b: BurrowState, room: ExtraRoom): BurrowState {
  if (b.rooms?.[room]) return b;
  return { ...b, rooms: { ...(b.rooms ?? {}), [room]: { items: [] } } };
}

/** Whether a room can be dug now: the one before it is dug. */
export function canDig(b: BurrowState, room: ExtraRoom): boolean {
  const after = ROOMS[room].after;
  return !b.rooms?.[room] && (!after || after === 'main' || !!b.rooms?.[after as ExtraRoom]);
}

export interface BurrowState {
  v: 2;
  rev: number;
  items: PlacedItem[];
  /** Walls, floor and window. Missing in older saves: the plain ones. */
  surfaces?: Surfaces;
  /**
   * Pieces this version doesn't know (a newer version added them), exactly as
   * stored. Never drawn; written back untouched by burrowForSave, so a newer
   * version finds them again.
   */
  keep?: unknown[];
  /**
   * Dug-out rooms. In memory each is just a marker (plus any fields a newer
   * version stored there): its pieces are in `items`, tagged. Stored, it
   * holds them (burrowForSave).
   */
  rooms?: Partial<Record<ExtraRoom, { items: unknown[] } & Record<string, unknown>>>;
  /** Like `keep`, for pieces a newer version put in a dug-out room. */
  keepRooms?: Partial<Record<ExtraRoom, unknown[]>>;
}

/** A new rabbit arrives to a cushion and a pot, so the room isn't bare. */
/**
 * A new rabbit's burrow: just a plant, so it looks lived-in. No bed: she
 * sleeps on the floor until the player gets her one (Getting started, step 1).
 */
export function starterBurrow(): BurrowState {
  return {
    v: 2,
    rev: 0,
    items: [
      { uid: 'starter-plant', id: 'plant', x: 12, y: 99, flip: false, placed: true },
    ],
  };
}

/** Whether a bed is placed, for where she sleeps and the "Get her a bed" goal. */
export function hasBed(b: BurrowState): boolean {
  return b.items.some((i) => i.placed && !!byId(i.id)?.bed);
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
  const keep: unknown[] = [];
  for (const raw of b.items) {
    const it = raw as Partial<PlacedItem> & { slot?: string | null };
    const def = typeof it.id === 'string' ? byId(it.id) : undefined;
    // a piece from a newer version: keep it as it is, for that version
    if (!def && b.v === 2 && typeof it.id === 'string' && typeof it.uid === 'string') { keep.push(raw); continue; }
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
  // pieces in dug-out rooms: into `items`, tagged, and each room left as a marker
  const rawRooms = (x as { rooms?: Record<string, unknown> }).rooms;
  const rooms: BurrowState['rooms'] = {};
  const keepRooms: NonNullable<BurrowState['keepRooms']> = {};
  for (const r of EXTRA_ROOMS) {
    const raw = rawRooms?.[r] as { items?: unknown[] } | undefined;
    if (!raw || typeof raw !== 'object') continue;
    rooms[r] = { ...raw, items: [] };
    for (const it of Array.isArray(raw.items) ? raw.items : []) {
      const p = it as Partial<PlacedItem>;
      const def = typeof p.id === 'string' ? byId(p.id) : undefined;
      if (!def && typeof p.id === 'string' && typeof p.uid === 'string') { (keepRooms[r] ??= []).push(it); continue; }
      if (!def || typeof p.uid !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      items.push({ uid: p.uid, id: def.id, ...clampToZone(def.zone, p.x, p.y), flip: !!p.flip, placed: true, room: r });
    }
  }
  // fields this version doesn't know are kept too (a newer version wrote them)
  const out = { ...(x as object), v: 2, rev: typeof b.rev === 'number' ? b.rev : 0, items } as BurrowState;
  delete out.keep;
  delete out.keepRooms;
  if (keep.length) out.keep = keep;
  if (Object.keys(rooms).length) out.rooms = rooms; else delete out.rooms;
  if (Object.keys(keepRooms).length) out.keepRooms = keepRooms;
  const raw = (x as { surfaces?: Partial<Surfaces> }).surfaces;
  if (raw && typeof raw === 'object') {
    // Kept as stored, unknown ids and all: surfacesOf shows the plain one for
    // anything this version can't draw, and a newer version still finds its own.
    const owned = Array.isArray(raw.owned) ? raw.owned.filter((id): id is string => typeof id === 'string') : [];
    out.surfaces = { owned, wall: String(raw.wall ?? ''), floor: String(raw.floor ?? ''), window: String(raw.window ?? '') };
  } else delete out.surfaces;
  return out;
}

/**
 * The burrow as it's stored: pieces in dug-out rooms go under their room,
 * and pieces from a newer version go back where they were.
 */
export function burrowForSave(b: BurrowState): unknown {
  const { keep, keepRooms, rooms, ...rest } = b;
  const main = b.items.filter((i) => itemRoom(i) === 'main').map(({ room: _r, ...i }) => i);
  const out: Record<string, unknown> = { ...rest, items: keep?.length ? [...main, ...keep] : main };
  if (rooms) {
    out.rooms = Object.fromEntries(EXTRA_ROOMS.filter((r) => rooms[r]).map((r) => [r, {
      ...rooms[r],
      items: [...b.items.filter((i) => itemRoom(i) === r).map(({ room: _r, ...i }) => i), ...(keepRooms?.[r] ?? [])],
    }]));
  }
  return out;
}
