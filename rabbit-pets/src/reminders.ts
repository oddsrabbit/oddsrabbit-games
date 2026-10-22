// Which reminders should exist right now, and bringing the server in line with
// that. Each visit decides the full desired set; anything scheduled that is no
// longer wanted is cancelled. One key per kind, so rescheduling replaces.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { nextLocalHour } from './localtime';
import { onVacation, plots, type CropId } from './extras';
import { giftReady, timer, type PetState } from './sim';
import { trip } from './forage';
import type { Settings } from './store';
import { DAY_MS, DAY_ROLLOVER_HOUR, GIFT_REMINDER_HOUR } from './tuning';

// At most five are ever wanted at once: she can't be asleep and out foraging together.
export const REMINDER_KEYS = ['nap-done', 'treat-ready', 'daily-gift', 'misses-you', 'garden-ready', 'forage-home'] as const;
export type ReminderKey = (typeof REMINDER_KEYS)[number];

/** Each kind, as the Settings sheet lists it, in the order it lists them. */
export const REMINDER_KINDS: { key: ReminderKey; label: string; sub: string }[] = [
  { key: 'daily-gift', label: 'Daily gift', sub: 'In the morning, when her gift is ready' },
  { key: 'forage-home', label: 'Home from foraging', sub: 'When she\'s back with her basket' },
  { key: 'nap-done', label: 'Awake', sub: 'When she wakes up from a sleep' },
  { key: 'treat-ready', label: 'Treat baked', sub: 'When a treat comes out of the oven' },
  { key: 'garden-ready', label: 'Garden', sub: 'When something is ready to pick' },
  { key: 'misses-you', label: 'Misses you', sub: 'After a day away, and when she\'s home from a holiday' },
];

export interface Reminder {
  key: ReminderKey;
  fireAtMs: number;
  body: string;
}

const READY_LINE: Record<CropId, string> = {
  berry: 'The strawberries are ripe in the garden.',
  golden: 'A golden carrot is ready to pull up.',
  sprout: 'The clover sprouts are ready to pick.',
};

/** Pure: what the game would like scheduled, given her state now. */
export function desiredReminders(pet: PetState, nowMs: number, tz: string): Reminder[] {
  const out: Reminder[] = [];
  // On vacation she's in good hands: one note for when she's home again.
  if (onVacation(pet, nowMs)) {
    return [{ key: 'misses-you', fireAtMs: pet.vacationUntilMs!, body: `${pet.name} is home from her holiday.` }];
  }
  const nap = timer(pet, 'nap');
  if (nap && nap.endsAtMs > nowMs) out.push({ key: 'nap-done', fireAtMs: nap.endsAtMs, body: `${pet.name} is awake and wants to play.` });
  const away = trip(pet);
  if (away && away.endsAtMs > nowMs) out.push({ key: 'forage-home', fireAtMs: away.endsAtMs, body: `${pet.name} is home with a basket of finds.` });
  const bake = timer(pet, 'bake');
  if (bake && bake.endsAtMs > nowMs) out.push({ key: 'treat-ready', fireAtMs: bake.endsAtMs, body: 'Something smells good in the burrow.' });
  // Only tomorrow's gift: today's, if unclaimed, is already waiting on screen.
  // It's ready at the rollover but announced later that morning.
  if (!giftReady(pet, nowMs, tz)) {
    const readyAtMs = nextLocalHour(nowMs, tz, DAY_ROLLOVER_HOUR);
    out.push({ key: 'daily-gift', fireAtMs: nextLocalHour(readyAtMs, tz, GIFT_REMINDER_HOUR), body: `${pet.name} found you a gift.` });
  }
  const growing = plots(pet).filter((p) => p && p.readyAtMs > nowMs).sort((a, b) => a!.readyAtMs - b!.readyAtMs)[0];
  if (growing) out.push({ key: 'garden-ready', fireAtMs: growing.readyAtMs, body: READY_LINE[growing.crop] });
  out.push({ key: 'misses-you', fireAtMs: nowMs + DAY_MS, body: `${pet.name} keeps looking at the door.` });
  return out;
}

/** How far a desired time may drift from the scheduled one before it's resent. */
const TOLERANCE_MS: Record<ReminderKey, number> = {
  'nap-done': 60_000,
  'treat-ready': 60_000,
  'daily-gift': 10 * 60_000,
  'misses-you': 3 * 60 * 60_000,
  'garden-ready': 5 * 60_000,
  'forage-home': 60_000,
};

/**
 * Bring the server's pending reminders in line with `desired`. Returns the
 * updated `scheduled` map; callers save it. Refusals (e.g. a time too close)
 * are skipped, not retried.
 */
export async function reconcile(
  OR: OddsRabbitGlobal,
  settings: Settings,
  desired: Reminder[],
  nowMs: number
): Promise<Record<string, string>> {
  const scheduled = { ...settings.scheduled };
  const quiet = new Set(settings.quiet ?? []);
  const want = settings.reminders === 'on' ? desired.filter((r) => !quiet.has(r.key)) : [];
  const wantKeys = new Set(want.map((r) => r.key));

  for (const key of Object.keys(scheduled)) {
    if (wantKeys.has(key as ReminderKey)) continue;
    try {
      await OR.notifications.cancel(key);
    } catch {
      /* already gone, or the host can't; forget it either way */
    }
    delete scheduled[key];
  }

  for (const r of want) {
    if (r.fireAtMs < nowMs + 90_000) continue;
    const prev = scheduled[r.key];
    if (prev && Math.abs(Date.parse(prev) - r.fireAtMs) <= TOLERANCE_MS[r.key]) continue;
    try {
      const res = await OR.notifications.schedule({ key: r.key, fireAt: r.fireAtMs, title: 'Rabbit Pets', body: r.body });
      scheduled[r.key] = res.fireAt;
    } catch {
      /* per-call refusal: leave it unscheduled */
    }
  }
  return scheduled;
}
