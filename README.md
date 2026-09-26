# Word Battle

An async word game for 2–4 players on OddsRabbit. Invite friends or share a join code. Players take turns laying tiles on a 15×15 board, and each player gets a push when it's their move. There's no turn clock: a game stays open until it ends or someone resigns.

## Build and deploy

Private repo. It expects the public SDK checked out next to it at `../apps-sdk`: the build stamps `index.html` with the content hashes of that checkout's `dist/sdk-v1.js` and `dist/leaderboard-v1.{js,css}`.

```bash
(cd ../apps-sdk && npm run build)   # the SDK first
npm test
npm run build                        # → dist/word-battle/
```

Upload `dist/word-battle/` to `apps.oddsrabbit.com/word-battle/`. The copies of the SDK and leaderboard files in `dist/` are only for running it locally. The live ones are deployed from apps-sdk. Then bump the cache version as usual (see apps-sdk `build.config.mjs`).

Plain JS with no bundler: `js/rules.js`, `js/board.js` and `js/application.js` load as script tags in that order.

## How it works

- **The server decides.** The rules live in the WordPress backend (`rest-routes/services/matches/TilesRules.php`, game id `tiles`), with the dictionary (ENABLE) in `TilesDictionaryService.php`. `js/rules.js` mirrors the placement and scoring rules, so players see a move's score and legality right away. It has no dictionary. If the two disagree, the server is right.
- **Board** (`js/board.js`): a canvas with pan and pinch zoom that draws the premium layout the server sends. The rack is DOM, and tiles are placed by tap or drag.
- **Screens** (`js/application.js`): a match list, a new-match setup (invite players, or share a join code) and the match screen. The open match refreshes through `OR.matches.watch`.
- Design of the shared match system: apps-sdk `docs/proposals/multiplayer-matches.md`. New bridge verbs still go in apps-sdk.

## SDK surface used

- `matches.create/join/list/get/move/resign/invitable/watch` (the game hides itself on hosts without `matches.get`)
- `user`, `actions.requestSignIn`, `actions.share`, `actions.haptic`, `lifecycle.on`
- The shared leaderboard UI's avatar renderer (`leaderboard-v1.js`)
