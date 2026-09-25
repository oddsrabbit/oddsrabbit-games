// The burrow: an arched dirt room with a round window and a plank floor,
// 98x118 at 1x. The night version only changes the sky; the renderer darkens
// the whole scene (room, decor and rabbit together) and adds lantern light.

import { hex, lcg, type PixelGrid, type RGBA } from './pixels';

export const SCENE_W = 98;
export const SCENE_H = 118;
export const FLOOR_Y = 92;
export const WINDOW = { x: 26, y: 30, r: 11 };

export function drawBurrow(night: boolean): PixelGrid {
  const W = SCENE_W, H = SCENE_H;
  const rnd = lcg(7);
  const soil = hex('6E4A33'), soil2 = hex('5E3E2B');
  const wall = hex('C99A6B'), wall2 = hex('B98A5C'), wall3 = hex('D8AE82'), rim = hex('9E6F47');
  const floor = hex('A8744B'), floor2 = hex('8F6140'), plank = hex('7A5236');
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
  // round window
  const sky = night ? hex('1D2748') : hex('A6DBF5');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - WINDOW.x, y + 0.5 - WINDOW.y);
    if (d <= WINDOW.r - 2) {
      px[y]![x] = sky;
      if (!night && y > WINDOW.y + 3) px[y]![x] = hex('BFE6F7');
      if (!night && y > WINDOW.y + 5 && (x - WINDOW.x) ** 2 / 60 + (y - WINDOW.y - 9) ** 2 / 6 < 1) px[y]![x] = hex('86C95E');
    } else if (d <= WINDOW.r) {
      px[y]![x] = d > WINDOW.r - 1 ? hex('7A5236') : hex('A8744B');
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
  return { w: W, h: H, px };
}

/**
 * The view through the round window: the day's sky and weather over a hill in
 * the season's colours. Drawn over the window in the room art, in scene
 * pixels (the grid covers the whole room; everything outside the glass is
 * clear). Falling rain, snow and leaves are animated by the renderer.
 */
export function drawWindowView(season: 'spring' | 'summer' | 'autumn' | 'winter', weather: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'leaves', night: boolean): PixelGrid {
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
    if (!overcast) {
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
  return { w: SCENE_W, h: SCENE_H, px };
}
