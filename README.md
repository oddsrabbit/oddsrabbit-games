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
- **Two clocks.** Elapsed time uses the server clock (`OR.time.now()`, in `src/clock.ts`), so changing the phone's clock can't fast-forward her. Time of day (the sky outside, 20:00–06:00 night, the 05:00 gift rollover, days visited) uses the device's time zone (`src/localtime.ts`).
- **All numbers live in `src/tuning.ts`**: decay rates, timers, bond and clover rewards, and the food menu.
- **Feeding is a choice.** Carrot (free, +25 food), dandelion greens (free, +15 food and +5 joy), strawberry (3 clover, +20 food and +15 joy) and an oat treat from the pantry (+50 food and +10 joy). Each meal rolls how she takes it: she **loves it** (extra joy and hearts), is **happy** (the food's usual effect), or finds it **just okay** (the food's hunger, none of its joy). Baked treats and berries delight her far more often than the free foods (`FOOD_REACTIONS` in `tuning.ts`). The roll is seeded on her id and meal count, so reopening the game can't re-roll it.
- **She keeps the Kit look for life.** No growth stages; days visited count towards bond instead.
- **Idle moments** (`src/render.ts`, presentation only). When she's content she has things to do: she curls up by the fireplace on cold days and at night, watches rain, snow or falling leaves from the window seat (or under the window), sits by her favourite piece of decor (a different one each day, picked from her id and the date), and now and then does a binky. The mood line says what she's up to.
- **Wild visitors** (`src/wildlife.ts`, numbers in `WILDLIFE` in `tuning.ts`). About 1.3 times a day one of eight creatures drops by and stays an hour or so: a hedgehog, robin, field mouse, frog, snail, squirrel, owl or (rarely) a fox cub. Who comes depends on the hour, the season and the day's weather. Each visit leaves 4–20 clover (active, so boosted; mostly 4 to 6) and, one time in ten, that creature's keepsake. The eight keepsakes are the **Woodland keepsakes** set (+5% clover rate), and they only come from visitors. Seeded like finds, so every device agrees; none come while she's on holiday. Tap one to say hi. The Collection sheet has an album of who's been, with hints for who hasn't. This replaces the server-authored daily visitor, which was never switched on.
- **The world outside** (`src/world.ts`). The season comes from the date and the day's weather is rolled from the date alone, so everyone sees the same rain; both show through her window (rain, snow and falling leaves are animated). Six seasonal events (Snow day, Spring bloom, Summer fair, Harvest moon, Spooky week, Winterfest) sell limited decor and outfits while they run, hand out one free item each, and make most of her finds that event's, for a set on the shelf. Past items come back every year.
- **More to do** (`src/extras.ts`):
  - **Garden:** one plot to start, up to five bought as upgrades; golden carrot seeds cost clover; strawberry and sprout seeds are free. Strawberries ( 8h, three for the pantry, eaten before any clover is spent), a golden carrot (12h, always loved) or clover sprouts (4h, +10 clover, +4 per level of richer soil). The watering can makes everything grow 25% faster.
  - **Finds:** while you're away she sometimes finds one of 12 collectibles (4 of them rare) for her shelf, worth 4 clover each (30 for a rare one). A full set on the shelf raises the clover rate.
  - **Wardrobe:** head and neck outfits bought with clover, drawn on her sprite.
  - **Foraging** (`src/forage.ts`, `FORAGE` in `tuning.ts`): from the Forage tool (whose label counts down while she's out), send her out for 2, 4 or 8 hours (not asleep, on holiday, or with energy under 30). The burrow is empty while she's gone and nobody can feed, pet or clean her, so her needs keep dropping at her awake rate; she doesn't doze off until she's home. Each whole hour out rolls her basket: clover (6–12, boosted), a strawberry for the pantry, a find, or now and then a golden carrot. Call her home early and she brings what she gathered in the whole hours so far. A `forage-home` reminder says when she's back.
  - **Toys:** Play opens her toys. Tap one and she plays: joy, and a care point. No score, no limit. She starts with a ball; the rest are bought. (Carrot catch, the old mini-game, is gone: it got repetitive fast.)
- **Clover** (`src/economy.ts`, `src/yard.ts`, `src/starter.ts`; design in [`./docs/rabbit-pets-economy.md`](./docs/rabbit-pets-economy.md), model in `dev/economy-model.py`). Every clover earned goes through `earn(reason)`:
  - **Active clover** (daily gift, care, finds, wild visitors, foraging) is boosted by the **clover rate**: +10% a bond level to 7, then +2% a level with no end, +5% per finished collection set, +3% per best friend (up to 5). Supporters get +25% on everything but lump sums.
  - **Flat clover** (sprout harvests, the yard, friends) is never boosted: what it says is what you get.
  - **The yard:** clover patches, beehives and mushroom logs make clover every hour. Prices are front-loaded: the first of each kind pays for itself in about 14, 30 and 60 days, and each further one costs more (`BUILDINGS` in `yard.ts`); the shop shows each one's income and payback. Storage holds 24 hours (36 and 48 with the shed); a chip on the burrow collects it.
  - **Lump sums:** bond levels 2–7, gift-streak milestones (7, 30, 100, 365 days), and **Getting started**: a seven-step checklist, one more step opening each day she's visited, with a free clover patch for the first.
- **Rooms** (`ROOMS` in `src/decor.ts`), **switched off for now** (`ROOMS_OPEN = false`): the Shop doesn't offer them, and her burrow and friends' show only the main room; rooms already dug and their decor stay in the save. When on: from the Shop (Dig a new room), dig out a **Nook** (15,000; the burrow turned round, its window on the right) and then a **Loft** (30,000; beams overhead). Once there's more than one, a switcher sits at the bottom of the burrow; each room has its own decor, she comes with you from room to room, and decorating works in whichever you're in. In memory every piece is in `items`, tagged with its `room`; stored, a dug-out room's pieces go under `rooms[room].items`, so a version from before rooms (which keeps fields it doesn't know) leaves them alone. Friends can look round every room: their snapshot carries each dug-out room's pieces (20 at most), and the visit screen has a tab per room plus the garden.
  - **Friends** (`FRIEND_CLOVER` in `tuning.ts`): a visit pays the visitor and the host a flat **10 clover** each. (Until 2026-10-06 the five welcome pieces each added to that; they're meadow decor now, and a save that bought them gets each piece, `WELCOME_BOUGHT`.) Gifts are things, not clover: a strawberry, a warm hello, a spare find, or a **golden carrot**, which becomes a flat 60 clover for the friend. Only the first 5 of each kind a day pay (visits made, visits hosted, clover gifts received). Sending pays nothing. A clover bundle from a friend on an older version pays 10. **Friend bonuses** (`FRIEND_MILESTONES`) pay a lump sum once each when you and 3, 5, 10 and 20 friends have visited or gifted each other both ways: 500, 1,000, 2,000 and 4,000. In the economy model, 5 active friends make a casual player about 1.55× faster over the first year (1.7× in the middle months), one about 1.05×.
- **The garden** (`src/garden.ts`, `src/garden-scene.ts`; design in [`./docs/rabbit-pets-garden.md`](./docs/rabbit-pets-garden.md)): a second room, three areas wide, that you walk along with the arrows, the dots or a swipe. The veg patch has the beds (tap one to plant, pick or see how long is left; locked beds show a signpost); the yard has every patch, hive and log in its own spot, with a dashed + for each one you could build next; the meadow opens for 300 clover (step 6 of Getting started) and takes the thirteen outdoor pieces (150 to 1,500), sold in its own shop, placed and dragged with Arrange. They're decor only: friends visiting today sit at the guest chairs and the tea corner, and the friendship tree bears a fruit for each friend she's visited back and forth with (`garden-scene.ts`). Until 2026-10-06 six pieces made yard buildings produce more; none do now. It has the day's weather and the night sky, and Clover comes along when she's awake. Upgrades and the yard's list are in its Upgrades sheet.
- **Showpieces**: three long-term decor goals, each opening after the last: the **Four-seasons tree** (7,000; blossom, cherries, autumn leaves, then snow and fairy lights, by the season), the **Firefly lantern** (15,000; fireflies drift round it and glow at night) and the **Wishing well** (30,000; the water glints, and tapping it she makes a wish).
- **Festival raffle** (`src/raffle.ts`, `RAFFLE` in `tuning.ts`): during each seasonal event, tickets (100 clover) for that event's prize outfit, which can only be won. Each ticket has a 1 in 10 chance and the 10th always wins, so it never costs more than 1,000 (about 650 on average); any other ticket is just a miss. The odds, and ten pips counting to the sure win, are in the event sheet; each ticket opens with a shake-and-reveal (gold glow on a win, skipped under reduced motion). Seeded on her id and the ticket number; the count carries over to next year until won.
- **Richer soil** stops at level 5. Besides +4 clover a sprout per level, levels 2 and 4 each add a strawberry per harvest (up to 5) and level 5 brings golden carrots in twos.
- **The shop** (Decor): everything is there from day one, cheapest affordable first, then **Saving up**, then locked items with their condition (a bond level, or owning an earlier piece). Tap something you can't afford to pin it as your goal; a bar under the clover chip tracks it. Walls, floors and the window are **surfaces** (`SURFACES` in `decor.ts`): one of each at a time, swapped freely once owned. The moon window shows the real moon phase at night. New art for all of it is in `src/art/shop.ts`, drawn as fill only and outlined automatically.  - **Holiday:** send her away for 1–14 days. Her needs pause, she finds nothing, and reminders stop except one for when she's home.
  - **Journal** (`src/journal.ts`): firsts and milestones, newest first, capped at 200, in its own storage key.
- **Thriving** (`thriving` in `sim.ts`, `THRIVING` in `tuning.ts`): while her food, joy and clean are all 60 or more (energy comes and goes with sleep, so it doesn't count), she finds things and wild visitors come 1.5 times as often, and the daily gift is a quarter bigger. A chip on the burrow says when she is. Looking after her before bed keeps her thriving for the morning's gift; friends' visits (+15 to a need, the first 3 a day) help keep her there.
- **The guest book** (`src/guestbook.ts`): a visitor's note is built from three lists, an opener, what it's about (her burrow, her rabbit, her garden, or any piece of decor she has out) and what they say ("Wow, your fireplace is so cozy!"), and signed with a stamp: the heart, clover, carrot, sparkle or strawberry, or any find or keepsake the visitor has. Both ride on the visit's kind after the care (`snack-n1e34-s0b`: `n` and four base-36 digits, `s` and two); every list is append-only. The six fixed notes from before still read. Each signature keeps how the visitor's rabbit looked, for its picture. The host can pin up to four notes to a **corkboard** (decor, 250): tapping it shows them, and once it's hung they go in her snapshot (`pinned`) for friends to read on a visit. Pinned signatures are never trimmed from the book. **Covers** (300 to 1,800, `COVERS`) restyle her guest book and her corkboard's notes, for her and for friends.
- **The porch**: the Friends tab's live view of her burrow shows everyone who came by in the last three days (up to six, from the guest book), three deep on the floor, hopping about, going to find each other and doing binkies (`lively` in `render.ts`).
- **Friends** (`src/social.ts`). Her snapshot (name, coat, needs, outfit, placed decor) is published with `showcase.publish` when something a friend would see changes, and at least every 20 minutes while playing; the home-screen widget reads the same snapshot. Friends' snapshots are checked and clamped before they're drawn. You can visit a friend's burrow (read-only) and bring each friend one gift a day along with your visit (a golden carrot from the pantry, a strawberry, a warm hello, or a spare find for their shelf: any find you have more than one of, with the ones they're missing shown first, from the `missing` list in their snapshot): one button does both. On the host's side the visitor's rabbit hops in carrying the parcel, and tapping them opens it (`carriedGifts` in `guests.ts`); a gift from anyone not visiting (an older version, or a guest who hopped home before it was opened) waits in the inbox and is opened from a sheet. A host without visits still sends gifts on their own. Visiting a friend on a new enough version, **See their garden** shows their veg patch, yard and meadow from their snapshot (`garden` in `ShowcaseData`, drawn from a stand-in pet by `friendGardenPet`; only what they've built, no build prompts). A visit can carry a **guest-book note**, one of six preset lines (`GUEST_NOTES`), riding on the visit's kind after the care (`snack-cozy`); the host's push falls back to the platform's generic line for those kinds. Every visit is kept in her **Guest book** (on the Friends tab), the last 60, stored in `v1:journal` and merged across devices. The **Friends tab** (`main.ts renderFriendsPage`) opens on her burrow, live, with whoever's over in it (a second `Scene` on the page, `porchStage`; tap it to go home), who's over or at the door, the newest note in her guest book, and "Say hi" / "Who came"; with no visitors yet it says so and offers an invite. Under it, one line of your visits today (the first 5 pay clover) and gifts sent, then friends in the order to visit them: anyone who came by and hasn't been visited back first ("Visit back"), then the rest by friendship, with the ones visited today folded into **Done today**. Each card says which care would help their rabbit most (`careHint`, from their snapshot's needs worn down since it was taken, `friendNeeds`) and shows friendship as ten hearts to best friends. **Invite** sits in the header on every state and opens a sheet with the share card, how people become friends (follows on OddsRabbit), and the friend bonuses; under 5 friends a "Room for more friends" card sits after the list; with none, the tab is her door between two empty plots and **Why have friends**. On a friend's burrow you pick a care (the one that helps most is picked to start with) and optionally a guest-book note, then one button drops by ("Feed Pip · +5 clover"); their needs show over the scene, and a gift is a follow-up row under it. `?lane=1` (harness `lane=1`) tries friends' doors along a hillside above the list: lamp lit for visited today, a parcel for a gift sent, a heart for best friends, a sign over anyone to visit back.
- **The art is drawn by the game at startup** (`src/art/`): the rabbit is built from shapes (head and body ellipses, capsule ears) on a 40×40 grid, outlined and shaded, with a face per mood; coats are palette swaps. Ears are chosen at adoption (short, long or lop; rabbits from before the choice have long ears) and travel with her outfit in `Dress`, so friends see them too. `dev/sprite-lab.html` is a copy of the rabbit code with its numbers on sliders, for trying shapes before changing `rabbit.ts`. `dev/garden-lab.html` draws the garden strip (`src/art/garden.ts`, spots from `src/garden.ts`) by season, weather and night, with the tap targets; `npm run build` writes its script to `dist/dev/`. Items are character grids. The scene is drawn at 1× on a 98×118 canvas and scaled up to fill the stage's width with smoothing off. There are no image files except the store icon.

## Sound

Short, quiet effects synthesised with WebAudio, like the other games: a munch for Feed, a trill for Pet, a bubbly swish for Clean, a falling pair for Bed and a boing for Wake, a chime for the daily gift, a blip for clover, a thock when decor is placed and a paper flip for Flip. There's also a pop when she plays with a toy, a rustle for a harvest, and a small discovery chime when she finds something. No music or loops. Audio starts on the first tap (browsers require it), pauses while the page is hidden, and the speaker button in the header mutes it; the choice is saved in `v1:settings`.

## SDK surface used

- `whenReady()`, `ready()`, `user` (signed-in only; web shows a sign-in screen with `actions.requestSignIn`)
- `storage.get/set`: four keys, `v1:pet`, `v1:burrow`, `v1:settings`, `v1:journal`, each with a `rev` that counts the player's changes. Before writing, the game checks nobody else has written since; if another device has, it takes that device's pet and burrow instead, and merges the journals. A hidden tab doesn't save, and until the server clock answers nothing is saved at all (`src/store.ts`, `main.ts` `othersHaventWritten`, `syncClockOrHold`). **Saves from newer versions are safe** (the top of `src/store.ts`): a version keeps pieces, fields and ids it doesn't know and writes them back untouched, and every save carries `schema` (`SAVE_SCHEMA`). Bump it only for a change an older version would get wrong even keeping unknowns (a renamed or restructured field, a value that means something new); a version that finds a newer schema saves nothing and asks for a reload. A save that's there but can't be read, or can't be reached, is never treated as missing: the game says so and offers to try again instead of starting fresh over it. `dev/harness.html?save=newer|broken` shows both screens.
- `time.now`: server time for the simulation
- `notifications.schedule/cancel/status`: reminders for a finished nap, a baked treat, a ripe garden, tomorrow's gift, and "she misses you" after a day away (at most 5 pending). One key per kind; every visit reconciles the full set (`src/reminders.ts`). The player opts in the first time a timer starts, and can switch them off on her page (her tab).
- `showcase.publish/friends`, `gifts.send/inbox/claim/sentToday`, `visits.record/inbox/seen/sentToday` (scope `bridge:social`): friends, gifts, and visits with care, where the visitor's rabbit shows up in the host's burrow for about an hour, two at a time. The UI only appears when the host has the verbs. `user.supporter` sets the +25% Supporter bonus.
- `actions.share` (a text card), `actions.haptic`, `lifecycle.on('pause' | 'resume')`

## Layout

```
src/
  main.ts        boot, screens (sign-in, adopt, burrow, decorate), sheets
  sim.ts         the simulation: advance(), act(), mood, bond
  world.ts       seasons, weather, seasonal events
  extras.ts      garden and its upgrades, finds, wardrobe, toys, holidays
  economy.ts     earn(), the clover rate, bond levels, lump sums, friend limits
  yard.ts        the yard's buildings and storage
  starter.ts     the Getting started checklist
  collectibles.ts what she finds, and the shelf's sets
  journal.ts     the journal
  social.ts      the friends snapshot (and widget contract), gifts
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
- `extras=1` to give the seeded pet a garden, finds, outfits and a journal
- `rich=1` for a well-off pet: new decor, a starry wall, the moon window and a yard
- `at=HH` to shift the clock to that local hour (`at=23` for night)
- `date=2026-12-15` to shift to a date (seasons, weather, events; Winterfest gives its scarf)
- `user=0` for the signed-out screen, `ask=1` to get the reminder prompt on the first timer
- `friends=0` to hide the social verbs, `inbox=0` for no waiting gift (two mock friends and one gift by default)
- `click=Decor,Flip` to press buttons in order, and `drag=x1,y1,x2,y2` to drag on the burrow (scene pixels)

In the real hosts, `?preview=1` lets a signed-out player try it without saving to an account.

## Not yet

The server-authored daily visitor is replaced by wild visitors (`src/wildlife.ts`), which need nothing from the server. The home-screen widget lives in the mobile app (it reads the showcase snapshot); the local dev sandbox host (`src/host/`) doesn't answer the social verbs, so use the harness for friends.
