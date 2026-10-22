// Her portrait for the home-screen widget, drawn by the game so the widget
// never has to know how.
//
// The widget is native code inside the OddsRabbit app: it can't run
// drawRabbit, and it can't learn a new hat without an app release. So the
// showcase carries her, already drawn, in the four faces the widget shows,
// and the widget only scales pixels up. Coat, ears, outfit and any
// future art all reach the home screen for free.
//
// Encoding, per face: row-major over the w×h grid, one token per run of
// identical pixels. A token is an optional decimal run length (omitted = 1)
// followed by one code: '.' for a clear pixel, or a letter A–Z a–z indexing
// `palette` (so at most 52 colours). Every face must decode to exactly w×h
// pixels. The app (src/widgets/rabbitPets/sprites.ts) and the server
// (RabbitPetsWidgetBuilder::sprites) both read it; change all three together.
//
// Worst case over every look is 19 colours and about 2 KB for the four faces,
// well inside the showcase's 8 KB cap.

import { drawRabbit, RABBIT_H, RABBIT_W, type Dress } from './art/rabbit';
import type { PixelGrid } from './art/pixels';
import type { Coat } from './sim';

/** What the widget draws: `content` and `happy` awake, `grumpy`, and `asleep` for naps and holidays. */
export const WIDGET_FACES = ['content', 'happy', 'grumpy', 'asleep'] as const;
export type WidgetFace = (typeof WIDGET_FACES)[number];

export interface WidgetSprites {
  w: number;
  h: number;
  /** 'RRGGBB', opaque. */
  palette: string[];
  faces: Record<WidgetFace, string>;
}

const CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const MAX_PALETTE = CODES.length;

const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

/** Encode same-sized grids over one shared palette. Null if they need more than 52 colours. */
export function encodeSprites<K extends string>(grids: Record<K, PixelGrid>): { w: number; h: number; palette: string[]; faces: Record<K, string> } | null {
  const keys = Object.keys(grids) as K[];
  const first = grids[keys[0]!];
  const palette: string[] = [];
  const index = new Map<string, number>();
  const faces = {} as Record<K, string>;
  for (const key of keys) {
    const g = grids[key];
    if (g.w !== first.w || g.h !== first.h) return null;
    let out = '';
    let prev = '';
    let run = 0;
    const flush = () => { if (run) out += (run > 1 ? String(run) : '') + prev; };
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const p = g.px[y]![x]!;
        let code = '.';
        // The art is fully opaque or fully clear; treat anything half-drawn by which it's nearer.
        if (p[3] >= 128) {
          const hex = toHex(p[0]) + toHex(p[1]) + toHex(p[2]);
          let i = index.get(hex);
          if (i === undefined) {
            if (palette.length === MAX_PALETTE) return null;
            i = palette.length;
            palette.push(hex);
            index.set(hex, i);
          }
          code = CODES[i]!;
        }
        if (code === prev) run++;
        else { flush(); prev = code; run = 1; }
      }
    }
    flush();
    faces[key] = out;
  }
  return { w: first.w, h: first.h, palette, faces };
}

/** Indexes into `palette` per pixel, -1 for clear; null if malformed. For tests and tooling. */
export function decodeFace(code: string, w: number, h: number, paletteSize: number): number[] | null {
  const out: number[] = [];
  const re = /(\d*)([A-Za-z.])/y;
  let at = 0;
  while (at < code.length) {
    re.lastIndex = at;
    const m = re.exec(code);
    if (!m) return null;
    at = re.lastIndex;
    const run = m[1] ? Number(m[1]) : 1;
    const i = m[2] === '.' ? -1 : CODES.indexOf(m[2]!);
    if (run < 1 || i >= paletteSize || out.length + run > w * h) return null;
    for (let k = 0; k < run; k++) out.push(i);
  }
  return out.length === w * h ? out : null;
}

// Rebuilt only when her look changes: buildShowcase runs on every needs tick.
let cached: { key: string; sprites: WidgetSprites | null } | null = null;

/** Her four widget faces in her coat and dress, facing right, at rest. */
export function widgetSprites(coat: Coat, dress: Dress): WidgetSprites | null {
  const key = `${coat}|${dress.head ?? ''}|${dress.neck ?? ''}|${dress.ears ?? ''}`;
  if (cached?.key === key) return cached.sprites;
  const grids = {} as Record<WidgetFace, PixelGrid>;
  for (const face of WIDGET_FACES) grids[face] = drawRabbit(coat, face, 0, dress);
  const encoded = encodeSprites(grids);
  const sprites = encoded && encoded.w === RABBIT_W && encoded.h === RABBIT_H ? encoded : null;
  cached = { key, sprites };
  return sprites;
}
