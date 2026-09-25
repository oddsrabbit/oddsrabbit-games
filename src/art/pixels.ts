// Tiny pixel buffers. Art is built as RGBA arrays at 1x and turned into
// canvases once at startup; the renderer only ever draws those canvases with
// smoothing off, at whole-number scales.

export type RGBA = readonly [number, number, number, number];
export const CLEAR: RGBA = [0, 0, 0, 0];

export function hex(s: string, a = 255): RGBA {
  const h = s.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}

export interface PixelGrid {
  w: number;
  h: number;
  px: RGBA[][];
}

export function blank(w: number, h: number, fill: RGBA = CLEAR): PixelGrid {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => fill)) };
}

export function same(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** A drawable, with its size in art pixels. */
export interface Sprite {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}

export function toSprite(g: PixelGrid): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = g.w;
  canvas.height = g.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(g.w, g.h);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const p = g.px[y]![x]!;
        const i = (y * g.w + x) * 4;
        img.data[i] = p[0];
        img.data[i + 1] = p[1];
        img.data[i + 2] = p[2];
        img.data[i + 3] = p[3];
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return { w: g.w, h: g.h, canvas };
}

/** 1-pixel outline around every opaque pixel, 4-connected. */
export function outline(g: PixelGrid, color: RGBA): PixelGrid {
  const out = g.px.map((row) => row.slice());
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.px[y]![x]![3] > 0;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!opaque(x, y) && (opaque(x + 1, y) || opaque(x - 1, y) || opaque(x, y + 1) || opaque(x, y - 1))) {
        out[y]![x] = color;
      }
    }
  }
  return { w: g.w, h: g.h, px: out };
}

/** Parse a character grid ('.' = clear) with a palette. */
export function fromRows(rows: string[], palette: Record<string, string>): PixelGrid {
  const w = Math.max(...rows.map((r) => r.length));
  return {
    w,
    h: rows.length,
    px: rows.map((r) => Array.from(r.padEnd(w, '.'), (ch) => (ch === '.' ? CLEAR : hex(palette[ch] ?? 'FF00FF')))),
  };
}

/** Deterministic PRNG for procedural textures. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
