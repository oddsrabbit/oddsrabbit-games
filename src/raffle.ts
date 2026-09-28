// The festival raffle: during a seasonal event, tickets for a prize outfit
// that can only be won: a chase, for fun. It's kind rather than a gamble:
// the odds are shown and the RAFFLE.guaranteeBy-th ticket always wins, so
// the most it can cost is known up front. Any other ticket is just a miss.
// Seeded on her id and the ticket's number, so reopening
// the game can't re-draw one. The count carries over to next year's event
// until the prize is won. Pure; tested in raffle.test.ts.

import { giveOutfit, outfitById, wardrobe } from './extras';
import { roll } from './rng';
import type { PetState } from './sim';
import { RAFFLE } from './tuning';
import type { SeasonalEvent } from './world';

export type Draw = { kind: 'prize'; outfit: string } | { kind: 'miss' };

export function ticketsBought(s: PetState, eventId: string): number {
  return s.raffle?.[eventId] ?? 0;
}

/** Whether she has this event's prize already (the raffle is over for it). */
export function prizeWon(s: PetState, e: SeasonalEvent): boolean {
  return !!e.raffle && wardrobe(s).owned.includes(e.raffle);
}

/** Buy one ticket for this event's raffle and draw it. */
export function drawTicket(s: PetState, e: SeasonalEvent): { ok: true; state: PetState; draw: Draw } | { ok: false; reason: 'none' | 'won' | 'broke' } {
  if (!e.raffle || !outfitById(e.raffle)) return { ok: false, reason: 'none' };
  if (prizeWon(s, e)) return { ok: false, reason: 'won' };
  if (s.clover < RAFFLE.ticket) return { ok: false, reason: 'broke' };
  const n = ticketsBought(s, e.id) + 1;
  let state = JSON.parse(JSON.stringify(s)) as PetState;
  state.clover -= RAFFLE.ticket;
  state.raffle = { ...(state.raffle ?? {}), [e.id]: n };
  const salt = `raffle:${e.id}`;
  if (n >= RAFFLE.guaranteeBy || roll(s.petId, n, salt) < RAFFLE.odds) {
    state = giveOutfit(state, e.raffle);
    return { ok: true, state, draw: { kind: 'prize', outfit: e.raffle } };
  }
  return { ok: true, state, draw: { kind: 'miss' } };
}
