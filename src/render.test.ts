// The burrow's idle moments (render.ts pickIdle), driven frame by frame with
// a stand-in canvas: where she goes on a cold night, a wet day, or any day.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { BurrowState } from './decor';

// A canvas that draws nothing: enough for the scene to run in Node.
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => ({})),
  set: () => true,
});
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });
(globalThis as { document?: unknown }).document = { createElement: fakeCanvas };

const { Scene } = await import('./render');
type Model = Parameters<InstanceType<typeof Scene>['draw']>[0];

const burrow = (...items: [string, number, number][]): BurrowState => ({
  v: 2, rev: 0, items: items.map(([id, x, y], i) => ({ uid: `u${i}`, id, x, y, flip: false, placed: true })),
});
const model = (b: BurrowState, over: Partial<Model> = {}): Model => ({
  coat: 'snow', night: false, mood: 'content', burrow: b, decorating: false, selected: null, season: 'summer', weather: 'sunny', ...over,
});

/** Run the scene for `ms` with every roll coming up `r`, and say what she's doing. */
function after(m: Model, ms: number, r = 0.1): ReturnType<InstanceType<typeof Scene>['activity']> {
  const real = Math.random;
  Math.random = () => r;
  try {
    const scene = new Scene(fakeCanvas() as unknown as HTMLCanvasElement);
    for (let t = 0; t <= ms; t += 66) scene.draw(m, t);
    return scene.activity();
  } finally {
    Math.random = real;
  }
}

test('on a cold night she curls up by the fire', () => {
  const b = burrow(['fireplace', 22, 100]);
  assert.deepEqual(after(model(b, { night: true }), 20_000), { kind: 'fire' });
  assert.deepEqual(after(model(b, { season: 'winter' }), 20_000), { kind: 'fire' });
  assert.equal(after(model(b), 20_000), null, 'a warm day: no fire for her');
});

test('rain or snow draws her to the window, from the window seat if there is one', () => {
  assert.deepEqual(after(model(burrow(['windowseat', 30, 104]), { weather: 'rain' }), 20_000), { kind: 'seat', weather: 'rain' });
  assert.deepEqual(after(model(burrow(), { weather: 'snow' }), 20_000), { kind: 'window', weather: 'snow' });
});

test('each day she has a favourite piece, and sits by it', () => {
  const b = burrow(['bookshelf', 86, 99], ['plant', 20, 104]);
  const a = after(model(b, { seed: 'pet:2026-09-25' }), 20_000, 0.3);
  assert.equal(a?.kind, 'favourite');
  assert.ok(['bookshelf', 'plant'].includes((a as { piece: string }).piece));
  assert.equal(after(model(b), 20_000, 0.3), null, 'no seed, no favourite');
});

test('nothing takes her anywhere while she wants something, or while decorating', () => {
  const b = burrow(['fireplace', 22, 100]);
  assert.equal(after(model(b, { night: true, mood: 'peckish' }), 20_000), null);
  assert.equal(after(model(b, { night: true, decorating: true }), 20_000), null);
});
