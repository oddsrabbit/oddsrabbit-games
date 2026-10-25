// The burrow scene. Everything is drawn at 1x onto a 98x118 canvas that CSS
// scales up by a whole number with smoothing off, so every art pixel stays a
// crisp square. The renderer owns only presentation state (where she is
// standing, which way she faces, floating hearts); the game state it draws
// comes in each frame.

import { drawBurrow, drawWindowView, PLAIN_ROOM, ROOM_ARCH, SCENE_H, SCENE_W, WALL_INSET, windowOf, type RoomStyle } from './art/burrow';
import { drawGlow, drawItem, type ItemArt } from './art/items';
import { lcg, resizeCanvas, toSprite, type Sprite } from './art/pixels';
import { DARK_COATS, drawPaw, drawRabbit, dressKey, furMask, RABBIT_GROUND, RABBIT_H, RABBIT_W, type Dress, type Face, type Frame } from './art/rabbit';
import { byId, type BurrowState, type DecorDef, type PlacedItem } from './decor';
import type { Coat, FoodReaction, Mood, NeedKey } from './sim';
import { LOW_NEED, THRIVING } from './tuning';
import type { Season, Weather } from './world';

export interface SceneModel {
  coat: Coat;
  /** Dark outside. Awake, the lamps are on; asleep, the room is dim. */
  night: boolean;
  mood: Mood;
  burrow: BurrowState;
  /** Decorating hides the thought bubble and keeps her out of the way. */
  decorating: boolean;
  /** The piece being moved, outlined while decorating. */
  selected: string | null;
  /** Her outfit and ears. */
  dress?: Dress;
  /** What the window shows. */
  season?: Season;
  weather?: Weather;
  /** Visiting a friend: no wandering off-script, no thought bubbles. */
  guest?: boolean;
  /** Away on holiday: the burrow is empty. */
  absent?: boolean;
  /** Walls, floor and window (decor.ts surfacesOf). */
  room?: RoomStyle;
  /** Tonight's moon phase, for the moon window. */
  moon?: number;
  /** Friends' rabbits in the burrow now (guests.ts), keyed by the friend's id so each keeps its place. */
  guests?: { id: string; coat: Coat; dress?: Dress; parcel?: boolean }[];
  /**
   * The Friends page's porch: a room full of everyone who came by lately,
   * three deep on the floor, hopping about, chasing each other and doing
   * binkies, rather than two guests pottering quietly.
   */
  lively?: boolean;
  /** Picks her favourite piece of decor, which changes day to day: her id and the date. */
  seed?: string;
  /** A wild visitor in the burrow (wildlife.ts CritterId; its art has the same name). */
  critter?: string | null;
  /** The player's local time, for the clocks' hands. */
  time?: { hour: number; minute: number };
  /**
   * Her needs, for how she looks: dirt on her coat as she gets grubby, heavy
   * eyes and drooping ears when she's tired, sad brows when she's lonely, a
   * rumbling tummy when she's hungry, a sparkle when she's thriving.
   */
  needs?: Record<NeedKey, number>;
}

/**
 * How grubby she looks, by her Clean need: smudges appear from `from`, one
 * more of DIRT_SPOTS for each step down; straw sticks to her coat under
 * `straw`, and flies buzz round her under `flies`.
 */
export const DIRT = { from: 60, straw: 35, flies: 15 } as const;
const DIRT_SPOTS = 16;
/** Her looks, from her needs: smudges to show, straw, flies, ears and face. */
export interface Look { spots: number; straw: boolean; flies: boolean; tired: boolean; lonely: boolean; hungry: boolean; thriving: boolean }

export function lookOf(needs: Record<NeedKey, number> | undefined): Look {
  const n = needs ?? { hunger: 100, happy: 100, energy: 100, clean: 100 };
  const spots = n.clean >= DIRT.from ? 0 : Math.min(DIRT_SPOTS, Math.ceil(((DIRT.from - n.clean) / DIRT.from) * DIRT_SPOTS));
  return {
    spots, straw: n.clean < DIRT.straw, flies: n.clean < DIRT.flies,
    tired: n.energy < LOW_NEED, lonely: n.happy < LOW_NEED, hungry: n.hunger < LOW_NEED,
    thriving: n.hunger >= THRIVING.above && n.happy >= THRIVING.above && n.clean >= THRIVING.above,
  };
}

/** Where a tap or stroke lands on her: ears and the top of her head, her nose, her feet, or the rest of her. */
export type PetZone = 'ears' | 'nose' | 'feet' | 'body';

/**
 * A clock hand's pixels out from the centre, pointing at 12, 1 and 2; the
 * other marks turn these a quarter at a time. The hour hand is the first two.
 */
const CLOCK_HAND: [number, number][][] = [
  [[0, -1], [0, -2], [0, -3]],
  [[0, -1], [1, -2], [1, -3]],
  [[1, 0], [2, -1], [3, -1]],
];

/**
 * Where a wild visitor can sit, best first: the front corners and the middle,
 * clear of her and of visiting friends. It takes the first one no decor is on.
 */
const CRITTER_SPOTS = [{ x: 88, y: 115 }, { x: 10, y: 115 }, { x: 70, y: 116 }, { x: 30, y: 116 }];

/**
 * What she's doing when nothing needs her, for the mood line. `piece` is the
 * decor she's by (a favourite spot).
 */
export type Activity =
  | { kind: 'fire' }
  | { kind: 'seat' | 'window'; weather: Weather }
  | { kind: 'favourite'; piece: string };

/**
 * An idle moment. A spot she walks to and stays at for a while (standing on
 * a window seat, curled by the fire, beside a favourite piece), or a binky:
 * a happy hop with a twist in the air.
 */
type Idle =
  | { kind: 'spot'; activity: Activity; x: number; standY: number; depth: number; facing: 1 | -1; until: number }
  | { kind: 'binky'; start: number; turned: boolean };

const BINKY_MS = 700;
/** How long she stays at a spot, give or take: long enough to notice, and to read about. */
const SPOT_MS = [20_000, 40_000] as const;

/** Visiting rabbits stand at the front of the floor, a step in front of her. */
const GUEST_Y = 110;
/** How often a guest wanders somewhere else, give or take. */
const GUEST_WANDER_MS = [6_000, 14_000] as const;
/** Lively, guests stand in three rows, back to front, so a room of six still fits. */
const GUEST_ROWS = [103, 109, 115] as const;
const LIVELY_WANDER_MS = [1_500, 4_500] as const;
/** A binky: a high twisting leap, this long, now and then when lively. */
const BINKY_LEAP_MS = 650;
/** A visiting rabbit's walk: where it is (and which row), where it's going, its next binky, and when it last got a pat. */
interface GuestWalk { x: number; y: number; targetX: number; facing: 1 | -1; hopPhase: number; nextWander: number; happyUntil: number; arriving: boolean; binkyAt: number; nextBinky: number; turned: boolean }

export interface Box { x: number; y: number; w: number; h: number }

/** Top of the arched ceiling at a column, for hanging ropes. */
function ceilingY(x: number): number {
  const t = (x + 0.5 - 49) / 46;
  return Math.ceil(64 - 58 * Math.sqrt(Math.max(0, 1 - t * t))) + 1;
}

/**
 * What she's doing because of you. 'melt': stroked behind the ears, she goes
 * soft, ears flat; 'boop': a tap on the nose makes her sneeze; 'thump': she
 * doesn't like her feet touched; 'scrub': being washed, kept going by scrub().
 */
type Reaction = 'eating' | 'happy' | 'clean' | 'play' | 'melt' | 'boop' | 'thump' | 'scrub';


/**
 * A meal: she lifts it in her paws and nibbles it away from the top, eyes
 * shut, then swallows at EAT_SWALLOW_MS and finishes by how she took it.
 */
export const EAT_MS = 2300;
export const EAT_SWALLOW_MS = 1850;
const REACTION_MS: Record<Reaction, number> = { eating: EAT_MS, happy: 1400, clean: 1400, play: 2200, melt: 2200, boop: 1000, thump: 700, scrub: 1500 };
/** A sneeze's squeezed eyes, at the start of a boop. */
const SNEEZE_MS = 380;
const EAT_LIFT_MS = 220;
/** The food goes down between these two times. */
const EAT_FROM_MS = 300, EAT_TO_MS = 1700;
/** When a nibble knocks crumbs off. */
const EAT_CRUMBS_MS = [500, 900, 1300, 1650];
interface Particle { art: ItemArt; x: number; y: number; vy: number; born: number; life: number }

const WALK_MIN = 28;
const WALK_MAX = 60;
const STAND_Y = 106;
// Follows the setting live, not just as it was at load.
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reduceMotion = !!motionQuery?.matches;
motionQuery?.addEventListener?.('change', (e) => { reduceMotion = e.matches; });

export class Scene {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bgs = new Map<string, Sprite>();
  private readonly items = new Map<string, Sprite>();
  private readonly glow: Sprite;
  private rabbitCache = new Map<string, Sprite>();
  /** Which pixels of each cached sprite are fur, for dirt (by the same key). */
  private furCache = new Map<string, boolean[][]>();

  private x = 40;
  private targetX = 40;
  /** 1 looks left, -1 right. The art faces right, so 1 is drawn mirrored. */
  private facing: 1 | -1 = 1;
  private nextWander = 0;
  private hopPhase = 0;
  private reaction: { kind: Reaction; start: number; until: number; art?: ItemArt; outcome?: FoodReaction } | null = null;
  private particles: Particle[] = [];
  private blinkAt = 2000;
  private readonly soil: HTMLCanvasElement;
  private soilPattern: CanvasPattern | null = null;
  private lamplight: CanvasGradient | null = null;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    this.soil = makeSoilTile();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.glow = toSprite(drawGlow());
  }

  /** The room for a style, day or night, drawn once. */
  private room(style: RoomStyle, night: boolean): Sprite {
    const key = `${style.wall}:${style.floor}:${style.window}:${style.variant ?? ''}:${night}`;
    let s = this.bgs.get(key);
    if (!s) {
      if (this.bgs.size > 8) this.bgs.clear();
      s = toSprite(drawBurrow(night, style));
      this.bgs.set(key, s);
    }
    return s;
  }

  item(art: ItemArt): Sprite {
    let s = this.items.get(art);
    if (!s) { s = toSprite(drawItem(art)); this.items.set(art, s); }
    return s;
  }

  rabbit(coat: Coat, face: Face, frame: Frame, dress?: Dress, droop = 0): Sprite {
    return this.rabbitWithFur(coat, face, frame, dress, droop).sprite;
  }

  private rabbitWithFur(coat: Coat, face: Face, frame: Frame, dress?: Dress, droop = 0): { sprite: Sprite; fur: boolean[][] } {
    const key = `${coat}:${face}:${frame}:${dressKey(dress)}:${droop}`;
    let s = this.rabbitCache.get(key);
    let fur = this.furCache.get(key);
    if (!s || !fur) {
      // outfits change rarely; don't grow forever
      if (this.rabbitCache.size > 90) { this.rabbitCache.clear(); this.furCache.clear(); }
      const g = drawRabbit(coat, face, frame, dress, undefined, droop);
      s = toSprite(g);
      fur = furMask(coat, g);
      this.rabbitCache.set(key, s);
      this.furCache.set(key, fur);
    }
    return { sprite: s, fur };
  }

  private views = new Map<string, Sprite>();
  /** The sky, weather and season through the window, plus falling rain, snow or leaves. */
  private drawWindow(m: SceneModel, now: number): void {
    const season = m.season ?? 'summer', weather = m.weather ?? 'sunny';
    // the moon phase changes slowly; a tenth of a phase is plenty of steps
    const phase = m.room?.window === 'moonwindow' && m.moon !== undefined ? Math.round(m.moon * 30) / 30 : null;
    const mirror = m.room?.variant === 'nook';
    const WINDOW = windowOf(m.room);
    const key = `${season}:${weather}:${m.night}:${phase}:${mirror}`;
    let v = this.views.get(key);
    if (!v) {
      if (this.views.size > 24) this.views.clear();
      v = toSprite(drawWindowView(season, weather, m.night, phase, mirror));
      this.views.set(key, v);
    }
    const ctx = this.ctx;
    ctx.drawImage(v.canvas, 0, 0);
    if (weather !== 'rain' && weather !== 'snow' && weather !== 'leaves') return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(WINDOW.x, WINDOW.y, WINDOW.r - 2, 0, Math.PI * 2);
    ctx.clip();
    const t = reduceMotion ? 0 : now / 1000;
    const span = WINDOW.r * 2;
    const x0 = WINDOW.x - WINDOW.r, y0 = WINDOW.y - WINDOW.r;
    const n = weather === 'rain' ? 10 : weather === 'snow' ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const seed = (i * 73) % span, phase = (i * 41) % span;
      if (weather === 'rain') {
        ctx.fillStyle = m.night ? '#5A6E9A' : '#6F8FB0';
        const y = (phase + t * 26) % span, x = (seed + y * 0.2) % span;
        ctx.fillRect(Math.floor(x0 + x), Math.floor(y0 + y), 1, 2);
      } else if (weather === 'snow') {
        ctx.fillStyle = '#FFFFFF';
        const y = (phase + t * 5) % span, x = (seed + Math.sin(t + i) * 1.5 + span) % span;
        ctx.fillRect(Math.floor(x0 + x), Math.floor(y0 + y), 1, 1);
      } else {
        ctx.fillStyle = i % 2 ? '#D9772E' : '#B8452E';
        const y = (phase + t * 6) % span, x = (seed + t * 8) % span;
        ctx.fillRect(Math.floor(x0 + x), Math.floor(y0 + y), 1, 1);
      }
    }
    ctx.restore();
  }

  /** The rabbit's box in scene pixels, for tap-to-pet: where she's standing, up on a seat or in bed too. */
  rabbitBox(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 14, y: this.lastStandY - 32, w: 28, h: 32 };
  }

  /** `outcome`, for a meal: how she took it (sim.ts foodReaction), which sets how she finishes. */
  react(kind: Reaction, now: number, art?: ItemArt, outcome?: FoodReaction): void {
    this.reaction = { kind, start: now, until: now + REACTION_MS[kind], art, outcome };
    if (kind === 'happy' || kind === 'play') this.burst('heart', 3, now);
    if (kind === 'melt') this.burst('heart', 4, now);
    if (kind === 'clean') this.burst('sparkle', 4, now);
    if (kind === 'boop') this.burst('puff', 1, now + SNEEZE_MS - 80, { x: this.x + (this.facing === 1 ? -8 : 8), y: this.lastStandY - 16 });
    if (kind === 'thump') this.burst('puff', 2, now + 60, { x: this.x, y: this.lastStandY - 3 });
  }

  /**
   * Where a point on her lands, in her own pixels, or null if it misses:
   * the top of her head and ears, her nose, her feet or the rest of her.
   */
  petZone(px: number, py: number): PetZone | null {
    const b = this.rabbitBox();
    if (px < b.x || px > b.x + b.w || py < b.y - 6 || py > b.y + b.h) return null;
    const { lx, ly } = this.local(px, py);
    if (ly < 15) return 'ears';
    if (ly >= 33) return 'feet';
    if (Math.abs(lx - 19.5) <= 3.5 && ly >= 19 && ly <= 25) return 'nose';
    return 'body';
  }

  /** A scene point in her sprite's own pixels, unmirrored. */
  private local(px: number, py: number): { lx: number; ly: number } {
    const x = px - this.lastLeft;
    return { lx: this.facing === 1 ? RABBIT_W - 1 - x : x, ly: py - this.lastTop };
  }

  /**
   * Washing her: the sponge at a point. Rubbing her keeps her standing still
   * for it, wipes off the smudges under the sponge, and blows bubbles.
   * Returns whether it was on her.
   */
  scrub(px: number, py: number, now: number): boolean {
    const b = this.rabbitBox();
    if (px < b.x - 3 || px > b.x + b.w + 3 || py < b.y - 3 || py > b.y + b.h + 3) return false;
    if (this.reaction?.kind !== 'scrub') this.reaction = { kind: 'scrub', start: now, until: now + REACTION_MS.scrub };
    this.reaction.until = now + REACTION_MS.scrub;
    this.lastRub = now;
    const { lx, ly } = this.local(px, py);
    this.dirtSpots.forEach((d, i) => { if (Math.hypot(d.x - lx, d.y - ly) < 4.5) this.wiped.add(i); });
    if (now - this.lastBubble > 90) {
      this.lastBubble = now;
      this.particles.push({ art: 'bubble', x: px - 2 + (Math.random() * 6 - 3), y: py - 3, vy: -0.01 - Math.random() * 0.01, born: now, life: 900 });
    }
    return true;
  }

  /** Smudges still on her, of those her Clean need shows. */
  dirtLeft(m: Pick<SceneModel, 'needs'>): number {
    const n = lookOf(m.needs).spots;
    let left = 0;
    for (let i = 0; i < n; i++) if (!this.wiped.has(i)) left++;
    return left;
  }

  /** The sponge, drawn where the pointer is while you wash her (null: put away). */
  setSponge(at: { x: number; y: number } | null): void { this.sponge = at; }

  /**
   * Food held out to her (dragged from the Feed tray), or null. Hungry, she
   * comes for it sniffing and opens her mouth when it's close; full, she
   * turns her head away.
   */
  setLure(l: { x: number; y: number; art: ItemArt; wants: boolean } | null): void { this.lure = l; }

  private sponge: { x: number; y: number } | null = null;
  private lure: { x: number; y: number; art: ItemArt; wants: boolean } | null = null;
  private lastRub = -1e9;
  private lastBubble = -1e9;
  private lastLeft = 0;
  private lastTop = 0;
  /** Her smudges, in her own pixels, worst-placed last; the first ones show first. */
  private dirtSpots: { x: number; y: number; shape: number }[] = [];
  private dirtFor = '';
  /** Smudges washed off this time; cleared once she's clean. */
  private wiped = new Set<number>();
  private nextGleam = 0;

  burst(art: ItemArt, n: number, now: number, at?: { x: number; y: number }): void {
    const ox = at?.x ?? this.x, oy = at?.y ?? STAND_Y - 30;
    for (let i = 0; i < n; i++) {
      this.particles.push({ art, x: ox - 8 + (16 * i) / Math.max(1, n - 1), y: oy + (i % 2) * 3, vy: -0.012 - (i % 3) * 0.003, born: now + i * 140, life: 1300 });
    }
  }

  /** Where a placed piece is drawn, in scene pixels. */
  itemBox(item: PlacedItem): Box | null {
    const def = byId(item.id);
    if (!def) return null;
    const s = this.item(def.art);
    const x = Math.round(item.x - s.w / 2);
    if (def.zone === 'rug') return { x, y: Math.round(item.y - s.h / 2), w: s.w, h: s.h };
    if (def.zone === 'hang') return { x, y: item.y, w: s.w, h: s.h };
    return { x, y: item.y - s.h, w: s.w, h: s.h };
  }

  /** The placed piece under a point, topmost first (hanging, then front to back, then rugs). */
  hitTest(burrow: BurrowState, px: number, py: number): PlacedItem | null {
    const zoneOf = (i: PlacedItem) => byId(i.id)?.zone;
    const placed = burrow.items.filter((i) => i.placed);
    const order = [
      ...placed.filter((i) => zoneOf(i) === 'hang').reverse(),
      ...placed.filter((i) => zoneOf(i) === 'floor').sort((a, b) => b.y - a.y),
      ...placed.filter((i) => zoneOf(i) === 'rug').reverse(),
    ];
    for (const i of order) {
      const b = this.itemBox(i);
      if (b && px >= b.x - 1 && px <= b.x + b.w + 1 && py >= b.y - 1 && py <= b.y + b.h + 1) return i;
    }
    return null;
  }

  /**
   * Size the drawing surface in scene pixels. The room is always 98x118; any
   * extra width or height around it (a tall or wide stage) is filled with the
   * soil the burrow is dug into, instead of letterbox bars. Offsets place the
   * room inside the surface and may be negative when the stage crops it.
   */
  resize(w: number, h: number, offsetX: number, offsetY: number): void {
    resizeCanvas(this.canvas, w, h, offsetX - this.offsetX, offsetY - this.offsetY);
    this.ctx.imageSmoothingEnabled = false;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  /** A point on the surface (in scene pixels) to room coordinates. */
  toRoom(x: number, y: number): { x: number; y: number } {
    return { x: x - this.offsetX, y: y - this.offsetY };
  }

  draw(m: SceneModel, now: number): void {
    const ctx = this.ctx;
    this.season = m.season ?? 'summer';
    this.time = m.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const soil = (this.soilPattern ??= ctx.createPattern(this.soil, 'repeat'));
    if (soil) { ctx.fillStyle = soil; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.setTransform(1, 0, 0, 1, this.offsetX, this.offsetY);
    const style = m.room ?? PLAIN_ROOM;
    ctx.drawImage(this.room(style, m.night).canvas, 0, 0);
    this.drawWindow(m, now);

    const placed = m.burrow.items
      .filter((i) => i.placed)
      .map((item) => ({ item, def: byId(item.id) }))
      .filter((p): p is { item: PlacedItem; def: DecorDef } => !!p.def);

    // rugs lie under everything
    for (const p of placed.filter((p) => p.def.zone === 'rug')) this.drawPiece(p.item, p.def);

    const asleep = m.mood === 'asleep';
    // she sleeps on the best bed in the room
    const beds = ['hayloft', 'patchcushion', 'cushion'];
    const cushion = placed.filter((p) => p.def.bed).sort((a, b) => beds.indexOf(a.def.id) - beds.indexOf(b.def.id))[0]?.item;
    const bed = asleep && cushion ? cushion : undefined;
    this.updateRabbit(m, now, placed, bed);
    // at a spot she stands where it puts her (up on the window seat, in front of the fire)
    const perch = this.idle?.kind === 'spot' && this.arrived() ? this.idle : null;
    const standY = bed ? bed.y - 3 : perch ? perch.standY : STAND_Y;
    // floor pieces and the rabbit, back to front; asleep, she lies on her bed
    const depthOfRabbit = bed ? bed.y + 0.5 : perch ? perch.depth : standY;
    const floor = placed.filter((p) => p.def.zone === 'floor').sort((a, b) => a.item.y - b.item.y);
    let drewRabbit = false;
    for (const p of floor) {
      if (!drewRabbit && p.item.y > depthOfRabbit) { if (!m.absent) this.drawRabbit(m, now, standY); drewRabbit = true; }
      this.drawPiece(p.item, p.def);
      this.animatePiece(p.item, p.def, now);
    }
    if (!drewRabbit && !m.absent) this.drawRabbit(m, now, standY);
    this.drawGuests(m, now, placed);
    this.drawCritter(m, now);

    // hanging decor, on a rope from the ceiling
    for (const p of placed.filter((p) => p.def.zone === 'hang')) {
      const top = ceilingY(p.item.x);
      ctx.fillStyle = '#5E3B26';
      if (p.item.y > top) ctx.fillRect(Math.round(p.item.x), top, 1, p.item.y - top);
      this.drawPiece(p.item, p.def);
      this.animatePiece(p.item, p.def, now);
    }

    if (m.night) {
      // Darken the whole room at once (no canvas filters: Safari lacks them),
      // then put the starry window back and add warm lantern light on top.
      // Awake, the lamps are on: a warm pool of light in the middle of the room
      // fading to cool blue in the corners, so it reads as night rather than a
      // browner room, and she keeps her own coat colour in the light.
      // Asleep, lights out.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = asleep ? '#62608E' : (this.lamplight ??= nightLight(ctx));
      ctx.fillRect(-this.offsetX, -this.offsetY, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      const win = windowOf(m.room);
      ctx.arc(win.x, win.y, win.r - 1.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.room(style, true).canvas, 0, 0);
      this.drawWindow(m, now);
      ctx.restore();
      ctx.save();
      // lamplight stays in the room: it doesn't shine through the dirt around it
      const { cx, cy, rx, ry } = ROOM_ARCH;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.rect(WALL_INSET, cy, SCENE_W - 2 * WALL_INSET, SCENE_H - cy);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of placed.filter((p) => p.def.glow)) {
        // hanging lights glow below their top; floor ones around their upper part
        const h = this.item(p.def.art).h;
        const cy = p.def.zone === 'hang' ? p.item.y + 6 : p.item.y - Math.min(h - 3, 8);
        ctx.drawImage(this.glow.canvas, Math.round(p.item.x - this.glow.w / 2), Math.round(cy - this.glow.h / 2));
      }
      ctx.restore();
      // flames stay bright at night
      for (const p of placed.filter((p) => p.def.id === 'fireplace' || p.def.id === 'fireflies')) this.animatePiece(p.item, p.def, now);
    }

    if (!m.absent) this.drawSleepAndThoughts(m, now);
    this.drawParticles(now);
    if (this.sponge) {
      const sp = this.item('sponge');
      ctx.drawImage(sp.canvas, Math.round(this.sponge.x - sp.w / 2), Math.round(this.sponge.y - sp.h / 2));
    }
    if (m.decorating && m.selected) {
      const sel = m.burrow.items.find((i) => i.uid === m.selected && i.placed);
      const b = sel ? this.itemBox(sel) : null;
      if (b) this.dashedBox(b, now);
    }
  }

  /** The art a piece shows now: the four-seasons tree follows the season. */
  private artOf(def: DecorDef): ItemArt {
    return def.id === 'seasontree' ? (`tree_${this.season}` as ItemArt) : def.art;
  }
  private season: Season = 'summer';
  private time: SceneModel['time'];

  private drawPiece(item: PlacedItem, def: DecorDef): void {
    const s = this.item(this.artOf(def));
    const b = this.itemBox(item);
    if (!b) return;
    const ctx = this.ctx;
    if (item.flip) {
      ctx.save();
      ctx.translate(b.x * 2 + s.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(s.canvas, b.x, b.y);
      ctx.restore();
    } else {
      ctx.drawImage(s.canvas, b.x, b.y);
    }
  }

  /**
   * Visiting rabbits: each hops in from the nearer edge, then potters between
   * free spots on the floor (beside a piece, never in front of one, and not on
   * top of her or each other), bobs and blinks, and dozes while she sleeps.
   */
  private drawGuests(m: SceneModel, now: number, placed: { item: PlacedItem; def: DecorDef }[]): void {
    const ctx = this.ctx;
    const guests = m.guests ?? [];
    const lively = !!m.lively && !reduceMotion;
    this.guestOrder = guests.map((g) => g.id);
    for (const id of [...this.guestWalks.keys()]) if (!this.guestOrder.includes(id)) this.guestWalks.delete(id);
    const asleep = m.mood === 'asleep' && !m.lively;
    const wander = lively ? LIVELY_WANDER_MS : GUEST_WANDER_MS;
    guests.forEach((g, i) => {
      let w = this.guestWalks.get(g.id);
      if (!w) {
        const y = m.lively ? GUEST_ROWS[i % GUEST_ROWS.length]! : GUEST_Y;
        const targetX = this.guestSpot(placed, g.id, y, !!m.lively);
        const fromLeft = targetX < SCENE_W / 2;
        // from just past the wall, so the first hop is already in view
        const x = reduceMotion ? targetX : fromLeft ? -6 : SCENE_W + 6;
        w = { x, y, targetX, facing: fromLeft ? -1 : 1, hopPhase: 0, nextWander: now + wander[0] * (lively ? Math.random() : 1), happyUntil: 0, arriving: !reduceMotion,
          binkyAt: -1e9, nextBinky: now + 3_000 + Math.random() * 6_000, turned: false };
        this.guestWalks.set(g.id, w);
      }
      const arrived = Math.abs(w.targetX - w.x) <= 0.5;
      if (arrived && !asleep && !m.decorating && now > w.nextWander) {
        // lively, they often go and find someone else
        const friend = lively && Math.random() < 0.35 ? [...this.guestWalks.values()].filter((o) => o !== w)[Math.floor(Math.random() * (this.guestWalks.size - 1))] : undefined;
        const near = friend ? Math.max(14, Math.min(SCENE_W - 14, Math.round(friend.x + (Math.random() < 0.5 ? -20 : 20)))) : null;
        w.targetX = near !== null && this.roomAt(near, g.id, w.y) ? near : this.guestSpot(placed, g.id, w.y, !!m.lively);
        w.nextWander = now + wander[0] + Math.random() * (wander[1] - wander[0]);
      }
      // a binky, standing still: up, a twist in the air, and down facing the other way
      if (lively && arrived && now > w.nextBinky) {
        w.binkyAt = now;
        w.nextBinky = now + 5_000 + Math.random() * 9_000;
        if (Math.random() < 0.5) this.burst('heart', 1, now, { x: w.x, y: w.y - 30 });
      }
      const binkyT = (now - w.binkyAt) / BINKY_LEAP_MS;
      const binky = binkyT >= 0 && binkyT < 1;
      if (binky && binkyT > 0.5 && !w.turned) { w.facing = w.facing === 1 ? -1 : 1; w.turned = true; }
      if (!binky) w.turned = false;
      const dx = w.targetX - w.x;
      if (Math.abs(dx) > 0.5 && !asleep) {
        if (reduceMotion) { w.x = w.targetX; w.hopPhase = 0; }
        else {
          // bounding in, then pottering (bouncier when lively)
          const speed = w.arriving ? 0.9 : lively ? 0.6 : 0.3;
          w.facing = dx > 0 ? -1 : 1; w.x += Math.sign(dx) * Math.min(Math.abs(dx), speed); w.hopPhase = (w.hopPhase + (w.arriving ? 0.16 : lively ? 0.14 : 0.09)) % 1;
        }
      } else if (!binky) {
        w.hopPhase = 0;
        w.arriving = false;
        // standing about, they turn to look at her
        if (!lively) w.facing = this.x > w.x ? -1 : 1;
      }
    });
    // back rows first, so the front row stands in front
    const order = guests.map((g, i) => ({ g, i, w: this.guestWalks.get(g.id)! })).sort((a, b) => a.w.y - b.w.y);
    for (const { g, i, w } of order) {
      const binkyT = (now - w.binkyAt) / BINKY_LEAP_MS;
      const binky = binkyT >= 0 && binkyT < 1;
      const face: Face = asleep ? 'asleep' : w.happyUntil > now || binky ? 'happy' : 'content';
      const frame: Frame = asleep ? (!reduceMotion && Math.floor(now / 1500 + i) % 2 ? 1 : 0)
        : !reduceMotion && w.hopPhase === 0 && Math.floor(now / 1100 + i * 2) % 4 === 1 ? 1 : 0;
      const sp = this.rabbit(g.coat, face, frame, g.dress);
      const hop = binky ? Math.round(Math.sin(binkyT * Math.PI) * 8) : w.hopPhase ? Math.round(Math.sin(w.hopPhase * Math.PI) * (lively ? 4 : 3)) : 0;
      const left = Math.round(w.x - RABBIT_W / 2), top = w.y - RABBIT_GROUND - hop;
      ctx.save();
      if (w.facing === 1) { ctx.translate(left * 2 + RABBIT_W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(sp.canvas, left, top);
      ctx.restore();
      // a gift brought along: a parcel at their feet, in front, that bobs to be noticed
      if (g.parcel) {
        const p = this.item('gift');
        const bob = !reduceMotion && Math.floor(now / 700 + i) % 3 === 0 ? 1 : 0;
        const px = Math.round(w.x + (w.facing === 1 ? 7 : -7) - p.w / 2);
        ctx.drawImage(p.canvas, px, w.y - p.h - bob + 1);
      }
    }
  }

  /**
   * Somewhere for a guest to stand: beside a floor piece (half the time, if
   * there's room) or a clear stretch of floor, not in front of a piece and a
   * rabbit's width from her and the other guests. In a full room, in front of
   * a piece will do; failing that, wherever is furthest from everyone.
   */
  private guestSpot(placed: { item: PlacedItem; def: DecorDef }[], id: string, y = GUEST_Y, lively = false): number {
    const pieces = placed.filter((p) => p.def.zone === 'floor').map((p) => ({ x: p.item.x, w: this.item(p.def.art).w }));
    // clear of her (where she is and where she's going) and the other guests; lively, closer to those in other rows
    const guests = [...this.guestWalks].filter(([k]) => k !== id).map(([, w]) => w);
    const others = [this.x, this.targetX, ...guests.filter((w) => !lively || w.y === y).map((w) => w.targetX)];
    const behind = lively ? guests.filter((w) => w.y !== y).map((w) => w.targetX) : [];
    const apart = (x: number) => others.every((o) => Math.abs(x - o) >= (lively ? 20 : 18)) && behind.every((o) => Math.abs(x - o) >= 13);
    const clear = (x: number) => apart(x) && pieces.every((p) => Math.abs(x - p.x) >= p.w / 2 + 7);
    const floor: number[] = [];
    for (let x = 14; x <= SCENE_W - 14; x += 3) floor.push(x);
    const pick = (xs: number[]) => xs[Math.floor(Math.random() * xs.length)]!;
    const beside = pieces.flatMap((p) => [p.x - p.w / 2 - 8, p.x + p.w / 2 + 8]).map(Math.round).filter((x) => x >= 14 && x <= SCENE_W - 14 && clear(x));
    const open = floor.filter(clear);
    // lively, they use the whole floor rather than gathering by the furniture
    if (beside.length && !lively && (Math.random() < 0.5 || !open.length)) return pick(beside);
    if (open.length) return pick(open);
    const spaced = floor.filter(apart);
    if (spaced.length) return pick(spaced);
    const room = (x: number) => Math.min(...others.map((o) => Math.abs(x - o)));
    return floor.reduce((best, x) => (room(x) > room(best) ? x : best));
  }

  /** Whether a lively guest in row `y` can stand at `x`: clear of her, and of the others. */
  private roomAt(x: number, id: string, y: number): boolean {
    if (Math.abs(x - this.x) < 20 || Math.abs(x - this.targetX) < 20) return false;
    return [...this.guestWalks].every(([k, w]) => k === id || Math.abs(x - w.targetX) >= (w.y === y ? 20 : 13));
  }

  private guestWalks = new Map<string, GuestWalk>();
  private guestOrder: string[] = [];

  /** A wild visitor: sits in its corner, bobs now and then, looks about, and hops when tapped. */
  /** The first spot for the visitor that no floor piece or rug covers (or the first, if all are). */
  private critterSpot(m: Pick<SceneModel, 'critter' | 'burrow'>): { x: number; y: number } {
    const s = this.item(m.critter as ItemArt);
    const boxes = m.burrow.items.filter((i) => i.placed && byId(i.id)?.zone !== 'hang').map((i) => this.itemBox(i)).filter((b): b is Box => !!b);
    const free = CRITTER_SPOTS.find((p) => {
      const x0 = p.x - s.w / 2, x1 = p.x + s.w / 2, y0 = p.y - s.h;
      return boxes.every((b) => x1 < b.x || x0 > b.x + b.w || p.y < b.y || y0 > b.y + b.h);
    });
    return free ?? CRITTER_SPOTS[0]!;
  }

  private drawCritter(m: SceneModel, now: number): void {
    if (!m.critter) return;
    const s = this.item(m.critter as ItemArt);
    const spot = this.critterSpot(m);
    const hopT = (now - this.critterHopAt) / 500;
    const hop = hopT >= 0 && hopT < 1 && !reduceMotion ? Math.round(Math.sin(hopT * Math.PI) * 5) : 0;
    const bob = !reduceMotion && Math.floor(now / 1300) % 5 === 2 ? 1 : 0;
    // it faces her most of the time, and glances the other way now and then
    const away = !reduceMotion && Math.floor(now / 4100) % 4 === 3;
    const left = Math.round(spot.x - s.w / 2), top = spot.y - s.h - hop - bob;
    const ctx = this.ctx;
    ctx.save();
    // the art faces left: on the left of the room it turns to face her, and glancing away is the other way
    const mirror = (spot.x < SCENE_W / 2) !== away;
    if (mirror) { ctx.translate(left * 2 + s.w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(s.canvas, left, top);
    ctx.restore();
  }

  private critterHopAt = -1e9;

  /** Whether a point is on the visitor, for tapping. */
  critterAt(m: Pick<SceneModel, 'critter' | 'burrow'>, px: number, py: number): boolean {
    if (!m.critter) return false;
    const s = this.item(m.critter as ItemArt);
    const spot = this.critterSpot(m);
    return Math.abs(px - spot.x) <= s.w / 2 + 3 && py >= spot.y - s.h - 4 && py <= spot.y + 1;
  }

  /** The visitor's happy hop when tapped. */
  cheerCritter(m: Pick<SceneModel, 'critter' | 'burrow'>, now: number): void {
    this.critterHopAt = now;
    const spot = this.critterSpot(m);
    this.burst('heart', 1, now, { x: spot.x, y: spot.y - 18 });
  }

  /** Which guest (its index in the model's guests) is under a point, for tapping. */
  guestAt(m: Pick<SceneModel, 'guests'>, px: number, py: number): number | null {
    const guests = m.guests ?? [];
    for (let i = 0; i < guests.length; i++) {
      const w = this.guestWalks.get(guests[i]!.id);
      if (w && Math.abs(px - w.x) <= 13 && py >= w.y - 32 && py <= w.y) return i;
    }
    return null;
  }

  /** A guest's happy wiggle when tapped. */
  cheerGuest(i: number, now: number): void {
    const w = this.guestWalks.get(this.guestOrder[i] ?? '');
    if (!w) return;
    w.happyUntil = now + 1400;
    this.burst('heart', 2, now, { x: w.x, y: w.y - 30 });
  }

  /** Moving parts drawn over a piece: the fireplace's flames, the clocks' hands and pendulum. */
  private animatePiece(item: PlacedItem, def: DecorDef, now: number): void {
    const b = this.itemBox(item);
    if (!b) return;
    const ctx = this.ctx;
    if (def.id === 'fireplace') {
      const f = this.item(!reduceMotion && Math.floor(now / 260) % 2 ? 'flame2' : 'flame1');
      ctx.drawImage(f.canvas, Math.round(item.x - f.w / 2), b.y + b.h - f.h - 3);
    } else if (def.id === 'clock' || def.id === 'wallclock') {
      this.drawHands(b.x + 5, b.y + 4);
      if (def.id === 'clock') {
        const swing = reduceMotion ? 0 : Math.round(Math.sin(now / 500) * 1.6);
        const cx = Math.round(item.x), top = b.y + 11;
        ctx.fillStyle = '#D5A12A';
        ctx.fillRect(cx, top, 1, 4);
        ctx.fillRect(cx + swing, top + 4, 1, 2);
        ctx.fillStyle = '#F6D24A';
        ctx.fillRect(cx + swing - 1, top + 6, 3, 2);
      }
    } else if (def.id === 'fireflies') {
      // three fireflies drifting round the jar, blinking on and off
      for (let i = 0; i < 3; i++) {
        const t = reduceMotion ? i * 2 : now / 900 + i * 2.1;
        if (!reduceMotion && Math.floor(now / 350 + i * 3) % 5 === 0) continue;
        ctx.fillStyle = i === 1 ? '#FFF6C8' : '#F6D24A';
        ctx.fillRect(Math.round(item.x + Math.cos(t) * (b.w / 2 + 3)), Math.round(b.y + b.h / 2 + Math.sin(t * 1.3) * (b.h / 2 + 2)), 1, 1);
      }
    } else if (def.id === 'wishingwell') {
      // now and then a glint on the water
      if (!reduceMotion && Math.floor(now / 700) % 4 === 0) {
        const g = this.item('sparkle');
        const x = b.x + 4 + (Math.floor(now / 2800) % 3) * 6;
        ctx.drawImage(g.canvas, x, b.y + b.h - 8);
      }
    }
  }

  /**
   * A clock face's hands at the player's time, around its centre pixel: the
   * art's own 10:10 hands (for the shop) are painted over first. The ticks sit
   * just outside what's painted, the minute hand reaches them.
   */
  private drawHands(cx: number, cy: number): void {
    const t = this.time;
    if (!t) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    ctx.fillStyle = '#3B2922';
    // each hand points at one of the twelve marks, turning CLOCK_HAND's quarter
    const hand = (mark: number, len: number) => {
      for (const [x0, y0] of CLOCK_HAND[mark % 3]!.slice(0, len)) {
        let x = x0, y = y0;
        for (let q = Math.floor(mark / 3) % 4; q > 0; q--) [x, y] = [-y, x];
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    };
    hand(Math.round(t.minute / 5), 3);
    hand(Math.round((t.hour % 12) + t.minute / 60), 2);
    ctx.fillRect(cx, cy, 1, 1);
  }

  /** A 1-pixel marching dashed outline, crisp at any scale. */
  private dashedBox(b: Box, now: number): void {
    const ctx = this.ctx;
    const x0 = b.x - 2, y0 = b.y - 2, x1 = b.x + b.w + 1, y1 = b.y + b.h + 1;
    const phase = reduceMotion ? 0 : Math.floor(now / 160) % 4;
    const on = (i: number) => (i + phase) % 4 < 2;
    ctx.fillStyle = '#F6D24A';
    let i = 0;
    for (let x = x0; x <= x1; x++, i++) { if (on(i)) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x1 - (x - x0), y1, 1, 1); } }
    for (let y = y0; y <= y1; y++, i++) { if (on(i)) { ctx.fillRect(x1, y, 1, 1); ctx.fillRect(x0, y1 - (y - y0), 1, 1); } }
  }

  private updateRabbit(m: SceneModel, now: number, placed: { item: PlacedItem; def: DecorDef }[], bed?: { x: number }): void {
    // asleep: she is already curled up on her cushion, not walking to it
    if (bed) { this.targetX = bed.x; this.x = bed.x; this.hopPhase = 0; this.idle = null; return; }
    const look = lookOf(m.needs);
    // food held out: hungry, she comes over for it; full, she stays put
    const lure = m.mood !== 'asleep' && !m.decorating && !m.absent ? this.lure : null;
    if (lure) {
      this.idle = null;
      const d = lure.x - this.x;
      this.targetX = lure.wants && Math.abs(d) > 16 ? clampX(lure.x - Math.sign(d) * 12) : this.x;
      this.nextWander = now + 2500;
    }
    const free = m.mood !== 'asleep' && !this.reaction && !lure && !m.decorating && !m.absent;
    // Sleep, decorating or going out calls her away from whatever she was
    // doing. A tap or a meal doesn't: she's patted, or eats, where she is, and
    // goes on with it after (dropping it had the mood line flick to "content"
    // and back as she walked straight back to the same spot).
    if (m.mood === 'asleep' || m.decorating || m.absent || (this.reaction && this.idle?.kind === 'binky')) this.idle = null;
    if (this.idle?.kind === 'spot' && now > this.idle.until) { this.idle = null; this.nextWander = now + 1500; }
    if (this.idle?.kind === 'binky' && now > this.idle.start + BINKY_MS) this.idle = null;
    if (free && !this.idle && now > this.nextWander) {
      this.idle = this.pickIdle(m, now, placed);
      if (this.idle?.kind === 'spot') this.targetX = this.idle.x;
      else if (!this.idle) this.targetX = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN);
      // lonely, she mopes about rather than pottering
      this.nextWander = now + 3500 + Math.random() * 4000 + (look.lonely ? 6000 : 0);
    }
    if (this.idle?.kind === 'spot' && this.arrived()) { this.facing = this.idle.facing; this.hopPhase = 0; return; }
    if (this.idle?.kind === 'binky') { this.hopPhase = 0; return; }
    const dx = this.targetX - this.x;
    if (Math.abs(dx) > 0.5 && (!this.reaction || bed)) {
      if (reduceMotion) { this.x = this.targetX; this.hopPhase = 0; }
      else {
        // tired, she plods; called over with food, she hurries
        const speed = lure ? 0.55 : look.tired ? 0.2 : 0.35;
        this.facing = dx > 0 ? -1 : 1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed);
        this.hopPhase = (this.hopPhase + (look.tired && !lure ? 0.06 : 0.09)) % 1;
      }
    } else {
      this.hopPhase = 0;
    }
    if (lure && this.arrived()) {
      // full, she shakes her head at it
      const toward = lure.x < this.x ? 1 : -1;
      this.facing = lure.wants || reduceMotion ? toward : Math.floor(now / 280) % 2 ? 1 : -1;
    }
  }

  private idle: Idle | null = null;

  private arrived(): boolean {
    return Math.abs(this.targetX - this.x) <= 0.5;
  }

  /** What she's doing now, once she's there, for the mood line. */
  activity(): Activity | null {
    return this.idle?.kind === 'spot' && this.arrived() ? this.idle.activity : null;
  }

  /**
   * Something to do, or null to just wander. Cold (winter, snow, or night)
   * draws her to the fire; rain or snow to the window, from the window seat if
   * there is one; and each day she has a favourite piece of decor. She
   * sometimes binkies. All only when she's content: wanting something, she
   * potters about under her thought bubble.
   */
  private pickIdle(m: SceneModel, now: number, placed: { item: PlacedItem; def: DecorDef }[]): Idle | null {
    if (m.mood !== 'content') return null;
    // each its own chance, checked in this order
    const roll = () => Math.random();
    const stay = now + SPOT_MS[0] + Math.random() * (SPOT_MS[1] - SPOT_MS[0]);
    const weather = m.weather ?? 'sunny';
    // weather worth watching
    const wet = weather === 'rain' || weather === 'snow' || weather === 'leaves';
    const cold = m.season === 'winter' || weather === 'snow' || m.night;
    const find = (id: string) => placed.find((p) => p.def.id === id && p.def.zone === 'floor');
    const fire = find('fireplace');
    if (fire && cold && roll() < 0.5) {
      const side = fire.item.x < SCENE_W / 2 ? 1 : -1;
      const x = clampX(fire.item.x + side * 13);
      const standY = Math.min(SCENE_H - 4, Math.max(STAND_Y, fire.item.y + 4));
      return { kind: 'spot', activity: { kind: 'fire' }, x, standY, depth: standY, facing: side === 1 ? 1 : -1, until: stay };
    }
    if (wet && roll() < 0.5) {
      const win = windowOf(m.room);
      const seat = find('windowseat');
      const box = seat && this.itemBox(seat.item);
      if (seat && box) {
        return { kind: 'spot', activity: { kind: 'seat', weather }, x: clampX(seat.item.x), standY: box.y + 2, depth: seat.item.y + 0.5, facing: seat.item.x > win.x ? 1 : -1, until: stay };
      }
      // under the window, looking up at it
      const left = win.x < SCENE_W / 2;
      return { kind: 'spot', activity: { kind: 'window', weather }, x: win.x + (left ? 4 : -4), standY: STAND_Y, depth: STAND_Y, facing: left ? 1 : -1, until: stay };
    }
    if (!reduceMotion && roll() < 0.15) {
      this.burst('sparkle', 2, now);
      return { kind: 'binky', start: now, turned: false };
    }
    const fav = favourite(placed, m.seed);
    if (fav && roll() < 0.35) {
      const w = this.item(fav.def.art).w;
      const side = fav.item.x < SCENE_W / 2 ? 1 : -1;
      const x = clampX(fav.item.x + side * (w / 2 + 8));
      return { kind: 'spot', activity: { kind: 'favourite', piece: fav.def.id }, x, standY: STAND_Y, depth: STAND_Y, facing: side === 1 ? 1 : -1, until: stay };
    }
    return null;
  }

  private drawRabbit(m: SceneModel, now: number, standY: number): void {
    if (this.reaction && now > this.reaction.until) this.reaction = null;
    const look = lookOf(m.needs);
    const asleep = m.mood === 'asleep';
    let face: Face = 'content';
    let frame: Frame = 0;
    let lift = 0;
    // tired or lonely, her ears hang; melting under a stroke, they lie flat
    let droop = asleep ? 0 : look.lonely ? 2 : look.tired ? 1 : 0;
    /** A shake, in pixels: a thump (up and down), or her tummy rumbling (side to side). */
    let thud = 0, rumble = 0;
    const idle = this.idle;
    const r = this.reaction;
    const lure = !asleep && !m.decorating ? this.lure : null;
    if (asleep) {
      face = 'asleep';
      frame = !reduceMotion && Math.floor(now / 1400) % 2 ? 1 : 0;
    } else if (idle?.kind === 'binky') {
      // up, a twist at the top, and down
      const t = Math.min(1, (now - idle.start) / BINKY_MS);
      lift = Math.round(Math.sin(t * Math.PI) * 9);
      if (t > 0.5 && !idle.turned) { idle.turned = true; this.facing = this.facing === 1 ? -1 : 1; }
      face = 'happy';
    } else if (idle?.kind === 'spot' && idle.activity.kind === 'fire' && this.arrived()) {
      // eyes closed, cosy
      face = 'happy';
    } else if (r) {
      const t = now - r.start;
      if (r.kind === 'eating') ({ face, frame } = eatingPose(t, r.outcome, reduceMotion));
      else if (r.kind === 'melt') { face = 'melt'; droop = 2; }
      else if (r.kind === 'boop') face = t < SNEEZE_MS ? 'sneeze' : 'happy';
      else if (r.kind === 'thump') { face = 'grumpy'; thud = reduceMotion ? 0 : Math.floor(t / 90) % 2; }
      // eyes shut while the sponge is going, peeking when it stops
      else if (r.kind === 'scrub') face = now - this.lastRub < 450 ? 'happy' : 'content';
      else face = 'happy';
    } else if (lure) {
      // hungry: sniffing at it, then mouth open when it's under her nose; full, she shakes her head
      const near = Math.abs(lure.x - this.x) < 18 && lure.y > standY - 44 && lure.y < standY + 4;
      face = !lure.wants ? 'polite' : near ? 'eating' : !reduceMotion && Math.floor(now / 160) % 2 ? 'chew' : 'content';
    } else if (m.mood === 'grumpy') {
      face = 'grumpy';
    } else {
      // how she feels shows: a yawn now and then when tired, sad brows when
      // lonely, sniffing about for food when hungry
      const yawning = look.tired && !reduceMotion && now % 9000 < 1100;
      const sniffing = look.hungry && !reduceMotion && (now + 2500) % 7000 < 1400;
      if (yawning) face = 'yawn';
      else if (look.lonely) face = 'sad';
      else if (look.tired) face = 'drowsy';
      else if (sniffing) face = Math.floor(now / 150) % 2 ? 'chew' : 'content';
      if (!yawning && !sniffing) {
        if (now > this.blinkAt) { frame = 2; if (now > this.blinkAt + 140) this.blinkAt = now + 2500 + Math.random() * 3000; }
        else if (!reduceMotion && this.hopPhase === 0 && Math.floor(now / 900) % 3 === 1) frame = 1;
      }
    }
    // a hungry tummy rumbles now and then
    const rumbling = look.hungry && !asleep && !r && !reduceMotion && now % 6000 < 480;
    if (rumbling) rumble = Math.floor(now / 70) % 2 ? 1 : -1;
    const { sprite: s, fur } = this.rabbitWithFur(m.coat, face, frame, m.dress, droop);
    const hop = (this.hopPhase ? Math.round(Math.sin(this.hopPhase * Math.PI) * 3) : 0) + lift;
    const left = Math.round(this.x - RABBIT_W / 2) + rumble;
    const top = standY - RABBIT_GROUND - hop + thud;
    this.lastLeft = left;
    this.lastTop = top;
    const ctx = this.ctx;
    ctx.save();
    if (this.facing === 1) {
      ctx.translate(left * 2 + RABBIT_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(s.canvas, left, top);
    this.drawDirt(m, look, fur, left, top);
    ctx.restore();
    if (look.flies) this.drawFlies(now, top);
    if (rumbling) {
      // a little wavy line by her tummy
      ctx.fillStyle = '#FFF6C8';
      const rx = Math.round(this.x + (this.facing === 1 ? 10 : -13)), ry = standY - 16;
      for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [3, -1], [0, 3], [1, 2], [2, 3], [3, 2]] as const) ctx.fillRect(rx + dx, ry + dy, 1, 1);
    }
    // thriving, her coat catches the light now and then
    if (look.thriving && !asleep && !reduceMotion && now > this.nextGleam) {
      this.nextGleam = now + 2500 + Math.random() * 3500;
      for (let tries = 0; tries < 20; tries++) {
        const lx = 8 + Math.floor(Math.random() * 24), ly = 10 + Math.floor(Math.random() * 26);
        if (!fur[ly]?.[lx]) continue;
        const gx = this.facing === 1 ? left + RABBIT_W - 1 - lx : left + lx;
        this.particles.push({ art: 'sparkle', x: gx - 2, y: top + ly - 2, vy: -0.002, born: now, life: 650 });
        break;
      }
    }

    // what she's eating, held up in her paws
    if (this.reaction?.kind === 'eating' && this.reaction.art) drawMeal(ctx, m.coat, this.reaction.art, now - this.reaction.start, this.x, standY, reduceMotion);
    // the toy she's playing with, bouncing beside her
    if (this.reaction?.kind === 'play' && this.reaction.art) {
      const toy = this.item(this.reaction.art);
      const t = reduceMotion ? 0 : (this.reaction.until - now) / 180;
      const bounce = Math.round(Math.abs(Math.sin(t)) * 5);
      const side = this.facing === 1 ? -1 : 1;
      ctx.drawImage(toy.canvas, Math.round(this.x + side * 14 - toy.w / 2), standY - toy.h - bounce);
    }
    this.lastStandY = standY;
  }

  private lastStandY = STAND_Y;

  /**
   * Smudges on her coat (mud, or dust on a dark coat), drawn in her own
   * pixels inside her mirrored transform, only where she's fur, so they follow
   * her outline whatever she's doing. Washed-off ones stay off until she's clean.
   */
  private drawDirt(m: SceneModel, look: Look, fur: boolean[][], left: number, top: number): void {
    if (!look.spots) { this.wiped.clear(); return; }
    const key = `${(m.seed ?? '').split(':')[0]}:${m.coat}`;
    if (this.dirtFor !== key) { this.dirtFor = key; this.dirtSpots = dirtSpots(key, m.coat); this.wiped.clear(); }
    const ctx = this.ctx;
    const show = (i: number) => !this.wiped.has(i) && !!this.dirtSpots[i];
    ctx.fillStyle = DARK_COATS.includes(m.coat) ? 'rgba(232,222,204,0.6)' : 'rgba(120,88,58,0.5)';
    for (let i = 0; i < look.spots; i++) {
      if (!show(i)) continue;
      const d = this.dirtSpots[i]!;
      for (const [dx, dy] of SMUDGES[d.shape]!) {
        const x = d.x + dx, y = d.y + dy;
        if (fur[y]?.[x]) ctx.fillRect(left + x, top + y, 1, 1);
      }
    }
    // bits of straw caught in her fur, up on her back
    if (look.straw) for (const i of STRAW) {
      if (!show(i)) continue;
      const d = this.dirtSpots[i]!;
      if (!fur[d.y]?.[d.x]) continue;
      ctx.fillStyle = '#E8C25A';
      ctx.fillRect(left + d.x, top + d.y, 1, 1); ctx.fillRect(left + d.x + 1, top + d.y - 1, 1, 1);
      ctx.fillStyle = '#B8902E';
      ctx.fillRect(left + d.x + 2, top + d.y - 2, 1, 1);
    }
  }

  /** Two flies buzzing round her head. */
  private drawFlies(now: number, top: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const a = reduceMotion ? i * 2.5 : now / 280 + i * Math.PI;
      const fx = Math.round(this.x + Math.cos(a) * 13), fy = Math.round(top + 7 + Math.sin(a * 1.7) * 4);
      ctx.fillStyle = '#2A2130';
      ctx.fillRect(fx, fy, 1, 1);
      if (reduceMotion || Math.floor(now / 50 + i) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(fx, fy - 1, 1, 1); }
    }
  }

  /** Drawn after the night pass so the z's and bubbles stay bright. */
  private drawSleepAndThoughts(m: SceneModel, now: number): void {
    const ctx = this.ctx;
    const standY = this.lastStandY;
    if (m.mood === 'asleep' && !reduceMotion) {
      const z = this.item('zz');
      const t = (now % 2400) / 2400;
      ctx.globalAlpha = t < 0.8 ? 1 : (1 - t) * 5;
      ctx.drawImage(z.canvas, Math.round(this.x + 9 + t * 4), Math.round(standY - 26 - t * 8));
      ctx.globalAlpha = 1;
    }
    // a thought bubble names what she wants
    const want: Partial<Record<Mood, ItemArt>> = { peckish: 'carrot', lonely: 'heart', sleepy: 'moon', dusty: 'droplet' };
    const icon = !this.reaction && !this.lure && !this.sponge && !m.decorating && !m.guest ? want[m.mood] : undefined;
    if (icon) {
      const b = this.item('thought');
      const bx = Math.round(this.x + 6), by = standY - 44;
      ctx.drawImage(b.canvas, bx, by);
      const i = this.item(icon);
      const scale = i.w > 9 ? 0.5 : 1;
      ctx.drawImage(i.canvas, bx + Math.round((b.w - i.w * scale) / 2), by + Math.round((8 - i.h * scale) / 2) + 1, i.w * scale, i.h * scale);
    }
  }

  private drawParticles(now: number): void {
    const ctx = this.ctx;
    this.particles = this.particles.filter((p) => now < p.born + p.life);
    for (const p of this.particles) {
      const age = now - p.born;
      if (age < 0) continue;
      const s = this.item(p.art);
      ctx.globalAlpha = Math.max(0, 1 - age / p.life);
      ctx.drawImage(s.canvas, Math.round(p.x), Math.round(p.y + (reduceMotion ? 0 : p.vy * age * 1.6)));
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Her face and frame `e` ms into a meal: nibbling (eyes shut, the nose
 * twitching), then how she took it. `still`: reduced motion, no twitching.
 * Exported with drawMeal for dev/eat-lab.html.
 */
export function eatingPose(e: number, outcome: FoodReaction = 'happy', still = false): { face: Face; frame: Frame } {
  if (e < EAT_SWALLOW_MS) return { face: still || Math.floor(e / 90) % 2 ? 'nibble' : 'chew', frame: 0 };
  const after = e - EAT_SWALLOW_MS;
  if (outcome === 'loves') return { face: after < 260 ? 'savour' : 'happy', frame: 0 };
  if (outcome === 'okay') return { face: 'polite', frame: after > 250 && after < 600 ? 2 : 0 };
  return { face: after < 300 ? 'lick' : 'content', frame: 0 };
}

const mealSprites = new Map<string, Sprite>();
const crumbColours = new Map<ItemArt, string[]>();

/** A few of a food's own colours (not its outline), for crumbs. */
function crumbsOf(art: ItemArt): string[] {
  let cols = crumbColours.get(art);
  if (!cols) {
    const seen = new Set<string>();
    for (const row of drawItem(art).px) for (const c of row) if (c[3] && c[0] + c[1] + c[2] > 200) seen.add(`rgb(${c[0]},${c[1]},${c[2]})`);
    cols = [...seen].slice(0, 4);
    crumbColours.set(art, cols);
  }
  return cols;
}

/**
 * The food `e` ms into a meal, held up in her paws and eaten from the top,
 * and the crumbs it drops. `x`: her centre; `standY`: the row she stands on.
 */
export function drawMeal(ctx: CanvasRenderingContext2D, coat: Coat, art: ItemArt, e: number, x: number, standY: number, still = false): void {
  let f = mealSprites.get(art);
  if (!f) { f = toSprite(drawItem(art)); mealSprites.set(art, f); }
  const eaten = Math.max(0, Math.min(1, (e - EAT_FROM_MS) / (EAT_TO_MS - EAT_FROM_MS)));
  const lift = still ? 3 : Math.round(Math.min(1, e / EAT_LIFT_MS) * 3);
  const fx = Math.round(x - f.w / 2 + 1), fy = standY - 12 - lift;
  const cut = Math.round(eaten * f.h);
  if (cut < f.h) {
    ctx.drawImage(f.canvas, 0, cut, f.w, f.h - cut, fx, fy + cut, f.w, f.h - cut);
    let paw = mealSprites.get(`paw:${coat}`);
    if (!paw) { paw = toSprite(drawPaw(coat)); mealSprites.set(`paw:${coat}`, paw); }
    const py = fy + f.h - 5;
    ctx.drawImage(paw.canvas, fx - 2, py);
    ctx.drawImage(paw.canvas, fx + f.w - 2, py);
  }
  if (still) return;
  // three crumbs a nibble, from the bitten edge down to the floor, where they fade
  const cols = crumbsOf(art);
  EAT_CRUMBS_MS.forEach((at, i) => {
    const age = e - at;
    if (age < 0 || age > 900) return;
    const from = Math.round(Math.max(0, Math.min(1, (at - EAT_FROM_MS) / (EAT_TO_MS - EAT_FROM_MS))) * f.h);
    for (let k = 0; k < 3; k++) {
      const vx = (jitter(i, k) - 0.5) * 0.02;
      const x0 = fx + f.w / 2 + (jitter(i + 9, k) - 0.5) * 3;
      const ground = standY + Math.round(jitter(k, i + 3) * 2);
      let cx = x0 + vx * age, cy = fy + from - 0.005 * age + 0.00006 * age * age;
      if (cy > ground) { cy = ground; cx = x0 + vx * Math.min(age, 300); }
      ctx.globalAlpha = age > 600 ? (900 - age) / 300 : 1;
      ctx.fillStyle = cols[(i + k) % cols.length] ?? '#C96';
      ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}

/** A steady 0..1 from two ints, so a meal's crumbs fall the same way each frame. */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A seamless tile of the burrow's soil, for the space around the room. */
function makeSoilTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = '#6E4A33';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#5E3E2B';
  let s = 11;
  for (let i = 0; i < 190; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    g.fillRect(s % 32, (s >>> 8) % 32, 1, 1);
  }
  return c;
}

/**
 * The awake night light, multiplied over the room: nearly clear where she
 * usually sits, warm lamplight around that, cool blue night in the corners.
 */
function nightLight(ctx: CanvasRenderingContext2D): CanvasGradient {
  const g = ctx.createRadialGradient(SCENE_W / 2, SCENE_H * 0.68, 6, SCENE_W / 2, SCENE_H * 0.62, SCENE_W * 0.85);
  g.addColorStop(0, '#FFF4E4');
  g.addColorStop(0.24, '#EFD6B4');
  g.addColorStop(0.55, '#9C90B2');
  g.addColorStop(1, '#4C5088');
  return g;
}

/** A smudge's pixels, from its corner. */
const SMUDGES: [number, number][][] = [[[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]]];
/** Which of her spots are straw: the highest two (dirtSpots sorts them bottom up). */
const STRAW = [DIRT_SPOTS - 1, DIRT_SPOTS - 2];

/**
 * Where her smudges go, in her own pixels: on her fur, spread out, the same
 * for her every time. Sorted from the bottom up, so dirt starts on her feet
 * and belly and creeps up her as she gets grubbier.
 */
export function dirtSpots(seed: string, coat: Coat): { x: number; y: number; shape: number }[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = lcg(h >>> 0);
  const fur = furMask(coat, drawRabbit(coat, 'content', 0));
  const spots: { x: number; y: number; shape: number }[] = [];
  for (let tries = 0; tries < 600 && spots.length < DIRT_SPOTS; tries++) {
    // below her ears: the highest two are straw, in the fur on top of her head
    const x = 6 + Math.floor(rnd() * (RABBIT_W - 12)), y = 13 + Math.floor(rnd() * (RABBIT_H - 15));
    if (!fur[y]?.[x]) continue;
    // not on her face: the middle of her head, round her eyes and nose
    if (y >= 16 && y <= 26 && Math.abs(x - 19.5) < 7) continue;
    if (spots.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 5)) continue;
    spots.push({ x, y, shape: Math.floor(rnd() * SMUDGES.length) });
  }
  return spots.sort((a, b) => b.y - a.y);
}

/** Where she can stand to be beside something: not half off the edge of the room. */
function clampX(x: number): number {
  return Math.max(16, Math.min(SCENE_W - 16, Math.round(x)));
}

/**
 * Her favourite piece today: one of the floor decor (not a bed), picked from
 * her id and the date, so it's the same all day and on every device.
 */
function favourite(placed: { item: PlacedItem; def: DecorDef }[], seed?: string): { item: PlacedItem; def: DecorDef } | null {
  if (!seed) return null;
  const pieces = placed.filter((p) => p.def.zone === 'floor' && !p.def.bed).sort((a, b) => (a.item.uid < b.item.uid ? -1 : 1));
  if (!pieces.length) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return pieces[(h >>> 0) % pieces.length]!;
}
