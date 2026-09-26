// The garden room's scene (docs/rabbit-pets-garden.md §4): the strip from
// art/garden.ts with the plots, buildings and free spots from garden.ts over
// it, seen one area at a time through a camera that eases between areas. Like
// Scene it draws at 1x onto a canvas CSS scales up, and it owns only
// presentation state (the camera, where she's hopping to); the game state
// comes in each frame.

import { drawFirefly, drawGarden, drawGardenShade, drawSignpost, drawSpot } from './art/garden';
import { drawGlow, drawItem, drawPlot, type ItemArt } from './art/items';
import { toSprite, type Sprite } from './art/pixels';
import { drawRabbit, dressKey, RABBIT_GROUND, type Dress, type Face, type Frame } from './art/rabbit';
import { byId, type PlacedItem } from './decor';
import { stage, type CropId } from './extras';
import { AREA_W, areaX, gardenView, STRIP_H, STRIP_W, type AreaId, type GardenThing } from './garden';
import type { Coat, PetState } from './sim';
import type { Season, Weather } from './world';
import type { BuildingId } from './yard';

export interface GardenModel {
  pet: PetState;
  nowMs: number;
  area: AreaId;
  season: Season;
  weather: Weather;
  night: boolean;
  /** Tonight's moon phase (burrow.ts moonPhase). */
  moon: number;
  coat: Coat;
  dress?: Dress;
  /** Asleep, she stays on her bed in the burrow. */
  asleep: boolean;
  /** Out foraging (or on holiday): she isn't here at all. */
  absent?: boolean;
  /** The meadow's gate is open; shut, the meadow shows past a hedge. */
  meadowOpen: boolean;
  /** The meadow's placed pieces (decor.ts meadowItems). */
  items: PlacedItem[];
  /** The piece being moved, outlined while arranging. */
  selected: string | null;
  /** A friend's garden, visiting: only what they've built, no "+" spots or signposts. */
  guest?: boolean;
}

/** A meadow piece's box in strip pixels: lawn pieces stand on their point, fence pieces hang from it. */
export function pieceBox(item: PlacedItem, art: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const def = byId(item.id);
  const x = Math.round(item.x - art.w / 2);
  return def?.zone === 'fence' ? { x, y: item.y, w: art.w, h: art.h } : { x, y: item.y - art.h, w: art.w, h: art.h };
}

const CROP_ART: Record<CropId, ItemArt> = { berry: 'strawberry', golden: 'golden', sprout: 'clover' };
/** A free spot's outline is the size of what will stand there, a little taller for the tiny patch. */
const SPOT: Record<BuildingId | 'shed', { w: number; h: number }> = { patch: { w: 11, h: 7 }, hive: { w: 9, h: 10 }, log: { w: 12, h: 8 }, shed: { w: 12, h: 10 } };
/** Where she sits in each area, bottom-centre, in strip pixels. */
const RABBIT_SPOT: Record<AreaId, number> = { patch: 64, yard: 174, meadow: 276 };
const GATE_X = 2 * AREA_W;
const AREAS_ORDER: Record<AreaId, number> = { patch: 0, yard: 1, meadow: 2 };
const NIGHT_TINT: [number, number, number, number] = [0x62, 0x60, 0x8e, 255];
// Follows the setting live, not just as it was at load.
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reduceMotion = !!motionQuery?.matches;
motionQuery?.addEventListener?.('change', (e) => { reduceMotion = e.matches; });

export class GardenScene {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cache = new Map<string, Sprite>();
  private w = AREA_W;
  private h = STRIP_H;
  private offsetY = 0;
  /** Strip x at the canvas's left edge. */
  private camX = 0;
  private camReady = false;
  private rabbitX = RABBIT_SPOT.patch;
  private rabbitArea: AreaId = 'patch';
  private facing: 1 | -1 = 1;
  private blinkAt = 2500;
  private particles: { art: ItemArt; x: number; y: number; born: number }[] = [];

  /** A few sprites rising from a strip point: clover from the yard, a picked crop. */
  burst(art: ItemArt, n: number, now: number, at: { x: number; y: number }): void {
    for (let i = 0; i < n; i++) this.particles.push({ art, x: at.x - 8 + (16 * i) / Math.max(1, n - 1), y: at.y + (i % 2) * 3, born: now + i * 120 });
  }

  private drawParticles(now: number): void {
    this.particles = this.particles.filter((p) => now - p.born < 1200);
    for (const p of this.particles) {
      const age = now - p.born;
      if (age < 0) continue;
      const s = this.sprite(`item:${p.art}`, () => toSprite(drawItem(p.art)));
      this.ctx.globalAlpha = age > 800 ? (1200 - age) / 400 : 1;
      this.ctx.drawImage(s.canvas, Math.round(p.x - s.w / 2), Math.round(p.y - (reduceMotion ? 0 : age * 0.02)));
      this.ctx.globalAlpha = 1;
    }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = AREA_W;
    canvas.height = STRIP_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  /** Same contract as Scene.resize: the surface in scene pixels, and where the 98x118 view sits in it. */
  resize(w: number, h: number, _offsetX: number, offsetY: number): void {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.w = w;
    this.h = h;
    // the ground stays on the stage's floor; extra height is more sky
    this.offsetY = h >= STRIP_H ? h - STRIP_H : offsetY;
  }

  /** A point on the surface to strip coordinates. */
  toRoom(x: number, y: number): { x: number; y: number } {
    return { x: x + Math.round(this.camX), y: y - this.offsetY };
  }

  /** Where the camera wants to be for an area: that area centred, the strip's ends never passed. */
  private target(area: AreaId): number {
    if (this.w >= STRIP_W) return (STRIP_W - this.w) / 2;
    const want = areaX(area) - (this.w - AREA_W) / 2;
    return Math.max(0, Math.min(STRIP_W - this.w, want));
  }

  /** Jump straight to an area (opening the garden), rather than easing there. */
  jumpTo(area: AreaId): void {
    this.camX = this.target(area);
    this.rabbitX = RABBIT_SPOT[area];
    this.rabbitArea = area;
    this.camReady = true;
  }

  private sprite(key: string, make: () => Sprite): Sprite {
    let s = this.cache.get(key);
    if (!s) {
      if (this.cache.size > 80) this.cache.clear();
      s = make();
      this.cache.set(key, s);
    }
    return s;
  }

  draw(m: GardenModel, now: number): void {
    const ctx = this.ctx;
    if (!this.camReady) this.jumpTo(m.area);
    const target = this.target(m.area);
    this.camX = reduceMotion ? target : this.camX + (target - this.camX) * 0.18;
    if (Math.abs(target - this.camX) < 0.3) this.camX = target;
    const cam = Math.round(this.camX);

    const phase = m.night ? Math.round(m.moon * 30) / 30 : null;
    const bg = this.sprite(`bg:${m.season}:${m.weather}:${m.night}:${phase}`, () => toSprite(drawGarden(m.season, m.weather, m.night, phase)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // above the strip: the sky's top colour; either side (a very wide stage): grass
    ctx.fillStyle = skyTop(bg);
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(1, 0, 0, 1, -cam, this.offsetY);
    ctx.drawImage(bg.canvas, 0, 0);

    this.drawHedge(m);
    // fence pieces hang behind everything; lawn pieces take their place by depth
    const fence = m.items.filter((i) => byId(i.id)?.zone === 'fence');
    for (const i of fence) this.drawPiece(i);
    const layers: { y: number; draw: () => void }[] = [
      ...gardenView(m.pet, m.nowMs).filter((t) => !m.guest || built(t)).map((t) => ({ y: t.spot.y, draw: () => this.drawThing(m, t, now) })),
      ...m.items.filter((i) => byId(i.id)?.zone === 'lawn').map((i) => ({ y: i.y, draw: () => this.drawPiece(i) })),
    ];
    for (const l of layers.sort((a, b) => a.y - b.y)) l.draw();
    this.drawRabbit(m, now);
    this.drawParticles(now);
    const sel = m.selected ? m.items.find((i) => i.uid === m.selected) : undefined;
    if (sel) this.outline(pieceBox(sel, this.pieceArt(sel)), now);
    this.drawWeather(m, now, cam);

    if (m.night) {
      const shade = this.sprite(`shade:${m.season}:${m.weather}`, () => toSprite(drawGardenShade(m.season, m.weather, NIGHT_TINT)));
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(shade.canvas, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // lights in the meadow glow, as the burrow's lamps do
      // small pools, a pair of bulbs each, so a string of lights doesn't flood the sky
      const glow = this.sprite('glow:small', () => toSprite(drawGlow(6)));
      for (const i of m.items.filter((x) => byId(x.id)?.glow)) {
        const b = pieceBox(i, this.pieceArt(i));
        for (let gx = b.x + 3; gx < b.x + b.w; gx += 8) ctx.drawImage(glow.canvas, Math.round(gx - glow.w / 2), Math.round(b.y + b.h / 2 - glow.h / 2));
      }
      ctx.restore();
      this.drawFireflies(m, now);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private put(s: Sprite, cx: number, by: number, alpha = 1): void {
    const ctx = this.ctx;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s.canvas, Math.round(cx - s.w / 2), by - s.h);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  pieceArt(item: PlacedItem): Sprite {
    const art = (byId(item.id)?.art ?? 'sparkle') as ItemArt;
    return this.sprite(`item:${art}`, () => toSprite(drawItem(art)));
  }

  private drawPiece(item: PlacedItem): void {
    const s = this.pieceArt(item);
    const b = pieceBox(item, s);
    const ctx = this.ctx;
    if (item.flip) {
      ctx.save();
      ctx.translate(b.x * 2 + s.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(s.canvas, b.x, b.y);
      ctx.restore();
    } else ctx.drawImage(s.canvas, b.x, b.y);
  }

  /** A marching dashed outline, like the burrow's. */
  private outline(b: { x: number; y: number; w: number; h: number }, now: number): void {
    const ctx = this.ctx;
    const x0 = b.x - 2, y0 = b.y - 2, x1 = b.x + b.w + 1, y1 = b.y + b.h + 1;
    const phase = reduceMotion ? 0 : Math.floor(now / 160) % 4;
    const on = (i: number) => (i + phase) % 4 < 2;
    ctx.fillStyle = '#F6D24A';
    let i = 0;
    for (let x = x0; x <= x1; x++, i++) if (on(i)) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x1 - (x - x0), y1, 1, 1); }
    for (let y = y0; y <= y1; y++, i++) if (on(i)) { ctx.fillRect(x1, y, 1, 1); ctx.fillRect(x0, y1 - (y - y0), 1, 1); }
  }

  private drawThing(m: GardenModel, t: GardenThing, now: number): void {
    if (t.kind === 'plot') {
      if (t.state === 'locked') { this.put(this.sprite('sign', () => toSprite(drawSignpost())), t.spot.x, t.spot.y); return; }
      const p = m.pet.garden?.plots?.[t.index] ?? null;
      const st = p ? stage(p, m.nowMs) : 0;
      const art = p ? CROP_ART[p.crop] : null;
      this.put(this.sprite(`plot:${art}:${st}`, () => toSprite(drawPlot(art, p ? st : 0))), t.spot.x, t.spot.y);
      if (t.state === 'ready' && !reduceMotion) {
        // a twinkle over a crop that's ready to pick
        const on = Math.floor(now / 600 + t.index) % 3 === 0;
        if (on) this.put(this.sprite('item:sparkle', () => toSprite(drawItem('sparkle'))), t.spot.x + 6, t.spot.y - 18);
      }
      return;
    }
    const id = t.kind === 'shed' ? 'shed' : t.id;
    if (t.state === 'owned') { this.put(this.sprite(`item:${id}`, () => toSprite(drawItem(id))), t.spot.x, t.spot.y); return; }
    const { w, h } = SPOT[id];
    const dim = t.state === 'locked';
    this.put(this.sprite(`spot:${w}:${h}:${dim}`, () => toSprite(drawSpot(w, h, dim))), t.spot.x, t.spot.y);
  }

  /** The hedge and gate between the yard and the meadow, while the meadow is shut. */
  private drawHedge(m: GardenModel): void {
    const ctx = this.ctx;
    const x = GATE_X - 3;
    if (m.meadowOpen) {
      // open: the gateposts stay, the gate swung back against the hedge's stump
      ctx.fillStyle = '#6E4527';
      ctx.fillRect(x - 1, 62, 2, 17); ctx.fillRect(x + 6, 62, 2, 17);
      return;
    }
    const leaf = m.season === 'winter' ? ['#C9D5E0', '#E8EEF3'] : ['#3F7F2E', '#4E9A38'];
    for (let y = 50; y < STRIP_H; y++) {
      if (y >= 66 && y < 78) continue; // the gate's gap, on the path
      ctx.fillStyle = leaf[(y >> 1) % 2]!;
      ctx.fillRect(x - ((y * 7) % 3 === 0 ? 1 : 0), y, 7, 1);
    }
    // the gate: two posts and planks, shut
    ctx.fillStyle = '#6E4527';
    ctx.fillRect(x - 1, 62, 2, 17); ctx.fillRect(x + 6, 62, 2, 17);
    ctx.fillStyle = '#C99561';
    for (const gy of [66, 70, 74]) ctx.fillRect(x + 1, gy, 5, 2);
    ctx.fillStyle = '#A0703F';
    ctx.fillRect(x + 1, 68, 5, 1); ctx.fillRect(x + 1, 72, 5, 1);
    this.put(this.sprite('sign', () => toSprite(drawSignpost())), x + 16, 78);
  }

  private drawRabbit(m: GardenModel, now: number): void {
    if (m.asleep || m.absent) return;
    if (m.area !== this.rabbitArea) {
      // she follows you: in from the side you came from, a short hop to her spot
      const fromLeft = AREAS_ORDER[m.area] > AREAS_ORDER[this.rabbitArea];
      this.rabbitX = RABBIT_SPOT[m.area] + (fromLeft ? -30 : 30);
      this.rabbitArea = m.area;
    }
    const goal = RABBIT_SPOT[m.area];
    const dx = goal - this.rabbitX;
    const moving = Math.abs(dx) > 0.5 && !reduceMotion;
    if (moving) {
      this.facing = dx > 0 ? -1 : 1;
      this.rabbitX += Math.sign(dx) * Math.min(Math.abs(dx), 2.5);
    } else this.rabbitX = goal;
    let frame: Frame = 0;
    if (!moving) {
      if (now > this.blinkAt) { frame = 2; if (now > this.blinkAt + 140) this.blinkAt = now + 2500 + Math.random() * 3000; }
      else if (!reduceMotion && Math.floor(now / 900) % 3 === 1) frame = 1;
    }
    const face: Face = 'content';
    const s = this.sprite(`rabbit:${m.coat}:${face}:${frame}:${dressKey(m.dress)}`, () => toSprite(drawRabbit(m.coat, face, frame, m.dress)));
    const hop = moving ? Math.round(Math.abs(Math.sin(this.rabbitX / 5)) * 3) : 0;
    const left = Math.round(this.rabbitX - s.w / 2), top = STRIP_H - RABBIT_GROUND - hop - 1;
    const ctx = this.ctx;
    ctx.save();
    if (this.facing === -1) { ctx.translate(left * 2 + s.w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(s.canvas, left, top);
    ctx.restore();
  }

  /** Her box in strip pixels, for tap-to-pet; null while she's asleep in the burrow. */
  rabbitBox(m: GardenModel): { x: number; y: number; w: number; h: number } | null {
    return m.asleep || m.absent ? null : { x: this.rabbitX - 14, y: STRIP_H - 34, w: 28, h: 32 };
  }

  /** Rain, snow or leaves across the whole view, like the burrow's window has them. */
  private drawWeather(m: GardenModel, now: number, cam: number): void {
    const w = m.weather;
    if (w !== 'rain' && w !== 'snow' && w !== 'leaves') return;
    const ctx = this.ctx;
    const t = reduceMotion ? 0 : now / 1000;
    const span = this.w + 8, top = -this.offsetY;
    const height = STRIP_H + this.offsetY;
    const n = Math.round((w === 'rain' ? 0.5 : w === 'snow' ? 0.45 : 0.14) * span);
    for (let i = 0; i < n; i++) {
      const seed = (i * 73.13) % span, lane = (i * 41.7) % height;
      let x: number, y: number;
      if (w === 'rain') {
        ctx.fillStyle = m.night ? '#5A6E9A' : '#7F9CBC';
        y = (lane + t * 70) % height; x = (seed + y * 0.25) % span;
        ctx.fillRect(Math.floor(cam + x - 4), Math.floor(top + y), 1, 3);
      } else if (w === 'snow') {
        ctx.fillStyle = '#FFFFFF';
        y = (lane + t * 9 * (1 + (i % 3) * 0.3)) % height; x = (seed + Math.sin(t + i) * 2 + span) % span;
        ctx.fillRect(Math.floor(cam + x - 4), Math.floor(top + y), i % 4 ? 1 : 2, i % 4 ? 1 : 2);
      } else {
        ctx.fillStyle = i % 2 ? '#D9772E' : '#B8452E';
        y = (lane + t * 12) % height; x = (seed + t * 14 + Math.sin(t * 2 + i) * 3) % span;
        ctx.fillRect(Math.floor(cam + x - 4), Math.floor(top + y), 2, 1);
      }
    }
  }

  private drawFireflies(m: GardenModel, now: number): void {
    if (m.season === 'winter' || m.weather === 'rain' || m.weather === 'snow') return;
    const t = reduceMotion ? 0 : now / 1000;
    for (let i = 0; i < 12; i++) {
      const x = (i * 97.3 + Math.sin(t * 0.4 + i) * 10 + STRIP_W) % STRIP_W;
      const y = 56 + ((i * 31.7) % 55) + Math.sin(t * 0.7 + i * 2) * 4;
      const f = (Math.floor(t * 2 + i) % 3 === 0 ? 1 : 0) as 0 | 1;
      this.put(this.sprite(`fly:${f}`, () => toSprite(drawFirefly(f))), x, Math.round(y));
    }
  }
}

const skyTops = new WeakMap<Sprite, string>();
/** The colour at the top of the sky, to fill a stage taller than the strip. */
function skyTop(bg: Sprite): string {
  let c = skyTops.get(bg);
  if (!c) {
    const d = bg.canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data;
    c = d ? `rgb(${d[0]},${d[1]},${d[2]})` : '#9FD3F0';
    skyTops.set(bg, c);
  }
  return c;
}

/** Something that's there, rather than a spot to build or a plot still locked. */
function built(t: GardenThing): boolean {
  return t.kind === 'plot' ? t.state !== 'locked' : t.state === 'owned';
}
