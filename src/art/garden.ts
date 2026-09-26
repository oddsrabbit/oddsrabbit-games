// The garden's background (docs/rabbit-pets-garden.md): sky, hills, the back
// fence, grass, the path and the five bed frames, across the whole strip. At
// night the sky and hills get night colours here, and the renderer darkens
// everything else by multiplying `drawGardenShade`'s tint over it: the shade
// is clear over the sky and hills, so they don't darken twice. Falling rain,
// snow and leaves are the renderer's. Plots, buildings and decor are drawn
// over it from their own sprites.

import { BED, GROUND, PLOT_SPOTS, STRIP_H, STRIP_W } from '../garden';
import type { Season, Weather } from '../world';
import { blank, hex, lcg, type PixelGrid, type RGBA } from './pixels';

interface Ground { hill: string; hill2: string; nightHill: string; nightHill2: string; tree: string | null; grass: string; grassD: string; grassL: string; flower: string | null; path: string; pathD: string; pathL: string }

const GROUNDS: Record<Season, Ground> = {
  spring: { hill: '86C95E', hill2: '5FA947', nightHill: '2E4A3A', nightHill2: '263F31', tree: 'F3A6B3', grass: '7DC05A', grassD: '5EA242', grassL: 'A6D877', flower: 'F3A6B3', path: 'B98556', pathD: '956440', pathL: 'CFA077' },
  summer: { hill: '6DB84A', hill2: '4E9A38', nightHill: '2A4636', nightHill2: '223B2D', tree: '3F7F2E', grass: '6FB348', grassD: '4F9434', grassL: '98CC62', flower: 'F6D24A', path: 'C08B58', pathD: '9A6A42', pathL: 'D6A878' },
  autumn: { hill: 'D38A4A', hill2: 'A9B55A', nightHill: '4A3A3A', nightHill2: '34393A', tree: 'C4602E', grass: '7DB852', grassD: '5E9A3E', grassL: 'A2CF6A', flower: 'E0873F', path: 'B98556', pathD: '956440', pathL: 'CFA077' },
  winter: { hill: 'F3F6FA', hill2: 'DCE5EE', nightHill: '8C94B0', nightHill2: '747C98', tree: '8FA3B8', grass: 'E8EEF3', grassD: 'C9D5E0', grassL: 'FFFFFF', flower: null, path: 'BCA995', pathD: '9C8A77', pathL: 'D6C8B8' },
};
const WOOD = { wood: 'A0703F', woodD: '6E4527', woodL: 'C99561', soil: '6B4128', soilL: '7F5134' };

/** The sky's top and bottom colour, as the burrow's window has it. */
function skyColours(weather: Weather, night: boolean): [RGBA, RGBA] {
  const overcast = weather === 'cloudy' || weather === 'rain' || weather === 'snow';
  if (night) return [hex(overcast ? '262C44' : '1D2748'), hex(overcast ? '343B55' : '2E3A62')];
  return [
    hex({ sunny: '9FD3F0', cloudy: 'C3D0DA', rain: '9DAEBE', snow: 'D6E0EA', leaves: 'B9D6E6' }[weather]),
    hex({ sunny: 'CBE8F5', cloudy: 'D8E1E8', rain: 'B6C3CF', snow: 'E6EDF3', leaves: 'D4E7F1' }[weather]),
  ];
}

const mix = (a: RGBA, b: RGBA, t: number): RGBA => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), 255];

/**
 * The whole strip's background. `phase` is tonight's moon (burrow.ts
 * moonPhase), drawn when the sky is clear.
 */
export function drawGarden(season: Season, weather: Weather, night: boolean, phase: number | null = null): PixelGrid {
  return paint(season, weather, night, phase).g;
}

/**
 * The night tint for the renderer to multiply over the garden and what stands
 * in it: `tint` over the ground, clear over the sky and hills (already night
 * coloured by drawGarden).
 */
export function drawGardenShade(season: Season, weather: Weather, tint: RGBA): PixelGrid {
  const { sky } = paint(season, weather, true, null);
  const g = blank(STRIP_W, STRIP_H);
  for (let y = 0; y < STRIP_H; y++) for (let x = 0; x < STRIP_W; x++) if (!sky[y]![x]) g.px[y]![x] = tint;
  return g;
}

function paint(season: Season, weather: Weather, night: boolean, phase: number | null): { g: PixelGrid; sky: boolean[][] } {
  const G = GROUNDS[season];
  const g = blank(STRIP_W, STRIP_H, hex(G.grass));
  // which pixels are sky or hills, so the night shade can leave them be
  const sky: boolean[][] = Array.from({ length: STRIP_H }, () => Array<boolean>(STRIP_W).fill(false));
  let painting = true;
  const set = (x: number, y: number, c: RGBA) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) { g.px[y]![x] = c; sky[y]![x] = painting; } };
  const rect = (x: number, y: number, w: number, h: number, c: RGBA) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c); };
  const rnd = lcg(season.length * 31 + weather.length);
  const overcast = weather === 'cloudy' || weather === 'rain' || weather === 'snow';

  // sky
  const horizon = GROUND.fence + 3;
  const [top, low] = skyColours(weather, night);
  for (let y = 0; y < horizon; y++) rect(0, y, STRIP_W, 1, mix(top, low, y / horizon));
  if (night && !overcast) {
    for (let i = 0; i < 40; i++) set(Math.floor(rnd() * STRIP_W), Math.floor(rnd() * 28), hex(i % 5 ? 'FFF6C8' : 'C9D3F0'));
    moon(g, 78, 12, phase);
  } else {
    const c = hex(night ? '3A4260' : weather === 'rain' ? 'A7B0BA' : overcast ? 'EEF2F5' : 'FFFFFF');
    const shade = hex(night ? '323956' : weather === 'rain' ? '98A2AD' : 'E3F2FA');
    const clouds = overcast ? 11 : 6;
    for (let i = 0; i < clouds; i++) {
      const cx = Math.floor((i + rnd() * 0.6) * (STRIP_W / clouds)), cy = 5 + Math.floor(rnd() * (overcast ? 16 : 12)), cw = 10 + Math.floor(rnd() * 10);
      rect(cx, cy, cw, 2, c); rect(cx + 3, cy - 2, cw - 7, 2, c); rect(cx + 1, cy + 2, cw - 2, 1, shade);
    }
    if (!night && (weather === 'sunny' || weather === 'leaves')) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) set(250 + dx, 11 + dy, hex('F6D24A'));
    }
  }

  // far hills, with trees along the ridge
  for (let x = 0; x < STRIP_W; x++) {
    const a = horizon - 6 - Math.round(4 * Math.sin((x + 5) / 9) + 3 * Math.sin(x / 4.3));
    const b = horizon - 2 - Math.round(3 * Math.sin((x + 20) / 7));
    for (let y = a; y < horizon; y++) set(x, y, hex(night ? (y < b ? G.nightHill : G.nightHill2) : y < b ? G.hill : G.hill2));
    const tree = G.tree && (night ? '1F2A26' : G.tree);
    if (tree && x % 11 === 3) { rect(x, a - 3, 3, 3, hex(tree)); set(x + 1, a - 4, hex(tree)); }
  }
  painting = false;

  // grass, with tufts and the season's flowers
  rect(0, horizon, STRIP_W, STRIP_H - horizon, hex(G.grass));
  for (let i = 0; i < (STRIP_W * (STRIP_H - horizon)) / 14; i++) {
    const x = Math.floor(rnd() * STRIP_W), y = horizon + Math.floor(rnd() * (STRIP_H - horizon));
    set(x, y, hex(rnd() < 0.5 ? G.grassD : G.grassL));
    if (rnd() < 0.3) set(x, y - 1, hex(G.grassD));
  }
  if (G.flower) for (let i = 0; i < 40; i++) set(Math.floor(rnd() * STRIP_W), horizon + 4 + Math.floor(rnd() * (STRIP_H - horizon - 4)), hex(G.flower));

  // the back fence, capped with snow in winter
  const f = GROUND.fence;
  rect(0, f + 2, STRIP_W, 2, hex(WOOD.wood)); rect(0, f + 4, STRIP_W, 1, hex(WOOD.woodD));
  rect(0, f + 7, STRIP_W, 2, hex(WOOD.wood)); rect(0, f + 9, STRIP_W, 1, hex(WOOD.woodD));
  for (let x = 2; x < STRIP_W; x += 8) {
    rect(x, f, 3, 12, hex(WOOD.wood)); set(x, f, hex(WOOD.woodL)); set(x + 1, f - 1, hex(WOOD.woodL)); rect(x + 2, f + 1, 1, 11, hex(WOOD.woodD));
    if (season === 'winter') { rect(x, f - 1, 3, 1, hex('FFFFFF')); set(x + 1, f - 2, hex('FFFFFF')); }
  }
  if (season === 'winter') { rect(0, f + 1, STRIP_W, 1, hex('FFFFFF')); rect(0, f + 6, STRIP_W, 1, hex('FFFFFF')); }

  // the path, the whole way along
  const { pathY, pathH } = GROUND;
  rect(0, pathY, STRIP_W, pathH, hex(G.path));
  rect(0, pathY, STRIP_W, 1, hex(G.pathD));
  for (let i = 0; i < STRIP_W / 3; i++) set(Math.floor(rnd() * STRIP_W), pathY + 1 + Math.floor(rnd() * (pathH - 1)), hex(rnd() < 0.5 ? G.pathD : G.pathL));

  // bed frames: soil in a wooden border, one per plot spot
  for (const s of PLOT_SPOTS) {
    const x = s.x - BED.w / 2, y = s.y - 3;
    rect(x, y, BED.w, BED.h, hex(WOOD.soil));
    for (let i = 0; i < BED.w; i += 3) set(x + i, y + 1 + (i % 2), hex(WOOD.soilL));
    rect(x - 1, y + BED.h, BED.w + 2, 2, hex(WOOD.wood)); rect(x - 1, y + BED.h + 2, BED.w + 2, 1, hex(WOOD.woodD));
    if (season === 'winter') rect(x - 1, y + BED.h, BED.w + 2, 1, hex('FFFFFF'));
  }
  return { g, sky };
}

/** A small moon in `phase` (0 new, 0.5 full), or a fixed crescent without one. */
function moon(g: PixelGrid, cx: number, cy: number, phase: number | null): void {
  const lit = hex('F4E3B5'), dark = hex('3A4468'), r = 4;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 1) continue;
    let on: boolean;
    if (phase === null) on = (dx + 2) ** 2 + (dy + 1) ** 2 > 8;
    else {
      const nx = dx / r, ny = dy / r;
      const t = Math.cos(2 * Math.PI * phase) * Math.sqrt(Math.max(0, 1 - ny * ny));
      on = phase < 0.5 ? nx >= t : nx <= -t;
    }
    if (on || phase !== null) g.px[cy + dy]![cx + dx] = on ? lit : dark;
  }
}

// ---------------------------------------------------------------- overlays

/** The signpost on a locked bed. */
export function drawSignpost(): PixelGrid {
  const g = blank(9, 13);
  const c = (s: string) => hex(s);
  for (let y = 4; y < 13; y++) g.px[y]![4] = c(WOOD.woodD);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) g.px[y]![x] = c(y === 4 || x === 0 || x === 8 || y === 0 ? WOOD.woodD : WOOD.woodL);
  for (let x = 2; x < 7; x++) g.px[2]![x] = c(WOOD.woodD);
  return g;
}

/**
 * A free spot: a dashed outline with a "+", `w`×`h` like the building it
 * stands in for. Dimmed when the kind isn't unlocked yet.
 */
export function drawSpot(w: number, h: number, dim = false): PixelGrid {
  const g = blank(w, h);
  const c = hex('F3F7E6', dim ? 110 : 235);
  for (let i = 0; i < w; i++) if (i % 3 < 2) { g.px[0]![i] = c; g.px[h - 1]![i] = c; }
  for (let i = 0; i < h; i++) if (i % 3 < 2) { g.px[i]![0] = c; g.px[i]![w - 1] = c; }
  const mx = Math.floor(w / 2), my = Math.floor(h / 2);
  for (let d = -2; d <= 2; d++) { if (my + d > 0 && my + d < h - 1) g.px[my + d]![mx] = c; if (mx + d > 0 && mx + d < w - 1) g.px[my]![mx + d] = c; }
  return g;
}

/** A firefly, two frames: glowing and dimmer. */
export function drawFirefly(frame: 0 | 1): PixelGrid {
  const g = blank(2, 1);
  g.px[0]![0] = hex(frame ? 'C9D86A' : 'FFF27A');
  g.px[0]![1] = hex(frame ? '8FA84A' : 'C9F062');
  return g;
}
