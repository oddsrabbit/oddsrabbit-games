import assert from 'node:assert/strict';
import test from 'node:test';

import { wardrobe } from './extras';
import { drawTicket, prizeWon, ticketsBought } from './raffle';
import { newPet, type PetState } from './sim';
import { RAFFLE } from './tuning';
import { EVENTS } from './world';

const NOON = Date.UTC(2026, 9, 25, 12, 0);
const spooky = EVENTS.find((e) => e.id === 'spooky')!;

test('every event has a prize that can only be won', () => {
  for (const e of EVENTS) assert.ok(e.raffle, `${e.id} has a raffle prize`);
});

test('the prize comes by the guaranteed ticket at the latest, and every other ticket is a miss', () => {
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    let s: PetState = newPet(id, 'Mochi', 'snow', NOON, 'UTC');
    s.clover = 10_000;
    let n = 0;
    while (!prizeWon(s, spooky)) {
      const before = s.clover;
      const r = drawTicket(s, spooky);
      assert.ok(r.ok);
      n++;
      assert.equal(r.state.clover, before - RAFFLE.ticket, 'no clover back');
      if (r.draw.kind === 'miss') assert.deepEqual(r.state.collection, s.collection, 'nothing else changes');
      s = r.state;
      assert.ok(n <= RAFFLE.guaranteeBy);
    }
    assert.ok(wardrobe(s).owned.includes(spooky.raffle!));
    assert.equal(ticketsBought(s, 'spooky'), n);
    assert.deepEqual(drawTicket(s, spooky), { ok: false, reason: 'won' }, 'the raffle is over once won');
  }
});

test("a ticket drawn again from the same save is the same ticket", () => {
  const s = newPet('same', 'Mochi', 'snow', NOON, 'UTC');
  s.clover = 500;
  assert.deepEqual(drawTicket(s, spooky), drawTicket(s, spooky));
  s.clover = RAFFLE.ticket - 1;
  assert.deepEqual(drawTicket(s, spooky), { ok: false, reason: 'broke' });
});
