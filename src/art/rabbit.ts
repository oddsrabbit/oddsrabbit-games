// The rabbit, drawn from shapes rather than hand-placed pixels: a head
// ellipse, a body ellipse, two capsule ears and two feet are rasterised onto a
// 40x40 grid, then outlined, shaded, and given a face per mood. Coats are
// palettes over the same pixels, so every mood exists in every coat for free.
// Ears are chosen at adoption: short, long (the original) or lop, which hang
// down the sides of her face.
//
// She keeps the Kit proportions for life (big head, big eyes, short ears),
// drawn about 1.35x the original kit's size so she reads at 4x on a phone.

import type { Coat, Ears } from '../sim';
import { blank, hex, type PixelGrid, type RGBA } from './pixels';

export const RABBIT_W = 40;
export const RABBIT_H = 40;
/** Row her feet stand on, for placing her in the scene. */
export const RABBIT_GROUND = 38;

const PALETTES: Record<Coat, { base: string; shade: string; light: string; line: string; ring?: string }> = {
  snow: { base: 'F3EFE8', shade: 'D6CDC1', light: 'FFFFFF', line: '5A4746' },
  cream: { base: 'F0D6AE', shade: 'D6B485', light: 'FAEAD0', line: '6A4834' },
  cocoa: { base: '9C6C4E', shade: '7B5038', light: 'D1AE8E', line: '3D281E', ring: 'C49A7A' },
  silver: { base: 'A9ABB6', shade: '868997', light: 'DADBE1', line: '3B3D48' },
  midnight: { base: '48444F', shade: '36333D', light: '8D8898', line: '1C1A21', ring: '8D8898' },
  ginger: { base: 'E2945C', shade: 'C17341', light: 'F6CDA5', line: '69381D' },
};
const SHARED = { pink: 'F3A6B3', pinkd: 'DE8697', eye: '2A2130', glint: 'FFFFFF', nose: 'E4768D', blush: 'F8B4BF' };

// Kit proportions at 1.35x.
const K = 1.35;
const SHAPE = { head: [7.2 * K, 6.4 * K], body: [6.2 * K, 5.0 * K] } as const;
/** Lop ears hang from `spread` of the head's width, `out` and `drop` along their length. */
const EAR_SHAPES: Record<Ears, { len: number; w: number; lop?: { spread: number; out: number; drop: number } }> = {
  short: { len: 5.3 * K, w: 1.9 * K },
  long: { len: 7.0 * K, w: 1.9 * K },
  lop: { len: 5.2 * K, w: 2.0 * K, lop: { spread: 0.86, out: 0.3, drop: 0.9 } },
};
const EYE_W = 3;
const EYE_H = 4;

export type Face = 'content' | 'happy' | 'eating' | 'grumpy' | 'asleep';
/** 0 = rest, 1 = breathe (body squashes a pixel), 2 = blink. */
export type Frame = 0 | 1 | 2;

type Region = 'body' | 'ear' | 'inner' | 'head' | 'foot' | null;

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function inCapsule(x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  const px = ax + t * dx, py = ay + t * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= r * r;
}

/** What she's wearing, the marking she earned, and her ears. Ids from extras.ts. Ears default to short. */
export interface Dress { head?: string | null; neck?: string | null; marking?: string | null; ears?: Ears | null }

export function dressKey(d: Dress | undefined): string {
  return d ? `${d.head ?? ''}/${d.neck ?? ''}/${d.marking ?? ''}/${d.ears ?? ''}` : '///';
}

export function drawRabbit(coat: Coat, face: Face, frame: Frame = 0, dress?: Dress): PixelGrid {
  const W = RABBIT_W, H = RABBIT_H, GROUND = RABBIT_GROUND;
  const c = PALETTES[coat];
  const pal = {
    base: hex(c.base), shade: hex(c.shade), light: hex(c.light), line: hex(c.line),
    ring: c.ring ? hex(c.ring) : null,
    pink: hex(SHARED.pink), pinkd: hex(SHARED.pinkd), eye: hex(SHARED.eye),
    glint: hex(SHARED.glint), nose: hex(SHARED.nose), blush: hex(SHARED.blush),
  };
  const asleep = face === 'asleep';
  const earShape = EAR_SHAPES[dress?.ears ?? 'short'];
  // asleep, lop ears droop back like any others
  const lop = asleep ? undefined : earShape.lop;
  const cx = 19.5;
  let [bw, bh] = SHAPE.body as unknown as [number, number];
  if (asleep) { bw *= 1.2; bh *= 0.72; }
  const bodyCy = GROUND - bh;
  const [hw, hh] = SHAPE.head as unknown as [number, number];
  const bob = frame === 1 ? 1 : 0;
  const headCy = asleep ? bodyCy - bh * 0.35 + bob * 0.5 : bodyCy - bh * 0.85 - hh * 0.55 + bob;

  const L = earShape.len, ew = earShape.w;
  const splay = asleep ? 1.25 : face === 'grumpy' ? 0.55 : 0.3;
  const ears: [number, number, number, number][] = [];
  for (const side of [-1, 1]) {
    let ax = cx + side * hw * 0.42, ay = headCy - hh * 0.55, bx: number, by: number;
    if (asleep) {
      ax = cx + side * hw * 0.45; ay = headCy - hh * 0.75;
      bx = ax + side * L * 0.72; by = ay + L * 0.5;
    } else if (lop) {
      // hanging down the sides of her face, drawn over the head
      ax = cx + side * hw * lop.spread; ay = headCy - hh * 0.7;
      bx = ax + side * L * lop.out; by = ay + L * lop.drop;
    } else {
      const ang = side * splay;
      bx = ax + Math.sin(ang) * L; by = ay - Math.cos(ang) * L;
    }
    ears.push([ax, ay, bx, by]);
  }

  const region: Region[][] = Array.from({ length: H }, () => Array<Region>(W).fill(null));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = x + 0.5, Y = y + 0.5;
      let r: Region = null;
      if (inEllipse(X, Y, cx, bodyCy + bob * 0.5, bw, bh - bob * 0.5)) r = 'body';
      for (const [ax, ay, bx, by] of ears) if (inCapsule(X, Y, ax, ay, bx, by, ew)) r = 'ear';
      if (inEllipse(X, Y, cx, headCy, hw, hh)) r = 'head';
      for (const side of [-1, 1]) if (inEllipse(X, Y, cx + side * bw * 0.45, GROUND - 1.2, bw * 0.32, 1.9)) r = 'foot';
      if (lop) for (const [ax, ay, bx, by] of ears) if (inCapsule(X, Y, ax, ay, bx, by, ew)) r = 'ear';
      region[y]![x] = r;
    }
  }
  // a lop's ears hang with the pink side against her head, so none shows
  if (!lop) for (const [ax, ay, bx, by] of ears) {
    const mx = ax + (bx - ax) * 0.15, my = ay + (by - ay) * 0.15;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (region[y]![x] === 'ear' && inCapsule(x + 0.5, y + 0.5, mx, my, bx, by, ew * 0.45)) region[y]![x] = 'inner';
    }
  }

  const g = blank(W, H);
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && region[y]![x] !== null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = region[y]![x];
      if (!r) continue;
      let col: RGBA = r === 'inner' ? pal.pink : pal.base;
      if (r === 'body' && inEllipse(x + 0.5, y + 0.5, cx, bodyCy + bh * 0.25, bw * 0.55, bh * 0.62)) col = pal.light;
      if (r === 'head' && inEllipse(x + 0.5, y + 0.5, cx, headCy + hh * 0.45, hw * 0.42, hh * 0.32)) col = pal.light;
      if (r !== 'inner' && (!filled(x + 1, y) || !filled(x, y + 1)) && x > cx) col = pal.shade;
      if (r === 'body' && y > 0 && region[y - 1]![x] === 'head') col = pal.shade;
      if (r === 'foot' && !filled(x, y + 1)) col = pal.shade;
      if (r === 'inner' && (!filled(x + 1, y) || region[y]![x + 1] !== 'inner') && x > cx) col = pal.pinkd;
      g.px[y]![x] = col;
    }
  }
  // outline, then edges where an ear lies over the body, and the feet line
  const out = g.px.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (region[y]![x] === null && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) out[y]![x] = pal.line;
    if (region[y]![x] === 'body' || (lop && region[y]![x] === 'head')) {
      const nearEar = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const r = filled(x + dx!, y + dy!) ? region[y + dy!]![x + dx!] : null;
        return r === 'ear' || r === 'inner';
      });
      if (nearEar) out[y]![x] = pal.line;
    }
    if (region[y]![x] === 'foot' && y > 0 && region[y - 1]![x] === 'body') out[y - 1]![x] = pal.line;
  }
  g.px = out;

  // face
  const put = (x: number, y: number, col: RGBA) => { if (x >= 0 && y >= 0 && x < W && y < H) g.px[y]![x] = col; };
  const ey = Math.round(headCy - 0.2);
  const gap = 3.3 * (hw / 8.6) * 1.05;
  const exs = [Math.round(cx - gap - 0.5) - (EYE_W - 2), Math.round(cx + gap - 0.5)];
  const blink = frame === 2;
  exs.forEach((ex, i) => {
    if (asleep || blink) {
      for (let d = -1; d <= EYE_W - 1; d++) put(ex + d, ey + 1, pal.eye);
    } else if (face === 'happy') {
      put(ex - 1, ey + 1, pal.eye); put(ex, ey, pal.eye); put(ex + 1, ey, pal.eye); put(ex + 2, ey + 1, pal.eye);
    } else if (face === 'grumpy') {
      for (let d = -1; d <= EYE_W - 1; d++) put(ex + d, ey, pal.line);
      for (let d = 0; d < EYE_W; d++) put(ex + d, ey + 1, pal.eye);
    } else {
      if (pal.ring) {
        for (let dy = -2; dy < EYE_H; dy++) { put(ex - 1, ey + dy, pal.ring); put(ex + EYE_W, ey + dy, pal.ring); }
        for (let dx = 0; dx < EYE_W; dx++) put(ex + dx, ey - 2, pal.ring);
      }
      for (let dy = 0; dy < EYE_H; dy++) for (let dx = 0; dx < EYE_W; dx++) put(ex + dx, ey - 1 + dy, pal.eye);
      put(ex, ey - 1, pal.glint);
      put(ex + 1, ey, pal.glint);
      put(ex + EYE_W - 1, ey + EYE_H - 3, pal.glint);
    }
    const cheek = ex + (i === 0 ? -1 : EYE_W);
    if (face === 'happy' || face === 'content' || face === 'eating') {
      put(cheek, ey + 2, pal.blush);
      if (face === 'happy') put(cheek, ey + 3, pal.blush);
    }
  });
  const nx = Math.floor(cx - 0.5), ny = ey + 2;
  put(nx, ny, pal.nose); put(nx + 1, ny, pal.nose);
  if (face === 'eating') {
    put(nx, ny + 1, pal.line); put(nx + 1, ny + 1, pal.line);
    put(nx, ny + 2, pal.pinkd); put(nx + 1, ny + 2, pal.pinkd);
  } else if (face === 'grumpy') {
    put(nx - 1, ny + 2, pal.line); put(nx, ny + 1, pal.line); put(nx + 1, ny + 1, pal.line); put(nx + 2, ny + 2, pal.line);
  } else if (!asleep) {
    put(nx - 1, ny + 1, pal.line); put(nx + 2, ny + 1, pal.line);
  }
  if (dress) {
    const top = Math.round(headCy - hh);
    const chin = Math.round(headCy + hh);
    drawMarking(g, dress.marking, { cx, ey, exs, top, chin, asleep, pal });
    drawOutfit(g, dress.neck, { cx, top, chin, hw, asleep, pal });
    drawOutfit(g, dress.head, { cx, top, chin, hw, asleep, pal });
  }
  return g;
}

// ---------------------------------------------------------------- dress-up

const DRESS_C: Record<string, string> = {
  k: '3B2922', r: 'E4566F', R: 'B03550', y: 'F6D24A', Y: 'D5A12A', w: 'FFFFFF', p: 'F3A6B3',
  g: '86C95E', G: '4E8C3A', b: '8FC3E8', B: '4677AC', v: '6E55A8', V: '4A3878', o: 'F08A3C', n: 'A0785A',
};

/** Paint a character grid with its bottom-centre at (x, y). */
function stamp(g: PixelGrid, rows: string[], x: number, y: number, extra: Record<string, RGBA> = {}): void {
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.round(x - w / 2), y0 = y - rows.length + 1;
  rows.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx]!;
      if (ch === '.') continue;
      const col = extra[ch] ?? (DRESS_C[ch] ? hex(DRESS_C[ch]!) : null);
      const X = x0 + xx, Y = y0 + yy;
      if (col && X >= 0 && Y >= 0 && X < g.w && Y < g.h) g.px[Y]![X] = col;
    }
  });
}

interface Anchor { cx: number; top: number; chin: number; hw: number; asleep: boolean; pal: Record<string, RGBA | null> }

const OUTFIT_ART: Record<string, { at: 'top' | 'ear' | 'chin'; rows: string[] }> = {
  bow: { at: 'ear', rows: ['kk.kk', 'krkrk', 'krRrk', 'krkrk', 'kk.kk'] },
  beanie: { at: 'top', rows: ['......kkk......', '.....kwwwk.....', '...kkkkkkkkk...', '..kbbbbbbbbbk..', '.kbbbbbbbbbbbk.', 'kbBbBbBbBbBbBbk', 'kBBBBBBBBBBBBBk', 'kkkkkkkkkkkkkkk'] },
  flowercrown: { at: 'top', rows: ['.kpk...kyk...kpk.', 'kpypkGkyrykGkpypk', 'gkpkgGgkykgGgkpkg', '.GgGgGgGgGgGgGgG.'] },
  witchhat: { at: 'top', rows: ['.....kk......', '....kvVk.....', '....kvVk.....', '...kvvVVk....', '...kyyyyk....', '..kvvvvVVk...', 'kkkkkkkkkkkkk', 'kvvvvvvvvvVVk', '.kkkkkkkkkkk.'] },
  bandana: { at: 'chin', rows: ['kkkkkkkkkkkk', 'krrwrrrrwrrk', '.krrrwrrrrk.', '..krrrrwrk..', '...krrrRk...', '....kRRk....', '.....kk.....'] },
  bell: { at: 'chin', rows: ['krrrrrrrrrrk', 'kkkkkkkkkkkk', '.....kk.....', '....kyYk....', '....kyYk....', '.....kk.....'] },
  redscarf: { at: 'chin', rows: ['kkkkkkkkkkkkk', 'krrwrrwrrwrrk', 'kRRRRRRRRRkRk', '.kkkkkkkkkkrk', '..........krk', '..........kRk', '..........kkk'] },
};

function drawOutfit(g: PixelGrid, id: string | null | undefined, a: Anchor): void {
  const art = id ? OUTFIT_ART[id] : undefined;
  if (!art) return;
  const n = art.rows.length;
  if (art.at === 'top') stamp(g, art.rows, a.cx, a.top + Math.min(3, n - 2));
  else if (art.at === 'ear') stamp(g, art.rows, a.cx + a.hw * 0.5, a.top + 2);
  else if (!a.asleep) stamp(g, art.rows, a.cx, a.chin + n - 2);
}

function drawMarking(g: PixelGrid, id: string | null | undefined, a: { cx: number; ey: number; exs: number[]; top: number; chin: number; asleep: boolean; pal: Record<string, RGBA | null> }): void {
  const set = (x: number, y: number, c: RGBA) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y]![x] = c; };
  if (id === 'freckles') {
    // darker than a light coat, lighter than a dark one
    const b = a.pal.base!;
    const dot = b[0] + b[1] + b[2] > 480 ? hex('B0735A') : hex('E6C2A2');
    for (const [i, ex] of a.exs.entries()) {
      const x = i === 0 ? ex - 1 : ex + 2;
      set(x, a.ey + 4, dot); set(x + (i === 0 ? 2 : -2), a.ey + 4, dot); set(x + (i === 0 ? 1 : -1), a.ey + 5, dot);
    }
  } else if (id === 'heart' && !a.asleep) {
    stamp(g, ['.p.p.', 'ppppp', '.ppp.', '..p..'], a.cx, a.chin + 5, { p: hex('F08AA0') });
  } else if (id === 'tuft') {
    const base = a.pal.base!, line = a.pal.line!;
    stamp(g, ['.L.L.', 'LbLbL', 'LbbbL'], a.cx, a.top, { L: line, b: base });
  }
}
