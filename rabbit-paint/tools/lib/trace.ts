// Turns an ink mask into smooth vector outlines, so the lines stay crisp at
// any zoom instead of showing their pixels.
//
// 1. walk the edges between ink and paper pixels into closed loops, ink on
//    the right (outer edges run clockwise, holes the other way: nonzero fill)
// 2. take each edge's midpoint and smooth the loop lightly, which irons out
//    the pixel stairs
// 3. drop points within SIMPLIFY px of a straight run (Douglas-Peucker)
// 4. join what's left with quadratic curves through the segment midpoints:
//    a gentle bend blends right through, a sharp corner (over SHARP) is
//    rounded off over at most ROUND px

const SIMPLIFY = 0.9;
const ROUND = 6;
const SMOOTH_PASSES = 3;
const SHARP = Math.cos((50 * Math.PI) / 180);

type Pt = [number, number];

/** `ink` 1 = ink. Returns an SVG path `d` in pixel units, for fill-rule nonzero. */
export function traceInk(ink: Uint8Array, w: number, h: number): string {
  const W = w + 1;
  const isInk = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x] === 1;
  // Directed edges by start corner, two slots each (a corner where two ink
  // pixels touch diagonally starts two). An edge is its end corner.
  const out = new Int32Array(W * (h + 1) * 2).fill(-1);
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const s = (y0 * W + x0) * 2;
    out[out[s] === -1 ? s : s + 1] = y1 * W + x1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x] !== 1) continue;
      if (!isInk(x, y - 1)) add(x, y, x + 1, y);
      if (!isInk(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!isInk(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!isInk(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  let d = '';
  for (let s = 0; s < out.length; s++) {
    if (out[s] === -1) continue;
    const start = s >> 1;
    const corners: number[] = [];
    let at = start;
    let dx = 0;
    let dy = 0;
    let slot = s;
    for (;;) {
      const to = out[slot];
      out[slot] = -1;
      corners.push(at);
      const ndx = (to % W) - (at % W);
      const ndy = Math.floor(to / W) - Math.floor(at / W);
      dx = ndx;
      dy = ndy;
      at = to;
      if (at === start) {
        const a = start * 2;
        if (out[a] === -1 && out[a + 1] === -1) break;
      }
      // Where two ink pixels touch at a corner, turn left: round the corner
      // onto the next pixel, so a diagonal stroke stays one shape.
      const a = at * 2;
      const b = a + 1;
      if (out[a] !== -1 && out[b] !== -1) {
        const leftX = dy;
        const leftY = -dx;
        const ea = out[a];
        slot = (ea % W) - (at % W) === leftX && Math.floor(ea / W) - Math.floor(at / W) === leftY ? a : b;
      } else if (out[a] !== -1) slot = a;
      else if (out[b] !== -1) slot = b;
      else break;
    }
    d += loopPath(midpoints(corners, W));
  }
  return d;
}

function midpoints(corners: number[], W: number): Pt[] {
  const n = corners.length;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    pts.push([((a % W) + (b % W)) / 2, (Math.floor(a / W) + Math.floor(b / W)) / 2]);
  }
  return pts;
}

function loopPath(raw: Pt[]): string {
  let pts = raw;
  for (let k = 0; k < SMOOTH_PASSES; k++) {
    const n = pts.length;
    pts = pts.map((p, i) => {
      const a = pts[(i + n - 1) % n];
      const b = pts[(i + 1) % n];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  pts = simplifyLoop(pts);
  // A dot, a tiny hole or a few pixels in a row would shrink to nothing:
  // they keep their pixel outline.
  if (pts.length < 3 || Math.abs(area(pts)) < 0.7 * Math.abs(area(raw))) pts = raw;
  const n = pts.length;
  // Each corner p runs from a point on the way in to a point on the way out,
  // with p as the control point; straight lines join them.
  const near = (p: Pt, q: Pt, sharp: boolean): Pt => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const t = sharp && len > 2 * ROUND ? ROUND / len : 0.5;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  const f = (v: number) => (Math.round(v * 10) / 10).toString();
  const pair = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i + n - 1) % n];
    const next = pts[(i + 1) % n];
    const ux = p[0] - prev[0];
    const uy = p[1] - prev[1];
    const vx = next[0] - p[0];
    const vy = next[1] - p[1];
    const sharp = ux * vx + uy * vy < SHARP * Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = near(p, prev, sharp);
    const b = near(p, next, sharp);
    d += i === 0 ? `M${pair(a)}` : `L${pair(a)}`;
    d += `Q${pair(p)} ${pair(b)}`;
  }
  return d + 'Z';
}

function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
}

/** Douglas-Peucker on a closed loop, split at its two furthest-apart points. */
function simplifyLoop(pts: Pt[]): Pt[] {
  const n = pts.length;
  if (n <= 4) return pts;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const dd = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (dd > best) { best = dd; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i];
    const b = pts[j % n];
    const lx = b[0] - a[0];
    const ly = b[1] - a[1];
    const len = Math.hypot(lx, ly);
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const dist = len ? Math.abs(lx * (a[1] - p[1]) - ly * (a[0] - p[0])) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (dist > worst) { worst = dist; at = k; }
    }
    if (worst > SIMPLIFY) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A standalone SVG of the outlines, black, the page's size. */
export function inkSvg(ink: Uint8Array, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${traceInk(ink, w, h)}"/></svg>`;
}
