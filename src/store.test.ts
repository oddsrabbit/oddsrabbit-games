// A version of the game must never lose what a newer version saved (store.ts,
// "versions"). These tests play an older version meeting a newer save.
import assert from 'node:assert/strict';
import test from 'node:test';

import { addSurface, burrowForSave, readBurrow, starterBurrow, surfacesOf } from './decor';
import { act, advance, isPetState, newPet } from './sim';
import { load, Saver, SAVE_SCHEMA } from './store';
import { HOUR_MS } from './tuning';
import { setMeadow } from './yard';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = () => newPet('store-pet', 'Clover', 'snow', NOON, 'UTC');
const readPet = (x: unknown) => (isPetState(x) ? x : null);
const from = (stored: Record<string, string>) => async (key: string) => stored[key] ?? null;

test('reading a save says what it found: ok, missing, unreadable, unreachable or newer', async () => {
  const doc = JSON.stringify(pet());
  assert.equal((await load(from({ k: doc }), 'k', readPet)).kind, 'ok', 'a save from before schemas reads fine');
  assert.equal((await load(from({ k: JSON.stringify({ ...pet(), schema: SAVE_SCHEMA }) }), 'k', readPet)).kind, 'ok');
  assert.deepEqual(await load(from({}), 'k', readPet), { kind: 'missing' });
  assert.deepEqual(await load(from({ k: '{nope' }), 'k', readPet), { kind: 'broken' });
  assert.deepEqual(await load(from({ k: '{"v":7}' }), 'k', readPet), { kind: 'broken' }, 'there, but not a rabbit');
  assert.deepEqual(await load(async () => { throw new Error('offline'); }, 'k', readPet), { kind: 'error' });
  const newer = JSON.stringify({ ...pet(), schema: SAVE_SCHEMA + 1 });
  assert.deepEqual(await load(from({ k: newer }), 'k', readPet), { kind: 'newer', schema: SAVE_SCHEMA + 1 });
});

test('every save is stamped with the schema; a frozen saver writes nothing', async () => {
  const stored: Record<string, string> = {};
  const storage = { get: async (k: string) => stored[k] ?? null, set: async (k: string, v: string) => { stored[k] = v; }, delete: async (k: string) => { delete stored[k]; } };
  const saver = new Saver({ storage } as never, () => undefined);
  saver.queue('v1:pet', () => pet());
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).schema, SAVE_SCHEMA);
  saver.freeze();
  saver.queue('v1:pet', () => ({ ...pet(), name: 'Overwritten' }));
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover');
});

test("an older version keeps a newer burrow's pieces, fields and walls, and writes them back", () => {
  // what a newer version might save: a piece, a field and a floor this version has never heard of
  const newer = {
    v: 2, rev: 9, schema: SAVE_SCHEMA, yardLayout: { style: 'rows' },
    items: [
      { uid: 'p', id: 'plant', x: 12, y: 99, flip: false, placed: true },
      { uid: 'h', id: 'hammock', x: 50, y: 100, flip: false, placed: true, sway: 3 },
    ],
    surfaces: { owned: ['mossfloor'], wall: 'plainwall', floor: 'mossfloor', window: 'roundwindow' },
  };
  const b = readBurrow(JSON.parse(JSON.stringify(newer)))!;
  assert.deepEqual(b.items.map((i) => i.id), ['plant'], 'only what this version can draw');
  assert.equal(surfacesOf(b).floor, 'plainfloor', 'shows the plain floor it can draw');
  // this version changes something of its own and saves
  addSurface(b, 'starrywall');
  const saved = JSON.parse(JSON.stringify(burrowForSave(b)));
  assert.deepEqual(saved.items.find((i: { id: string }) => i.id === 'hammock'), newer.items[1], 'the unknown piece, untouched');
  assert.deepEqual(saved.yardLayout, newer.yardLayout, 'the unknown field');
  assert.equal(saved.surfaces.floor, 'mossfloor', "the newer version's floor choice");
  assert.deepEqual(saved.surfaces.owned, ['mossfloor', 'starrywall'], 'what it owned, plus the new wall');
  assert.equal(saved.surfaces.wall, 'starrywall');
  assert.equal(saved.keep, undefined, 'no bookkeeping in the save');
  // and reading it again keeps the unknown piece again
  const again = readBurrow(saved)!;
  assert.deepEqual(again.items.map((i) => i.id), ['plant']);
  assert.deepEqual(again.keep, [newer.items[1]]);
});

test('a plain burrow saves exactly as before', () => {
  const b = starterBurrow();
  assert.deepEqual(JSON.parse(JSON.stringify(burrowForSave(b))), JSON.parse(JSON.stringify(b)));
});

test("an older version keeps a newer pet's fields and timers", () => {
  const s = pet() as ReturnType<typeof pet> & { hatColour?: string };
  s.hatColour = 'teal';
  s.timers.push({ kind: 'dig' as never, startedAtMs: NOON, endsAtMs: NOON + HOUR_MS });
  s.needs.hunger = 50;
  const later = advance(s, NOON + 3 * HOUR_MS, 'UTC').state as typeof s;
  assert.equal(later.hatColour, 'teal');
  assert.ok(later.timers.some((t) => (t.kind as string) === 'dig'), "a timer it doesn't know is left for the version that does");
  const fed = act(later, 'feed', NOON + 3 * HOUR_MS, 'UTC');
  assert.ok(fed.ok && (fed.state as typeof s).hatColour === 'teal');
});

test("an older version keeps a newer version's meadow pieces", () => {
  const s = pet();
  s.meadow = ['sunflowers', 'windmill'];
  const next = setMeadow(s, ['birdbath']);
  assert.deepEqual(next.meadow, ['birdbath', 'windmill']);
});

test('a failed write is tried again, quietly, until it has failed for a while', async () => {
  const stored: Record<string, string> = {};
  let down = true;
  const storage = {
    get: async (k: string) => stored[k] ?? null,
    set: async (k: string, v: string) => { if (down) throw new Error('offline'); stored[k] = v; },
    delete: async () => undefined,
  };
  const errors: unknown[] = [];
  const saver = new Saver({ storage } as never, (e) => errors.push(e));
  saver.queue('v1:pet', () => pet());
  await saver.flush();
  assert.equal(stored['v1:pet'], undefined);
  await saver.flush();
  await saver.flush();
  assert.equal(errors.length, 0, 'a blip retries without a word');
  await saver.flush();
  assert.equal(errors.length, 1, 'still failing on the fourth try: say so');
  await saver.flush();
  assert.equal(errors.length, 1, 'told once per run of failures');
  down = false;
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover', 'the failed write went through on the retry');
  await saver.drop();
});

test('the guard sees the whole batch: it can swap a document, or stop all of them', async () => {
  const stored: Record<string, string> = {};
  const storage = { get: async (k: string) => stored[k] ?? null, set: async (k: string, v: string) => { stored[k] = v; }, delete: async () => undefined };
  let allow = true;
  const saver = new Saver({ storage } as never, () => undefined, async (docs) => {
    if (!allow) return null;
    assert.deepEqual([...docs.keys()], ['v1:pet', 'v1:burrow']);
    return new Map([...docs, ['v1:burrow', { merged: true }]]);
  });
  saver.queue('v1:pet', () => pet());
  saver.queue('v1:burrow', () => ({ merged: false }));
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:burrow']!).merged, true);
  // another device has written: none of the batch goes, and nothing is retried
  allow = false;
  saver.queue('v1:pet', () => ({ ...pet(), name: 'Stale' }));
  saver.queue('v1:burrow', () => ({ merged: 'stale' }));
  await saver.flush();
  allow = true;
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover');
  assert.equal(JSON.parse(stored['v1:burrow']!).merged, true);
});

test('a held saver writes nothing until released, then everything waiting', async () => {
  const stored: Record<string, string> = {};
  const storage = { get: async (k: string) => stored[k] ?? null, set: async (k: string, v: string) => { stored[k] = v; }, delete: async () => undefined };
  const saver = new Saver({ storage } as never, () => undefined);
  saver.hold();
  saver.queue('v1:pet', () => pet());
  await saver.flush();
  assert.equal(stored['v1:pet'], undefined);
  saver.release();
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover');
});
