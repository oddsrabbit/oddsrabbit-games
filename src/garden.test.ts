import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AREA_W, areaAt, areaX, BUILDING_SPOTS, gardenView, GROUND, hitBox, hitTest, HIT, PLOT_SPOTS, SHED_SPOT, STRIP_H, STRIP_W,
  type Box, type GardenThing,
} from './garden';
import { newPet, type PetState } from './sim';
import { HOUR_MS } from './tuning';
import { BUILDING_IDS, BUILDINGS } from './yard';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);

function pet(): PetState {
  return newPet('garden-pet', 'Clover', 'snow', NOON, UTC);
}
/** Mid-game, as in the mocks: three plots, 5 patches, 2 hives. */
function midGame(): PetState {
  const s = pet();
  s.upgrades = ['plot2', 'plot3'];
  s.garden = { plots: [{ crop: 'berry', plantedAtMs: NOON - 9 * HOUR_MS, readyAtMs: NOON - HOUR_MS }, { crop: 'golden', plantedAtMs: NOON, readyAtMs: NOON + 7 * HOUR_MS }, null] };
  s.yard = { counts: { patch: 5, hive: 2 }, sheds: 0, stored: 43, atMs: NOON };
  return s;
}

const allBoxes = (): { name: string; box: Box }[] => [
  ...PLOT_SPOTS.map((s, i) => ({ name: `plot ${i}`, box: hitBox('plot', s) })),
  ...BUILDING_IDS.flatMap((id) => BUILDING_SPOTS[id].map((s, i) => ({ name: `${id} ${i}`, box: hitBox(id, s) }))),
  { name: 'shed', box: hitBox('shed', SHED_SPOT) },
];

const stateOf = (v: GardenThing[], pick: (t: GardenThing) => boolean) => v.filter(pick).map((t) => t.state);

test('three areas, each one burrow-width, left to right', () => {
  assert.equal(STRIP_W, 3 * AREA_W);
  assert.deepEqual([areaX('patch'), areaX('yard'), areaX('meadow')], [0, AREA_W, 2 * AREA_W]);
  assert.equal(areaAt(0), 'patch');
  assert.equal(areaAt(AREA_W - 1), 'patch');
  assert.equal(areaAt(AREA_W), 'yard');
  assert.equal(areaAt(STRIP_W + 50), 'meadow', 'clamped');
  assert.equal(areaAt(-5), 'patch', 'clamped');
});

test('one spot per plot and per building a kind allows', () => {
  assert.equal(PLOT_SPOTS.length, 5);
  for (const id of BUILDING_IDS) assert.equal(BUILDING_SPOTS[id].length, BUILDINGS[id].max, id);
});

test('every tap target sits wholly in its own area, and stands on the grass, not the path', () => {
  for (const { name, box } of allBoxes()) {
    const area = name.startsWith('plot') ? 'patch' : 'yard';
    assert.ok(box.x >= areaX(area) && box.x + box.w <= areaX(area) + AREA_W, `${name} inside ${area}`);
    // where it stands; a tall crop may reach up over the path behind it
    const base = box.y + box.h;
    assert.ok(base > GROUND.fence + 12 && base <= STRIP_H, `${name} on the grass`);
    assert.ok(base <= GROUND.pathY || base > GROUND.pathY + GROUND.pathH, `${name} stands off the path`);
  }
});

test('no two tap targets overlap, and each is at least 12 px wide', () => {
  const boxes = allBoxes();
  for (let i = 0; i < boxes.length; i++) {
    assert.ok(boxes[i]!.box.w >= 12, `${boxes[i]!.name} wide enough`);
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!.box, b = boxes[j]!.box;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${boxes[i]!.name} and ${boxes[j]!.name}`);
    }
  }
  assert.ok(Object.values(HIT).every((h) => h.h >= 7));
});

test('a new rabbit: one empty bed, the rest locked; patches free to build; hives, logs and the shed locked', () => {
  const v = gardenView(pet(), NOON);
  assert.deepEqual(stateOf(v, (t) => t.kind === 'plot').length, 5);
  const plots = v.filter((t): t is Extract<GardenThing, { kind: 'plot' }> => t.kind === 'plot').sort((a, b) => a.index - b.index);
  assert.deepEqual(plots.map((p) => p.state), ['empty', 'locked', 'locked', 'locked', 'locked']);
  assert.ok(stateOf(v, (t) => t.kind === 'building' && t.id === 'patch').every((s) => s === 'free'));
  assert.ok(stateOf(v, (t) => t.kind === 'building' && t.id === 'hive').every((s) => s === 'locked'));
  assert.ok(stateOf(v, (t) => t.kind === 'building' && t.id === 'log').every((s) => s === 'locked'));
  assert.deepEqual(stateOf(v, (t) => t.kind === 'shed'), ['locked']);
});

test('mid-game: buildings fill their spots in order, the rest are free or locked by kind', () => {
  const v = gardenView(midGame(), NOON);
  const of = (id: string) => v.filter((t): t is Extract<GardenThing, { kind: 'building' }> => t.kind === 'building' && t.id === id).sort((a, b) => a.index - b.index).map((t) => t.state);
  assert.deepEqual(of('patch'), [...Array(5).fill('owned'), ...Array(5).fill('free')]);
  assert.deepEqual(of('hive'), ['owned', 'owned', 'free', 'free', 'free']);
  assert.deepEqual(of('log'), Array(5).fill('locked'), 'logs need 5 hives');
  assert.deepEqual(stateOf(v, (t) => t.kind === 'shed'), ['free'], '3 patches open the shed');
  const plots = v.filter((t): t is Extract<GardenThing, { kind: 'plot' }> => t.kind === 'plot').sort((a, b) => a.index - b.index);
  assert.deepEqual(plots.map((p) => p.state), ['ready', 'growing', 'empty', 'locked', 'locked']);
});

test('a crop turns ready at its time', () => {
  const s = midGame();
  const second = (ms: number) => gardenView(s, ms).find((t) => t.kind === 'plot' && t.index === 1)!.state;
  assert.equal(second(NOON + 7 * HOUR_MS - 1), 'growing');
  assert.equal(second(NOON + 7 * HOUR_MS), 'ready');
});

test('the view is ordered back to front', () => {
  const ys = gardenView(midGame(), NOON).map((t) => t.spot.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test('a tap finds what stands there; bare grass and the meadow find nothing', () => {
  const s = midGame();
  const at = (x: number, y: number) => hitTest(s, x, y, NOON);
  const bed0 = PLOT_SPOTS[0]!;
  assert.deepEqual(at(bed0.x, bed0.y - 5), { kind: 'plot', index: 0, spot: bed0, state: 'ready' });
  const hive3 = BUILDING_SPOTS.hive[3]!;
  assert.deepEqual(at(hive3.x, hive3.y - 3), { kind: 'building', id: 'hive', index: 3, spot: hive3, state: 'free' });
  const patch7 = BUILDING_SPOTS.patch[7]!;
  const p = at(patch7.x - 5, patch7.y - 1);
  assert.ok(p && p.kind === 'building' && p.id === 'patch' && p.index === 7);
  assert.equal(at(SHED_SPOT.x, SHED_SPOT.y - 6)?.kind, 'shed');
  assert.equal(at(areaX('meadow') + 40, 100), null);
  assert.equal(at(5, 115), null, 'the corner of the veg patch');
  // just outside a target
  const box = hitBox('hive', hive3);
  assert.equal(at(box.x + box.w, box.y), null);
});
