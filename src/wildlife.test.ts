import assert from 'node:assert/strict';
import test from 'node:test';

import { startVacation } from './extras';
import { advance, newPet, type PetEvent } from './sim';
import { DAY_MS, WILDLIFE } from './tuning';
import { CRITTERS, critterAt, visitClover } from './wildlife';

const UTC = 'UTC';
const NOON = Date.UTC(2026, 8, 24, 12, 0);
/** Advance day by day (a single catch-up replays at most a week), collecting events. */
function live(s0: ReturnType<typeof newPet>, days: number) {
  let state = s0;
  const events: PetEvent[] = [];
  for (let d = 1; d <= days; d++) { const r = advance(state, NOON + d * DAY_MS, UTC); state = r.state; events.push(...r.events); }
  return { state, events };
}
const critters = (events: PetEvent[]) => events.filter((e): e is Extract<PetEvent, { kind: 'critter' }> => e.kind === 'critter');

test('about 1.3 visitors a day, each leaving 2 to 10 clover, mostly 2 or 3', () => {
  const { state, events } = live(newPet('wild', 'Mochi', 'snow', NOON, UTC), 60);
  const v = critters(events);
  assert.ok(v.length > 55 && v.length < 110, `${v.length} visits in 60 days`);
  assert.ok(v.every((e) => e.clover >= WILDLIFE.clover.min && e.clover <= WILDLIFE.clover.max));
  const low = v.filter((e) => e.clover <= 3).length;
  assert.ok(low / v.length > 0.5, 'mostly the low end');
  const seen = Object.values(state.critters!.seen).reduce((a, b) => a + b, 0);
  assert.equal(seen, v.length);
  // keepsakes land on the shelf
  for (const e of v.filter((e) => e.keepsake)) assert.ok((state.collection?.[e.keepsake!] ?? 0) > 0);
});

test('visitors replay the same on any device, and never come while she is on holiday', () => {
  const start = newPet('wild2', 'Mochi', 'snow', NOON, UTC);
  const whole = advance(start, NOON + 6 * DAY_MS, UTC);
  let parts = start;
  for (let t = NOON; t < NOON + 6 * DAY_MS; t += 7 * 3_600_000 + 1234) parts = advance(parts, t, UTC).state;
  parts = advance(parts, NOON + 6 * DAY_MS, UTC).state;
  assert.ok(critters(whole.events).length > 0);
  assert.deepEqual(parts.critters, whole.state.critters);
  const away = advance(startVacation(start, 10, NOON), NOON + 9 * DAY_MS, UTC);
  assert.equal(critters(away.events).length, 0);
});

test('who comes depends on the hour, the season and the weather', () => {
  const at = (hour: number, season: 'spring' | 'summer' | 'autumn' | 'winter', weather: 'sunny' | 'rain' | 'snow' | 'cloudy' | 'leaves') => {
    const got = new Set<string>();
    for (let i = 0; i < 2000; i++) { const c = critterAt('p', i, { hour, season, weather }); if (c) got.add(c.id); }
    return got;
  };
  const rainySpringDay = at(12, 'spring', 'rain');
  assert.ok(rainySpringDay.has('frog') && rainySpringDay.has('snail'));
  assert.ok(!rainySpringDay.has('owl') && !rainySpringDay.has('hedgehog'));
  const winterNight = at(23, 'winter', 'snow');
  assert.ok(winterNight.has('owl') && winterNight.has('mouse'));
  assert.ok(!winterNight.has('hedgehog') && !winterNight.has('frog'), 'hedgehogs hibernate');
  assert.ok(at(6, 'summer', 'sunny').has('fox'), 'the fox, at dawn');
  // everyone can be met somewhere in the year
  const all = new Set<string>();
  for (const h of [6, 12, 18, 23]) for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) for (const w of ['sunny', 'rain'] as const) for (const c of at(h, s, w)) all.add(c);
  assert.deepEqual([...all].sort(), CRITTERS.map((c) => c.id).sort());
});

test('a 10 is rare but possible', () => {
  const counts = new Map<number, number>();
  for (let i = 0; i < 20_000; i++) { const n = visitClover('p', i); counts.set(n, (counts.get(n) ?? 0) + 1); }
  assert.ok((counts.get(10) ?? 0) > 0);
  assert.ok((counts.get(10) ?? 0) < (counts.get(2) ?? 0) / 5);
});
