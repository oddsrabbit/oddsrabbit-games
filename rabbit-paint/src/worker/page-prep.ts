// A player's picture → a coloring page, in the browser. The same steps as
// tools/prep-page.ts (tools/lib/regions.ts), with three differences for
// pictures nobody curated:
//
// - Ink is found against the local paper colour, not one cutoff: a phone photo
//   of a printed page is grey in one corner and white in another.
// - The options scale with the picture. The defaults are tuned for 2100 px
//   pages; a 1000 px picture needs areas a quarter the size, and the player
//   picks how big a gap in the lines to close.
// - A colour picture (a logo, a cartoon, a photo) has no lines to keep: its
//   dark parts would come out as solid black and two light colours side by
//   side as one area. It gets the `outline` style instead: the picture is
//   grouped into a few colours and a line drawn wherever two of them meet.
//   A photo has no flat colours, so that alone gives hundreds of specks along
//   every shade: the areas are found on a small, softened copy and the small
//   ones merged into their closest-coloured neighbour, down to a set number.

import { dilate, DEFAULTS, prepare, type PrepOptions } from '../../tools/lib/regions';
import { inkSvg } from '../../tools/lib/trace';
import { THUMB, type Gaps, type PrepReply, type PrepStyle } from './messages';

const REF_SIDE = 2100;

export function scaledOptions(w: number, h: number, gaps: Gaps): Partial<PrepOptions> {
  const s = Math.max(w, h) / REF_SIDE;
  const gapFactor = gaps === 0 ? 0.5 : gaps === 2 ? 2 : 1;
  return {
    closeRadius: Math.max(gaps === 0 ? 1 : 2, Math.round(DEFAULTS.closeRadius * s * gapFactor)),
    minArea: Math.max(50, Math.round(DEFAULTS.minArea * s * s)),
    maxStrokePx: Math.max(200, Math.round(DEFAULTS.maxStrokePx * s * s)),
  };
}

/**
 * Ink → 0, paper → 255. A pixel is ink when it's clearly dark, or clearly
 * darker than the paper around it (mean of a window a fortieth of the picture
 * across). Clean digital line art comes out the same as a plain cutoff.
 */
export function inkMask(grey: Uint8Array, w: number, h: number): { grey: Uint8Array; inkShare: number } {
  const r = Math.max(8, Math.round(Math.max(w, h) / 40));
  // Summed-area table, (w+1)×(h+1). The largest sum is 1600²·255, under 2³².
  const W = w + 1;
  const sat = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grey[y * w + x];
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const g = grey[y * w + x];
      const isInk = g < 90 || (g < mean - 28 && g < 215);
      out[y * w + x] = isInk ? 0 : 255;
      if (isInk) ink++;
    }
  }
  return { grey: out, inkShare: ink / (w * h) };
}

/** Per gaps setting, fine detail first: colour groups, and the most areas an outlined page keeps. */
const OUTLINE_COLOURS = [8, 6, 5] as const;
const OUTLINE_MAX_AREAS = [100, 60, 30] as const;
/** Long side of the copy outlined areas are found on: big enough for a logo's dots, small enough to lose a photo's grain. */
const OUTLINE_WORK_SIDE = 500;
/** Smallest outlined area to start with, as a share of the picture; raised until the count fits. */
const OUTLINE_MIN_SHARE = 0.0006;
/** Darker than this is a dark part of a colour picture. */
const DARK = 70;
/** `outline` when this share is clearly coloured, or this share is solid dark. */
const COLOUR_SHARE = 0.08;
const SOLID_DARK_SHARE = 0.04;

export function greyOf(rgb: Uint8Array): Uint8Array {
  const grey = new Uint8Array(rgb.length / 3);
  for (let p = 0; p < grey.length; p++) grey[p] = Math.round(0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2]);
  return grey;
}

const erode = (m: Uint8Array, w: number, h: number, r: number) => {
  const inv = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) inv[p] = m[p] ? 0 : 1;
  const grown = dilate(inv, w, h, r);
  for (let p = 0; p < m.length; p++) grown[p] = grown[p] ? 0 : 1;
  return grown;
};

/**
 * The dark parts, split by thickness: `solid` survives an opening a 160th of
 * the picture across (a black background, a tyre); the rest is strokes.
 */
export function darkParts(grey: Uint8Array, w: number, h: number) {
  const n = w * h;
  const dark = new Uint8Array(n);
  for (let p = 0; p < n; p++) dark[p] = grey[p] < DARK ? 1 : 0;
  const t = Math.max(2, Math.round(Math.max(w, h) / 160));
  const solid = dilate(erode(dark, w, h, t), w, h, t);
  let solidCount = 0;
  for (let p = 0; p < n; p++) { solid[p] &= dark[p]; solidCount += solid[p]; }
  return { dark, solid, solidShare: solidCount / n };
}

/** Line art and photos of printed pages: `lines`. Colour, or big dark areas: `outline`. */
export function pickStyle(rgb: Uint8Array, solidShare: number): PrepStyle {
  const n = rgb.length / 3;
  let coloured = 0;
  for (let p = 0; p < n; p++) {
    const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) coloured++;
  }
  return coloured / n > COLOUR_SHARE || solidShare > SOLID_DARK_SHARE ? 'outline' : 'lines';
}

/** A box blur of each of `channels` interleaved channels. */
function boxBlur(src: Uint8Array, w: number, h: number, r: number, channels: number): Uint8Array {
  const out = new Uint8Array(src.length);
  const row = new Float32Array(w * h);
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      let count = 0;
      for (let x = -r; x < w; x++) {
        const add = x + r;
        const drop = x - r - 1;
        if (add < w) { sum += src[(y * w + add) * channels + c]; count++; }
        if (drop >= 0) { sum -= src[(y * w + drop) * channels + c]; count--; }
        if (x >= 0) row[y * w + x] = sum / count;
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let y = -r; y < h; y++) {
        const add = y + r;
        const drop = y - r - 1;
        if (add < h) { sum += row[add * w + x]; count++; }
        if (drop >= 0) { sum -= row[drop * w + x]; count--; }
        if (y >= 0) out[(y * w + x) * channels + c] = Math.round(sum / count);
      }
    }
  }
  return out;
}

/** The picture averaged down to `sw`×`sh`. */
function shrink(rgb: Uint8Array, w: number, h: number, sw: number, sh: number): Uint8Array {
  const out = new Uint8Array(sw * sh * 3);
  for (let sy = 0; sy < sh; sy++) {
    const y0 = Math.floor((sy * h) / sh);
    const y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * h) / sh));
    for (let sx = 0; sx < sw; sx++) {
      const x0 = Math.floor((sx * w) / sw);
      const x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * w) / sw));
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * w + x) * 3; r += rgb[p]; g += rgb[p + 1]; b += rgb[p + 2]; }
      const k = (x1 - x0) * (y1 - y0);
      const q = (sy * sw + sx) * 3;
      out[q] = r / k;
      out[q + 1] = g / k;
      out[q + 2] = b / k;
    }
  }
  return out;
}

/**
 * Each pixel's colour group, k-means on a sample. Seeded by farthest points
 * from the first pixel, so the same picture always splits the same way; stops
 * early when the picture has fewer colours than k.
 */
export function colourGroups(rgb: Uint8Array, n: number, k: number): { groups: Uint8Array; count: number } {
  const step = Math.max(1, Math.floor(n / 40_000));
  const sample: number[] = [];
  for (let p = 0; p < n; p += step) sample.push(p);
  // Weighted RGB: green counts most, as the eye does.
  const dist = (p: number, c: number[]) => {
    const r = rgb[p * 3] - c[0], g = rgb[p * 3 + 1] - c[1], b = rgb[p * 3 + 2] - c[2];
    return 2 * r * r + 4 * g * g + 3 * b * b;
  };
  const at = (p: number) => [rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]];
  const centres = [at(sample[0])];
  const best = new Float64Array(sample.length).fill(Infinity);
  while (centres.length < k) {
    let far = 0;
    let farDist = -1;
    for (let i = 0; i < sample.length; i++) {
      best[i] = Math.min(best[i], dist(sample[i], centres[centres.length - 1]));
      if (best[i] > farDist) { farDist = best[i]; far = sample[i]; }
    }
    if (farDist < 300) break;
    centres.push(at(far));
  }
  const nearest = (p: number) => {
    let bi = 0;
    let bd = Infinity;
    for (let c = 0; c < centres.length; c++) { const d = dist(p, centres[c]); if (d < bd) { bd = d; bi = c; } }
    return bi;
  };
  for (let it = 0; it < 10; it++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (const p of sample) { const a = acc[nearest(p)]; a[0] += rgb[p * 3]; a[1] += rgb[p * 3 + 1]; a[2] += rgb[p * 3 + 2]; a[3]++; }
    acc.forEach((a, c) => { if (a[3]) centres[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const groups = new Uint8Array(n);
  for (let p = 0; p < n; p++) groups[p] = nearest(p);
  return { groups, count: centres.length };
}

/** 4-connected areas of one value: an id per pixel. */
function areas(values: Uint8Array | Int32Array, w: number, n: number): { ids: Int32Array; count: number } {
  const ids = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (ids[s] >= 0) continue;
    let sp = 0;
    stack[sp++] = s;
    ids[s] = count;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      if (x > 0 && ids[p - 1] < 0 && values[p - 1] === values[p]) { ids[p - 1] = count; stack[sp++] = p - 1; }
      if (x < w - 1 && ids[p + 1] < 0 && values[p + 1] === values[p]) { ids[p + 1] = count; stack[sp++] = p + 1; }
      if (p >= w && ids[p - w] < 0 && values[p - w] === values[p]) { ids[p - w] = count; stack[sp++] = p - w; }
      if (p + w < n && ids[p + w] < 0 && values[p + w] === values[p]) { ids[p + w] = count; stack[sp++] = p + w; }
    }
    count++;
  }
  return { ids, count };
}

/**
 * Merges each area under the minimum into the neighbour closest to it in
 * colour, pass by pass; once none is under it and there are still more than
 * `maxAreas`, raises the minimum and goes again.
 */
export function simplifyAreas(rgb: Uint8Array, groups: Uint8Array, w: number, h: number, maxAreas: number): { ids: Int32Array; count: number } {
  const n = w * h;
  let { ids, count } = areas(groups, w, n);
  let minArea = Math.max(4, Math.round(n * OUTLINE_MIN_SHARE));
  for (let pass = 0; pass < 80; pass++) {
    const size = new Float64Array(count);
    const sum = new Float64Array(count * 3);
    for (let p = 0; p < n; p++) {
      const a = ids[p];
      size[a]++;
      sum[a * 3] += rgb[p * 3];
      sum[a * 3 + 1] += rgb[p * 3 + 1];
      sum[a * 3 + 2] += rgb[p * 3 + 2];
    }
    const dist = (a: number, b: number) => {
      const dr = sum[a * 3] / size[a] - sum[b * 3] / size[b];
      const dg = sum[a * 3 + 1] / size[a] - sum[b * 3 + 1] / size[b];
      const db = sum[a * 3 + 2] / size[a] - sum[b * 3 + 2] / size[b];
      return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    };
    const into = new Int32Array(count).fill(-1);
    const intoDist = new Float64Array(count).fill(Infinity);
    const consider = (a: number, b: number) => {
      if (a === b || size[a] >= minArea) return;
      const d = dist(a, b);
      if (d < intoDist[a]) { intoDist[a] = d; into[a] = b; }
    };
    for (let p = 0; p < n; p++) {
      if (p % w < w - 1) { consider(ids[p], ids[p + 1]); consider(ids[p + 1], ids[p]); }
      if (p + w < n) { consider(ids[p], ids[p + w]); consider(ids[p + w], ids[p]); }
    }
    // Union-find, so two small areas pointing at each other end up one.
    const parent = new Int32Array(count);
    for (let a = 0; a < count; a++) parent[a] = a;
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    let merged = 0;
    for (let a = 0; a < count; a++) {
      if (into[a] < 0) continue;
      const ra = find(a);
      const rb = find(into[a]);
      if (ra !== rb) { parent[ra] = rb; merged++; }
    }
    if (merged) {
      for (let p = 0; p < n; p++) ids[p] = find(ids[p]);
      ({ ids, count } = areas(ids, w, n));
    } else if (count > maxAreas) {
      minArea = Math.round(minArea * 1.4) + 1;
    } else {
      break;
    }
  }
  return { ids, count };
}

/** An area under this many work pixels across on average is a sliver, not a shape. */
const THIN = 3.5;
/** Smoothing passes over each border, in work pixels: irons out the copy's steps. */
const BORDER_SMOOTH = 8;
/** Line width, as a share of the picture's long side. */
const LINE_SHARE = 1 / 400;

/**
 * Hands each sliver's pixels to the areas around it, growing them in step, so
 * they meet down its middle. A cartoon's black outline, the soft edge round a
 * shape, a shadow: each is one border then, where its two sides would be two
 * lines close together.
 */
function dissolveSlivers(ids: Int32Array, count: number, w: number): Int32Array {
  const n = ids.length;
  const size = new Float64Array(count);
  const perimeter = new Float64Array(count);
  for (let p = 0; p < n; p++) {
    const a = ids[p];
    size[a]++;
    if (p % w < w - 1 && ids[p + 1] !== a) { perimeter[a]++; perimeter[ids[p + 1]]++; }
    if (p + w < n && ids[p + w] !== a) { perimeter[a]++; perimeter[ids[p + w]]++; }
  }
  const out = new Int32Array(ids);
  let queue: number[] = [];
  for (let p = 0; p < n; p++) {
    const a = ids[p];
    if (perimeter[a] && (2 * size[a]) / perimeter[a] < THIN) out[p] = -1;
  }
  for (let p = 0; p < n; p++) {
    if (out[p] < 0) continue;
    const x = p % w;
    if ((x > 0 && out[p - 1] < 0) || (x < w - 1 && out[p + 1] < 0) || (p >= w && out[p - w] < 0) || (p + w < n && out[p + w] < 0)) queue.push(p);
  }
  while (queue.length) {
    const next: number[] = [];
    for (const p of queue) {
      const x = p % w;
      const grow = (q: number) => { if (out[q] < 0) { out[q] = out[p]; next.push(q); } };
      if (x > 0) grow(p - 1);
      if (x < w - 1) grow(p + 1);
      if (p >= w) grow(p - w);
      if (p + w < n) grow(p + w);
    }
    queue = next;
  }
  // A picture that is all slivers keeps them.
  for (let p = 0; p < n; p++) if (out[p] < 0) out[p] = ids[p];
  return out;
}

/**
 * The borders between areas as lines of corner points, in work pixels: each
 * runs from a meeting point of three or more areas (or the picture's edge)
 * to the next, or round in a loop. Every border once, shared by both sides.
 */
function borders(ids: Int32Array, w: number, h: number): [number, number][][] {
  const W = w + 1;
  // Edges between corners: down[c] from corner c to the one below, right[c] to the one right of it.
  const down = new Uint8Array(W * (h + 1));
  const right = new Uint8Array(W * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (ids[y * w + x - 1] !== ids[y * w + x]) down[y * W + x] = 1;
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (ids[(y - 1) * w + x] !== ids[y * w + x]) right[y * W + x] = 1;
  const steps = (c: number): number[] => {
    const out: number[] = [];
    if (c >= W && down[c - W]) out.push(c - W);
    if (down[c]) out.push(c + W);
    if (c % W > 0 && right[c - 1]) out.push(c - 1);
    if (right[c]) out.push(c + 1);
    return out;
  };
  const used = (a: number, b: number) => {
    const lo = Math.min(a, b);
    return Math.abs(a - b) === 1 ? right[lo] === 2 : down[lo] === 2;
  };
  const use = (a: number, b: number) => {
    const lo = Math.min(a, b);
    if (Math.abs(a - b) === 1) right[lo] = 2; else down[lo] = 2;
  };
  const point = (c: number): [number, number] => [c % W, Math.floor(c / W)];
  const junction = (c: number) => steps(c).length !== 2;
  const walk = (from: number, to: number) => {
    const line = [point(from)];
    let prev = from;
    let at = to;
    use(from, to);
    for (;;) {
      line.push(point(at));
      if (at === from || junction(at)) break;
      const next = steps(at).find((c) => c !== prev && !used(at, c));
      if (next === undefined) break;
      use(at, next);
      prev = at;
      at = next;
    }
    return line;
  };
  const lines: [number, number][][] = [];
  const corners = W * (h + 1);
  for (let c = 0; c < corners; c++) {
    if (!junction(c)) continue;
    for (const to of steps(c)) if (!used(c, to)) lines.push(walk(c, to));
  }
  for (let c = 0; c < corners; c++) for (const to of steps(c)) if (!used(c, to)) lines.push(walk(c, to));
  return lines;
}

/**
 * Smooths a border: corners become the midpoints between them, then each
 * point is averaged with its neighbours. The ends stay put so borders still
 * meet; a loop has none.
 */
function smoothBorder(line: [number, number][]): [number, number][] {
  const loop = line.length > 2 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
  let pts: [number, number][] = [];
  if (!loop) pts.push(line[0]);
  for (let i = 0; i + 1 < line.length; i++) pts.push([(line[i][0] + line[i + 1][0]) / 2, (line[i][1] + line[i + 1][1]) / 2]);
  if (!loop) pts.push(line[line.length - 1]);
  const n = pts.length;
  for (let k = 0; k < BORDER_SMOOTH; k++) {
    pts = pts.map((p, i) => {
      if (!loop && (i === 0 || i === n - 1)) return p;
      const a = pts[(i + n - 1) % n];
      const b = pts[(i + 1) % n];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  if (loop) pts.push(pts[0]);
  return pts;
}

/** Inks every pixel within `r` of the segment a–b. */
function stamp(ink: Uint8Array, w: number, h: number, ax: number, ay: number, bx: number, by: number, r: number) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const ex = px - t * dx;
      const ey = py - t * dy;
      if (ex * ex + ey * ey <= r2) ink[y * w + x] = 1;
    }
  }
}

/**
 * A colour picture → ink 0, paper 255: one even line wherever two of its
 * simplified areas meet. A photo's specks are merged away first and slivers
 * dissolved; solid dark areas become paper with a line round them, so they
 * can be colored.
 */
export function outlineMask(rgb: Uint8Array, w: number, h: number, gaps: Gaps): Uint8Array {
  const n = w * h;
  const side = Math.max(w, h);
  // Find the areas on a small, softened copy: a photo's grain and fine texture go.
  const k = Math.min(1, OUTLINE_WORK_SIDE / side);
  const sw = Math.max(1, Math.round(w * k));
  const sh = Math.max(1, Math.round(h * k));
  const small = boxBlur(boxBlur(shrink(rgb, w, h, sw, sh), sw, sh, 1, 3), sw, sh, 1, 3);
  const { groups } = colourGroups(small, sw * sh, OUTLINE_COLOURS[gaps]);
  const { ids, count } = simplifyAreas(small, groups, sw, sh, OUTLINE_MAX_AREAS[gaps]);
  // Drawn back at full size as smooth lines, so the copy's pixels don't show.
  const ink = new Uint8Array(n);
  const r = Math.max(1, (side * LINE_SHARE) / 2);
  const sx = w / sw;
  const sy = h / sh;
  for (const line of borders(dissolveSlivers(ids, count, sw), sw, sh)) {
    const pts = smoothBorder(line);
    for (let i = 0; i + 1 < pts.length; i++) stamp(ink, w, h, pts[i][0] * sx, pts[i][1] * sy, pts[i + 1][0] * sx, pts[i + 1][1] * sy, r);
  }
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p++) out[p] = ink[p] ? 0 : 255;
  return out;
}

export function prepPicture(rgb: Uint8Array, w: number, h: number, gaps: Gaps, style: PrepStyle | null = null): PrepReply {
  const grey = greyOf(rgb);
  let mask: Uint8Array;
  let inkShare: number;
  let options: Partial<PrepOptions>;
  const used = style ?? pickStyle(rgb, darkParts(grey, w, h).solidShare);
  if (used === 'outline') {
    mask = outlineMask(rgb, w, h, gaps);
    let ink = 0;
    for (let p = 0; p < mask.length; p++) if (!mask[p]) ink++;
    inkShare = ink / mask.length;
    // The lines go all the way round each area, so there are no gaps to close:
    // the gaps setting picks how many colours and areas instead.
    options = scaledOptions(w, h, 0);
  } else {
    const masked = inkMask(grey, w, h);
    mask = masked.grey;
    inkShare = masked.inkShare;
    options = scaledOptions(w, h, gaps);
  }
  const res = prepare(mask, w, h, options);
  if (res.regions.length > 65534) throw new Error('too many areas');
  const n = w * h;
  const ids = new Uint16Array(n);
  for (let p = 0; p < n; p++) ids[p] = res.owner[p] + 1;

  // Thumbnails as tools/prep-page.ts makes them: nearest-neighbour ids (an
  // average would invent regions) and thickened, box-averaged ink.
  const k = THUMB / Math.max(w, h);
  const thumbW = Math.max(1, Math.round(w * k));
  const thumbH = Math.max(1, Math.round(h * k));
  const thumbIds = new Uint16Array(thumbW * thumbH);
  const thumbInk = new Uint8Array(thumbW * thumbH);
  const bold = dilate(res.ink, w, h, Math.max(1, Math.round(1 / k / 2)));
  for (let ty = 0; ty < thumbH; ty++) {
    const sy0 = Math.floor(ty / k);
    const sy1 = Math.min(h, Math.max(sy0 + 1, Math.floor((ty + 1) / k)));
    for (let tx = 0; tx < thumbW; tx++) {
      const sx0 = Math.floor(tx / k);
      const sx1 = Math.min(w, Math.max(sx0 + 1, Math.floor((tx + 1) / k)));
      const cx = Math.min(w - 1, Math.floor((tx + 0.5) / k));
      const cy = Math.min(h - 1, Math.floor((ty + 0.5) / k));
      thumbIds[ty * thumbW + tx] = ids[cy * w + cx];
      let sum = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) sum += bold[y * w + x];
      thumbInk[ty * thumbW + tx] = Math.round((255 * sum) / ((sx1 - sx0) * (sy1 - sy0)));
    }
  }
  return { ok: true, w, h, regions: res.regions, ids, ink: res.ink, lineSvg: inkSvg(res.ink, w, h), thumbW, thumbH, thumbIds, thumbInk, inkShare, style: used };
}
