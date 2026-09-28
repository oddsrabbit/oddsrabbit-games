// Friends' rabbits taking turns in her burrow (docs/rabbit-pets-visits.md §1).
// A guest arrives when she first sees the visit, stays GUESTS.stayMs, then
// hops home; at most GUESTS.atOnce are in at a time and the rest wait for a
// place, first seen first in. Worked out from each visit's seenAt, so it's the
// same on every open and on every device.

import { guestsToShow, type ShowcaseData, type VisitIn } from './social';
import { GUESTS } from './tuning';

export interface GuestTurn { visit: VisitIn; data: ShowcaseData; fromMs: number; untilMs: number }

/** Today's guests (one per friend, social.ts guestsToShow), each with its turn. */
export function guestTurns(visits: VisitIn[], nowMs: number, tz: string): GuestTurn[] {
  // a visit not marked seen yet is being seen now
  const seenMs = (v: VisitIn) => (v.seenAt ? Date.parse(v.seenAt) : NaN) || nowMs;
  const queue = guestsToShow(visits, nowMs, tz).sort((a, b) =>
    seenMs(a.visit) - seenMs(b.visit)
    || Date.parse(a.visit.visitedAt) - Date.parse(b.visit.visitedAt)
    || (a.visit.visitUuid < b.visit.visitUuid ? -1 : 1));
  const freeAt = Array<number>(GUESTS.atOnce).fill(-Infinity);
  return queue.map((g) => {
    let i = 0;
    for (let j = 1; j < freeAt.length; j++) if (freeAt[j]! < freeAt[i]!) i = j;
    const fromMs = Math.max(seenMs(g.visit), freeAt[i]!);
    const untilMs = fromMs + GUESTS.stayMs;
    freeAt[i] = untilMs;
    return { ...g, fromMs, untilMs };
  });
}

/** The guests in the burrow at a moment, in the order they came in. */
export function guestsHere(turns: GuestTurn[], nowMs: number): GuestTurn[] {
  return turns.filter((t) => t.fromMs <= nowMs && nowMs < t.untilMs);
}
