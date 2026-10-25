# Chess

Async chess for two on OddsRabbit. Challenge someone you follow, send a link to anyone, or find an opponent. Players move whenever it suits them, and each gets a push when it's their turn. There's no clock. The knights are rabbits.

## Build and deploy

Lives in the private games repo. The build stamps `index.html` with the content hashes of the root `dist/sdk-v1.js` and `dist/leaderboard-v1.{js,css}`.

```bash
(cd .. && npm run build)            # the SDK first
npm test
npm run build                        # → dist/chess/
```

The deploy workflow ships `dist/chess/` to `apps.oddsrabbit.com/chess/` (see the root README's *Deploying*). The copies of the SDK and leaderboard files in `dist/` are only for running it locally. The app is seeded `admin_only` in `tools/setup-apps-platform.php` (web repo). Flip it once the upload is checked.

To run it without the platform, `dev/harness.html` fakes the host and the match server in memory, refereed by `js/rules.js`. The opponent plays a random legal move, preferring captures. Serve this folder after building, e.g. `python3 -m http.server 8765`, and open `http://localhost:8765/dev/harness.html`. Its params are at the top of the file (`busy=1`, `finished=1`, `offer=1`, `promo=1`, `idle=15`, `theme=dark`, …).

The icon is in `icon/`. `icon.svg` is drawn from the same piece shapes as the game. `icon-512.png` (what the manifest points at, copied into the bundle) and `icon-1024.png` are rendered from it in a browser.

Plain JS with no bundler: `js/rules.js`, `js/pieces.js`, `js/board.js`, `js/engine.js`, `js/computer.js` and `js/application.js` load as script tags in that order. Run `npm install` in `chess/` before building, for the engine.

## How it works

- **The server decides.** The rules are `ChessRules.php` in the WordPress backend (`rest-routes/services/matches/`, game id `chess`), with its tests in `tools/test-match-rules.php`. `js/rules.js` is a copy, used for the legal-move dots, check and notation. Both are checked against the same standard perft counts, so they agree on every legal move. If they ever disagree, the server is right and the move comes back refused.
- **White is whoever moves first.** `MatchService` picks a random first seat after the opening position is set, so `view.white` stays null until the first move. Until then the client treats the seat on turn as White.
- **Moves** are `{ type: "move", from: "e2", to: "e4", promo?, offerDraw? }`. Nothing is sent until **Send**: the move is shown on the board first and **Take back** undoes it. A draw offer goes along with a move and stands for one reply. It's picked from the ⋯ menu on your turn and shows as a chip next to Send until the move goes. The other player accepts with `{ type: "acceptDraw" }` or declines by moving.
- **Endings.** Checkmate, stalemate, threefold repetition, the 50-move rule and insufficient material end the game by themselves (`view.result`), since nobody is at the board to claim them. Resign ends it at once.
- **No clock.** A waiting player can nudge after a day. After 14 days without a move they can claim the game, and in chess that wins (`ChessRules::claimWinner`; most games end a claim "scored as it stands", which in chess would always be a draw).
- **Board** (`js/board.js`): 64 buttons in a grid with the pieces on a layer above, so a move can slide. Tap to pick up and put down, or drag. The arrow keys and Enter work too. It flips for Black.
- **Pieces** (`js/pieces.js`): our own set, coloured by CSS custom properties. The hero, the list band, the choose cards and the icon all draw from it.
- **Move log.** `view.history` is replayed with `ChessRules.replay` (once per version) to get each move's notation, for the scoresheet, the recent-moves lines and the result card's numbers. Every move in the scoresheet, and ‹ › in the turn strip (← → off the board), shows the board as it was after that move. **Copy game (PGN)** in the ⋯ menu puts the game on the clipboard (the share sheet where that's refused).
- **Engine review.** A finished game can be gone over by the engine (the result card, or the ⋯ menu): depth 11 on every position, each move marked ?! / ? / ?? by how much it lowered its side's chance of winning, the better move named for mistakes, and an accuracy per side. Both use Lichess's formulas. It runs on the device, for games with people too, and is kept for the session.
- **On this device:** flip the board, hide the coordinates, and sound (Web Audio tones, nothing shipped) are in the ⋯ menu; the last two are remembered (`chess.prefs` in localStorage).
- **Play the computer** (`js/computer.js`, `js/engine.js`): pick a level (Beginner 250–650 up to Master 2250–2700) and the game rolls an opponent at it, a made-up name and a rating inside the band. These games never touch the match server. Each is a small record in `OR.storage` (`cpu.v1`, which a guest gets from the host's localStorage), replayed with `js/rules.js` into a view shaped like the server's MatchView, so the match screen, the list and the result card serve both. `Computer.wrap(OR.matches)` routes each verb by uuid (`cpu-…` is local). No chat, nudge or claim. The computer takes a draw offer when it's clearly worse or the game is long and level, offers one itself in a long level game or a level ending without pawns, and resigns (club level and up) when it's lost. The player can take back a move (theirs and the reply) and ask for a hint (the engine's move at full strength); the result card counts both. Computer games work signed out and on hosts without the match verbs, and don't count toward the record with people. They have their own, per level, kept with the games in `cpu.v1` (it outlives the trimmed games), and the computer screen ticks off the levels beaten.
- **The engine** is [Stockfish.js](https://github.com/nmrugg/stockfish.js) 18, the lite single-threaded WASM build (≈7 MB, no cross-origin isolation needed), pinned as the `stockfish` devDependency and copied by the build to `dist/chess/engine/` with its licence. It runs unmodified in its own Web Worker (`engine/worker.js`, built from `js/engine-worker.js`, which loads it and compiles its `.wasm` without needing the server to send `application/wasm`), talking UCI over postMessage, and loads when the computer screen opens. **It is GPLv3.** Shipping it this way is fine: it's a separate program, unmodified, that the game only talks to over UCI, so the game's own code isn't covered. What the licence asks for comes with the build: `engine/Copying.txt`, and `engine/SOURCE.txt` (written by `build.mjs` from the installed version) pointing at that release's source, as section 6(d) requires. Upload both with the engine. If the engine is ever modified, the changes have to be published under GPLv3, and it must never be bundled into the iOS or Android app binary. From 1320 (where Stockfish's UCI_Elo stops) up, the bot uses that limit. Below it, it searches shallowly with MultiPV 6 and `pick` chooses among the lines, with a softmax that gets looser and a chance of a blunder that gets bigger as the rating drops; a blunder is a legal move picked by how tempting it looks (captures, checks, pieces going forward), not uniformly. The numbers are in `TUNING`, set with bot-vs-bot matches (`node dev/calibrate.mjs 1300 1320 60`) so strength rises with the rating and the two paths meet at 1320. They're measured against each other, not against people. A search that times out restarts the worker, so a late answer can't land on the next position.
- The screens (list, challenge setup, lobby, chat, nudge and claim) are Word Battle's, adapted for a two-seat game. Design of the shared match system: `../docs/proposals/multiplayer-matches.md`.

## SDK surface used

- `matches.create/join/list/get/move/resign/invitable/watch` (the game hides itself on hosts without `matches.get`), and `matches.nudge/claim`
- `matches.quick` (Find an opponent), `matches.searchPlayers` (challenge anyone), `matches.chat/chatSend`, each hidden on hosts without it
- `user`, `actions.requestSignIn`, `actions.share`, `actions.haptic`, `lifecycle.on`
- The shared leaderboard UI's avatar renderer (`leaderboard-v1.js`)
