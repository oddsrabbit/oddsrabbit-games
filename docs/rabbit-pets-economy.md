# Rabbit Pets: the clover economy

Status: **proposed 2026‑09‑25**, not started. Rebalances clover in
`rabbit-pets/`, adds long-term goals, and removes carrot catch. It goes with
[`rabbit-pets-visits.md`](./rabbit-pets-visits.md), whose visit rewards
are set here.

**Decisions already taken** (2026‑09‑25):

- **Paced for a player who plays daily, alone.** A casual player with no
  friends can afford the whole launch ladder in about 3 months, and an
  engaged one in about 2. Pacing comes from prices against income.
- **One shop, the same for everyone.** Every item is in the shop from day
  one, including the big goals. A few carry a visible condition (bond 5,
  soil level 3, owning the fireplace), shown locked with how far along you
  are. An update adds items that every player sees at once. Only seasonal
  events follow the calendar.
- **Something new every few days.** Week one pays a starter week of goals,
  one set a day. After that a casual player can afford something new about
  every 4–5 days through month 3, with bond levels and finds in between.
- **Carrot catch is removed.** The same mini-game three times a day gets
  repetitive fast. Play becomes **toy play**: tap a toy and she plays with
  it. No score, no clover. Toys are things to buy.
- **Income grows two ways.** **Active clover** (daily gift, care, finds,
  friends) is boosted by a **clover rate** from four tracks with no final
  level. **Flat clover** comes from the garden and **the yard**: buildings
  you buy that produce clover every hour. It's never boosted, so the rate
  never multiplies an ever-growing base. Decor stays purely cosmetic.
- **The yard is about half of a year-one player's income.** The pet stays
  the reason to open the game; the yard is the reward for doing it.
- **Friends help, without being decisive.** Clover comes from your first 5
  friend visits and gifts a day, in each direction. One friend makes a
  player 10–15% faster; five or more, about 1.5–1.8×. Only friends with a
  verified email pay clover. Inviting someone new pays well.
- **Clover will be sold, through a future platform purchases system**
  that other developers' games will use too. That system is a separate,
  later proposal. §6 covers what Rabbit Pets sells and what it does now to
  be ready. Supporters also get a clover bonus.

The game isn't deployed yet, so no player has a balance to protect.
Rebalancing now costs nothing.

**Terms used here:**

- **Casual and engaged** players both play every day. **Casual** opens
  the game once a day: about 5 care actions and 1 harvest. **Engaged**
  comes back through the day and hits every daily cap: 10 care actions and
  3 harvests. Real players skip days, so real times are longer than the
  model's.
- **Tier:** a price band. Tier 1 is everyday items (25–60), tier 2 is
  saving-up items (150–700), tier 3 is the fireplace (2,000), tier 4 is the
  moon window (3,000).
- **Launch ladder:** the part of the shop a player works through in their
  first months: tiers 1–4, toys and the one-off upgrades, about 13,000. It
  leaves out the yard and repeatable soil, which can always be bought, and
  seasonal items. The **long-term goals** (§3.2) are in the same shop, just
  priced or gated for later.

## 1. As built today

**Gains:**

| Source | Rule (where) | Casual, a day | Engaged solo, a day |
|---|---|---|---|
| Starting clover | 60 (`CLOVER.start`) | once | once |
| Daily gift | 10 + (streak − 1), max 20 (`sim.ts`) | 10–20 | 20 |
| Care | +1 per care action, 10 a day, shared with the bond cap (`careReward`) | ~4 | 10 |
| Finds while away | +2 each, about 0.5 a day (`PEBBLE_CHANCE`) | ~1 | ~1 |
| Carrot catch | caught ÷ 2, max 10 a play, 3 plays (`playReward`) | ~5 | 30 |
| Clover sprouts | 2 seed → 6, 4h, 3 plots (`CROPS`) | ~12 | ~36 |
| Sending a gift | +1, 10 a day (`SEND_REWARD_CLOVER`) | 0 | up to 10 |
| Receiving a clover gift | +5 each, one per friend a day, no cap (`applyGift`) | – | – |
| **Total** | | **~32–42** | **~97, plus gifts** |

**Costs:**

| Sink | Price |
|---|---|
| 7 regular decor (cushion, plant, rug, lantern; toadstool, jar at bond 2; garland at bond 3) | 25–60, 270 in all |
| 3 seasonal decor | 40–50, 135 in all |
| 4 regular outfits | 25–45, 130 in all |
| 3 seasonal outfits | 35–45 (the scarf is free once) |
| Strawberry (food tray) | 3 each |
| Seeds | 2 / 4 / 8 |

**The problem:** everything costs about 660. An engaged solo player owns
all of it in about a week, and a casual one in about three. After that,
clover has nothing to buy. Friends add almost nothing.

The fix is mostly at the other end: things worth saving for, at
steady steps.


## 2. Proposed gains

**Solo income.**

| Source | Rule | Change from today |
|---|---|---|
| Starting clover | 100 | was 60 |
| Daily gift | 15, +2 a streak day, max 40 (from day 13) | was 10–20, to make up for carrot catch |
| Care | +2 per care, 10 a day | was +1 |
| Finds | common +2, rare +15 | rare was +2 |
| Carrot catch | **removed**; Play becomes toy play (§2.3) | was up to 30 a day |
| Clover sprouts | 2 seed → 6, 4h | unchanged, but you start with **one** plot and buy the others (§2.5) |
| **Starter week** | one set of goals a day for 7 days, §2.1 | new: 450, and a free clover patch |
| **Gift streak milestones** | once each: 7 days +50, 30 days +200, 100 days +750, 365 days +2,500 | new |
| **Bond level-ups** | once each: level 2 +50, 3 +75, 4 +100, 5 +150, 6 +200, 7 +300 | new |

The streak never resets (a missed day only pauses it), so every milestone
is reachable by anyone who keeps coming back.

### 2.1 Starter week

Week one should feel like steady progress every day, not one burst. A
short checklist sits under the clover chip. Each day's goals unlock on the
player's next day of play, not the calendar, so a slow starter isn't
punished. Every goal can be done alone.

| Day | Goals | Clover |
|---|---|---|
| 1 | Feed her, put her down for a nap, place your first decor, dress her | 100, plus **a free clover patch** so the yard starts on day one |
| 2 | Play with her toy, harvest the garden, bake a treat | 70 |
| 3 | Open the daily gift 3 days running, collect the yard | 70 |
| 4 | Visit a friend with care, **or** share Rabbit Pets | 50 |
| 5 | Place 3 pieces of decor | 30 |
| 6 | Buy a garden upgrade | 30 |
| 7 | A week together | 100 |
| | **Total** | **450 and a patch** |

When the week is done, the checklist goes away for good.

**What week one looks like** (clover earned by the end of each day):

| Player | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 7 |
|---|---|---|---|---|---|---|---|
| Casual, no friends | 236 | 344 | 508 | 603 | 681 | 760 | 1,041 |
| Casual, 1 friend | 244 | 360 | 532 | 637 | 723 | 812 | 1,102 |
| Engaged, no friends | 254 | 434 | 566 | 760 | 861 | 965 | 1,295 |
| Engaged, 1 friend | 272 | 472 | 624 | 839 | 962 | 1,087 | 1,441 |

Tier 1 costs about 400 in all (25–60 an item), so a casual solo player
can buy most of it on days 1–3. Then come the first toys and the cheaper
tier 2 items, and by day 7 they're also buying clover patches. Bond
reaches level 2 on day 2–3 and level 3 by day 7, each with a lump sum.

### 2.2 Friends

| Source | Rule |
|---|---|
| Visiting, with care | +3 |
| Sending a gift | +1 |
| Being visited | +4 |
| Receiving a clover gift | +10 |
| **How many pay** | Your **first 5 of each a day**: 5 visits you make, 5 gifts you send, 5 visits you receive, 5 clover gifts you receive. More still happen (guests, care, berries and hugs), just without clover. |
| **Friend milestones** | once each, for friends you've visited and who've visited you: 3 → +250, 5 → +500, 10 → +1,000, 20 → +2,000 |
| **Invites** | A new player who signs up through your share link: once their rabbit is 3 days old, you get **+500** and they get **+250**. Paid for up to 10 invites. |

Most players will play alone or with 1–2 friends, so those are the design
target (§2.7). Each friend is a clear boost without being decisive: one
friend makes a player 10–15% faster. The limit of 5 a day means that
beyond about 5 active friends, more friends add little clover: five make
a casual player about 1.6× faster, and ten about 1.85×. For an engaged
player it's about 1.5× and 1.65×. "Your five closest friends each day" is
also easy to explain.

**Which friends count.** Clover from a friend (visits, clover gifts,
milestones) only pays if their account has a **verified email**. Care,
guests and berry and hug gifts from anyone still work; only the clover
waits. The server knows this, so each `visits.inbox` and `gifts.inbox` row
carries `counts: boolean`, and the game pays clover only when it's true.
A verified email per spare account, and the limit of 5 a day, are enough
while clover is free. If clover is sold, this rule is revisited then
(§6.3).

**Invites** reuse the platform's existing referral (`?ref=` on sign-up in
`AuthController`, which already only counts after the email is verified,
to stop farming). Rabbit Pets' share text carries the sharer's link. The
game learns about it through a small new verb
(`referrals.rabbitPets`-style; to be named in its own proposal) that says
which of the player's referred users now count, and whether the new player
was referred. The inviter pays out on their side, like every other reward.

### 2.3 Toy play, in place of carrot catch

The Play button opens her toys. Tap one and she plays with it: chases a
ball, bats at yarn, hops in and out of a box. No score, no timer, no
limit on plays.

- It raises joy, as Play does today, and counts toward the daily care cap
  for bond and clover like any other care action.
- She starts with a ball. The rest are shop items, each with its own
  animation: yarn ball 50, cardboard box 80, tunnel 150, rope swing 250.
  Bigger toys are among the long-term goals (§3.2).
- Visitors can play with the host's toys when they pick Pat as their care.

### 2.4 Income that grows: four tracks

Every track has levels with no end. Each level needs a bit more than the
last, and each is fed by something with a daily limit, so levels come more
and more slowly. Income keeps rising, gently.

The percentage bonuses **add together** into one clover rate (for example
"Clover rate +94%"), shown with a breakdown under her profile. The rate
boosts **active clover** only: the daily gift, care, finds and friends. It
doesn't boost garden harvests, the yard (§2.6) or one-off lump sums.

| Track | Fed by (daily limit) | Level needs | Bonus |
|---|---|---|---|
| **Bond** | Care (10 bond a day) | Today's thresholds to level 7 (280). After that each level's gap grows by 20 (110, 130, 150…). | +10% a level to 7 (+60%), then **+2% a level with no end**. Every 5th level from 10 also gives a cosmetic: a title, a portrait frame. |
| **Garden** | Harvests (crop timers) | Buying upgrades, including the repeatable soil (§2.5) | More clover per harvest. Flat, not boosted by the rate. |
| **Collection** | Finds (about 0.5 a day) | Completing a set on the shelf: commons, rares, and one per seasonal event | **+5% a set.** Seasons and updates add sets. |
| **Friendships** | Visits and gifts with one friend | A friend becomes a **best friend** after about 2 weeks of visiting each other | **+3% for each best friend**, up to 5, matching the daily limit. |

A casual player reaches bond level 5 by day 30, 7 by day 60 and 15 in a
year. An engaged one reaches 21 in a year.

### 2.5 Upgrades

**In the launch ladder:**

| Upgrade | Price | Effect |
|---|---|---|
| Second garden plot | 300 | +1 plot |
| Third garden plot | 600 | +1 plot |
| Watering can | 1,000 | Crops grow 25% faster, once |
| **Richer soil, repeatable** | 600, then ×1.8 each level (1,080, 1,944, 3,499…) | +2 clover per sprout harvest each level, no end |

Soil is the idle-game sink: it can always be bought again, and each level
costs 1.8× the last while paying the same +2. It pays back more and more
slowly, which is what keeps it from running away. Harvests aren't boosted
by the clover rate, so soil levels add, never multiply. By a year a casual
player has about level 6, an engaged one about 7–8.

The fourth and fifth plots are long-term goals (§3.2).

Plots also grow strawberries and golden carrots, so an upgrade is never
only about clover. No upgrade expires, runs out, or needs tending to keep
working.

### 2.6 The yard

A new Yard section next to the garden: buildings that produce clover every
hour, day and night, whether or not you open the game.

| Building | First one | Produces | Each extra costs | How many | Appears |
|---|---|---|---|---|---|
| Clover patch | 250 (the first is free, §2.1) | 0.25 an hour (6 a day) | ×1.3 | up to 10 | day one |
| Beehive | 2,000 | 1 an hour (24 a day) | ×1.35 | up to 5 | after the third patch |
| Mushroom log | 8,000 | 2 an hour (48 a day) | ×1.4 | up to 5 | after the fifth beehive |
| Yard shed | 1,000, then 3,000 | Storage holds 36 hours, then 48 | | once each | after the third patch |

- **Collecting.** Clover piles up in the yard's storage. Opening the game
  shows "+86 clover from the yard" with a tap to collect.
- **Storage fills in 24 hours,** matching "one visit a day". The shed
  stretches it to 36 and 48 hours so a weekend away wastes nothing. It's
  never shorter than a day and never nags: no reminder is sent when it's
  full.
- **Flat, on purpose.** Yard clover is not boosted by the clover rate.
  Each extra building costs more but produces the same, so each one takes
  longer to pay back. The first bought patch pays for itself in about 6
  weeks, and the tenth in over a year. Growth from the yard stops when
  every building is bought, until an update adds a new one. That puts late
  growth in the team's hands.
- **It's fair to casual players.** The yard pays the same per hour
  however often you play, which narrows the casual–engaged gap (§2.7).
- **Holiday mode:** the yard keeps producing until storage is full, then
  stops. A two-week trip doesn't come home to a windfall.
- **Supporters** get +25% on the yard too (§6.2).

The yard is its own screen, not decor, so the burrow stays purely
cosmetic. Friends could see your yard on a visit later; not at launch.

### 2.7 What that comes to

From a model of eight players, in `dev/economy-model.py`:

- **Every player** opens the daily gift every day, does the starter week,
  and collects the yard daily. Whenever they have 1.5× the price of the
  cheapest upgrade or building, they buy it.
- **Casual** and **engaged** are as defined at the top. Casual completes 2
  collection sets in the year, engaged 4.
- **Friends** are the best case: each one visits and gifts daily, and
  becomes a best friend after 2 weeks or so. Real friendships are patchier.

**The design target is no friends or 1 friend.** 5 and 10 friends are the
fast edge.

Clover a day, split as active / garden / yard:

| Player | Day 7 | Day 30 | Day 90 | Day 180 | Day 365 | Earned in year one |
|---|---|---|---|---|---|---|
| Casual, no friends | 56 (46/4/6) | 114 (72/18/24) | 171 (86/38/48) | 266 (89/45/132) | 479 (95/60/324) | ~104,000 |
| Casual, 1 friend | 65 | 127 | 186 | 305 | 496 | ~114,000 |
| Casual, 5 friends | 128 | 216 | 348 | 490 | 663 | ~173,000 |
| Casual, 10 friends | 164 | 265 | 410 | 594 | 771 | ~202,000 |
| Engaged, no friends | 81 (63/12/6) | 188 (98/54/36) | 302 (106/112/84) | 451 (114/158/180) | 702 (127/202/372) | ~172,000 |
| Engaged, 1 friend | 104 | 233 | 360 | 535 | 790 | ~194,000 |
| Engaged, 5 friends | 172 | 354 | 538 | 720 | 938 | ~254,000 |
| Engaged, 10 friends | 198 | 388 | 575 | 808 | 982 | ~274,000 |

- **Active clover barely grows after month 6** (under 15% to month 12).
  The boosted part can't run away.
- **The yard carries later growth,** and it has a ceiling. Players fill it
  in year one, and then income levels off until an update adds a building.
- **Casual and engaged players are close.** Without carrot catch and with
  the yard, engaged players earn about 1.8× what casual ones do at day 90
  and 1.5× at day 365.
- **The model spends everything on upgrades and buildings,** so it shows
  the fastest growth possible. Real players also buy decor, so their
  yards grow more slowly.
- **Supporters** (§6.2) get +25% on every part. Because they reinvest it,
  by the end of year one they have earned about 30–40% more.

## 3. Proposed costs

### 3.1 The launch ladder: about 13,000

| Part | Price | What's in it |
|---|---|---|
| Tier 1 | 25–60 | Today's shop, unchanged: seven decor (bond gates as now) and four outfits. About 400 in all. |
| Toys | 50–250 | Yarn ball, cardboard box, tunnel, rope swing (§2.3). 530 in all; the ball is free. |
| Upgrades | 300–1,000 | Second and third plot, watering can (§2.5). 1,900 in all. Soil levels on top. |
| Tier 2 | 150–700 | 14 items (below). 5,130 in all. |
| Tier 3 | 2,000 | Fireplace. It flickers, and on cold days she curls up by it. |
| Tier 4 | 3,000, bond 5, after the fireplace | Moon window: a round window with the real moon phase and stars at night. |
| The yard | 250 and up | Patches, beehives and the shed (§2.6). They pay back, so they sit outside the 13,000. |
| Seasonal | 300–800 | Only the current event's items, for a few weeks. |

All of it is in the shop from day one.

**Tier 2, cheapest first:** flower box 150, hanging herbs 180,
tea kettle 200, patchwork cushion 220, oak floorboards 250, daisy
wallpaper 280, bunting 300, reading lamp 350, bookshelf nook 400, birch
floorboards 450, starry wallpaper 500, hay loft bed 550 (she naps in it),
rocking chair 600, window seat 700 (she watches the weather).

**Why not stagger arrivals?** An earlier draft brought tier 2 in one item
every 3 days. The model showed it changes nothing: income, not
availability, is what limits a player, so they couldn't have bought faster
anyway. Showing everything is simpler, and every player sees the same shop.

**Showing big prices without scaring new players.** The shop opens on
what the player can afford now, cheapest first. Bigger items sit below
under **Saving up**. A player can pin one as their goal, and it shows as a
bar under the clover chip ("Fireplace: 640 of 2,000").

**How long until a player has earned enough for each part:**

| Player | Tier 1 | Through tier 2 (with toys and upgrades) | + Fireplace | + Moon window |
|---|---|---|---|---|
| Casual, no friends | day 3 | ~8½ weeks | ~10 weeks | ~3 months |
| Casual, 1 friend | day 3 | 8 weeks | ~9½ weeks | ~12 weeks |
| Casual, 5 friends | day 2 | ~5½ weeks | ~6½ weeks | 8 weeks |
| Casual, 10 friends | day 2 | ~4½ weeks | ~5½ weeks | 7 weeks |
| Engaged, no friends | day 2 | 6 weeks | ~7 weeks | 9 weeks |
| Engaged, 1 friend | day 2 | ~5 weeks | ~6 weeks | 8 weeks |
| Engaged, 5 friends | day 2 | 4 weeks | ~4½ weeks | ~6 weeks |
| Engaged, 10 friends | day 2 | ~4 weeks | ~4½ weeks | ~5½ weeks |

**How often something new arrives** for a player who buys the cheapest
thing they can afford (decor, toy, upgrade or yard building), at most one
a day:

| Player | Month 1 | Month 2 | Month 3 | Month 4 |
|---|---|---|---|---|
| Casual, no friends | almost daily (24) | every ~4 days | every ~5 days | every ~7–8 days |
| Engaged, no friends | almost daily (27) | every ~4 days | every ~5 days | every ~7–8 days |

Between purchases there's still progress: a bond level about every 2
weeks through month 3, a find every other day, and the yard growing.
From month 4 the gaps lengthen as players save for the long-term goals.

### 3.2 Long-term goals

The rest of the shop, also there from day one. Most are simply expensive.
A few have a condition, shown locked with how far along you are.

| Item | Price | Condition |
|---|---|---|
| More toys (ball pit, hay bale maze, kite) | 400–1,000 | – |
| More floors and wallpapers | 800–1,500 | – |
| Tea table set | 1,500 | – |
| Fourth garden plot | 2,000 | soil level 3 |
| Fifth garden plot | 5,000 | fourth plot, soil level 5 |
| Grandfather clock | 6,000 | – |
| Mushroom log (yard) | 8,000 | five beehives (§2.6) |
| Tiny crown (outfit) | 10,000 | bond 10 |
| Burrow expansion | 25,000–50,000 | A real engineering change (scene size, decor positions, the friends' snapshot), with its own proposal. |

Conditions are for things that only make sense in order (plots, the yard)
or that should reward time with her (bond). Everything else is gated by
price alone.

**Updates** add items to the shop whenever there's new art, priced against
the model's income for players who'd reach them. Every player sees them at
once. Now and then an update adds a yard building, which is the main
lever on late-game income.

**Seasonal events** are the one thing tied to the calendar. They add
limited items each season, 1,000–2,000 in all.

**Recurring costs** stay as they are (strawberry 3, seeds 2 / 4 / 8,
baking free). With income this high they're flavour, not a sink, and
that's fine: the ladder is the sink.

## 4. Goals clover can't buy

These are what make a friend group worth having beyond clover, and they
stay meaningful even if clover is sold one day.

| Item | Unlocked by |
|---|---|
| Friendship quilt (decor) | Visiting 10 different friends |
| Guest book (decor) | Hosting 30 visits |
| Bond gates | Existing items, plus the moon window at bond 5 |
| Golden trowel (garden decor) | A 100-day gift streak |
| Collectible shelf trim | All 12 collectibles found |

Once unlocked they're free. They show in the shop, locked, with how far
along you are ("7 of 10 friends visited"), so they read as goals.

## 5. Changes to the code

- **Carrot catch goes:** `catch.ts`, `playReward`, `recordPlay`,
  `PLAYS_PER_DAY`, `PetState.plays`, the catch screen and its sounds. The
  Play button stays and opens the toys. Saves with `plays` just ignore it.
- **`tuning.ts`:**
  - `CLOVER`: start 100, daily gift 15 +2 a day to 40, care +2, rare finds
    15, streak milestones.
  - `BOND_CLOVER`: level-up bonuses. Bond thresholds become a formula past
    level 7.
  - `TRACKS`: each track's level formula and bonus.
  - `SUPPORTER_BONUS`: 1.25.
  - `STARTER_WEEK`: each day's goals and amounts, and the free patch.
  - `FRIEND_CLOVER`: visit, send, host and gift amounts, the limit of 5 of
    each a day, friend milestones, invite rewards.
  - `UPGRADES`: the §2.5 table, with soil's repeatable price.
  - `YARD`: the §2.6 buildings, their reveal rules, and the shed's storage
    hours.
- **`sim.ts`:**
  - One `earn(state, reason, amount)` that applies the clover rate (for
    active reasons only) and the Supporter bonus, so no payout site gets
    either wrong. `reason` is one of a fixed list (`gift`, `care`, `find`,
    `harvest`, `visit`, `hosted`, `giftSent`, `giftClover`, `yard`,
    `milestone`, `starter`, `bond`, `invite`, `purchase`), and `PetState`
    keeps a running total per reason. That's what makes moving to a server
    wallet later mechanical (§6.3).
  - `rate(state)`: the four tracks, added up.
  - Pay out streak milestones, level-ups, starter week goals, friend
    milestones and invites once each (a `paid` set in `PetState`).
  - `PetState` gains `friendToday` (counts of each friend kind paid today),
    `upgrades`, `soilLevel`, `bestFriends`, `goal` (the pinned item) and
    `toys`.
- **`extras.ts`:**
  - Plots start at 1, up to 5.
  - Crop yield and grow time read the owned upgrades and soil level.
  - Collection sets, and which are complete.
  - Rare finds worth 15.
- **`yard.ts`** (new, pure, tested): buildings owned, the next price,
  what's in storage for a given time (capped by the shed), and collecting.
  The simulation's catch-up fills storage like any other timer. Yard state
  lives in `v1:pet`.
- **`decor.ts`:**
  - The launch ladder (§3.1) and long-term goals (§3.2), each item with a
    `tier`, an optional `requires` condition, and an `unlock` field for §4
    goals.
  - Toys as their own kind, each with a play animation.
  - Wallpaper and floor as their own zones, not placed pieces.
  - Seasonal prices.
- **`social.ts`:** `applyGift` (clover gift +10) and `applyVisits` pay only
  rows with `counts: true`, and only up to 5 of each kind a day.
- **`main.ts`:**
  - The starter week checklist.
  - The toy picker behind Play, and toy play in the scene.
  - The shop's layout: affordable first, then **Saving up**, locked items
    with their condition, and a pinned goal with its bar.
  - An upgrades section in the shop, showing what each one changes.
  - The Yard screen, and the collect toast on open.
  - The clover rate and its breakdown under her profile, with each track's
    progress to its next level.
  - Locked goals with progress in the shop.
  - The sharer's referral link in the share text.
- **Platform** (with the visits work):
  - `counts` on `visits.inbox` and `gifts.inbox` rows.
  - A small referrals verb for invites. It needs its own proposal.
  - Supporter status on the signed-in user (§6.2).
- **Art:**
  - Launch: 14 small tier 2 pieces, 4 toys with play animations, the
    animated fireplace, the moon window with its phases, the yard
    buildings, and small icons for 3 upgrades.
  - Every item in the shop needs its art at launch, since everything shows
    from day one. Long-term goals that aren't drawn yet can wait for an
    update rather than show as "coming soon".
- **Tests:**
  - The new payouts, limits, conditions and upgrades in `sim.test.ts` and
    `extras.test.ts`.
  - A port of the §2.7 model: the eight players over 7, 30, 90 and 365
    days, whose figures must land within ±15% of the table. A later tweak
    then can't quietly break the pacing.

## 6. Selling clover, and Supporters

### 6.1 Selling, later

Clover will be sold through a **platform purchases system** that
other developers' games will use too: products per app, Stripe on web,
in-app purchase on iOS and Android, a revenue share, and platform-wide
rules. That is a separate proposal, not written yet. Rabbit Pets launches
without selling and turns it on when the platform has it.

**What Rabbit Pets sells: things that grow with income, not fixed
packs.** Income keeps rising, so a fixed pack of 500 is worth a day's play
in week one and an hour by month six. Instead:

- **Time warps:** "8 hours of your yard, now", worked out from the yard's
  hourly output. It's easy to explain, and it keeps its value at every
  stage because the yard grows. A warp skips storage limits.
- **Clover bundles sized the same way**, if a plain "buy clover" button is
  wanted: the amount shown is what those hours of yard come to for this
  player, with a floor so a new player's bundle isn't tiny.
- **Cosmetics sold directly**, not through clover.
- **No permanent boosters for money.** Supporter is the one paid bonus
  (§6.2), so paying players aren't split into "who bought which booster".

### 6.2 Supporters

Supporter is the platform's existing $4.99 a month subscription (ad-free,
badge, charity). Rabbit Pets honours it:

- **+25% clover**, multiplying the final clover rate, so "+25%" means
  exactly that at every stage. It's the only multiplier in the game;
  everything else adds.
- **One Supporter-only cosmetic each season**, such as a scarf or a burrow
  ornament. Friends see it when they visit.
- **Nothing else is closed off.** Every item, track and goal is open to
  everyone.

**Platform change:** games can't see Supporter status today. The bridge's
signed-in user gains a `supporter: boolean`, read from
`is_user_oddsrabbit_subscriber()`, and every game can choose to honour it.

### 6.3 What Rabbit Pets does now, to be ready

1. **Every earn goes through `earn(reason)`** with a running total per
   reason (§5). When the server wallet arrives, each reason and its daily
   cap moves across one for one.
2. **No transfers between players.** Friends' clover is **created**, not
   moved from the sender's balance. Keep it that way, or bought clover
   becomes tradeable (resale, stolen cards, laundering through spare
   accounts).
3. **Which friends count, and the limit of 5 a day** (§2.2) limit
   farming with spare accounts. While clover is free, a verified email is
   enough. Once it has a price, tighten this: an account age, or activity
   on several days, before a friend's clover counts.
4. **Some goals money can't buy** (§4): bond, streak and friend unlocks
   stay earn-only, so paying speeds you up without buying everything.

Until the wallet is on the server, clover lives in `v1:pet` and can be
edited with devtools. That's acceptable while nothing is sold: a cheater
only spoils their own game.

## 7. Open questions

1. **Is the starter week the right hook?** About 240 on day 1 and 1,000
   by day 7 for a casual solo player, against a 400 tier 1.
2. **One plot at start.** It makes the garden something you invest in,
   but the garden is also where golden carrots come from. The alternative
   is to start with two, and move every plot price up one step.
3. **Months 2–3.** Purchases come every 4–5 days then, with bond levels
   and finds in between. If playtesting says that sags, add cheaper items
   to the end of tier 2 rather than lowering the reach goals.
4. **The burrow expansion** is a big engineering item. Plan it now as the
   top long-term goal, or leave it for a later update?
5. **Supporter +25%.** Is that the right size? At 20%, with the seasonal
   cosmetic, it's gentler when friends compare burrows.
6. **Invites need the referral verb.** Ship the rest first and add
   invites when that lands, or hold the friends rework for it?
7. **A week of internal play** (already planned in `rabbit-pets.md` §9)
   should run on these numbers, with the model as the check.
