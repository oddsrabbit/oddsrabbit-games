# Deploy: caching on apps.oddsrabbit.com

apps.oddsrabbit.com is its own application on the Cloudways server that runs
the WordPress site, behind Cloudflare. The deploy workflow
(`.github/workflows/deploy.yml`) uploads `release/` to it.

## How a new build reaches players

- **Assets carry a version.** Every JS/CSS reference in the HTML ends in
  `?v=<BUILD_ID>` (or a content hash, for the shared `sdk-v1.js` and
  `leaderboard-v1.*`), so a new build points at new URLs and assets can be
  cached for a year.
- **So the HTML has to be fetched fresh.** A client holding an old page keeps
  asking for the old asset URLs, whatever is on disk.
- **The cache bump makes it fresh.** The web and mobile hosts load
  `/host/?app=<slug>&v=<manifest updatedAt>` and `/<slug>/?v=<updatedAt>`.
  Moving `updatedAt` changes those URLs, so every cache treats them as new.
  The deploy does this through `POST /api/oddsrabbit/v1/apps-deploy/bump-versions`
  on the WordPress site (key in `OR_APPS_DEPLOY_KEY`). An upload made any other
  way needs the "Bump cache version" button in `tools/setup-apps-platform.php`.

Don't drop the bump because the files are "already replaced": the server sends
no `Cache-Control` on the HTML entry points, so nothing else tells a client to
refetch them.

## The one setup requirement: no Varnish on the apps application

Cloudways puts Varnish in front of its applications, keyed on the full URL
including the query string, and it can hold an HTML page for weeks. A folder of
static files gains nothing from it. Turn Varnish off for the apps application
(Application Settings), or exclude all of it. Cloudways doesn't allow editing
the nginx config directly, so `Cache-Control` headers can't be set there.

Check what a fresh request gets (a query string no cache has seen):

```sh
curl -sI "https://apps.oddsrabbit.com/host/?cachetest=$RANDOM" | grep -iE 'cache-control|x-cache|age|cf-cache'
```

`x-cache` and `age` in the answer mean Varnish is still in the path.
`cf-cache-status: DYNAMIC` is Cloudflare passing the HTML through, which is
fine.

## Why this is written down (2026-08-05)

For about three weeks, `/host/?app=rabbit-words&colorScheme=light` served a
host bundle from 2026-07-16 out of Varnish, while the web, which asked for the
same page with `&v=<updatedAt>`, got the current one. That old host didn't know
the `scores.season` and `scores.rank` bridge verbs and dropped them without an
answer, so season leaderboards sat on "Loading…" on mobile only. It looked like
a bug in the game, and cost two debugging sessions. The mobile host has passed
`&v=` since `b05e0c68`.
