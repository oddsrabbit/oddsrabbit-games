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

/**
 * The sky outside, local time: night is [DUSK_HOUR, DAWN_HOUR). Only the
 * window and the lighting follow it; her sleep follows her energy (SLEEP).
 */
export const DUSK_HOUR = 20;
export const DAWN_HOUR = 6;

/**
 * Sleep. She sleeps until her energy is full (DECAY_ASLEEP.energy an hour),
 * so a tired rabbit sleeps most of a night and a slightly tired one naps.
 * Put to bed or not, she dozes off by herself below `dozeBelow`. Woken early,
 * she's still drowsy: at least `wokenEnergy`, a little above `dozeBelow`,
 * so she stays up for a while before nodding off again.
 */
export const SLEEP = {
  dozeBelow: 20,
  wokenEnergy: 28,
} as const;

/** The daily gift, and the "day" for days visited, roll over at 05:00 local. */
export const DAY_ROLLOVER_HOUR = 5;

/**
 * The "found you a gift" reminder goes out at 09:00 local on the first morning
 * after the rollover, not at the rollover itself. The server has no quiet
 * hours, so a reminder at 05:00 would wake people every day.
 */
export const GIFT_REMINDER_HOUR = 9;

/** Fixed-length timers. Sleep (the `nap` timer) lasts until she's rested: see sleepMs. */
export const TIMERS = {
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
  /** Toy play: a bit more joy than petting, and a little tiring. */
  play: { happy: 10, energy: 3 },
  /** Past this a need is "full" and the action says so instead of acting. */
  full: 92,
  /** She only goes to bed when she's actually tired. */
  napBelowEnergy: 85,
} as const;

/** Bond points per care action, capped per day so it can't be farmed. */
export const BOND_PER_CARE = 1;
export const BOND_DAILY_CAP = 10;
/** A new day visited is worth a little bond on its own. */
export const BOND_PER_DAY_VISITED = 3;
/** Total bond needed for each level; level 1 at 0. */
export const BOND_LEVELS = [0, 12, 35, 70, 120, 190, 280];

// ---------------------------------------------------------------- clover
// The economy: docs/rabbit-pets-economy.md, with its model in
// dev/economy-model.py. Change a number here and re-run the model.

export const CLOVER = {
  start: 100,
  /** Each capped care action pays this alongside its bond point. */
  perCare: 2,
  /** The daily gift: giftBase, +giftStep a streak day, up to giftMax. */
  giftBase: 15,
  giftStep: 2,
  giftMax: 40,
  /** A find while she's away. */
  pebble: 2,
  rareFind: 15,
} as const;

/** Once each, when the gift streak reaches the day. The streak never resets. */
export const STREAK_MILESTONES: Record<number, number> = { 7: 50, 30: 200, 100: 750, 365: 2500 };
/** Once each, on reaching the bond level. */
export const BOND_LEVEL_CLOVER: Record<number, number> = { 2: 50, 3: 75, 4: 100, 5: 150, 6: 200, 7: 300 };
/** Past the last of BOND_LEVELS, each level's gap grows by this. */
export const BOND_GAP_GROWTH = 20;

/** The clover rate: bonuses that add together, boosting active clover only. */
export const RATE = {
  /** Per bond level above 1, up to level 7... */
  bondEarly: 0.1,
  /** ...then per level, with no end. */
  bondLate: 0.02,
  permanentSet: 0.05,
  eventSet: 0.02,
  bestFriend: 0.03,
} as const;
/** Supporters: multiplies everything, the only multiplier in the game. */
export const SUPPORTER_BONUS = 1.25;

/**
 * Clover between friends (social.ts). Always flat: what it says is what you
 * get, never boosted by the clover rate. A visit pays the visitor and the
 * host `visit` each, plus WELCOME.step for each welcome piece that player has.
 * Gifts are things, not clover, except a golden carrot, which becomes
 * `goldenGift` for the friend. `legacyBundle` is what a clover bundle from a
 * friend on an older version pays now that bundles aren't sent.
 */
export const FRIEND_CLOVER = {
  visit: 5,
  goldenGift: 30,
  legacyBundle: 5,
  /** Only the first this-many of each kind a day pay clover. */
  paidPerDay: 5,
  /** Friendship points (a day of visiting or gifting, each way) to be best friends. */
  bestFriendPoints: 20,
  maxBestFriends: 5,
  /**
   * Friendships kept in her save (best friends first, then the most recent):
   * each is about 100 bytes, and the save must stay under 16 KB.
   */
  kept: 40,
} as const;

/**
 * Friend milestones: a lump sum, once each, for this many friends you've
 * visited and who've visited you (economy.ts settleLumps).
 */
export const FRIEND_MILESTONES: Record<number, number> = { 3: 250, 5: 500, 10: 1_000, 20: 2_000 };

/** A friend's visit with care (docs/rabbit-pets-visits.md §2). */
/**
 * Friends' rabbits in her burrow (docs/rabbit-pets-visits.md §1): each stays
 * this long from when she first sees the visit, this many at once; the rest
 * wait their turn.
 */
export const GUESTS = {
  stayMs: HOUR_MS,
  atOnce: 2,
} as const;

export const VISIT_CARE = {
  /** How much one act of care raises the need. */
  boost: 8,
  /** Only the first this-many visits a local day boost her needs. */
  perDay: 3,
} as const;

// ---------------------------------------------------------------- garden and yard

/**
 * Richer soil, levels 1 to `maxLevel`: each costs `growth` times the last and
 * adds `perLevel` clover to a sprout harvest. Strawberries give one more at
 * each of `berryAt`, and golden carrots come in twos from `goldenAt`.
 */
export const SOIL = { basePrice: 600, growth: 1.8, perLevel: 2, maxLevel: 5, berryAt: [2, 4], goldenAt: 5 } as const;
/** Strawberries per harvest before soil. Their seeds are free: a berry only saves the 3 clover the tray charges, so they need to come in numbers to rival sprouts. */
export const BERRY_HARVEST = 3;
/** Sprouts: seed cost and base clover per harvest, before soil. */
export const SPROUT_CLOVER = 6;
/** The watering can makes crops grow this much faster. */
export const CAN_SPEED = 1.25;

/** Yard storage, in hours of output: 24, then 36 and 48 with the shed. */
export const YARD_STORAGE_HOURS = [24, 36, 48] as const;

/** Chance per awake 10-minute step that she finds something while you're away. */
export const PEBBLE_CHANCE = 0.006;

export const MAX_TREATS = 3;

/**
 * The garden's meadow (docs/rabbit-pets-economy.md §2.6): the gate's price, and
 * how much of a building's own output each helping piece adds to it.
 */
export const MEADOW = { gate: 300, boost: 0.1 } as const;

/**
 * Wild visitors (wildlife.ts). Chance per 10-minute step that one drops by
 * (about 1.3 a day), how long it stays, the clover it leaves (min to max,
 * skewed low: most leave 2 or 3, a 10 is rare), and the chance it also
 * leaves its keepsake.
 */
export const WILDLIFE = {
  chancePerStep: 0.009,
  stayMs: [60 * 60_000, 90 * 60_000],
  clover: { min: 2, max: 10 },
  keepsakeChance: 0.1,
} as const;

/**
 * Foraging trips (forage.ts). The lengths on offer, the least energy she
 * needs to set off, and what each hour out can bring: its chances (clover,
 * then a strawberry, then a find; the rest is a golden carrot) and how much
 * clover.
 */
export const FORAGE = {
  hours: [2, 4, 8],
  minEnergy: 30,
  odds: { clover: 0.55, berry: 0.25, find: 0.15 },
  clover: { min: 4, max: 8 },
} as const;

/**
 * The festival raffle (raffle.ts): a ticket's price, its chance of the prize,
 * the ticket that always wins it, and the clover back when a ticket brings
 * neither the prize nor a find.
 */
export const RAFFLE = { ticket: 100, odds: 0.1, guaranteeBy: 10 } as const;

/**
 * The welcome line (social.ts): five pieces for the meadow, bought in order.
 * Each adds `step` to every visit you make or get (your own level counts,
 * never your friend's). Only worth buying if friends visit.
 */
export const WELCOME = {
  step: 3,
  pieces: [
    { id: 'welcomemat', price: 1_000 },
    { id: 'guestchairs', price: 3_000 },
    { id: 'teacorner', price: 6_000 },
    { id: 'lanternpath', price: 12_000 },
    { id: 'friendtree', price: 25_000 },
  ],
} as const;
