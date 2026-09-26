// The clover economy (docs/rabbit-pets-economy.md). Every clover a player
// earns goes through earn(), which applies the clover rate and the Supporter
// bonus and keeps a running total per reason, so moving the balance to a
// server wallet later is one reason at a time. Pure, tested in economy.test.ts.

import { dayKey, isNewDay } from './localtime';
import type { PetState } from './sim';
import { COLLECTION_SETS, setComplete } from './collectibles';
import {
  BOND_GAP_GROWTH,
  BOND_LEVEL_CLOVER,
  BOND_LEVELS,
  DAY_ROLLOVER_HOUR,
  FRIEND_CLOVER,
  RATE,
  STREAK_MILESTONES,
  SUPPORTER_BONUS,
} from './tuning';

/**
 * Why clover was earned. Active reasons are boosted by the clover rate;
 * harvests and the yard are flat; the rest are one-off lump sums. Add a
 * reason here rather than paying clover directly.
 */
export type EarnReason =
  | 'gift' | 'care' | 'find' | 'visit' | 'hosted' | 'giftSent' | 'giftClover'
  | 'harvest' | 'yard' | 'critter' | 'forage'
  | 'milestone' | 'starter' | 'bond' | 'invite' | 'friendMilestone';

// Friend clover (visit, hosted, giftClover) is flat: what it says is what you get.
const ACTIVE: ReadonlySet<EarnReason> = new Set(['gift', 'care', 'find', 'critter', 'forage']);
const LUMP: ReadonlySet<EarnReason> = new Set(['milestone', 'starter', 'bond', 'invite', 'friendMilestone']);

/**
 * Pay `amount` clover for `reason`, boosted as that reason allows. Mutates
 * `state` (callers pass their own copy) and returns what was actually paid.
 * Fractions carry over, so a +2 care at a 1.3 rate pays 2, 3, 2, 3…
 */
export function earn(state: PetState, reason: EarnReason, amount: number): number {
  if (!(amount > 0)) return 0;
  let mult = ACTIVE.has(reason) ? rate(state).total : 1;
  if (state.supporter && !LUMP.has(reason)) mult *= SUPPORTER_BONUS;
  const exact = amount * mult + (state.cloverCarry ?? 0);
  const paid = Math.floor(exact + 1e-9);
  state.cloverCarry = Math.max(0, exact - paid);
  state.clover += paid;
  state.earned = { ...(state.earned ?? {}), [reason]: (state.earned?.[reason] ?? 0) + paid };
  return paid;
}

// ---------------------------------------------------------------- bond levels

/** Total bond needed for `level` (1-based). Past BOND_LEVELS each gap grows by BOND_GAP_GROWTH. */
export function bondThreshold(level: number): number {
  if (level <= BOND_LEVELS.length) return BOND_LEVELS[Math.max(0, level - 1)] ?? 0;
  const last = BOND_LEVELS.length - 1;
  let total = BOND_LEVELS[last]!;
  let gap = BOND_LEVELS[last]! - BOND_LEVELS[last - 1]!;
  for (let l = BOND_LEVELS.length + 1; l <= level; l++) {
    gap += BOND_GAP_GROWTH;
    total += gap;
  }
  return total;
}

/** Her bond level, with no top, and progress into it. */
export function bondLevel(bond: number): { level: number; into: number; span: number } {
  let level = 1;
  while (bond >= bondThreshold(level + 1)) level += 1;
  const floor = bondThreshold(level);
  return { level, into: bond - floor, span: bondThreshold(level + 1) - floor };
}

export interface Lump { what: string; clover: number }

/** Pay any bond level-up and gift-streak milestones not yet paid. Mutates `state`. */
export function settleLumps(state: PetState): Lump[] {
  const out: Lump[] = [];
  const paid = new Set(state.paid ?? []);
  const level = bondLevel(state.bond).level;
  for (const [l, clover] of Object.entries(BOND_LEVEL_CLOVER)) {
    const key = `bond:${l}`;
    if (Number(l) <= level && !paid.has(key)) {
      paid.add(key);
      out.push({ what: `Bond level ${l}`, clover: earn(state, 'bond', clover) });
    }
  }
  for (const [d, clover] of Object.entries(STREAK_MILESTONES)) {
    const key = `streak:${d}`;
    if (Number(d) <= state.gift.streak && !paid.has(key)) {
      paid.add(key);
      out.push({ what: `${d}-day gift streak`, clover: earn(state, 'milestone', clover) });
    }
  }
  state.paid = [...paid];
  return out;
}

// ---------------------------------------------------------------- the clover rate

export interface Rate { total: number; bond: number; sets: number; friends: number }

/** The clover rate: bonuses that add together. 1 = no bonus. */
export function rate(state: PetState): Rate {
  const level = bondLevel(state.bond).level;
  const bond = RATE.bondEarly * Math.min(level - 1, 6) + RATE.bondLate * Math.max(0, level - 7);
  const sets = COLLECTION_SETS.reduce((sum, set) =>
    sum + (setComplete(state.collection, set) ? (set.kind === 'permanent' ? RATE.permanentSet : RATE.eventSet) : 0), 0);
  const friends = RATE.bestFriend * bestFriends(state);
  const r = (x: number) => Math.round(x * 1e6) / 1e6; // no 0.6000000000000001
  return { total: r(1 + bond + sets + friends), bond: r(bond), sets: r(sets), friends: r(friends) };
}

// ---------------------------------------------------------------- friends

export type FriendPay = 'visit' | 'giftSent' | 'hosted' | 'giftClover';

/**
 * Whether a friend reward of this kind still pays clover today (the first
 * FRIEND_CLOVER.paidPerDay of each kind do). Counts it if so. Mutates `state`.
 */
export function friendPays(state: PetState, kind: FriendPay, nowMs: number, tz: string): boolean {
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  const t = isNewDay(state.friendToday?.day, today) ? { day: today, counts: {} } : state.friendToday!;
  const n = t.counts[kind] ?? 0;
  if (n >= FRIEND_CLOVER.paidPerDay) return false;
  state.friendToday = { day: t.day, counts: { ...t.counts, [kind]: n + 1 } };
  return true;
}

/**
 * A day of friendship with one friend, in one direction: you visited or
 * gifted them ('out'), or they you ('in'). Each direction counts once a day;
 * enough points make a best friend. Mutates `state`.
 */
export function noteFriendship(state: PetState, uuid: string, dir: 'out' | 'in', nowMs: number, tz: string): void {
  const today = dayKey(nowMs, tz, DAY_ROLLOVER_HOUR);
  const f = { points: 0, out: null as string | null, in: null as string | null, ...(state.friends?.[uuid] ?? {}) };
  if (!isNewDay(f[dir], today)) return;
  f[dir] = today;
  f.points += 1;
  state.friends = keepFriends({ ...(state.friends ?? {}), [uuid]: f });
}

type Friendship = NonNullable<PetState['friends']>[string];

/**
 * At most FRIEND_CLOVER.kept friendships: best friends first, then whoever
 * was seen most recently. A friendship that's let go starts again from
 * nothing if they come back.
 */
function keepFriends(friends: Record<string, Friendship>): Record<string, Friendship> {
  const all = Object.entries(friends);
  if (all.length <= FRIEND_CLOVER.kept) return friends;
  const best = (f: Friendship) => f.points >= FRIEND_CLOVER.bestFriendPoints;
  const last = (f: Friendship) => ((f.out ?? '') > (f.in ?? '') ? f.out ?? '' : f.in ?? '');
  all.sort(([, a], [, b]) => Number(best(b)) - Number(best(a)) || last(b).localeCompare(last(a)));
  return Object.fromEntries(all.slice(0, FRIEND_CLOVER.kept));
}

export function bestFriends(state: PetState): number {
  const n = Object.values(state.friends ?? {}).filter((f) => f.points >= FRIEND_CLOVER.bestFriendPoints).length;
  return Math.min(FRIEND_CLOVER.maxBestFriends, n);
}
