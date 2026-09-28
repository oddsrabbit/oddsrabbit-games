# Rabbit Pets: the garden as a place

Status: **stages 1–3 built 2026‑09‑25**: the art and layout (`src/garden.ts`, `src/art/garden.ts`, `dev/garden-lab.html`), the garden room (`src/garden-scene.ts`, "the garden room" in `main.ts`), and the meadow ("the meadow" in `main.ts`, the outdoor pieces in `decor.ts` and `art/shop.ts`, the yard's help in `yard.ts`, tested in `meadow.test.ts`). Stage 4 (friends see the garden) not started. Game only: everything here is in
`rabbit-pets/`, with no platform or backend changes. Replaces the garden
sheet (`openGarden` in `main.ts`) with a second room you walk along. The
mocks are on a canvas (<https://claude.ai/artifact/EnHx8N6a4gxHSkpNh4bd4R>),
in the row "Chosen: A up close, B wide". The other rows are the four
directions it was chosen from.

**Decisions already taken** (2026‑09‑25):

- **The garden is a room, not a sheet.** The Garden tab in the tab bar
  moves to it (it began as a Burrow | Garden switch in the header). The garden has the burrow's layout: scene
  on top, a panel of buttons below.
- **It's one long strip, three screens wide:** the veg patch, the yard and
  the meadow, left to right. Each area fills the screen at the burrow's
  scale. You move between areas with the edge arrows, the dots or a swipe.
- **Everything you own is on show.** Each plot, patch, hive and log has its
  own spot. Spots you haven't built yet show as a dashed "+", plots
  included: the next plot for sale carries its price, and later ones are
  faint, with a padlock.
- **The meadow is for outdoor decor that helps the yard.** Pieces are
  placed and dragged the way the burrow's decor is, and six of them make
  one kind of yard building produce more (§6.5).
- **Night, the seasons and the weather reach the garden too**, from the
  same `isNight`, `seasonOf` and `weatherOf` the burrow's window uses.

## 1. What the player sees

**Getting there.** The Garden tab in the tab bar along the bottom opens it,
and the Home tab goes back. When she's hopped in after you, she turns to
look back into the area rather than at the edge she hopped to. (It began as a Burrow | Garden switch in the
garden's header; the tab bar replaced it.) The garden opens on the area you
last looked at, the veg patch the first time. Forage is at the end of every
area's row of buttons, counting down while she's out.

**The veg patch** (area 1). Seen from above, in 3/4 like Stardew Valley,
as is the yard; only the meadow is still side-on (September 2026): a treeline and fence
along the top, grass filling the view, and five fields in a grid of three
over two either side of the path, with paths up between them. A bought
field is tilled soil in furrows with a row of plants on each, so a ripe one
reads as a field of strawberries. Land still to buy is a dashed outline,
like the yard's build spots: the next field is bright, with a "+" and a
price tag (tap it to buy it; the tag lights up and bobs once you can afford
it), and the rest are faint, with a padlock. She sits in the
grid's sixth cell, drawn a little smaller in the garden than in the burrow
(art/rabbit.ts K_GARDEN) so the fields read at their size. The treeline's
trees are each their own crown, mixed by season (autumn is orange, gold and
a few still green). Tap a field to plant,
tap a ripe crop to pick. A growing field wears a little tag with its countdown ("45m", "1h20"), and tapping it says the same in words. Panel:
Pick, Plant, the next plot upgrade, Seeds.

**The yard** (area 2). Seen from above, like the veg patch, the treeline
and fence running on from it. The shed, then 10 clover patch spots in two
rows behind the path (a patch is a square of clover, seen from above), 5
hive spots and 5 log spots in front, leaving the right-hand end for her. A
tall tree and a hedge, with the meadow's gate in it on the path, hide the
seam with the side-on meadow. Owned buildings sit in the
first spots in order; the rest show a dashed "+". Tap any building, or
Collect, to collect everything waiting. Tap a "+" to build the next one of
that kind: the confirm names it and its price, and it appears in the next
free spot (spots fill in order, see §3). A locked kind shows its "+" dimmed
with the condition ("After 5 hives"). A chip shows what's waiting ("+43").
Panel: Collect (with the amount as a badge), Patch, Hive, Log.

**The meadow** (area 3). Locked at first, behind a gate that opens for
300 clover (§6.3). Once open: grass for outdoor decor, plus the fence to
hang lights and garlands on. Decorate works as in the burrow: drag, flip,
put away. Pieces that help the yard say so in the shop ("Beehives make 10%
more"), and the yard's line shows what's helping ("Sunflowers: +2.4 a day
per hive"). Panel: Shop, Decorate, and the two most recent pieces.

**Every area** has a mood line, the Upgrades button (the soil levels, the
watering can, the shed: today's lists, kept as a sheet, because lists are
the clearest way to compare prices) and Burrow.

**Clover.** Awake, she comes with you: she hops into the area you're
looking at and follows when you switch. Asleep, she stays on her bed in the
burrow, and the garden's mood line says so. Nothing in the garden needs
her.

**At night** the sky darkens, stars and the real moon come out, fireflies
drift and lamps glow, as in the night mock. Nothing is locked at night.

## 2. What stays the same

- **Every rule of the garden and the yard:** crops, grow times, seeds,
  harvests, soil, the watering can, building prices, storage and the
  shed. `extras.ts` doesn't change. `yard.ts` changes in one place: a
  building's output adds the meadow's help (§3).
- **The pantry, Getting started goals and reminders** (`harvest`, `yard`,
  `garden-ready`).
- **Friends' visits** see the burrow only, for now (§5, stage 4).

## 3. The model

**Plots and buildings keep no position.** `pet.garden.plots` is already an
array and the yard already stores counts per kind. Their spot is their
index: plot 3 is the third bed, the fourth hive is in the fourth hive spot.
So there's nothing new to save for them and nothing to migrate. The spots
are a fixed table in a new pure module, `garden.ts`:

```ts
export const AREA_W = SCENE_W;          // each area is one burrow-width
export type AreaId = 'patch' | 'yard' | 'meadow';
export const AREAS: AreaId[] = ['patch', 'yard', 'meadow'];

/** Where each plot and each building of a kind sits, in strip pixels (bottom-centre). */
export const PLOT_SPOTS: { x: number; y: number }[];               // 5
export const BUILDING_SPOTS: Record<BuildingId, { x: number; y: number }[]>; // 10 / 5 / 5
export const SHED_SPOT: { x: number; y: number };

/** What's at a strip point: a plot, a building, a free spot, or nothing. */
export function hitTest(pet: PetState, x: number, y: number): GardenHit | null;
```

The yard mock drew only 3 log spots, spaced wide. Five fit in a row at the
same scale (5 × 12 px plus gaps, in a 98 px area), so the log limit stays
at 5.

**Outdoor decor lives in the burrow's save, and its zone says where it
goes.** Outdoor pieces have their own zones, `lawn` and `fence`, in strip
pixels inside the meadow. The burrow only ever draws its own zones (floor,
rug, hang), so it skips them without a new field or a new save version, and
one inventory in `v1:burrow` means one save and none of the sync logic a new
key would need. (The proposal had a `room` field on each piece; the zone
already said it.) The friends' showcase leaves outdoor pieces out, and the
burrow's decorating shop doesn't sell them. At about 70 bytes a piece, the
16 KB cap is far away.

**Seasonal pieces stay in the burrow for now.** Moving the scarecrow, the
paddling pool and the rest outdoors would move pieces players have already
placed; that can come later.

**The meadow's help is kept on the pet.** Yard output is worked out from
`PetState` alone, but placed decor lives in `v1:burrow`. So the pet keeps
the list of helping pieces placed in the meadow: `pet.meadow?: string[]`,
updated whenever one is placed or put away. `yard.ts`'s `perHour` adds
`BOOST` × a building's output for each listed piece that helps its kind,
from a `boost?: BuildingId` on the piece's `DecorDef`. As when a building
is bought, storage is brought up to date first, so the change only
counts from then on. A save from before the meadow has no list and no
help.

**Zones gain two outdoor kinds.** `Zone` adds `lawn` (the meadow's ground)
and `fence` (hanging on the fence line), with their own bounds in strip
pixels. A `DecorDef` gains `outdoor?: true`: an outdoor piece can only go on
`lawn` or `fence`, an indoor one only indoors. Seasonal pieces that are
really outdoor things (the scarecrow, the paddling pool, the lemonade stand,
the snow rabbit, the sled) become outdoor pieces; one already placed
indoors stays where it is until it's put away.

## 4. The renderer

**A second scene class, `GardenScene`, beside `Scene`.** It shares the
sprite cache, the particles and the rabbit's drawing (moved to a small
shared base), and adds:

- **A camera.** The strip is `3 × AREA_W` wide; the canvas shows one area
  at the burrow's scale (`fitScene`, unchanged). On a switch the camera
  slides there over 380 ms, easing out, and jumps with reduced motion.
  **Changed 2026-09-26:** it moves by fractions of a pixel. The art is
  still drawn on whole pixels, and the canvas (one column wider than the
  stage) is shifted by the leftover fraction in screen pixels, so a slide
  no longer steps a whole art pixel (about 4 screen pixels) at a time. The
  game draws at ~15 fps at rest and every frame while the camera or the
  rabbit is moving. (Before: 18% of the way per frame, whole pixels, 15 fps.)
- **Swipe.** The view follows a sideways drag (more across than down, over
  8 px) one to one, and gives like a rubber band past either end. Let go
  with a flick and it goes on to the next area that way. Slower, it settles
  on the nearest area. Either way the slide starts at the finger's speed.
  A short drag is a tap, so tapping beds and hives still works. (Before: the
  view stayed put until release, then any drag over 24 px switched area.)
- **Drawing.** The background (sky, hills, fence, grass, path) is drawn
  once per season, weather and night and cached, like `room()`. Only the
  visible area and a few pixels either side are blitted each frame.
- **Night.** `drawGardenShade` gives a tint to multiply over the ground and
  everything on it, clear over the sky and hills, which `drawGarden` has
  already drawn in night colours. So the sky doesn't darken twice, the
  problem a flat darken over the whole strip had. Fireflies go on top.

`fitScene` already crops and centres an area-wide scene, so the stage
layout doesn't change.

**Accessibility.** The canvas can't be tabbed through, so every tap on the
scene has a button in the panel (Pick, Plant, Collect, build) and the area
switch is three real buttons with `aria-current`. The canvas's `aria-label`
describes the area in view ("The yard: 5 patches, 2 hives, 43 clover
waiting").

## 5. Plan

1. **Art and layout** (no UI yet)
   - `art/garden.ts`: the outdoor background for 4 seasons × 5 weathers ×
     day/night, from the mock's painter: sky, hills, fence, grass with
     tufts, the dirt path, raised beds.
   - The signpost, the dashed "+" spot (normal and dimmed) and fireflies.
   - Building sprites at scene size: today's patch, hive, log and shed
     are list icons. They read well at 4× in the mock, but get a pass for
     detail and a shadow.
   - `garden.ts` with its spot tables and `hitTest`, and `garden.test.ts`:
     every spot inside its area, no two overlapping, counts map to spots,
     a hit on a free spot names the kind.
   - A `dev/sprite-lab.html` page to check it all at 4×.
2. **The garden room**
   - The header's Burrow | Garden switch.
   - `GardenScene` with the camera, swipe, arrows and dots.
   - Plots and the yard interactive, the area panels, Clover hopping in.
   - The day's weather falling across the garden (§6.4).
   - The meadow behind its gate, showing its price (§6.3).
   - The old sheet slims down to Upgrades.
   - The harness gains `room=garden` and `area=`.
3. **Outdoor decor**
   - The `lawn` and `fence` zones, which also mark a piece as outdoor (§3).
   - Decorate in the meadow. The shop shows a piece in the room it
     belongs to.
   - Opening the meadow (300 clover), and step 6's goal becomes "Open the
     meadow" (§6.2, §6.3).
   - All eight outdoor pieces (§6.1), and the six helping the yard
     (`pet.meadow`, `boost` on `DecorDef`, `perHour`; §3, §6.5), with tests
     that the help starts when a piece is placed, stops when it's put away,
     and never reaches back into storage already earned.
4. **Friends see the garden** (optional, later)
   - The showcase adds garden pieces and yard counts. Its fields are a
     contract with the widget, so the new ones are added, never renamed,
     and readers clamp them like everything else.
   - A friend's burrow gets the same switch.

Each stage ships on its own. After stage 2 the garden works without outdoor
decor; the meadow's gate stays shut, with a signpost saying it opens soon.

## 6. Settled and open

**Proposed, to confirm:**

- **Clover comes with you when she's awake**, and stays on her bed when
  she's asleep (§1). The alternative, her wandering the strip on her own,
  means she's often off screen when you open the garden.
- **Five log spots, not three** (§3).
- **The burrow keeps its Garden tool** as the way in (see §1), so there's
  no freed slot.

**Settled** (2026‑09‑25):

1. **All eight outdoor pieces get made**, not a first few: a bench, a
   birdbath, stepping stones, a wheelbarrow, a garden gnome, a trellis
   arch, fence lights and a sunflower patch. Six help the yard and are
   priced by what they help (§6.5); the bench (350) and fence lights (250)
   are for looks. They come with stage 3, alongside the seasonal pieces
   that move outdoors (§3), which stay for looks only.
2. **The garden gets a Getting started goal.** Step 6's "Buy a garden
   upgrade" becomes **"Open the meadow"**. The gate costs 300, the same as
   the cheapest upgrade (the second plot), so step 6 costs what it did.
   Until the meadow ships (stage 3), step 6 keeps the upgrade goal.
3. **The meadow starts locked.** The veg patch and the yard are open from
   the start; the meadow is behind a closed gate at the right edge of the
   yard. Tap it (or the third dot) and you get the offer: **open the
   meadow for 300 clover**. The gate is a one-off purchase, saved like the
   garden upgrades (`upgrades: ['meadow']`). Before it's opened, the third
   area shows over the fence: a glimpse of the meadow and the gate's
   price, so there's something to look forward to. Opening it is worth
   the clover because the meadow is where the yard's help comes from.
4. **The garden has the day's weather**, the same weather the burrow's
   window shows. Rain, snow and autumn leaves fall across the whole
   strip, and the sky goes grey for cloud and rain. It uses the particles
   the window already has, spread across the scene, and stops for reduced
   motion. This is in stage 2, with the room.
5. **Meadow pieces help the yard.** Each of six pieces adds 10% of a
   building's own output to every building of its kind, while it's placed
   anywhere in the meadow. Two pieces per kind, so a kind makes at most
   20% more.

   | Piece | Price | Helps |
   |---|---|---|
   | Stepping stones, birdbath | 400, 500 | Clover patches (+0.6 a day each) |
   | Sunflower patch, trellis arch | 1,200, 1,500 | Beehives (+2.4 a day each) |
   | Wheelbarrow, garden gnome | 4,000, 4,500 | Mushroom logs (+4.8 a day each) |

   The rules: where a piece stands never matters, only that it's out; the
   help is a per-building amount, not a multiplier; and no piece is ever a
   better deal than the first building of its kind. The numbers, and what
   they do to a year's clover (about +5%), are in
   [`rabbit-pets-economy.md`](./rabbit-pets-economy.md) §2.6, from
   `dev/economy-model.py`.
