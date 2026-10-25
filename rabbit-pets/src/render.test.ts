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

test('how she looks follows her needs: dirt builds up in stages, and low needs show', async () => {
  const { lookOf, DIRT } = await import('./render');
  const n = (clean: number, rest = 80) => ({ hunger: rest, happy: rest, energy: rest, clean });
  assert.equal(lookOf(n(DIRT.from)).spots, 0);
  const counts = [55, 40, 25, 10, 0].map((c) => lookOf(n(c)).spots);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i]! > counts[i - 1]!, `dirtier at ${counts}`);
  assert.equal(lookOf(n(50)).straw, false);
  assert.equal(lookOf(n(DIRT.straw - 1)).straw, true);
  assert.equal(lookOf(n(DIRT.flies - 1)).flies, true);
  const low = lookOf({ hunger: 10, happy: 10, energy: 10, clean: 90 });
  assert.deepEqual([low.hungry, low.lonely, low.tired, low.thriving], [true, true, true, false]);
  assert.equal(lookOf(n(90)).thriving, true);
  // no needs (the shop's fitting room): spotless
  assert.equal(lookOf(undefined).spots, 0);
});

test('washing her: the sponge wipes off the smudges it goes over, and only on her', async () => {
  const sc = new Scene(fakeCanvas() as unknown as HTMLCanvasElement);
  const m = model(burrow(), { needs: { hunger: 80, happy: 80, energy: 80, clean: 5 }, seed: 'pet:day' });
  sc.draw(m, 0);
  const before = sc.dirtLeft(m);
  assert.ok(before > 10);
  const b = sc.rabbitBox();
  assert.equal(sc.scrub(b.x - 20, b.y, 10), false);
  assert.equal(sc.dirtLeft(m), before);
  for (let y = b.y - 2; y <= b.y + b.h + 2; y += 2) for (let x = b.x - 2; x <= b.x + b.w + 2; x += 2) assert.ok(sc.scrub(x, y, 20));
  assert.equal(sc.dirtLeft(m), 0);
  // once she's clean, a later grubby spell starts afresh
  sc.draw({ ...m, needs: { ...m.needs!, clean: 100 } }, 40);
  assert.equal(sc.dirtLeft(m), before);
});
