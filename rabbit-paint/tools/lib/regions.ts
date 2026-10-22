// Turns line art into tap-to-fill regions. Pure functions over raw greyscale
// pixels so they can be tested without image files.
//
// 1. binarize            ink = darker than `inkThreshold`
// 2. dropLooseStrokes    open strokes (hatching, dashes, sparkles) that enclose
//                        nothing and are smaller than `maxStrokePx` are erased
// 3. closed walls        ink dilated by `closeRadius` so small gaps don't leak;
//                        used only to find regions, never drawn
// 4. regions             4-connected white areas between the walls; every pixel
//                        (ink included) is owned by its nearest region
// 5. merge               neighbouring regions under `minArea` cluster together;
//                        clusters still under it fold into the neighbour they
//                        share the most border with; then the curator's hints

export interface PrepOptions {
  inkThreshold: number;
  maxStrokePx: number;
  closeRadius: number;
  minArea: number;
  /** Groups of [x, y] source pixels whose regions should become one. */
  merges: Array<Array<[number, number]>>;
}

export const DEFAULTS: PrepOptions = {
  inkThreshold: 140,
  maxStrokePx: 4000,
  closeRadius: 4,
  minArea: 12000,
  merges: [],
};

export interface Region {
  id: number;
  /** Pixels owned, line pixels included. */
  area: number;
  /** Deepest point inside the region: where a paint-by-number label goes. */
  label: [number, number];
  bbox: [number, number, number, number];
}

export interface PrepResult {
  width: number;
  height: number;
  /** 1 = ink kept for display. */
  ink: Uint8Array;
  /** Region id per pixel. */
  owner: Int32Array;
  regions: Region[];
  stats: { rawRegions: number; droppedStrokes: number; tinyMerged: number };
}

function components(mask: Uint8Array, val: number, w: number, h: number, conn8: boolean) {
  const n = w * h;
  const lab = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (mask[s] !== val || lab[s] !== -1) continue;
    const id = sizes.length;
    let sp = 0;
    let count = 0;
    stack[sp++] = s;
    lab[s] = id;
    while (sp) {
      const p = stack[--sp];
      count++;
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!conn8 && dx && dy)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] === val && lab[q] === -1) {
            lab[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    sizes.push(count);
  }
  return { lab, sizes };
}

/** The 4-neighbours of p that are inside the image. */
function* neighbours4(p: number, w: number, n: number) {
  const x = p % w;
  if (x > 0) yield p - 1;
  if (x < w - 1) yield p + 1;
  if (p >= w) yield p - w;
  if (p + w < n) yield p + w;
}

function dropLooseStrokes(ink: Uint8Array, w: number, h: number, maxStrokePx: number) {
  const n = w * h;
  const strokes = components(ink, 1, w, h, true);
  const white = components(ink, 0, w, h, false);
  // For each white area: the one stroke it touches (>= 0), none (-1) or several (-2).
  const touch = new Int32Array(white.sizes.length).fill(-1);
  for (let p = 0; p < n; p++) {
    if (ink[p]) continue;
    const a = white.lab[p];
    const x = p % w;
    const y = (p / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch[a] = -2;
    for (const q of neighbours4(p, w, n)) {
      if (!ink[q]) continue;
      const c = strokes.lab[q];
      if (touch[a] === -1) touch[a] = c;
      else if (touch[a] !== c) touch[a] = -2;
    }
  }
  const encloses = new Uint8Array(strokes.sizes.length);
  for (const c of touch) if (c >= 0) encloses[c] = 1;
  const drop = strokes.sizes.map((size, c) => !encloses[c] && size < maxStrokePx);
  const kept = new Uint8Array(ink);
  for (let p = 0; p < n; p++) if (ink[p] && drop[strokes.lab[p]]) kept[p] = 0;
  return { kept, dropped: drop.filter(Boolean).length };
}

export function dilate(src: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = -r; d <= r; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < w && src[y * w + nx]) { tmp[y * w + x] = 1; break; }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = -r; d <= r; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < h && tmp[ny * w + x]) { out[y * w + x] = 1; break; }
      }
    }
  }
  return out;
}

/** Every pixel without a region takes the nearest one's (breadth-first). */
function spreadOwners(owner: Int32Array, w: number) {
  const n = owner.length;
  let frontier: number[] = [];
  for (let p = 0; p < n; p++) if (owner[p] >= 0) frontier.push(p);
  while (frontier.length) {
    const next: number[] = [];
    for (const p of frontier) {
      for (const q of neighbours4(p, w, n)) {
        if (owner[q] === -1) { owner[q] = owner[p]; next.push(q); }
      }
    }
    frontier = next;
  }
}

export function prepare(grey: Uint8Array, w: number, h: number, opts: Partial<PrepOptions> = {}): PrepResult {
  const o = { ...DEFAULTS, ...opts };
  const n = w * h;
  const raw = new Uint8Array(n);
  for (let p = 0; p < n; p++) raw[p] = grey[p] < o.inkThreshold ? 1 : 0;
  const rawRegions = components(raw, 0, w, h, false).sizes.length;

  const { kept: ink, dropped } = dropLooseStrokes(raw, w, h, o.maxStrokePx);
  const walls = dilate(ink, w, h, o.closeRadius);
  const reg = components(walls, 0, w, h, false);
  const R = reg.sizes.length;
  const owner = new Int32Array(reg.lab);
  spreadOwners(owner, w);

  const area = new Array<number>(R).fill(0);
  for (let p = 0; p < n; p++) area[owner[p]]++;
  const adj = Array.from({ length: R }, () => new Map<number, number>());
  for (let p = 0; p < n; p++) {
    const a = owner[p];
    const right = p % w < w - 1 ? p + 1 : -1;
    const down = p + w < n ? p + w : -1;
    for (const q of [right, down]) {
      if (q < 0) continue;
      const b = owner[q];
      if (a === b) continue;
      adj[a].set(b, (adj[a].get(b) ?? 0) + 1);
      adj[b].set(a, (adj[b].get(a) ?? 0) + 1);
    }
  }

  const parent = Array.from({ length: R }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const tiny = (i: number) => area[i] < o.minArea;
  for (let a = 0; a < R; a++) {
    if (!tiny(a)) continue;
    for (const b of adj[a].keys()) if (tiny(b)) parent[find(a)] = find(b);
  }
  const clusterArea = new Map<number, number>();
  for (let i = 0; i < R; i++) clusterArea.set(find(i), (clusterArea.get(find(i)) ?? 0) + area[i]);
  // A small cluster can fold into another small one, so repeat until stable.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [c, size] of [...clusterArea]) {
      if (size >= o.minArea || find(c) !== c) continue;
      const border = new Map<number, number>();
      for (let j = 0; j < R; j++) {
        if (find(j) !== c) continue;
        for (const [k, len] of adj[j]) {
          const kc = find(k);
          if (kc !== c) border.set(kc, (border.get(kc) ?? 0) + len);
        }
      }
      let best = -1;
      let bestLen = -1;
      for (const [k, len] of border) if (len > bestLen) { best = k; bestLen = len; }
      if (best < 0) continue;
      parent[c] = best;
      clusterArea.set(best, clusterArea.get(best)! + size);
      clusterArea.delete(c);
      changed = true;
    }
  }
  for (const group of o.merges) {
    const roots = group.map(([x, y]) => find(owner[Math.round(y) * w + Math.round(x)]));
    for (const r of roots.slice(1)) if (find(r) !== find(roots[0])) parent[find(r)] = find(roots[0]);
  }

  // Renumber 0..k-1 in reading order of first pixel.
  const ids = new Map<number, number>();
  for (let p = 0; p < n; p++) {
    const root = find(owner[p]);
    if (!ids.has(root)) ids.set(root, ids.size);
    owner[p] = ids.get(root)!;
  }
  const regions = labelPoints(owner, ids.size, w, h);
  return { width: w, height: h, ink, owner, regions, stats: { rawRegions, droppedStrokes: dropped, tinyMerged: area.filter((a) => a < o.minArea).length } };
}

/** Area, bbox and the deepest interior point of each region (chamfer distance). */
function labelPoints(owner: Int32Array, count: number, w: number, h: number): Region[] {
  const n = w * h;
  const dist = new Float32Array(n);
  const INF = 1e9;
  for (let p = 0; p < n; p++) {
    const x = p % w;
    const y = (p / w) | 0;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      || owner[p - 1] !== owner[p] || owner[p + 1] !== owner[p] || owner[p - w] !== owner[p] || owner[p + w] !== owner[p];
    dist[p] = edge ? 0 : INF;
  }
  const D = 1, DD = Math.SQRT2;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    dist[p] = Math.min(dist[p], dist[p - 1] + D, dist[p - w] + D, dist[p - w - 1] + DD, dist[p - w + 1] + DD);
  }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const p = y * w + x;
    dist[p] = Math.min(dist[p], dist[p + 1] + D, dist[p + w] + D, dist[p + w + 1] + DD, dist[p + w - 1] + DD);
  }
  const regions: Region[] = Array.from({ length: count }, (_, id) => ({ id, area: 0, label: [0, 0], bbox: [w, h, 0, 0] }));
  const best = new Float32Array(count).fill(-1);
  for (let p = 0; p < n; p++) {
    const r = regions[owner[p]];
    const x = p % w;
    const y = (p / w) | 0;
    r.area++;
    r.bbox = [Math.min(r.bbox[0], x), Math.min(r.bbox[1], y), Math.max(r.bbox[2], x), Math.max(r.bbox[3], y)];
    if (dist[p] > best[r.id]) { best[r.id] = dist[p]; r.label = [x, y]; }
  }
  return regions;
}
