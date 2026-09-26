// The burrow: an arched dirt room with a round window and a plank floor,
// 98x118 at 1x. The night version only changes the sky; the renderer darkens
// the whole scene (room, decor and rabbit together) and adds lantern light.

import { hex, lcg, type PixelGrid, type RGBA } from './pixels';

export const SCENE_W = 98;
export const SCENE_H = 118;
export const FLOOR_Y = 92;
export const WINDOW = { x: 26, y: 30, r: 11 };

/**
 * Which wall, floor and window the room has (decor.ts SURFACES), and which
 * room it is: the nook is the burrow turned round (its window on the right),
 * the loft has beams across the ceiling (decor.ts ROOMS).
 */
export interface RoomStyle { wall: string; floor: string; window: string; variant?: 'nook' | 'loft' }

/** Where a room's window is: on the right in the nook. */
export function windowOf(style?: RoomStyle): { x: number; y: number; r: number } {
  return style?.variant === 'nook' ? { ...WINDOW, x: SCENE_W - WINDOW.x } : WINDOW;
}
export const PLAIN_ROOM: RoomStyle = { wall: 'plainwall', floor: 'plainfloor', window: 'roundwindow' };

const WALLS: Record<string, [string, string, string, string]> = {
  plainwall: ['C99A6B', 'B98A5C', 'D8AE82', '9E6F47'],
  daisywall: ['F1E3C4', 'E6D3AE', 'FFF4DA', 'C9A77B'],
  starrywall: ['2F3A66', '28325A', '3B4878', '1E2645'],
  cloverwall: ['CFE8B8', 'BFDDA5', 'DDF0CB', '8FB870'],
  sunsetwall: ['F7C58A', 'EFB277', 'FAD6A4', 'C97A5A'],
};
const FLOORS: Record<string, [string, string, string]> = {
  plainfloor: ['A8744B', '8F6140', '7A5236'],
  oakfloor: ['C8914F', 'B07D42', '8E5E30'],
  birchfloor: ['E3C9A0', 'D2B68A', 'A88A62'],
  cherryfloor: ['9C4A35', '873E2C', '5E2A1E'],
  checkerfloor: ['F4E3B5', 'C98A5A', 'A06A42'],
};

export function drawBurrow(night: boolean, style: RoomStyle = PLAIN_ROOM): PixelGrid {
  const W = SCENE_W, H = SCENE_H;
  const rnd = lcg(7);
  const soil = hex('6E4A33'), soil2 = hex('5E3E2B');
  const wc = WALLS[style.wall] ?? WALLS.plainwall!;
  const fc = FLOORS[style.floor] ?? FLOORS.plainfloor!;
  const wall = hex(wc[0]), wall2 = hex(wc[1]), wall3 = hex(wc[2]), rim = hex(wc[3]);
  const floor = hex(fc[0]), floor2 = hex(fc[1]), plank = hex(fc[2]);
  const checker = style.floor === 'checkerfloor';
  const isWall = (c: RGBA) => c === wall || c === wall2 || c === wall3 || c === rim;
  const px: RGBA[][] = Array.from({ length: H }, () => Array<RGBA>(W).fill(soil));
  const cx = W / 2, cy = 64, rx = 46, ry = 58;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // An arched ceiling, then straight walls down to the floor from the arch's
    // widest point, so no soil wedge pokes into the bottom corners.
    const inside = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 || (y >= cy && x >= 3 && x < W - 3);
    if (inside) {
      const v = rnd();
      px[y]![x] = v < 0.045 ? wall2 : v < 0.065 ? wall3 : wall;
    } else {
      px[y]![x] = rnd() < 0.18 ? soil2 : soil;
    }
    if (y >= FLOOR_Y && x >= 3 && x < W - 3) {
      const row = y - FLOOR_Y;
      if (checker) {
        px[y]![x] = (Math.floor(x / 5) + Math.floor(row / 4)) % 2 ? floor2 : floor;
        continue;
      }
      px[y]![x] = row % 6 === 0 ? plank : floor;
      if (row % 6 !== 0 && (x + Math.floor(row / 6) * 11) % 23 === 0) px[y]![x] = plank;
      if (row > 0 && rnd() < 0.05) px[y]![x] = floor2;
    }
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const above = px[y - 1]![x]!;
    if (isWall(px[y]![x]!) && px[y]![x] !== rim && (above === soil || above === soil2)) {
      px[y]![x] = rim;
      if (isWall(px[y + 1]![x]!)) px[y + 1]![x] = wall2;
    }
  }
  wallpaper(px, style.wall, (c) => c === wall || c === wall2 || c === wall3);
  // round window
  const sky = night ? hex('1D2748') : hex('A6DBF5');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - WINDOW.x, y + 0.5 - WINDOW.y);
    if (d <= WINDOW.r - 2) {
      px[y]![x] = sky;
      if (!night && y > WINDOW.y + 3) px[y]![x] = hex('BFE6F7');
      if (!night && y > WINDOW.y + 5 && (x - WINDOW.x) ** 2 / 60 + (y - WINDOW.y - 9) ** 2 / 6 < 1) px[y]![x] = hex('86C95E');
    } else if (d <= WINDOW.r) {
      const moon = style.window === 'moonwindow';
      px[y]![x] = d > WINDOW.r - 1 ? hex(moon ? 'B8862A' : '7A5236') : hex(moon ? 'F6D24A' : 'A8744B');
    }
  }
  if (style.window === 'moonwindow') {
    // four little star studs on the gold frame
    for (const [dx, dy] of [[0, -WINDOW.r - 1], [WINDOW.r + 1, 0], [0, WINDOW.r + 1], [-WINDOW.r - 1, 0]] as const) {
      const sx = WINDOW.x + dx, sy = WINDOW.y + dy;
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (px[sy + oy]?.[sx + ox]) px[sy + oy]![sx + ox] = hex(ox || oy ? 'F6D24A' : 'FFF6C8');
    }
  }
  if (night) {
    for (const [sx, sy] of [[20, 25], [30, 22], [24, 33], [33, 30], [18, 31]] as const) px[sy]![sx] = hex('FFF6C8');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy <= 8 && (dx + 1.6) ** 2 + (dy + 1) ** 2 > 5) px[26 + dy]![30 + dx] = hex('F4E3B5');
    }
  } else {
    for (let dx = -3; dx < 4; dx++) px[26]![24 + dx] = hex('FFFFFF');
    for (let dx = -2; dx < 3; dx++) px[25]![24 + dx] = hex('FFFFFF');
  }
  // hanging roots
  const rootRnd = lcg(3);
  for (const [rx0, len] of [[50, 9], [58, 6], [71, 11], [80, 5]] as const) {
    let x = rx0;
    for (let y = 9; y < 9 + len; y++) {
      if (isWall(px[y]![x]!)) px[y]![x] = plank;
      if (rootRnd() < 0.3) x += rootRnd() < 0.5 ? -1 : 1;
    }
  }
  if (style.variant === 'loft') {
    // two beams across the arch, and a post down the middle
    const beam = hex('8A5A3C'), beamDark = hex('5E3B26');
    const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 < 0.97;
    const clear = (x: number, y: number) => Math.hypot(x + 0.5 - WINDOW.x, y + 0.5 - WINDOW.y) > WINDOW.r + 1;
    for (const by of [18, 40]) for (let x = 0; x < W; x++) {
      if (inside(x, by) && clear(x, by)) { px[by]![x] = beam; px[by + 1]![x] = beam; px[by + 2]![x] = beamDark; }
    }
    for (let y = 8; y < 42; y++) if (inside(Math.round(cx), y)) { px[y]![Math.round(cx)] = beam; px[y]![Math.round(cx) + 1] = beamDark; }
  }
  if (style.variant === 'nook') for (const row of px) row.reverse();
  return { w: W, h: H, px };
}

/** A pattern over the wall's own pixels (not the rim, soil or floor). */
function wallpaper(px: RGBA[][], id: string, isPaper: (c: RGBA) => boolean): void {
  const put = (x: number, y: number, c: RGBA) => { if (px[y]?.[x] && isPaper(px[y]![x]!)) px[y]![x] = c; };
  if (id === 'daisywall') {
    const petal = hex('FFFFFF'), mid = hex('F6D24A');
    for (let y = 8; y < FLOOR_Y - 2; y += 9) for (let x = 4 + ((y / 9) % 2) * 5; x < SCENE_W - 3; x += 10) {
      put(x, y, mid); put(x - 1, y, petal); put(x + 1, y, petal); put(x, y - 1, petal); put(x, y + 1, petal);
    }
  } else if (id === 'starrywall') {
    const rnd = lcg(21), star = hex('FFF6C8'), dim = hex('8E9AC8');
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * SCENE_W), y = Math.floor(rnd() * FLOOR_Y);
      if (i % 5 === 0) { put(x, y, star); put(x - 1, y, dim); put(x + 1, y, dim); put(x, y - 1, dim); put(x, y + 1, dim); }
      else put(x, y, i % 2 ? star : dim);
    }
  } else if (id === 'cloverwall') {
    const leaf = hex('86C95E'), dark = hex('4E8C3A');
    for (let y = 7; y < FLOOR_Y - 2; y += 8) for (let x = 3 + ((y / 8) % 2) * 4; x < SCENE_W - 3; x += 8) {
      put(x, y, dark); put(x - 1, y, leaf); put(x + 1, y, leaf); put(x, y - 1, leaf); put(x, y + 1, dark);
    }
  } else if (id === 'sunsetwall') {
    const bands = ['F3A6B3', 'F5B39E', 'F7C58A', 'F9D27A', 'F6D24A'].map((c) => hex(c));
    for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < SCENE_W; x++) put(x, y, bands[Math.min(4, Math.floor(y / (FLOOR_Y / 5)))]!);
  }
}

/** The moon's phase at a time: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(ms: number): number {
  const days = (ms - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  const p = (days / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * The view through the round window: the day's sky and weather over a hill in
 * the season's colours. Drawn over the window in the room art, in scene
 * pixels (the grid covers the whole room; everything outside the glass is
 * clear). Falling rain, snow and leaves are animated by the renderer.
 */
export function drawWindowView(season: 'spring' | 'summer' | 'autumn' | 'winter', weather: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'leaves', night: boolean, phase: number | null = null, mirror = false): PixelGrid {
  const R = WINDOW.r - 2;
  const px: RGBA[][] = Array.from({ length: SCENE_H }, () => Array<RGBA>(SCENE_W).fill([0, 0, 0, 0]));
  const overcast = weather === 'cloudy' || weather === 'rain' || weather === 'snow';
  const sky = night
    ? hex(overcast ? '262C44' : '1D2748')
    : hex({ sunny: 'A6DBF5', cloudy: 'C3D0DA', rain: '9DAEBE', snow: 'D6E0EA', leaves: 'B9D6E6' }[weather]);
  const low = night ? sky : hex({ sunny: 'BFE6F7', cloudy: 'CFDAE2', rain: 'AAB9C6', snow: 'E2EAF1', leaves: 'C8E0EC' }[weather]);
  const hill = night
    ? hex(season === 'winter' ? '8C94B0' : '2E4A3A')
    : hex({ spring: '86C95E', summer: '6DB84A', autumn: 'D08A3E', winter: 'F3F6FA' }[season]);
  const dot = night ? null : hex({ spring: 'F3A6B3', summer: '4E8C3A', autumn: 'B8652E', winter: 'D6E0EA' }[season]);
  const rnd = lcg(season.length * 7 + 1);
  for (let y = WINDOW.y - R - 1; y <= WINDOW.y + R + 1; y++) for (let x = WINDOW.x - R - 1; x <= WINDOW.x + R + 1; x++) {
    if (Math.hypot(x + 0.5 - WINDOW.x, y + 0.5 - WINDOW.y) > R) continue;
    let c = y > WINDOW.y + 3 ? low : sky;
    if (y > WINDOW.y + 5 && (x - WINDOW.x) ** 2 / 60 + (y - WINDOW.y - 9) ** 2 / 6 < 1) c = dot && rnd() < 0.12 ? dot : hill;
    px[y]![x] = c;
  }
  const set = (x: number, y: number, c: RGBA) => { if (px[y]?.[x] && px[y]![x]![3]) px[y]![x] = c; };
  const cloud = (cx: number, cy: number, w: number, c: RGBA) => {
    for (let dx = -w; dx <= w; dx++) set(cx + dx, cy, c);
    for (let dx = -w + 1; dx < w; dx++) set(cx + dx, cy - 1, c);
  };
  if (night) {
    if (!overcast && phase !== null) {
      // the moon window: the real moon, in tonight's phase, and more stars
      for (const [sx, sy] of [[20, 25], [30, 22], [24, 33], [33, 30], [18, 31], [22, 21], [34, 25], [19, 28]] as const) set(sx, sy, hex('FFF6C8'));
      const r = 4, lit = hex('F4E3B5'), dark = hex('3A4468');
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const nx = dx / r, ny = dy / r;
        const t = Math.cos(2 * Math.PI * phase) * Math.sqrt(Math.max(0, 1 - ny * ny));
        const on = phase < 0.5 ? nx >= t : nx <= -t;
        set(29 + dx, 26 + dy, on ? lit : dark);
      }
    } else if (!overcast) {
      for (const [sx, sy] of [[20, 25], [30, 22], [24, 33], [33, 30], [18, 31]] as const) set(sx, sy, hex('FFF6C8'));
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 8 && (dx + 1.6) ** 2 + (dy + 1) ** 2 > 5) set(30 + dx, 26 + dy, hex('F4E3B5'));
      }
    } else {
      cloud(22, 25, 4, hex('3A4260'));
      cloud(30, 29, 3, hex('3A4260'));
    }
  } else if (weather === 'sunny' || weather === 'leaves') {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) set(31 + dx, 25 + dy, hex('F6D24A'));
    cloud(22, 27, 3, hex('FFFFFF'));
  } else {
    const c = hex(weather === 'rain' ? 'A7B0BA' : weather === 'snow' ? 'F2F5F8' : 'E9EEF2');
    cloud(22, 25, 5, c);
    cloud(30, 28, 4, c);
    cloud(26, 22, 3, c);
  }
  // the nook's window is on the right: the same view, turned round with the room
  if (mirror) for (const row of px) row.reverse();
  return { w: SCENE_W, h: SCENE_H, px };
}
