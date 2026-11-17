# Chinese Checkers

Async Chinese Checkers for two to four on OddsRabbit. Challenge friends, send a link to anyone, or find an opponent; players move whenever it suits them and get a push when it's their turn. No clock. Or play the computer at a table of two to six.

The screens are Chess's (and through it Word Battle's), so the games feel like one family: the list with its spotlight, the chooser, Play friends with seat chips, Play the computer, the lobby, the match screen with Send / Take back, the result card and chat.

## Build and run

Lives in the private games repo. The build stamps `index.html` with the content hashes of the root `dist/sdk-v1.js` and `dist/leaderboard-v1.{js,css}`.

```bash
(cd .. && npm run build)            # the SDK first
npm test                             # rules, bots, and agreement with the server's fixtures
npm run build                        # → dist/chinese-checkers/
python3 -m http.server 8791          # then open http://localhost:8791/dev/harness.html
```

`dev/harness.html` fakes the host and the match server in memory, refereed by `js/rules.js`; the other seats are played by the Steady computer. Its params are at the top of the file (`busy=1`, `finished=1`, `challenge=1`, `open=n`, `idle=15`, `theme=dark`, `fresh=1`, …). `dev/shot.html` puts it in a 393×852 frame for screenshots and can play a whole game against the computer by tapping (`?mode=e2e&players=4`, result in the page title).

It ships with the rest of the repo: `scripts/release.mjs` finds this folder by its `build` script, so a push to `main` builds and uploads `dist/chinese-checkers/` to `apps.oddsrabbit.com/chinese-checkers/`. The platform entry (`tools/setup-apps-platform.php` in the web repo) is `admin_only` until it has been checked on the live site.

The icon is in `icon/`: `icon.svg` is written by `node dev/icon.mjs` (a simplified board, three rows to a point, so it reads at home-screen size), and `icon-512.png` (what the manifest points at, copied into the bundle) and `icon-1024.png` are rendered from it by opening `dev/icon.html?size=512` (or `1024`) in headless Chrome at that window size.

Plain JS with no bundler: `js/rules.js`, `js/bot.js`, `js/board.js`, `js/computer.js` and `js/application.js` load as script tags in that order.

## How it works

- **The server decides.** The rules are `ChineseCheckersRules.php` in the WordPress backend (`rest-routes/services/matches/`, game id `chinese-checkers`), tested in `tools/test-match-rules.php`. `js/rules.js` is the client's copy, for the move dots, the jump paths and the move log. Both are checked against the same bot-played games: `node dev/fixtures.mjs` writes `test/fixtures.json`, and a copy at `tools/fixtures/chinese-checkers.json` in the web repo is replayed by the PHP, board and path after every move. Change the rules in both, regenerate, and copy the file across.
- **The board** is a star of 121 holes in cube coordinates, numbered row by row, the same on both sides. A board is a 121-character string: `.` empty, else the seat digit. Seats sit at points clockwise (2: opposite; 3: alternate points, racing into empty ones; 4: two opposite pairs), so turns go round the star.
- **Moves** are `{ type: "move", from, to }` with hole numbers; the server finds the path (the shortest chain, breadth first, the same as the client). `{ type: "pass" }` only when a seat has no move at all. Nothing is sent until **Send**, and **Take back** undoes the move on the board.
- **Winning**: the first seat whose target point is full with at least one of its own marbles in it, so a marble parked in your target can't block you. The game ends there (the platform's outcome is one winner). A resigned player's marbles stay on the board.
- **No clock.** A waiting player can nudge after a day; after 14 days a two-seat game can be claimed and the claimant wins (`claimWinner`), and a bigger table drops the idle seat and plays on.
- **The board on screen** (`js/board.js`) is SVG, turned so your own point is at the bottom. Whose move it is shows on the board: a name tag in that player's colour ("Your move", "@pip's move") just outside the tip of their starting point (picked from the style mocks, option 1B). The points are not tinted. Every colour is a custom property in `styles.css`, gradients included. Taps go to the nearest hole within most of a hole's spacing.
- **Play the computer** (`js/computer.js`, `js/bot.js`): pick Easy, Steady or Sharp and a table of 2, 3, 4 or 6; you move first, as red. These games never touch the match server: each is a small record in `OR.storage` (`cpu.v1`), replayed with `js/rules.js` into a view shaped like the server's MatchView, so every screen serves both. Take back and Hint (the Sharp move) are available; the result card counts both. A record per level is kept.
- **The computer** (`js/bot.js`) races: it scores a position by the rows its marbles still have to go along the point's axis, plus a little for being off-centre and more for stragglers, and plans sequences of its own moves (a beam search) to find jump ladders. Easy looks two moves ahead and picks loosely, Steady three, Sharp seven. Head to head, Sharp also marks down moves that hand the other player a long ladder; at a table of three or more it plans four moves ahead instead, since the others move too often between its turns for a long plan to hold. `node dev/strength.mjs 24` measures it: alone on the board Easy needs about 66 moves, Steady 45 and Sharp 35 (a good human, 30–35); Sharp beat Steady 20/24 and Steady beat Easy 23/24.

## SDK surface used

- `matches.create/join/list/get/move/resign/invitable/watch` (games with people hide on hosts without `matches.get`), `matches.nudge/claim`, `matches.quick`, `matches.searchPlayers`, `matches.chat/chatSend`, each hidden on hosts without it
- `storage` (computer games), `user`, `actions.requestSignIn`, `actions.share`, `actions.haptic`, `lifecycle.on`
- The shared leaderboard UI's avatar renderer (`leaderboard-v1.js`)
