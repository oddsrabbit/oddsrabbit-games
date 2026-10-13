// A version of the game must never lose what a newer version saved (store.ts,
// "versions"). These tests play an older version meeting a newer save.
import assert from 'node:assert/strict';
import test from 'node:test';

import { addSurface, burrowForSave, readBurrow, starterBurrow, surfacesOf } from './decor';
import { act, advance, isPetState, newPet } from './sim';
import { load, savedBytes, Saver, SAVE_SCHEMA, STORAGE_TOTAL_BYTES } from './store';
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

test("a write that never answers times out and is tried again, so saving doesn't stop", async () => {
  const stored: Record<string, string> = {};
  let hang = true;
  const storage = {
    get: async (k: string) => stored[k] ?? null,
    // the first write is lost on the way: no answer, ever
    set: (k: string, v: string) => (hang ? new Promise<void>(() => undefined) : (stored[k] = v, Promise.resolve())),
    delete: async () => undefined,
  };
  const saver = new Saver({ storage } as never, () => undefined, undefined, 20);
  saver.queue('v1:pet', () => pet());
  await saver.flush();
  assert.equal(stored['v1:pet'], undefined);
  hang = false;
  saver.queue('v1:burrow', () => ({ v: 2 }));
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover', 'the timed-out write went again');
  assert.equal(JSON.parse(stored['v1:burrow']!).v, 2, 'and what came after it went too');
});

test('with storage full, a smaller journal written first makes room for her save in the same batch', async () => {
  // the server's rule (AppStorageService): every key together under STORAGE_TOTAL_BYTES
  const stored: Record<string, string> = { 'v1:journal': 'x'.repeat(STORAGE_TOTAL_BYTES - 500), 'v1:pet': JSON.stringify(pet()) };
  const bytes = (v: string) => new TextEncoder().encode(v).length;
  const storage = {
    get: async (k: string) => stored[k] ?? null,
    set: async (k: string, v: string) => {
      const others = Object.entries(stored).filter(([key]) => key !== k).reduce((t, [, x]) => t + bytes(x), 0);
      if (others + bytes(v) > STORAGE_TOTAL_BYTES) throw { code: 'storage/tuple-size-exceeded' };
      stored[k] = v;
    },
    delete: async () => undefined,
  };
  const grown = { ...pet(), name: 'Clover'.repeat(100) };
  // as main.ts othersHaventWritten does: the journal first
  const journalFirst = async (docs: Map<string, unknown>) => new Map([...docs].sort(([a]) => (a === 'v1:journal' ? -1 : 1)));
  const saver = new Saver({ storage } as never, () => undefined, journalFirst);
  saver.queue('v1:pet', () => grown);
  saver.queue('v1:journal', () => ({ v: 1, rev: 1, entries: [], firsts: [] }));
  await saver.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, grown.name, 'her save landed');
  assert.ok(savedBytes(grown) + bytes(stored['v1:journal']!) <= STORAGE_TOTAL_BYTES);

  // the other way round, her save is refused: what players were hitting
  stored['v1:journal'] = 'x'.repeat(STORAGE_TOTAL_BYTES - 500);
  stored['v1:pet'] = JSON.stringify(pet());
  const plain = new Saver({ storage } as never, () => undefined);
  plain.queue('v1:pet', () => grown);
  plain.queue('v1:journal', () => ({ v: 1, rev: 1, entries: [], firsts: [] }));
  await plain.flush();
  assert.equal(JSON.parse(stored['v1:pet']!).name, 'Clover', 'pet first: refused, storage full');
  await plain.drop();
});
