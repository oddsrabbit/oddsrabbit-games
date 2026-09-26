// The festival raffle: during a seasonal event, tickets for a prize outfit
// that can only be won. It's meant to be kind rather than a gamble: the odds
// are shown, the RAFFLE.guaranteeBy-th ticket always wins, and every other
// ticket brings something (a find from the event's set that she's missing,
// or some clover back). Seeded on her id and the ticket's number, so reopening
// the game can't re-draw one. The count carries over to next year's event
// until the prize is won. Pure; tested in raffle.test.ts.

import { giveOutfit, outfitById, wardrobe } from './extras';
import { roll } from './rng';
import type { PetState } from './sim';
import { RAFFLE } from './tuning';
import type { SeasonalEvent } from './world';

export type Draw = { kind: 'prize'; outfit: string } | { kind: 'find'; id: string } | { kind: 'clover'; amount: number };

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
  // no prize: a find from this event's set she hasn't got, half the time, if there is one
  const missing = e.finds.filter((id) => !(state.collection?.[id] ?? 0));
  if (missing.length && roll(s.petId, n, `${salt}:find`) < 0.5) {
    const id = missing[Math.floor(roll(s.petId, n, `${salt}:which`) * missing.length)]!;
    state.collection = { ...(state.collection ?? {}), [id]: 1 };
    return { ok: true, state, draw: { kind: 'find', id } };
  }
  state.clover += RAFFLE.refund;
  return { ok: true, state, draw: { kind: 'clover', amount: RAFFLE.refund } };
}
