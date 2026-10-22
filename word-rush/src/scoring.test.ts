import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completion, decodeMask, encodeMask, MAX_SCORE, partsOf, scoreFor, scoreLabel } from './scoring';

test('completion is floored thousandths and only 1000 when everything is found', () => {
  assert.equal(completion(0, 38), 0);
  assert.equal(completion(37, 38), 973);
  assert.equal(completion(38, 38), 1000);
  assert.equal(completion(999, 1000), 999);
  assert.equal(completion(5, 0), 0);
});

test('bonus words break ties but never beat a finished board', () => {
  const almost = scoreFor(84, 85, 500);
  const done = scoreFor(85, 85, 0);
  assert.ok(done > almost);
  assert.equal(scoreFor(85, 85, 500), MAX_SCORE);
  assert.ok(scoreFor(10, 40, 3) > scoreFor(10, 40, 2));
});

test('a score splits back into its parts and reads as a label', () => {
  assert.deepEqual(partsOf(scoreFor(37, 38, 1)), { completion: 973, bonus: 1 });
  assert.equal(scoreLabel(scoreFor(38, 38, 7)), '100% · +7');
  assert.equal(scoreLabel(scoreFor(37, 38, 0)), '97%');
});

test('masks round-trip and ignore words that are not in the list', () => {
  const list = Array.from({ length: 85 }, (_, i) => `W${String.fromCharCode(65 + (i % 26))}${i}`);
  const found = new Set([list[0]!, list[7]!, list[8]!, list[84]!, 'NOPE']);
  const mask = encodeMask(list, found);
  assert.match(mask, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeMask(list, mask), [list[0], list[7], list[8], list[84]]);
});

test('mask lengths line up with what PHP base64_decode expects', () => {
  for (const n of [1, 7, 8, 9, 16, 17, 23, 24, 25, 38]) {
    const list = Array.from({ length: n }, (_, i) => `X${i}`);
    const all = new Set(list);
    const mask = encodeMask(list, all);
    const bytes = Buffer.from(mask.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    assert.equal(bytes.length, Math.ceil(n / 8), `n=${n}`);
    assert.deepEqual(decodeMask(list, mask), list);
  }
});

test('a malformed mask decodes to nothing', () => {
  assert.deepEqual(decodeMask(['A', 'B'], '!!'), []);
});
