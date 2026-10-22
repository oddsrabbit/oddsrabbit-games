# Rabbit Paint

A tap-to-fill coloring game for OddsRabbit (working name). The plan, the
decisions so far and a link to the mockups are in [docs/plan.md](docs/plan.md).

- **Home** (`src/home.ts`): today's page, a link to today's gallery (locked
  until you finish yours), library pages in progress, a shelf per category.
- **Painting** (`src/paint.ts`): the picture fills the screen behind floating
  controls. One finger drags, two pinch, a quick tap fills. Undo/redo, fit,
  find an empty area, and a recent-fills strip. **Done** (right) goes home; the
  app's back button owns the left.
- **Fills** (`src/picker.ts`, `src/fills.ts`): solid, gradient (4 directions)
  or pattern (dots, stripes, checks, grid, confetti), a colour square and hue
  bar, basic swatches, favourites, and pick-from-picture.
- **Today's gallery** (`src/gallery.ts`): finishing today's page offers
  *Post to today's gallery*. A post is a `scores.submit` on `day-N` whose
  metadata is the packed fills (~150 bytes for the monkey; the cap is 2 KB);
  Everyone reads `scores.top` (100 rows, Most liked or Newest), Friends
  `scores.friends`. Hearts are `scores.like`, filled from `scores.myLikes`;
  a host without them gets no hearts and earliest-first. Thumbnails are drawn
  from the page's region map, so no images are stored. Names show on Everyone.
- **Your pictures** (`src/upload.ts`, `src/mine.ts`, `src/worker/`): a player
  adds an image and the game turns it into a page on the device, the same
  steps as `prep-page` run in a Web Worker, with ink found against the local
  paper colour so a phone photo of a printed page works. Simple / Normal /
  Detailed change the smallest area. Pages and their progress stay in that
  browser (IndexedDB; `mine-<id>` progress keys are local only), up to 30.
  **Share with everyone** sends one for review (`src/submit.ts`); it shows only
  on a host with `content.submit`, which is proposed in
  [docs/content-submit.md](docs/content-submit.md), not built.
- **Share / save** (`src/share.ts`): Clean, Framed or Before / after at
  1080 px. Share uses the Web Share API with the image where the browser
  allows files, else the host's text share; Save downloads the PNG.

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
npm run build:dev    # the same plus the sample pages
```

Local play: `npm run build:dev`, then `python3 -m http.server 8767` at the
repo root and open http://localhost:8767/dev/harness.html. The harness fakes
the host: `?fresh=1` forgets everything, `?user=0` plays signed out,
`?day=N` moves the clock, `?others=N` sets how many others posted today,
`?likes=0` plays a host without likes, `?submit=0` a host without
`content.submit` (otherwise the harness fakes it),
`?chrome=app` fakes the app's insets. See the top of `dev/harness.html`.

Upload `dist/rabbit-paint/` to `apps.oddsrabbit.com/rabbit-paint/`.
`dist/sdk-v1.js` is a copy for the harness only.

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

`npm run sample-pages` writes eight simple placeholder pages
(`art/sample-*`, `"sample": true`) so shelves and the rotation have
something in them during development. `npm run build` leaves them out.

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
4. Regions under 12,000 px² (about 20 pt square on a phone) join neighbouring
   small ones (a bead string becomes one region), and leftovers fold into the
   neighbour they share the most border with.
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
