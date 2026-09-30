// Friends: what a player shows their friends (and the home-screen widget), and
// the small daily gifts between them. Pure: main.ts does the calls.
//
// The showcase is a snapshot published through OR.showcase.publish. Friends'
// snapshots are someone else's data: everything read back is checked and
// clamped here before it's drawn, and unknown ids are dropped.

import { bondLevel, COATS, earsOf, newPet, timer, type Coat, type Ears, type Needs, type PetState } from './sim';
import { byId, clampToZone, EXTRA_ROOMS, isOutdoor, itemRoom, meadowItems, roomsOf, surfaceById, surfacesOf, type BurrowState, type ExtraRoom, type RoomId, type SurfaceKind } from './decor';
import { earn, friendPays, noteFriendship } from './economy';
import { DAY_ROLLOVER_HOUR, DECAY_AWAKE, FRIEND_CLOVER, HOUR_MS, VISIT_CARE, WELCOME } from './tuning';
import { dayKey, isNewDay } from './localtime';
import { CROPS, hasUpgrade, onVacation, outfitById, plots, type CropId } from './extras';
import { BUILDING_IDS, BUILDINGS, countOf, yardOf, type BuildingId } from './yard';
import { widgetSprites, type WidgetSprites } from './widgetSprites';
import { trip } from './forage';
import { COLLECTIBLES, COLLECTION_SETS, setComplete, type Collectible, type CollectionSet } from './collectibles';

/** Widget and friends' view of a rabbit. Field names are a contract with the widget; add, don't rename. */
export interface ShowcaseData {
  v: 1;
  name: string;
  coat: Coat;
  /** Missing from snapshots published before the ear choice; read as long. */
  ears: Ears;
  needs: Needs;
  simAtMs: number;
  napEndsAtMs: number | null;
  /** Home from foraging at; null when she's in. Missing from older snapshots. */
  outUntilMs?: number | null;
  vacationUntilMs: number | null;
  daysVisited: number;
  bondLevel: number;
  head: string | null;
  neck: string | null;
  /** Placed decor, where it sits. */
  items: { id: string; x: number; y: number; flip: boolean }[];
  /** Walls, floor and window (decor.ts SURFACES). Missing from older snapshots: the plain ones. */
  wall?: string;
  floor?: string;
  window?: string;
  /** Finds she hasn't got, so a friend can see which spare would help. Missing from older snapshots. */
  missing?: string[];
  /** Her garden, for friends to look round. Missing from older snapshots. */
  garden?: GardenShow;
  /** Her dug-out rooms' decor (decor.ts ROOMS), for friends to look round too. Only the rooms she has. */
  rooms?: Partial<Record<ExtraRoom, ShowItem[]>>;
  /**
   * For her own home-screen widget only: the platform keeps `widget` out of
   * what friends read, and readShowcase ignores it. Missing when her colours
   * don't fit the encoding (never, for today's art); the widget then draws a
   * stock rabbit in her coat.
   */
  widget?: { sprites: WidgetSprites };
}

const MAX_ITEMS = 40;
/** Each dug-out room shows at most this many pieces to friends, to keep the snapshot small. */
const MAX_ROOM_ITEMS = 20;
type ShowItem = { id: string; x: number; y: number; flip: boolean };

/** A room's placed indoor pieces, as friends see them. */
function showRoom(burrow: BurrowState, room: RoomId, max: number): ShowItem[] {
  return burrow.items.filter((i) => { const d = byId(i.id); return i.placed && !!d && !isOutdoor(d) && itemRoom(i) === room; })
    .slice(0, max).map((i) => ({ id: i.id, x: i.x, y: i.y, flip: i.flip }));
}

/** A friend's pieces, checked: ones this version knows, indoors, clamped into place. */
function readItems(raw: unknown, max: number): ShowItem[] {
  return (Array.isArray(raw) ? raw : []).slice(0, max).flatMap((i: unknown) => {
    const it = i as Record<string, unknown>;
    const def = it && typeof it.id === 'string' ? byId(it.id) : undefined;
    if (!def || isOutdoor(def)) return [];
    return [{ id: def.id, x: num(it.x, 0, 98, 49), y: num(it.y, 0, 118, 100), flip: it.flip === true }];
  });
}

/**
 * Her garden as a friend sees it: the plots and what's growing, what's built
 * in the yard, and the meadow's pieces (null while its gate is shut).
 */
export interface GardenShow {
  plots: ({ crop: CropId; plantedAtMs: number; readyAtMs: number } | null)[];
  yard: Partial<Record<BuildingId, number>>;
  sheds: number;
  meadow: { id: string; x: number; y: number; flip: boolean }[] | null;
}

function gardenShow(pet: PetState, burrow: BurrowState): GardenShow {
  const y = yardOf(pet);
  return {
    plots: plots(pet).map((p) => (p ? { crop: p.crop, plantedAtMs: p.plantedAtMs, readyAtMs: p.readyAtMs } : null)),
    yard: Object.fromEntries(BUILDING_IDS.map((id) => [id, countOf(pet, id)]).filter(([, n]) => n)),
    sheds: y.sheds,
    meadow: hasUpgrade(pet, 'meadow') ? meadowItems(burrow).map((i) => ({ id: i.id, x: i.x, y: i.y, flip: i.flip })) : null,
  };
}

function readGarden(raw: unknown): GardenShow | undefined {
  const g = raw as Record<string, unknown> | null;
  if (!g || typeof g !== 'object') return undefined;
  const ms = (x: unknown) => num(x, 0, 8.64e15, 0);
  const plotsIn = Array.isArray(g.plots) ? g.plots.slice(0, 5) : [];
  const yard = (g.yard ?? {}) as Record<string, unknown>;
  return {
    plots: plotsIn.map((p: unknown) => {
      const q = p as Record<string, unknown> | null;
      return q && typeof q.crop === 'string' && q.crop in CROPS ? { crop: q.crop as CropId, plantedAtMs: ms(q.plantedAtMs), readyAtMs: ms(q.readyAtMs) } : null;
    }),
    yard: Object.fromEntries(BUILDING_IDS.map((id) => [id, Math.round(num(yard[id], 0, BUILDINGS[id].max, 0))]).filter(([, n]) => n)),
    sheds: Math.round(num(g.sheds, 0, 2, 0)),
    meadow: !Array.isArray(g.meadow) ? null : g.meadow.slice(0, MAX_ITEMS).flatMap((i: unknown) => {
      const it = i as Record<string, unknown>;
      const def = it && typeof it.id === 'string' ? byId(it.id) : undefined;
      if (!def || !isOutdoor(def)) return [];
      return [{ id: def.id, ...clampToZone(def.zone, num(it.x, 0, 400, 0), num(it.y, 0, 200, 0)), flip: it.flip === true }];
    }),
  };
}

/**
 * A stand-in pet holding just a friend's garden, so the garden scene can draw
 * it: their plots, the upgrades those need, their yard and the meadow gate.
 */
export function friendGardenPet(d: ShowcaseData): PetState | null {
  if (!d.garden) return null;
  const g = d.garden;
  const stub = newPet(`friend:${d.name}`, d.name, d.coat, 0, 'UTC');
  stub.upgrades = [...(['plot2', 'plot3', 'plot4', 'plot5'] as const).slice(0, Math.max(0, g.plots.length - 1)), ...(g.meadow ? ['meadow'] : [])];
  stub.garden = { plots: g.plots.map((p) => (p ? { ...p } : null)) };
  stub.yard = { counts: { ...g.yard }, sheds: g.sheds, stored: 0, atMs: null };
  return stub;
}

export function buildShowcase(pet: PetState, burrow: BurrowState): ShowcaseData {
  const nap = timer(pet, 'nap');
  const round = (n: number) => Math.round(n);
  return {
    v: 1,
    name: pet.name,
    coat: pet.coat,
    ears: earsOf(pet),
    needs: { hunger: round(pet.needs.hunger), happy: round(pet.needs.happy), energy: round(pet.needs.energy), clean: round(pet.needs.clean) },
    simAtMs: pet.simAtMs,
    napEndsAtMs: nap ? nap.endsAtMs : null,
    outUntilMs: trip(pet)?.endsAtMs ?? null,
    vacationUntilMs: pet.vacationUntilMs ?? null,
    daysVisited: pet.daysVisited,
    bondLevel: bondLevel(pet.bond).level,
    head: pet.wardrobe?.head ?? null,
    neck: pet.wardrobe?.neck ?? null,
    // the burrow's first room (the meadow's pieces go with the garden, the other rooms under `rooms`)
    items: showRoom(burrow, 'main', MAX_ITEMS),
    ...(roomsOf(burrow).length > 1 ? { rooms: Object.fromEntries(EXTRA_ROOMS.filter((r) => roomsOf(burrow).includes(r)).map((r) => [r, showRoom(burrow, r, MAX_ROOM_ITEMS)])) } : {}),
    ...(({ wall, floor, window }) => ({ wall, floor, window }))(surfacesOf(burrow)),
    missing: COLLECTIBLES.filter((c) => !(pet.collection?.[c.id] ?? 0)).map((c) => c.id),
    garden: gardenShow(pet, burrow),
    ...(() => {
      const sprites = widgetSprites(pet.coat, { head: pet.wardrobe?.head ?? null, neck: pet.wardrobe?.neck ?? null, ears: earsOf(pet) });
      return sprites ? { widget: { sprites } } : {};
    })(),
  };
}

/**
 * What changed enough to publish again: everything a friend would see, but
 * not the needs, which drift every ten minutes (a periodic publish covers
 * those, for the widget).
 */
export function showcaseSignature(d: ShowcaseData): string {
  const { needs: _n, simAtMs: _s, ...rest } = d;
  return JSON.stringify(rest);
}

const num = (x: unknown, lo: number, hi: number, dflt: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt;
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : null);

/** A friend's snapshot, checked. Null if it isn't a Rabbit Pets rabbit at all. */
export function readShowcase(raw: unknown): ShowcaseData | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.v !== 1) return null;
  const name = str(d.name, 16);
  const coat = (COATS as readonly string[]).includes(d.coat as string) ? (d.coat as Coat) : null;
  if (!name || !coat) return null;
  const n = (d.needs ?? {}) as Record<string, unknown>;
  const outfit = (id: unknown) => (typeof id === 'string' && outfitById(id) ? id : null);
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    v: 1,
    name,
    coat,
    ears: earsOf(d),
    needs: { hunger: num(n.hunger, 0, 100, 70), happy: num(n.happy, 0, 100, 70), energy: num(n.energy, 0, 100, 70), clean: num(n.clean, 0, 100, 70) },
    simAtMs: num(d.simAtMs, 0, 8.64e15, 0),
    napEndsAtMs: d.napEndsAtMs == null ? null : num(d.napEndsAtMs, 0, 8.64e15, 0),
    outUntilMs: d.outUntilMs == null ? null : num(d.outUntilMs, 0, 8.64e15, 0),
    vacationUntilMs: d.vacationUntilMs == null ? null : num(d.vacationUntilMs, 0, 8.64e15, 0),
    daysVisited: Math.round(num(d.daysVisited, 1, 100_000, 1)),
    bondLevel: Math.round(num(d.bondLevel, 1, 99, 1)),
    head: outfit(d.head),
    neck: outfit(d.neck),
    items: items.slice(0, MAX_ITEMS).flatMap((i: unknown) => {
      const it = i as Record<string, unknown>;
      if (!it || typeof it.id !== 'string' || !byId(it.id)) return [];
      return [{ id: it.id, x: num(it.x, 0, 98, 49), y: num(it.y, 0, 118, 100), flip: it.flip === true }];
    }),
    wall: surface(d.wall, 'wall'),
    floor: surface(d.floor, 'floor'),
    window: surface(d.window, 'window'),
    ...(d.garden ? { garden: readGarden(d.garden) } : {}),
    ...(d.rooms && typeof d.rooms === 'object' ? { rooms: Object.fromEntries(EXTRA_ROOMS.filter((r) => r in (d.rooms as object)).map((r) => [r, readItems((d.rooms as Record<string, unknown>)[r], MAX_ROOM_ITEMS)])) } : {}),
    ...(Array.isArray(d.missing) ? { missing: COLLECTIBLES.filter((c) => (d.missing as unknown[]).includes(c.id)).map((c) => c.id) } : {}),
  };
}

const PLAIN_SURFACE: Record<SurfaceKind, string> = { wall: 'plainwall', floor: 'plainfloor', window: 'roundwindow' };
function surface(x: unknown, kind: SurfaceKind): string {
  return typeof x === 'string' && surfaceById(x)?.kind === kind ? x : PLAIN_SURFACE[kind];
}

// ---------------------------------------------------------------- gifts

// Gifts are things. The golden carrot is the one that becomes clover (it's
// grown, so it's the generous one); a clover bundle is only ever received now,
// from a friend on an older version.
export type GiftKind = 'golden' | 'berry' | 'hug' | 'clover';
/** What can be sent. The golden carrot only when she has one in the pantry. */
export const GIFT_KINDS: GiftKind[] = ['golden', 'berry', 'hug'];

export const GIFT_INFO: Record<GiftKind, { name: string; art: string; gives: string }> = {
  golden: { name: 'A golden carrot', art: 'golden', gives: `+${FRIEND_CLOVER.goldenGift} clover for them` },
  berry: { name: 'A strawberry', art: 'strawberry', gives: 'for her pantry' },
  hug: { name: 'A warm hello', art: 'heart', gives: '+10 joy' },
  clover: { name: 'A bundle of clover', art: 'clover', gives: `+${FRIEND_CLOVER.legacyBundle} clover` },
};

/** Sending a golden carrot takes one from her pantry (after the send succeeds). Null if she has none. */
export function takeGolden(s: PetState): PetState | null {
  const golden = s.pantry?.golden ?? 0;
  if (golden < 1) return null;
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  state.pantry = { berries: 0, ...state.pantry, golden: golden - 1 };
  return state;
}

// ---------------------------------------------------------------- the welcome line

export const welcomeLevel = (s: PetState): number => Math.max(0, Math.min(WELCOME.pieces.length, s.welcome ?? 0));

/** What a visit pays her, made or received: flat, plus her welcome pieces. */
export const visitPay = (s: PetState): number => FRIEND_CLOVER.visit + WELCOME.step * welcomeLevel(s);

/** The next welcome piece to buy, or null once she has them all. */
export function nextWelcome(s: PetState): (typeof WELCOME.pieces)[number] | null {
  return WELCOME.pieces[welcomeLevel(s)] ?? null;
}

/** Buy the next welcome piece (its decor goes in the meadow: main.ts). */
export function buyWelcome(s: PetState): { ok: true; state: PetState; piece: string } | { ok: false; reason: 'done' | 'broke' } {
  const next = nextWelcome(s);
  if (!next) return { ok: false, reason: 'done' };
  if (s.clover < next.price) return { ok: false, reason: 'broke' };
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  state.clover -= next.price;
  state.welcome = welcomeLevel(s) + 1;
  return { ok: true, state, piece: next.id };
}

/** A gift's info from its kind as a friend sent it, or null for one we don't know. */
export function giftInfo(kind: unknown): (typeof GIFT_INFO)[GiftKind] | null {
  if ((GIFT_KINDS as unknown[]).includes(kind)) return GIFT_INFO[kind as GiftKind];
  const c = findOfGift(kind);
  return c ? { name: c.name, art: c.id, gives: 'for her shelf' } : null;
}

// A spare find (one she has two or more of) can go to a friend as their gift
// for the day, so bad luck with duplicates can finish someone else's set.
// It travels as the kind `find-<collectible id>`.

const FIND_GIFT = 'find-';

export function findGiftKind(id: string): string {
  return FIND_GIFT + id;
}

/** The collectible a gift kind carries, or null if it isn't a find we know. */
export function findOfGift(kind: unknown): Collectible | null {
  if (typeof kind !== 'string' || !kind.startsWith(FIND_GIFT)) return null;
  const id = kind.slice(FIND_GIFT.length);
  return COLLECTIBLES.find((c) => c.id === id) ?? null;
}

/** What she could give away: finds she has more than one of, rarest first. */
export function spareFinds(s: PetState): Collectible[] {
  const order = { keepsake: 0, event: 1, rare: 2, common: 3 } as const;
  return COLLECTIBLES.filter((c) => (s.collection?.[c.id] ?? 0) > 1).sort((a, b) => order[a.rarity] - order[b.rarity]);
}

/** Give one spare away (after the send succeeds). Null if it isn't a spare. */
export function giveFind(s: PetState, id: string): PetState | null {
  const have = s.collection?.[id] ?? 0;
  if (have < 2) return null;
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  state.collection = { ...state.collection, [id]: have - 1 };
  return state;
}

/**
 * Pay out a claimed gift. A find goes on her shelf (and may finish a set).
 * Unknown kinds (from a newer version, a find included) still give clover. Clover only pays for the first few clover gifts a day, and only when
 * the sender counts (a verified account; `counts` from the inbox, true until
 * the platform sends it).
 */
export function applyGift(s: PetState, gift: { kind: string; from?: string; counts?: boolean }, nowMs: number, tz: string): { state: PetState; clover: number; completed?: CollectionSet } {
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  if (gift.from) noteFriendship(state, gift.from, 'in', nowMs, tz);
  const find = findOfGift(gift.kind);
  if (find) {
    const before = COLLECTION_SETS.filter((set) => setComplete(state.collection, set));
    state.collection = { ...(state.collection ?? {}), [find.id]: (state.collection?.[find.id] ?? 0) + 1 };
    const completed = COLLECTION_SETS.find((set) => setComplete(state.collection, set) && !before.includes(set));
    return { state, clover: 0, ...(completed ? { completed } : {}) };
  }
  if (gift.kind === 'berry') {
    state.pantry = { berries: 0, golden: 0, ...(state.pantry ?? {}) };
    state.pantry.berries += 1;
  } else if (gift.kind === 'hug') {
    state.needs.happy = Math.min(100, state.needs.happy + 10);
  } else if (gift.counts !== false && friendPays(state, 'giftClover', nowMs, tz)) {
    // a golden carrot; or a clover bundle, or a kind from a newer version: some clover either way
    return { state, clover: earn(state, 'giftClover', gift.kind === 'golden' ? FRIEND_CLOVER.goldenGift : FRIEND_CLOVER.legacyBundle) };
  }
  return { state, clover: 0 };
}

/** Sending a gift: a day of friendship. (No clover: gifts are the giving.) */
export function rewardGiftSent(s: PetState, to: string, nowMs: number, tz: string): { state: PetState; clover: number } {
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  noteFriendship(state, to, 'out', nowMs, tz);
  return { state, clover: 0 };
}

// ---------------------------------------------------------------- visits

/** The care a visitor picks (visits.record's `kind`). */
export type VisitKind = 'pat' | 'snack' | 'brush';
export const VISIT_KINDS: VisitKind[] = ['pat', 'snack', 'brush'];
export const VISIT_INFO: Record<VisitKind, { label: string; art: string; need: 'happy' | 'hunger' | 'clean'; line: (name: string) => string; did: string }> = {
  pat: { label: 'Pat', art: 'heart', need: 'happy', line: (n) => `${n} leans into the pat.`, did: 'gave her a pat' },
  snack: { label: 'Snack', art: 'carrot', need: 'hunger', line: (n) => `${n} nibbles the snack you left.`, did: 'left a snack' },
  brush: { label: 'Brush', art: 'droplet', need: 'clean', line: (n) => `${n}'s fur is shiny now.`, did: 'brushed her' },
};

/** A visit's info from its kind as the visitor sent it (`snack`, or `snack-cozy` with a note), or null for one we don't know. */
export function visitInfo(kind: unknown): (typeof VISIT_INFO)[VisitKind] | null {
  const care = typeof kind === 'string' ? kind.split('-')[0] : kind;
  return (VISIT_KINDS as unknown[]).includes(care) ? VISIT_INFO[care as VisitKind] : null;
}

/**
 * A friend's rabbit's needs now: her snapshot's, worn down at the awake rates
 * for the hours since it was taken (a snapshot can be a day old). Near
 * enough to pick a care by; on holiday her needs are paused, so they stay.
 */
export function friendNeeds(d: ShowcaseData, nowMs: number): Needs {
  const away = !!d.vacationUntilMs && d.vacationUntilMs > nowMs;
  const hours = away ? 0 : Math.max(0, nowMs - d.simAtMs) / HOUR_MS;
  const n = (k: keyof Needs) => Math.max(0, Math.min(100, d.needs[k] - DECAY_AWAKE[k] * hours));
  return { hunger: n('hunger'), happy: n('happy'), energy: n('energy'), clean: n('clean') };
}

/** Below this, a need is worth a visitor's care. */
const HINT_BELOW = 70;
const HINT_WORD: Record<VisitKind, string> = { snack: 'peckish', pat: 'a bit lonely', brush: 'a bit dusty' };

/** The care that would help a friend's rabbit most, and a word for how she is; null when she's doing fine. */
export function careHint(needs: Needs): { kind: VisitKind; word: string } | null {
  const kind = [...VISIT_KINDS].sort((a, b) => needs[VISIT_INFO[a].need] - needs[VISIT_INFO[b].need])[0]!;
  return needs[VISIT_INFO[kind].need] < HINT_BELOW ? { kind, word: HINT_WORD[kind] } : null;
}

/**
 * Where a friend goes in the list today: 0 came by and hasn't been visited
 * back, 1 still to visit, 2 visited today (done).
 */
export function friendRank(f: { visitedYou: boolean; visited: boolean }): 0 | 1 | 2 {
  return f.visited ? 2 : f.visitedYou ? 0 : 1;
}

// ---------------------------------------------------------------- the guest book
//
// A visitor can leave a note: one of these lines, never their own words (the
// platform only carries a short kind, and a line picked from a list needs no
// moderation). It rides on the visit's kind after the care: `snack-cozy`.
// `{name}` is the host's rabbit.

export const GUEST_NOTES = {
  cozy: 'Your burrow is so cozy!',
  sweet: '{name} is the sweetest.',
  decor: "Love what you've done with the place.",
  hello: 'Just popping in to say hello!',
  garden: 'Your garden is looking lovely.',
  again: "Can't wait to visit again!",
} as const;
export type GuestNote = keyof typeof GUEST_NOTES;

/** The kind to record for a visit: the care, and the note if there is one. */
export function visitKind(care: VisitKind, note?: GuestNote | null): string {
  return note ? `${care}-${note}` : care;
}

/** The note on a visit, if it has one we know. */
export function noteOf(kind: unknown): GuestNote | null {
  if (typeof kind !== 'string') return null;
  const n = kind.split('-')[1];
  return n && Object.prototype.hasOwnProperty.call(GUEST_NOTES, n) ? (n as GuestNote) : null;
}

export function noteText(note: GuestNote, hostRabbit: string): string {
  return GUEST_NOTES[note].replace('{name}', hostRabbit);
}

/** A visit as the game uses it: the inbox row, trimmed. */
export interface VisitIn {
  visitUuid: string;
  kind: string;
  visitedAt: string;
  seenAt: string | null;
  from: { uuid: string; username: string };
  showcase: unknown;
  counts?: boolean;
}

/** The visitor's clover for a visit with care (visitPay), for their first few visits a day. */
export function rewardVisit(s: PetState, to: string, nowMs: number, tz: string): { state: PetState; clover: number } {
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  noteFriendship(state, to, 'out', nowMs, tz);
  const clover = friendPays(state, 'visit', nowMs, tz) ? earn(state, 'visit', visitPay(state)) : 0;
  return { state, clover };
}

/**
 * Pay out visits the host has just seen (only those visits.seen says it
 * changed, so two devices can't both pay). Each boosts one need, for the
 * first few visits a day and not while she's on holiday; clover for the first
 * few a day from friends who count.
 */
export function applyVisits(s: PetState, visits: VisitIn[], nowMs: number, tz: string): { state: PetState; clover: number; cared: number } {
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  let clover = 0, cared = 0;
  for (const v of visits) {
    noteFriendship(state, v.from.uuid, 'in', nowMs, tz);
    const info = visitInfo(v.kind);
    const vc = isNewDay(state.visitCare?.day, today) ? { day: today, count: 0 } : state.visitCare!;
    if (info && vc.count < VISIT_CARE.perDay && !onVacation(state, nowMs)) {
      state.needs[info.need] = Math.min(100, state.needs[info.need] + VISIT_CARE.boost);
      state.visitCare = { day: vc.day, count: vc.count + 1 };
      cared++;
    }
    if (v.counts !== false && friendPays(state, 'hosted', nowMs, tz)) clover += earn(state, 'hosted', visitPay(state));
  }
  return { state, clover, cared };
}

/**
 * Who's visiting now: unseen visits, plus ones seen since today's 05:00, one
 * per friend, newest first. Each comes with the visitor's snapshot, checked.
 */
export function guestsToShow(visits: VisitIn[], nowMs: number, tz: string): { visit: VisitIn; data: ShowcaseData }[] {
  const dayStart = startOfDay(nowMs, tz);
  const seen = new Set<string>();
  const out: { visit: VisitIn; data: ShowcaseData }[] = [];
  for (const v of [...visits].sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt))) {
    if (seen.has(v.from.uuid)) continue;
    if (v.seenAt && Date.parse(v.seenAt) < dayStart) continue;
    const data = readShowcase(v.showcase);
    if (!data) continue;
    seen.add(v.from.uuid);
    out.push({ visit: v, data });
  }
  return out;
}

/** The last day rollover (05:00 local) at or before `ms`. */
function startOfDay(ms: number, tz: string): number {
  const key = dayKey(ms, tz, DAY_ROLLOVER_HOUR);
  // step back a quarter hour at a time to the rollover (zones can be :30 or :45
  // off UTC); at most a day of steps
  const step = HOUR_MS / 4;
  let t = ms - (ms % step);
  while (dayKey(t - step, tz, DAY_ROLLOVER_HOUR) === key) t -= step;
  return t;
}
