# Bubble Merge (prototype)

Was Rabbit Merge until 2026-11-16, when the pieces became bubbles; the name moved with them. Keep
"Suika" and "Watermelon Game" out of anything public: Aladdin X claims SUIKA GAME as a trademark.

A drop-and-merge physics puzzle. You drop bubbles into a box, and two bubbles of the same colour
that touch become one bubble of the next size up. The game ends when the pile stays over the box's
rim. It uses the SDK for scores and leaderboards when a host is there, and runs on its own when it
isn't.

## Release

Built by the root `build.config.mjs` into `dist/bubble-merge/` (index.html with its cache-bust
stamps, styles.css, `js/`, and `icon/icon-512.png` as `icon-512.png`), so `npm run release` ships
it to `apps.oddsrabbit.com/bubble-merge/` with the rest. `dev/` stays out of the bundle. On the
web side (`oddsrabbit-wp-theme`):

- `tools/setup-apps-platform.php` seeds it: slug `bubble-merge`, scopes `bridge:storage`,
  `bridge:share` and `bridge:scores`, `admin_only` on the first seed so only admins see it until
  the upload is checked (then `POST /admin/apps/bubble-merge {adminOnly:false}`).
- `rest-routes/services/AppScoreBounds.php` bounds its scores to 0..10,000,000 (the derivation is
  on the entry); `tests/php/Services/AppScoreBoundsTest.php` covers it. Change `POINTS`,
  `GIANT_BONUS`, the drop sizes or `DROP_COOLDOWN` and that bound has to be re-derived.
- Genres are set in the admin panel (Puzzle, plus Casual).

## Run it

Serve the repo root with any static server and open the page:

```bash
python3 -m http.server 8765
# http://localhost:8765/bubble-merge/
# http://localhost:8765/bubble-merge/?mockhost   with a fake host and leaderboard
```

Served from the repo there's no host, so the SDK and the shared leaderboard files 404 and the
game runs on its own: scores stay in this browser and the Leaderboard buttons are hidden.
`?mockhost` loads `dev/mock-host.js` instead, a stand-in host with a signed-in player and two
boards of made-up players, so the leaderboard, submissions and Share can be tried locally.

## Rules

- Drag across the box to aim and let go to drop (on desktop, the mouse aims and a click drops; the
  arrow keys aim and Space drops). There's a half-second wait between drops.
- The next drop is always one of the five smallest sizes, weighted toward the small end. The NEXT
  pill in the header shows what's coming; on a drop it flies down to the aim point and the pill
  refills.
- Two bubbles of the same colour that touch merge into the next size at their midpoint, growing
  into place. Making size *n* (1-based) scores the *n*th triangular number: 1, 3, 6, 10 … 66.
  Two of the biggest (pink) pop and leave the box for +100.
- A bubble gets one second after landing before it counts. If any bubble's top stays above the
  dashed rim for 2.2 seconds, the game is over. The rim goes orange when the pile gets near it and
  pulses red when something is over it, and the bubbles up there blink.

## The bubbles

Soap bubbles, one colour per size around the colour wheel, so the order is easy to learn: red,
orange, yellow, lime, green, teal, sky, blue, indigo, purple, pink. Each is nearly clear, with the
colour gathering at the edge, a rainbow sheen on the rim and two window reflections. Each bubble is
exactly its physics circle. The light is fixed to the screen, so bubbles are drawn upright even
though the physics spins them.

The style was chosen on 2026-11-16 from five rounds of mocks (rabbit breeds in several styles,
Rabbit Pets pixel rabbits, faces, fruit, pixel bubbles and glossy bubbles). The generators are in
`dev/style-mocks/`: `bubbles.html` (the glossy bubbles, including the soap style used here) and
`pets.html` (the Rabbit Pets-style rabbits, faces, fruit and pixel bubbles). Each has a
`make-*.cjs` that renders it to PNGs through headless Chrome.

A new size gets a toast and a chime. There's no on-screen list of the sizes: the colours run in
rainbow order, which players pick up quickly.

## Scenes

Three backdrops, picked from the mocks in `dev/style-mocks/scenes.html` and switchable under
**Scene** in the pause menu (saved per browser; the glass jar is the default):

- **Glass jar**: a jar on a soft pink-to-blue background, its lip at the rim.
- **Bath time**: a white tub of water against mint tiles, a rubber rabbit on the rim.
- **Night sky**: stars and a moon, the box a glowing outline.

`js/scenes.js` draws each as two still layers (the background with the inside of the box, and
the box's walls in front of the bubbles), which `js/game.js` caches and redraws only on a resize
or a scene change. Every box's inside matches the physics exactly.

## Scores and leaderboards

Done the way the other arcade games do them (flappy-rabbits and match3), in `js/scores.js`:

- The HUD has the suite's SCORE and BEST, label then number as in 2048's chips. Game over shows
  `SCORE n` and `NEW BEST!`, then **Try again**, **Share** and **Leaderboard**.
- Two public boards: **This Month** (round `month-YYYY-MM`, UTC) and **All Time** (`highscore`).
  Both submit with `keepBest`. Guests don't submit.
- Submissions are confirmed and retried: bridge storage records what the platform accepted
  (`bestScore`, `monthBest`, `submittedBest`, `submittedMonthBest`, the same keys as flappy), and
  any gap is retried on load, game over and visibility changes. The bests are also kept in
  localStorage, so the game works without a host.
- The board is the shared component (`../leaderboard-v1.js`, `window.OddsRabbitUI`), themed with
  the `--lb-*` variables. The Leaderboard buttons (a trophy pill in the HUD, and in the pause and
  game-over cards) appear only when the host reports `scores.top`.
- Share opens the same modal as the other games: Copy, native share on touch, and social links.
  It links to `https://www.oddsrabbit.com/games/bubble-merge/`, the manifest's homepage.

## Icon

`icon/icon-1024.png` and `icon/icon-512.png`, the same layout as rabbit-draw and chess: the glass
jar with a pile inside and the next bubble waiting above (idea 1 of 5 in round 8 of the mocks).
`dev/style-mocks/icons.html` draws it with the game's own bubbles; `make-icons.cjs` re-renders the
1024, and `sips -z 512 512` makes the 512.

## Layout

Layout B from round 7 of the mocks: the scene fills the screen and the HUD floats over it as soft
white pills. In the header row, beside the app's back button: NEXT, SCORE with BEST under it in one
pill, a trophy for the leaderboard (only where the host serves one) and pause. NEXT was direction B
of `dev/style-mocks/next.html` (2026-11-24), replacing a preview in the box's top corner that hopped
sides as you aimed. Its bubble is drawn small for every size, so it never looks bigger than the held
one; on a drop it flies from the pill to the aim point, growing to full size, during the drop
cooldown, and the pill refills with a pop (`paintNext()` and the held bubble in `drawScene()`). The box
is scaled to fit what the HUD leaves and centred in any spare height (`resize()`). Pause, game
over and share are white rounded cards with pill buttons. A first game starts with a "Drag to aim,
let go to drop" pill that goes once you drop. `edge` mode per
[`docs/game-header-guidelines.md`](../docs/game-header-guidelines.md), and the page's background
follows the scene, for the status bar.

## Code

- `js/physics.js`: circle physics in an open-topped box, with sequential impulses and friction
  and a positional pass for overlaps. It also reports same-size pairs that touch.
- `js/scenes.js`: the three backdrops.
- `js/scores.js`: bests, score submission, the leaderboard modal and Share.
- `js/pieces.js`: the eleven sizes (colour, radius), points and the soap-bubble drawing, cached
  as one sprite per size and pixel radius.
- `js/game.js`: input, merging, scoring, game over, HUD, ladder, overlays and the saved state.
- `js/sound.js`: synthesised drop, merge, discovery and game-over sounds (no audio files).

Found sizes, mute, the scene and the game in progress are saved in `localStorage`
(`bubble-merge:v1`; saves from before the rename, under `rabbit-merge:v2`, carry over), so a reload resumes where you left off.
Bests are in `bubble-merge:scores:v1` and, with a host, bridge storage.
Haptics go through `OddsRabbit.actions.haptic` when the SDK is present.

`dev/shot.html` loads the game in a 393×852 iframe for headless-Chrome screenshots. Its
`?mode=` can be `fill` (one of each size), `danger`, `menu`, `lb`, `share`, or `auto&n=20000`,
which plays random drops for n steps through `RM.debug.run`; `?scene=` picks the backdrop and
`?host=mock` uses the mock host. Headless Chrome barely advances animation frames on its own,
so `auto` is the way to reach later states.
