import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyWord,
  checkWord,
  freshProgress,
  isCleared,
  milestoneCrossed,
  nextReveal,
  scoreOf,
  submissionMetadata,
} from './game';
import type { CasualContent } from './puzzle';
import { decodeMask } from './scoring';

const content: CasualContent = {
  shape: 'square4',
  rows: 4,
  cols: 4,
  tiles: Array.from('ABCDEFGHIJKLMNOP'),
  words: ['BEAD', 'DEAF', 'FADED', 'FACADE'],
  bonus: ['ABED', 'DACE'],
  star: 'FACADE',
};

test('checkWord sorts required, bonus, repeats and misses', () => {
  const p = freshProgress(3);
  assert.equal(checkWord(content, p, 'BED').kind, 'short');
  assert.equal(checkWord(content, p, 'ZZZZ').kind, 'unknown');
  assert.deepEqual(checkWord(content, p, 'FACADE'), { kind: 'found', word: 'FACADE', star: true });
  assert.equal(checkWord(content, p, 'DACE').kind, 'bonus');
  applyWord(p, checkWord(content, p, 'BEAD'));
  applyWord(p, checkWord(content, p, 'DACE'));
  assert.equal(checkWord(content, p, 'BEAD').kind, 'already');
  assert.equal(checkWord(content, p, 'DACE').kind, 'already');
  p.revealed.push('DEAF');
  assert.equal(checkWord(content, p, 'DEAF').kind, 'revealed');
});

test('revealed words complete the list but not the score', () => {
  const p = freshProgress(3);
  p.found.push('BEAD', 'DEAF', 'FADED');
  p.revealed.push('FACADE');
  assert.ok(isCleared(content, p));
  assert.equal(scoreOf(content, p), 750 * 100);
});

test('submission metadata marks only words the player found', () => {
  const p = freshProgress(3);
  p.found.push('FADED');
  p.revealed.push('BEAD');
  p.bonus.push('DACE');
  const meta = submissionMetadata(content, p);
  assert.deepEqual(decodeMask(content.words, meta.f), ['FADED']);
  assert.deepEqual(decodeMask(content.bonus, meta.b), ['DACE']);
});

test('milestones fire once, at the highest one crossed', () => {
  assert.equal(milestoneCrossed(0, 1, 4), 25);
  assert.equal(milestoneCrossed(1, 2, 4), 50);
  assert.equal(milestoneCrossed(0, 4, 4), 100);
  assert.equal(milestoneCrossed(2, 2, 4), null);
  assert.equal(milestoneCrossed(18, 19, 38), 50);
  assert.equal(milestoneCrossed(19, 20, 38), null);
});

test('reveals go shortest first', () => {
  const p = freshProgress(3);
  assert.equal(nextReveal(content, p), 'BEAD');
  p.found.push('BEAD', 'DEAF');
  assert.equal(nextReveal(content, p), 'FADED');
  p.found.push('FADED', 'FACADE');
  assert.equal(nextReveal(content, p), null);
});
