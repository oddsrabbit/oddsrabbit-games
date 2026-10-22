// Things that come from what day it is, not from what the player did: the
// season, the day's weather, limited-time events. All pure and deterministic,
// so everyone sees the same weather on the same day.

import { localParts } from './localtime';
import { roll } from './rng';

// ---------------------------------------------------------------- seasons

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Meteorological seasons, northern hemisphere. */
export function seasonOf(ms: number, tz: string): Season {
  const m = localParts(ms, tz).month;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// ---------------------------------------------------------------- weather

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'leaves';

/**
 * The day's weather, the same for everyone: rolled from the date alone.
 * Snow only in winter, falling leaves only in autumn.
 */
export function weatherOf(dayKey: string, season: Season): Weather {
  const r = roll('weather', dayNumber(dayKey));
  const table: [Weather, number][] =
    season === 'winter' ? [['snow', 0.35], ['cloudy', 0.3], ['sunny', 0.35]]
      : season === 'autumn' ? [['leaves', 0.3], ['rain', 0.25], ['cloudy', 0.2], ['sunny', 0.25]]
        : season === 'spring' ? [['rain', 0.3], ['cloudy', 0.2], ['sunny', 0.5]]
          : [['sunny', 0.65], ['cloudy', 0.2], ['rain', 0.15]];
  let acc = 0;
  for (const [w, p] of table) { acc += p; if (r < acc) return w; }
  return 'sunny';
}

export const WEATHER_NAME: Record<Weather, string> = {
  sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rainy', snow: 'Snowy', leaves: 'Blustery',
};

/** After dark a sunny day is a clear night: the header shouldn't say "Sunny" under the stars. */
const NIGHT_WEATHER_NAME: Record<Weather, string> = {
  sunny: 'Clear night', cloudy: 'Cloudy night', rain: 'Rainy night', snow: 'Snowy night', leaves: 'Blustery night',
};

export function weatherName(weather: Weather, night: boolean): string {
  return (night ? NIGHT_WEATHER_NAME : WEATHER_NAME)[weather];
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(isoDate + 'T00:00:00Z') / 86_400_000);
}

// ---------------------------------------------------------------- events

export interface SeasonalEvent {
  id: string;
  name: string;
  /** Inclusive month/day window, local time; may wrap the new year. */
  from: [number, number];
  to: [number, number];
  blurb: string;
  /** Limited decor sold during the event. */
  decor: string[];
  /** Limited outfits sold during the event. */
  outfits: string[];
  /** A free item handed out once per event, for opening the game while it runs. */
  gift?: { kind: 'outfit' | 'decor'; id: string };
  /** Collectibles she finds more often while it runs (collectibles.ts). */
  finds: string[];
  /** The festival raffle's prize, an outfit only ever won (raffle.ts). */
  raffle?: string;
}

// docs/rabbit-pets-economy.md §3.3. Past items come back every year.
export const EVENTS: SeasonalEvent[] = [
  { id: 'snowday', name: 'Snow day', from: [2, 1], to: [2, 28], blurb: 'Snow outside! Earmuffs on the house, and a sled and a snow rabbit in the shop.',
    decor: ['sled', 'snowman', 'icicles'], outfits: [], gift: { kind: 'outfit', id: 'earmuffs' }, finds: ['snowflake', 'mitten', 'icicle', 'snowball'], raffle: 'flakeclip' },
  { id: 'bloom', name: 'Spring bloom', from: [4, 1], to: [4, 30], blurb: 'Flowers everywhere. A daisy chain on the house.',
    decor: ['tulips', 'birdhouse', 'blossom'], outfits: ['flowercrown'], gift: { kind: 'outfit', id: 'daisychain' }, finds: ['petal', 'bee', 'robinegg', 'ladybug'], raffle: 'beeclip' },
  { id: 'summer', name: 'Summer fair', from: [7, 1], to: [7, 31], blurb: 'The fair is here. A paper fan on the house.',
    decor: ['fairlights', 'lemonade', 'pool'], outfits: ['strawhat'], gift: { kind: 'decor', id: 'fan' }, finds: ['firefly', 'cherry', 'butterfly', 'daisy'], raffle: 'lei' },
  { id: 'harvest', name: 'Harvest moon', from: [9, 15], to: [10, 15], blurb: 'Pumpkins are in! An acorn cap on the house.',
    decor: ['pumpkin', 'applecrate', 'scarecrow'], outfits: [], gift: { kind: 'outfit', id: 'acorncap' }, finds: ['maple', 'conker', 'chestnut', 'wheat'], raffle: 'leafclip' },
  { id: 'spooky', name: 'Spooky week', from: [10, 20], to: [11, 2], blurb: 'A friendly jack-o-lantern, a little witch hat, and a candy basket on the house.',
    decor: ['jackolantern', 'ghost'], outfits: ['witchhat'], gift: { kind: 'decor', id: 'candybasket' }, finds: ['candy', 'bat', 'cobweb', 'owlfeather'], raffle: 'batclip' },
  { id: 'winterfest', name: 'Winterfest', from: [12, 10], to: [1, 5], blurb: 'A snow globe and a tiny tree for the burrow, and a cozy scarf, on the house.',
    decor: ['snowglobe', 'tinytree', 'stockings'], outfits: [], gift: { kind: 'outfit', id: 'redscarf' }, finds: ['jingle', 'candycane', 'gingerbread', 'holly'], raffle: 'startopper' },
];

function inWindow(month: number, day: number, from: [number, number], to: [number, number]): boolean {
  const v = month * 100 + day;
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export function activeEvents(ms: number, tz: string): SeasonalEvent[] {
  const p = localParts(ms, tz);
  return EVENTS.filter((e) => inWindow(p.month, p.day, e.from, e.to));
}

/** Whole days left in a running event, counting today: 1 on its last day. */
export function daysLeft(e: SeasonalEvent, ms: number, tz: string): number {
  const p = localParts(ms, tz);
  // a window that wraps the new year (Winterfest) ends next year while it's still December
  const endYear = e.to[0] * 100 + e.to[1] < p.month * 100 + p.day ? p.year + 1 : p.year;
  return Math.round((Date.UTC(endYear, e.to[0] - 1, e.to[1]) - Date.UTC(p.year, p.month - 1, p.day)) / 864e5) + 1;
}

/** A limited item is for sale only while one of its events is running. */
export function limitedAvailable(itemId: string, ms: number, tz: string): boolean {
  const owner = EVENTS.filter((e) => e.decor.includes(itemId) || e.outfits.includes(itemId));
  if (!owner.length) return true;
  return activeEvents(ms, tz).some((e) => owner.includes(e));
}
