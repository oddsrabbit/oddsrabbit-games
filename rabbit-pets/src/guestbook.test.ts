import assert from 'node:assert/strict';
import test from 'node:test';

import { starterBurrow } from './decor';
import {
  buyCover, coverOf, isNote, MAX_PINS, noteText, OPENERS, phraseCode, phraseOf, PRAISE, readKind, readPins, stampCode,
  stampOf, stampsFor, STAMPS, SUBJECTS, subjectsFor, togglePin, useCover, visitKind,
} from './guestbook';
import { GUESTBOOK_MAX, signGuestbook, type GuestEntry, type Journal } from './journal';
import { newPet } from './sim';
import { buildShowcase, readShowcase, visitInfo } from './social';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const KIND = /^[a-z0-9-]{1,32}$/;
const pet = () => newPet('p', 'Pip', 'ginger', NOON, 'UTC');
const sub = (s: string) => (SUBJECTS as readonly string[]).indexOf(s);

test('a phrase travels as five characters and reads back as a sentence about her place', () => {
  const ph = { o: OPENERS.indexOf('Wow,'), s: sub('#fireplace'), p: PRAISE.indexOf('is so cozy!') };
  const code = phraseCode(ph);
  assert.match(code, /^n[0-9a-z]{4}$/);
  assert.deepEqual(phraseOf(code), ph);
  assert.equal(noteText(code, 'Mochi'), 'Wow, your fireplace is so cozy!');
  // no opener, or one that ends a sentence: the subject starts a new one
  assert.equal(noteText(phraseCode({ o: 0, s: sub('your burrow'), p: 1 }), 'Mochi'), 'Your burrow is lovely!');
  assert.equal(noteText(phraseCode({ o: OPENERS.indexOf('Hi!'), s: sub('{name}'), p: PRAISE.indexOf('is adorable!') }), 'Mochi'), 'Hi! Mochi is adorable!');
  assert.equal(noteText(phraseCode({ o: OPENERS.indexOf('Dear {name},'), s: sub('visiting you'), p: PRAISE.indexOf('made my day!') }), 'Mochi'), 'Dear Mochi, visiting you made my day!');
});

test('codes out of range, or malformed, are not notes', () => {
  assert.equal(phraseOf('n0zz0'), null, 'no such subject');
  assert.equal(phraseOf(`n${OPENERS.length.toString(36)}000`), null, 'no such opener');
  assert.equal(phraseOf('n000'), null);
  assert.equal(isNote('constructor'), false);
  assert.equal(isNote('cozy'), true, 'the old fixed notes still read');
});

test('a visit kind carries the care, the note and the stamp, inside the platform\'s pattern', () => {
  const note = phraseCode({ o: 9, s: SUBJECTS.length - 1, p: PRAISE.length - 1 });
  for (const stamp of STAMPS) {
    const kind = visitKind('snack', note, stamp);
    assert.match(kind, KIND);
    assert.deepEqual(readKind(kind), { care: 'snack', note, stamp });
  }
  assert.equal(visitKind('pat'), 'pat');
  assert.equal(visitKind('pat', null, 'heart'), 'pat-s00');
  assert.equal(visitKind('pat', 'not-a-note'), 'pat', 'only notes we can read go');
  // older visits and older versions
  assert.deepEqual(readKind('snack-cozy'), { care: 'snack', note: 'cozy', stamp: null });
  assert.equal(visitInfo(visitKind('brush', note, 'acorn'))?.need, 'clean', 'an older version still reads the care');
  assert.equal(stampOf(stampCode('goldleaf')), 'goldleaf');
  assert.equal(stampOf('szz'), null);
});

test("she can sign with the free stamps, and with anything she's collected", () => {
  const s = pet();
  assert.deepEqual(stampsFor(s), ['heart', 'clover', 'carrot', 'sparkle', 'strawberry']);
  s.collection = { acorn: 2, moonstone: 1, pebble: 0 };
  assert.deepEqual(stampsFor(s).slice(5), ['acorn', 'moonstone']);
});

test('subjects for a friend: the general ones that fit, then their own pieces', () => {
  const plain = subjectsFor({ items: [] });
  assert.ok(plain.includes(sub('your burrow')) && !plain.includes(sub('your garden')), 'no garden shared, none offered');
  const theirs = subjectsFor({ items: [{ id: 'fireplace' }, { id: 'fireplace' }, { id: 'nonsense' }], garden: { meadow: [], yard: { patch: 1 } } });
  assert.ok(theirs.includes(sub('your garden')) && theirs.includes(sub('your meadow')) && theirs.includes(sub('your yard')));
  assert.equal(theirs.filter((i) => i === sub('#fireplace')).length, 1, 'each piece once; unknown ones left out');
});

test('pins: toggled, at most four, the oldest goes; a pinned signature is never trimmed from the book', () => {
  let pins = togglePin(undefined, 'a');
  for (const u of ['b', 'c', 'd', 'e']) pins = togglePin(pins, u);
  assert.deepEqual(pins, ['b', 'c', 'd', 'e']);
  assert.equal(pins.length, MAX_PINS);
  assert.deepEqual(togglePin(pins, 'c'), ['b', 'd', 'e']);

  const entry = (i: number): GuestEntry => ({ visitUuid: `v${i}`, atMs: NOON + i, from: 'u', rabbit: 'R', care: 'pat', note: 'cozy' });
  let j: Journal = { v: 1, rev: 0, entries: [], firsts: [], guestbook: [entry(0)], pinned: ['v0'] };
  j = signGuestbook(j, Array.from({ length: GUESTBOOK_MAX + 5 }, (_, i) => entry(i + 1)));
  assert.equal(j.guestbook!.length, GUESTBOOK_MAX + 1);
  assert.ok(j.guestbook!.some((g) => g.visitUuid === 'v0'), 'the oldest, pinned, is kept');
  assert.ok(!j.guestbook!.some((g) => g.visitUuid === 'v1'), 'the next oldest is trimmed');
});

test('pins and cover go in her snapshot, and a friend\'s are checked on the way in', () => {
  const s = pet();
  s.covers = ['berry'];
  s.cover = 'berry';
  const pins = [{ r: 'Bun', n: 'cozy', s: 'acorn', c: 'snow' as const }];
  const d = readShowcase(JSON.parse(JSON.stringify(buildShowcase(s, starterBurrow(), pins))));
  assert.deepEqual(d?.pinned, pins);
  assert.equal(d?.cover, 'berry');
  assert.deepEqual(readPins([{ r: 'x'.repeat(40), n: 'n0zz0' }, { r: 'Ok', n: 'sweet', s: 'nope', c: 'plaid' }, ...Array(9).fill({ r: 'A', n: 'cozy' })]),
    [{ r: 'Ok', n: 'sweet' }, { r: 'A', n: 'cozy' }, { r: 'A', n: 'cozy' }], 'unreadable notes dropped, bad stamps and coats too, four at most');
  const plain = readShowcase(JSON.parse(JSON.stringify(buildShowcase(pet(), starterBurrow()))));
  assert.equal(plain?.pinned, undefined);
  assert.equal(plain?.cover, undefined, 'the classic cover goes without saying');
});

test('covers: the classic is free; others are bought once, then swapped freely', () => {
  let s = pet();
  assert.equal(coverOf(s), 'classic');
  s.clover = 100;
  assert.deepEqual(buyCover(s, 'meadow'), { ok: false, reason: 'broke' });
  s.clover = 1000;
  const r = buyCover(s, 'meadow');
  assert.ok(r.ok);
  s = r.state;
  assert.equal(s.clover, 700);
  assert.equal(coverOf(s), 'meadow');
  assert.deepEqual(buyCover(s, 'meadow'), { ok: false, reason: 'owned' });
  s = useCover(s, 'classic');
  assert.equal(coverOf(s), 'classic');
  assert.equal(coverOf(useCover(s, 'snowy')), 'classic', "can't put on one she hasn't bought");
});
