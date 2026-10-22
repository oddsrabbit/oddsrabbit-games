// Eat lab: mock-ups of the eating reaction, side by side, for picking one.
// Uses the game's own drawRabbit and food art; the mouths, bites, crumbs and
// head dips are painted over them here. Built by `npm run build` into
// dist/dev/eat-lab.js, which dev/eat-lab.html loads. Not shipped.
//
// Every variant is a pure function of time, so a frame can be drawn at any t
// (the scrubber) and a replay always looks the same.

import { drawItem, type ItemArt } from '../src/art/items';
import { hex, same, toSprite, type PixelGrid, type RGBA, type Sprite } from '../src/art/pixels';
import { drawRabbit, RABBIT_GROUND, RABBIT_W, TUNE, type Face, type Frame } from '../src/art/rabbit';
import { drawMeal, EAT_MS, EAT_SWALLOW_MS, eatingPose } from '../src/render';
import { COATS, EARS, type Coat, type Ears } from '../src/sim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ scene

/** The little stage each card draws, in art pixels. */
const SW = 72, SH = 50, FLOOR = 44;
const RX = Math.round((SW - RABBIT_W) / 2), RY = FLOOR - RABBIT_GROUND;
const WALL = '#F2DCB9', FLOOR_C = '#C9A07A', FLOOR_LINE = '#8A5A3C';
const NOSE = hex('E4768D'), PINKD = hex('DE8697'), PINK = hex('F3A6B3');

type Outcome = 'loves' | 'happy' | 'okay';
type Mouth = 'w' | 'open' | 'closed' | 'wide' | 'lick';

interface Opts { coat: Coat; ears: Ears; food: ItemArt; outcome: Outcome }

/** One frame of her: the base face plus what this lab paints over it. */
interface Pose {
  face?: Face; frame?: Frame; mouth?: Mouth;
  /** Cheeks pushed out a pixel, full of food. */
  puff?: boolean;
  /** Nose up a pixel (a twitch). */
  noseUp?: boolean;
  /** Head and chest moved down (and across) by this many pixels. */
  dip?: number;
  /** Whole-body lift, for a hop. */
  lift?: number;
}

const clone = (g: PixelGrid): PixelGrid => ({ w: g.w, h: g.h, px: g.px.map((r) => r.slice()) });
const put = (g: PixelGrid, x: number, y: number, c: RGBA) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y]![x] = c; };

function findNose(g: PixelGrid): { x: number; y: number } {
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (same(g.px[y]![x]!, NOSE)) return { x, y };
  return { x: 19, y: 23 };
}

const rabbitCache = new Map<string, Sprite>();
function rabbitSprite(o: Opts, p: Pose): Sprite {
  const key = `${muzzleId}|${o.coat}|${o.ears}|${JSON.stringify(p)}`;
  let s = rabbitCache.get(key);
  if (s) return s;
  const face = p.face ?? 'content';
  // the 'content' face carries the line and fur colours around the mouth
  const ref = drawRabbit(o.coat, 'content', p.frame ?? 0, { ears: o.ears });
  const n = findNose(ref);
  const line = ref.px[n.y + 1]![n.x - 1]!, fur = ref.px[n.y + 1]![n.x]!;
  let g = clone(drawRabbit(o.coat, face === 'eating' && p.mouth ? 'content' : face, p.frame ?? 0, { ears: o.ears }));
  if (p.mouth && face !== 'asleep') {
    for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 2; dx++) put(g, n.x + dx, n.y + dy, fur);
    const L = (dx: number, dy: number) => put(g, n.x + dx, n.y + dy, line);
    const P = (dx: number, dy: number, c = PINKD) => put(g, n.x + dx, n.y + dy, c);
    switch (p.mouth) {
      case 'w': L(-1, 1); L(2, 1); break;
      case 'closed': L(0, 1); L(1, 1); break;
      case 'open': L(0, 1); L(1, 1); P(0, 2); P(1, 2); break;
      case 'wide': L(-1, 1); L(0, 1); L(1, 1); L(2, 1); P(0, 2); P(1, 2); L(-1, 2); L(2, 2); L(0, 3); L(1, 3); break;
      case 'lick': L(-1, 1); L(2, 1); L(0, 1); P(1, 2, PINK); P(2, 2, PINK); break;
    }
  }
  if (p.noseUp) {
    put(g, n.x, n.y, fur); put(g, n.x + 1, n.y, fur);
    put(g, n.x, n.y - 1, NOSE); put(g, n.x + 1, n.y - 1, NOSE);
  }
  if (p.puff) {
    // push the outline out a pixel either side, over three rows by the mouth
    for (let y = n.y - 1; y <= n.y + 1; y++) {
      const row = g.px[y]!;
      let l = -1, r = -1;
      for (let x = 0; x < g.w; x++) if (row[x]![3]) { if (l < 0) l = x; r = x; }
      if (l < 0) continue;
      put(g, l - 1, y, line); put(g, l, y, fur); put(g, r + 1, y, line); put(g, r, y, fur);
    }
  }
  if (p.dip) g = dipHead(g, p.dip);
  s = toSprite(g);
  rabbitCache.set(key, s);
  return s;
}

/** Everything above her lower body moved down `d` pixels: a bow of the head. */
function dipHead(g: PixelGrid, d: number): PixelGrid {
  const SPLIT = 30;
  const out = clone(g);
  for (let y = 0; y < SPLIT; y++) for (let x = 0; x < g.w; x++) out.px[y]![x] = [0, 0, 0, 0];
  for (let y = 0; y < SPLIT; y++) for (let x = 0; x < g.w; x++) {
    const c = g.px[y]![x]!;
    if (c[3]) put(out, x, y + d, c);
  }
  return out;
}

// ------------------------------------------------------------------ food

interface FoodState {
  /** Top-left in scene pixels. */
  x: number; y: number;
  /** Bites taken out of the top, 0..n. */
  bites?: number;
  /** Rows eaten off the top, continuous (0..1 of its height). */
  eaten?: number;
  /** Paws holding it. */
  paws?: boolean;
}

const foodGrids = new Map<ItemArt, PixelGrid>();
const foodGrid = (a: ItemArt) => { let g = foodGrids.get(a); if (!g) { g = drawItem(a); foodGrids.set(a, g); } return g; };
const foodCache = new Map<string, Sprite>();

/** Pixel rows of the food with bites taken: a round notch per bite, working down from the top. */
function bitten(a: ItemArt, bites: number, eaten: number): Sprite {
  const key = `${a}|${bites}|${Math.round(eaten * 20)}`;
  let s = foodCache.get(key);
  if (s) return s;
  const g = clone(foodGrid(a));
  let top = 0;
  while (top < g.h && !g.px[top]!.some((c) => c[3])) top++;
  const h = g.h - top;
  const BITES = [[0.62, 0.05], [0.35, 0.25], [0.6, 0.5], [0.4, 0.78]] as const;
  for (let i = 0; i < Math.min(bites, BITES.length); i++) {
    const [fx, fy] = BITES[i]!;
    const cx = fx * g.w, cy = top + fy * h, r = Math.max(2.2, g.w * 0.28);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r || y + 0.5 < cy) g.px[y]![x] = [0, 0, 0, 0];
    }
  }
  const cut = top + Math.round(eaten * h);
  for (let y = 0; y < Math.min(cut, g.h); y++) for (let x = 0; x < g.w; x++) g.px[y]![x] = [0, 0, 0, 0];
  s = toSprite(g);
  foodCache.set(key, s);
  return s;
}

/** A few of the food's own colours, for crumbs. */
function crumbColours(a: ItemArt): string[] {
  const seen = new Set<string>();
  for (const row of foodGrid(a).px) for (const c of row) if (c[3] && !(c[0] < 80 && c[1] < 70)) seen.add(`rgb(${c[0]},${c[1]},${c[2]})`);
  return [...seen].slice(0, 4);
}

// ------------------------------------------------------------------ helpers

/** 0..1 through [a, b], clamped. */
const prog = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
/** Square wave: true for the first half of each `period`. */
const beat = (t: number, period: number, from = 0) => t >= from && Math.floor((t - from) / period) % 2 === 0;
const count = (t: number, times: number[]) => times.filter((x) => t >= x).length;

/** Scene coords of her mouth (left nose pixel + 2 rows), for a dip. */
const MOUTH = { x: RX + 19, y: RY + 25 };

interface Draw {
  pose: Pose;
  food?: FoodState | null;
  /** Times crumbs were knocked off, and whether they fly (big bites) or drop. */
  crumbs?: { at: number[]; fly?: boolean; floor?: boolean };
  hearts?: number | null;
}

interface Variant {
  id: string; name: string; blurb: string; ms: number;
  draw(t: number, o: Opts): Draw;
  /** Draws her itself, with the game's own code, instead of through draw(). */
  paint?(ctx: CanvasRenderingContext2D, t: number, o: Opts): void;
}

const gameRabbits = new Map<string, Sprite>();

/** How she finishes, from the meal's reaction (tuning.ts FOOD_REACTIONS). */
function ending(t: number, from: number, o: Opts, pose: Pose): Draw {
  const e = t - from;
  if (o.outcome === 'loves') return { pose: { ...pose, face: 'happy', mouth: e < 260 ? 'lick' : 'w' }, hearts: from + 60 };
  if (o.outcome === 'happy') return { pose: { ...pose, mouth: e < 300 ? 'lick' : 'w' } };
  return { pose: { ...pose, mouth: 'closed', frame: e > 250 && e < 600 ? 2 : 0 } };
}

const underChin = (bites = 0, eaten = 0): FoodState => ({ x: 0, y: RY + RABBIT_GROUND - 12, bites, eaten });

const VARIANTS: Variant[] = [
  {
    id: 'game', name: '★ In the game now (C)', ms: EAT_MS,
    blurb: "The game's real eating code (render.ts eatingPose and drawMeal, and the new faces in rabbit.ts): what you'll see when you feed her.",
    draw: () => ({ pose: {} }),
    paint(ctx, t, o) {
      const { face, frame } = eatingPose(t, o.outcome, reduceMotion());
      const key = `${muzzleId}|${o.coat}|${o.ears}|${face}|${frame}`;
      let s = gameRabbits.get(key);
      if (!s) { s = toSprite(drawRabbit(o.coat, face, frame, { ears: o.ears })); gameRabbits.set(key, s); }
      ctx.drawImage(s.canvas, RX, RY);
      drawMeal(ctx, o.coat, o.food, t, RX + RABBIT_W / 2, FLOOR, reduceMotion());
      // main.ts bursts hearts at the swallow when she loves it
      if (o.outcome === 'loves') drawHearts(ctx, t, EAT_SWALLOW_MS);
    },
  },
  {
    id: 'current', name: 'A · Current', ms: 1800,
    blurb: 'What ships today: one open-mouth face, the food held still under her chin, gone when the reaction ends.',
    draw(t, o) {
      if (o.outcome === 'loves' && t > 500) return { pose: { face: 'eating' }, food: underChin(), hearts: 500 };
      return { pose: { face: 'eating' }, food: underChin() };
    },
  },
  {
    id: 'munch', name: 'B · Munch', ms: 2100,
    blurb: 'Same place as now, but she chews: mouth open and shut, a one-pixel head bob, four bites out of the food and crumbs dropping.',
    draw(t, o) {
      const bitesAt = [250, 650, 1050, 1450];
      if (t >= 1650) return { ...ending(t, 1650, o, {}), crumbs: { at: bitesAt } };
      const open = beat(t, 150);
      return {
        pose: { mouth: open ? 'open' : 'closed', frame: open ? 0 : 1 },
        food: underChin(count(t, bitesAt)),
        crumbs: { at: bitesAt },
      };
    },
  },
  {
    id: 'nibble', name: 'C · Nibble in paws', ms: 2300,
    blurb: 'She holds it up in both paws, eyes shut, nose twitching, and nibbles it away from the top, then a swallow.',
    draw(t, o) {
      const eaten = prog(t, 300, 1700);
      const lift = Math.round(prog(t, 0, 220) * 3);
      const food: FoodState = { ...underChin(0, eaten), y: underChin().y - lift, paws: true };
      const nibbles = { at: [500, 900, 1300, 1650] };
      if (t >= 1850) return { ...ending(t, 1850, o, {}), crumbs: nibbles };
      return {
        pose: { face: 'happy', mouth: beat(t, 90) ? 'closed' : 'w', noseUp: beat(t, 180, 60) },
        food: eaten >= 1 ? null : food,
        crumbs: nibbles,
      };
    },
  },
  {
    id: 'graze', name: 'D · Bow to the bowl', ms: 2500,
    blurb: 'The food sits on the floor in front of her. She bows her head for each bite, sits up to chew, three times over.',
    draw(t, o) {
      const cycle = 560, dips = [0, 1, 2].map((i) => 150 + i * cycle);
      const floor: FoodState = { x: 0, y: FLOOR - 9, bites: count(t, dips.map((d) => d + 120)) };
      const crumbs = { at: dips.map((d) => d + 120), floor: true };
      if (t >= 150 + 3 * cycle) return { ...ending(t, 150 + 3 * cycle, o, {}), crumbs, food: floor.bites! >= 3 ? null : floor };
      const k = Math.max(0, t - 150) % cycle;
      const dip = t < 150 ? 0 : k < 120 ? Math.round((k / 120) * 4) : k < 200 ? 4 : k < 320 ? Math.round((1 - (k - 200) / 120) * 4) : 0;
      const mouth: Mouth = t < 150 ? 'w' : k < 120 ? 'open' : k < 200 ? 'closed' : beat(k, 110, 320) ? 'closed' : 'open';
      return { pose: { dip, mouth, puff: t > 400 && k > 320 }, food: floor.bites! >= 3 ? null : floor, crumbs };
    },
  },
  {
    id: 'chomp', name: 'E · Big chomps', ms: 2600,
    blurb: 'Three hungry chomps, each with a head dip and crumbs flying, fast chewing with full cheeks, then a happy little hop.',
    draw(t, o) {
      const chomps = [300, 750, 1200];
      const crumbs = { at: chomps.map((c) => c + 60), fly: true };
      const bites = count(t, chomps.map((c) => c + 60));
      if (t >= 1650) {
        const e = t - 1650;
        const end = ending(t, 1650, o, {});
        const hop = o.outcome === 'okay' ? 0 : Math.round(Math.sin(prog(e, 150, 450) * Math.PI) * 3);
        return { ...end, pose: { ...end.pose, lift: hop }, crumbs, food: null };
      }
      const since = Math.max(...chomps.map((c) => (t >= c - 100 ? t - c : -1e9)));
      let pose: Pose;
      if (since > -100 && since < 0) pose = { mouth: 'wide' };
      else if (since >= 0 && since < 160) pose = { mouth: 'closed', dip: since < 80 ? 2 : 1, puff: true };
      else pose = { mouth: t < 200 ? 'w' : beat(t, 80) ? 'closed' : 'w', puff: t > 300, frame: beat(t, 160) ? 1 : 0 };
      return { pose, food: bites >= 3 ? null : underChin(bites + (bites ? 1 : 0)), crumbs };
    },
  },
];

// ------------------------------------------------------------------ drawing

/** A cheap seeded random from two ints, so crumbs land the same on every replay. */
const rnd = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

function drawScene(ctx: CanvasRenderingContext2D, v: Variant, t: number, o: Opts): void {
  ctx.fillStyle = WALL; ctx.fillRect(0, 0, SW, SH);
  ctx.fillStyle = FLOOR_C; ctx.fillRect(0, FLOOR - 4, SW, SH);
  ctx.fillStyle = FLOOR_LINE; ctx.fillRect(0, FLOOR - 4, SW, 1);

  if (v.paint) { v.paint(ctx, t, o); return; }
  const d = v.draw(t, o);
  const r = rabbitSprite(o, d.pose);
  ctx.drawImage(r.canvas, RX, RY - (d.pose.lift ?? 0));

  if (d.food) {
    const g = foodGrid(o.food);
    const s = bitten(o.food, d.food.bites ?? 0, d.food.eaten ?? 0);
    const x = Math.round(RX + RABBIT_W / 2 - g.w / 2 + 1), y = d.food.y - (d.pose.lift ?? 0);
    ctx.drawImage(s.canvas, x, y);
    if (d.food.paws) {
      // two small round paws gripping the bottom of what's left
      const c = pawColour(o);
      const py = y + g.h - 5;
      for (const px of [x - 2, x + g.w - 2]) {
        ctx.fillStyle = c.line;
        ctx.fillRect(px + 1, py, 2, 1); ctx.fillRect(px, py + 1, 1, 2); ctx.fillRect(px + 3, py + 1, 1, 2); ctx.fillRect(px + 1, py + 3, 2, 1);
        ctx.fillStyle = c.fur; ctx.fillRect(px + 1, py + 1, 2, 2);
      }
    }
  }

  // crumbs: 3 per bite, from the mouth; they fall and lie on the floor a moment
  const cols = crumbColours(o.food);
  const c = d.crumbs;
  if (c) c.at.forEach((at, i) => {
    for (let k = 0; k < 3; k++) {
      const e = t - at;
      if (e < 0 || e > 900) continue;
      const vx = (rnd(i, k) - 0.5) * (c.fly ? 0.05 : 0.02), vy = c.fly ? -0.03 - rnd(k, i) * 0.02 : -0.005;
      const x0 = MOUTH.x + (rnd(i + 9, k) - 0.5) * 3, y0 = c.floor ? FLOOR - 4 : MOUTH.y + 3;
      let x = x0 + vx * e, y = y0 + vy * e + 0.00006 * e * e;
      const ground = FLOOR - 2 + Math.round(rnd(k, i + 3) * 3);
      if (y > ground) { y = ground; x = x0 + vx * Math.min(e, 300); }
      ctx.globalAlpha = e > 600 ? (900 - e) / 300 : 1;
      ctx.fillStyle = cols[(i + k) % cols.length] ?? '#c96';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ctx.globalAlpha = 1;
    }
  });

  if (d.hearts != null) drawHearts(ctx, t, d.hearts);
}

/** Three hearts from `from`, staggered, rising and fading like the game's burst(). */
function drawHearts(ctx: CanvasRenderingContext2D, t: number, from: number): void {
  const h = heart();
  for (let i = 0; i < 3; i++) {
    const e = t - from - i * 140;
    if (e < 0 || e > 1100) continue;
    ctx.globalAlpha = 1 - e / 1100;
    ctx.drawImage(h.canvas, Math.round(RX + 12 + i * 8 - h.w / 2), Math.round(RY + 6 + (i % 2) * 3 - e * 0.019));
    ctx.globalAlpha = 1;
  }
}

/** The lab's "reduced motion" box, to see the game's still version. */
const reduceMotion = () => ($('still') as HTMLInputElement | null)?.checked ?? false;

let heartS: Sprite | null = null;
const heart = () => (heartS ??= toSprite(drawItem('heart')));

function pawColour(o: Opts): { fur: string; line: string } {
  const g = drawRabbit(o.coat, 'content', 0, { ears: o.ears });
  const n = findNose(g);
  const f = g.px[n.y + 1]![n.x]!, l = g.px[n.y + 1]![n.x - 1]!;
  return { fur: `rgb(${f[0]},${f[1]},${f[2]})`, line: `rgb(${l[0]},${l[1]},${l[2]})` };
}

// ------------------------------------------------------------------ muzzles

/** Shapes for the light patch round her mouth (TUNE.muzzle in rabbit.ts), to pick from. */
const MUZZLES: { id: string; name: string; blurb: string; m: typeof TUNE.muzzle }[] = [
  { id: 'clipped', name: 'M1 · Clipped oval', blurb: 'The original oval, clipped off the eye rows and from under the eyes.', m: { y: 0.45, w: 0.42, h: 0.32, clear: true } },
  { id: 'orig', name: 'M2 · Original', blurb: 'Before the fix: the oval reaches up level with the bottom of her eyes.', m: { y: 0.45, w: 0.42, h: 0.32, clear: false } },
  { id: 'small', name: 'M3 · Small and low', blurb: 'A smaller oval sitting lower, so it clears the eyes by itself.', m: { y: 0.6, w: 0.34, h: 0.24, clear: false } },
  { id: 'snout', name: 'M4 · Snout (in the game now)', blurb: 'Just a little patch round the nose and mouth.', m: { y: 0.5, w: 0.25, h: 0.2, clear: false } },
  { id: 'chin', name: 'M5 · Chin', blurb: 'A wide soft patch under the mouth, like a pale chin.', m: { y: 0.74, w: 0.46, h: 0.22, clear: false } },
  { id: 'none', name: 'M6 · None', blurb: 'No patch at all: one flat fur colour on her face.', m: { y: 0.45, w: 0.42, h: 0, clear: false } },
];
let muzzleId = 'snout';

/** Draw with a muzzle shape, then put the one in use back. */
function withMuzzle<T>(m: typeof TUNE.muzzle, f: () => T): T {
  const keep = { ...TUNE.muzzle };
  Object.assign(TUNE.muzzle, m);
  try { return f(); } finally { Object.assign(TUNE.muzzle, keep); }
}

/** Her head, cropped from the 40×40 grid, for the muzzle gallery. */
const HEAD = { x: 10, y: 16, w: 20, h: 15 };

function paintMuzzle(cv: HTMLCanvasElement, m: typeof TUNE.muzzle, o: Opts): void {
  const faces: [Coat, Face][] = [...COATS.map((c) => [c, 'content'] as [Coat, Face]), [o.coat, 'nibble'], [o.coat, 'happy'], [o.coat, 'lick']];
  const k = 6, gap = 2;
  cv.width = faces.length * (HEAD.w + gap) * k; cv.height = HEAD.h * k;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = WALL; ctx.fillRect(0, 0, cv.width, cv.height);
  faces.forEach(([coat, face], i) => {
    const s = withMuzzle(m, () => toSprite(drawRabbit(coat, face, 0, { ears: o.ears })));
    ctx.drawImage(s.canvas, HEAD.x, HEAD.y, HEAD.w, HEAD.h, i * (HEAD.w + gap) * k, 0, HEAD.w * k, HEAD.h * k);
  });
}

const muzzleCards = MUZZLES.map((mz) => {
  const fig = document.createElement('figure');
  fig.className = 'card muzzle';
  fig.innerHTML = `<canvas></canvas><figcaption><b>${mz.name}</b><span>${mz.blurb}</span><code>muzzle: ${JSON.stringify(mz.m).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')}</code></figcaption>`;
  fig.addEventListener('click', () => pickMuzzle(mz.id));
  $('muzzles').append(fig);
  return { mz, fig, cv: fig.querySelector('canvas')! };
});

function pickMuzzle(id: string): void {
  const mz = MUZZLES.find((m) => m.id === id)!;
  muzzleId = id;
  Object.assign(TUNE.muzzle, mz.m);
  for (const c of muzzleCards) c.fig.classList.toggle('on', c.mz.id === id);
  $('using').textContent = mz.name;
}

let muzzleKey = '';
function paintMuzzles(): void {
  const o = opts();
  const key = `${o.coat}|${o.ears}`;
  if (key === muzzleKey) return;
  muzzleKey = key;
  for (const c of muzzleCards) paintMuzzle(c.cv, c.mz.m, o);
}

// ------------------------------------------------------------------ page

const FOODS: [ItemArt, string][] = [['carrot', 'Carrot'], ['greens', 'Greens'], ['strawberry', 'Strawberry'], ['treat', 'Oat treat'], ['golden', 'Golden carrot']];
const fill = (sel: HTMLSelectElement, values: readonly (readonly [string, string])[]) => values.forEach(([v, l]) => sel.append(new Option(l, v)));
fill($('coat'), COATS.map((c) => [c, c]));
fill($('ears'), EARS.map((e) => [e, e]));
fill($('food'), FOODS);
($('food') as HTMLSelectElement).value = 'strawberry';
($('ears') as HTMLSelectElement).value = EARS.includes('long' as Ears) ? 'long' : EARS[0]!;

const opts = (): Opts => ({
  coat: ($('coat') as HTMLSelectElement).value as Coat,
  ears: ($('ears') as HTMLSelectElement).value as Ears,
  food: ($('food') as HTMLSelectElement).value as ItemArt,
  outcome: ($('outcome') as HTMLSelectElement).value as Outcome,
});

const GAP = 700;
const cards = VARIANTS.map((v) => {
  const fig = document.createElement('figure');
  fig.className = 'card';
  fig.innerHTML = `<div class="stage"><canvas></canvas><canvas class="small"></canvas></div><figcaption><b>${v.name}</b><span>${v.blurb}</span></figcaption>`;
  $('cards').append(fig);
  const [big, small] = [...fig.querySelectorAll('canvas')] as HTMLCanvasElement[];
  return { v, big: big!, small: small!, fig };
});

// one offscreen canvas at art size, scaled up to each card with smoothing off
const art = document.createElement('canvas');
art.width = SW; art.height = SH;
const actx = art.getContext('2d')!;

let start = performance.now();
pickMuzzle('snout');
function tick(now: number): void {
  const o = opts();
  paintMuzzles();
  const speed = Number(($('speed') as HTMLSelectElement).value);
  const scrub = ($('pause') as HTMLInputElement).checked ? Number(($('scrub') as HTMLInputElement).value) : null;
  const zoom = Number(($('zoom') as HTMLSelectElement).value);
  for (const c of cards) {
    const loop = c.v.ms + GAP;
    const t = scrub != null ? scrub * c.v.ms : ((now - start) * speed) % loop;
    actx.clearRect(0, 0, SW, SH);
    drawScene(actx, c.v, Math.min(t, c.v.ms), o);
    for (const [cv, k] of [[c.big, zoom], [c.small, 2]] as const) {
      if (cv.width !== SW * k) { cv.width = SW * k; cv.height = SH * k; }
      const x = cv.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.drawImage(art, 0, 0, SW * k, SH * k);
    }
  }
  $('time').textContent = scrub != null ? `${Math.round(scrub * 100)}% through each` : '';
  requestAnimationFrame(tick);
}
$('replay').addEventListener('click', () => { start = performance.now(); ($('pause') as HTMLInputElement).checked = false; });
requestAnimationFrame(tick);
