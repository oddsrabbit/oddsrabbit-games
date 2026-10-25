# Word Rush

A daily word-grid game for OddsRabbit with two modes. Both trace words through touching letters (diagonals too, each tile once) and follow the same week: a 4×4 Monday to Thursday, a 5×5 Friday and Saturday, and a shaped board on Sunday (Corners, Hollow, Lantern in turn; `shapeForPuzzle()` in `src/puzzle.ts`).

**Ranked** (`src/sprint.ts`, rules in `src/sprint-rules.ts`; "Sprint" is its name in the code), the competition with the daily leaderboard:
- Everyone gets the same board, hidden until Start. A guest who runs it can't sign in and run it again ranked on the same device that day (`word-rush:guest-ranked` in localStorage). You have 90 seconds on a 4×4, 2 minutes on the 5×5 and shaped boards (`sprintMs()`), and one run a day. Words of 3+ letters score classic Boggle points by length: 3–4 letters 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11.
- When the clock stops your base points lock in, with a provisional place ("#4 of 23 so far").
- **When the day closes** (just after midnight UTC, `WordSprintSealer` in the backend), every word nobody else found scores double. Each row is rated `round(1000 × final / day's best)` so every board size weighs the same, and `results-N` records how many players found each word.
- The next day a results card shows your final place, "42 + 9 rare-word bonus = 51", your words with how many found them, the best words nobody found, and the most-found words you missed. The end-of-day push links to it.
- Leaderboards: today ("So far", base points), a closed day (final points), and the month (best days by rating, through yesterday).

**Feel** (shared): paw-print trails (`src/tracer.ts`), live green/amber tracing, synthesised sounds (`src/sound.ts`), floating points, praise banners and confetti (`src/juice.ts`). OddsRabbit gold (#FF8D00) marks the big moments and the brand blue the links and tabs. Results cards show yesterday's podium.

**Sharing** (`src/share.ts`): one sheet with the host's share (the phone's own sheet in the app), copy, X / Threads / Bluesky / WhatsApp / Reddit / Facebook intents, and a 1080 px picture. Nothing shared shows the board's letters. Posting straight to the OddsRabbit feed needs an `actions.publishPost` bridge verb the SDK and hosts don't have yet (the backend's `AppPublishPostService` and `/apps/{slug}/posts` exist); add it to the sheet once they do.

**Casual** (`src/casual.ts`, rules in `src/game.ts`), the relaxed one:
- Its own board behind a start card, untimed. *Play past boards* lists the last 30 days' casual boards (fetched with `content.daily`); they're saved per day (`casual-N` in storage) and don't count toward the stats.
- Untimed. Find every everyday word to clear it; rarer words count as bonus words. Hints: *Show word starts* and *Reveal a word* (revealed words don't score).
- Score `floor(1000 × found / total) × 100 + min(bonus, 99)` on `casual-N`. Under the board: "62% of 40 players found every word without reveals", your place ("You're ahead of 70% of players"), and the top 10 with you among them at your live score (or below them at your place). *See the full leaderboard* opens Everyone (top 100) and Friends (`showCasualLeaderboard()` in `src/leaderboard.ts`). It refreshes after each score sent and every minute while on screen.

It's a Boggle-style game, but "Boggle" is a Hasbro trademark: never use the name in the title, store listing or keywords. The letter weights are our own, not a copy of any dice set.

## Build and deploy

Lives in the private games repo. Types and the shared leaderboard UI come from the SDK source at the repo root (see `tsconfig.json`), and the build reads the root `dist/` for the cache-bust hashes.

```bash
(cd .. && npm run build)            # the SDK first
npm install
npm test && npm run type-check
npm run build                        # → dist/word-rush/
```

The deploy workflow ships `dist/word-rush/` to `apps.oddsrabbit.com/word-rush/` (see the root README's *Deploying*). `dist/sdk-v1.js` and `dist/leaderboard-v1.css` are copies for the harness only.

### Boards

```bash
npm run gen-boards                       # 400 days from puzzle-0 → data/word-rush-boards.json
npm run gen-boards -- --preview 7        # print a week of boards, write nothing
npm run gen-boards -- --days 30 --stats  # word-count spread per shape
```

Copy `data/word-rush-boards.json` to the backend's `tools/data/` and deploy. The provisioning cron (`cron/provision-daily-content.php`, through `WordGridProvider`) seeds each day 30 days ahead and alerts when fewer than 30 days of boards are left. Regenerating is safe: boards are seeded from their index, and a day already seeded on the server is never rewritten.

### Launch checklist

1. **Pick the launch day** and set it as the epoch in all three places: `EPOCH` in `src/puzzle.ts`, `'epoch'` for `word-rush` in the backend's `DailyGameRegistry.php`, and the boards file (rerun `npm run gen-boards`, which writes `EPOCH` into it). It's `2026-10-07` (a Wednesday). `WordGridProvider` refuses a file whose epoch doesn't match the registry. The backend's `WordSprintSealerTest` also hard-codes the epoch; update it too.
2. Copy the boards file to the backend's `tools/data/` and check the two copies match (`sha256sum`): a stale copy once shipped boards with blocked words. Deploy, and run `tools/setup-apps-platform.php` to seed the app row. It's seeded `admin_only`.
3. Run the deploy workflow (root README, *Deploying*). It ships `dist/word-rush/`, including `icon-512.png`, which the manifest points at, and bumps the cache version.
4. Run the provisioning cron once by hand and check `puzzle-0` was seeded (before launch it seeds from day 0 and doesn't alert). If any `puzzle-N` rows were seeded from an older boards file, delete them first: a seeded day is never rewritten.
5. Play it as an admin, then flip it public: `POST /admin/apps/word-rush {adminOnly:false}`.

## How it works

- **Boards are generated offline** (`src/generate.ts`, `tools/gen-boards.ts`), two per day from different seeds. Letters are drawn from weighted frequencies with a vowel share of 30–45%, at most two of a letter on a 4×4 (one S, to keep plurals down) and one of J/Qu/X/Z. Each candidate is solved against ENABLE. A casual board needs its required words inside `BANDS` and a long star word; a Sprint board needs its total words (3+ letters) inside `SPRINT_BANDS`. Neither may have a blocked word traceable on it, and the day must fit the backend's 16 KB content cap. Each board is the most interesting of the first few that pass (most long words). The whole run is seeded from the puzzle index.
- **Required vs bonus:** a word on the board is *required* if it's in the 12dicts frequency list up to tier 16 (`--tier`), else it's *bonus*. Tier 17 and up start letting in DEMUR, RIME and UREA.
- **One solver** (`src/board.ts`): a trie plus depth-first search, abandoning a path as soon as no word starts with it. It solves a 5×5 against all of ENABLE in milliseconds. The game uses the same code for typed input and hints.
- **Content** is served by `content.daily` on `puzzle-N` as `{ v: 2, sprint: { shape, rows, cols, tiles, words }, casual: { …, words, bonus, star } }` (`parseDay()` checks it). A tile is one letter or `"QU"`, or null for a hole. The client caches it under `day`; play is stored under `sprint` and `casual`.
- **Round keys:** `puzzle-N` is the Sprint, so every backend feature keyed on it (season, push, Top today, podium) is the Sprint's. `casual-N` holds casual scores and feeds none of it. `results-N` is written when the Sprint day closes.
- **Sprint scores** are sent once, when the clock stops (no keepBest), with a bitmask `f` of the words found. `AppScoreVerifier` recomputes base points from it, keeps the mask for the sealer (hidden from other players' reads until the day is sealed), and refuses scores once the UTC day is over (30 s grace for requests in flight) or `results-N` exists (`scores/round-closed`). A send that fails is retried on resume, back online, from the done screen's Try again, and on the next open. The start time is saved before the board shows, so reopening mid-run resumes the same clock (server time via `time.now`).
- **Casual scores** go with `keepBest` a few seconds after each find, with masks over `words` and `bonus`; the verifier recomputes them and stores counts only.
- **Cheating:** the checks stop invented scores and words that aren't on the board, not a player who runs a solver. Any letter grid can be solved offline, and the word lists ship to the client. The rare-word bonus makes a solver more tempting, so watch for implausible runs.

## Mirrored elsewhere

These live in other repos and must change together with this one:

| Here | Backend (`Local Sites/oddsrabbit/app/public`) |
|---|---|
| `EPOCH` (`src/puzzle.ts`) | `DailyGameRegistry::games()` `word-rush` epoch |
| `scoreFor()`, mask encoding (`src/scoring.ts`) | `AppScoreVerifier::scoreWordGrid()` / `maskIndices()`; `AppScoreBounds` `word-rush` (0–100,099) |
| `pointsFor()`, `finalPoints()`, `ratingFor()` (`src/sprint-rules.ts`) | `AppScoreVerifier::sprintPoints()`; `WordSprintSealer::compute()` |
| Round keys `puzzle-` / `casual-` / `results-` | `AppScoreVerifier` branches on them; `DailyGameRegistry` `sealRound`, `seasonThroughYesterday` |
| Content shape (`src/puzzle.ts`) | `WordGridProvider` serves the file as-is; the verifier and sealer read `sprint.words`, `casual.words`, `casual.bonus` by position |

## Local play

```bash
npm run build && python3 -m http.server 8766
# http://localhost:8766/dev/harness.html
```

`dev/harness.html` stands in for the host: it serves days from `data/word-rush-boards.json`, keeps storage in localStorage, fakes five other players, and closes past days the way the sealer does. Parameters (listed at the top of the file): `day=N` (default 3; it moves the server clock, so days before launch work), `yesterday=1` (you played yesterday: shows the results card), `ran=1` / `ending=1` (a Sprint already over / with 20 seconds left), `closed=1`, `tallying=1`, `fresh=1`, `user=0`, `dark=1`, `chrome=app`, `late=N` (start N seconds before midnight UTC: Start's cutoff and the day rolling over), `sendfail=N` (the first N ranked submissions fail as if offline). Like the real hosts, it sends `init` to the first page load only, so a game that reloads itself hangs here too: the day rolls over in place (`startDay()` in `src/main.ts`).

## Data and licences

- `data/enable1.txt`: ENABLE word list, public domain. The accepted dictionary.
- `data/12dicts-2+2+3frq.txt`: from Alan Beale's 12dicts 6.0.2, public domain. Picks the required words.
- `data/ldnoobw-en.txt`: [List of Dirty, Naughty, Obscene, and Otherwise Bad Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), © Shutterstock, CC BY 4.0. Used offline only, to keep words off boards. `data/blocklist-extra.txt` adds our own.
- `icon/icon.svg`: ours; `node icon/render.mjs` renders the PNGs (uses Playwright from `../promo-kit`).
