# Player pictures for the shared library: `content.submit`

Status: proposed 2026-10-22. The game side is built and hidden until a host
lists `content.submit` (`src/submit.ts`); the harness fakes the verb. Nothing
in apps-sdk, WP, the web host or the app yet.

## What players get

- **Your pictures** (built, no platform work): a player adds an image, the
  game turns it into a page on the device (`src/upload.ts`, the prep worker in
  `src/worker/`), and they color it like any page. The page and its progress
  stay in that browser (IndexedDB and local storage): a page is a few hundred
  KB, and account storage holds 64 KB per game.
- **Share with everyone** (needs this verb): from the picture's menu or its
  finish sheet, a signed-in player sends it for review, with a title and a
  "I drew this or may share it; not a photo of a person" box. Nothing is shown
  to anyone else until a person approves it.

## The verb

`content.submit` `{ kind: 'coloring-page', title, image, rights: true }` →
`{ id }`.

- `title`: 1–40 characters, trimmed.
- `image`: a `data:image/jpeg` or `data:image/png` URL, the picture as the
  player gave it, flattened onto white, at most 1600 px on the long side
  (about 150–600 KB as JPEG). Cap the decoded size at 2 MB.
- `rights`: must be `true`.
- Signed in only. A few per player per day (say 5).

Errors (`CONTENT_ERROR_CODES`, none of them retire the verb):
`content/unauthorized` (guest), `content/invalid-image` (not JPEG/PNG, too
big, undecodable), `content/too-many` (over the daily cap; the game says "try
again tomorrow"). Anything else shows "couldn't send it".

## Server (WP)

- Table `oddsrabbit_app_submissions`: id, app slug, user id, title, file path,
  status (`pending` / `approved` / `declined`), created, reviewed by/at, note.
- The image goes to a **private** directory (not under a public uploads URL):
  it's unreviewed and may be anything.
- An admin screen lists pending submissions with the image, the player and
  the title; Approve / Decline, and a download link for the file.
- The erasure manifest deletes a user's rows and files.
- Worth considering: an automatic image-safety check on upload to pre-sort the
  queue. It doesn't replace the person approving.

## From approval to a page

Approval doesn't publish anything by itself. An approved picture goes through
the same curation as our own art (README, *Pages*):

1. Save the file as `art/<slug>/source.jpg`.
2. `page.config.json` with `title`, `category`, and `"credit": "<username>"`.
3. `npm run prep-page -- <slug>`, check `preview.png`, add merges, rerun.
4. Add it to a category (or the daily rotation) and deploy.

The credit shows on its tile as "by &lt;username&gt;" (`credit` flows from
`page.config.json` → `page.json` → `catalog.json`).

## Platform changes

Same shape as likes: `messages.ts` schema + `sdk.ts` `content.submit()` +
README + a test in apps-sdk; the WP migration, service, controller, route,
admin screen and erasure entry; `games.js` on the web host; `AppHost.tsx`
`HOST_CAPABILITIES` and the bridge in the app. Deploy order: migration + WP,
then the SDK dist, then the web host and app. Once the SDK has it, drop the
local type in `src/submit.ts`.

Bridge size: a 600 KB data URL through postMessage and the React Native
WebView bridge is fine, but test it on a low-end Android device.

## Later

- `content.mySubmissions` → `[{ id, status }]`, so the menu can say
  "Approved" or "Not picked" instead of only "Sent for review".
- A push when a picture is approved (through `AppPushMuteService`).
- A "From players" shelf for approved pages.

## Open questions

- Terms: the submission needs a licence to show and distribute the picture
  (and a takedown route). Check the platform terms cover it, and the age rules
  if under-13s can play.
- Who reviews, and how fast? A week-long silence after "Sent for review" will
  feel like nothing happened; the status verb above helps.
