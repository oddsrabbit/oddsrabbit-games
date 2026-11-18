import assert from 'node:assert/strict';
import test from 'node:test';

import { BridgeRequestSchema, type BridgeError, type BridgeInit } from '../schemas/messages';
import { AppManifestSchema } from '../schemas/manifest';
import { OddsRabbitSDK, WALLET_ERROR_CODES } from './sdk';
import type { BridgeTransport, InitHandler } from './transport';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Same shape as the fake in social.test.ts: the test answers every request. */
function fakeTransport(answer: (type: string, payload: unknown) => Promise<unknown>) {
  const calls: Array<{ type: string; payload: unknown }> = [];
  let initHandler: InitHandler | null = null;
  const transport = {
    request: (type: string, payload?: unknown) => {
      calls.push({ type, payload });
      return answer(type, payload);
    },
    onInit: (handler: InitHandler) => {
      initHandler = handler;
      return () => undefined;
    },
    onLifecycle: () => () => undefined,
  };
  return {
    transport: transport as unknown as BridgeTransport,
    calls,
    init: (over: Partial<BridgeInit> = {}) =>
      initHandler!({
        type: 'init',
        user: { uuid: UUID, username: 'me', avatar: null, createdAt: null, supporter: false },
        sessionToken: 'jwt',
        expiresAt: null,
        capabilities: ['wallet.balance', 'wallet.items', 'wallet.spend'],
        ...over,
      }),
  };
}

function reject(code: string): Promise<never> {
  return Promise.reject({ code, message: code } satisfies BridgeError);
}

function setup(answer: (type: string, payload: unknown) => Promise<unknown>, over: Partial<BridgeInit> = {}) {
  const t = fakeTransport(answer);
  const sdk = new OddsRabbitSDK(t.transport);
  t.init(over);
  return { t, sdk };
}

const SIGNED_OUT = { user: null, sessionToken: null };

const warp = {
  item: 'warp-8h',
  name: 'Time warp (8 hours)',
  kind: 'consumable',
  price: 40,
  limit: { count: 2, per: 'week' },
  remaining: 2,
  owned: false,
};

const spent = { balance: 60, item: 'warp-8h', owned: [], remaining: 1, replayed: false };

// ─── balance ─────────────────────────────────────────────────────────────

test('balance resolves the number', async () => {
  const { t, sdk } = setup(() => Promise.resolve({ balance: 120 }));
  assert.equal(await sdk.wallet.balance(), 120);
  assert.equal(t.calls[0]?.type, 'wallet.balance');
});

test('balance is null signed out, without a round trip', async () => {
  const { t, sdk } = setup(() => Promise.resolve({ balance: 120 }), SIGNED_OUT);
  assert.equal(await sdk.wallet.balance(), null);
  assert.equal(t.calls.length, 0);
});

test('balance is null when clover is not open to the player', async () => {
  const { sdk } = setup(() => reject(WALLET_ERROR_CODES.unavailable));
  assert.equal(await sdk.wallet.balance(), null);
  assert.equal(sdk.capabilities.has('wallet.balance'), true);
});

test('balance is null on a malformed answer', async () => {
  const { sdk } = setup(() => Promise.resolve({ balance: -3 }));
  assert.equal(await sdk.wallet.balance(), null);
});

// ─── items ───────────────────────────────────────────────────────────────

test('items parses rows one at a time and keeps the balance', async () => {
  const { sdk } = setup(() => Promise.resolve({ balance: 100, items: [warp, { item: 'Bad Key' }] }));
  assert.deepEqual(await sdk.wallet.items(), { balance: 100, items: [warp] });
});

test('items accepts an unlimited permanent item', async () => {
  const hat = { ...warp, item: 'hat-red', kind: 'permanent', limit: null, remaining: null, owned: true };
  const { sdk } = setup(() => Promise.resolve({ balance: 0, items: [hat] }));
  assert.deepEqual(await sdk.wallet.items(), { balance: 0, items: [hat] });
});

test('items is null on a host without the verb, and retires it', async () => {
  const { sdk } = setup(() => reject('bridge/unknown-action'));
  assert.equal(await sdk.wallet.items(), null);
  assert.equal(sdk.capabilities.has('wallet.items'), false);
});

test('items is null when the app lacks the scope', async () => {
  const { sdk } = setup(() => reject(WALLET_ERROR_CODES.forbidden));
  assert.equal(await sdk.wallet.items(), null);
});

// ─── spend ───────────────────────────────────────────────────────────────

test('spend sends only item and key and resolves the result', async () => {
  const { t, sdk } = setup(() => Promise.resolve(spent));
  const extra = { item: 'warp-8h', key: 'warp:1700000000', price: 0 } as { item: string; key: string };
  assert.deepEqual(await sdk.wallet.spend(extra), spent);
  assert.deepEqual(t.calls[0], { type: 'wallet.spend', payload: { item: 'warp-8h', key: 'warp:1700000000' } });
});

test('spend passes a replay through so the game applies it once', async () => {
  const { sdk } = setup(() => Promise.resolve({ ...spent, replayed: true }));
  assert.equal((await sdk.wallet.spend({ item: 'warp-8h', key: 'k1' })).replayed, true);
});

test('spend rejects with a wallet code that does not retire the verb', async () => {
  const { sdk } = setup(() => reject(WALLET_ERROR_CODES.insufficient));
  await assert.rejects(sdk.wallet.spend({ item: 'warp-8h', key: 'k1' }), (e: BridgeError) => e.code === 'wallet/insufficient');
  assert.equal(sdk.capabilities.has('wallet.spend'), true);
});

test('spend rejects signed out without a round trip', async () => {
  const { t, sdk } = setup(() => Promise.resolve(spent), SIGNED_OUT);
  await assert.rejects(sdk.wallet.spend({ item: 'warp-8h', key: 'k1' }), (e: BridgeError) => e.code === 'wallet/unauthorized');
  assert.equal(t.calls.length, 0);
});

test('spend rejects a malformed answer', async () => {
  const { sdk } = setup(() => Promise.resolve({ balance: 60 }));
  await assert.rejects(sdk.wallet.spend({ item: 'warp-8h', key: 'k1' }), /malformed/);
});

// ─── schemas ─────────────────────────────────────────────────────────────

test('the request schema checks item and key shapes', () => {
  const spend = (payload: unknown) =>
    BridgeRequestSchema.safeParse({ type: 'wallet.spend', correlationId: 'c1', payload }).success;
  assert.equal(spend({ item: 'warp-8h', key: 'warp:2026-11-18.1' }), true);
  assert.equal(spend({ item: 'Warp', key: 'k' }), false);
  assert.equal(spend({ item: 'warp-8h', key: 'has space' }), false);
  assert.equal(spend({ item: 'warp-8h', key: 'x'.repeat(65) }), false);
  assert.equal(BridgeRequestSchema.safeParse({ type: 'wallet.balance', correlationId: 'c1' }).success, true);
});

test('a manifest may declare bridge:wallet', () => {
  const manifest = {
    id: 'rabbit-pets',
    name: 'Rabbit Pets',
    developer: 'OddsRabbit',
    surface: 'games',
    appUrl: 'https://games.oddsrabbit.com/rabbit-pets/',
    sdkVersion: '1',
    scopes: ['bridge:storage', 'bridge:wallet'],
    version: '1.0.0',
    updatedAt: '2026-11-18T00:00:00Z',
  };
  assert.equal(AppManifestSchema.safeParse(manifest).success, true);
});
