import assert from 'node:assert/strict';
import test from 'node:test';

import { addEntry, emptyJournal, JOURNAL_MAX } from './journal';

test('journal keeps the newest entries and records each first once', () => {
  let j = emptyJournal();
  j = addEntry(j, { atMs: 1, text: 'Found a marble' }, 'find:marble');
  const again = addEntry(j, { atMs: 2, text: 'Found a marble' }, 'find:marble');
  assert.equal(again, j, 'a first happens once');
  for (let i = 0; i < JOURNAL_MAX + 5; i++) j = addEntry(j, { atMs: 10 + i, text: `day ${i}` });
  assert.equal(j.entries.length, JOURNAL_MAX);
  assert.equal(j.entries[0]!.text, `day ${JOURNAL_MAX + 4}`);
  assert.deepEqual(j.firsts, ['find:marble']);
});
