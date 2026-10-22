import assert from 'node:assert/strict';
import test from 'node:test';

import { starterBurrow } from './decor';
import { carriedGifts, guestsHere, guestTurns } from './guests';
import { newPet } from './sim';
import { buildShowcase, type VisitIn } from './social';
import { GUESTS, HOUR_MS } from './tuning';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const snap = JSON.parse(JSON.stringify(buildShowcase(newPet('p', 'Pip', 'ginger', NOON, 'UTC'), starterBurrow())));
const at = (min: number) => new Date(NOON + min * 60_000).toISOString();
const visit = (friend: string, seenMin: number | null, visitedMin = -30): VisitIn => ({
  visitUuid: `v-${friend}`, kind: 'pat', visitedAt: at(visitedMin), seenAt: seenMin === null ? null : at(seenMin),
  from: { uuid: friend, username: friend }, showcase: snap,
});
const ids = (turns: { visit: VisitIn }[]) => turns.map((t) => t.visit.from.uuid);

test('a guest stays an hour from when she first sees the visit, then goes home', () => {
  const turns = guestTurns([visit('a', 0)], NOON, 'UTC');
  assert.equal(turns[0]!.fromMs, NOON);
  assert.equal(turns[0]!.untilMs, NOON + GUESTS.stayMs);
  assert.deepEqual(ids(guestsHere(turns, NOON + GUESTS.stayMs - 1)), ['a']);
  assert.deepEqual(ids(guestsHere(turns, NOON + GUESTS.stayMs)), [], 'gone on the hour');
});

test('an unseen visit is being seen now', () => {
  const turns = guestTurns([visit('a', null)], NOON + 10 * 60_000, 'UTC');
  assert.equal(turns[0]!.fromMs, NOON + 10 * 60_000);
});

test('two at a time; the rest wait for a place, first seen first in', () => {
  const visits = [visit('c', 0, -10), visit('a', 0, -50), visit('b', 0, -40), visit('d', 30)];
  const turns = guestTurns(visits, NOON, 'UTC');
  assert.deepEqual(ids(guestsHere(turns, NOON)), ['a', 'b'], 'the two who visited first, of those seen together');
  assert.deepEqual(ids(guestsHere(turns, NOON + HOUR_MS)).sort(), ['c', 'd'], 'c and d take their places');
  assert.deepEqual(ids(guestsHere(turns, NOON + 2 * HOUR_MS + 1)), [], 'everyone has had a turn');
  const byId = Object.fromEntries(turns.map((t) => [t.visit.from.uuid, t]));
  assert.equal(byId.d!.fromMs, NOON + HOUR_MS, 'seen at 12:30, in when a place opens');
});

test('the turns come out the same whatever order the inbox lists them in', () => {
  const visits = [visit('a', 0, -50), visit('b', 0, -40), visit('c', 5), visit('d', 5)];
  const one = guestTurns(visits, NOON + 20 * 60_000, 'UTC').map((t) => [t.visit.from.uuid, t.fromMs]);
  const two = guestTurns([...visits].reverse(), NOON + 20 * 60_000, 'UTC').map((t) => [t.visit.from.uuid, t.fromMs]);
  assert.deepEqual(one, two);
});

test('a guest carries their newest gift in; the rest, and gifts from anyone not coming, are loose', () => {
  const gift = (id: string, from: string, min: number) => ({ giftUuid: id, from: { uuid: from }, sentAt: at(min) });
  const turns = guestTurns([visit('a', 0), visit('b', 0), visit('c', 0)], NOON, 'UTC');
  const gifts = [gift('old-a', 'a', -2000), gift('new-a', 'a', -20), gift('c1', 'c', -10), gift('z1', 'z', -5)];
  const { carried, loose } = carriedGifts(gifts, turns, NOON);
  assert.equal(carried.get('a')?.giftUuid, 'new-a');
  assert.equal(carried.get('c')?.giftUuid, 'c1', 'c is waiting at the door: still carrying it');
  assert.deepEqual(loose.map((g) => g.giftUuid).sort(), ['old-a', 'z1']);
  // once their turn is over, an unopened gift is left loose
  const later = carriedGifts(gifts, turns, NOON + 3 * HOUR_MS);
  assert.equal(later.carried.size, 0);
  assert.equal(later.loose.length, 4);
});
