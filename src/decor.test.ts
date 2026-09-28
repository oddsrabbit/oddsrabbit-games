import assert from 'node:assert/strict';
import test from 'node:test';

import { addStarterLantern, burrowForSave, canDig, clampToZone, digRoom, hasBed, hasLantern, inRoom, readBurrow, roomsOf, starterBurrow, ZONES } from './decor';

test('positions are clamped to their zone and rounded to whole pixels', () => {
  assert.deepEqual(clampToZone('floor', -20, 500), { x: ZONES.floor.minX, y: ZONES.floor.maxY });
  assert.deepEqual(clampToZone('hang', 50.4, 20.6), { x: 50, y: 21 });
  assert.deepEqual(clampToZone('rug', 49, 0), { x: 49, y: ZONES.rug.minY });
});

test('a v1 save with fixed slots becomes free positions', () => {
  const b = readBurrow({
    v: 1,
    rev: 4,
    items: [
      { uid: 'a', id: 'cushion', slot: 'b2' },
      { uid: 'b', id: 'lantern', slot: 'h2' },
      { uid: 'c', id: 'rug', slot: null },
      { uid: 'd', id: 'no-such-thing', slot: 'b1' },
    ],
  });
  assert.ok(b);
  assert.equal(b.v, 2);
  assert.equal(b.rev, 4);
  assert.deepEqual(b.items, [
    { uid: 'a', id: 'cushion', x: 70, y: 99, flip: false, placed: true },
    { uid: 'b', id: 'lantern', x: 64, y: 13, flip: false, placed: true },
    { uid: 'c', id: 'rug', x: ZONES.rug.x, y: ZONES.rug.y, flip: false, placed: false },
  ]);
});

test('a new burrow has a plant, a lantern in storage and no bed', () => {
  const b = starterBurrow();
  assert.deepEqual(b.items.map((i) => [i.id, i.placed]), [['plant', true], ['lantern', false]]);
  assert.equal(hasLantern(b), false, 'a lantern in storage is not hung');
  assert.equal(hasBed(b), false);
  b.items.push({ uid: 'c', id: 'cushion', x: 70, y: 99, flip: false, placed: false });
  assert.equal(hasBed(b), false, 'a bed in storage does not count');
  b.items[2]!.placed = true;
  assert.equal(hasBed(b), true);
  b.items[1]!.placed = true;
  assert.equal(hasLantern(b), true);
});

test('an older burrow gets the starter lantern once, and not if it has one', () => {
  const b = starterBurrow();
  b.items = b.items.filter((i) => i.id !== 'lantern');
  assert.equal(addStarterLantern(b), true);
  assert.equal(addStarterLantern(b), false);
  assert.equal(b.items.filter((i) => i.id === 'lantern').length, 1);
});

test('a v2 save round-trips, with positions re-clamped', () => {
  const s = starterBurrow();
  s.items.push({ uid: 'c', id: 'cushion', x: 70, y: 99, flip: false, placed: true });
  s.items[0]!.x = 999;
  const b = readBurrow(JSON.parse(JSON.stringify(s)));
  assert.ok(b);
  assert.equal(b.items[0]!.x, ZONES.floor.maxX);
  assert.equal(b.items[2]!.placed, true);
});

test('malformed saves are rejected', () => {
  assert.equal(readBurrow(null), null);
  assert.equal(readBurrow({ v: 3, items: [] }), null);
  assert.equal(readBurrow({ v: 2 }), null);
});

test('dug-out rooms: their pieces are saved under the room, read back tagged, and put-away pieces belong to none', () => {
  let b = starterBurrow();
  assert.deepEqual(roomsOf(b), ['main']);
  assert.equal(canDig(b, 'loft'), false, 'the nook comes first');
  b = digRoom(b, 'nook');
  assert.deepEqual(roomsOf(b), ['main', 'nook']);
  assert.equal(canDig(b, 'loft'), true);
  b.items.push({ uid: 'n1', id: 'plant', x: 30, y: 104, flip: true, placed: true, room: 'nook' });
  b.items.push({ uid: 'n2', id: 'jar', x: 40, y: 104, flip: false, placed: false, room: 'nook' });
  const saved = JSON.parse(JSON.stringify(burrowForSave(b)));
  assert.deepEqual(saved.rooms.nook.items, [{ uid: 'n1', id: 'plant', x: 30, y: 104, flip: true, placed: true }]);
  assert.ok(saved.items.some((i: { uid: string; room?: string }) => i.uid === 'n2' && !i.room), 'put away: kept with the rest, in no room');
  const back = readBurrow(saved)!;
  assert.equal(back.items.find((i) => i.uid === 'n1')?.room, 'nook');
  assert.deepEqual(inRoom(back, 'nook').items.filter((i) => i.placed).map((i) => i.uid), ['n1']);
  assert.ok(!inRoom(back, 'main').items.some((i) => i.uid === 'n1'), 'not in the first room');
  // a piece a newer version put in the nook, and a field it gave the room, come back untouched
  saved.rooms.nook.items.push({ uid: 'z', id: 'hammock', x: 1, y: 1, flip: false, placed: true });
  saved.rooms.nook.light = 'dim';
  const again = JSON.parse(JSON.stringify(burrowForSave(readBurrow(saved)!)));
  assert.deepEqual(again.rooms.nook.items.map((i: { uid: string }) => i.uid), ['n1', 'z']);
  assert.equal(again.rooms.nook.light, 'dim');
});

test('a plain burrow still saves with no rooms at all', () => {
  const saved = JSON.parse(JSON.stringify(burrowForSave(starterBurrow())));
  assert.equal('rooms' in saved, false);
});
