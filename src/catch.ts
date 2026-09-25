// Carrot catch: the one mini-game. Thirty seconds of carrots falling into a
// meadow; move her left and right to catch them. Nothing to lose, no score
// kept: it's a few plays a day for a little clover (extras.ts playReward).
// Resolves with the number caught, or null if closed early.

import type { Sprite } from './art/pixels';

const W = 98;
const H = 118;
const GROUND = 108;
const ROUND_MS = 30_000;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface CatchArt {
  /** Her standing and her happy face, dressed. */
  rabbit: Sprite;
  happy: Sprite;
  carrot: Sprite;
  golden: Sprite;
}

interface Drop { x: number; y: number; v: number; golden: boolean }

export function playCatch(host: HTMLElement, art: CatchArt, name: string, onSound: (s: 'catch' | 'end') => void): Promise<number | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'catch-canvas px';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Carrot catch. Move ${name} with your finger or the arrow keys.`);
    canvas.tabIndex = 0;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const count = document.createElement('div');
    count.className = 'catch-count';
    count.setAttribute('aria-live', 'polite');
    const time = document.createElement('div');
    time.className = 'catch-time';
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'btn';
    quit.textContent = 'Stop';
    const top = document.createElement('div');
    top.className = 'catch-top';
    top.append(count, time, quit);
    const wrap = document.createElement('div');
    wrap.className = 'catch';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Carrot catch');
    const hint = document.createElement('p');
    hint.className = 'catch-hint';
    hint.textContent = 'Slide to catch the carrots. Golden ones count for 3.';
    wrap.append(top, canvas, hint);
    host.append(wrap);

    const fit = () => {
      // The padding keeps clear of the screen's insets (styles.css, .catch).
      const cs = getComputedStyle(wrap);
      const innerW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const innerH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.max(2, Math.floor(Math.min((innerW - 16) / W, (innerH - 130) / H)));
      canvas.style.width = `${W * s}px`;
      canvas.style.height = `${H * s}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    let x = W / 2;
    let target = x;
    let caught = 0;
    let happyUntil = 0;
    let drops: Drop[] = [];
    let nextDrop = 600;
    // timed from the first frame, on the frames' own clock
    let start = -1;
    let last = 0;
    let raf = 0;
    let done = false;
    let seed = (Date.now() * 1000) >>> 0;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

    const toX = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * W;
    };
    canvas.addEventListener('pointerdown', (e) => { target = toX(e.clientX); try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
    canvas.addEventListener('pointermove', (e) => { target = toX(e.clientX); });
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { finish(null); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    quit.addEventListener('click', () => finish(null));

    function finish(result: number | null): void {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      wrap.remove();
      resolve(result);
    }

    function frame(t: number): void {
      if (done) return;
      raf = requestAnimationFrame(frame);
      if (start < 0) { start = t; last = t; }
      const dt = Math.min(50, t - last);
      last = t;
      const elapsed = t - start;
      const left = ROUND_MS - elapsed;
      if (left <= 0) { onSound('end'); finish(caught); return; }

      if (keys.has('ArrowLeft')) target = x - 6;
      if (keys.has('ArrowRight')) target = x + 6;
      target = Math.max(10, Math.min(W - 10, target));
      const dx = target - x;
      x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.09);

      // carrots come a little faster as the round goes on
      nextDrop -= dt;
      if (nextDrop <= 0) {
        const pace = elapsed / ROUND_MS;
        drops.push({ x: 8 + rnd() * (W - 16), y: -12, v: 0.028 + pace * 0.03 + rnd() * 0.01, golden: rnd() < 0.08 });
        nextDrop = 760 - pace * 330;
      }
      for (const d of drops) d.y += d.v * dt * (reduceMotion ? 0.8 : 1);
      const kept: Drop[] = [];
      for (const d of drops) {
        const hit = d.y > GROUND - 34 && d.y < GROUND - 14 && Math.abs(d.x - x) < 12;
        if (hit) {
          caught += d.golden ? 3 : 1;
          happyUntil = t + 400;
          onSound('catch');
        } else if (d.y < H) {
          kept.push(d);
        }
      }
      drops = kept;

      // meadow
      ctx.fillStyle = '#A6DBF5';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#BFE6F7';
      ctx.fillRect(0, 52, W, 30);
      ctx.fillStyle = '#86C95E';
      ctx.fillRect(0, GROUND - 6, W, H);
      ctx.fillStyle = '#4E8C3A';
      for (let i = 0; i < W; i += 7) ctx.fillRect(i + ((i * 3) % 4), GROUND - 7, 1, 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(14, 18, 12, 2); ctx.fillRect(16, 16, 7, 2);
      ctx.fillRect(64, 30, 14, 2); ctx.fillRect(67, 28, 8, 2);

      for (const d of drops) {
        const s = d.golden ? art.golden : art.carrot;
        ctx.drawImage(s.canvas, Math.round(d.x - s.w / 2), Math.round(d.y));
      }
      const r = t < happyUntil ? art.happy : art.rabbit;
      ctx.drawImage(r.canvas, Math.round(x - r.w / 2), GROUND - r.h + 2);

      count.textContent = `${caught} caught`;
      time.textContent = `${Math.ceil(left / 1000)}s`;
    }
    raf = requestAnimationFrame(frame);
    canvas.focus();
  });
}
