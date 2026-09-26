# Rabbit Pets: notifications that fit the player

Status: **proposal, 2026‑09‑25**. Nothing built. Extends reminders (§4.10)
in [`rabbit-pets.md`](./rabbit-pets.md) and the friend notices in
[`rabbit-pets-visits.md`](./rabbit-pets-visits.md).

**Decisions already taken** (2026‑09‑25):

- **No fixed quiet hours.** The platform's 22:00–08:00 window was removed on
  purpose. A fixed window punishes people who keep other hours, and it
  isn't coming back in any form, not even as a game-side rule.
- **Not every notification is wanted.** An engaged player may want every
  nap and oven timer. A casual player wants to hear that a friend dropped
  by, and little else. One on/off switch for "reminders" can't serve both.

## 1. What goes out today

| Kind | Sent by | Starts it | Pushes when |
|---|---|---|---|
| `nap-done` | game (scheduled) | player naps her | nap end (2h) |
| `treat-ready` | game (scheduled) | player bakes | 1h later |
| `garden-ready` | game (scheduled) | a plot is growing | soonest ripe plot (4–12h) |
| `daily-gift` | game (scheduled) | today's gift claimed | 09:00 after the 05:00 rollover |
| `misses-you` | game (scheduled) | any visit | ~21–24h after the last visit, every day |
| home from holiday | game (reuses `misses-you`) | holiday starts | holiday end |
| gift received | platform | a friend sends one | at once |
| visit | platform | a friend visits | at once |

What's wrong with that:

- **All or nothing.** The game's one switch, asked on the first nap or bake,
  turns on every scheduled kind. A player who wanted a nap nudge also gets
  the garden, the gift and "misses you".
- **The friend notices ignore that switch.** They're sent by the platform
  and gated only by the account-wide Games and Game reminders settings. A
  player who said "not now" in the game still gets them.
- **Timing ignores the player.** A golden carrot planted at 15:00 pushes at
  03:00. "Misses you" and the holiday return fire at whatever clock time the
  last visit happened. A friend in another time zone can push at any hour.
- **"Misses you" never lets go.** It fires every day for as long as the
  player stays away.
- **One notice is wrong.** A nap started after 20:00 ends after 22:00, when
  she's asleep for the night, yet the push says "awake and wants to play".

## 2. Proposal

### 2.1 Three groups, not one switch

| Group | Contains | Default |
|---|---|---|
| **Friends** | gift received, visit | on |
| **Her day** | daily gift, "misses you", home from holiday | on |
| **Timers** | nap done, treat ready, garden ready | off |

A group that's on goes to the bell, and pushes if the account's Games and
Game reminders settings allow. A group that's off sends nothing: the burrow
already shows timers, the gift and what happened while you were away, so
the bell has nothing to add.

**Timers can also be asked for one at a time.** Starting a nap, a bake or a
planting shows a small "Remind me" toggle, off by default and remembered per
kind. A one-off request is honoured even with the Timers group off: the
player just asked for it.

### 2.2 The ask: presets, at the right moment

The first-nap prompt goes. On the player's **second day** (their first
return visit, when we know they're coming back) the game asks once:

> **How should Clover keep in touch?**
> - **The important things** (recommended): friends, and her daily gift
> - **Everything**: also naps, treats and the garden
> - **Only friends**
> - **Nothing for now**

Each preset maps onto the three groups. The groups can be changed any time
under **More → Notifications**, which replaces today's Reminders row. A
player who starts a timer on day 1 sees the "Remind me" toggle, which works
before the ask.

### 2.3 Timing: her usual hours, not a clock

Non-urgent notices go out during the hours **this** player tends to play,
learned from their visits.

- **Learning.** On every visit the game adds the local hour to a 24-slot
  count, decayed so the last two weeks matter most, stored in
  `v1:settings`. "Usual hours" is the smallest span of the day that covers
  90% of visits. For one player that's 07–23; for a night owl, 11–03.
- **Until it knows.** With fewer than 3 visits on different days, the
  window is the hours seen so far, widened by 3h each side.
- **What moves.** Garden, gift, "misses you" and home from holiday: if one
  would land outside usual hours, it goes out at the start of the next
  usual window instead.
- **What doesn't.** A timer the player asked for goes out on time. They set
  it in motion; if they nap her at 01:00 and want the nudge at 03:00, so be
  it.
- **Friends' notices** follow the same window (see 2.5), so a friend in
  another time zone doesn't wake anyone. The bell entry still lands at once.

This keeps the design goal of no fixed quiet hours: nothing assumes people
sleep 22–09, but nobody gets pushed at 3am unless they asked for it.

### 2.4 Fewer, and backing off

- **"Misses you" backs off:** after 1 day, then 3, then 7, then stops until
  the next visit. The lines soften as it goes ("keeps looking at the door",
  then "saved you a spot on the cushion", then "hopes you're well").
- **A daily budget:** at most **2 pushes a day** from the game's own
  reminders, in priority order (asked-for timer, then gift, then "misses
  you", then the garden). Anything over budget goes to the bell only.
  Friends' notices count separately (2.5).
- **Noticing when nudges don't work.** The game knows when each reminder was
  due. If a push isn't followed by a visit within 3 hours, 3 times running
  in one group, the next visit asks gently: *"Clover's been nudging you a
  lot. Keep her notes on?"* This never switches anything off silently.

### 2.5 Friends' notices: one push a day, then a running tally

- **The first** gift or visit of the day pushes (inside usual hours, or at
  the start of the next window). Later ones that day go to the bell and
  update the same notice: *"pip_fan and 2 others visited Clover."* (No
  rabbit names: still usernames only, as in the visits doc.)
- **Collapse per app per day**, not per sender as today, so three friends
  don't mean three pushes.

## 3. Platform changes

Game-scheduled reminders need nothing new: the game simply doesn't schedule
a group that's off, and picks the time. **Friends' notices are sent by the
platform**, so it has to know the player's choice and window.

- **New verb** `notifications.preferences.set({ social, window })`, with
  `social: boolean` and `window: { from: 0–23, to: 0–23 } | null` (local
  hours; `null` means no window), and a matching `get`. It's stored per
  (app, user) with the tz the SDK already sends. It's generic: any game with
  friend notices can use it. Gated on `bridge:social`.
- **`AppSocialNotifier`**:
  - skips the push and bell entry when `social` is off;
  - writes the bell entry at once otherwise;
  - sends the day's first push, or, outside the window, upserts a
    scheduled row (key `friends`, so it collapses) at the window's start,
    which the existing cron delivers;
  - rewrites the pending row's body to the running tally;
  - collapses per `app_social:{slug}:{local day}`.
- **Hosts**: the new verb in `games.js` and `AppHost.tsx`; SDK types and
  tests.
- The account-wide Games and Game reminders switches stay as they are: the
  master controls, above the game's own.

## 4. Game changes

- **`v1:settings`**:
  - `reminders: 'on' | 'off' | null` becomes
    `notify: { friends, day, timers } | null` (null = not asked);
  - adds `remindMe: { nap, bake, garden }`, `hours: number[24]`, and
    `backoff` state for "misses you".
  - **Migration:**
    - `on` becomes Everything (they asked when starting a timer);
    - `off` becomes Nothing;
    - `null` stays not asked.
- **`reminders.ts`**: groups, budget, usual-hours shifting and the "misses
  you" back-off, all pure and tested as today. Skip `nap-done` when the nap
  ends after bedtime.
- **UI**: the day-2 preset sheet; More → Notifications (three toggles with a
  one-line description each); the "Remind me" toggle on nap, bake and
  plant; the gentle "too many nudges?" prompt.
- **Harness**: mock the preferences verb; a `hours=` param to seed a play
  pattern.

## 5. Plan

1. **Game only, no platform change:**
   - groups, presets, the day-2 ask, "Remind me";
   - usual hours for scheduled reminders, the budget and the "misses you"
     back-off;
   - the nap-at-bedtime fix.

   Friends' notices keep today's behaviour until step 2.
2. **Platform:** `notifications.preferences.*`, the friends window, and the
   daily tally in `AppSocialNotifier`; then the game sends its preferences
   on every change and on each visit (the window drifts).

## 6. Open

1. **Defaults for players who never answer the ask.** Proposed: Friends on
   (the platform already sends these), Her day and Timers off.
2. **The budget number.** 2 a day is a guess; revisit with real data.
3. **The window threshold** (90% of visits, 2-week decay, 3 visits to
   learn). Tune once there's play data.
4. **Should Friends be split** into gifts and visits? Proposed: no, one
   group, until someone asks.
