# Word Battle

An async word game for 2–4 players on OddsRabbit. Invite friends or share a join code. Players take turns laying tiles on a 15×15 board, and each player gets a push when it's their move. There's no turn clock: a game stays open until it ends or someone resigns.

## Build and deploy

Lives in the private games repo. The build stamps `index.html` with the content hashes of the root `dist/sdk-v1.js` and `dist/leaderboard-v1.{js,css}`.

```bash
(cd .. && npm run build)            # the SDK first
npm test
npm run build                        # → dist/word-battle/
```

The deploy workflow ships `dist/word-battle/` to `apps.oddsrabbit.com/word-battle/` (see the root README's *Deploying*). The copies of the SDK and leaderboard files in `dist/` are only for running it locally.

To run it without the platform, `dev/harness.html` fakes the host and the match server in memory (two games to start; the opponents pass). Serve the repo root with any static server after building, e.g. `python3 -m http.server 8765`, and open `http://localhost:8765/dev/harness.html`. Its params are at the top of the file.

The app icon is in `icon/`: `icon-512.png` is what the platform manifest points at (`<slug>/icon-512.png`, from `tools/setup-apps-platform.php` in the web repo) and the build copies it into the bundle; `icon-1024.png` is for store listings; `icon.svg` is the source (its letters use Bricolage Grotesque from Google Fonts, so render it in a browser rather than an SVG tool without the font).

Plain JS with no bundler: `js/rules.js`, `js/board.js` and `js/application.js` load as script tags in that order.

## How it works

- **The server decides.** The rules live in the WordPress backend (`rest-routes/services/matches/TilesRules.php`, game id `tiles`), with the dictionary (ENABLE) in `TilesDictionaryService.php`. `js/rules.js` mirrors the placement and scoring rules, so players see a move's score and legality right away. It has no dictionary. If the two disagree, the server is right.
- **Two boards.** Standard (`tiles`) uses one fixed layout, generated from `PREMIUMS` in `TilesRules.php` and mirrored in `js/rules.js`. Wild (`tiles-wild`) rolls a random layout per match on the server (`TilesRules::wildLayout`), stores it in the match state and sends it with every view; the client only draws it. The new-game screen picks between them.
- **Board** (`js/board.js`): a canvas with pan and pinch zoom that draws the premium layout the server sends. The rack is DOM, and tiles are placed by tap or drag.
- **Move log.** Every view carries `view.history`: the whole move log, oldest first, each entry shaped like `lastMove` and filtered per viewer by `moveViewFor()` (`MatchHistory.php`; swapped letters stay hidden from opponents). The log keeps squares, not words, so the Moves list works out each placement's words by replaying the tiles over an empty board with `TilesRules.evaluate`. On the match screen the moves before the last one are listed under it, as many as fit in the height the square board leaves spare. On a host without `history` the Moves entries stay hidden.
- **Tiles left** is worked out on the client (`TilesRules.unseen`: the full bag less the board and your rack). `DISTRIBUTION` in `js/rules.js` must match the server's bag.
- **Screens** (`js/application.js`): a match list, a new-match setup (invite players, or share a join code) and the match screen. The open match refreshes through `OR.matches.watch`.
- Design of the shared match system: [`../docs/proposals/multiplayer-matches.md`](../docs/proposals/multiplayer-matches.md). New bridge verbs go in the root `src/`.

## SDK surface used

- `matches.create/join/list/get/move/resign/invitable/watch` (the game hides itself on hosts without `matches.get`), and `matches.nudge/claim` for a player who has stopped moving (hidden on hosts without them)
- Challenges: an invitee's seat is `invited` (`mySeatStatus`) until they answer. Accept is `matches.join({ matchUuid })` and Decline is `matches.resign`. `matches.searchPlayers` lets the picker find anyone; on hosts without it the picker filters `matches.invitable` as before
- `matches.check` (the dictionary, asked while tiles are still on the board) and `matches.quick` (Find an opponent); both are hidden on hosts without them. List rows use each summary's `lastMove` and `recap` for the "played QUIZ for 32" line
- `matches.chat` and `matches.chatSend` (the match's conversation, which is the players' own DM or a group in platform Chat; `multiplayer-matches.md` §2.8), and each summary's `chatUnread` for the list badges. The chat sheet and its badge are hidden on hosts without both verbs
- `user`, `actions.requestSignIn`, `actions.share`, `actions.haptic`, `lifecycle.on`
- The shared leaderboard UI's avatar renderer (`leaderboard-v1.js`)
