import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FriendScore } from '@oddsrabbit/apps-sdk';
import { friendsRaceLine, friendsRows, hintsLabel, isSolvedRow, raceHeadline, raceLabel, rowLabel, solveScore, UNSOLVED_SCORE } from './board';
import { raceScore } from './race';
import { friendsLine, totalLine } from './home';

const row = (username: string, createdAt: string, isSelf = false, score = 100): FriendScore => ({
  uuid: '11111111-1111-4111-8111-111111111111', username, score, metadata: null, createdAt, avatar: null, isSelf, likes: 0,
});

test('home names up to three friends, then counts the rest', () => {
  assert.equal(friendsLine([]), 'None of your friends has solved it yet.');
  assert.equal(friendsLine(['pip']), 'pip solved it.');
  assert.equal(friendsLine(['pip', 'bun']), 'pip and bun solved it.');
  assert.equal(friendsLine(['pip', 'bun', 'mo']), 'pip, bun and mo solved it.');
  assert.equal(friendsLine(['pip', 'bun', 'mo', 'thump']), 'pip, bun and 2 more friends solved it.');
});

test('the whole field, in words', () => {
  assert.equal(totalLine(0), 'Nobody has solved it yet. Be the first.');
  assert.equal(totalLine(1), '1 player has solved it today.');
  assert.equal(totalLine(1204), '1,204 players have solved it today.');
});

test('a row shows the hints it took, or nothing when it does not say', () => {
  assert.equal(hintsLabel({ hints: 0 }), 'No hints');
  assert.equal(hintsLabel({ hints: 1 }), '1 hint');
  assert.equal(hintsLabel({ hints: 4 }), '4 hints');
  assert.equal(hintsLabel(null), '');
  assert.equal(hintsLabel({ hints: 'lots' }), '');
});

test('a solve scores 100 less its hints, above every day only started', () => {
  assert.equal(solveScore(0), 100);
  assert.equal(solveScore(3), 97);
  assert.equal(solveScore(99), 1);
  assert.equal(solveScore(250), 1);
  assert.equal(solveScore(-2), 100);
  assert.equal(solveScore(Number.NaN), 100);
  assert.ok(solveScore(1000) > UNSOLVED_SCORE);
  assert.equal(isSolvedRow({ score: UNSOLVED_SCORE }), false);
  // Launch-day solves went up as 1.
  assert.equal(isSolvedRow({ score: 1 }), true);
});

test('an unsolved row says so; a solve says its hints', () => {
  assert.equal(rowLabel({ score: UNSOLVED_SCORE, metadata: { solved: false, hints: 2 } }), 'Not solved yet');
  assert.equal(rowLabel({ score: 98, metadata: { solved: true, hints: 2 } }), '2 hints');
  assert.equal(rowLabel({ score: 1, metadata: { hints: 0 } }), 'No hints');
});

test('friends go fewest hints first, then whoever got on first; just the viewer is no board', () => {
  const rows = friendsRows([
    row('trying', '2026-11-10T00:30:00Z', false, UNSOLVED_SCORE),
    row('hinted', '2026-11-10T00:10:00Z', false, 97),
    row('late', '2026-11-10T09:00:00Z'),
    row('early', '2026-11-10T01:00:00Z'),
    row('me', '2026-11-10T05:00:00Z', true),
  ]);
  assert.deepEqual(rows.map((r) => r.username), ['early', 'me', 'late', 'hinted', 'trying']);
  assert.deepEqual(friendsRows([row('me', '2026-11-10T05:00:00Z', true)]), []);
});

test('race rows read as times, and the headline leads with your place', () => {
  assert.equal(raceLabel({ score: raceScore(754), metadata: { finished: true, seconds: 754 } }), '12:34');
  assert.equal(raceLabel({ score: 0, metadata: { finished: false } }), '');
  assert.equal(raceHeadline(754, 4, 11), 'You: 12:34 · faster than 70% of racers');
  assert.equal(raceHeadline(754, 1, 1), 'You: 12:34');
});

test('friends on the race: up to three by name, then a count', () => {
  assert.equal(friendsRaceLine([]), '');
  assert.equal(friendsRaceLine([{ username: 'pip', seconds: 552 }]), 'Friends: pip 9:12');
  const four = ['a', 'b', 'c', 'd'].map((username, i) => ({ username, seconds: 600 + i }));
  assert.equal(friendsRaceLine(four), 'Friends: a 10:00 · b 10:01 · c 10:02 · 1 more');
});
