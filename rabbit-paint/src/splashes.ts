// The pale paint splashes behind home: blobs down both edges, each with a drop
// or two, laid out for the screen's size so a long page never repeats. Seeded
// (by the day), so they stay put on a resize and change with today's page.

import { el } from './ui';

const COLOURS = ['#fadcc9', '#d9e9f5', '#f8ecbd', '#e3f0d6', '#eadcf3'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A closed, smooth blob round (cx, cy): wobbly points joined Catmull-Rom style. */
function blob(rand: () => number, cx: number, cy: number, r: number): string {
  const n = 7;
  const turn = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = turn + (i / n) * Math.PI * 2;
    const d = r * (0.72 + rand() * 0.42);
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d] as const;
  });
  const at = (i: number) => pts[(i + n) % n]!;
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function splashSvg(seed: number, w: number, h: number): string {
  const rand = rng(seed);
  const shapes: string[] = [];
  let right = rand() < 0.5;
  let colour = Math.floor(rand() * COLOURS.length);
  // The first sits high enough to run up under the status bar.
  for (let y = 30 + rand() * 40; y < h + 60; y += 260 + rand() * 140) {
    const r = 70 + rand() * 60;
    // Mostly off the edge, so the splashes frame the shelves without covering them.
    const cx = right ? w - r * (0.15 + rand() * 0.45) : r * (0.15 + rand() * 0.45);
    const fill = COLOURS[colour % COLOURS.length];
    shapes.push(`<path fill="${fill}" d="${blob(rand, cx, y, r)}"/>`);
    // A drop or two flicked inwards.
    const drops = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < drops; i++) {
      const a = (right ? Math.PI : 0) + (rand() - 0.5) * 1.6;
      const dist = r * (1.1 + rand() * 0.5);
      shapes.push(`<circle fill="${fill}" cx="${(cx + Math.cos(a) * dist).toFixed(1)}" cy="${(y + Math.sin(a) * dist).toFixed(1)}" r="${(4 + rand() * 6).toFixed(1)}"/>`);
    }
    right = !right;
    colour += 1 + Math.floor(rand() * 2);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${shapes.join('')}</svg>`;
}

/** Puts the splashes behind `screen`'s content, redrawn as it changes size. Returns a stop function. */
export function mountSplashes(screen: HTMLElement, seed: number): () => void {
  const layer = el('div', 'splashes');
  screen.prepend(layer);
  let drawn = '';
  const draw = () => {
    const w = Math.round(screen.clientWidth);
    const h = Math.round(screen.scrollHeight);
    const key = `${w}x${h}`;
    if (!w || !h || key === drawn) return;
    drawn = key;
    layer.innerHTML = splashSvg(seed, w, h);
  };
  const ro = new ResizeObserver(draw);
  ro.observe(screen);
  draw();
  return () => ro.disconnect();
}
