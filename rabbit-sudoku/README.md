# Rabbit Sudoku

A daily 9×9 sudoku for OddsRabbit. Calm, gently ranked: one shared puzzle a
day, with no clock. The day's board ranks solves by hints, with equal scores
sharing a place, and lists who started but hasn't solved it yet. You keep a
streak, and hints explain the next step. The plan is
[../docs/proposals/rabbit-sudoku.md](../docs/proposals/rabbit-sudoku.md).

**Status:** launched 2026-11-09. The engine, the puzzles file, the client and the server side are built.
The client has two screens:
- **Home:** today's puzzle, streak, the week tinted by difficulty, friends who
  solved it, and a countdown to the next puzzle. The friends card opens the day's
  board, as does *See how everyone did* on the solved sheet.
- **Play:** the grid, Undo, Erase, Notes and Hint, and a row-of-nine pad.

It also has settings (vibration on touch devices only), help and the solved
sheet.

**Race it** (`src/race.ts`, proposal §2.9) is the opt-in race on the same
puzzle:
- It's offered under Play to signed-in players who haven't opened the day.
- The clock runs on real time from a server-timed start row (`race-N`) and
  doesn't pause.
- There are no hints and no mistake check. *Leave race* drops you into the
  calm game.
- The day's board gets a *Race* tab, led by your place and your friends'
  times.
- The web repo's `AppScoreVerifier::verifySudokuRace` times the finish and
  refuses times under the tier's floor.

*Show my time* in settings turns on a private timer for calm play, shown only
to you and never ranked.

The look is Word Battle's family, the same as chess: a sheet over a band of
art (here, a slice of sudoku board in the icon's rust, with the eared title
card on it), white cards,
Bricolage Grotesque headings, and rust and green. It uses Word Battle's token
names, but its neutrals are a cool white and grey instead of warm paper. Its
font is copied from `../word-battle/fonts` at build time. It is light only, on
purpose, and doesn't follow the host's dark theme.

The icon (`icon/`) is a tilted sudoku box wearing rabbit ears, on the rust of
the Play button. `icon.svg` is the source; `icon-512.png` ships with the build
and `icon-1024.png` is for stores. The digits use Bricolage Grotesque, so
render the PNGs from a page that loads that font.

Because `package.json` now has a `build` script, `scripts/release.mjs` ships
this folder on the next push to `main`. It lands at
`apps.oddsrabbit.com/rabbit-sudoku/`, reachable by URL but in no catalog until
the app row exists.

## Play it locally

```bash
(cd .. && npm run build)   # the SDK first
npm install && npm run build
npm run serve              # then open http://localhost:8770/dev/harness.html
```

`dev/harness.html` stands in for the host. It serves days from the puzzles
file, keeps your saves in this browser, and fakes five friends. Parameters
(listed at the top of the file):

- `day=N`: the day to play (default 7, a Monday).
- `user=0`: signed out.
- `fresh=1`: start over.
- `friends=0`: no friends have solved it.
- `sendfail=N`: the first N Daily submissions fail.
- `chrome=app`: the app's insets.
- `help=0`: skip the first-run help.
- `open=1`: open straight into the puzzle.

## Engine (`src/`)

- `sudoku.ts`: cells (0–80, row by row), the 27 units, peers, candidate masks,
  the 81-character text form (`.` for empty), duplicate checks.
- `solver.ts`: the fast solver. Bitmask depth-first search on the cell with
  the fewest candidates. Counts solutions (stopping at 2), solves, and fills
  random complete grids.
- `logic.ts`: the logic solver. `nextStep()` finds the easiest step a person
  could take. It tries 16 named techniques in order (`TECHNIQUES`), from full
  house to simple colouring, and returns the pattern (cells, digits, units) and
  its placement or eliminations. The game will build hints on it.
- `grade.ts`: a puzzle's tier is the hardest technique it needs (`TIER_OF`).
  A puzzle logic can't finish has no tier and is never served.
- `generate.ts`: generates puzzles in three steps.
  - Fills a random complete grid.
  - Removes clues in 180°-symmetric pairs. A removal stays only if the puzzle
    keeps one solution, stays solvable with the target tier's techniques, and
    stays above the clue floor (`CLUE_FLOOR`).
  - Accepts a puzzle only if it really needs the target tier, at least twice
    from Medium up (`MIN_STEPS_AT_TIER`). Hard must also use two different
    Hard techniques and take at most 3 Hard steps (`MIN_KINDS_AT_TIER`,
    `MAX_STEPS_AT_TIER`), so it isn't XY-Wing after XY-Wing. The tool keeps
    the best of three.
- `puzzle.ts`: the calendar (`EPOCH`, `puzzleIndexAt`), the week
  (`dailyTierFor`: Easy Monday and Tuesday, Medium Wednesday and Thursday,
  Hard Friday, Expert Saturday, Medium Sunday), and `parseDay()` for the content
  blob.

## Puzzles file

```bash
npm install
npm test && npm run type-check
npm run gen-puzzles                        # 400 days from puzzle-0 → data/rabbit-sudoku-puzzles.json (~3 min)
npm run gen-puzzles -- --days 30 --stats   # clue counts and hardest techniques per tier
npm run gen-puzzles -- --preview 2         # print two days, write nothing
```

Each day is `{ v: 2, tier, givens }`, about 100 bytes, far under the
backend's 16 KB per content row. Puzzles are seeded from their day and slot, so the same inputs rebuild the
same file. The 400-day run from 2026-11-11 (after the rebalance: Medium
Sundays, and the Hard mix rule) gave:

| Tier | Days | Clues | Hardest technique needed |
|---|---|---|---|
| Easy | 115 | 32 | hidden single (111), naked single (4) |
| Medium | 171 | 27–31 | naked pair (63), pointing (46), claiming (34), hidden pair (28) |
| Hard | 57 | 24–31 | XY-Wing (56), X-Wing (1); X-Wing used in 49, triples in 14; 2–3 Hard steps |
| Expert | 57 | 24–30 | Skyscraper (24), 2-String Kite (16), XYZ-Wing (10), simple colouring (6), Swordfish (1) |

`EPOCH` is the launch day, `2026-11-09` (a Monday). It must match the
`rabbit-sudoku` entry in the web repo's `DailyGameRegistry` and the `epoch` in
the puzzles file, and it must never move on a live game: it would renumber
every day and its scores. The server serves days from a copy of the puzzles
file at `tools/data/rabbit-sudoku-puzzles.json` in the web repo
(`RabbitSudokuProvider`); when the runway gets low, generate more days here and
copy the file over.

## Tests

`npm test`:

- **Soundness.** Every step of every technique is checked against the true
  solution on 300 hard (minimal) puzzles. No wrong placement and no removed
  answer is allowed, and every technique must fire at least once.
- **Generator.** Each tier comes out unique, symmetric, in tier and
  deterministic.
- **The rest.** Solver, grid basics, calendar and content parsing.
