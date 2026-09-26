# Rabbit Pets: friends' visits that leave something behind

Status: **built 2026‑09‑25**, not yet deployed. Game side in `rabbit-pets/` (`social.ts` `applyVisits`/`rewardVisit`/`guestsToShow`, guests in `render.ts`, care buttons on a friend's burrow). Platform: `visits.*` and `counts` in apps-sdk, both hosts and the backend (migration `20260925_003_create_app_visits.sql`, not yet run). After deploy, press "Bump cache version" for rabbit-pets so its `social.visitLines` reach the stored manifest; until then every push reads "{username} came to visit." Extends friends [F1] in
[`rabbit-pets.md`](./rabbit-pets.md). Covers new `visits.*` bridge verbs
(apps-sdk, both hosts, the WordPress backend) and the game changes in
`rabbit-pets/`.

**Decisions already taken** (2026‑09‑25):

- **A visit is noticed.** Today a visit is local to the visitor: the friend
  never hears of it. After this, the friend gets a push and finds out in
  the game.
- **Your rabbit shows up in their burrow.** When a friend opens the game
  after you visited, your rabbit is sitting in their burrow as a guest. That
  is the in-game notice.
- **A visit carries one small act of care**: pat, snack or brush. It helps
  their rabbit a little. Friends can only help, never harm.
- **Visiting earns clover on both sides.** A little for the visitor, so
  there's a reason to go; a little for the host, so being visited is a
  treat. Only a visit with care pays; a look alone pays nothing.
- **Pushes name the username, never a rabbit.** Rabbit names are typed by
  players, and a push is the one place they would reach someone's lock
  screen unasked. The line comes from the app's manifest, not the game at
  runtime.
- **Clover numbers live in [`rabbit-pets-economy.md`](./rabbit-pets-economy.md).**
  The figures in §2 are the visit rows from there.

## 1. What the player sees

**Visiting** (the visitor's side). Friends' burrows open as today, from
More → Friends → Visit. The bottom panel gains three care buttons next to
"Send a gift":

| Care | Art | Moodline after | Host's rabbit gets |
|---|---|---|---|
| Pat | heart | "Mochi leans into the pat." | +8 joy |
| Snack | carrot | "Mochi nibbles the snack you left." | +8 food |
| Brush | brush | "Mochi's fur is shiny now." | +8 clean |

Picking one plays the local reaction on the friend's rabbit, records the
visit, and pays the visitor **+3 clover**. The three buttons then read
"Visited today" until the next UTC day, the same as the gift button does.
Opening a burrow without picking anything is still a free look and records
nothing.

**Being visited** (the host's side).

- **A push**, if their Game reminders setting allows it, plus a bell entry:
  "sam came by and left a snack." Tapping it opens the game.
- **Guests in the burrow.** On open, the game draws up to **two** visiting
  rabbits on the rug next to her, drawn in their coats and outfits.
  They potter about like she does; while she sleeps they doze. Tapping one shows
  "Clover (sam) brought a snack" in the moodline.
- **More than two visitors** shows a small "+3 visitors" chip over the stage
  that opens a list: who came, when, and what they did.
- **The payout** lands on open, with one toast: "3 friends visited. +12 clover."
  Each visit adds a journal line the first time per friend ("Clover visited
  for the first time").
- **How long guests stay.** A guest stays until the next 05:00 local
  rollover after the host has **seen** them. A visit the host hasn't seen yet
  stays up to 7 days, so a friend who drops by on a day you miss is still
  there when you come back.

## 2. Numbers

Starting values, all in `tuning.ts`:

| What | Value | Why |
|---|---|---|
| Care boost | +8 to one need | About 2½ hours of hunger decay (3/h). Noticeable, not a meal. |
| Care that counts, per host per local day | first **3** visits | Ten friends can't feed her for you: 3 × 8 = 24, about 8 hours of one need at most. |
| Visitor clover | +3 per visit with care, for your first 5 visits a day | |
| Host clover | +4 per visit, for the first 5 a day, only from friends with a verified email (`counts` below) | |
| Clover from friends, received | the first 5 visits and the first 5 clover gifts a local day | A limit on receiving, not just sending, so spare accounts following you can't farm you. |
| Visits sent | 1 per friend per UTC day, 10 a day | Same limits as gifts, in the same kind of policy class. |

These are the visit rows of [`rabbit-pets-economy.md`](./rabbit-pets-economy.md)
§2.2. One friend makes a player 10–15% faster; five or more, about
1.5–1.8×.

Visits beyond the caps still happen: guests still appear and the push still
goes. Only the boost and the clover stop.

Friends' care does **not** count toward her bond or days visited. Those are between the player and her.

If she's on holiday, visits still record and guests still appear when she's
back, but care boosts are skipped (her needs are paused anyway). Clover
still pays.

## 3. Platform: `visits.*` (`bridge:social`)

A sibling to `gifts.*`, not a kind of gift. Two reasons: a visit and a gift
to the same friend on the same day must not use up the same one-per-day
slot (gifts' `uq_pair_day` key), and visits need the visitor's look, which
gifts don't. The platform only carries visits. It never decides what one is
worth, and nothing about them is specific to Rabbit Pets.

| Verb | Payload | Resolves |
|---|---|---|
| `visits.record` | `{ toUserUuid, kind }` | `{ visitUuid, visitedAt }` |
| `visits.inbox` | none | `Visit[]`: last 7 days, newest first, at most 50, **seen and unseen** |
| `visits.seen` | `{ visitUuids: string[] }` (at most 50) | `{ seen: string[], seenAt }`: the uuids **this call** changed |
| `visits.sentToday` | none | uuids the viewer has visited today (UTC) |

```ts
Visit = {
  visitUuid, kind, visitedAt, seenAt: string | null,
  from: { uuid, username, avatar },
  showcase: Record<string, unknown> | null, // the visitor's current snapshot
  counts: boolean, // the visitor's email is verified
}
```

- **`kind`** is the game's word (`pat`, `snack`, `brush`), same pattern as
  gifts: `[a-z0-9-]{1,32}`.
- **The push and bell line** comes from the app's manifest:
  `social.visitLines`, a map from `kind` to a line with one placeholder,
  `{username}` (`{ "snack": "{username} came by and left a snack." }`).
  An unknown kind, or an app without the map, gets
  "{username} came to visit." Nothing the game sends at runtime and nothing
  a player types reaches the push. The manifest is admin-registered, so the
  lines are reviewed once. `src/schemas/manifest.ts` gains the optional
  field: at most 16 kinds, 80 characters each.
- **`showcase`** is joined from `app_showcases` on read, so the host's game
  draws the visitor as they look **now** with no second call per guest.
  `null` if the visitor never published one. The host's game runs it
  through `readShowcase` like any friend's snapshot.
- **`seen`** replaces claim-once. `visits.seen` resolves only the uuids
  **this call** moved from unseen to seen, and the game pays out for exactly
  those. If two devices open at once, each visit pays on one of them.
- **Errors** reuse the gift shapes under `visits/*`: `invalid`,
  `not-connected`, `already-visited-today`, `too-many`, `rate-limited`.
  None retire the verb. `inbox` and `sentToday` resolve `[]` when signed
  out or unsupported.
- **`counts`** says whether this visit may pay the host clover (see the
  economy proposal §2.2). The server works it out; the game only reads it.
  `gifts.inbox` rows gain the same field.
- **Blocks** hide visits both ways, including old ones, as the gifts inbox
  does.

**Backend** (WordPress):

- `migrations/2026MMDD_NNN_create_app_visits.sql`: `oddsrabbit_app_visits`,
  modelled on `app_gifts`: `uuid`, `app_uuid`, `from_user_id`,
  `to_user_id`, `kind`, `visited_at`, `visited_day` (generated),
  `seen_at`. The key `uq_pair_day (app_uuid, from, to, visited_day)` makes
  two racing records impossible.
- `AppVisitPolicy` (pure, tested) and `AppVisitService`, next to
  `AppGiftService`. `notify()` is the same as gifts: bell entry of type
  `app_reminder`, push when `reminderPushOptIn` allows it,
  `collapse_id = app_visit:{slug}:{fromId}`. Worth pulling that shared
  notify into one helper rather than copying it.
- Routes under the social base in `apps-routes.php`: `POST /visits`,
  `GET /visits/inbox`, `POST /visits/seen`, `GET /visits/sent-today`.
- `AccountErasureManifest`: the new table, deleted by `from_user_id` and
  `to_user_id`. `SQL_TABLE_SCHEMA.md` entry.

**Hosts and SDK:**

- `messages.ts`: the four verbs, `VISIT_ERROR_CODES`, `VisitSchema` and the
  result schemas. `sdk.ts`: `OR.visits.*`. README entry. Tests alongside
  `social.test.ts`.
- `games.js` and `AppHost.tsx` / `app.service.ts`: the verbs and
  `HOST_CAPABILITIES`, shape checks only, as for gifts.
- `dev/harness.html`: fake answers, so the guest drawing can be
  worked on without a backend.

## 4. Game changes (`rabbit-pets/`)

- **`social.ts`** (pure, tested):
  - `VISIT_CARE` (the three kinds, their need and their line).
  - `applyVisits(pet, visits, now, tz)`: pays out a batch, counting against
    the per-day caps.
  - `guestsToShow(visits, now, tz)`: unseen visits, plus ones seen since
    today's rollover, newest first, one per friend.
- **`sim.ts`**: `PetState.visitsToday: { day, care, clover }` counts toward
  the caps. It lives in `v1:pet` so it syncs with everything else.
- **`render.ts`**: draw up to two extra rabbits. The rabbit drawing already
  takes coat and dress, so this is two more calls with a smaller wander
  area and the `guest` flag (no need icons). Guests layer by depth with
  decor, like she does.
- **`main.ts`**:
  - On boot and on resume: `visits.inbox`, then draw guests, then
    `visits.seen` for the unseen ones and pay out on the resolve, then one
    toast.
  - In `visitFriend`: the care buttons, `visits.record`, and
    `visits.sentToday` to grey them out.
  - All of this is gated on `OR.capabilities.has('visits.record')`.
- **Widget**: nothing for now. A guest could show on it later ("Clover is
  visiting").

## 5. Plan

1. Settle this document and the economy (`rabbit-pets-economy.md`).
2. Platform: migration, policy and service with PHPUnit tests, routes,
   `games.js`, SDK schemas and tests, harness. Web first.
3. Game: pure functions and tests, then guests in the renderer, then the
   visit screen's care buttons.
4. Mobile host: `AppHost.tsx`. It ships with the next app release; the
   game hides everything until the capability is there.

Exit criterion: A visits B on web and taps Snack. B gets a push on the
phone. B opens the game and sees A's rabbit on the rug. B's food is 8
higher, B has 4 more clover and A has 3 more (before the clover rate). Opening again pays nothing
more, and the guest is gone after B's next 05:00.

## 6. Settled and open

Settled 2026‑09‑25:

- **Push text** names the username only, from manifest lines (§3).
- **Mark-seen** pays only for the uuids the call changed (§3).
- **A look without care** pays nothing.

Open:

1. **Pet-sitting on holiday** (from the earlier discussion) would build on
   this: while the host is on holiday, care from visits could count toward
   the welcome-home summary. Left for later.
