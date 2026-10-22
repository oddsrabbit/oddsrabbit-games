import assert from 'node:assert/strict';
import test from 'node:test';

import { addEntry, emptyJournal, fitJournal, GUESTBOOK_MAX, JOURNAL_MAX, mergeJournal, signGuestbook } from './journal';

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

test('a journal too big for its room loses its oldest entries and signatures, in step', () => {
  const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
  let j = emptyJournal();
  j = addEntry(j, { atMs: 1, text: 'Found a marble' }, 'find:marble');
  for (let i = 0; i < JOURNAL_MAX; i++) j = addEntry(j, { atMs: 10 + i, text: `She came home from foraging with clover and strawberries ${i}`, art: 'basket' });
  const visits = Array.from({ length: GUESTBOOK_MAX }, (_, i) => ({ visitUuid: `v${i}`, atMs: 1000 + i, from: 'friend', rabbit: 'Biscuit', care: 'pet', note: 'Hope she likes it ’ ✿' }));
  j = { ...signGuestbook(j, visits), pinned: ['v0'] };

  const fit = fitJournal(j, 4_000);
  assert.ok(bytes(fit) <= 4_000, 'counted in bytes, as storage counts them');
  assert.ok(bytes(fit) > 3_000, 'and nearly all the room used');
  assert.equal(fit.entries[0], j.entries[0], 'the newest entry stays');
  assert.equal(fit.guestbook![0]!.visitUuid, 'v59', 'and the newest signature');
  assert.ok(fit.entries.length > 5 && fit.guestbook!.length > 3, 'neither is cut away to make room for the other');
  assert.ok(fit.guestbook!.some((g) => g.visitUuid === 'v0'), 'a pinned one is never cut');
  assert.deepEqual(fit.firsts, ['find:marble'], 'firsts are kept, so they still happen once');

  const small = emptyJournal();
  assert.equal(fitJournal(small, 4_000), small, 'one that fits is left alone');
  assert.ok(fitJournal(j, 0).entries.length === 0, 'no room at all: no entries');
});
