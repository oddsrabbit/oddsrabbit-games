import assert from 'node:assert/strict';
import test from 'node:test';

import { addEntry, emptyJournal, GUESTBOOK_MAX, JOURNAL_MAX, mergeJournal, signGuestbook } from './journal';

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

test("two devices' journals merge: everything either wrote, each first once", () => {
  const base = addEntry(emptyJournal(), { atMs: 1, text: 'Adopted' });
  const a = addEntry(addEntry(base, { atMs: 5, text: 'Found a marble' }, 'find:marble'), { atMs: 6, text: 'Fed her' });
  const b = addEntry(addEntry({ ...base, rev: 4 }, { atMs: 3, text: 'Found a marble' }, 'find:marble'), { atMs: 7, text: 'Petted her' });
  const m = mergeJournal(a, b);
  assert.deepEqual(m.entries.map((e) => `${e.atMs} ${e.text}`), ['7 Petted her', '6 Fed her', '3 Found a marble', '1 Adopted']);
  assert.deepEqual(m.firsts, ['find:marble']);
  assert.equal(m.rev, 4);
});

test('the guest book keeps each visit once, newest first, and merges across devices', () => {
  const v = (id: string, at: number, note?: string) => ({ visitUuid: id, atMs: at, from: 'u', rabbit: 'Pip', care: 'pat', ...(note ? { note } : {}) });
  let j = signGuestbook(emptyJournal(), [v('a', 1), v('b', 3, 'cozy')]);
  assert.deepEqual(j.guestbook!.map((g) => g.visitUuid), ['b', 'a']);
  assert.equal(signGuestbook(j, [v('a', 1)]), j, 'nothing new: the same journal');
  const other = signGuestbook(emptyJournal(), [v('c', 2), v('a', 1)]);
  j = mergeJournal(j, other);
  assert.deepEqual(j.guestbook!.map((g) => g.visitUuid), ['b', 'c', 'a']);
  for (let i = 0; i < GUESTBOOK_MAX + 10; i++) j = signGuestbook(j, [v(`x${i}`, 100 + i)]);
  assert.equal(j.guestbook!.length, GUESTBOOK_MAX);
});
