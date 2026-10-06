// The visual celebrations: a score that floats up from the grid, praise for
// long words, confetti, and a counter that rolls up. Presentation only.
// Everything respects prefers-reduced-motion by doing less, never nothing:
// the text still appears, it just doesn't fly.

import { el } from './ui';

const reduced = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** "+3" rising from a tile and fading out. */
export function floatScore(grid: HTMLElement, tile: number, cols: number, rows: number, text: string, tone: 'good' | 'bonus' | 'star'): void {
  const pop = el('div', `float-score ${tone}`, text);
  pop.style.left = `${(((tile % cols) + 0.5) / cols) * 100}%`;
  pop.style.top = `${((Math.floor(tile / cols) + 0.5) / rows) * 100}%`;
  grid.appendChild(pop);
  window.setTimeout(() => pop.remove(), 900);
}

/** Praise by word length, Word Hunt style. Null below five letters. */
export function praiseFor(length: number): string | null {
  if (length >= 8) return 'Incredible!';
  if (length === 7) return 'Excellent!';
  if (length === 6) return 'Great!';
  if (length === 5) return 'Nice!';
  return null;
}

/** A big word over the grid that pops in and fades: "Great!", "Time!". */
export function banner(grid: HTMLElement, text: string, tone: 'good' | 'star' | 'time' = 'good'): void {
  grid.querySelector('.banner')?.remove();
  const b = el('div', `banner ${tone}`, text);
  grid.appendChild(b);
  window.setTimeout(() => b.remove(), tone === 'time' ? 1400 : 1000);
}

const COLOURS = ['#4d8a3a', '#7cbf5f', '#c99a1e', '#f0c64a', '#b8732c', '#e3a35e', '#c2483d', '#6aa5d8'];

/** A short confetti burst over the page, drawn on a throwaway canvas. */
export function confetti(intensity = 1): void {
  if (reduced()) return;
  const canvas = el('canvas', 'confetti');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) {
    canvas.remove();
    return;
  }
  g.scale(dpr, dpr);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const n = Math.round(70 * intensity);
  const bits = Array.from({ length: n }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.45,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 8,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    s: 5 + Math.random() * 5,
    c: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
  }));
  const start = performance.now();
  const frame = (t: number): void => {
    const age = t - start;
    g.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.28;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.globalAlpha = Math.max(0, 1 - age / 1600);
      g.fillStyle = b.c;
      g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      g.restore();
    }
    if (age < 1600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Roll a number up to its new value over a few hundred ms. */
export function rollNumber(node: HTMLElement, from: number, to: number, format: (n: number) => string): void {
  if (reduced() || from === to) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  const dur = 350;
  const step = (t: number): void => {
    const k = Math.min(1, (t - start) / dur);
    const eased = 1 - (1 - k) ** 3;
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}
