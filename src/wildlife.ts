// Wild visitors: a hedgehog, a robin, a fox cub... one drops by now and then,
// stays an hour or so, and leaves a little clover, and sometimes a keepsake
// that only it brings (the Woodland keepsakes set on the shelf). Who comes
// depends on the hour, the season and the day's weather. Seeded on
// (petId, stepIndex) like everything else that happens while you're away.
// Pure; the simulation (sim.ts advance) calls it, tested in wildlife.test.ts.

import { dayKey, localHour } from './localtime';
import { roll } from './rng';
import { WILDLIFE } from './tuning';
import { seasonOf, weatherOf, type Season, type Weather } from './world';

export type CritterId = 'hedgehog' | 'robin' | 'mouse' | 'frog' | 'snail' | 'squirrel' | 'owl' | 'fox';

interface Conditions { hour: number; season: Season; weather: Weather }

export interface Critter {
  id: CritterId;
  name: string;
  /** The collectible it sometimes leaves (collectibles.ts, rarity 'keepsake'). */
  keepsake: string;
  /** For the album, before you've met it. */
  hint: string;
  /** How likely it is to be the one, now: 0 means it doesn't come. */
  weight: (c: Conditions) => number;
}

const day = (h: number) => h >= 7 && h < 19;
const dark = (h: number) => h >= 21 || h < 5;

export const CRITTERS: Critter[] = [
  { id: 'hedgehog', name: 'Hedgehog', keepsake: 'quill', hint: 'Comes out in the evening, but not in winter.',
    weight: (c) => ((c.hour >= 18 || c.hour < 6) && c.season !== 'winter' ? 2 : 0) },
  { id: 'robin', name: 'Robin', keepsake: 'rowan', hint: 'A daytime visitor, most of all in winter.',
    weight: (c) => (day(c.hour) ? (c.season === 'winter' ? 4 : 2) : 0) },
  { id: 'mouse', name: 'Field mouse', keepsake: 'thimble', hint: 'Turns up any time, often at night.',
    weight: (c) => (dark(c.hour) ? 3 : 1.5) },
  { id: 'frog', name: 'Frog', keepsake: 'lilypad', hint: 'Loves a rainy day in spring or summer.',
    weight: (c) => (c.weather === 'rain' && (c.season === 'spring' || c.season === 'summer') ? 4 : 0) },
  { id: 'snail', name: 'Snail', keepsake: 'dewdrop', hint: 'Out when it rains.',
    weight: (c) => (c.weather === 'rain' ? 3 : c.weather === 'cloudy' ? 0.5 : 0) },
  { id: 'squirrel', name: 'Squirrel', keepsake: 'hazelnut', hint: 'Busiest on autumn days. Asleep all winter.',
    weight: (c) => (day(c.hour) ? (c.season === 'autumn' ? 4 : c.season === 'winter' ? 0 : 1) : 0) },
  { id: 'owl', name: 'Owl', keepsake: 'moonstone', hint: 'Only after dark.',
    weight: (c) => (dark(c.hour) ? 1.2 : 0) },
  { id: 'fox', name: 'Fox cub', keepsake: 'goldleaf', hint: 'Rare. Seen at dawn and at dusk.',
    weight: (c) => ((c.hour >= 5 && c.hour < 8) || (c.hour >= 17 && c.hour < 20) ? 0.4 : 0) },
];

export function critterById(id: string): Critter | undefined {
  return CRITTERS.find((c) => c.id === id);
}

export function conditionsAt(ms: number, tz: string): Conditions {
  const season = seasonOf(ms, tz);
  return { hour: localHour(ms, tz), season, weather: weatherOf(dayKey(ms, tz, 0), season) };
}

/** Who comes, if one drops by at this step: weighted by the conditions. */
export function critterAt(petId: string, stepIndex: number, c: Conditions): Critter | null {
  const weights = CRITTERS.map((x) => x.weight(c));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = roll(petId, stepIndex, 'critter-who') * total;
  for (let i = 0; i < CRITTERS.length; i++) {
    r -= weights[i]!;
    if (r < 0) return CRITTERS[i]!;
  }
  return null;
}

/** The clover a visit leaves: WILDLIFE.clover, skewed towards the low end. */
export function visitClover(petId: string, stepIndex: number): number {
  const { min, max } = WILDLIFE.clover;
  const r = roll(petId, stepIndex, 'critter-clover');
  return Math.min(max, min + Math.floor((max - min + 1) * r ** 3));
}

export function leavesKeepsake(petId: string, stepIndex: number): boolean {
  return roll(petId, stepIndex, 'critter-keepsake') < WILDLIFE.keepsakeChance;
}

export function stayMs(petId: string, stepIndex: number): number {
  const [lo, hi] = WILDLIFE.stayMs;
  return lo + Math.round(roll(petId, stepIndex, 'critter-stay') * (hi - lo));
}
