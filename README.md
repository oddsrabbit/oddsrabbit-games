# Rabbit Pets

A cozy virtual pet that lives in real time. Adopt a rabbit, keep her fed, happy, rested and clean, bake her treats, open a gift each day, and decorate her burrow with the clover you earn: drag decor anywhere on the floor or wall, flip it, or put it away. She keeps living while the game is closed; each visit replays the time away and shows what she got up to. She can't get sick or leave: at worst she's grumpy until you visit.

Design and decisions: [`./docs/rabbit-pets.md`](./docs/rabbit-pets.md).

## Build and deploy

Private repo. It expects the public SDK checked out next to it at `../apps-sdk`: types come from its source (see `tsconfig.json`), and the build reads its `dist/sdk-v1.js`.

```bash
(cd ../apps-sdk && npm run build)   # the SDK first
npm install
npm test && npm run type-check
npm run build                        # → dist/rabbit-pets/
```

Upload `dist/rabbit-pets/` to `apps.oddsrabbit.com/rabbit-pets/`, the same place it went when apps-sdk built it. `dist/sdk-v1.js` is a copy for `dev/harness.html` only; the live SDK is deployed from apps-sdk. Then bump the cache version as usual (see apps-sdk `build.config.mjs`).

New bridge verbs still go in apps-sdk (schema, SDK, hosts). This game picks them up from source straight away.

## How it works

- **The simulation is pure** (`src/sim.ts`). Time always comes in as an argument. Catch-up after an absence and the live game are the same code: `advance()` replays fixed 10-minute steps at absolute times, so advancing in one go or in pieces lands on the same state. Anything random while you're away is seeded on `(petId, stepIndex)`, so a phone and a laptop replaying the same gap agree. Absences are replayed up to a week; a clock that goes backwards changes nothing.
- **Two clocks.** Elapsed time uses the server clock (`OR.time.now()`, in `src/clock.ts`), so changing the phone's clock can't fast-forward her. Time of day (bedtime 22:00–07:00, the 05:00 gift rollover, days visited) uses the device's time zone (`src/localtime.ts`).
- **All numbers live in `src/tuning.ts`**: decay rates, timers, bond and clover rewards, and the food menu.
- **Feeding is a choice.** Carrot (free, +25 food), dandelion greens (free, +15 food and +5 joy), strawberry (3 clover, +20 food and +15 joy) and an oat treat from the pantry (+50 food and +10 joy). Each meal rolls how she takes it: she **loves it** (extra joy and hearts), is **happy** (the food's usual effect), or finds it **just okay** (the food's hunger, none of its joy). Baked treats and berries delight her far more often than the free foods (`FOOD_REACTIONS` in `tuning.ts`). The roll is seeded on her id and meal count, so reopening the game can't re-roll it.
- **She keeps the Kit look for life.** No growth stages; days visited count towards bond instead.
- **Who she is** (`src/world.ts`). A personality fixed by her id: **shy** (petting means less until bond 3), **greedy** (hungrier, loves her food more often) or **playful** (gets bored faster, loves being petted). On her seventh day she gains a permanent **marking** shaped by how she was cared for: freckles (meals), a heart (cuddles) or a tuft (grooming).
- **The world outside** (`src/world.ts`). The season comes from the date and the day's weather is rolled from the date alone, so everyone sees the same rain; both show through her window (rain, snow and falling leaves are animated). Seasonal events (Harvest moon, Spooky week, Winterfest, Spring bloom) sell limited decor and outfits while they run, and Winterfest hands out a free scarf once.
- **More to do** (`src/extras.ts`):
  - **Garden:** three plots; seeds cost clover. Strawberries (8h, two for the pantry, eaten before any clover is spent), a golden carrot (12h, always loved) or clover sprouts (4h, +6 clover).
  - **Finds:** while you're away she sometimes finds one of 12 collectibles (4 of them rare) for her shelf, worth 2 clover each.
  - **Wardrobe:** head and neck outfits bought with clover, drawn on her sprite.
  - **Carrot catch:** a 30-second mini-game (`src/catch.ts`), 3 plays a day, up to 10 clover a play. Stopping early doesn't use a play.
  - **Holiday:** send her away for 1–14 days. Her needs pause, she finds nothing, and reminders stop except one for when she's home.
  - **Journal** (`src/journal.ts`): firsts and milestones, newest first, capped at 200, in its own storage key.
- **Friends** (`src/social.ts`). Her snapshot (name, coat, needs, outfit, marking, placed decor) is published with `showcase.publish` when something a friend would see changes, and at least every 20 minutes while playing; the home-screen widget reads the same snapshot. Friends' snapshots are checked and clamped before they're drawn. You can visit a friend's burrow (read-only) and send each friend one gift a day (clover, a strawberry or a warm hello); the sender gets a clover. Gifts to you wait in an inbox and are opened together.
- **The art is drawn by the game at startup** (`src/art/`): the rabbit is built from shapes (head and body ellipses, capsule ears) on a 40×40 grid, outlined and shaded, with a face per mood; coats are palette swaps. Ears are chosen at adoption (short, long or lop; rabbits from before the choice have long ears) and travel with her outfit in `Dress`, so friends see them too. `dev/sprite-lab.html` is a copy of the rabbit code with its numbers on sliders, for trying shapes before changing `rabbit.ts`. Items are character grids. The scene is drawn at 1× on a 98×118 canvas and scaled up by a whole number with smoothing off. There are no image files except the store icon.

## Sound

Short, quiet effects synthesised with WebAudio, like the other games: a munch for Feed, a trill for Pet, a bubbly swish for Clean, a falling pair for Nap and a boing for Wake, a chime for the daily gift, a blip for clover, a thock when decor is placed and a paper flip for Flip. There's also a pop for a caught carrot, a rustle for a harvest, and a small discovery chime when she finds something. No music or loops. Audio starts on the first tap (browsers require it), pauses while the page is hidden, and the speaker button in the header mutes it; the choice is saved in `v1:settings`.

## SDK surface used

- `whenReady()`, `ready()`, `user` (signed-in only; web shows a sign-in screen with `actions.requestSignIn`)
- `storage.get/set`: four keys, `v1:pet`, `v1:burrow`, `v1:settings`, `v1:journal`, each with a `rev` so a newer copy from another device wins on return (`src/store.ts`)
- `time.now`: server time for the simulation
- `notifications.schedule/cancel/status`: reminders for a finished nap, a baked treat, a ripe garden, tomorrow's gift, and "she misses you" after a day away (at most 5 pending). One key per kind; every visit reconciles the full set (`src/reminders.ts`). The player opts in the first time a timer starts, and can switch them off under More.
- `showcase.publish/friends`, `gifts.send/inbox/claim/sentToday` (scope `bridge:social`): friends, visits and gifts. The UI only appears when the host has the verbs.
- `actions.share` (a text card), `actions.haptic`, `lifecycle.on('pause' | 'resume')`

## Layout

```
src/
  main.ts        boot, screens (sign-in, adopt, burrow, decorate), sheets
  sim.ts         the simulation: advance(), act(), mood, bond
  world.ts       personality, seasons, weather, seasonal events
  extras.ts      garden, finds, wardrobe, marking, mini-game plays, holidays
  journal.ts     the journal
  social.ts      the friends snapshot (and widget contract), gifts
  catch.ts       the carrot catch mini-game
  tuning.ts      every number
  localtime.ts   wall-clock helpers in an explicit time zone
  rng.ts         seeded randomness
  clock.ts       server-offset clock
  store.ts       storage keys and the coalescing saver
  reminders.ts   desired reminders + reconcile with the server
  sound.ts       soft synthesised sound effects (no audio files)
  decor.ts       catalog, placement zones, and reading older saves
  render.ts      the burrow scene (canvas)
  art/           rabbit, items, burrow, pixel helpers
  *.test.ts      run by `npm test`
dev/harness.html a local stand-in for the host, for running without the platform
icon-512.png     store icon, drawn from the same sprite
```

## Running locally

The game needs a host to answer the bridge. `dev/harness.html` is a small stand-in that keeps storage in memory:

```bash
npm run build                                   # from the repo root
python3 -m http.server 8765                     # any static server at the repo root
# open http://localhost:8765/rabbit-pets/dev/harness.html?seed=day&at=14
```

The harness loads the built game from `dist/`, so rebuild after changing code and reload.

Harness parameters:

- `seed=day|away` to start with a saved pet (`away` shows the summary)
- `extras=1` to give the seeded pet a garden, finds, outfits, a marking and a journal
- `at=HH` to shift the clock to that local hour (`at=23` for night)
- `date=2026-12-15` to shift to a date (seasons, weather, events; Winterfest gives its scarf)
- `user=0` for the signed-out screen, `ask=1` to get the reminder prompt on the first timer
- `friends=0` to hide the social verbs, `inbox=0` for no waiting gift (two mock friends and one gift by default)
- `click=Decor,Flip` to press buttons in order, and `drag=x1,y1,x2,y2` to drag on the burrow (scene pixels)

In the real hosts, `?preview=1` lets a signed-out player try it without saving to an account.

## Not yet

The daily visitor is switched off for now. The home-screen widget lives in the mobile app (it reads the showcase snapshot); the local dev sandbox host (`src/host/`) doesn't answer the social verbs, so use the harness for friends.
