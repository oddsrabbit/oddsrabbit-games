import assert from 'node:assert/strict';
import { test } from 'node:test';

// A stand-in bridge whose writes land after random delays, so parallel writes
// would arrive out of order.
const server = new Map<string, string>();
let inFlight = 0;
let maxInFlight = 0;
let failNext = 0;
let failReads = 0;
(globalThis as { window?: unknown }).window = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  OddsRabbit: {
    storage: {
      get: async (key: string) => {
        if (failReads > 0) {
          failReads--;
          throw new Error('offline');
        }
        return server.get(key) ?? null;
      },
      set: (key: string, value: string) =>
        new Promise<void>((resolve, reject) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight--;
            if (failNext > 0) {
              failNext--;
              reject(new Error('offline'));
              return;
            }
            server.set(key, value);
            resolve();
          }, Math.random() * 20);
        }),
    },
  },
};

const { readJson, readStored, writeJson } = await import('./ui');

test('a burst of writes to one key stores the last value, one request at a time', async () => {
  const found: string[] = [];
  const saves: Promise<boolean>[] = [];
  for (const w of ['RET', 'TIE', 'TIER', 'RITE', 'TIRE', 'TIRED', 'DIET', 'EDIT']) {
    found.push(w);
    saves.push(writeJson('sprint', { found: [...found] }));
  }
  assert.deepEqual(await readJson('sprint', null), { found }, 'reads see the pending value');
  await Promise.all(saves);
  assert.deepEqual(JSON.parse(server.get('sprint')!), { found });
  assert.equal(maxInFlight, 1);
});

test('a failed write is retried', async () => {
  failNext = 1;
  assert.equal(await writeJson('casual-3', { found: ['AIRT'] }), true);
  assert.deepEqual(JSON.parse(server.get('casual-3')!), { found: ['AIRT'] });
});

test('a write after the queue drains is still sent', async () => {
  await writeJson('tab', 'sprint');
  await writeJson('tab', 'casual');
  assert.equal(JSON.parse(server.get('tab')!), 'casual');
});

test('a write that keeps failing reports it', async () => {
  failNext = 3;
  assert.equal(await writeJson('casual-4', { found: ['TIRE'] }), false);
  assert.equal(server.has('casual-4'), false);
});

test('readStored tells "nothing saved" from "could not look"', async () => {
  assert.equal(await readStored('never-written'), undefined);
  failReads = 1;
  await assert.rejects(readStored('casual-3'));
  failReads = 1;
  assert.equal(await readJson('casual-3', 'fallback'), 'fallback', 'readJson still falls back');
  assert.deepEqual(await readStored('casual-3'), { found: ['AIRT'] });
});
