import assert from 'node:assert/strict';
import { test } from 'node:test';

// A stand-in bridge whose writes land after random delays, so parallel writes
// would arrive out of order.
const server = new Map<string, string>();
let inFlight = 0;
let maxInFlight = 0;
let failNext = 0;
(globalThis as { window?: unknown }).window = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  OddsRabbit: {
    storage: {
      get: async (key: string) => server.get(key) ?? null,
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

const { readJson, writeJson } = await import('./ui');

test('a burst of writes to one key stores the last value, one request at a time', async () => {
  const found: string[] = [];
  const saves: Promise<void>[] = [];
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
  await writeJson('casual-3', { found: ['AIRT'] });
  assert.deepEqual(JSON.parse(server.get('casual-3')!), { found: ['AIRT'] });
});

test('a write after the queue drains is still sent', async () => {
  await writeJson('tab', 'sprint');
  await writeJson('tab', 'casual');
  assert.equal(JSON.parse(server.get('tab')!), 'casual');
});
