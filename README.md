# OddsRabbit Apps SDK — private dev repo

> **Private.** This repo holds the OddsRabbit games, internal proposals and the
> deploy for apps.oddsrabbit.com. It is also where the SDK is developed.

The public SDK is a one-way mirror of part of this repo:
[`oddsrabbit/apps-sdk`](https://github.com/oddsrabbit/apps-sdk), checked out
locally at `../apps-sdk-public`. The SDK's **API docs live in that repo's
README**, not here, so there is only one copy to keep current. When you add or
change a bridge verb, update `../apps-sdk-public/README.md` in the same change.

## Publishing the public SDK

```bash
node scripts/sync-public-sdk.mjs   # copies the allowlisted paths into ../apps-sdk-public
git -C ../apps-sdk-public diff     # review, then commit and push there
```

`PUBLIC_PATHS` in the script is an allowlist: a new game or proposal folder
stays private until someone adds it on purpose. The public repo owns its own
README, `package.json`, `build.config.mjs`, `.gitignore` and `examples/`, which
the sync never touches. npm releases go out from the public repo only; this
package is marked `"private": true` so a stray `npm publish` here fails.

## What's in this repo

```
src/sdk/        The SDK loaded inside app iframes                 (public)
src/schemas/    Zod schemas — single source of truth for the bridge (public)
src/ui/         Shared leaderboard + season-board UI              (public)
src/host/       Sandbox host page that loads dev appUrls          (public)
2048/           2048 port — the public example game               (public)
rabbit-words/   RabbitWords — daily word guess
rabbit-globe/   RabbitGlobe — daily photo-pin geo-guess (Leaflet map)
snake/          Snake — Game Boy-styled
match3/         Fruit Match — match-3
solitaire/      Solitaire — Klondike with daily deals, full-bleed elastic board
flappy-rabbits/ Flappy Rabbits — one-button side-scroller, full-bleed scene
liquid/         Liquid WebGL toy — no scopes
docs/           Deploy cache policy, header guidelines, proposals
scripts/        sync-public-sdk.mjs
```

`npm install && npm run build` produces `dist/`, which is what gets uploaded to
apps.oddsrabbit.com; `npm test` runs the unit tests. After an upload, bump the
cache version, or clients keep the build they already hold: see
[`docs/deploy-cache-policy.md`](./docs/deploy-cache-policy.md).

## License

The root [`LICENSE`](./LICENSE) (MIT) covers the SDK paths marked public above.
It does **not** cover the games. Every game is proprietary, all rights reserved,
except the two ports of MIT projects, which keep their upstream license:
`2048/` (Gabriele Cirulli) and `liquid/` (Pavel Dobryakov). Each game folder
has its own `LICENSE.txt` saying which applies.
