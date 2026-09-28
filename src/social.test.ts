import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOG, digRoom, starterBurrow } from './decor';
import { newPet, type PetState } from './sim';
import { applyGift, applyVisits, buildShowcase, careHint, friendNeeds, friendRank, buyWelcome, findGiftKind, GIFT_KINDS, takeGolden, visitPay, welcomeLevel, findOfGift, friendGardenPet, giftInfo, giveFind, guestsToShow, noteOf, noteText, readShowcase, rewardGiftSent, rewardVisit, showcaseSignature, spareFinds, visitInfo, visitKind } from './social';

const NOON = Date.UTC(2026, 8, 24, 12, 0);
const pet = () => newPet('p1', 'Clover', 'cocoa', NOON, 'UTC');

test('a showcase round-trips through a friend reading it', () => {
  const d = buildShowcase(pet(), starterBurrow());
  const back = readShowcase(JSON.parse(JSON.stringify(d)));
  // Everything but her widget portrait, which is hers alone.
  const { widget, ...forFriends } = d;
  assert.ok(widget);
  assert.deepEqual(back, forFriends);
  assert.ok(JSON.stringify(d).length < 8192);
});

test("a friend's snapshot is checked and clamped before it's drawn", () => {
  assert.equal(readShowcase({ v: 1, name: 'X', coat: 'plaid' }), null);
  assert.equal(readShowcase('nope'), null);
  const d = readShowcase({
    v: 1, name: 'A very long rabbit name indeed', coat: 'snow', needs: { hunger: 900, happy: 'x' },
    head: 'crown-of-doom', neck: 'bell', marking: 'heart',
    items: [{ id: 'plant', x: 9999, y: 50 }, { id: 'unknown', x: 1, y: 1 }, null],
  });
  assert.ok(d);
  assert.equal(d.name.length, 16);
  assert.equal(d.needs.hunger, 100);
  assert.equal(d.needs.happy, 70);
  assert.equal(d.head, null);
  assert.equal(d.neck, 'bell');
  assert.equal('marking' in d, false, 'a marking from an older snapshot is ignored');
  assert.deepEqual(d.items, [{ id: 'plant', x: 98, y: 50, flip: false }]);
});

test("a friend's ears come through, and older or odd snapshots read as long", () => {
  const lop = buildShowcase(newPet('p2', 'Bun', 'snow', NOON, 'UTC', 'lop'), starterBurrow());
  assert.equal(lop.ears, 'lop');
  assert.equal(readShowcase(JSON.parse(JSON.stringify(lop)))?.ears, 'lop');
  assert.equal(readShowcase({ v: 1, name: 'Old', coat: 'snow' })?.ears, 'long');
  assert.equal(readShowcase({ v: 1, name: 'Odd', coat: 'snow', ears: 'antennae' })?.ears, 'long');
});

test('needs drifting alone does not call for a new publish', () => {
  const s = pet();
  const a = buildShowcase(s, starterBurrow());
  s.needs.hunger -= 10;
  s.simAtMs += 600_000;
  assert.equal(showcaseSignature(buildShowcase(s, starterBurrow())), showcaseSignature(a));
  s.name = 'Pip';
  assert.notEqual(showcaseSignature(buildShowcase(s, starterBurrow())), showcaseSignature(a));
});

test('gifts are things; a golden carrot, an old clover bundle or an unknown kind gives flat clover', () => {
  const s = pet();
  s.clover = 100;
  const g = (kind: string) => applyGift(s, { kind }, NOON, 'UTC');
  assert.equal(g('golden').state.clover, 130, 'a golden carrot: 30, not boosted');
  assert.equal(g('clover').clover, 5, "a bundle from a friend who hasn't updated");
  assert.equal(g('sparkly-new-thing').clover, 5);
  assert.equal(g('berry').state.pantry?.berries, 1);
  s.needs.happy = 95;
  assert.equal(g('hug').state.needs.happy, 100);
  assert.equal(applyGift(s, { kind: 'golden', counts: false }, NOON, 'UTC').clover, 0, "a sender who doesn't count pays nothing");
  assert.deepEqual(GIFT_KINDS, ['golden', 'berry', 'hug'], 'the bundle is no longer sent');
});

test('only the first 5 clover gifts a day pay, and sending one pays nothing', () => {
  let s = pet();
  const got: number[] = [];
  for (let i = 0; i < 7; i++) {
    const r = applyGift(s, { kind: 'golden', from: `f${i}` }, NOON, 'UTC');
    got.push(r.clover);
    s = r.state;
  }
  assert.deepEqual(got, [30, 30, 30, 30, 30, 0, 0]);
  assert.equal(rewardGiftSent(s, 'f1', NOON, 'UTC').clover, 0);
  assert.equal(applyGift(s, { kind: 'golden' }, NOON + 86_400_000, 'UTC').clover, 30, 'a new day');
  const withCarrot = { ...pet(), pantry: { berries: 0, golden: 1 } };
  assert.equal(takeGolden(withCarrot)?.pantry?.golden, 0);
  assert.equal(takeGolden(pet()), null);
});

test('a visit pays a flat 5 to the visitor, plus 3 for each welcome piece they have, for their first 5 a day', () => {
  let s = pet();
  s.clover = 0;
  s.bond = 10_000; // a high clover rate: visits aren't boosted
  const got: number[] = [];
  for (let i = 0; i < 6; i++) { const r = rewardVisit(s, `f${i}`, NOON, 'UTC'); got.push(r.clover); s = r.state; }
  assert.deepEqual(got, [5, 5, 5, 5, 5, 0]);
  const welcomed = { ...pet(), clover: 100_000 };
  let w: PetState = welcomed;
  for (let i = 0; i < 5; i++) { const r = buyWelcome(w); assert.ok(r.ok); w = r.state; }
  assert.equal(welcomeLevel(w), 5);
  assert.equal(visitPay(w), 20);
  assert.equal(w.clover, 100_000 - 47_000);
  assert.deepEqual(buyWelcome(w), { ok: false, reason: 'done' });
  assert.equal(rewardVisit(w, 'f', NOON, 'UTC').clover, 20);
});

test('visits seen: the first 3 a day boost her, the first 5 pay the host, and odd senders pay nothing', () => {
  const s = pet();
  s.needs = { hunger: 50, happy: 50, energy: 50, clean: 50 };
  const v = (i: number, kind: string, counts = true) => ({
    visitUuid: `v${i}`, kind, visitedAt: new Date(NOON - i * 60_000).toISOString(), seenAt: null, from: { uuid: `f${i}`, username: `u${i}` }, showcase: null, counts,
  });
  const r = applyVisits(s, [v(1, 'snack'), v(2, 'pat'), v(3, 'brush'), v(4, 'snack'), v(5, 'pat', false)], NOON, 'UTC');
  assert.equal(r.cared, 3);
  assert.deepEqual(r.state.needs, { hunger: 58, happy: 58, energy: 50, clean: 58 });
  assert.equal(r.clover, 20, '4 counting visits × 5 (flat)');
});

test('guests: unseen visits and ones seen today, one per friend, newest first', () => {
  const b = starterBurrow();
  const snap = JSON.parse(JSON.stringify(buildShowcase(pet(), b)));
  const at = (h: number) => new Date(NOON + h * 3_600_000).toISOString();
  const guests = guestsToShow([
    { visitUuid: 'a', kind: 'pat', visitedAt: at(-1), seenAt: null, from: { uuid: 'x', username: 'x' }, showcase: snap },
    { visitUuid: 'b', kind: 'snack', visitedAt: at(-2), seenAt: at(-1), from: { uuid: 'x', username: 'x' }, showcase: snap },
    { visitUuid: 'c', kind: 'brush', visitedAt: at(-30), seenAt: at(-29), from: { uuid: 'y', username: 'y' }, showcase: snap },
    { visitUuid: 'd', kind: 'pat', visitedAt: at(-3), seenAt: null, from: { uuid: 'z', username: 'z' }, showcase: null },
  ], NOON, 'UTC');
  assert.deepEqual(guests.map((g) => g.visit.visitUuid), ['a'], 'x once; y seen yesterday; z has no rabbit to draw');
});

test("a friend's visit or gift of a kind we don't know is ignored, even one named like a built-in", () => {
  assert.equal(visitInfo('constructor'), null);
  assert.equal(visitInfo('toString'), null);
  assert.equal(giftInfo('__proto__'), null);
  assert.equal(visitInfo('pat')?.need, 'happy');
  const s = pet();
  s.needs = { hunger: 50, happy: 50, energy: 50, clean: 50 };
  const r = applyVisits(s, [{ visitUuid: 'v', kind: 'constructor', visitedAt: new Date(NOON).toISOString(), seenAt: null, from: { uuid: 'f', username: 'u' }, showcase: null }], NOON, 'UTC');
  assert.equal(r.cared, 0);
  assert.deepEqual(Object.keys(r.state.needs).sort(), ['clean', 'energy', 'happy', 'hunger']);
});

test('guests seen just after 05:00 stay in a zone half an hour off the hour', () => {
  const tz = 'Asia/Kolkata'; // UTC+05:30
  const snap = JSON.parse(JSON.stringify(buildShowcase(pet(), starterBurrow())));
  const at = (local: string) => new Date(Date.parse(`2026-09-24T${local}:00+05:30`)).toISOString();
  const guests = guestsToShow([
    { visitUuid: 'a', kind: 'pat', visitedAt: at('05:05'), seenAt: at('05:10'), from: { uuid: 'x', username: 'x' }, showcase: snap },
  ], Date.parse('2026-09-24T12:00:00+05:30'), tz);
  assert.deepEqual(guests.map((g) => g.visit.visitUuid), ['a']);
});

test('a spare find can go to a friend, and can finish their set', () => {
  // the sender: two felt bats, one cobweb
  const giver = pet();
  giver.collection = { bat: 2, cobweb: 1, pebble: 3 };
  assert.deepEqual(spareFinds(giver).map((c) => c.id), ['bat', 'pebble'], 'more than one only, event finds first');
  assert.equal(giveFind(giver, 'cobweb'), null, 'never her only one');
  const after = giveFind(giver, 'bat')!;
  assert.equal(after.collection!.bat, 1);
  assert.equal(giver.collection.bat, 2, 'the original is untouched');
  // the kind fits the platform's pattern, and reads back
  const kind = findGiftKind('owlfeather');
  assert.match(kind, /^[a-z0-9-]{1,32}$/);
  assert.equal(findOfGift(kind)?.id, 'owlfeather');
  assert.equal(findOfGift('find-nope'), null);
  assert.equal(giftInfo(findGiftKind('bat'))?.name, 'Felt bat');
  // the friend: three of Spooky week's four, missing the bat
  const friend = pet();
  friend.collection = { candy: 1, cobweb: 1, owlfeather: 1 };
  const r = applyGift(friend, { kind: findGiftKind('bat'), from: 'giver' }, NOON, 'UTC');
  assert.equal(r.state.collection!.bat, 1);
  assert.equal(r.clover, 0);
  assert.equal(r.completed?.id, 'spooky');
  // a second bat is just a spare
  assert.equal(applyGift(r.state, { kind: findGiftKind('bat') }, NOON, 'UTC').completed, undefined);
  // a find this version doesn't know (a newer one's) still pays clover, like any unknown gift
  assert.ok(applyGift(friend, { kind: 'find-moonmoth' }, NOON, 'UTC').clover > 0);
});

test("her snapshot lists the finds she hasn't got, and a friend's is checked", () => {
  const s = pet();
  s.collection = { pebble: 1, bat: 2 };
  const d = buildShowcase(s, starterBurrow());
  assert.ok(d.missing!.includes('cobweb'));
  assert.ok(!d.missing!.includes('bat') && !d.missing!.includes('pebble'));
  const back = readShowcase({ ...JSON.parse(JSON.stringify(d)), missing: ['cobweb', '<b>', 7] })!;
  assert.deepEqual(back.missing, ['cobweb']);
  assert.equal(readShowcase({ ...JSON.parse(JSON.stringify(d)), missing: undefined })!.missing, undefined, 'older snapshots: unknown');
});

test('a visit can carry a guest-book note, and older visits still read', () => {
  assert.equal(visitKind('snack', 'cozy'), 'snack-cozy');
  assert.equal(visitKind('pat'), 'pat');
  assert.equal(visitInfo('snack-cozy')?.need, 'hunger', 'the care is still the care');
  assert.equal(noteOf('snack-cozy'), 'cozy');
  assert.equal(noteOf('snack'), null);
  assert.equal(noteOf('snack-constructor'), null);
  assert.equal(noteText('sweet', 'Mochi'), 'Mochi is the sweetest.');
  const s = pet();
  s.needs = { hunger: 50, happy: 50, energy: 50, clean: 50 };
  const r = applyVisits(s, [{ visitUuid: 'v', kind: 'snack-cozy', visitedAt: new Date(NOON).toISOString(), seenAt: null, from: { uuid: 'f', username: 'u' }, showcase: null }], NOON, 'UTC');
  assert.equal(r.state.needs.hunger, 58);
});

test('her garden goes in her snapshot, is checked on the way in, and draws as a stand-in pet', () => {
  const s = pet();
  s.upgrades = ['plot2', 'meadow'];
  s.garden = { plots: [{ crop: 'berry', plantedAtMs: NOON - 1000, readyAtMs: NOON + 1000 }, null] };
  s.yard = { counts: { patch: 3, hive: 1 }, sheds: 1, stored: 5, atMs: NOON };
  const b = starterBurrow();
  b.items.push({ uid: 'm1', id: 'birdbath', x: 230, y: 100, flip: false, placed: true });
  const d = readShowcase(JSON.parse(JSON.stringify(buildShowcase(s, b))))!;
  assert.deepEqual(d.garden!.yard, { patch: 3, hive: 1 });
  assert.equal(d.garden!.plots.length, 2);
  assert.equal(d.garden!.meadow?.[0]?.id, 'birdbath');
  const stub = friendGardenPet(d)!;
  assert.equal(stub.garden!.plots[0]!.crop, 'berry');
  assert.deepEqual(stub.upgrades, ['plot2', 'meadow']);
  // junk from a friend is dropped or clamped
  const junk = readShowcase({ ...JSON.parse(JSON.stringify(d)), garden: { plots: [{ crop: 'weed' }, null, null, null, null, null, null], yard: { patch: 99, dragon: 3 }, sheds: 9, meadow: [{ id: 'plant', x: 1, y: 1 }] } })!;
  assert.equal(junk.garden!.plots.length, 5);
  assert.equal(junk.garden!.plots[0], null);
  assert.deepEqual(junk.garden!.yard, { patch: 10 });
  assert.equal(junk.garden!.sheds, 2);
  assert.deepEqual(junk.garden!.meadow, [], 'indoor decor is not a meadow piece');
  assert.equal(friendGardenPet({ ...d, garden: undefined }), null, 'an older friend: no garden to show');
});

test("her dug-out rooms go in her snapshot, and a full home still fits the platform's limit", () => {
  let b = digRoom(digRoom(starterBurrow(), 'nook'), 'loft');
  const longest = CATALOG.filter((d) => d.zone !== 'lawn' && d.zone !== 'fence').reduce((a, c) => (c.id.length > a.id.length ? c : a)).id;
  b.items = [];
  for (const room of [undefined, 'nook', 'loft'] as const) for (let i = 0; i < 40; i++) {
    b.items.push({ uid: `${room}${i}`, id: longest, x: 90, y: 110, flip: true, placed: true, ...(room ? { room } : {}) });
  }
  const s = pet();
  s.upgrades = ['plot2', 'plot3', 'plot4', 'plot5', 'meadow'];
  s.garden = { plots: Array.from({ length: 5 }, () => ({ crop: 'golden' as const, plantedAtMs: NOON, readyAtMs: NOON + 1 })) };
  const d = buildShowcase(s, b);
  assert.equal(d.items.length, 40);
  assert.equal(d.rooms?.nook?.length, 20, 'each extra room shows at most 20 pieces');
  assert.ok(JSON.stringify(d).length < 8192, `${JSON.stringify(d).length} bytes`);
  const back = readShowcase(JSON.parse(JSON.stringify(d)))!;
  assert.deepEqual(Object.keys(back.rooms ?? {}).sort(), ['loft', 'nook']);
  assert.equal(buildShowcase(pet(), starterBurrow()).rooms, undefined, 'no rooms dug: none sent');
});

test("a friend's needs wear down from their snapshot, and the care that helps most is picked", () => {
  const d = readShowcase({ ...buildShowcase(pet(), starterBurrow()), needs: { hunger: 90, happy: 80, energy: 50, clean: 75 }, simAtMs: NOON });
  assert.ok(d);
  assert.deepEqual(friendNeeds(d, NOON), d.needs);
  const later = friendNeeds(d, NOON + 5 * 3600e3); // hunger and happy 3/h, clean 2/h
  assert.deepEqual([later.hunger, later.happy, later.clean], [75, 65, 65]);
  assert.deepEqual(friendNeeds({ ...d, vacationUntilMs: NOON + 9e9 }, NOON + 5 * 3600e3), d.needs, 'paused on holiday');
  assert.equal(careHint(d.needs), null, 'nothing low: no hint');
  assert.deepEqual(careHint({ hunger: 50, happy: 60, energy: 10, clean: 80 }), { kind: 'snack', word: 'peckish' });
  assert.deepEqual(careHint({ hunger: 90, happy: 90, energy: 10, clean: 40 }), { kind: 'brush', word: 'a bit dusty' }, 'energy has no care');
});

test('friends who came by and are waiting on a visit back come first, and visited ones last', () => {
  assert.equal(friendRank({ visitedYou: true, visited: false }), 0);
  assert.equal(friendRank({ visitedYou: false, visited: false }), 1);
  assert.equal(friendRank({ visitedYou: true, visited: true }), 2);
});
