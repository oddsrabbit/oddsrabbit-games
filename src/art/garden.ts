// The garden's background (docs/rabbit-pets-garden.md): sky, hills, the back
// fence, grass and the path, across the whole strip. At
// night the sky and hills get night colours here, and the renderer darkens
// everything else by multiplying `drawGardenShade`'s tint over it: the shade
// is clear over the sky and hills, so they don't darken twice. Falling rain,
// snow and leaves are the renderer's. Plots, buildings and decor are drawn
// over it from their own sprites. The veg patch and the yard, the first two
// areas, are seen from above instead (3/4, like Stardew Valley): a treeline and fence along the
// top, grass filling the view, and the fields drawn over it as sprites, tilled
// once bought and a dashed outline before (drawField, drawSpot). Only the meadow is
// still side-on.

import { AREA_W, FIELD, GROUND, PLOT_SPOTS, STRIP_H, STRIP_W } from '../garden';
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
    moon(g, 2 * AREA_W + 30, 12, phase); // over the meadow: the patch's and yard's trees would hide it
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

  topDown(season, set, rect, lcg(season.length * 17 + 5));
  return { g, sky };
}

/**
 * The treeline along the veg patch's top, tree by tree: canopy, its shadow,
 * and a highlight (blossom, in spring). A season's kinds take turns, so
 * autumn is orange, gold and a few still green, not one band of orange.
 */
const TREES: Record<Season, { c: string; d: string; l: string }[]> = {
  spring: [{ c: '5FA947', d: '3F7F2E', l: 'F3A6B3' }, { c: '6DB84A', d: '4E8C3A', l: 'A6D877' }],
  summer: [{ c: '4E9A38', d: '2F6A26', l: '6DB84A' }, { c: '3F8A30', d: '2A5E22', l: '5FA947' }],
  autumn: [{ c: 'C4602E', d: '8E4424', l: 'E0873F' }, { c: 'D9A93A', d: 'A67A2A', l: 'F0CC5A' }, { c: '5E8A3A', d: '3F6A2A', l: '7DA84A' }, { c: 'B8452E', d: '862F22', l: 'D9772E' }],
  winter: [{ c: 'B7C4D1', d: '8FA3B8', l: 'FFFFFF' }],
};
/** Tree `i` along the line, its kind picked so neighbours differ. */
const treeAt = (season: Season, i: number) => { const t = TREES[season]; return t[(i * 3 + (i >> 1)) % t.length]!; };

/**
 * The veg patch and the yard, seen from above, over the side-on strip's first
 * two areas: sky down to a treeline, the fence, then grass all the way down,
 * the path across (at the strip's height, so it meets the meadow's), and in
 * the patch, paths up between the columns of fields and a barrel. A tall tree
 * and a hedge at the yard's right edge hide the seam with the meadow's
 * side-on hills. These pixels aren't sky, so night darkens them.
 */
function topDown(season: Season, set: (x: number, y: number, c: RGBA) => void, rect: (x: number, y: number, w: number, h: number, c: RGBA) => void, rnd: () => number): void {
  const G = GROUNDS[season], T = TREES[season][0]!;
  const W = 2 * AREA_W;
  // grass from just under the treeline, with tufts and flowers
  rect(0, 12, W, STRIP_H - 12, hex(G.grass));
  for (let i = 0; i < W * (STRIP_H - 20) * 0.09; i++) {
    const x = Math.floor(rnd() * W), y = 21 + Math.floor(rnd() * (STRIP_H - 21));
    set(x, y, hex(rnd() < 0.55 ? G.grassD : G.grassL));
    if (rnd() < 0.35) set(x, y - 1, hex(G.grassD));
  }
  if (G.flower) for (let i = 0; i < 32; i++) set(Math.floor(rnd() * W), 28 + Math.floor(rnd() * (STRIP_H - 30)), hex(G.flower));
  // the treeline, seen from the front: a bumpy canopy with a shadow under it
  // each tree a rounded crown, 8 px apart and overlapping; at each x the tallest crown there shows
  const crown = (i: number, x: number) => {
    const cx = i * 8 + 4 + ((i * 5) % 3) - 1, r = 5.5 + ((i * 7) % 3) * 0.5;
    const d = (x + 0.5 - cx) / r;
    return Math.abs(d) > 1 ? Infinity : 3 + ((i * 11) % 4) + Math.round(d * d * 5);
  };
  for (let x = 0; x < W; x++) {
    const i0 = Math.floor(x / 8);
    let best = i0, top = Infinity;
    for (const i of [i0 - 1, i0, i0 + 1]) { const t = crown(i, x); if (t < top) { top = t; best = i; } }
    if (top === Infinity) top = 8;
    const t = treeAt(season, best);
    for (let y = top; y < 20; y++) set(x, y, hex(y > 16 ? t.d : t.c));
    set(x, top, hex(t.l));
    if ((x * 7) % 5 === 0 && top + 3 < 16) set(x, top + 2 + (x % 3), hex(t.l));
    // a darker line where one crown meets the next, so they read as separate trees
    if (crown(best, x + 1) !== Infinity && x + 1 < W) {
      let nb = best, nt = Infinity;
      for (const i of [i0 - 1, i0, i0 + 1, i0 + 2]) { const tt = crown(i, x + 1); if (tt < nt) { nt = tt; nb = i; } }
      if (nb !== best) for (let y = Math.max(top, nt) + 1; y < 17; y++) set(x, y, hex(t.d));
    }
  }
  // the fence in front of it: posts and two rails, capped with snow in winter
  rect(0, 21, W, 1, hex(WOOD.wood)); rect(0, 24, W, 1, hex(WOOD.wood)); rect(0, 25, W, 1, hex(WOOD.woodD));
  for (let x = 3; x < W; x += 10) {
    rect(x, 19, 2, 8, hex(WOOD.wood)); set(x, 19, hex(WOOD.woodL)); rect(x + 1, 20, 1, 7, hex(WOOD.woodD));
    if (season === 'winter') rect(x, 18, 2, 1, hex('FFFFFF'));
  }
  if (season === 'winter') rect(0, 20, W, 1, hex('FFFFFF'));
  // paths up between the columns of fields, from above the top row to below the bottom one
  const { pathY, pathH } = GROUND;
  const top = PLOT_SPOTS[0]!.y - FIELD.h - 2, bottom = PLOT_SPOTS[3]!.y + 2;
  for (const px of [(PLOT_SPOTS[0]!.x + PLOT_SPOTS[1]!.x) / 2, (PLOT_SPOTS[1]!.x + PLOT_SPOTS[2]!.x) / 2]) {
    const x = Math.round(px) - 1;
    rect(x, top, 3, bottom - top, hex(G.path));
    rect(x, top, 1, bottom - top, hex(G.pathD));
  }
  // the path across, as in the other areas
  rect(0, pathY, W, pathH, hex(G.path));
  rect(0, pathY, W, 1, hex(G.pathD));
  rect(0, pathY + pathH - 1, W, 1, hex(G.pathD));
  for (let i = 0; i < W / 3; i++) set(Math.floor(rnd() * W), pathY + 1 + Math.floor(rnd() * (pathH - 2)), hex(rnd() < 0.5 ? G.pathD : G.pathL));
  // a barrel by the fence, top right
  const barrel = ['.kkkkk.', 'kTnTnTk', 'kkkkkkk', 'kTnTnTk', 'kTnTnTk', 'kkkkkkk', '.kTnTk.'];
  const bc: Record<string, string> = { k: '3B2922', T: 'B38F63', n: '8A5A3C' };
  barrel.forEach((row, y) => [...row].forEach((ch, x) => { if (bc[ch]) set(AREA_W - 22 + x, 34 + y, hex(bc[ch]!)); }));
  if (season === 'winter') rect(AREA_W - 21, 33, 5, 1, hex('FFFFFF'));
  // the seam with the meadow: a tall tree over it, and a hedge down to the ground with a gap for the path (and its gate)
  for (let dy = -9; dy <= 9; dy++) for (let dx = -8; dx <= 8; dx++) {
    if (dx * dx + dy * dy * 1.3 > 72) continue;
    set(W - 1 + dx, 11 + dy, hex(dy > 5 ? T.d : (dx + dy) % 5 === 0 ? T.l : T.c));
  }
  const leaf = season === 'winter' ? ['C9D5E0', 'E8EEF3'] : ['3F7F2E', '4E9A38'];
  for (let y = 19; y < STRIP_H; y++) {
    if (y >= pathY - 2 && y < pathY + pathH + 2) continue;
    rect(W - 3 - ((y * 7) % 3 === 0 ? 1 : 0), y, 6, 1, hex(leaf[(y >> 1) % 2]!));
  }
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

const SOIL = { soil: '6B4128', soilD: '553220', soilL: '8A5A3C' };
/** Little plants, seen from the front, one per spot on a furrow. */
const PLANTS: Record<string, string[]> = {
  seed: ['.k.'],
  sprout: ['g.g', '.G.'],
  leafy: ['.g.g.', 'gglgg', '.GGG.'],
  berry: ['.g.g.', 'grlrg', 'rRGrR', '.GGG.'],
  golden: ['.g.g.', '.glg.', '.yGy.', '..o..'],
  sprout3: ['gg.gg', 'glGlg', '.gGg.', '..G..'],
};
const PLANT_PAL = { g: '6DB84A', G: '3F7A2E', l: 'A6D877', r: 'E4566F', R: 'B03550', o: 'F08A3C', y: 'F6D24A', k: '3B2922' };

/**
 * A bought field, `FIELD.w`×`FIELD.h`, seen from above: soil in three
 * furrows inside a wooden edge whose front face shows, and a row of plants on
 * each furrow. `crop` null: just the tilled soil. `stage` as extras.ts stage:
 * 0 seeds, 1 sprouts, 2 leaves, 3 ready.
 */
export function drawField(season: Season, crop: 'berry' | 'golden' | 'sprout' | null, stage: 0 | 1 | 2 | 3): PixelGrid {
  const { w, h } = FIELD;
  const g = blank(w, h);
  const rect = (x: number, y: number, rw: number, rh: number, c: RGBA) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) if (yy >= 0 && yy < h && xx >= 0 && xx < w) g.px[yy]![xx] = c;
  };
  rect(0, 0, w, h, hex(WOOD.woodD));
  rect(0, 0, w, 1, hex(WOOD.woodL));
  rect(1, 1, w - 2, h - 4, hex(SOIL.soil));
  rect(0, h - 3, w, 2, hex(WOOD.wood)); // the edge's front face
  for (let r = 0; r < 3; r++) {
    const fy = 3 + r * 5;
    rect(2, fy, w - 4, 1, hex(SOIL.soilL));
    rect(2, fy + 2, w - 4, 1, hex(SOIL.soilD));
  }
  if (season === 'winter') { rect(0, 0, w, 1, hex('FFFFFF')); for (let i = 0; i < w; i += 3) rect(i, h - 3, 1, 1, hex('FFFFFF')); }
  if (!crop) return g;
  const plant = rows(PLANTS[stage === 0 ? 'seed' : stage === 1 ? 'sprout' : stage === 2 ? 'leafy' : crop === 'sprout' ? 'sprout3' : crop]!, PLANT_PAL);
  // a plant on each furrow's ridge, four to a row: a field of them, not one plant
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x0 = 4 + c * 6 - Math.floor(plant.w / 2), y0 = 5 + r * 5 - plant.h;
    for (let y = 0; y < plant.h; y++) for (let x = 0; x < plant.w; x++) {
      const p = plant.px[y]![x]!;
      if (p[3] && y0 + y >= 0) g.px[y0 + y]![x0 + x] = p;
    }
  }
  return g;
}

/**
 * A clover patch in the yard, seen from above: a little square of soil thick
 * with clover, its front edge showing. 11×7, like the spot it's built in.
 */
export function drawCloverPatch(season: Season): PixelGrid {
  const lines = [
    '.GgGgGgGgG.',
    'GgLgGgLgGgG',
    'gGgGLgGgGLg',
    'GgLgGgGLgGG',
    'gGgGgLgGgGg',
    'nnnnnnnnnnn',
    'NnNnNnNnNnN',
  ];
  const g = rows(lines, { g: '6DB84A', G: '3F7A2E', L: 'A6D877', n: '8A5A3C', N: '5E3B26' });
  if (season === 'winter') for (const x of [1, 4, 7, 9]) g.px[0]![x] = hex('FFFFFF');
  return g;
}

/** A small padlock, 5x6: for a bed or a spot that isn't open yet. */
export function drawPadlock(): PixelGrid {
  return rows(['.kkk.', '.k.k.', 'kkkkk', 'kmMmk', 'kmkmk', 'kkkkk'], { k: '4A3A30', m: 'D8DCE3', M: 'F4F6F9' });
}

/** A clover leaf, 5x5, for a price tag. */
const CLOVER_MARK = ['gg.gg', 'gGgGg', '.GkG.', 'gGgGg', 'gg.gg'];

/** The signpost by the meadow's gate: a plain board on a post. */
export function drawSignpost(): PixelGrid {
  const c = (s: string) => hex(s);
  const g = blank(9, 13);
  for (let y = 4; y < 13; y++) g.px[y]![4] = c(WOOD.woodD);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) g.px[y]![x] = c(y === 4 || x === 0 || x === 8 || y === 0 ? WOOD.woodD : WOOD.woodL);
  for (let x = 2; x < 7; x++) g.px[2]![x] = c(WOOD.woodD);
  return g;
}

/**
 * A seed packet, 9x11, floated over an empty field so it reads as "plant
 * something here": a paper packet, its top folded over, a strawberry on the front.
 */
export function drawSeedPacket(): PixelGrid {
  return rows([
    'kkkkkkkkk',
    'kfFfFfFfk',
    'kkkkkkkkk',
    'kpppgpppk',
    'kppgGgppk',
    'kpprrrppk',
    'kprrwrrpk',
    'kprrrrrpk',
    'kpprrrppk',
    'kppprpppk',
    'kkkkkkkkk',
  ], { k: '3B2922', p: 'F7ECD2', f: 'D9B98A', F: 'C49E6C', g: '6DB84A', G: '3F7A2E', r: 'E4566F', w: 'FFF2B0' });
}

function rows(lines: string[], pal: Record<string, string>): PixelGrid {
  const g = blank(lines[0]!.length, lines.length);
  lines.forEach((l, y) => [...l].forEach((ch, x) => { if (pal[ch]) g.px[y]![x] = hex(pal[ch]!); }));
  return g;
}

/**
 * A free spot: a dashed outline with a "+", `w`×`h` like the building it
 * stands in for. Locked (the kind isn't unlocked yet): fainter, with a padlock
 * where the "+" would be, so it doesn't read as "tap to build". On snow the
 * outline is dark, or it disappears.
 */
export function drawSpot(w: number, h: number, dim = false, winter = false): PixelGrid {
  const g = blank(w, h);
  const c = hex(winter ? '6F8496' : 'F3F7E6', dim ? 120 : 235);
  const dash = dim ? 2 : 3; // locked: sparser dashes
  for (let i = 0; i < w; i++) if (i % dash === 0 || (!dim && i % 3 < 2)) { g.px[0]![i] = c; g.px[h - 1]![i] = c; }
  for (let i = 0; i < h; i++) if (i % dash === 0 || (!dim && i % 3 < 2)) { g.px[i]![0] = c; g.px[i]![w - 1] = c; }
  const mx = Math.floor(w / 2), my = Math.floor(h / 2);
  if (dim) {
    const lock = drawPadlock();
    const lx = mx - 2, ly = Math.max(0, my - 3);
    for (let y = 0; y < lock.h && ly + y < h; y++) for (let x = 0; x < lock.w; x++) { const p = lock.px[y]![x]!; if (p[3]) g.px[ly + y]![lx + x] = [p[0], p[1], p[2], 200]; }
    return g;
  }
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

/** A 3x5 pixel font for the field timers: digits, and h and m (m is 5 wide). */
const TIMER_FONT: Record<string, string[]> = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
  h: ['#..', '#..', '###', '#.#', '#.#'], m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#'],
};

/**
 * A little paper tag on a field, 9 rows high: a
 * growing field's countdown (garden.ts timerLabel), or a field for sale's
 * price after a clover. `lit` (you can afford it): warmer paper in a green
 * edge, so it reads as ready to tap.
 */
export function drawTag(label: string, clover = false, lit = false): PixelGrid {
  const glyphs = [...label].map((ch) => TIMER_FONT[ch]).filter((g): g is string[] => !!g);
  if (clover) glyphs.unshift(CLOVER_MARK);
  const tw = glyphs.reduce((n, g) => n + g[0]!.length, 0) + Math.max(0, glyphs.length - 1);
  const w = tw + 4, h = 9;
  const g = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1;
    // rounded: the corners left clear
    if (edge && (x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    g.px[y]![x] = hex(edge ? (lit ? '3F7A2E' : WOOD.woodD) : lit ? 'FFF2B0' : 'F2DDB4');
  }
  const cloverPal: Record<string, string> = { g: '5FA947', G: '3F7A2E', k: '2E5A22' };
  let x0 = 2;
  for (const glyph of glyphs) {
    const pal = glyph === CLOVER_MARK ? cloverPal : { '#': '3B2922' };
    glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) g.px[2 + y]![x0 + x] = hex(pal[ch]!); }));
    x0 += glyph[0]!.length + 1;
  }
  return g;
}
