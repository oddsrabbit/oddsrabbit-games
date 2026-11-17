import assert from 'node:assert/strict';
import test from 'node:test';

import { BridgeRequestSchema, type BridgeError, type BridgeInit } from '../schemas/messages';
import type { GameInfoSection } from '../schemas/messages';
import { OddsRabbitSDK } from './sdk';
import type { BridgeTransport, InitHandler } from './transport';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Same shape as the fake in likes.test.ts: the test answers every request. */
function setup(answer: (type: string, payload: unknown) => Promise<unknown>, over: Partial<BridgeInit> = {}) {
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
  const sdk = new OddsRabbitSDK(transport as unknown as BridgeTransport);
  initHandler!({
    type: 'init',
    user: { uuid: UUID, username: 'me', avatar: null, createdAt: null, supporter: false },
    sessionToken: 'jwt',
    expiresAt: null,
    capabilities: ['actions.showGameInfo'],
    ...over,
  });
  return { sdk, calls };
}

function reject(code: string): Promise<never> {
  return Promise.reject({ code, message: code } satisfies BridgeError);
}

/** What the host validates: the request must pass the bridge schema. */
function hostAccepts(call: { type: string; payload: unknown }): boolean {
  return BridgeRequestSchema.safeParse({ type: call.type, correlationId: 'c1', payload: call.payload }).success;
}

test('showGameInfo with no section sends no payload, which the host accepts', async () => {
  const { sdk, calls } = setup(async () => undefined);
  await sdk.actions.showGameInfo();
  assert.deepEqual(calls, [{ type: 'actions.showGameInfo', payload: undefined }]);
  assert.ok(hostAccepts(calls[0]!));
});

test('showGameInfo passes a section, which the host accepts', async () => {
  const { sdk, calls } = setup(async () => undefined);
  await sdk.actions.showGameInfo('rate');
  assert.deepEqual(calls, [{ type: 'actions.showGameInfo', payload: { section: 'rate' } }]);
  assert.ok(hostAccepts(calls[0]!));
});

test('showGameInfo rejects an unknown section without calling the host', async () => {
  const { sdk, calls } = setup(async () => undefined);
  await assert.rejects(sdk.actions.showGameInfo('ratings' as GameInfoSection), /section must be one of about, rate/);
  assert.equal(calls.length, 0);
});

test('showGameInfo rejected as unknown narrows capabilities', async () => {
  const { sdk } = setup(() => reject('bridge/unknown-action'));
  assert.equal(sdk.capabilities.has('actions.showGameInfo'), true);
  await assert.rejects(sdk.actions.showGameInfo(), { code: 'bridge/unknown-action' });
  assert.equal(sdk.capabilities.has('actions.showGameInfo'), false);
});
