import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyWord,
  checkWord,
  freshProgress,
  isCleared,
  mergeProgress,
  milestoneCrossed,
  nextReveal,
  restoreFromScore,
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

test('merging two copies of a board keeps every word either one found', () => {
  // This tab found BEAD; another tab or device found DEAF and revealed FADED, then sent a score.
  const here = freshProgress(3);
  here.found.push('BEAD');
  here.bonus.push('DACE');
  here.revealed.push('FACADE');
  const there = freshProgress(3);
  there.found.push('DEAF', 'FACADE');
  there.revealed.push('FADED');
  there.bonus.push('ABED', 'DACE');
  there.submitted = 500;
  there.counted.halfway = true;
  there.started = true;
  assert.ok(mergeProgress(here, there));
  assert.deepEqual(here.found, ['BEAD', 'DEAF', 'FACADE']);
  assert.deepEqual(here.bonus, ['DACE', 'ABED']);
  assert.deepEqual(here.revealed, ['FADED'], 'found on one side wins over revealed on the other');
  assert.equal(here.submitted, 500);
  assert.deepEqual(here.counted, { halfway: true, cleared: false });
  assert.equal(here.started, true);
  assert.equal(mergeProgress(here, there), false, 'merging again changes nothing');
});

test('an empty copy merged in takes nothing away', () => {
  const here = freshProgress(3);
  here.found.push('BEAD', 'DEAF');
  here.submitted = 300;
  assert.equal(mergeProgress(here, freshProgress(3)), false);
  assert.deepEqual(here.found, ['BEAD', 'DEAF']);
  assert.equal(here.submitted, 300);
});

test('words on the score row come back to a copy that lost them', () => {
  const sent = freshProgress(3);
  sent.found.push('FADED', 'BEAD');
  sent.bonus.push('DACE');
  const metadata = submissionMetadata(content, sent);
  const lost = freshProgress(3);
  lost.revealed.push('BEAD');
  assert.ok(restoreFromScore(content, lost, metadata));
  assert.deepEqual(lost.found.slice().sort(), ['BEAD', 'FADED']);
  assert.deepEqual(lost.bonus, ['DACE']);
  assert.deepEqual(lost.revealed, []);
  assert.equal(lost.started, true);
  assert.equal(restoreFromScore(content, lost, metadata), false);
  assert.equal(restoreFromScore(content, lost, null), false);
});
