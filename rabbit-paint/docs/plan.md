# Rabbit Paint: game plan

Tap-to-fill coloring for OddsRabbit, named **Rabbit Paint** (2026-10-21; was
the working name Color Burrow). Check store clashes before launch.

Mockups (three directions + shared share/save):
https://claude.ai/artifact/Y7DH8VF6QqX6bYXVe1ZRAw

## Decided (2026-10-20)

- Direction D (below).
- **No paint-by-number.** Free coloring everywhere; the daily is free too, so
  everyone's version differs.
- **The gallery shows names on Everyone** (platform usernames, as on other
  boards).

## Decided (2026-10-21)

- **Likes, no crowns.** Players heart others' pages in today's gallery, and
  Everyone sorts by likes ("Most liked", with "Newest" beside it so fresh
  posts get seen). The top-3 crown at day close was dropped as not worth it.

Built for v1: home, painting, fills picker, today's gallery (Everyone,
Friends, likes, Most liked / Newest), share/save, sample pages, harness. Not
yet: a "My art" screen, the clipped brush, dark mode, image share through the
app (needs a bridge verb; v1 uses the Web Share API or downloads), a push
when someone likes your page.

## Decided (2026-10-22)

- **Players can add their own pictures** and color them on their device
  (built). They can send one for review to the shared library; an approved one
  is curated like our own art and credited. The send needs a platform verb,
  `content.submit`: see [content-submit.md](content-submit.md).

## Direction D

Row D on the canvas: a home screen (today's page card, keep coloring,
category shelves) → C's painting screen, with **Done** on the right (the
app's back button owns the left). The daily page is **free coloring**, so
versions differ, and **today's gallery** (Everyone / Friends, likes, Most
liked / Newest) unlocks once you finish yours.

Fills are **solid, gradient (4 directions) and pattern (dots, stripes,
checks, grid, confetti)**. Each is still one value per area, so a submission
stays a tiny `{regionId: fill}` map that's safe to show publicly. A
**brush that stays inside the area where the stroke starts** comes later;
brushed pages stay private or friends-only until there's moderation.

Backend for the gallery: posts are score rows (`scores.submit`), listings are
`scores.top` / `scores.friends`, and likes are the platform's `scores.like` /
`scores.myLikes` (added 2026-10-21; see Platform work).

## The first three directions

| | A · Shelves | B · Today's page | C · Studio |
|---|---|---|---|
| Home | category shelves + "keep coloring" | one featured page a day, library below | the canvas itself |
| Browse | category screen with filters | chips → library | sheet over the canvas |
| Coloring | free fill, recent + favorites | paint-by-number, numbered palette, then free recolor | free fill, floating toolbar |
| Win state | none (finish = share) | yes: every area right | none |
| Screens to build | 4 | 3 | 1 + 2 sheets |
| Risk | in-game back sits next to the app's exit button | needs a page every day (content pipeline) | weakest discovery |

These mix: e.g. B's daily page as the home, with A's library and the free
picker for the recolor step.

## Always in

- **Color picker**: current color, recent (last 6, automatic), favorites
  (save/remove, max 8), all-colors grid; optional custom picker (C2) and
  curated palettes. Recent and favorites persist per player via
  `OR.storage` (`colors` key), not per page.
- **Tools**: fill, erase (back to white), pick color from the picture, find
  an empty area (pans and pulses the next unfilled region), undo/redo.
- **Zoom**: pinch to zoom, two fingers to pan, a fit button. Required, not polish:
  the smallest region is ~14k px² at 2100 px, about 20 pt square at fit size.
- **Progress**: saved after every fill to `OR.storage` (`page:<slug>` →
  region id → color), so a page resumes where it was left.
- **Share/save** (shared screen): Clean / Framed / Before-after styles; Share,
  Save to photos, Post to friends. Replay video later.

## Rendering

Per page the game loads `lineart.png` (drawn on top), `regions.png` (an
offscreen lookup: tap → region id) and `page.json`. Fills go to a canvas
under the line art: on tap, paint every pixel of that region id. Paint-by-
number labels use `page.json` `regions[].label` (deepest interior point).

## Platform work needed

- **Likes** (built 2026-10-21, not deployed): `scores.like` /
  `scores.myLikes` and `scores.top` orders `latest` and `likes`; rows carry
  `likes`. Spans the SDK (`messages.ts`, `sdk.ts`, README, `likes.test.ts`),
  WP (migration `20261021_001_create_app_score_likes.sql`,
  `AppScoresService`, both scores controllers, `apps-routes.php`, the erasure
  manifest), the web host (`games.js`) and the app (`AppHost.tsx`,
  `app.service.ts`, `types/app.ts`). Deploy order: migration + WP, then the
  SDK dist (the hosted relay checks verbs against the SDK schema; see
  `../docs/deploy-cache-policy.md`), then the app build. Until a host
  lists `scores.like`, the gallery shows no hearts and sorts earliest first.
  Sorting by likes reads the whole day's rows, fine for one day's gallery.
- **Image share/save**: `actions.share` only takes `{ title, text }`. Needs a
  new bridge verb (e.g. `actions.shareImage({ dataUrl, title })` and/or
  `actions.saveImage`), which touches `apps-sdk` messages + sdk, `games.js`,
  `AppHost.tsx` HOST_CAPABILITIES, and the native share/media library in the app.
  Web fallback: download the PNG.
- **Post to friends**: needs `actions.publishPost`, the same gap Word Rush has.
- **In-game back** (A only): no SDK hook for the host back button today; A
  needs its own back control beside it, or a hook.
- Header follows `../docs/game-header-guidelines.md` (edge mode).
- Any push (e.g. "today's page is out", B) filters through `AppPushMuteService`.

## Content pipeline

`art/<slug>/source.(png|jpg)` + `page.config.json` →
`npm run prep-page -- <slug>` → check `preview.png`, add merge hints, rerun.
See the README.

Art guidance for artists: closed outlines, no hatching for texture, nothing
smaller than a fingertip at phone size, PNG/SVG, not JPEG; transparent
backgrounds are fine (flattened onto white).

## Open questions

1. Launch needs enough real pages for the daily rotation (only the monkey is
   real today; the production build repeats it every day). Player
   submissions can add to the library later, through review
   ([content-submit.md](content-submit.md)), but won't fill it for launch.
2. Launch day (the epoch) and the final name.
3. A push when someone likes your page (filtered through
   `AppPushMuteService`), or leave likes silent?
