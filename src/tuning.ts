// Every number the simulation uses, in one place so a week of play-testing
// only ever edits this file. Rates are per hour; needs run 0–100.

export const STEP_MS = 10 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** The longest absence replayed. With no death, nothing changes after a day. */
export const MAX_CATCH_UP_MS = 7 * DAY_MS;

export const DECAY_AWAKE = { hunger: 3, happy: 3, energy: 4, clean: 2 } as const;
/** Asleep: hunger slows, happiness and cleanliness hold, energy refills. */
export const DECAY_ASLEEP = { hunger: 1.5, happy: 0, energy: -12, clean: 0 } as const;

/** Below this a need counts as low; two low needs make her grumpy. */
export const LOW_NEED = 30;

/** Fixed bedtime, local time. She sleeps [BEDTIME_HOUR, WAKE_HOUR). */
export const BEDTIME_HOUR = 22;
export const WAKE_HOUR = 7;

/** The daily gift, and the "day" for days visited, roll over at 05:00 local. */
export const DAY_ROLLOVER_HOUR = 5;

/**
 * The "found you a gift" reminder goes out at 09:00 local on the first morning
 * after the rollover, not at the rollover itself. The server has no quiet
 * hours, so a reminder at 05:00 would wake people every day.
 */
export const GIFT_REMINDER_HOUR = 9;

export const TIMERS = {
  nap: { ms: 2 * HOUR_MS },
  bake: { ms: 1 * HOUR_MS },
} as const;

/**
 * What she can be fed. Carrot and greens are free and always there; a
 * strawberry costs clover; an oat treat comes from the pantry (bake it first).
 */
export const FOODS = {
  carrot: { hunger: 25, happy: 0, clover: 0, pantry: false },
  greens: { hunger: 15, happy: 5, clover: 0, pantry: false },
  strawberry: { hunger: 20, happy: 15, clover: 3, pantry: false },
  treat: { hunger: 50, happy: 10, clover: 0, pantry: true },
  /** Grown in the garden. She always loves it. */
  golden: { hunger: 40, happy: 15, clover: 0, pantry: true },
} as const;
/**
 * How she reacts to each food, rolled every time she eats. What you paid
 * clover for or baked is far more likely to delight her; the free foods can
 * still surprise you. The rest of each row is "happy" (the food's usual effect).
 *   loves: the food's effect plus LOVES_BONUS_HAPPY joy, with hearts
 *   okay:  the food's hunger only, none of its joy
 */
export const FOOD_REACTIONS = {
  carrot: { loves: 0.15, okay: 0.25 },
  greens: { loves: 0.2, okay: 0.2 },
  strawberry: { loves: 0.45, okay: 0.05 },
  treat: { loves: 0.6, okay: 0 },
  golden: { loves: 1, okay: 0 },
} as const;
/** Kept modest so petting stays the main way to keep her happy. */
export const LOVES_BONUS_HAPPY = 6;

export const CARE = {
  pet: { happy: 8 },
  petAsleep: { happy: 3 },
  /** Past this a need is "full" and the action says so instead of acting. */
  full: 92,
  /** A nap is only offered when she's actually tired. */
  napBelowEnergy: 85,
} as const;

/** Bond points per care action, capped per day so it can't be farmed. */
export const BOND_PER_CARE = 1;
export const BOND_DAILY_CAP = 10;
/** A new day visited is worth a little bond on its own. */
export const BOND_PER_DAY_VISITED = 3;
/** Total bond needed for each level; level 1 at 0. */
export const BOND_LEVELS = [0, 12, 35, 70, 120, 190, 280];

export const CLOVER = {
  start: 60,
  /** Each capped care action pays one clover alongside its bond point. */
  perCare: 1,
  giftBase: 10,
  /** The gift grows with the streak, up to this much extra. */
  giftStreakMax: 10,
  pebble: 2,
} as const;

/** Chance per awake 10-minute step that she finds something while you're away. */
export const PEBBLE_CHANCE = 0.006;

export const MAX_TREATS = 3;
