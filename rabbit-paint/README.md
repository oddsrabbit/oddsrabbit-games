# Rabbit Paint

A tap-to-fill coloring game for OddsRabbit (working name). The plan, the
decisions so far and a link to the mockups are in [docs/plan.md](docs/plan.md).

- **Home** (`src/home.ts`): today's page, a link to today's gallery (locked
  until you finish yours), library pages in progress, a shelf per category.
- **Painting** (`src/paint.ts`): the picture fills the screen behind floating
  controls. One finger drags, two pinch, a quick tap fills. Undo/redo, fit,
  find an empty area, clear all (one confirm; undo brings it back while the
  page is open), and a recent-fills strip. **Done** (right) goes home; the
  app's back button owns the left.
- **Fills** (`src/picker.ts`, `src/fills.ts`): solid, gradient (4 directions)
  or pattern (dots, stripes, checks, grid, confetti), a colour square and hue
  bar, basic swatches, favourites, and pick-from-picture.
- **Into the gallery** (`src/autopost.ts`): once 60% of a page's areas are
  colored, a signed-in player's version goes in its gallery, and is written
  again 20 s after they stop and on leaving the page. A guest who finishes is
  offered *Post to the gallery*, which asks them to sign in. Writes use `keepBest` with the
  seconds since 2026 as the score, so each later version replaces the row.
- **A page's gallery** (`src/gallery.ts`): a post is a `scores.submit` on
  `page-<slug>` whose metadata is the packed fills (~150 bytes for the monkey; the cap is 2 KB);
  Everyone reads `scores.top` (100 rows, Most liked or Newest), Friends
  `scores.friends`. Hearts are `scores.like`, filled from `scores.myLikes`;
  a host without them gets no hearts and earliest-first. Thumbnails are drawn
  from the page's region map, so no images are stored. Names show on Everyone.
  Posts still being colored carry an *In progress* label.
- **Gallery tab** (`src/feed.ts`): posts across every page, Everyone or
  Friends, Newest or Most liked; hearts work on the card (`src/likes.ts`), and
  the picture opens that page's gallery.
- **Your pictures** (`src/upload.ts`, `src/mine.ts`, `src/worker/`): a player
  adds an image and the game turns it into a page on the device, the same
  steps as `prep-page` run in a Web Worker, with ink found against the local
  paper colour so a phone photo of a printed page works. Fine detail /
  Normal / Close gaps change how big a gap in the lines is closed. Pages and their progress stay in that
  browser (IndexedDB; `mine-<id>` progress keys are local only), up to 30.
  **Share with everyone** sends one for review (`src/submit.ts`); it shows only
  on a host with `content.submit` (see
  [docs/content-submit.md](docs/content-submit.md)).
- **Share / save** (`src/share.ts`): Clean, Framed or Before / after at
  1080 px. Share uses the Web Share API with the image where the browser
  allows files, else the host's text share; Save downloads the PNG. **Send in
  chat** hands the picture to the host's chat picker (`chat.sharePicture`, see
  [../docs/proposals/chat-share-picture.md](../docs/proposals/chat-share-picture.md));
  it shows only on a host that lists it.

Progress saves to the player's storage (`day-N` for today's page, so a page
that comes round again starts blank; `page-<slug>` for library pages). A
guest has no account storage, so theirs stays in this browser. Account
storage holds 64 KB per game, so only the last 7 `day-N` keys are kept
(listed in `days`).

The build writes `main.js` and `prep-worker.js` (the page-prep worker, loaded
beside `main.js` with the same `?v=`). `src/worker/` has its own tsconfig: it
shares `tools/lib/regions.ts`, which is written to the tools' rules.

## Build and run

Lives in the private games repo, set up like `word-rush`: types come from the
SDK source at the repo root, and the stamp from the root `dist/`.

```bash
(cd .. && npm run build)            # the SDK first
npm install
npm test && npm run type-check
npm run build        # → dist/rabbit-paint/, real pages only
npm run build:dev    # the same plus any `"sample": true` pages
```

Local play: `npm run build:dev`, then `python3 -m http.server 8767` in
`rabbit-paint/` and open http://localhost:8767/dev/harness.html. The harness fakes
the host: `?fresh=1` forgets everything, `?user=0` plays signed out,
`?day=N` moves the clock, `?others=N` sets how many others posted today,
`?likes=0` plays a host without likes, `?submit=0` a host without
`content.submit` and `?chat=0` one without `chat.sharePicture` (otherwise the
harness fakes them),
`?chrome=app` fakes the app's insets. See the top of `dev/harness.html`.

The deploy workflow ships `dist/rabbit-paint/` to `apps.oddsrabbit.com/rabbit-paint/` (see the root README's *Deploying*).
`dist/sdk-v1.js` is a copy for the harness only.

The app icon is in `icon/`: `icon-512.png` is what the platform manifest points
at (`<slug>/icon-512.png`) and the build copies it into the bundle;
`icon-1024.png` is for store listings; `icon.svg` is the source (no text, so
any SVG renderer gives the same PNGs).

The daily epoch (`art/catalog.json` `epoch`) is a placeholder: before it, the
game shows day 0. Pick the launch day there.

## Pages

`art/catalog.json` holds the categories, the daily rotation (slugs in order,
looping) and the epoch. Each page is a folder under `art/`:

```
art/monkey-sun-hat/
  source.jpg         the line art as supplied (PNG or JPEG; transparency → white)
  page.config.json   title, category, merge hints, option overrides, credit
  lineart.png        generated: kept ink on transparent, drawn over the fills
  regions.png        generated: region id per pixel (R + G·256 = id + 1)
  page.json          generated: size, regions (area, bbox, label point), stats
  thumb-*.png        generated: line art (thickened) and region map, 360 px on the long side
  preview.png        generated, not committed: each region a distinct pastel
```

```bash
npm install
npm test && npm run type-check
npm run prep-page -- monkey-sun-hat     # or: npm run prep-page -- --all
```

What prep does (`tools/lib/regions.ts`):

1. Ink is anything darker than 140/255.
2. Loose strokes that enclose nothing and are under 4000 px are erased: hatching,
   shading dashes, sparkles. Eyes, buttons and other closed shapes stay.
3. Ink is thickened by 4 px for region finding only, so gaps up to ~8 px don't
   leak. The drawn lines are not thickened.
4. Specks under 600 px² (pockets where lines meet, the slivers between
   touching beads) join neighbouring specks, and leftovers fold into the
   neighbour they share the most border with. Every real shape, however
   small, stays its own area: players zoom in for those.
5. The config's `merges` join regions the automatic pass left split: each
   group is a list of `[x, y]` source pixels, one point inside each region.

Curating a new page: run prep, open `preview.png`, and for any area split in
an odd place (a hem in four chunks, a band in two) add a `merges` group with
a point in each piece. Override `minArea`, `closeRadius`, `maxStrokePx` or
`inkThreshold` under `options` when an image needs it. One cutoff never fits
everything: raising `minArea` for the monkey swallowed its hands into the
collar.

A page from a player's submission sets `"credit": "<username>"` in
`page.config.json`; its tile says "by <username>". See
[docs/content-submit.md](docs/content-submit.md).
