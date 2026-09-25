// The burrow scene. Everything is drawn at 1x onto a 98x118 canvas that CSS
// scales up by a whole number with smoothing off, so every art pixel stays a
// crisp square. The renderer owns only presentation state (where she is
// standing, which way she faces, floating hearts); the game state it draws
// comes in each frame.

import { drawBurrow, drawWindowView, SCENE_H, SCENE_W, WINDOW } from './art/burrow';
import { drawGlow, drawItem, type ItemArt } from './art/items';
import { toSprite, type Sprite } from './art/pixels';
import { drawRabbit, dressKey, RABBIT_GROUND, RABBIT_W, type Dress, type Face, type Frame } from './art/rabbit';
import { byId, type BurrowState, type DecorDef, type PlacedItem } from './decor';
import type { Coat, Mood } from './sim';
import type { Season, Weather } from './world';

export interface SceneModel {
  coat: Coat;
  night: boolean;
  mood: Mood;
  burrow: BurrowState;
  /** Decorating hides the thought bubble and keeps her out of the way. */
  decorating: boolean;
  /** The piece being moved, outlined while decorating. */
  selected: string | null;
  /** Her outfit and marking. */
  dress?: Dress;
  /** What the window shows. */
  season?: Season;
  weather?: Weather;
  /** Visiting a friend: no wandering off-script, no thought bubbles. */
  guest?: boolean;
  /** Away on holiday: the burrow is empty. */
  absent?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Top of the arched ceiling at a column, for hanging ropes. */
function ceilingY(x: number): number {
  const t = (x + 0.5 - 49) / 46;
  return Math.ceil(64 - 58 * Math.sqrt(Math.max(0, 1 - t * t))) + 1;
}

type Reaction = 'eating' | 'happy' | 'clean';
interface Particle { art: ItemArt; x: number; y: number; vy: number; born: number; life: number }

const WALK_MIN = 28;
const WALK_MAX = 60;
const STAND_Y = 106;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Scene {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg: { day: Sprite; night: Sprite };
  private readonly items = new Map<string, Sprite>();
  private readonly glow: Sprite;
  private rabbitCache = new Map<string, Sprite>();

  private x = 40;
  private targetX = 40;
  private facing: 1 | -1 = 1;
  private nextWander = 0;
  private hopPhase = 0;
  private reaction: { kind: Reaction; until: number; art?: ItemArt } | null = null;
  private particles: Particle[] = [];
  private blinkAt = 2000;
  private readonly soil: HTMLCanvasElement;
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
    this.bg = { day: toSprite(drawBurrow(false)), night: toSprite(drawBurrow(true)) };
    this.glow = toSprite(drawGlow());
  }

  item(art: ItemArt): Sprite {
    let s = this.items.get(art);
    if (!s) { s = toSprite(drawItem(art)); this.items.set(art, s); }
    return s;
  }

  rabbit(coat: Coat, face: Face, frame: Frame, dress?: Dress): Sprite {
    const key = `${coat}:${face}:${frame}:${dressKey(dress)}`;
    let s = this.rabbitCache.get(key);
    if (!s) {
      if (this.rabbitCache.size > 60) this.rabbitCache.clear(); // outfits change rarely; don't grow forever
      s = toSprite(drawRabbit(coat, face, frame, dress));
      this.rabbitCache.set(key, s);
    }
    return s;
  }

  private views = new Map<string, Sprite>();
  /** The sky, weather and season through the window, plus falling rain, snow or leaves. */
  private drawWindow(m: SceneModel, now: number): void {
    const season = m.season ?? 'summer', weather = m.weather ?? 'sunny';
    const key = `${season}:${weather}:${m.night}`;
    let v = this.views.get(key);
    if (!v) { v = toSprite(drawWindowView(season, weather, m.night)); this.views.set(key, v); }
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

  /** The rabbit's box in scene pixels, for tap-to-pet. */
  rabbitBox(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 14, y: STAND_Y - 32, w: 28, h: 32 };
  }

  react(kind: Reaction, now: number, art?: ItemArt): void {
    this.reaction = { kind, until: now + (kind === 'eating' ? 1800 : 1400), art };
    if (kind === 'happy') this.burst('heart', 3, now);
    if (kind === 'clean') this.burst('sparkle', 4, now);
  }

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
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const soil = ctx.createPattern(this.soil, 'repeat');
    if (soil) { ctx.fillStyle = soil; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.setTransform(1, 0, 0, 1, this.offsetX, this.offsetY);
    ctx.drawImage((m.night ? this.bg.night : this.bg.day).canvas, 0, 0);
    this.drawWindow(m, now);

    const placed = m.burrow.items
      .filter((i) => i.placed)
      .map((item) => ({ item, def: byId(item.id) }))
      .filter((p): p is { item: PlacedItem; def: DecorDef } => !!p.def);

    // rugs lie under everything
    for (const p of placed.filter((p) => p.def.zone === 'rug')) this.drawPiece(p.item, p.def);

    const asleep = m.mood === 'asleep';
    const cushion = placed.find((p) => p.def.id === 'cushion')?.item;
    const bed = asleep && cushion ? cushion : undefined;
    this.updateRabbit(m, now, bed);
    const standY = bed ? bed.y - 3 : STAND_Y;
    // floor pieces and the rabbit, back to front; asleep, she lies on her bed
    const depthOfRabbit = bed ? bed.y + 0.5 : standY;
    const floor = placed.filter((p) => p.def.zone === 'floor').sort((a, b) => a.item.y - b.item.y);
    let drewRabbit = false;
    for (const p of floor) {
      if (!drewRabbit && p.item.y > depthOfRabbit) { if (!m.absent) this.drawRabbit(m, now, standY); drewRabbit = true; }
      this.drawPiece(p.item, p.def);
    }
    if (!drewRabbit && !m.absent) this.drawRabbit(m, now, standY);

    // hanging decor, on a rope from the ceiling
    for (const p of placed.filter((p) => p.def.zone === 'hang')) {
      const top = ceilingY(p.item.x);
      ctx.fillStyle = '#5E3B26';
      if (p.item.y > top) ctx.fillRect(Math.round(p.item.x), top, 1, p.item.y - top);
      this.drawPiece(p.item, p.def);
    }

    if (m.night) {
      // Darken the whole room at once (no canvas filters: Safari lacks them),
      // then put the starry window back and add warm lantern light on top.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#62608E';
      ctx.fillRect(-this.offsetX, -this.offsetY, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(WINDOW.x, WINDOW.y, WINDOW.r - 1.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.bg.night.canvas, 0, 0);
      this.drawWindow(m, now);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of placed.filter((p) => p.def.id === 'lantern' || p.def.id === 'jackolantern')) {
        // the lantern hangs from its top; the jack-o-lantern sits on its base
        const cy = p.def.zone === 'hang' ? p.item.y + 6 : p.item.y - 5;
        ctx.drawImage(this.glow.canvas, Math.round(p.item.x - this.glow.w / 2), Math.round(cy - this.glow.h / 2));
      }
      ctx.restore();
    }

    if (!m.absent) this.drawSleepAndThoughts(m, now);
    this.drawParticles(now);
    if (m.decorating && m.selected) {
      const sel = m.burrow.items.find((i) => i.uid === m.selected && i.placed);
      const b = sel ? this.itemBox(sel) : null;
      if (b) this.dashedBox(b, now);
    }
  }

  private drawPiece(item: PlacedItem, def: DecorDef): void {
    const s = this.item(def.art);
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

  private updateRabbit(m: SceneModel, now: number, bed?: { x: number }): void {
    // asleep: she is already curled up on her cushion, not walking to it
    if (bed) { this.targetX = bed.x; this.x = bed.x; this.hopPhase = 0; return; }
    else if (m.mood !== 'asleep' && !this.reaction && now > this.nextWander && !m.decorating) {
      this.targetX = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN);
      this.nextWander = now + 3500 + Math.random() * 4000;
    }
    const dx = this.targetX - this.x;
    if (Math.abs(dx) > 0.5 && (!this.reaction || bed)) {
      if (reduceMotion) { this.x = this.targetX; this.hopPhase = 0; return; }
      this.facing = dx > 0 ? -1 : 1;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.35);
      this.hopPhase = (this.hopPhase + 0.09) % 1;
    } else {
      this.hopPhase = 0;
    }
  }

  private drawRabbit(m: SceneModel, now: number, standY: number): void {
    if (this.reaction && now > this.reaction.until) this.reaction = null;
    let face: Face = 'content';
    let frame: Frame = 0;
    if (m.mood === 'asleep') {
      face = 'asleep';
      frame = !reduceMotion && Math.floor(now / 1400) % 2 ? 1 : 0;
    } else if (this.reaction) {
      face = this.reaction.kind === 'eating' ? 'eating' : 'happy';
    } else if (m.mood === 'grumpy') {
      face = 'grumpy';
    } else {
      if (now > this.blinkAt) { frame = 2; if (now > this.blinkAt + 140) this.blinkAt = now + 2500 + Math.random() * 3000; }
      else if (!reduceMotion && this.hopPhase === 0 && Math.floor(now / 900) % 3 === 1) frame = 1;
    }
    const s = this.rabbit(m.coat, face, frame, m.dress);
    const hop = this.hopPhase ? Math.round(Math.sin(this.hopPhase * Math.PI) * 3) : 0;
    const left = Math.round(this.x - RABBIT_W / 2);
    const top = standY - RABBIT_GROUND - hop;
    const ctx = this.ctx;
    ctx.save();
    if (this.facing === -1) {
      ctx.translate(left * 2 + RABBIT_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(s.canvas, left, top);
    ctx.restore();

    // what she's eating, held under her chin
    if (this.reaction?.kind === 'eating' && this.reaction.art) {
      const f = this.item(this.reaction.art);
      ctx.drawImage(f.canvas, Math.round(this.x - f.w / 2 + 1), standY - 12);
    }
    this.lastStandY = standY;
  }

  private lastStandY = STAND_Y;

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
    const icon = !this.reaction && !m.decorating && !m.guest ? want[m.mood] : undefined;
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
