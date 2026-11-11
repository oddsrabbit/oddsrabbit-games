import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fasterThan, formatTime, isFinalRefusal, isFinishedRace, isRacing, parseRace, RACE_DAY_SEC, RACE_FLOOR_SEC, raceKey, raceScore, raceSeconds } from './race';
import { TIERS } from './grade';

test('a faster race scores higher, and every finish beats a start', () => {
  assert.equal(raceKey(7), 'race-7');
  assert.ok(raceScore(300) > raceScore(301));
  assert.equal(raceScore(600), RACE_DAY_SEC - 600);
  assert.ok(raceScore(RACE_DAY_SEC * 2) >= 1, 'clamped to a legal finish');
  assert.equal(raceScore(-5), RACE_DAY_SEC);
  assert.ok(isFinishedRace({ score: raceScore(RACE_DAY_SEC - 1) }));
  assert.ok(!isFinishedRace({ score: 0 }));
});

test('a row reads back as seconds, preferring the server’s own', () => {
  assert.equal(raceSeconds({ score: raceScore(754), metadata: null }), 754);
  assert.equal(raceSeconds({ score: raceScore(700), metadata: { finished: true, seconds: 731 } }), 731);
  assert.equal(raceSeconds({ score: 0, metadata: { finished: false } }), null);
});

test('times read like a clock', () => {
  assert.equal(formatTime(47), '0:47');
  assert.equal(formatTime(754), '12:34');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(-3), '0:00');
});

test('faster than: the share of other finishers you beat', () => {
  assert.equal(fasterThan(1, 10), 100);
  assert.equal(fasterThan(10, 10), 0);
  assert.equal(fasterThan(4, 11), 70);
  assert.equal(fasterThan(1, 1), null);
  assert.equal(fasterThan(0, 5), null);
});

test('every tier has a floor', () => {
  for (const tier of TIERS) assert.ok(RACE_FLOOR_SEC[tier] > 0);
});

test('race state parses defensively', () => {
  assert.equal(parseRace(null), null);
  assert.equal(parseRace({ startedAt: 'soon' }), null);
  assert.deepEqual(parseRace({ startedAt: 5, finishedSec: 61.6, pending: true, junk: 1 }), { startedAt: 5, finishedSec: 62, pending: true });
  assert.ok(isRacing(parseRace({ startedAt: 5 })));
  assert.ok(!isRacing(parseRace({ startedAt: 5, left: true })));
  assert.ok(!isRacing(parseRace({ startedAt: 5, finishedSec: 90 })));
});

test('final refusals stop the resend', () => {
  assert.ok(isFinalRefusal('scores/race-too-fast'));
  assert.ok(isFinalRefusal('scores/round-closed'));
  assert.ok(!isFinalRefusal('network/timeout'));
  assert.ok(!isFinalRefusal(undefined));
});
