# Rabbit Sudoku (a calm daily sudoku, and casual puzzles that teach)

Status: **engine built 2026-11-08; client and server not started.** Covers a new
`rabbit-sudoku/` game in this repo and the small amount of WordPress work behind
it (`Local Sites/oddsrabbit/app/public`). It needs **no new bridge verb, no
schema change and no host release**: `content.daily`, `scores.submit` and
`scores.friends` already exist on every host.

**What's built** (`rabbit-sudoku/`, see its README): the engine, plus a client
with home and play screens and a dev harness. The engine includes:

- the grid model, a fast solver, a logic solver with 16 techniques, the grader
  and the generator;
- `npm run gen-puzzles`, and a 400-day puzzles file;
- 15 tests, including a soundness check of every technique against the true
  solution.

**Decided 2026-11-08:**

- The name is **Rabbit Sudoku** and the slug `rabbit-sudoku`. "Sudoku" is a
  Nikoli trademark in Japan only, so anything Japanese-localized says *Number
  Place* (ナンプレ) instead.
- **9×9.**
- **The Daily isn't timed, and it's ranked gently, by hints** (2026-11-10, see
  §5). It's one shared puzzle a day: the board ranks solves by hints with ties
  sharing a place and lists who has started, and you keep a streak and a
  calendar.
- **Guests can't play the Daily.**
- **No Casual: just the one daily puzzle.** It has no clock, and anything below
  that still mentions Casual is superseded. The content shape became
  `{ v: 2, tier, givens }`.
- **The look is Word Battle's family, the same as chess, light only.** The home
  screen matches Word Battle's: a grid-art band, a sheet over it, and today's
  puzzle as the spotlight card. It uses Word Battle's token values and its
  Bricolage Grotesque font, copied at build time, and wooden-tile number keys.
  There's a vibration toggle on touch devices, as in Solitaire. This replaces
  the earlier pixel-paper look, so §2.7's mock directions no longer apply.

## 0. The short version

**Why.**

- **It fills a gap.** Every daily game today is words, places, cards or
  drawing. Nothing is a number or logic puzzle, and two of the five dailies are
  English word games.
- **No language needed.** Sudoku needs none, and the feed translates posts on
  demand (`cron/process-translation-queue.php`), so some players read other
  languages.
- **Content costs nothing.** Puzzles are generated, not written: a year takes
  about three minutes to generate.
- **It adds a slower slot.** Sessions run 5–25 minutes, a lean-back slot beside
  the quick dailies.
- **It's a proven daily habit.** NYT Games runs three sudoku a day.

**What it is.**

- **Daily**: one 9×9 for everyone, getting harder through the week. Signed in,
  no clock, no ranking. Solving it marks your day, keeps your streak and shows
  you to friends as "solved today".
- **Casual**: four puzzles a day (Easy, Medium, Hard, Expert), the last 30
  days', and every past Daily. Open to guests, with a personal clock that
  pauses, notes, an optional mistake check, and hints that explain the next
  step.

**The engine** is one logic solver used three ways:

- it grades each puzzle's difficulty;
- it guarantees no puzzle needs guessing;
- it will power the hints.

## 1. What exists, and what is missing

### 1.1 Reusable as-is

- **Daily content.**
  - `DailyGameRegistry::games()` sets the epoch, the `puzzle` prefix, the
    provider and the runway alerts.
  - `ContentProvisioner` seeds `puzzle-N` rows ahead of time.
  - `WordGridProvider` (Word Rush's finite JSON list with an epoch guard) is the
    provider to copy.
  - `content.daily` is public and date-gated, at most 16 KB a row.
- **Rows and friends.** `scores.submit` writes one row per player per round, and
  `scores.friends` lists the people you follow who have a row. That's "solved
  today" without any scoring.
- **The end-of-day push** already has a nudge mode, "a new round is live"
  (`DailyGameRegistry::PUSH_NUDGE`). No game uses it yet.
- **The client skeleton**, all from Word Rush:
  - `main.ts`: boot, the cached day, in-place day rollover, deep links, help
    shown once;
  - `ui.ts`: `OR()`, `readJson`/`writeJson`;
  - `build.mjs`, `test.mjs`, `dev/harness.html`, `share.ts`, `sound.ts`,
    `juice.ts`.
- **Shipping.** `scripts/release.mjs` picks up any top-level folder whose
  `package.json` has a `build` script. Merging that to `main` deploys it, and
  the catalog row is seeded `admin_only` until it's flipped.

### 1.2 Missing

- The game client (§6).
- WordPress (§7): a provider, the registry entry, a way to choose nudge mode for
  the push, its copy, the app row and bounds.

### 1.3 SDK notes that touch this game

- **The transport has no request timeout** (`src/sdk/transport.ts`). A Daily
  solve is sent with `scores.submit` and retried until it lands, and that retry
  needs a rejection to act on. Either add a default timeout to the transport, or
  wrap the call in one in the game.
- **Durable score submission is rebuilt in each game** (Word Rush, 2048 and
  RabbitGlobe each have their own). A shared helper would save writing another
  copy.

## 2. The game

### 2.1 Two modes

| | Daily | Casual |
|---|---|---|
| Puzzles | one a day, the same for everyone | four a day (Easy, Medium, Hard, Expert), the same for everyone; the last 30 days'; every past Daily |
| Who | signed-in players | everyone, guests included |
| Difficulty | set by the weekday (§2.2) | the player picks |
| Clock | none | personal; pauses when hidden or on tap; can be hidden |
| Notes | by hand, or *Fill notes*; cleared from peers on placement | the same |
| Mistakes | duplicates flagged; optional *Show mistakes* | the same |
| Hints | explained, step by step (§2.5) | the same |
| Counts for | your streak and calendar; "solved today" for friends | your stats |

The Daily isn't ranked, so nothing in it needs protecting: its assists are
Casual's. Whether hints should break a streak is an open question (§10).

The game opens on the Daily until today's is solved, then on Casual. A guest
opens on Casual, and the Daily tab offers sign-in.

### 2.2 The week

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Easy | Easy | Medium | Medium | Hard | Expert | Medium |

Monday welcomes people in, and Saturday is the big one. The generator writes each
day's tier into its content, so the client shows it rather than working it out
(`dailyTierFor()` in `src/puzzle.ts`).

### 2.3 Difficulty is the hardest step you need

| Tier | Needs, on top of the tier before | Clues | Median solve (to calibrate) |
|---|---|---|---|
| Easy | full house, hidden single, naked single | 32–33 | ~4 min |
| Medium | pointing, claiming, naked and hidden pairs | 27–32 | ~8 min |
| Hard | naked and hidden triples, X-Wing, XY-Wing | 24–34 | ~15 min |
| Expert | Skyscraper, 2-String Kite, XYZ-Wing, Swordfish, simple colouring | 24–32 | ~25 min |

- **Logic only, by construction.** A puzzle the solver can't finish is thrown
  away. Every puzzle can be solved without guessing, and the hint button always
  has a next step it can explain.
- **Each tier is earned.** From Medium up, a puzzle has to use its tier's
  techniques at least twice. The generator keeps the best of three candidates:
  most steps at the tier, then fewest clues.
- **Hard mixes its techniques.** In the first file Hard was nearly always
  XY-Wing (502 of 514), because it sits last in the Hard list. A Hard puzzle
  now has to use two different Hard techniques and take at most 3 Hard steps.
  Moving XY-Wing up to Expert was tried and dropped: puzzles that need an
  X-Wing but nothing harder are rare, and they play close to Medium.
- **Rebalanced 2026-11-11.** Sunday went from Hard to Medium, so two days in
  seven need advanced patterns, not three. Saturday stays the Expert day.

### 2.4 A Daily, start to finish

1. **Daily tab**:
   - `#N · Thursday · Medium`;
   - your streak;
   - the month's calendar of solved days;
   - avatars of friends who've solved today's (`scores.friends`);
   - **Play**.
2. **Play.** The board saves as you go (debounced, plus `lifecycle` pause and
   `pagehide`), so it picks up where you left off on any device.
3. **Solved** when the last cell fills with no duplicates. A full grid with no
   duplicates that keeps the clues is the one solution, so this needs no
   solution on hand. The game then sends
   `scores.submit({ roundKey: 'puzzle-N', score: 1, metadata: { hints } })`
   and retries until it lands (§5).
4. **Done screen**: a small celebration, the streak, friends who solved it, Share
   and *Play Casual*.

**Days** run on UTC midnight, like every daily on the platform. A Daily finished
after its day still counts for that day's streak if the submit lands; the server
takes rows for any open `puzzle-N`.

### 2.5 Hints, in three taps

1. *Look here*: highlights a row, column, box or a few cells.
2. *Why*: one sentence, e.g. "Hidden single: in box 5, 7 fits only here."
3. *Do it*: places the digit or removes the candidates.

If a digit the player entered is wrong, the hint says that first rather than
reasoning from a broken board. Hints reason from the true candidates of the
current board (`stateFrom()` then `nextStep()`), not from the player's notes.
The pieces for the copy are on each `Step`: technique, cells, digits, units.

### 2.6 Screen and controls (phone first)

At 393×852, top to bottom:

- the header row in edge mode (`docs/game-header-guidelines.md`);
- an info strip: tier, `#N`, and the clock in Casual;
- the 9×9 grid, about 40 px a cell inside 12 px gutters, with 3 px box lines;
- the tools: Undo, Erase, Notes, Hint, Fill notes;
- the number pad.

Desktop web keeps the same column, at most ~460 px wide.

- **Number pad**: each digit shows how many are left and greys out at 0. Mock one
  row of nine against five over four.
- **Input**: tap a cell, then a digit. A setting adds digit-first. Tapping a
  filled cell highlights that digit everywhere. Duplicates show in red and with
  a mark.
- **Keyboard on desktop**: 1–9, arrows, Backspace, N, Z. Supported, not
  advertised.
- **Taps only**: `touch-action: manipulation` on the grid and pad, and
  `overscroll-behavior: none` on the page. Test on a real Android phone.
- **Feel**:
  - haptics, with Solitaire's vibration toggle;
  - a sweep along a finished row, column or box;
  - a celebration on solving (`juice.ts`).
- **Accessibility**: labelled cell buttons ("Row 3, column 5, 7, given"); clues
  and entries differ in weight as well as colour; digits of 22 px or more.

### 2.7 Look: mocks first

Not decided. Phase 0 mocks only the grid, digits, notes, pad and the solve
moment, at 393×852, in several distinct directions, for example:

- **A. Pixel paper**, in the Rabbit Pets and Solitaire family: Press Start 2P
  digits, cream paper, 3 px ink borders.
- **B. Night board**, in the Word Rush family: deep blue, gold for a finished box.
- **C. Garden notebook**: graph paper, a carrot on each finished box, a rabbit
  hopping along a finished row.

The mocks must answer one question: are notes legible at Press Start 2P's 8 px
in a 13 px sub-cell on a real phone?

### 2.8 Sharing

Word Rush's share sheet, with no spoilers, e.g. `Rabbit Sudoku #34 · Thu ·
Medium ✅ 🔥5`, the link, and a 1080 px picture. A nice extra is a "solve path"
picture: the grid with each cell shaded by when it was filled.

## 3. Content (built)

- **Generated by** `npm run gen-puzzles`, seeded per day and slot. The file is
  `data/rabbit-sudoku-puzzles.json`, `{ epoch, salt, days }`.
- **One day** is `{ v: 1, daily: { tier, givens }, casual: [easy, medium, hard,
  expert] }`, with each grid 81 characters, `.` for empty. That's about 600
  bytes a day.
- **No solutions are stored or served.** The client solves any grid in
  milliseconds (`solver.ts`) for *Show mistakes*. Nothing is withheld either: the
  Daily isn't ranked.
- **The runway**: the registry's low-runway alert says when to regenerate. 400
  days last about 13 months.
- **The epoch is a placeholder** (`2026-12-01`). Set it with the launch day in
  `src/puzzle.ts` and the registry, then regenerate.
- **Before launch**, a person plays one of each tier to check the labels feel
  right.

## 4. Storage

Per player: 64 KB in all, 16 KB a value.

| Key | Holds | Size |
|---|---|---|
| `day` | today's content, cached | ~1 KB |
| `daily` | `{ index, values, notes, solved, hints, pending }` | ~300 B |
| `casual-<index>-<tier>` | a puzzle in progress; at most 8, oldest dropped | ~250 B each |
| `stats` | streak and best streak, solved days of the last ~3 months, solves and best time per Casual tier | ~1 KB |
| `settings` | input mode, highlights, clear notes, show clock, show mistakes, sound, vibration | small |
| `seen_help` | help shown once | tiny |

Notes are 81 × 9 bits, packed. Undo history stays in memory.

## 5. Rows on the server

- **Ranked by hints, from 2026-11-10.** At launch every solve was `score: 1` and
  the board went by who finished first, which made it a race to play just after
  midnight UTC. Now each day has one row on `puzzle-N`, always sent with
  `keepBest`:
  - **Started**: on the first digit, note or hint, `score: 0`, metadata
    `{ solved: false, hints }`. Shown as "Not solved yet", with no place. Tried
    again on the next move until it lands.
  - **Solved**: `score: 100 - min(hints, 99)`, metadata `{ solved: true, hints }`.
    Retried on resume, on coming back online and on the next open. `keepBest`
    means it always replaces the started row, and a resend is a no-op.
  - **Equal scores share a place** (`rankTies`), so every hint-free solve is first
    together: tiers, not a race. A medal shows only where one player holds the
    place.
  - **Launch-day rows** (`puzzle-0`, `puzzle-1`) were a flat 1. While the day is
    open, the client raises the player's own row to its real score
    (`upgradeLaunchRow`, main.ts), after `scores.rank` confirms the row exists,
    so a guest's solve still never gets one.
  - **Time is never ranked.** A clock that pauses is easy to game (screenshot,
    solve elsewhere, type it in), which is why Solitaire moved to moves.
- **What the rows are for**: the day's board (Everyone and Friends), "friends who
  solved it" on home (solves only), and the platform's notion of who played,
  which the end-of-day nudge uses.
- **Casual writes nothing in v1.**
- **No season board** (`seasonMetric: null`), **not on Top today**
  (`topToday: false`) and no end-of-day results push: the ranking stays on the
  game's own board. The streak and calendar come from the player's own storage.
- **Bounds**: `AppScoreBounds` `'rabbit-sudoku' => ['default' => [0, 100]]`.

## 6. Code layout

`rabbit-sudoku/`, set up like `word-rush/`. ✅ marks what's built.

```
✅ README.md, LICENSE.txt, package.json, test.mjs, tsconfig.json, .gitignore
✅ data/rabbit-sudoku-puzzles.json
✅ tools/gen-puzzles.ts, tools/run.mjs
✅ src/sudoku.ts      grid basics
✅ src/solver.ts      fast solver
✅ src/logic.ts       logic solver: nextStep(), solveLogically()
✅ src/grade.ts       tiers
✅ src/generate.ts    generator
✅ src/puzzle.ts      calendar, week, content parsing
✅ src/rng.ts
   build.mjs          add with the client (see the README)
   index.html, styles.css, icon/
   dev/harness.html   fakes the host: ?day=N ?user=0 ?fresh=1 ?friends=N ?sendfail=N ?chrome=app
   src/main.ts        shell: boot, cached day, Daily and Casual tabs, help, rollover
   src/grid.ts        play state: values, notes, undo and redo, save and load
   src/board.ts       the grid's DOM: highlights, notes, effects
   src/input.ts       pointer and keyboard to actions; the pad
   src/daily.ts       the Daily tab, streak, calendar, submit and retry
   src/casual.ts      puzzle picker, past days, clock
   src/hints.ts       the three-tap hints over logic.ts, with copy per technique
   src/stats.ts, share.ts, sound.ts, juice.ts, ui.ts
```

## 7. Server (WordPress)

| File (under `rest-routes/` unless noted) | Change |
|---|---|
| `services/daily-content/DailyGameRegistry.php` | `rabbit-sudoku` in `games()`: epoch, `seasonMetric: null`, `topToday: false`, provider, `bufferDays` 30, `maxPerRun` 60, `lowRunwayDays` 30; and a per-game push mode so `endOfDayPushGames()` can give it `PUSH_NUDGE` instead of results |
| `services/daily-content/SudokuProvider.php` | new: `WordGridProvider` with a per-day shape check |
| `services/AppGameNotificationService.php` | `notificationCopy('rabbit-sudoku')` for the nudge |
| `services/AppScoreBounds.php` | `[0, 1]` |
| `tools/setup-apps-platform.php` | the app row, `admin_only`, with scopes `bridge:storage` and `bridge:share` |
| `tools/data/rabbit-sudoku-puzzles.json` | copied from this repo; check the copies match (`sha256sum`) |

No verifier, no sealer, no reveal changes. Check that a game with a provider and
`seasonMetric: null` is handled everywhere `games()` is read: today only Rabbit
Draw has a null metric, and it isn't in `games()`.

## 8. Plan

0. **Look**: mocks only (§2.7), in several directions; pick one.
1. **Engine.** ✅ Done.
2. **Client, in the harness**:
   - board, pad, input modes, notes, highlights, undo, autosave;
   - hints and their copy;
   - the Daily tab with streak, calendar and friends;
   - Casual with past days;
   - stats, help, settings, share.

   Then a real-phone pass at 393×852 and on Android.
3. **Server** (§7), with tests.
4. **Launch**:
   1. Pick the launch day, set the epoch in both places, and regenerate.
   2. Copy the file to the backend.
   3. Deploy WordPress and seed the row.
   4. Push this repo.
   5. Run the provisioner by hand.
   6. Play a week as an admin.
   7. Flip it public (`POST /admin/apps/rabbit-sudoku {adminOnly:false}`).
5. **Later, by what players do**:
   - friends' Casual tiers;
   - a Sunday variant (Diagonal first);
   - endless practice;
   - a gentle month board of days solved, if wanted.

## 9. Out of scope for v1

- **Variants** (Diagonal, Windoku, Jigsaw, Killer). Each needs support in the
  generator, the grader and the solver, and Killer also needs cages drawn.
- **Endless practice.** The client could run the generator in a worker; Easy
  and Medium take milliseconds.
- **A translated interface.** The puzzle needs none; the copy does.

## 10. Open questions

1. **Do hints still count toward the Daily streak?** Proposed: yes. It's a calm
   daily, and the hint count shows on the done screen and in the share.
2. ~~**Should Hard need more than XY-Wing?**~~ Settled 2026-11-11: two
   different Hard techniques, at most 3 Hard steps (§2.3). Revisit with real
   hint counts per tier.
3. **Should the end-of-day nudge go out at all?** And to whom: everyone who
   played in the last few days, the way the nudge mode works?
4. **The launch day**, which sets the epoch.
