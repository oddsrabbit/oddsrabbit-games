import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FriendScore } from '@oddsrabbit/apps-sdk';
import { friendsRows, hintsLabel } from './board';
import { friendsLine, totalLine } from './home';

const row = (username: string, createdAt: string, isSelf = false): FriendScore => ({
  uuid: '11111111-1111-4111-8111-111111111111', username, score: 1, metadata: null, createdAt, avatar: null, isSelf, likes: 0,
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

test('friends go earliest first; just the viewer is no board', () => {
  const rows = friendsRows([row('late', '2026-11-10T09:00:00Z'), row('early', '2026-11-10T01:00:00Z'), row('me', '2026-11-10T05:00:00Z', true)]);
  assert.deepEqual(rows.map((r) => r.username), ['early', 'me', 'late']);
  assert.deepEqual(friendsRows([row('me', '2026-11-10T05:00:00Z', true)]), []);
});
