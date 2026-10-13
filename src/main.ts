// Rabbit Pets: a cozy virtual pet that lives in real time. She keeps living
// while the game is closed; each visit replays the time away (sim.ts) and
// shows what happened. See docs/rabbit-pets.md.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { drawItem, drawPlot, type ItemArt } from './art/items';
import { blank, toSprite, type PixelGrid, type Sprite } from './art/pixels';
import { drawPadlock } from './art/garden';
import { drawRabbit, dressKey, type Dress, type Face, type Frame } from './art/rabbit';
import { drawBurrow, moonPhase, roomColours, SCENE_H, SCENE_W, WALL_INSET, WINDOW, type RoomStyle } from './art/burrow';
import { clockOffset, isServerTime, now, syncClock } from './clock';
import {
  addStarterLantern, addSurface, burrowForSave, byId, CATALOG, clampToZone, hasBed, hasLantern, isOutdoor, meadowPieces, meadowItems, WELCOME_BOUGHT, ownsDecor, ownsSurface, starterBurrow, surfaceById, surfacesOf, SURFACES, useSurface, ZONES,
  type BurrowState, type DecorDef, type PlacedItem, type SurfaceDef,
  canDig, digRoom, EXTRA_ROOMS, inRoom, openRoomsOf, ROOMS, ROOMS_OPEN, roomsOf, type ExtraRoom, type RoomId,
} from './decor';
import {
  type Outfit, buyOutfit, buyToy, buyUpgrade, COLLECTIBLES, CROPS, endVacation, giveOutfit, growMs, harvest, hasUpgrade, onVacation, OUTFITS,
  outfitById, ownsToy, plant, plotCount, plotOffer, plots, plotUpgrade, toyById, cropYield, soilLevel, soilMaxed, soilPrice, sproutClover, stage as cropStage, startVacation, TOYS, UPGRADES, upgradeUnlocked,
  VACATION_CHOICES, wardrobe, wear, type CropId, type Slot, type UpgradeId,
} from './extras';
import { bestFriends, mutualFriends, nextFriendMilestone, rate, settleLumps, type Lump } from './economy';
import { COLLECTION_SETS, setComplete } from './collectibles';
import { claimStarter, daysUntil, GOAL_TEXT, goalDone, markGoal, starterDone, starterReady, starterStep, starterView, STARTER_STEPS, type StarterGoal, type StarterStep } from './starter';
import { claimGoal, goalsAllDone, goalsReady, LATER_GOALS, laterDone, openGoals, type LaterGoalId } from './goals';
import {
  BUILDING_IDS, BUILDINGS, buyBuilding, buyShed, capacity, collect, countOf, nextPrice, perHour, SHED_REQUIRES, shedPrice, storageHours, stored,
  unlocked as buildingUnlocked, setMeadow, type BuildingId,
  payback,
} from './yard';
import { AREA_W, areaAt, AREAS, areaX, GROUND, hitTest, PLOT_SPOTS, STRIP_H, type AreaId } from './garden';
import { GardenScene, pieceBox, type GardenModel } from './garden-scene';
import { CRITTERS, critterById } from './wildlife';
import { isOut, trip as tripOf, type Loot } from './forage';
import { drawTicket, prizeWon, ticketsBought } from './raffle';
import { addEntry, emptyJournal, fitJournal, mergeJournal, MILESTONE_DAYS, signGuestbook, type Journal } from './journal';
import {
  applyGift, applyVisits, buildShowcase, careHint, friendNeeds, friendRank, findGiftKind, takeGolden, visitPay, findOfGift, friendGardenPet, GIFT_INFO, GIFT_KINDS, giftInfo, giveFind, noteText, spareFinds, visitKind, readShowcase, rewardGiftSent, rewardVisit, showcaseSignature, VISIT_INFO, visitInfo, VISIT_KINDS,
  type ShowcaseData, type VisitIn, type VisitKind,
} from './social';
import { carriedGifts, guestsHere, guestTurns, type GuestTurn } from './guests';
import {
  buyCover, coverById, coverOf, COVERS, isNote, MAX_PINS, OPENERS, phraseCode, phraseOf, PRAISE, readKind, stampsFor, subjectsFor,
  subjectText, togglePin, useCover, type Phrase, type PinShow,
} from './guestbook';
import { deviceTimeZone } from './localtime';
import { desiredReminders, reconcile, REMINDER_KINDS } from './reminders';
import { EAT_SWALLOW_MS, Scene, type Activity } from './render';
import { newPetId } from './rng';
import { pauseSound, play, resumeSound, setMuted } from './sound';
import {
  act, advance, thriving, bondLevel, COATS, giftReady, isAsleep, isNight, mood, newPet,
  FOOD_IDS, rewindFuture, spendClover, timer, visit, earsOf, EARS, type Action, type FoodId, type Coat, type Ears, type Mood, type NeedKey, type PetEvent, type PetState,
} from './sim';
import { defaultSettings, deleteGame, KEYS, loadBurrow, loadJournal, loadPet, loadSettings, savedBytes, Saver, STORAGE_TOTAL_BYTES, type Loaded, type Settings } from './store';
import { THRIVING, BOND_DAILY_CAP, BOND_LEVEL_CLOVER, CARE, CLOVER, DAY_ROLLOVER_HOUR, SPROUT_CLOVER, SUPPORTER_BONUS, RATE, FORAGE, FRIEND_CLOVER, HOUR_MS, MEADOW, RAFFLE, SOIL, STREAK_MILESTONES, FRIEND_MILESTONES } from './tuning';
import { dayKey, localParts } from './localtime';
import { activeEvents, daysLeft, limitedAvailable, seasonOf, weatherName, weatherOf, WEATHER_NAME, type Season, type SeasonalEvent, type Weather } from './world';

declare global {
  interface Window {
    OddsRabbit: OddsRabbitGlobal;
  }
}

const OR = window.OddsRabbit;
const tz = deviceTimeZone();
const params = new URLSearchParams(location.search);
/** Play without signing in, saving to this browser only. For local development. */
const PREVIEW = params.get('preview') === '1';
/** Friends' doors along a hillside on the Friends tab: a prototype, for trying out. */
const app = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;

let pet: PetState;
let burrow: BurrowState;
let settings: Settings;
let journal: Journal = emptyJournal();
let saver: Saver;
let scene: Scene | null = null;

// ------------------------------------------------------------------ helpers

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const spriteCache = new Map<string, Sprite>();
function itemSprite(art: ItemArt): Sprite {
  let s = spriteCache.get('i:' + art);
  if (!s) { s = toSprite(drawItem(art)); spriteCache.set('i:' + art, s); }
  return s;
}
function rabbitSprite(coat: Coat, face: Face, frame: Frame = 0, dress?: Dress): Sprite {
  const key = `r:${coat}:${face}:${frame}:${dressKey(dress)}`;
  let s = spriteCache.get(key);
  if (!s) { s = toSprite(drawRabbit(coat, face, frame, dress)); spriteCache.set(key, s); }
  return s;
}
/** Her outfit and ears, for drawing. */
function dressOf(p: PetState): Dress {
  const w = wardrobe(p);
  return { head: w.head, neck: w.neck, ears: earsOf(p) };
}
/** Each sprite's PNG, encoded once: sprites never change after they're drawn (art/pixels.ts). */
const spriteUrls = new WeakMap<HTMLCanvasElement, string>();
/** An <img> of a sprite at a whole-number scale. */
function img(s: Sprite, scale: number, alt = ''): HTMLImageElement {
  const el = h('img', { class: 'px', alt, width: s.w * scale, height: s.h * scale });
  let url = spriteUrls.get(s.canvas);
  if (!url) { url = s.canvas.toDataURL(); spriteUrls.set(s.canvas, url); }
  el.src = url;
  return el;
}
/** Largest whole-number scale that fits the sprite in a box. */
function fitScale(s: Sprite, box: number): number {
  return Math.max(1, Math.floor(box / Math.max(s.w, s.h)));
}

// Toasts take turns: one shows for TOAST_MS, or TOAST_MIN_MS when another is
// waiting, so a reaction and the reward it earned are both read. `onShow`
// runs as it appears (a sound that belongs with it).
const TOAST_MS = 2600;
const TOAST_MIN_MS = 1600;
/** Waiting beyond this many, the oldest waiting goes: they're stale by then. */
const TOAST_WAITING_MAX = 3;
const toastQueue: { msg: string; onShow?: () => void }[] = [];
let toastTimer = 0;
let toastShownAt = 0;
let toastShowing = false;

function toast(msg: string, onShow?: () => void): void {
  if ((toastShowing && toastEl.textContent === msg) || toastQueue.some((t) => t.msg === msg)) return;
  toastQueue.push({ msg, onShow });
  if (toastQueue.length > TOAST_WAITING_MAX) toastQueue.shift();
  if (!toastShowing) { nextToast(); return; }
  // cut the one showing short, but not before it's had its minimum
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(nextToast, Math.max(0, toastShownAt + TOAST_MIN_MS - performance.now()));
}

function nextToast(): void {
  window.clearTimeout(toastTimer);
  const t = toastQueue.shift();
  if (!t) { toastEl.classList.remove('show'); toastShowing = false; return; }
  // replay the pop so a new message reads as new
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.textContent = t.msg;
  toastEl.classList.add('show');
  toastShowing = true;
  toastShownAt = performance.now();
  t.onShow?.();
  toastTimer = window.setTimeout(nextToast, toastQueue.length ? TOAST_MIN_MS : TOAST_MS);
}

function haptic(kind: 'light' | 'success'): void {
  if (OR.capabilities.has('actions.haptic')) void OR.actions.haptic(kind).catch(() => undefined);
}

function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60), rest = m % 60;
  return rest ? `${hrs}h ${rest}m` : `${hrs}h`;
}
function fmtLong(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  const hrs = Math.floor(m / 60), rest = m % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (hrs >= 48) return part(Math.floor(hrs / 24), 'day');
  if (!hrs) return part(rest, 'minute');
  return rest ? `${part(hrs, 'hour')} ${part(rest, 'minute')}` : part(hrs, 'hour');
}
/** "in about 3 hours" or "within the hour", for lines that are read out when they change. */
function aboutHours(ms: number): string {
  const hrs = Math.round(ms / HOUR_MS);
  return ms > HOUR_MS ? `in about ${hrs} ${hrs === 1 ? 'hour' : 'hours'}` : 'within the hour';
}
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return fmtDuration(s * 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ saving

/**
 * Save her. `rev` counts her changes, so another device can tell a copy with
 * something new in it; only time passing (`changed` false) leaves it alone,
 * since replaying the same time on any device gives the same rabbit.
 */
function savePet(changed = true): void {
  if (changed) pet.rev += 1;
  // a copy, taken when the batch goes: `pet` itself can change (its rev too)
  // while the write is in flight, and the guard must record the rev that was
  // actually written, or the next batch reads its own write as another device's
  saver.queue(KEYS.pet, () => structuredClone(pet));
  queueShowcase();
}

/** Save her journal, cut to the room her other saves leave (journal.ts fitJournal). */
function queueJournal(): void {
  saver.queue(KEYS.journal, () => fitJournal(journal, journalRoom()));
}

/**
 * Room she grows into before the journal's next save makes way: her save
 * grows a little as she's played (a friend, a find, an outfit), and the
 * journal is saved often (every line in it), so this is plenty.
 */
const JOURNAL_HEADROOM_BYTES = 1_500;

/**
 * What's left for her journal: everything shares STORAGE_TOTAL_BYTES (store.ts),
 * and her own save, her burrow and the settings come first. The journal is
 * the one that can lose its oldest pages; the rest can't be cut.
 */
function journalRoom(): number {
  const others = (pet ? savedBytes(pet) : 0) + (burrow ? savedBytes(burrowForSave(burrow)) : 0) + savedBytes(settings);
  return Math.max(0, STORAGE_TOTAL_BYTES - others - JOURNAL_HEADROOM_BYTES);
}

/**
 * What storage holds as far as this device knows: what it last read or wrote
 * of her and her burrow (null: nothing there yet, as when adopting). If
 * storage has moved on from either, another device has written.
 */
let inStorage: { pet: { petId: string; rev: number } | null; burrow: number | null } = { pet: null, burrow: null };
const storedOf = (p: PetState) => ({ petId: p.petId, rev: p.rev });

/** Whether another device has written her since this one last read or wrote. */
function petMoved(r: Loaded<PetState>): boolean {
  if (r.kind === 'error' || r.kind === 'broken') return false; // nothing to lose by writing
  if (r.kind === 'newer') return true;
  if (r.kind === 'missing') return inStorage.pet !== null;
  return !inStorage.pet || r.value.petId !== inStorage.pet.petId || r.value.rev > inStorage.pet.rev;
}
function burrowMoved(r: Loaded<BurrowState>): boolean {
  if (r.kind === 'error' || r.kind === 'broken') return false;
  if (r.kind === 'newer') return true;
  if (r.kind === 'missing') return inStorage.burrow !== null;
  return inStorage.burrow === null || r.value.rev > inStorage.burrow;
}

/**
 * The saver's guard (store.ts BatchGuard): storage is last-writer-wins, so a
 * device that missed another's changes mustn't write its older copy over
 * them. If another device has written her or her burrow since, write nothing
 * and take its copy (of both, so a purchase can't come half from each). The
 * journal never conflicts: it's merged with the stored one.
 */
async function othersHaventWritten(docs: Map<string, unknown>): Promise<Map<string, unknown> | null> {
  const [rp, rb, rj] = await Promise.all([
    docs.has(KEYS.pet) ? loadPet(OR) : null,
    docs.has(KEYS.burrow) ? loadBurrow(OR) : null,
    docs.has(KEYS.journal) ? loadJournal(OR) : null,
  ]);
  if ((rp && petMoved(rp)) || (rb && burrowMoved(rb)) || rj?.kind === 'newer') {
    void returnToPage(false).then(() => {
      if (!pet) return;
      if (rp?.kind === 'ok' && rp.value.petId === pet.petId) toast('Picked up changes from your other device.');
      // the whole batch was dropped, but settings and the journal never
      // conflict (settings are only this player's choices, the journal merges):
      // send them again rather than lose them
      if (docs.has(KEYS.settings)) saver.queue(KEYS.settings, () => settings);
      if (docs.has(KEYS.journal)) queueJournal();
    });
    return null;
  }
  const p = docs.get(KEYS.pet) as PetState | undefined;
  if (p) inStorage.pet = storedOf(p);
  const b = docs.get(KEYS.burrow) as BurrowState | undefined;
  if (b) inStorage.burrow = b.rev;
  if (rj?.kind === 'ok') {
    journal = mergeJournal(journal, rj.value);
    docs.set(KEYS.journal, fitJournal(mergeJournal(docs.get(KEYS.journal) as Journal, rj.value), journalRoom()));
  }
  // the journal goes first: when it's being cut down, that makes the room the
  // rest of the batch needs (storage counts every key against one total)
  if (!docs.has(KEYS.journal)) return docs;
  return new Map([[KEYS.journal, docs.get(KEYS.journal)], ...[...docs].filter(([k]) => k !== KEYS.journal)]);
}

function saveBurrow(): void {
  burrow.rev += 1;
  saver.queue(KEYS.burrow, () => burrowForSave(burrow));
  queueShowcase();
}
function saveSettings(): void {
  settings.rev += 1;
  saver.queue(KEYS.settings, () => settings);
}
/** Write a line in her journal; with `first`, only the first time. */
/** Toast one-off payouts (a bond level, a streak milestone) and keep them in the journal. */
function payLumps(lumps: Lump[] | undefined): void {
  for (const l of lumps ?? []) {
    window.setTimeout(() => toast(`${l.what}! +${l.clover} clover.`, () => play('gift')), 900);
    note(`${l.what}. +${l.clover} clover.`, 'clover');
  }
}

/** Count toward Getting started. A step that's now complete waits to be claimed. */
function goal(g?: StarterGoal): void {
  if (!pet || starterDone(pet)) return;
  if (g) markGoal(pet, g);
  markBurrowGoals();
  savePet();
  watchGoals();
}

/** Goals the burrow shows, not her save: they count however they came about. True if one was marked. */
function markBurrowGoals(): boolean {
  const has: [StarterGoal, () => boolean][] = [
    ['bed', () => hasBed(burrow)],
    ['lantern', () => hasLantern(burrow)],
    ['surface', () => surfacesOf(burrow).owned.some((id) => { const k = surfaceById(id)?.kind; return k === 'wall' || k === 'floor'; })],
  ];
  let marked = false;
  for (const [g, ok] of has) if (!goalDone(pet, g) && ok()) { markGoal(pet, g); marked = true; }
  return marked;
}

/**
 * Tell the player when the open step is ready to claim, whatever finished it:
 * a goal just done, or one that counts what she has (a toy bought, a find
 * home from foraging), checked every tick.
 */
let starterWasReady = false;
/** How many later goals were ready to claim, last we looked: a new one gets a toast. */
let laterWereReady = 0;
function watchGoals(): void {
  if (!pet) return;
  if (starterDone(pet)) {
    const ready = goalsReady(pet).length;
    if (ready > laterWereReady) window.setTimeout(() => toast('A goal is done! Claim your reward.', () => play('gift')), 700);
    laterWereReady = ready;
    return;
  }
  if (markBurrowGoals()) savePet();
  const ready = starterReady(pet);
  if (ready && !starterWasReady) {
    window.setTimeout(() => toast(`Getting started: step ${starterStep(pet)} done! Claim your reward.`, () => play('gift')), 700);
  }
  starterWasReady = ready;
}

/** "tomorrow", or "in 2 days": when a waiting step opens (days she's visited, so a day away doesn't count). */
function whenOpens(days: number): string {
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** Pay the open step's reward; the next step opens straight away, or on its day. */
function claimStep(): void {
  const r = claimStarter(pet, now());
  if (!r.paid) return;
  const d = r.paid;
  pet = r.state;
  savePet();
  play('gift');
  // the next step, if it's for another day: say what it pays, so tomorrow has a reason
  const next = STARTER_STEPS.find((x) => x.step === d.step + 1);
  const wait = next ? daysUntil(pet, next) : 0;
  toast(`+${d.clover} clover${d.patch ? ' and a clover patch for the yard' : ''}!${wait ? ` Step ${next!.step} opens ${whenOpens(wait)}: +${next!.clover} clover.` : ''}`);
  note(`Getting started: step ${d.step} done.`, 'clover', `starter:${d.step}`);
  // the goals after it open now: ones already done wait quietly to be claimed
  if (starterDone(pet)) {
    laterWereReady = goalsReady(pet).length;
    note(`All settled in with ${pet.name}. Bigger goals from here on.`, 'star', 'starter:done');
  }
  render();
}

/** Pay a later goal's reward; the next goal opens in its place. */
function claimLater(id: LaterGoalId): void {
  const r = claimGoal(pet, id);
  if (!r) return;
  pet = r.state;
  laterWereReady = goalsReady(pet).length;
  savePet();
  play('gift');
  toast(`+${r.clover} clover!`);
  const text = LATER_GOALS.find((g) => g.id === id)!.text;
  note(`Goal done: ${text.charAt(0).toLowerCase()}${text.slice(1)}.`, 'clover', `goal:${id}`);
  render();
}

function note(text: string, art?: ItemArt, first?: string): void {
  const next = addEntry(journal, { atMs: now(), text, art }, first);
  if (next === journal) return;
  journal = { ...next, rev: journal.rev + 1 };
  queueJournal();
}

// ------------------------------------------------------------------ boot

async function boot(): Promise<void> {
  await OR.whenReady();
  // only when saving has kept failing for a while (store.ts QUIET_FAILURES): a blip as the app wakes retries quietly
  saver = new Saver(OR, () => toast("Having trouble saving. Keep the game open and we'll keep trying."), othersHaventWritten);

  if (!OR.user && !PREVIEW) {
    renderSignIn();
    OR.ready();
    return;
  }

  await loadAndStart();
  OR.ready();
}

/**
 * Read the saves and start: the game, adoption, or a screen saying why not.
 * A save that's there but can't be read is never treated as missing (see
 * store.ts): starting fresh would save over it.
 */
/** Quiet tries at reaching her save on opening before saying so: the connection is often still waking up. */
const LOAD_RETRIES_MS = [1_000, 2_000, 4_000];

async function loadAndStart(attempt = 0): Promise<void> {
  if (attempt === 0) await syncClockOrHold();
  const [p, b, s, j] = await Promise.all([loadPet(OR), loadBurrow(OR), loadSettings(OR), loadJournal(OR)]);
  if ([p, b, s, j].some((r) => r.kind === 'newer')) { stopForNewerVersion(); return; }
  const bad = [p, b, j].filter((r) => r.kind === 'error' || r.kind === 'broken');
  // couldn't reach it: try again quietly a few times; a save that's there but unreadable won't mend by waiting
  if (bad.length && !bad.some((r) => r.kind === 'broken') && attempt < LOAD_RETRIES_MS.length) {
    await wait(LOAD_RETRIES_MS[attempt]!);
    return loadAndStart(attempt + 1);
  }
  if (bad.length) { renderCantLoad(bad.some((r) => r.kind === 'broken')); return; }
  // settings are only preferences: unreadable ones start over harmlessly
  settings = s.kind === 'ok' ? s.value : defaultSettings();
  journal = j.kind === 'ok' ? j.value : emptyJournal();
  burrow = b.kind === 'ok' ? b.value : starterBurrow();
  inStorage = { pet: p.kind === 'ok' ? storedOf(p.value) : null, burrow: b.kind === 'ok' ? b.value.rev : null };
  if (p.kind !== 'ok') {
    renderAdopt();
    return;
  }
  pet = p.value;
  pet.supporter = !!OR.user?.supporter;
  // a journal saved before it had to share storage with her can fill it, and
  // then nothing of hers saves: cut it down now, before anything else is saved
  if (savedBytes(journal) > journalRoom()) queueJournal();
  startGame(true);
}

const okValue = <T>(r: Loaded<T>): T | null => (r.kind === 'ok' ? r.value : null);

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** How far ahead the device clock may run before what it simulated is thrown away. */
const CLOCK_AHEAD_MS = 2 * 60_000;
let clockHeld = false;

/**
 * Ask the server for the time. If it's slow to answer, carry on with the
 * device clock, but save nothing until it does: time only ever moves her
 * forward, so a device clock running ahead, once saved, can't be undone. If
 * the answer shows the device was ahead, what was played since is dropped and
 * the save (untouched) is replayed on the server's time. No answer within
 * 20 seconds more and the device clock stands, as on hosts without one.
 */
async function syncClockOrHold(): Promise<void> {
  const before = clockOffset();
  const sync = syncClock(OR).then(() => true, () => false);
  if (await Promise.race([sync, wait(2500).then(() => false)])) return;
  if (clockHeld) return;
  clockHeld = true;
  saver.hold();
  void Promise.race([sync, wait(20_000).then(() => false)]).then(async (answered) => {
    clockHeld = false;
    if (answered && before - clockOffset() > CLOCK_AHEAD_MS) {
      await saver.drop();
      saver.release();
      toast("Your device's clock is ahead, so she's on the server's time.");
      await loadAndStart();
      return;
    }
    saver.release();
  });
}

/** A newer version of the game has saved: this one mustn't write over it. */
function stopForNewerVersion(): void {
  saver.freeze();
  room = 'burrow';
  scene = null;
  setScreen('paper');
  const reload = h('button', { class: 'btn primary', type: 'button', text: 'Reload' });
  reload.addEventListener('click', () => location.reload());
  app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'intro' },
      h('h1', { text: 'Rabbit Pets has been updated' }),
      h('p', { text: 'Your rabbit was saved by a newer version of the game. Reload to carry on. Nothing has been changed.' })),
    reload)));
}

/** Couldn't read a save: say so and try again, rather than start fresh over it. */
function renderCantLoad(broken: boolean): void {
  setScreen('paper');
  const retry = h('button', { class: 'btn primary', type: 'button', text: 'Try again' });
  retry.addEventListener('click', () => { retry.disabled = true; void loadAndStart(); });
  app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'inner' },
    h('div', { class: 'intro' },
      h('h1', { text: 'We couldn’t load your rabbit' }),
      h('p', { text: broken
        ? 'Part of your save couldn’t be read. Nothing has been changed or lost. Try again in a little while, and if it keeps happening, let us know.'
        : 'We couldn’t reach your save just now. Nothing has been changed. Check your connection and try again.' })),
    h('div', { class: 'pen' }, img(rabbitSprite('snow', 'asleep'), 4, 'A sleeping rabbit')),
    retry)));
}

// ------------------------------------------------------------------ screens

/**
 * Which screen is up, on <body> for styles.css: it sets <body>'s background to
 * the colour at the screen's top edge, which the host reads to pick a legible
 * status-bar tone (the game itself draws under the status bar).
 */
function setScreen(screen: 'paper' | 'burrow'): void {
  document.body.dataset.screen = screen;
}

// ------------------------------------------------------------------ sign-in (web only)

function renderSignIn(): void {
  const canAsk = OR.capabilities.has('actions.requestSignIn');
  const pen = h('div', { class: 'pen' });
  pen.append(img(rabbitSprite('snow', 'asleep'), 4, 'A sleeping rabbit'));
  const button = canAsk
    ? h('button', { class: 'btn primary', type: 'button', text: 'Sign in to adopt' })
    : null;
  button?.addEventListener('click', () => void OR.actions.requestSignIn('Sign in to adopt your rabbit.'));
  setScreen('paper');
  app.replaceChildren(
    h('div', { class: 'screen' },
      h('div', { class: 'inner' },
        h('div', { class: 'intro' },
          h('h1', { text: 'Rabbit Pets' }),
          h('p', { text: 'Adopt a rabbit who lives in her burrow in real time. Sign in so she can find you again on any device.' })),
        pen,
        button ?? h('p', { class: 'intro', text: 'Sign in to OddsRabbit to adopt your rabbit.' })
      )
    )
  );
}

// ------------------------------------------------------------------ adopt

const RABBIT_NAMES = ['Mochi', 'Hazel', 'Pip', 'Juniper', 'Biscuit', 'Maple', 'Thistle', 'Nutmeg', 'Poppy', 'Willow', 'Fern', 'Bramble', 'Dumpling', 'Honey'];

function renderAdopt(): void {
  let coat: Coat = 'snow';
  let ears: Ears = 'long';
  const preview = h('canvas', { width: 40, height: 40, class: 'px', style: 'width:160px;height:160px', role: 'img', 'aria-label': 'Your rabbit' });
  const pctx = preview.getContext('2d')!;
  pctx.imageSmoothingEnabled = false;
  const legend = h('legend', { class: 'sr-only' });
  const label = h('div', { style: 'font-weight:700' });
  const coatBtns = COATS.map((c) => {
    const b = h('button', { class: 'coat', type: 'button', 'aria-label': coatName(c), 'aria-pressed': String(c === coat) },
      img(rabbitSprite(c, 'content', 0, { ears }), 1));
    b.addEventListener('click', () => {
      coat = c;
      coatBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(COATS[i] === coat)));
      label.textContent = `Coat: ${coatName(coat)}`;
      earBtns.forEach((x, i) => x.replaceChildren(img(rabbitSprite(coat, 'content', 0, { ears: EARS[i] }), 1)));
    });
    return b;
  });
  label.textContent = `Coat: ${coatName(coat)}`;
  legend.textContent = 'Coat colour';
  const earLegend = h('legend', { class: 'sr-only', text: 'Ears' });
  const earLabel = h('div', { style: 'font-weight:700' });
  const earBtns = EARS.map((e) => {
    const b = h('button', { class: 'coat', type: 'button', 'aria-label': earsName(e), 'aria-pressed': String(e === ears) },
      img(rabbitSprite(coat, 'content', 0, { ears: e }), 1));
    b.addEventListener('click', () => {
      ears = e;
      earBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(EARS[i] === ears)));
      earLabel.textContent = `Ears: ${earsName(ears)}`;
      coatBtns.forEach((x, i) => x.replaceChildren(img(rabbitSprite(COATS[i]!, 'content', 0, { ears }), 1)));
    });
    return b;
  });
  earLabel.textContent = `Ears: ${earsName(ears)}`;
  // Not "Clover": that's the money, and "Clover found a marble! +2 clover" reads badly.
  const suggest = (not?: string) => { const pick = RABBIT_NAMES.filter((x) => x !== not); return pick[Math.floor(Math.random() * pick.length)]!; };
  const nameInput = h('input', { id: 'rabbit-name', type: 'text', value: suggest(), maxlength: 16, autocomplete: 'off' });
  const another = button('Another', 'btn small', () => { nameInput.value = suggest(nameInput.value); nameInput.focus(); });
  another.setAttribute('aria-label', 'Suggest another name');
  const go = h('button', { class: 'btn primary', type: 'submit', text: 'Bring her home' });
  const form = h('form', { class: 'inner' },
    h('div', { class: 'intro' },
      h('h1', { text: 'Adopt your rabbit' }),
      h('p', { text: "She'll live in her burrow in real time, and she'll always be happy to see you." })),
    h('div', { class: 'pen' }, preview),
    h('fieldset', { style: 'margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px' }, legend, label, h('div', { class: 'coats' }, ...coatBtns)),
    h('fieldset', { style: 'margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px' }, earLegend, earLabel, h('div', { class: 'coats ears' }, ...earBtns)),
    h('div', { class: 'field' }, h('label', { for: 'rabbit-name', text: 'Her name' }), h('div', { class: 'name-row' }, nameInput, another)),
    go
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) { toast('Give her a name first.'); nameInput.focus(); return; }
    pet = newPet(newPetId(), name, coat, now(), tz, ears);
    pet.supporter = !!OR.user?.supporter;
    burrow = starterBurrow();
    savePet();
    saveBurrow();
    saveSettings();
    note(`${name} came home to the burrow.`, 'heart', 'adopted');
    startGame(false);
    toast(`Welcome home, ${name}.`);
  });
  setScreen('paper');
  app.replaceChildren(h('div', { class: 'screen' }, form));

  let raf = 0;
  const loop = (t: number) => {
    if (!preview.isConnected) return;
    const frame: Frame = Math.floor(t / 3000) % 6 === 5 ? 2 : Math.floor(t / 900) % 3 === 1 ? 1 : 0;
    pctx.clearRect(0, 0, 40, 40);
    pctx.drawImage(rabbitSprite(coat, 'content', frame, { ears }).canvas, 0, 0);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  void raf;
}

function earsName(e: Ears): string {
  return { short: 'Short', long: 'Long', lop: 'Lop' }[e];
}

function coatName(c: Coat): string {
  return { snow: 'Snow', cream: 'Cream', cocoa: 'Cocoa', silver: 'Silver', midnight: 'Midnight', ginger: 'Ginger' }[c];
}

// ------------------------------------------------------------------ the burrow

/**
 * The tab bar's places. The burrow and the shop share the burrow's screen (the
 * shop is decorating it); the garden has its own; friends and her are pages.
 */
type Tab = 'burrow' | 'garden' | 'shop' | 'friends' | 'her';
const TABS: Tab[] = ['burrow', 'garden', 'shop', 'friends', 'her'];

interface Ui {
  /** The burrow screen's own nodes: the HUD, the stage, the panel. */
  nodes: Node[];
  name: HTMLElement;
  sub: HTMLElement;
  clover: HTMLElement;
  needs: Record<NeedKey, { wrap: HTMLElement; fill: HTMLElement; label: HTMLElement }>;
  stage: HTMLElement;
  /** The rooms, to switch between (renderRoomNav). */
  roomNav: HTMLElement;
  canvas: HTMLCanvasElement;
  chips: HTMLElement;
  /** The right-hand column: the daily gift, running events, Getting started. */
  cards: HTMLElement;
  gift: HTMLButtonElement;
  panel: HTMLElement;
  moodline: HTMLElement;
  acts: Record<'feed' | 'pet' | 'play' | 'clean' | 'nap', HTMLButtonElement>;
  feedBadge: HTMLElement;
  sound: HTMLButtonElement;
  goal: HTMLElement;
  /** The panel's normal contents, restored after decorating. */
  panelKids: Node[];
  /** Along the bottom of every screen. */
  tabbar: HTMLElement;
  tabs: Record<Tab, HTMLButtonElement>;
  /** The Friends and Her pages: one header and one scrolling body, filled by whichever is showing. */
  page: { nodes: Node[]; title: HTMLElement; sub: HTMLElement; action: HTMLElement; clover: HTMLElement; body: HTMLElement };
}
let ui: Ui;
let tab: Tab = 'burrow';
let scale = 4;
let decorating = false;
/** The piece being moved while decorating. */
let selectedUid: string | null = null;
let drag: { uid: string; dx: number; dy: number; moved: boolean } | null = null;

let started = false;
function startGame(returning: boolean): void {
  // Browsers only allow audio after a gesture: unlock on the first one.
  setMuted(settings.sound === false);
  // still on step one from before the lantern came with the burrow: here it is to hang
  if (starterStep(pet) === 1 && !starterDone(pet) && addStarterLantern(burrow)) saveBurrow();
  buildBurrowScreen();
  // a step already waiting when she's opened isn't news (its chip says so)
  starterWasReady = starterReady(pet);
  laterWereReady = goalsReady(pet).length;
  catchUp(returning);
  // the lantern to hang: the header's Arrange gives a little bounce, once a visit, to show where arranging is
  if (!starterDone(pet) && starterStep(pet) === 1 && !goalDone(pet, 'lantern')) {
    window.setTimeout(() => {
      const b = document.querySelector<HTMLElement>('.arrange-btn');
      if (!b || tab !== 'burrow' || decorating) return;
      b.classList.add('nudge');
      window.setTimeout(() => b.classList.remove('nudge'), 1600);
    }, 2500);
  }
  // Once per page: adopting again after starting over reuses the same loops.
  if (started) return;
  started = true;
  const unlock = () => resumeSound();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  wireLifecycle();
  requestAnimationFrame(frame);
  window.setInterval(tick, 1000);
}

function buildBurrowScreen(): void {
  // first run with the guest book's New marks: what's in it already counts as read
  if (settings.guestbookSeenMs === undefined) { settings.guestbookSeenMs = (journal.guestbook ?? [])[0]?.atMs ?? 0; saveSettings(); }
  // a fresh burrow screen (a new game, or starting over) starts indoors
  room = 'burrow';
  tab = 'burrow';
  friendsCache = null;
  porch = null;
  herSig = '';
  friendsSig = '';
  gardenUi = null;
  gardenScene = null;
  gardenSig = '';
  const needDefs: { key: NeedKey; label: string; icon: Node; color: string }[] = [
    { key: 'hunger', label: 'Food', icon: img(itemSprite('carrot'), 1), color: 'var(--carrot)' },
    { key: 'happy', label: 'Joy', icon: img(itemSprite('heart'), 2), color: 'var(--joy)' },
    { key: 'energy', label: 'Energy', icon: img(itemSprite('moon'), 2), color: 'var(--sun)' },
    { key: 'clean', label: 'Clean', icon: img(itemSprite('droplet'), 2), color: 'var(--sky)' },
  ];
  const needs = {} as Ui['needs'];
  const needEls = needDefs.map((d) => {
    const fill = h('span', { style: `background:${d.color};width:50%` });
    const label = h('span', { text: d.label });
    const wrap = h('div', { class: 'need', role: 'meter', 'aria-label': d.label, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('div', { class: 'need-label' }, d.icon, label), h('div', { class: 'bar' }, fill));
    needs[d.key] = { wrap, fill, label };
    return wrap;
  });

  const name = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  const canvas = h('canvas', { role: 'img', 'aria-label': 'The burrow' });
  // Two columns pinned to the visible stage, not the (maybe cropped) scene:
  // small status pills on the left (what's going on), and on the right the
  // big cards for things to do (the daily gift, events, Getting started).
  const chips = h('div', { class: 'float-chips' });
  const gift = h('button', { class: 'gift-btn', type: 'button', hidden: true }, img(itemSprite('gift'), 3), 'Daily gift');
  const cards = h('div', { class: 'float-cards' }, gift);
  // the rooms she has, once there's more than one (render keeps it up to date)
  const roomNav = h('nav', { class: 'room-nav', 'aria-label': 'Rooms', hidden: true });
  const stage = h('main', { class: 'stage' }, canvas, chips, cards, roomNav);
  // into arranging, from the header beside Sound, off the room (a long press on a piece does it too, with that piece picked)
  const arrange = h('button', { class: 'icon-btn arrange-btn', type: 'button', 'aria-label': 'Arrange the burrow' });
  arrange.innerHTML = PENCIL;
  arrange.addEventListener('click', () => goTab('shop', { arrange: true }));

  const actBtn = (id: 'feed' | 'pet' | 'play' | 'clean' | 'nap', label: string, icon: Node) =>
    h('button', { class: 'act', type: 'button', 'data-act': id }, icon, h('span', { text: label }));
  const feedBadge = h('span', { class: 'badge', hidden: true });
  const acts = {
    feed: actBtn('feed', 'Feed', img(itemSprite('carrot'), 3)),
    pet: actBtn('pet', 'Pet', img(itemSprite('heart'), 4)),
    play: actBtn('play', 'Play', img(itemSprite('ball'), 4)),
    clean: actBtn('clean', 'Clean', img(itemSprite('droplet'), 4)),
    nap: actBtn('nap', 'Nap', img(itemSprite('moon'), 4)),
  };
  acts.feed.append(feedBadge);
  const sound = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Sound' });
  const gear = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', title: 'Settings' });
  gear.innerHTML = GEAR;
  gear.addEventListener('click', () => openSettings());
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite' });
  const goalBar = h('button', { class: 'goal-bar', type: 'button', hidden: true });
  goalBar.addEventListener('click', () => openShop({ select: pet.goal }));
  const panelKids = [moodline, h('div', { class: 'actions' }, acts.feed, acts.pet, acts.play, acts.clean, acts.nap)];
  const panel = h('section', { class: 'panel' }, ...panelKids);
  // her name is a way to her page, as well as the tab
  const who = h('button', { class: 'who who-btn', type: 'button', 'aria-description': 'Opens her page' }, name, sub);
  who.addEventListener('click', () => goTab('her'));

  const { bar: tabbar, tabs } = buildTabBar();
  const nodes = [
    h('header', { class: 'hud' },
      h('div', { class: 'hud-top' },
        who,
        cloverChip(clover), arrange, sound, gear),
      h('div', { class: 'needs' }, ...needEls),
      goalBar),
    stage,
    panel,
  ];
  setScreen('burrow');
  app.replaceChildren(...nodes, tabbar);
  ui = { nodes, name, sub, clover, needs, stage, canvas, chips, cards, gift, panel, moodline, acts, feedBadge, sound, goal: goalBar, panelKids, roomNav, tabbar, tabs, page: buildPage() };

  scene = new Scene(canvas);
  new ResizeObserver(layoutStage).observe(stage);
  layoutStage();

  for (const k of ['pet', 'clean'] as const) acts[k].addEventListener('click', () => doAction(k));
  acts.feed.setAttribute('aria-expanded', 'false');
  acts.feed.addEventListener('click', () => toggleTray('feed'));
  acts.play.setAttribute('aria-expanded', 'false');
  acts.play.addEventListener('click', () => toggleTray('play'));
  // Bed doubles as "Wake" while she's asleep, at any hour.
  acts.nap.addEventListener('click', () => doAction(isAsleep(pet, now()) ? 'wake' : 'nap'));
  gift.addEventListener('click', () => doAction('gift'));
  sound.addEventListener('click', () => toggleSound());
  // Hold a piece of decor to arrange the room with it picked up. The click
  // that ends a long press is eaten, so it isn't a tap on her as well.
  let hold: { timer: number; x: number; y: number } | null = null;
  let heldOff = false;
  const letGo = () => { if (hold) window.clearTimeout(hold.timer); hold = null; };
  canvas.addEventListener('pointerdown', (e) => {
    heldOff = false;
    if (decorating || !scene || away()) return;
    const { x, y } = toScene(e);
    const r = scene.rabbitBox();
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return; // holding her is still a pat
    const piece = scene.hitTest(here(), x, y);
    if (!piece) return;
    letGo();
    hold = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
      hold = null;
      heldOff = true;
      haptic('light');
      play('flip');
      goTab('shop', { arrange: piece.uid });
    }, 550) };
  });
  canvas.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) letGo(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) canvas.addEventListener(ev, letGo);
  canvas.addEventListener('click', (e) => {
    if (heldOff) { heldOff = false; e.preventDefault(); return; }
    if (decorating || !scene || away()) return;
    const { x, y } = toScene(e);
    const gi = scene.guestAt({ guests: guestModels() } as Parameters<Scene['guestAt']>[0], x, y);
    if (gi !== null) { greetGuest(gi); return; }
    const critter = critterHere();
    if (critter && scene.critterAt({ critter, burrow: here() }, x, y)) {
      scene.cheerCritter({ critter, burrow: here() }, performance.now());
      play('pet');
      const c = critterById(critter);
      if (c) toast(`The ${c.name.toLowerCase()} is happy to see you.`);
      return;
    }
    const b = scene.rabbitBox();
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { doAction('pet'); return; }
    // the wishing well: she makes a wish (just for the moment; nothing is paid)
    const piece = scene.hitTest(here(), x, y);
    if (piece?.id === 'corkboard') { play('flip'); openOwnCorkboard(); return; }
    if (piece?.id === 'wishingwell' && !isOut(pet, now())) {
      scene.burst('sparkle', 3, performance.now(), { x: piece.x, y: piece.y - 20 });
      play('find');
      toast(`${pet.name} makes a wish.`);
      note(`${pet.name} made her first wish at the well.`, 'sparkle', 'wish:first');
    }
  });
  wireDecorDrag(canvas);
}

/** A pointer position in scene pixels. */
function toScene(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = ui.canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * ui.canvas.width;
  const y = ((e.clientY - r.top) / r.height) * ui.canvas.height;
  return scene ? scene.toRoom(x, y) : { x, y };
}

/**
 * Sized so the room's walls meet the stage's edges, the soil beside them
 * cropped off, and its floor sits on the stage's bottom edge. On a short
 * screen the ceiling is cropped rather than shrinking everything: at most
 * ~40% of the room's height goes above the fold.
 */
function layoutStage(): void {
  if (scene && ui.stage.isConnected) scale = fitScene(ui.stage, ui.canvas, scene, decorating);
}

/**
 * Size a scene's canvas to fill a stage element (the burrow, or a friend's). Returns the scale.
 * `whole` (arranging) fits the room's full height, ceiling and all, so every
 * piece can be reached, even with the storage panel taking room below.
 */
function fitScene(stageEl: HTMLElement, el: HTMLCanvasElement, sc: Scene, whole = false): number {
  const w = stageEl.clientWidth, hgt = stageEl.clientHeight;
  // Not a whole number: a whole-number scale either cut the walls off or left
  // a wide band of dirt either side. At these sizes the odd pixel that's one
  // screen pixel wider than its neighbours doesn't show.
  const scale = whole
    ? Math.max(1, Math.min(w / (SCENE_W - 2 * WALL_INSET), hgt / SCENE_H) || 1)
    : Math.max(2, Math.min(w / (SCENE_W - 2 * WALL_INSET), hgt / (SCENE_H * 0.6)) || 2);
  // The surface covers the whole stage in scene pixels; the room sits in it.
  const sw = Math.ceil(w / scale - 1e-6), sh = Math.ceil(hgt / scale - 1e-6);
  const offX = Math.round((sw - SCENE_W) / 2);
  // The floor always sits on the stage's bottom edge: taller than the room,
  // the spare soil is all above it, like a burrow under the ground; shorter,
  // the ceiling is cropped.
  const offY = sh - SCENE_H;
  sc.resize(sw, sh, offX, offY);
  el.style.width = `${sw * scale}px`; el.style.height = `${sh * scale}px`;
  el.style.left = `${Math.floor((w - sw * scale) / 2)}px`; el.style.top = '0px';
  return scale;
}

// ------------------------------------------------------------------ tabs

const TAB_ART: Record<'burrow' | 'garden' | 'shop', ItemArt> = { burrow: 'fireplace', garden: 'tulips', shop: 'plant' };

/** A rabbit's head for a tab icon, cropped from her sprite. */
function faceIcon(coat: Coat, dress?: Dress): HTMLElement {
  return h('span', { class: 'tab-face' }, img(rabbitSprite(coat, 'content', 0, dress), 1));
}

function buildTabBar(): { bar: HTMLElement; tabs: Record<Tab, HTMLButtonElement> } {
  const label: Record<Tab, string> = { burrow: 'Home', garden: 'Garden', shop: 'Shop', friends: 'Friends', her: 'Her' };
  // two friends' rabbits, in coats that aren't hers
  const others = COATS.filter((c) => c !== pet.coat);
  const tabs = {} as Record<Tab, HTMLButtonElement>;
  for (const t of TABS) {
    const icon = t === 'her' ? h('span', { class: 'tab-ico' }) // her face goes in with render, as she's dressed
      : t === 'friends' ? h('span', { class: 'tab-ico pair' }, faceIcon(others[2]!), faceIcon(others[4]!))
        : h('span', { class: 'tab-ico' }, img(itemSprite(TAB_ART[t]), fitScale(itemSprite(TAB_ART[t]), 28)));
    const b = h('button', { class: 'tab', type: 'button' }, icon, h('span', { class: 'tab-label', text: label[t] }));
    b.addEventListener('click', () => { if (t === 'friends' && tab !== 'friends') friendsView = 'today'; goTab(t); });
    tabs[t] = b;
  }
  tabs.shop.setAttribute('aria-label', 'Shop and decorate');
  return { bar: h('nav', { class: 'tabbar', 'aria-label': 'Places' }, ...TABS.map((t) => tabs[t])), tabs };
}

/** The Friends and Her pages' shell: a header like the HUD's over a scrolling body. */
function buildPage(): Ui['page'] {
  const title = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  // a page's own button beside the clover (Friends: Invite)
  const action = h('span', { class: 'page-action' });
  const body = h('main', { class: 'page' });
  const header = h('header', { class: 'hud page-hud' },
    h('div', { class: 'hud-top' },
      h('div', { class: 'who' }, title, sub),
      action,
      cloverChip(clover)));
  return { nodes: [header, body], title, sub, action, clover, body };
}

/**
 * Go to a place in the tab bar. The Shop tab has two screens: the shop
 * itself, and (`arrange`) the burrow while you place and move decor, with a
 * piece picked if it's a uid. Leaving arranging puts it away, and anything
 * that waited for it (a gift, a question) comes then; leaving the garden stops
 * arranging the meadow.
 */
function goTab(t: Tab, opts: { arrange?: string | true } = {}): void {
  if (!ui || !pet) return;
  if (t === 'garden' && away()) { play('nope'); toast(`${pet.name} is on holiday. The garden will keep.`); return; }
  const arrange = t === 'shop' && !!opts.arrange;
  const pick = typeof opts.arrange === 'string' ? opts.arrange : null;
  if (t === tab && arrange === decorating) {
    // the page you're on: back to its top; arranging: pick the piece
    if (t === 'friends' || t === 'her') ui.page.body.scrollTo({ top: 0, behavior: 'smooth' });
    if (t === 'shop' && !arrange) shopUi?.grid.scrollTo({ top: 0, behavior: 'smooth' });
    if (arrange && pick) { selectedUid = pick; renderDecoratePanel(); }
    return;
  }
  const from = tab;
  const wasArranging = decorating;
  const tabFocused = ui.tabbar.contains(document.activeElement);
  closeTray();
  if (decorating && !arrange) stopDecorating();
  if (from === 'garden' && arranging) stopArranging();
  if (arrange && !wasArranging) arrangeReturn = from;
  tab = t;
  room = t === 'garden' ? 'garden' : 'burrow';
  let nodes: Node[];
  if (t === 'garden') nodes = (gardenUi ??= buildGardenScreen()).nodes;
  else if (t === 'friends' || t === 'her') nodes = ui.page.nodes;
  else if (t === 'shop' && !arrange) nodes = (shopUi ??= buildShopScreen()).nodes;
  else nodes = ui.nodes;
  if (app.firstChild !== nodes[0]) app.replaceChildren(...nodes, ui.tabbar);
  if (tabFocused) ui.tabs[t].focus();
  if (t === 'burrow' || arrange) layoutStage();
  if (arrange && !wasArranging) startDecorating();
  if (arrange && pick) { selectedUid = pick; renderDecoratePanel(); }
  if (t === 'shop' && !arrange) {
    shopSig = '';
    renderShop();
  }
  if (t === 'garden') {
    gardenScene?.jumpTo(area);
    gardenSig = '';
    layoutGarden();
    renderGarden();
  }
  if (t === 'friends' || t === 'her') {
    herSig = '';
    friendsSig = '';
    ui.page.body.scrollTop = 0;
    if (t === 'friends') loadFriends();
  }
  render();
  if (wasArranging && !decorating && !sheetStack.length) sheetQueue.shift()?.open();
}

/** The veg patch's beds that want you: ripe to pick, and empty (dug, nothing in them) to plant. */
function gardenNeeds(n: number): { ripe: number; empty: number } {
  const ps = plots(pet);
  return { ripe: ps.filter((p) => p && p.readyAtMs <= n).length, empty: ps.filter((p) => !p).length };
}

/** "2 ready to pick", "1 bed empty", "2 ready · 1 empty": the Home chip's words. */
function gardenChipText({ ripe, empty }: { ripe: number; empty: number }): string {
  if (ripe && empty) return `${ripe} ready · ${empty} empty`;
  if (ripe) return `${ripe} ready to pick`;
  return `${empty} ${empty === 1 ? 'bed' : 'beds'} empty`;
}

/** Which tab is on, the badges, and her face and name on her tab. */
function renderTabBar(n: number): void {
  for (const t of TABS) {
    const on = t === tab;
    if (ui.tabs[t].hasAttribute('aria-current') !== on) {
      if (on) ui.tabs[t].setAttribute('aria-current', 'page'); else ui.tabs[t].removeAttribute('aria-current');
    }
  }
  // beds that want you: ripe ones to pick, and empty ones to plant
  const beds = gardenNeeds(n);
  setToolBadge(ui.tabs.garden, beds.ripe + beds.empty ? String(beds.ripe + beds.empty) : '');
  setOff(ui.tabs.garden, away() ? `${pet.name} is on holiday. The garden will keep.` : null);
  const guests = guestsHere(visitTurns, n).length;
  const signed = unreadGuestbook();
  setToolBadge(ui.tabs.friends, guests + signed ? String(guests + signed) : '');
  ui.tabs.friends.setAttribute('aria-label', ['Friends', guests ? `${guests} visiting now` : '', signed ? `${signed} new in the guest book` : ''].filter(Boolean).join(', '));
  const her = ui.tabs.her;
  const sig = `${pet.coat}|${dressKey(dressOf(pet))}|${pet.name}`;
  if (her.dataset.sig !== sig) {
    her.dataset.sig = sig;
    her.querySelector('.tab-ico')?.replaceChildren(faceIcon(pet.coat, dressOf(pet)));
    her.querySelector('.tab-label')!.textContent = pet.name;
    her.setAttribute('aria-label', `${pet.name}: her wardrobe, collection, journal and settings`);
  }
}

function toggleSound(): void {
  settings.sound = settings.sound === false;
  setMuted(!settings.sound);
  saveSettings();
  if (settings.sound) play('pet');
  render();
}

// ------------------------------------------------------------------ time passing

function catchUp(showSummary: boolean): void {
  // saved on a clock running ahead: back to the server's now, or she sits
  // frozen until it comes (and a finished trip never brings her home)
  const rewound = isServerTime() ? rewindFuture(pet, now(), tz) : null;
  if (rewound) { pet = rewound; savePet(); }
  const before = pet;
  const gap = now() - before.simAtMs;
  const { state, events } = advance(pet, now(), tz);
  const v = visit(state, now(), tz);
  pet = v.state;
  if (pet.stepIndex !== before.stepIndex || v.newDay || v.lumps.length) savePet();
  payLumps(v.lumps);
  syncMeadow();
  goal();
  recordFinds(events);
  if (v.newDay && MILESTONE_DAYS.includes(pet.daysVisited)) note(`${pet.daysVisited} days together.`, 'heart', `days:${pet.daysVisited}`);
  // home from her holiday
  const backFromHoliday = !!pet.vacationUntilMs && !onVacation(pet, now());
  if (backFromHoliday) {
    pet = endVacation(pet);
    savePet();
    note(`${pet.name} came home from her holiday.`, 'suitcase');
  }
  if (showSummary && gap > 30 * 60_000) showAway(gap, events, v.newDay, backFromHoliday, state.clover - before.clover);
  handOutEventGifts();
  giveWelcomePieces();
  queueReconcile();
  queueShowcase();
  // visits first: a friend's gift comes in with them
  void checkVisits().then(() => checkInbox());
  render();
}

/** Put what she found in the journal, once per kind, and each visitor's first visit and keepsake. */
function recordFinds(events: PetEvent[]): void {
  for (const e of events) {
    if (e.kind === 'forageDone') {
      note(`${pet.name} came home from foraging with ${lootText(e.loot, e.clover)}.`, 'basket');
      for (const id of e.loot.finds) {
        const c = COLLECTIBLES.find((x) => x.id === id);
        if (c) note(`Found ${article(c.name)} for the shelf, out foraging.`, c.id, `find:${c.id}`);
      }
      continue;
    }
    if (e.kind === 'critter') {
      const c = critterById(e.critter);
      if (!c) continue;
      note(`${article(c.name).replace(/^a/, 'A')} came to visit for the first time.`, c.id as ItemArt, `critter:${c.id}`);
      const k = e.keepsake ? COLLECTIBLES.find((x) => x.id === e.keepsake) : undefined;
      if (k) note(`The ${c.name.toLowerCase()} left ${article(k.name)} for the shelf.`, k.id as ItemArt, `find:${k.id}`);
      continue;
    }
    if (e.kind !== 'found') continue;
    const c = COLLECTIBLES.find((x) => x.id === e.item);
    if (c) note(`Found ${article(c.name)} for the shelf${c.rarity === 'rare' ? '. A rare one!' : '.'}`, c.id, `find:${c.id}`);
  }
}
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`;
}

function tick(): void {
  // Hidden, she waits: coming back re-reads the save first (returnToPage), so
  // a tab left open can't write an old copy over another device's changes.
  if (!pet || document.hidden) return;
  const { state, events } = advance(pet, now(), tz);
  if (state.stepIndex !== pet.stepIndex) {
    const left = events.reduce((sum, e) => sum + (e.kind === 'critter' || e.kind === 'forageDone' ? e.clover : 0), 0);
    const gained = state.clover - pet.clover - left;
    pet = state;
    savePet(false);
    for (const e of events) {
      if (e.kind === 'napDone') toast(`${pet.name} woke up, fully rested.`);
      if (e.kind === 'treatBaked') { toast('Your treat is ready.', () => play('ding')); scene?.burst('treat', 3, performance.now()); }
      if (e.kind === 'found') {
        const c = COLLECTIBLES.find((x) => x.id === e.item);
        if (c) toast(`${pet.name} found ${article(c.name)}!${gained > 0 ? ` +${gained} clover` : ''}`, () => play('find'));
      }
      if (e.kind === 'forageDone') toast(`${pet.name} is home with ${lootText(e.loot, e.clover)}.`, () => play('gift'));
      if (e.kind === 'critter') {
        const c = critterById(e.critter);
        const k = e.keepsake ? COLLECTIBLES.find((x) => x.id === e.keepsake) : undefined;
        if (c) toast(`${article(c.name).replace(/^a/, 'A')} dropped by! +${e.clover} clover${k ? `, and ${article(k.name)}` : ''}.`, () => play('find'));
      }
    }
    recordFinds(events);
  }
  noticeGuests();
  watchGoals();
  render();
  renderGarden();
}

let lastFrame = 0;
/** A friend's burrow is open over hers: hers isn't seen, so isn't drawn. */
let visitingFriend = false;
function frame(t: number): void {
  requestAnimationFrame(frame);
  // ~15 fps is plenty for pixel art at rest; a garden slide or drag gets every frame
  const smooth = room === 'garden' && !!gardenScene?.moving;
  if ((t - lastFrame < 66 && !smooth) || visitingFriend) return;
  if (room === 'garden') { lastFrame = t; drawGardenFrame(t); return; }
  // the shop shows her room only in its display, when that's a live preview
  if (tab === 'shop' && !decorating) {
    if (shopView?.stage.isConnected && shopPreview) { lastFrame = t; drawShopScene(t); }
    return;
  }
  // on the Friends page only its porch shows the burrow (the main room); on Her page, nothing
  if (tab === 'friends') {
    if (porch?.stage.isConnected) { lastFrame = t; porch.scene.draw({ ...burrowModel(now(), 'main'), guests: porchGuests(), lively: true }, t); }
    return;
  }
  if (!scene || tab === 'her') return;
  lastFrame = t;
  scene.draw(burrowModel(now(), burrowRoom), t);
}

let clockMinute = -1;
let clockFace = { hour: 0, minute: 0 };
/** The player's time for the burrow's clocks, worked out once a minute rather than every frame. */
function clockTime(n: number): { hour: number; minute: number } {
  const m = Math.floor(n / 60_000);
  if (m !== clockMinute) {
    clockMinute = m;
    const p = localParts(n, tz);
    clockFace = { hour: p.hour, minute: p.minute };
  }
  return clockFace;
}

/** What the burrow scene draws: her, a room of her burrow, and any guests. */
function burrowModel(n: number, r: RoomId): Parameters<Scene['draw']>[0] {
  const w = today(n);
  const main = r === 'main';
  return {
    coat: pet.coat,
    night: isNight(n, tz),
    mood: mood(pet, n, tz),
    burrow: main && burrowRoom !== 'main' ? inRoom(burrow, 'main') : here(),
    decorating: decorating && r === burrowRoom,
    selected: decorating && r === burrowRoom ? selectedUid : null,
    dress: dressOf(pet),
    season: w.season,
    weather: w.weather,
    absent: away() || isOut(pet, n),
    room: { ...roomOf(burrow), ...(!main ? { variant: r } : {}) },
    moon: moonPhase(n),
    guests: guestModels(),
    seed: `${pet.petId}:${dayKey(n, tz, DAY_ROLLOVER_HOUR)}`,
    critter: critterHere(),
    time: clockTime(n),
  };
}

/** The Friends page's view of her burrow: a second scene, made once, drawn while the page shows. */
let porch: { stage: HTMLElement; scene: Scene } | null = null;
function porchStage(): HTMLElement {
  if (porch) return porch.stage;
  const canvas = h('canvas', { role: 'img', 'aria-label': `${pet.name}'s burrow` });
  const stage = h('button', { class: 'stage porch', type: 'button', 'aria-label': `Go to ${pet.name}'s burrow` }, canvas);
  const sc = new Scene(canvas);
  stage.addEventListener('click', () => { goTab('burrow'); if (burrowRoom !== 'main') goRoom('main'); });
  new ResizeObserver(() => { if (stage.isConnected) fitScene(stage, canvas, sc); }).observe(stage);
  porch = { stage, scene: sc };
  return stage;
}

/** How far back the porch looks for friends who came by. */
const RECENT_MS = 3 * 24 * HOUR_MS;
/** The most on the porch at once. */
const PORCH_MAX = 6;
let recentCache: { book: unknown; minute: number; list: NonNullable<Journal['guestbook']> } | null = null;

/** Friends who came by lately, one each, newest first: from the guest book, which remembers how their rabbit looked. */
function recentVisitors(): NonNullable<Journal['guestbook']> {
  const n = now();
  const minute = Math.floor(n / 60_000);
  if (recentCache && recentCache.book === journal.guestbook && recentCache.minute === minute) return recentCache.list;
  const seen = new Set<string>();
  const list = (journal.guestbook ?? []).filter((g) => {
    if (n - g.atMs > RECENT_MS || !g.look || !(COATS as readonly string[]).includes(g.look.coat) || seen.has(g.from)) return false;
    seen.add(g.from);
    return true;
  }).slice(0, PORCH_MAX);
  recentCache = { book: journal.guestbook, minute, list };
  return list;
}

/** Everyone who came by lately, in the Friends page's porch, with any parcel they're carrying. */
function porchGuests(): { id: string; coat: Coat; dress: Dress; parcel?: boolean }[] {
  const here = guestModels();
  const ids = new Set(here.map((g) => g.id));
  const fromUser = new Map(visitTurns.map((t) => [t.visit.from.username, t.visit.from.uuid]));
  const rest = recentVisitors().filter((g) => !ids.has(fromUser.get(g.from) ?? '')).map((g) => ({
    id: `p:${g.from}`, coat: g.look!.coat as Coat,
    dress: { head: g.look!.head ?? null, neck: g.look!.neck ?? null, ears: (EARS as readonly string[]).includes(g.look!.ears ?? '') ? (g.look!.ears as Ears) : 'long' },
  }));
  return [...here, ...rest].slice(0, PORCH_MAX);
}

/** The wild visitor in the burrow now, if any (none while she's on holiday). */
function critterHere(): string | null {
  const h = pet?.critters?.here;
  return h && h.untilMs > now() && !away() ? h.id : null;
}

/** What she's up to, when she's content and somewhere in particular (render.ts Activity). */
function activityLine(a: Activity, name: string): string {
  const out = (w: Weather) => (w === 'snow' ? 'the snow' : w === 'leaves' ? 'the leaves falling' : 'the rain');
  switch (a.kind) {
    case 'fire': return `${name} is curled up by the fire.`;
    case 'seat': return `${name} is watching ${out(a.weather)} from the window seat.`;
    case 'window': return `${name} is watching ${out(a.weather)} at the window.`;
    case 'favourite': return `${name}'s favourite spot today: by the ${(byId(a.piece)?.name ?? 'decor').toLowerCase()}.`;
  }
}

function roomOf(b: BurrowState): RoomStyle {
  const sf = surfacesOf(b);
  return { wall: sf.wall, floor: sf.floor, window: sf.window };
}

/** The rooms you can switch between, over the burrow, once there's more than one. */
function renderRoomNav(): void {
  const rooms = openRoomsOf(burrow);
  const sig = `${rooms.join()}|${burrowRoom}|${decorating}`;
  if (ui.roomNav.dataset.sig === sig) return;
  ui.roomNav.dataset.sig = sig;
  ui.roomNav.hidden = rooms.length < 2;
  ui.roomNav.replaceChildren(...rooms.map((r) => {
    const b = h('button', { class: 'room-tab', type: 'button', 'aria-pressed': String(r === burrowRoom), text: ROOMS[r].name });
    b.addEventListener('click', () => goRoom(r));
    return b;
  }));
}

/** Go to another room: she comes with you, and decorating carries on there. */
function goRoom(r: RoomId): void {
  if (r === burrowRoom) return;
  burrowRoom = r;
  selectedUid = null;
  play('flip');
  if (decorating) renderDecoratePanel();
  render();
}

/** Dig out the next room: in order, for clover. */
function openDig(): void {
  openLiveSheet((close, redraw) => {
    const rows = EXTRA_ROOMS.map((r) => {
      const info = ROOMS[r];
      const dug = roomsOf(burrow).includes(r);
      const state = dug ? { owned: 'Dug' } : canDig(burrow, r) ? { price: info.price } : { locked: `After the ${ROOMS[info.after!].name.toLowerCase()}` };
      return shopRow(info.name, info.blurb, state, () => {
        const paid = spendClover(pet, info.price);
        if (!paid || !canDig(burrow, r)) { play('nope'); toast(moreClover(info.price)); return; }
        pet = paid;
        burrow = digRoom(burrow, r);
        savePet();
        saveBurrow();
        play('gift');
        haptic('success');
        toast(`The ${info.name.toLowerCase()} is dug out! Switch rooms at the bottom of the burrow.`);
        note(`Dug out a ${info.name.toLowerCase()} for ${pet.name}.`, 'shed', `room:${r}`);
        close();
        goRoom(r);
      }, 'shed');
    });
    return [
      h('div', { class: 'eyebrow', text: 'The burrow' }),
      h('h2', { text: 'Dig a new room' }),
      h('p', { text: `More room for decor. ${pet.name} comes with you from room to room, and friends who visit can look round them all.` }),
      h('div', { class: 'shop-list' }, ...rows),
      h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
    ];
  });
}

/** The room you're looking at (decor.ts ROOMS). She's always in it with you. Not saved. */
let burrowRoom: RoomId = 'main';
/** The burrow as seen from that room: its pieces, and what's put away. */
function here(): BurrowState {
  if (!openRoomsOf(burrow).includes(burrowRoom)) burrowRoom = 'main';
  return inRoom(burrow, burrowRoom);
}

function wireLifecycle(): void {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); publishShowcase(); void saver.flush(); pauseSound(); return; }
    void returnToPage(Date.now() - hiddenAt > 30 * 60_000);
  });
  OR.lifecycle.on('pause', () => { publishShowcase(); void saver.flush(); pauseSound(); });
  OR.lifecycle.on('resume', () => void returnToPage(true));
  window.addEventListener('pagehide', () => void saver.flush());
}

/** Back from the background: adopt a newer copy from another device, then replay. */
async function returnToPage(summary: boolean): Promise<void> {
  if (!pet) return; // on the adoption screen
  await syncClockOrHold();
  const [rp, rb, rj] = await Promise.all([loadPet(OR), loadBurrow(OR), loadJournal(OR)]);
  if (!pet) return;
  // a newer version saved while we were away: stop before writing over it
  if ([rp, rb, rj].some((r) => r.kind === 'newer')) { stopForNewerVersion(); return; }
  // Started over on another device: follow it rather than save the old rabbit back.
  // (Missing and never stored: she's just been adopted and her first save is on its way.)
  if (rp.kind === 'missing' && inStorage.pet) { leaveForAdoption(); return; }
  const remote = okValue(rp), remoteBurrow = okValue(rb), remoteJournal = okValue(rj);
  if (remote && remote.petId !== pet.petId) {
    // a different rabbit, but her burrow or journal couldn't be read: stop (carrying on would
    // save the old rabbit over her) and load everything afresh from the retry screen
    const bad = [rb, rj].filter((r) => r.kind === 'error' || r.kind === 'broken');
    if (bad.length) {
      pet = undefined as unknown as PetState;
      scene = null;
      room = 'burrow';
      renderCantLoad(bad.some((r) => r.kind === 'broken'));
      return;
    }
    pet = remote;
    burrow = remoteBurrow ?? starterBurrow();
    journal = remoteJournal ?? emptyJournal();
    inStorage = { pet: storedOf(remote), burrow: remoteBurrow?.rev ?? null };
    pet.supporter = !!OR.user?.supporter;
    buildBurrowScreen();
    catchUp(false);
    return;
  }
  // Another device has written since this one last read or wrote: its copy
  // wins, of her and her burrow together. Her journal is merged.
  if (petMoved(rp) || burrowMoved(rb)) {
    if (remote) pet = { ...remote, supporter: !!OR.user?.supporter };
    if (remoteBurrow) burrow = remoteBurrow;
    inStorage = { pet: remote ? storedOf(remote) : inStorage.pet, burrow: remoteBurrow ? remoteBurrow.rev : inStorage.burrow };
  }
  if (remoteJournal) journal = mergeJournal(journal, remoteJournal);
  catchUp(summary);
}

// ------------------------------------------------------------------ rendering the UI

const MOOD_LINE: Record<Mood, (name: string) => string> = {
  content: (n) => `${n} is content.`,
  peckish: (n) => `${n} is peckish. A carrot would help.`,
  lonely: (n) => `${n} wants some attention.`,
  sleepy: (n) => `${n} is getting sleepy. Time for bed?`,
  dusty: (n) => `${n} is a bit dusty.`,
  grumpy: (n) => `${n} is grumpy. A little care and she'll perk up.`,
  asleep: (n) => `${n} is asleep.`,
};

function render(): void {
  if (!ui || !pet) return;
  const n = now();
  const m = mood(pet, n, tz);
  const asleep = isAsleep(pet, n, tz);
  const w = today(n);
  ui.name.textContent = pet.name;
  // days together and the bond live on her page; the header just says what it's like out
  ui.sub.textContent = weatherName(w.weather, isNight(n, tz));
  ui.sub.title = `Today: ${WEATHER_NAME[w.weather].toLowerCase()} ${w.season}.`;
  ui.clover.textContent = String(pet.clover);
  const target = goalInfo(pet.goal);
  ui.goal.hidden = !target || target.owned;
  if (target && !target.owned) {
    const ready = pet.clover >= target.price;
    const text = ready ? `You can buy the ${target.name.toLowerCase()}!` : `Saving for the ${target.name.toLowerCase()}`;
    const sig = `${text}|${Math.min(pet.clover, target.price)}`;
    if (ui.goal.dataset.sig !== sig) {
      ui.goal.dataset.sig = sig;
      const pct = Math.min(100, Math.round((pet.clover / target.price) * 100));
      ui.goal.replaceChildren(h('span', { class: 'goal-text', text }), h('span', { class: 'goal-num', text: `${Math.min(pet.clover, target.price)} / ${target.price}` }),
        h('span', { class: 'bar' }, h('span', { style: `width:${pct}%` })));
      ui.goal.classList.toggle('ready', ready);
      ui.goal.setAttribute('aria-label', `${text}. ${pet.clover} of ${target.price} clover.`);
    }
  }
  for (const k of ['hunger', 'happy', 'energy', 'clean'] as const) {
    const v = Math.round(pet.needs[k]);
    ui.needs[k].fill.style.width = `${v}%`;
    ui.needs[k].wrap.setAttribute('aria-valuenow', String(v));
    ui.needs[k].wrap.classList.toggle('low', v < 30);
  }
  // While she sleeps, Energy says when it'll be full: that's when she wakes.
  const nap = timer(pet, 'nap');
  const restMs = asleep && nap ? nap.endsAtMs - n : 0;
  // whole hours to fit the bar's label; the Resting pill has the minutes
  const energyText = !restMs ? 'Energy' : restMs >= HOUR_MS ? `Full in ${Math.round(restMs / HOUR_MS)}h` : `Full in ${fmtDuration(restMs)}`;
  if (ui.needs.energy.label.textContent !== energyText) {
    ui.needs.energy.label.textContent = energyText;
    ui.needs.energy.wrap.setAttribute('aria-label', restMs ? `Energy, full when she wakes in ${fmtLong(restMs)}` : 'Energy');
  }
  ui.needs.energy.wrap.classList.toggle('resting', !!restMs);

  // One thing at a time, to keep it short: what she needs, then a visitor,
  // then what she's up to.
  let line = MOOD_LINE[m](pet.name);
  const doing = m === 'content' ? scene?.activity() : null;
  if (doing) line = activityLine(doing, pet.name);
  const visitor = critterById(critterHere() ?? '');
  const Visitor = visitor ? article(visitor.name).replace(/^a/, 'A') : '';
  if (visitor && m === 'content') line = `${Visitor} has dropped by to see ${pet.name}.`;
  else if (visitor && m === 'asleep') line = `${pet.name} is asleep. ${Visitor} is tiptoeing about.`;
  // Hours, not minutes: the line is read out when it changes, and the
  // Resting chip and the Energy bar already count down. (A visitor shows anyway.)
  if (m === 'asleep' && restMs && !visitor) line = `${pet.name} is asleep. She'll wake up rested ${aboutHours(restMs)}.`;
  if (m === 'asleep' && nap && !hasBed(burrow)) line = `${pet.name} is asleep on the floor. A bed would be cozier.`;
  const holiday = away();
  if (holiday) line = `${pet.name} is on holiday until ${fmtDate(pet.vacationUntilMs!)}. Her needs are paused.`;
  // out foraging: hours, not minutes, so the line isn't read out every minute (the chip counts down)
  const outFor = isOut(pet, n) ? tripOf(pet)!.endsAtMs - n : 0;
  const homeIn = aboutHours(outFor);
  if (outFor) line = `${pet.name} is out foraging, home ${homeIn}.`;
  // something just said (hello from a visitor) stays up a while, not just until the next tick
  if (heldLine && performance.now() < heldLine.until) line = heldLine.text;
  else heldLine = null;
  if (!decorating) setLine(ui.moodline, line);
  if (!decorating) {
    // what the picture shows, for anyone who can't see it
    const decor = here().items.filter((i) => { const d = byId(i.id); return i.placed && !!d && !isOutdoor(d); }).map((i) => byId(i.id)?.name.toLowerCase()).filter(Boolean);
    const guests = guestModelsHere().map((g) => g.data.name);
    const label = [
      `${pet.name}'s burrow, ${isNight(n, tz) ? `lamplit, ${weatherName(w.weather, true).toLowerCase()} outside` : `by day, ${WEATHER_NAME[w.weather].toLowerCase()} outside`}.`,
      line,
      guests.length ? `Visiting: ${guests.join(', ')}.` : '',
      decor.length ? `In the burrow: ${decor.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    if (ui.canvas.getAttribute('aria-label') !== label) ui.canvas.setAttribute('aria-label', label);
  }

  const onHoliday = holiday ? `${pet.name} is on holiday. Her needs are paused.` : null;
  const sleeping = asleep ? "Shh, she's asleep. Tap Wake if you need her." : null;
  const foraging = outFor ? `She's out foraging, home ${homeIn}. Call her home from Forage, in the garden.` : null;
  // Feed still opens while she sleeps or is out, for Bake in its tray; the food in it says why not
  setOff(ui.acts.feed, onHoliday);
  ui.acts.feed.classList.toggle('resting', !onHoliday && !!(foraging ?? sleeping));
  setOff(ui.acts.clean, onHoliday ?? foraging ?? sleeping);
  setOff(ui.acts.pet, onHoliday ?? foraging);
  setOff(ui.acts.play, onHoliday ?? foraging ?? sleeping);
  setOff(ui.acts.nap, onHoliday ?? foraging);
  const napLabel = ui.acts.nap.querySelector('span');
  if (napLabel) napLabel.textContent = asleep ? 'Wake' : 'Nap';
  const petLabel = ui.acts.pet.querySelector('span');
  if (petLabel) petLabel.textContent = asleep ? 'Pet gently' : 'Pet';
  ui.feedBadge.hidden = pet.treats === 0;
  ui.feedBadge.textContent = String(pet.treats);
  ui.feedBadge.setAttribute('aria-label', `${pet.treats} treats`);
  const bake = timer(pet, 'bake');
  // the Bake button in the open Feed tray counts down
  const bakeBtn = tray?.kind === 'feed' ? tray.el.querySelector<HTMLButtonElement>('.bake-btn') : null;
  if (bakeBtn) renderBakeButton(bakeBtn, n);
  ui.gift.hidden = decorating || holiday || !giftReady(pet, n, tz);
  const soundOn = settings.sound !== false;
  if (ui.sound.dataset.on !== String(soundOn)) {
    ui.sound.dataset.on = String(soundOn);
    ui.sound.innerHTML = soundOn ? SPEAKER_ON : SPEAKER_OFF;
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    ui.sound.title = soundOn ? 'Sound on' : 'Sound off';
  }
  renderTabBar(n);
  ui.page.clover.textContent = String(pet.clover);
  if (tab === 'friends') renderFriendsPage();
  if (tab === 'her') renderHerPage();
  if (tab === 'shop' && !decorating) renderShop();

  // rooms can be switched while decorating too
  renderRoomNav();
  if (decorating) return;
  // timer chips: rebuilt when which ones show changes, otherwise just the countdowns
  const napping = !!nap && nap.endsAtMs > n;
  const out = isOut(pet, n) ? tripOf(pet)! : null;
  const times = [napping ? nap!.endsAtMs : null, out ? out.endsAtMs : null, bake ? bake.endsAtMs : null].filter((t): t is number => t !== null);
  // Left, the pills: what's going on, each one tappable to say more. The
  // timers' countdowns tick every second; the pills themselves are rebuilt
  // only when which ones show changes, so a tap isn't lost to a rebuild.
  let timersBox = ui.chips.querySelector<HTMLElement>('.chips-timers');
  let eventsBox = ui.chips.querySelector<HTMLElement>('.chips-events');
  if (!timersBox || !eventsBox) {
    timersBox = h('div', { class: 'chips-timers' });
    eventsBox = h('div', { class: 'chips-events' });
    ui.chips.replaceChildren(timersBox, eventsBox);
  }
  const timerSig = `${napping ? 'n' : ''}|${out ? 'o' : ''}|${bake ? 'b' : pet.treats}`;
  if (timersBox.dataset.sig !== timerSig) {
    timersBox.dataset.sig = timerSig;
    const chips: Node[] = [];
    if (napping) {
      const chip = h('button', { class: 'tchip', type: 'button', 'aria-label': `Resting until her energy is full. About sleep` },
        img(itemSprite('moon'), 2), 'Resting', h('span', { class: 'time' }));
      chip.addEventListener('click', () => openSleep());
      chips.push(chip);
    }
    if (out) {
      const chip = h('button', { class: 'tchip', type: 'button', 'aria-label': 'Out foraging. About her trip' },
        img(itemSprite('basket'), 2), 'Foraging', h('span', { class: 'time' }));
      chip.addEventListener('click', () => openForage());
      chips.push(chip);
    }
    if (bake) {
      const chip = h('button', { class: 'tchip', type: 'button', 'aria-label': 'A treat is baking. When it will be ready' },
        img(itemSprite('treat'), 2), 'Baking', h('span', { class: 'time' }));
      chip.addEventListener('click', () => {
        const b = timer(pet, 'bake');
        if (b) toast(`Your treat will be ready in ${fmtLong(b.endsAtMs - now())}. It goes in the pantry, under Feed.`);
      });
      chips.push(chip);
    }
    if (!bake && pet.treats > 0) {
      const chip = h('button', { class: 'tchip ready', type: 'button', 'aria-label': `${pet.treats} ${pet.treats === 1 ? 'treat' : 'treats'} ready. Feed her` },
        img(itemSprite('treat'), 2), `${pet.treats} ${pet.treats === 1 ? 'treat' : 'treats'} ready`);
      // through the Feed button, so it explains itself when she can't eat
      chip.addEventListener('click', () => ui.acts.feed.click());
      chips.push(chip);
    }
    timersBox.replaceChildren(...chips);
  }
  timersBox.querySelectorAll('.time').forEach((el, i) => {
    const text = fmtCountdown(times[i]! - n);
    if (el.textContent !== text) el.textContent = text;
  });
  const inYard = Math.floor(stored(pet, n));
  const guests = guestsHere(visitTurns, n);
  const thrives = !holiday && thriving(pet.needs);
  const beds = holiday ? { ripe: 0, empty: 0 } : gardenNeeds(n);
  const pillSig = `y${inYard}|v${guests.map((g) => g.visit.from.uuid).join(',')}|t${thrives}|b${beds.ripe},${beds.empty}`;
  if (eventsBox.dataset.sig !== pillSig) {
    eventsBox.dataset.sig = pillSig;
    const chips: Node[] = [];
    if (guests.length) {
      const k = guests.length;
      // someone just hopped in: a little wave to say so
      const fresh = guests.some((g) => n - g.fromMs < 2 * 60e3);
      const chip = h('button', { class: `tchip event${fresh ? ' fresh' : ''}`, type: 'button', 'aria-label': `${k} ${k === 1 ? 'friend is' : 'friends are'} visiting` },
        img(itemSprite('heart'), 2), k === 1 ? `${guests[0]!.data.name} is visiting` : `${k} visiting`);
      chip.addEventListener('click', () => goTab('friends'));
      chips.push(chip);
    }
    if (thrives) {
      const chip = h('button', { class: 'tchip thriving', type: 'button', 'aria-label': 'Thriving. What that brings' }, img(itemSprite('shine'), 2), 'Thriving');
      chip.addEventListener('click', () => openThriving());
      chips.push(chip);
    }
    if (beds.ripe || beds.empty) {
      // the veg patch: what's ripe and what's empty, a tap away
      const text = gardenChipText(beds);
      const chip = h('button', { class: `tchip${beds.ripe ? ' ready' : ''}`, type: 'button', 'aria-label': `Garden: ${text}. Go to the veg patch` },
        img(itemSprite(beds.ripe ? 'strawberry' : 'sprout'), 2), text);
      chip.addEventListener('click', () => { goTab('garden'); goArea('patch'); });
      chips.push(chip);
    }
    if (inYard >= 1) {
      // collected in the yard itself; this just says it's there and walks you over
      const chip = h('button', { class: 'tchip ready', type: 'button', 'aria-label': `${inYard} clover waiting in the yard. Go to the yard` }, img(itemSprite('clover'), 2), `${inYard} in the yard`);
      chip.addEventListener('click', () => { goTab('garden'); goArea('yard'); });
      chips.push(chip);
    }
    eventsBox.replaceChildren(...chips);
  }

  // Right, the cards: things to do, under the daily gift.
  let cardsBox = ui.cards.querySelector<HTMLElement>('.cards-events');
  if (!cardsBox) {
    cardsBox = h('div', { class: 'cards-events' });
    ui.cards.append(cardsBox);
  }
  const events = holiday ? [] : activeEvents(n, tz);
  const starter = starterDone(pet) ? null : starterView(pet).find((d) => d.status === 'open' || d.status === 'waiting');
  // after Getting started, the goals that follow it: the nearest open one, or what's ready
  const later = starterDone(pet) ? openGoals(pet) : [];
  const laterReady = later.filter((g) => laterDone(pet, g));
  const laterSig = later.length ? `g${later.map((g) => `${g.id}:${g.progress(pet).join('/')}`).join(',')}` : '';
  const cardSig = [...events.map((e) => `${e.id}:${daysLeft(e, n, tz)}:${e.raffle && !prizeWon(pet, e) ? 'r' : ''}`), starter ? `s${starter.step.step}:${starter.status}:${starter.done.filter(Boolean).length}` : '', laterSig].join('|');
  if (cardsBox.dataset.sig !== cardSig) {
    cardsBox.dataset.sig = cardSig;
    const cards = events.map((e) => {
      const left = daysLeft(e, n, tz);
      const when = left === 1 ? 'Last day' : `${left} days left`;
      const sub = e.raffle && !prizeWon(pet, e) ? `Raffle open · ${when}` : when;
      const card = h('button', { class: `event-card ev-${e.id}`, type: 'button', 'aria-label': `${e.name}, ${sub.toLowerCase()}. ${e.blurb}` },
        img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 2),
        h('span', { class: 'event-card-text' }, h('span', { class: 'event-card-name', text: e.name }), h('span', { class: 'event-card-sub', text: sub })));
      card.addEventListener('click', () => openEvent(e.id));
      return card;
    });
    if (starter) {
      const done = starter.done.filter(Boolean).length;
      const all = starter.step.goals.length;
      const wait = starter.status === 'waiting' ? daysUntil(pet, starter.step) : 0;
      const ready = done === all && !wait;
      const { step, clover } = starter.step;
      // the prize rides on the card, and it turns green and bobs when it's ready to claim; a step
      // waiting for its day says when it opens
      const card = h('button', {
        class: `event-card starter-card-btn${ready ? ' claim' : ''}${wait ? ' waiting' : ''}`, type: 'button',
        'aria-label': ready
          ? `Getting started: step ${step} done. Claim ${clover} clover`
          : wait ? `Getting started: step ${step} opens ${whenOpens(wait)}, for ${clover} clover`
            : `Getting started, step ${step} of ${STARTER_STEPS.length}: ${done} of ${all} done, for ${clover} clover`,
      },
      img(itemSprite(ready ? 'clover' : wait ? 'moon' : 'star'), 2),
      h('span', { class: 'event-card-text' },
        h('span', { class: 'event-card-name', text: ready ? `Step ${step} done!` : wait ? `Step ${step} opens ${whenOpens(wait)}` : 'Getting started' }),
        ready
          ? h('span', { class: 'event-card-sub', text: `Claim +${clover} clover` })
          : h('span', { class: 'event-card-sub' }, wait ? 'Worth ' : `${done}/${all} done · `, h('span', { class: 'prize' }, img(itemSprite('clover'), 1), String(clover)))));
      card.addEventListener('click', () => openStarter());
      cards.push(card);
    }
    if (later.length) {
      const ready = laterReady.length > 0;
      const sum = laterReady.reduce((t, g) => t + g.clover, 0);
      const next = later[0]!;
      const [have, need] = next.progress(pet);
      const card = h('button', {
        class: `event-card starter-card-btn${ready ? ' claim' : ''}`, type: 'button',
        'aria-label': ready ? `${laterReady.length === 1 ? 'A goal is' : `${laterReady.length} goals are`} done. Claim ${sum} clover` : `Next goal: ${next.text}, ${have} of ${need}, for ${next.clover} clover`,
      },
      img(itemSprite(ready ? 'clover' : 'star'), 2),
      h('span', { class: 'event-card-text' },
        h('span', { class: 'event-card-name', text: ready ? (laterReady.length === 1 ? 'Goal done!' : `${laterReady.length} goals done!`) : 'Next goal' }),
        ready
          ? h('span', { class: 'event-card-sub', text: `Claim +${sum} clover` })
          : h('span', { class: 'event-card-sub' }, need > 1 ? `${Math.min(have, need)}/${need} · ` : '', h('span', { class: 'prize' }, img(itemSprite('clover'), 1), String(next.clover)))));
      card.addEventListener('click', () => openLaterGoals());
      cards.push(card);
    }
    cardsBox.replaceChildren(...cards);
  }
}

/** What the Resting pill says: why she's asleep this long, and what waking her does. */
function openSleep(): void {
  const n = now();
  const nap = timer(pet, 'nap');
  if (!nap || nap.endsAtMs <= n) return;
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Resting' }),
    h('h2', { text: `${pet.name} is asleep` }),
    h('p', { text: `She sleeps until her energy is full, so the more tired she is, the longer she sleeps. She'll wake up rested in ${fmtLong(nap.endsAtMs - n)}.` }),
    h('p', { class: 'note', text: `You can wake her any time. She keeps the energy she's got back so far, but she'll be drowsy and nod off again sooner.${hasBed(burrow) ? '' : ' A bed from the shop makes her sleep cozier.'}` }),
    h('div', { class: 'actions-col' },
      button('Let her sleep', 'btn primary', close),
      button('Wake her', 'btn', () => { close(); doAction('wake'); })),
  ]);
}

function setToolBadge(b: HTMLElement, text: string): void {
  let badge = b.querySelector('.badge');
  if (!text) { badge?.remove(); return; }
  if (!badge) { badge = h('span', { class: 'badge' }); b.append(badge); }
  badge.textContent = text;
}

/** She's away on holiday. */
function away(): boolean {
  return !!pet && onVacation(pet, now());
}

/** Today's season and weather, the same for everyone. */
function today(n: number): { season: Season; weather: Weather } {
  const season = seasonOf(n, tz);
  return { season, weather: weatherOf(dayKey(n, tz, 0), season) };
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
}

const SPEAKER = '<path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor"></path>';
const SPEAKER_ON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${SPEAKER}<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"></path></svg>`;
const PENCIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-5L15 5l4 4L9 19z"></path><path d="M13 7l4 4"></path></svg>';
const GEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
const SPEAKER_OFF = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${SPEAKER}<path d="M16 9l5 6M21 9l-5 6"></path></svg>`;

// ------------------------------------------------------------------ actions


const REFUSAL: Record<string, string> = {
  full: "She's full.",
  clean: "She's already clean.",
  asleep: "Shh, she's asleep. Tap Wake if you need her.",
  notTired: "She isn't tired yet. Play with her a while and she'll want a nap.",
  notNapping: "She isn't napping.",
  noTreats: 'No treats in the pantry. Bake one first.',
  broke: 'Not enough clover for that.',
  busy: 'Something is already baking.',
  claimed: "You've opened today's gift.",
  noToy: "She doesn't have that toy yet.",
  out: "She's out foraging.",
  tooTired: "She's too tired to go out. Let her nap first.",
  notOut: "She's already home.",
};

function doAction(a: Action, opts: { food?: FoodId; toy?: string; hours?: number } = {}): void {
  const t = performance.now();
  if (a === 'bake' && pet.treats >= 3) { toast('The pantry is full. Feed her a treat first.'); return; }
  if (away()) { play('nope'); toast(`${pet.name} is on holiday.`); return; }
  // replay any steps she's behind first: act() judges her as she is now, so an
  // old copy could send her out when she'd really have dozed off by then
  tick();
  const bondBefore = bondLevel(pet.bond).level;
  const r = act(pet, a, now(), tz, opts);
  if (!r.ok) { play('nope'); toast(REFUSAL[r.reason] ?? 'Not right now.'); return; }
  pet = r.state;
  savePet();
  const bondAfter = bondLevel(pet.bond).level;
  if (bondAfter > bondBefore) note(`Your bond grew to level ${bondAfter}.`, 'heart', `bond:${bondAfter}`);
  const reward = r.clover > 0 ? ` +${r.clover} clover` : '';
  if (a !== 'gift' && a !== 'nap' && a !== 'wake' && a !== 'bake' && a !== 'forage' && a !== 'recall') play(a);
  if (a === 'feed' || a === 'pet' || a === 'play' || a === 'clean') careClover(r.clover, r.bond);
  payLumps(r.lumps);
  const goals: Partial<Record<Action, StarterGoal>> = { feed: 'feed', nap: 'nap', bake: 'bake', play: 'toy', clean: 'groom', forage: 'forage' };
  const g = goals[a];
  // settles too: care can finish a goal on its own (bond level 3)
  goal(g);
  switch (a) {
    case 'feed': {
      const food = opts.food ?? 'carrot';
      scene?.react('eating', t, FOOD_INFO[food].art, r.reaction);
      if (r.reaction === 'loves') {
        // hearts once she's swallowed
        window.setTimeout(() => { play('pet'); scene?.burst('heart', 3, performance.now()); }, EAT_SWALLOW_MS);
        toast(`${pet.name} loves it!${reward}`);
        note(`${pet.name} loved her ${FOOD_INFO[food].name.toLowerCase()}.`, FOOD_INFO[food].art, `loves:${food}`);
      } else if (r.reaction === 'okay') {
        toast(`${pet.name} nibbles it politely.`);
      }
      haptic('light');
      break;
    }
    case 'pet':
      scene?.react('happy', t);
      haptic('light');
      break;
    case 'play':
      scene?.react('play', t, TOY_ART[opts.toy ?? 'ball'] ?? 'ball');
      window.setTimeout(() => scene?.burst('heart', 2, performance.now()), 400);
      haptic('light');
      break;
    case 'clean':
      scene?.react('clean', t);
      haptic('light');
      break;
    case 'nap':
      play('nap');
      toast(`${pet.name} curls up and drifts off. Up in about ${fmtDuration(sleepLeft())}.`);
      void maybeAskReminders('nap');
      break;
    case 'wake':
      play('wake');
      toast(`${pet.name} stretches and blinks at you, still a bit drowsy.`);
      break;
    case 'bake':
      play('bake');
      scene?.burst('treat', 2, t, { x: 18, y: 22 });
      toast('Treat in the oven. Ready in an hour.');
      void maybeAskReminders('bake');
      break;
    case 'forage': {
      const tr = tripOf(pet);
      play('wake');
      toast(`${pet.name} hops off with her basket. Home in ${fmtDuration(tr ? tr.endsAtMs - now() : 0)}.`);
      note(`${pet.name} went foraging for the first time.`, 'basket', 'forage:first');
      void maybeAskReminders('forage');
      break;
    }
    case 'recall':
      play('gift');
      toast(`${pet.name} is home${r.loot ? ` with ${lootText(r.loot, r.clover)}` : ''}.`);
      break;
    case 'gift': {
      play('gift');
      window.setTimeout(() => play('clover'), 380);
      scene?.burst('gift', 1, t);
      scene?.burst('sparkle', 3, t + 250);
      scene?.burst('clover', 5, t + 300, { x: 80, y: 14 });
      const streak = pet.gift.streak;
      const next = Object.keys(STREAK_MILESTONES).map(Number).find((d) => d > streak);
      const toward = next ? ` ${next - streak} more ${next - streak === 1 ? 'day' : 'days'} to the ${next}-day bonus.` : '';
      toast(`${pet.name} found you a gift: +${r.clover} clover! ${streak}-day streak.${toward}`);
      haptic('success');
      break;
    }
  }
  queueReconcile();
  render();
}

/** What's in her basket, in words: "18 clover, 2 strawberries and a pine cone". */
function lootText(l: Loot, clover: number): string {
  const parts: string[] = [];
  if (clover) parts.push(`${clover} clover`);
  if (l.berries) parts.push(l.berries === 1 ? 'a strawberry' : `${l.berries} strawberries`);
  if (l.golden) parts.push(l.golden === 1 ? 'a golden carrot' : `${l.golden} golden carrots`);
  for (const id of l.finds) { const c = COLLECTIBLES.find((x) => x.id === id); if (c) parts.push(article(c.name)); }
  if (!parts.length) return 'an empty basket, but a lovely walk';
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]!;
}

/** Time left on her sleep, for the toasts. */
function sleepLeft(): number {
  const nap = timer(pet, 'nap');
  return nap ? nap.endsAtMs - now() : 0;
}

/**
 * Show what a care action paid: a "+2" rising off the clover chip and a
 * clover among her hearts. Care pays clover only BOND_DAILY_CAP times a day;
 * the action that uses up the last one says so, once.
 */
function careClover(clover: number, bond: number): void {
  if (clover > 0) {
    const chip = ui.clover.parentElement;
    if (chip) {
      const pop = h('span', { class: 'clover-pop', 'aria-hidden': 'true', text: `+${clover}` });
      chip.append(pop);
      chip.classList.remove('bump');
      void chip.offsetWidth; // restart the animation
      chip.classList.add('bump');
      window.setTimeout(() => pop.remove(), 1200);
    }
    scene?.burst('clover', 1, performance.now() + 250);
  }
  if (bond > 0 && pet.bondToday >= BOND_DAILY_CAP) {
    window.setTimeout(() => toast("That's all the clover from care today. She still loves the attention."), 700);
  }
}

// ------------------------------------------------------------------ feeding

const FOOD_INFO: Record<FoodId, { name: string; short: string; art: ItemArt; blurb: string }> = {
  carrot: { name: 'Carrot', short: 'Carrot', art: 'carrot', blurb: '+25 food' },
  greens: { name: 'Dandelion greens', short: 'Greens', art: 'greens', blurb: '+15 food · +5 joy' },
  strawberry: { name: 'Strawberry', short: 'Berry', art: 'strawberry', blurb: '+20 food · +15 joy' },
  treat: { name: 'Oat treat', short: 'Treat', art: 'treat', blurb: '+50 food · +10 joy' },
  golden: { name: 'Golden carrot', short: 'Golden', art: 'golden', blurb: '+40 food · +15 joy · always loved' },
};

/** The tray open over the action row, if any, and the button it points to. */
let tray: { el: HTMLElement; kind: 'feed' | 'play' } | null = null;

/** Close the tray if it's open. */
function closeTray(): void {
  if (!tray) return;
  tray.el.remove();
  ui.acts[tray.kind].setAttribute('aria-expanded', 'false');
  tray = null;
  document.removeEventListener('pointerdown', onOutsideTray, true);
  document.removeEventListener('keydown', onTrayKey);
}
function onOutsideTray(e: Event): void {
  const t = e.target as Node;
  if (!tray || tray.el.contains(t) || ui.acts[tray.kind].contains(t)) return;
  closeTray();
}
function onTrayKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && tray) { const b = ui.acts[tray.kind]; closeTray(); b.focus(); }
}

/**
 * Feed's food or Play's toys, as a row of buttons like the action row, popping
 * up just above it with a pointer to the button.
 */
function toggleTray(kind: 'feed' | 'play'): void {
  const was = tray?.kind;
  closeTray();
  if (was === kind) return;
  const el = kind === 'feed' ? foodTray() : toyTray();
  // the pointer sits over the button's column
  const col = [...ui.acts[kind].parentElement!.children].indexOf(ui.acts[kind]);
  el.style.setProperty('--tip', `${(col + 0.5) * 20}%`);
  tray = { el, kind };
  ui.acts[kind].parentElement?.append(el);
  ui.acts[kind].setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', onOutsideTray, true);
  document.addEventListener('keydown', onTrayKey);
  (el.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
}

function foodTray(): HTMLElement {
  const n = now();
  const berries = pet.pantry?.berries ?? 0;
  const golden = pet.pantry?.golden ?? 0;
  // the tray opens while she sleeps or is out (for Bake); the food waits
  const cantEat = isOut(pet, n) ? "She's out foraging. Feed her when she's home."
    : isAsleep(pet, n, tz) ? REFUSAL.asleep! : null;
  // the golden carrot only shows once she has one from the garden
  const foods = FOOD_IDS.filter((id) => id !== 'golden' || golden > 0);
  const buttons = foods.map((id) => {
    const info = FOOD_INFO[id];
    const paysClover = id === 'strawberry' && berries === 0;
    const available = id === 'treat' ? pet.treats > 0 : id === 'golden' ? golden > 0 : paysClover ? pet.clover >= 3 : true;
    const cost = id === 'treat' ? (pet.treats > 0 ? `${pet.treats} left` : 'Bake first')
      : id === 'golden' ? `${golden} grown`
        : id === 'strawberry' ? (berries ? `${berries} grown` : '3') : 'Free';
    const s = itemSprite(info.art);
    const b = h('button', {
      class: 'act food-act', type: 'button',
      'aria-label': `${info.name}. ${info.blurb.replace(/·/g, ',')}. ${paysClover ? '3 clover' : cost}.`,
    },
    img(s, Math.max(1, Math.floor(30 / Math.max(s.w, s.h)))),
    h('span', { class: 'nm', text: info.short }),
    h('span', { class: 'cost' }, paysClover ? img(itemSprite('clover'), 1) : null, cost));
    b.addEventListener('click', () => { closeTray(); doAction('feed', { food: id }); });
    if (cantEat) setOff(b, cantEat);
    else if (!available) setOff(b, id === 'treat' ? REFUSAL.noTreats! : `Strawberries cost 3 clover, or grow them in the garden.`);
    return b;
  });
  const bake = h('button', { class: 'btn bake-btn', type: 'button' }, img(itemSprite('treat'), 2), h('span', { class: 'lbl' }), h('span', { class: 'meta' }));
  bake.addEventListener('click', () => { closeTray(); doAction('bake'); });
  renderBakeButton(bake, n);
  const hint = cantEat ? `${isOut(pet, n) ? "She's out foraging" : "Shh, she's asleep"}. You can still bake her a treat for later.`
    : 'Baked treats and berries delight her most.';
  return h('div', { class: 'food-tray', role: 'group', 'aria-label': `What would ${pet.name} like?` },
    h('div', { class: 'food-row', style: `grid-template-columns:repeat(${buttons.length},minmax(0,1fr))` }, ...buttons),
    h('p', { class: 'food-hint', text: hint }),
    bake);
}

/** Bake, at the foot of the Feed tray: a treat for the pantry in an hour, or the countdown to one. */
function renderBakeButton(b: HTMLButtonElement, n: number): void {
  const t = timer(pet, 'bake');
  const full = !t && pet.treats >= 3;
  const lbl = t ? 'Baking' : full ? 'The pantry is full' : 'Bake a treat';
  const meta = t ? fmtCountdown(t.endsAtMs - n) : full ? `${pet.treats} treats` : 'Ready in an hour';
  const l = b.querySelector('.lbl')!, m = b.querySelector('.meta')!;
  if (l.textContent !== lbl) l.textContent = lbl;
  if (m.textContent !== meta) m.textContent = meta;
  b.classList.toggle('counting', !!t);
  b.setAttribute('aria-label', t ? `A treat is baking, ready in ${fmtLong(t.endsAtMs - n)}` : full ? 'Bake a treat. The pantry is full' : 'Bake a treat, ready in an hour');
  setOff(b, t ? `A treat's in the oven, ready in ${fmtDuration(t.endsAtMs - n)}.` : full ? 'The pantry is full. Feed her a treat first.' : null);
}

/** Short enough for a tray button. */
const TOY_SHORT: Record<string, string> = { yarn: 'Yarn', box: 'Box', swing: 'Swing', ballpit: 'Ball pit', maze: 'Maze' };

/** Her toys, one tap to play; the toy box (to buy more) at the end. */
function toyTray(): HTMLElement {
  const buttons = TOYS.filter((t) => ownsToy(pet, t.id)).map((t) => {
    const s = itemSprite(TOY_ART[t.id] ?? 'sparkle');
    const b = h('button', { class: 'act food-act', type: 'button', 'aria-label': `Play with the ${t.name.toLowerCase()}` },
      img(s, Math.max(1, Math.floor(30 / Math.max(s.w, s.h)))),
      h('span', { class: 'nm', text: TOY_SHORT[t.id] ?? t.name }));
    b.addEventListener('click', () => { closeTray(); doAction('play', { toy: t.id }); });
    return b;
  });
  if (TOYS.some((t) => !ownsToy(pet, t.id))) {
    const s = itemSprite('gift');
    const more = h('button', { class: 'act food-act', type: 'button', 'aria-label': 'More toys' },
      img(s, Math.max(1, Math.floor(30 / Math.max(s.w, s.h)))),
      h('span', { class: 'nm', text: 'More toys' }));
    more.addEventListener('click', () => { closeTray(); openShop({ cat: 'toys' }); });
    buttons.push(more);
  }
  return h('div', { class: 'food-tray', role: 'group', 'aria-label': `What would ${pet.name} like to play with?` },
    h('div', { class: 'food-row', style: `grid-template-columns:repeat(${Math.min(buttons.length, 4)},minmax(0,1fr))` }, ...buttons),
    h('p', { class: 'food-hint', text: 'Playing cheers her up and counts as care.' }));
}

// ------------------------------------------------------------------ away summary

function showAway(gap: number, events: PetEvent[], newDay: boolean, backFromHoliday = false, cloverFound = 0): void {
  const items: [ItemArt, string][] = [];
  const count = (k: PetEvent['kind']) => events.filter((e) => e.kind === k).length;
  if (backFromHoliday) items.push(['suitcase', `Home from her holiday, rested and happy to see you.`]);
  if (count('napDone')) items.push(['moon', 'Had a good sleep and woke up rested.']);
  else if (count('fellAsleep')) items.push(['moon', 'Got tired and dozed off.']);
  if (count('treatBaked')) items.push(['treat', 'A treat finished baking. It\'s in the pantry.']);
  // each thing she found, by name, for the shelf
  const found = new Map<string, number>();
  for (const e of events) if (e.kind === 'found') found.set(e.item, (found.get(e.item) ?? 0) + 1);
  for (const [id, k] of found) {
    const c = COLLECTIBLES.find((x) => x.id === id);
    if (!c) continue;
    const what = k === 1 ? article(c.name) : `${k} × ${c.name.toLowerCase()}`;
    items.push([id, `Found ${what}${c.rarity === 'rare' ? ', a rare one' : ''}.`]);
  }
  const visits = events.filter((e): e is Extract<PetEvent, { kind: 'critter' }> => e.kind === 'critter');
  const visitClover = visits.reduce((sum, e) => sum + e.clover, 0);
  const trips = events.filter((e): e is Extract<PetEvent, { kind: 'forageDone' }> => e.kind === 'forageDone');
  const tripClover = trips.reduce((sum, e) => sum + e.clover, 0);
  for (const e of trips) items.push(['basket', `Came home from foraging with ${lootText(e.loot, e.clover)}.`]);
  if (cloverFound - visitClover - tripClover > 0) items.push(['clover', `+${cloverFound - visitClover - tripClover} clover from her finds.`]);
  const who = [...new Set(visits.map((e) => e.critter))].map((id) => critterById(id)).filter((c) => !!c);
  if (who.length) {
    const names = who.map((c) => article(c!.name));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!;
    items.push([who[0]!.id as ItemArt, `${list.replace(/^a/, 'A')} dropped by, leaving ${visitClover} clover.`]);
    for (const e of visits.filter((v) => v.keepsake)) {
      const k = COLLECTIBLES.find((x) => x.id === e.keepsake);
      if (k) items.push([k.id as ItemArt, `The ${critterById(e.critter)!.name.toLowerCase()} left ${article(k.name)}.`]);
    }
  }
  const inYard = Math.floor(stored(pet, now()));
  if (inYard >= 1) items.push(['clover', `${inYard} clover waiting in the yard.`]);
  const ripe = plots(pet).filter((p) => p && p.readyAtMs <= now()).length;
  if (ripe) items.push(['sprout', `${ripe === 1 ? 'Something is' : `${ripe} plots are`} ready in the garden.`]);
  const m = mood(pet, now(), tz);
  if (m !== 'content' && m !== 'asleep') items.push([m === 'peckish' ? 'carrot' : m === 'lonely' ? 'heart' : m === 'dusty' ? 'droplet' : 'moon', MOOD_LINE[m](pet.name)]);
  if (newDay) items.push(['heart', `Day ${pet.daysVisited} together.`]);
  if (!items.length) items.push(['heart', `${pet.name} pottered about the burrow.`]);

  openSheet((close) => {
    // What's waiting, to deal with right here. Each button says it's done once pressed.
    const doing = (label: string, done: string, act: () => void) => {
      const b = button(label, 'btn', () => { act(); b.disabled = true; b.textContent = done; });
      return b;
    };
    const quick: HTMLButtonElement[] = [];
    if (inYard >= 1) quick.push(button('Go to the yard', 'btn', () => { close(); goTab('garden'); goArea('yard'); }));
    if (ripe) quick.push(doing(ripe === 1 ? 'Pick & replant' : `Pick & replant all ${ripe}`, 'Picked', () => pickAll()));
    if (giftReady(pet, now(), tz) && !away()) quick.push(doing('Open the daily gift', 'Opened', () => doAction('gift')));
    // her portrait as she is now: asleep, grumpy or pleased to see you
    const face = m === 'asleep' ? 'asleep' : m === 'grumpy' ? 'grumpy' : m === 'content' ? 'happy' : 'content';
    return [
      h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, face, 0, dressOf(pet)), 3, `${pet.name}, ${m === 'content' ? 'happy to see you' : m}`)),
      h('div', { class: 'eyebrow', text: 'While you were away' }),
      h('h2', { text: fmtLong(gap) }),
      h('ul', {}, ...items.map(([art, text]) =>
        h('li', {}, h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 30))), h('span', { text })))),
      h('div', { class: 'actions-col' }, ...quick, button(`Say hi to ${pet.name}`, 'btn primary', close)),
    ];
  }, { queue: true });
}

// ------------------------------------------------------------------ sheets

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button', text: label });
  b.addEventListener('click', onClick);
  return b;
}

const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

/** A close button pinned to a sheet's top-right corner, there however far it scrolls. Put it first. */
function closeX(close: () => void): HTMLElement {
  const b = h('button', { class: 'sheet-x', type: 'button', 'aria-label': 'Close', title: 'Close' });
  b.innerHTML = CROSS;
  b.addEventListener('click', close);
  return h('div', { class: 'sheet-x-pin' }, b);
}

/**
 * Show a button as unavailable, with why (null: available again). Unlike
 * `disabled` it still takes the tap, and says why instead of doing nothing;
 * screen readers hear it as unavailable, with the reason.
 */
function setOff(b: HTMLButtonElement, why: string | null): void {
  if (why) {
    b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-description', why);
    b.dataset.why = why;
  } else if (b.dataset.why !== undefined) {
    b.removeAttribute('aria-disabled');
    b.removeAttribute('aria-description');
    delete b.dataset.why;
  }
}
// ------------------------------------------------------------------ the line under the room

/**
 * The line under the room is one line, always, so the room never changes
 * size as it changes. Too long (a long name, or another language), it steps
 * down a size or two, then ends in "…" and a tap shows the whole of it in a
 * bubble over the room. Screen readers get all of it either way (aria-live).
 */
const LINE_SIZES = [14, 13];
/** How long something said on the line (a visitor's hello) stays before her mood comes back. */
const LINE_HOLD_MS = 6000;
let heldLine: { text: string; until: number } | null = null;
const lineFit = new ResizeObserver((es) => { for (const e of es) fitLine(e.target as HTMLElement); });

function setLine(el: HTMLElement, text: string): void {
  if (el.textContent !== text) {
    el.textContent = text;
    closeLineBubble();
  }
  lineFit.observe(el);
  fitLine(el);
}

function fitLine(el: HTMLElement): void {
  if (!el.clientWidth) return; // not showing: fitted when it is (the observer)
  el.style.fontSize = '';
  const over = () => el.scrollWidth > el.clientWidth + 1;
  for (const px of LINE_SIZES) { if (!over()) break; el.style.fontSize = `${px}px`; }
  const cut = over();
  el.classList.toggle('cut', cut);
  if (cut) el.tabIndex = 0; else el.removeAttribute('tabindex');
}

let lineBubble: { el: HTMLElement; timer: number } | null = null;
function closeLineBubble(): void {
  if (!lineBubble) return;
  window.clearTimeout(lineBubble.timer);
  lineBubble.el.remove();
  lineBubble = null;
}
/** The whole of a cut-short line, floating just above it for a few seconds. */
function showLineBubble(line: HTMLElement): void {
  closeLineBubble();
  const r = line.getBoundingClientRect();
  // aria-hidden: the line itself already read all of it out
  const el = h('div', { class: 'line-bubble', 'aria-hidden': 'true', text: line.textContent ?? '' });
  el.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
  document.body.append(el);
  lineBubble = { el, timer: window.setTimeout(closeLineBubble, 5000) };
}
document.addEventListener('click', (e) => {
  const line = (e.target as Element | null)?.closest?.<HTMLElement>('.moodline.cut');
  if (line) { if (lineBubble) closeLineBubble(); else showLineBubble(line); }
  else if (lineBubble) closeLineBubble();
});
document.addEventListener('keydown', (e) => {
  const line = (e.target as Element | null)?.closest?.<HTMLElement>('.moodline.cut');
  if (line && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showLineBubble(line); }
  else if (e.key === 'Escape') closeLineBubble();
});

// A long press on a picture or button is holding it, not asking for the
// browser's image menu (Android; iOS's is off in the CSS). Text keeps its menu.
document.addEventListener('contextmenu', (e) => {
  if ((e.target as Element | null)?.closest?.('img, canvas, button')) e.preventDefault();
});
// ahead of the button's own handler: an unavailable button explains itself instead
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-why]');
  if (!b) return;
  e.stopPropagation();
  e.preventDefault();
  play('nope');
  toast(b.dataset.why!);
}, true);

// Sheets. The player's own open on top of whatever's open. Ones that open by
// themselves (`queue`: what she did while you were away, a gift, a question)
// wait until no sheet is open and then come one at a time, so none is buried
// under the next. Only the top sheet takes input: everything under it is inert.

interface SheetOpts { queue?: boolean; kind?: string }
/** Open sheets, bottom to top. */
const sheetStack: { scrim: HTMLElement; close: () => void; kind?: string }[] = [];
const sheetQueue: { open: () => void; kind?: string }[] = [];

/** Whether a sheet of this kind is open or waiting. */
function sheetPending(kind: string): boolean {
  return sheetStack.some((s) => s.kind === kind) || sheetQueue.some((s) => s.kind === kind);
}

function openSheet(build: (close: () => void) => Node[], opts: SheetOpts = {}): void {
  if (opts.queue && (sheetStack.length || sheetQueue.length || decorating)) {
    sheetQueue.push({ open: () => openSheet(build, { ...opts, queue: false }), kind: opts.kind });
    return;
  }
  const prevFocus = document.activeElement as HTMLElement | null;
  const scrim = h('div', { class: opts.kind ? `scrim ${opts.kind}` : 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const close = () => {
    const i = sheetStack.findIndex((s) => s.scrim === scrim);
    if (i < 0) return;
    sheetStack.splice(i, 1);
    scrim.remove();
    const top = sheetStack[sheetStack.length - 1];
    if (top) top.scrim.inert = false;
    else app.inert = visitingFriend;
    if (prevFocus?.isConnected) prevFocus.focus();
    if (!sheetStack.length && !decorating) sheetQueue.shift()?.open();
  };
  sheet.append(...build(close));
  const title = sheet.querySelector('h2');
  if (title) { title.id = `sheet-title-${sheetStack.length}`; sheet.setAttribute('aria-labelledby', title.id); }
  scrim.append(sheet);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  const below = sheetStack[sheetStack.length - 1];
  if (below) below.scrim.inert = true;
  app.inert = true;
  sheetStack.push({ scrim, close, kind: opts.kind });
  document.body.append(scrim);
  (sheet.querySelector('button') as HTMLButtonElement | null)?.focus();
}

// Escape closes the top sheet only, and nothing else hears it.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !sheetStack.length) return;
  e.stopPropagation();
  sheetStack[sheetStack.length - 1]!.close();
}, true);

// ------------------------------------------------------------------ reminders

async function maybeAskReminders(kind: 'nap' | 'bake' | 'forage'): Promise<void> {
  if (!OR.capabilities.has('notifications.schedule') || settings.reminders !== null) return;
  const status = await OR.notifications.status();
  const pushOff = status !== null && !status.push;
  // push is false while this game alone is muted, too: that's their choice
  // here, not their phone's, so say so and where to undo it
  const gameMuted = status?.muted === true;
  const what = kind === 'nap' ? 'when she wakes up' : kind === 'forage' ? "when she's home" : 'when the treat is ready';
  openSheet((close) => [
    h('h2', { text: `Want a nudge ${what}?` }),
    h('p', { text: gameMuted
      ? "You've muted Rabbit Pets, so we'll leave a note in your bell instead. Turn that back on with Notifications in Settings."
      : pushOff
      ? "Your phone notifications are off for games, so we'll leave a note in your notifications instead."
      : `We'll let you know ${kind === 'nap' ? `in about ${fmtDuration(sleepLeft())}` : kind === 'forage' ? `in about ${fmtDuration((tripOf(pet)?.endsAtMs ?? now()) - now())}` : 'in about an hour'}.` }),
    h('div', { class: 'actions-col' },
      button('Yes, nudge me', 'btn primary', () => { settings.reminders = 'on'; saveSettings(); queueReconcile(); render(); close(); }),
      button('Not now', 'btn', () => { settings.reminders = 'off'; saveSettings(); render(); close(); })),
    h('p', { class: 'note', text: 'You can turn them off, or just some kinds, any time in Settings (the gear at the top).' }),
  ], { queue: true });
}

let reconcileTimer = 0;
let reconciling = false;
/** A change came in while a reconcile was running: run again when it's done. */
let reconcileAgain = false;
function queueReconcile(): void {
  if (!OR.capabilities.has('notifications.schedule') || !OR.user) return;
  window.clearTimeout(reconcileTimer);
  reconcileTimer = window.setTimeout(async () => {
    if (settings.reminders === null) return;
    if (reconciling) { reconcileAgain = true; return; }
    reconciling = true;
    try {
      const n = now();
      const next = await reconcile(OR, settings, desiredReminders(pet, n, tz), n);
      if (JSON.stringify(next) !== JSON.stringify(settings.scheduled)) {
        settings.scheduled = next;
        saveSettings();
      }
    } finally {
      reconciling = false;
      if (reconcileAgain) { reconcileAgain = false; queueReconcile(); }
    }
  }, 1500);
}

// ------------------------------------------------------------------ decorating

/** Where Done goes from arranging: back to the shop, or to wherever you came from. */
let arrangeReturn: Tab = 'shop';

/** Into arranging the burrow (the shop's other half), from goTab. */
function startDecorating(): void {
  decorating = true;
  document.body.classList.add('arranging-burrow');
  selectedUid = null;
  ui.canvas.tabIndex = 0;
  ui.canvas.setAttribute('aria-label', 'The burrow. Drag decor to move it. With the keyboard: N and P pick a piece, arrow keys move it (Shift for bigger steps), F flips it, Delete puts it away.');
  renderDecoratePanel();
  layoutStage();
}

/** Out of arranging, from goTab. */
function stopDecorating(): void {
  decorating = false;
  document.body.classList.remove('arranging-burrow');
  selectedUid = null;
  drag = null;
  ui.canvas.removeAttribute('tabindex');
  ui.canvas.setAttribute('aria-label', 'The burrow');
  ui.panel.replaceChildren(...ui.panelKids);
  layoutStage();
}

function selected(): PlacedItem | undefined {
  return burrow.items.find((i) => i.uid === selectedUid && i.placed);
}

function moveItem(item: PlacedItem, x: number, y: number): void {
  const def = byId(item.id);
  if (!def) return;
  const p = clampToZone(def.zone, x, y);
  item.x = p.x;
  item.y = p.y;
}

/** Drag placed decor anywhere in its zone; arrow keys nudge the selected piece. */
function wireDecorDrag(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('pointerdown', (e) => {
    if (!decorating || !scene) return;
    const p = toScene(e);
    const hit = scene.hitTest(here(), p.x, p.y);
    if (!hit) {
      if (selectedUid) { selectedUid = null; renderDecoratePanel(); }
      return;
    }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    drag = { uid: hit.uid, dx: hit.x - p.x, dy: hit.y - p.y, moved: false };
    if (selectedUid !== hit.uid) { selectedUid = hit.uid; renderDecoratePanel(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const item = burrow.items.find((i) => i.uid === drag!.uid);
    if (!item) return;
    const p = toScene(e);
    moveItem(item, p.x + drag.dx, p.y + drag.dy);
    drag.moved = true;
    // dragged down off the room, onto the storage strip: let go to put it away
    storeHot(overStorage(e));
  });
  const end = () => {
    const item = drag ? burrow.items.find((i) => i.uid === drag!.uid) : undefined;
    if (item && drag?.moved && ui.panel.classList.contains('drop-hot')) { storeHot(false); drag = null; putAway(item); haptic('light'); return; }
    storeHot(false);
    if (drag?.moved) { saveBurrow(); haptic('light'); play('place'); }
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => {
    // N and P pick the next or previous piece, for choosing one without a pointer
    if (decorating && (e.key === 'n' || e.key === 'p') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // this room's pieces (not the meadow's, which live in the garden)
      const placed = here().items.filter((i) => { const d = byId(i.id); return i.placed && !!d && !isOutdoor(d); });
      if (!placed.length) return;
      e.preventDefault();
      const at = placed.findIndex((i) => i.uid === selectedUid);
      const step = e.key === 'n' ? 1 : -1;
      const next = placed[at < 0 ? (step > 0 ? 0 : placed.length - 1) : (at + step + placed.length) % placed.length]!;
      selectedUid = next.uid;
      renderDecoratePanel();
      toast(`${byId(next.id)?.name ?? 'Piece'} selected. Arrow keys move it, F flips it, Delete puts it away.`);
      return;
    }
    const item = decorating ? selected() : undefined;
    if (!item) return;
    const step = e.shiftKey ? 4 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = d[e.key];
    if (mv) { e.preventDefault(); moveItem(item, item.x + mv[0], item.y + mv[1]); saveBurrow(); }
    else if (e.key === 'f') { e.preventDefault(); item.flip = !item.flip; saveBurrow(); play('flip'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); putAway(item); }
    else if (e.key === 'Escape') { selectedUid = null; renderDecoratePanel(); }
  });
}

/** Put a piece down at its zone's usual spot, nudged so it doesn't land exactly on another. */
function placeNew(item: PlacedItem): void {
  const def = byId(item.id);
  if (!def) return;
  const z = ZONES[def.zone];
  const others = here().items.filter((i) => i.placed && i.id !== item.id).length;
  moveItem(item, z.x + ((others * 7) % 21) - 10, z.y);
  item.placed = true;
  // it goes in the room you're decorating
  if (burrowRoom === 'main') delete item.room; else item.room = burrowRoom;
  selectedUid = item.uid;
}

function putAway(item: PlacedItem): void {
  item.placed = false;
  delete item.room;
  selectedUid = null;
  saveBurrow();
  toast('Put away in storage. Put it out again any time.');
  renderDecoratePanel();
}

// ------------------------------------------------------------------ the shop (decorate tray)

/** A wall, floor or window, shown as a crop of the room it makes. */
function surfaceSprite(def: SurfaceDef): Sprite {
  const key = `sf:${def.id}`;
  let sp = spriteCache.get(key);
  if (!sp) {
    const room = drawBurrow(false, { ...roomOf(starterBurrow()), [def.kind]: def.id });
    const box = def.kind === 'wall' ? { x: 58, y: 36, w: 22, h: 16 } : def.kind === 'floor' ? { x: 38, y: 96, w: 22, h: 16 } : { x: WINDOW.x - 13, y: WINDOW.y - 13, w: 27, h: 27 };
    const g: PixelGrid = blank(box.w, box.h);
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) g.px[y]![x] = room.px[box.y + y]![box.x + x]!;
    sp = toSprite(g);
    spriteCache.set(key, sp);
  }
  return sp;
}

type ShopThing =
  | { kind: 'decor'; def: DecorDef; stored: PlacedItem[] }
  | { kind: 'surface'; def: SurfaceDef };

/** How to unlock it, in a sentence, or null if it's open. */
function lockedBy(t: ShopThing): string | null {
  const bl = bondLevel(pet.bond).level;
  const bond = t.kind === 'decor' ? t.def.bond : t.def.bond ?? 1;
  if (bl < bond) return `Reach bond ${bond} with ${pet.name}. Your bond grows as you look after her each day (it's ${bl} now).`;
  const after = t.def.after;
  if (after && !ownsDecor(burrow, after)) return `Get the ${(byId(after)?.name ?? surfaceById(after)?.name ?? after).toLowerCase()} first, and this opens up.`;
  return null;
}

/** A shop key for a pinned goal: `decor:fireplace`, `surface:moonwindow`, `outfit:crown`, `toy:kite`. */
function goalInfo(key: string | null | undefined): { name: string; price: number; owned: boolean } | null {
  if (!key) return null;
  const [kind, id] = key.split(':') as [string, string];
  if (kind === 'decor') { const d = byId(id); return d ? { name: d.name, price: d.price, owned: burrow.items.some((i) => i.id === id) } : null; }
  if (kind === 'surface') { const d = surfaceById(id); return d ? { name: d.name, price: d.price, owned: ownsSurface(burrow, id) } : null; }
  if (kind === 'outfit') { const o = outfitById(id); return o ? { name: o.name, price: o.price, owned: wardrobe(pet).owned.includes(id) } : null; }
  if (kind === 'toy') { const t = TOYS.find((x) => x.id === id); return t ? { name: t.name, price: t.price, owned: ownsToy(pet, id) } : null; }
  return null;
}

/** Pin something to save for, or unpin it. */
function toggleGoal(key: string, name: string): void {
  pet = { ...pet, goal: pet.goal === key ? null : key };
  savePet();
  if (pet.goal) goal('pin');
  toast(pet.goal ? `Saving up for the ${name.toLowerCase()}. It shows under your clover.` : 'Goal unpinned.');
  play('flip');
  render();
}

/** The panel while arranging: pieces put away, to put out, and the picked piece's buttons. */
function renderDecoratePanel(): void {
  const stored = new Map<string, PlacedItem[]>();
  for (const i of burrow.items) {
    const d = byId(i.id);
    if (!i.placed && d && !isOutdoor(d)) stored.set(i.id, [...(stored.get(i.id) ?? []), i]);
  }
  // Storage, always there: drag a piece up out of it into the room, or a piece in the room down into it
  const tray = stored.size ? h('div', { class: 'tray', role: 'list', 'aria-label': 'In storage' }, ...[...stored].map(([id, items]) => {
    const def = byId(id)!;
    const s = itemSprite(def.art);
    const b = h('button', { class: 'titem', type: 'button', role: 'listitem', 'aria-label': `${def.name}. ${items.length} in storage. Put one out, or drag it into the room.` },
      h('span', { class: 'art' }, img(s, fitScale(s, 44))), h('span', { class: 'nm', text: def.name }), h('span', { class: 'pr', text: `${items.length} in storage` }));
    wireDragOut(b, items[0]!, def);
    return b;
  })) : h('p', { class: 'store-empty', text: 'Nothing in storage. Drag a piece down here to put it away.' });
  const store = h('div', { class: 'store-zone' }, h('div', { class: 'store-head' }, h('span', { text: 'Storage' }), h('span', { class: 'store-drop', text: 'Let go to put it away' })), tray);
  const sel = selected();
  const def = sel ? byId(sel.id) : undefined;
  const where = def?.zone === 'hang' ? 'anywhere on the wall' : 'anywhere on the floor';
  setLine(ui.moodline, sel && def ? `Drag the ${def.name.toLowerCase()} ${where}.`
    : stored.size ? 'Drag pieces about, up out of storage, or down into it.' : 'Drag pieces about, or down into storage to put them away.');
  const done = button('Done', 'btn primary', () => goTab(arrangeReturn));
  const flip = sel ? button('Flip', 'btn', () => { sel.flip = !sel.flip; saveBurrow(); play('flip'); }) : null;
  const away = sel ? button('Put away', 'btn', () => putAway(sel)) : null;
  // digging out rooms lives with the rest of the burrow's shopping
  const dig = !sel && ROOMS_OPEN && EXTRA_ROOMS.some((r) => !roomsOf(burrow).includes(r)) ? button('Dig a new room', 'btn', () => openDig()) : null;
  ui.panel.replaceChildren(ui.moodline, store, h('div', { class: 'row2' }, done, flip, away, dig));
  ui.chips.replaceChildren();
  ui.cards.querySelector('.cards-events')?.remove();
}

/** Whether a pointer is over the arranging panel (below the room): where a piece dropped goes into storage. */
function overStorage(e: { clientY: number }): boolean {
  return e.clientY > ui.stage.getBoundingClientRect().bottom;
}

/** Light up the storage strip while a piece held over it would go in. */
function storeHot(on: boolean): void {
  if (ui.panel.classList.contains('drop-hot') !== on) ui.panel.classList.toggle('drop-hot', on);
}

/**
 * A piece in storage: tap it to put it out at its usual spot, or drag it up
 * into the room, where it appears under your finger to be let go wherever.
 * Dragged back down, it goes back in. Sideways drags scroll the strip.
 */
function wireDragOut(b: HTMLButtonElement, item: PlacedItem, def: DecorDef): void {
  let start: { x: number; y: number; id: number } | null = null;
  let ghost: HTMLImageElement | null = null;
  let dragged = false;
  const inRoom = (e: PointerEvent) => !overStorage(e) && e.clientY > ui.stage.getBoundingClientRect().top;
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
  });
  b.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!ghost) {
      // up and away: a drag; sideways is the strip scrolling
      if (dy > -10 || Math.abs(dy) < Math.abs(dx)) return;
      try { b.setPointerCapture(e.pointerId); } catch { /* already released */ }
      ghost = img(itemSprite(def.art), Math.max(2, Math.round(scale)));
      ghost.className = 'px drag-ghost';
      document.body.append(ghost);
      dragged = true;
    }
    e.preventDefault();
    if (inRoom(e)) {
      // in the room: it's out, under your finger
      if (!item.placed) {
        item.placed = true;
        if (burrowRoom === 'main') delete item.room; else item.room = burrowRoom;
        selectedUid = item.uid;
      }
      const p = toScene(e);
      moveItem(item, p.x, p.y + 6);
      ghost.hidden = true;
    } else {
      if (item.placed) { item.placed = false; delete item.room; selectedUid = null; }
      ghost.hidden = false;
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    }
  });
  const end = () => {
    if (!start) return;
    start = null;
    ghost?.remove();
    ghost = null;
    if (!dragged) return;
    if (item.placed) {
      saveBurrow();
      goal();
      haptic('light');
      play('place');
    }
    renderDecoratePanel();
    render();
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('click', (e) => {
    // a drag ends in a click on the button: that's not a tap
    if (dragged) { dragged = false; e.preventDefault(); return; }
    placeNew(item);
    saveBurrow();
    goal();
    haptic('light');
    play('place');
    renderDecoratePanel();
    render();
  });
}

// ------------------------------------------------------------------ the shop
// A screen of its own on the Shop tab: decor, walls and floors, her wardrobe
// and toys. Tap a thing to see it in the display case at the top (an outfit
// on her; a wall, floor or window in her room, live; her playing with a toy;
// decor against her walls), with what you can do with it. Decor bought or put away goes into
// the burrow to be arranged (decorating, below), and Done comes back here.

type ShopCat = 'decor' | 'walls' | 'wardrobe' | 'toys';
const SHOP_CATS: ShopCat[] = ['decor', 'walls', 'wardrobe', 'toys'];
const SHOP_CAT_NAME: Record<ShopCat, string> = { decor: 'Decor', walls: 'Walls', wardrobe: 'Wardrobe', toys: 'Toys' };

interface ShopUi {
  nodes: Node[];
  sub: HTMLElement;
  clover: HTMLElement;
  cats: Record<ShopCat, HTMLButtonElement>;
  display: HTMLElement;
  grid: HTMLElement;
}
let shopUi: ShopUi | null = null;
type ShopBackdrop = 'wall' | 'floor' | 'her';
/** Which part of the room the display frames: her and the floor, closer in for play, or the wall and window. */
type ShopFrame = 'play' | 'floor' | 'wall';
interface ShopPreview { room?: Partial<RoomStyle>; play?: ItemArt; frame: ShopFrame; label: string }
/** The display's live room: a scene of its own, made once, drawn while a preview shows. */
let shopView: { stage: HTMLElement; canvas: HTMLCanvasElement; scene: Scene } | null = null;
let shopPreview: ShopPreview | null = null;
/** When she next starts playing again in the display, so the preview keeps playing; 0: now. */
let shopPlayAt = 0;
let shopCat: ShopCat = 'decor';
/** The thing in the display case, by its goal key (`decor:fireplace`); null for the category's own intro. */
let shopSel: string | null = null;
/** Decor for one seasonal event only (from its sheet's See the decor). */
let shopEvent: string | null = null;
let shopSig = '';

/** One thing in the shop, whatever its kind, and what it's up to. */
interface ShopItem {
  key: string;
  name: string;
  /** For its card. */
  card: () => Node;
  /** For the display case: big, and an outfit on her. Not used when there's a `preview`. */
  big: () => Node;
  /** What the display's backdrop is for `big`: a wall (hung decor), a floor (standing decor), or her own spot. */
  backdrop?: ShopBackdrop;
  /** Instead of `big`, her room, live: with a surface swapped in, or her playing with a toy. */
  preview?: ShopPreview;
  /** What it is, in a few words. */
  what: string;
  section: string;
  /** buy: affordable; saving: not yet; locked: not open yet; place: put away, ready to put out; owned/inuse/wearing: yours. */
  state: 'buy' | 'saving' | 'locked' | 'place' | 'owned' | 'inuse' | 'wearing';
  price: number;
  /** Its card's last line when it isn't a price. */
  note?: string;
  locked?: string;
  limited?: boolean;
  /** What you can do with it, most likely first. */
  actions: () => HTMLButtonElement[];
}

function buildShopScreen(): ShopUi {
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  const cats = {} as Record<ShopCat, HTMLButtonElement>;
  for (const c of SHOP_CATS) {
    const b = h('button', { type: 'button', class: 'seg-tab', text: SHOP_CAT_NAME[c] });
    b.addEventListener('click', () => { if (shopCat === c) return; shopCat = c; shopSel = null; shopEvent = null; play('flip'); renderShop(); shopUi!.grid.scrollTop = 0; });
    cats[c] = b;
  }
  const display = h('section', { class: 'shop-display', 'aria-live': 'polite' });
  const grid = h('main', { class: 'shop-grid-wrap' });
  const header = h('header', { class: 'hud page-hud' },
    h('div', { class: 'hud-top' },
      h('div', { class: 'who' }, h('div', { class: 'name', text: 'Shop' }), sub),
      cloverChip(clover)));
  const top = h('div', { class: 'shop-top' }, h('nav', { class: 'seg shop-cats', 'aria-label': 'Shop sections' }, ...SHOP_CATS.map((c) => cats[c])), display);
  return { nodes: [header, top, grid], sub, clover, cats, display, grid };
}

/** To the shop: a category, one event's decor, or one thing in the display case (a goal key). */
function openShop(opts: { cat?: ShopCat; event?: string | null; select?: string | null } = {}): void {
  const kind = opts.select?.split(':')[0];
  shopCat = opts.cat ?? (kind === 'surface' ? 'walls' : kind === 'outfit' ? 'wardrobe' : kind === 'toy' ? 'toys' : kind === 'decor' ? 'decor' : shopCat);
  shopEvent = opts.event ?? null;
  shopSel = opts.select ?? null;
  shopSig = '';
  if (tab === 'shop' && !decorating) { renderShop(); return; }
  goTab('shop');
}

/** The price, with its clover. */
function priceTag(price: number): HTMLElement {
  return h('span', { class: 'pr' }, img(itemSprite('clover'), 1), price.toLocaleString());
}

/** Her, as dressed, with one slot changed: for the wardrobe's cards and the display. */
function herIn(slot: Slot | null, id: string | null, scale: number, face: Face = 'content'): HTMLImageElement {
  const dress = slot ? { ...dressOf(pet), [slot]: id } : dressOf(pet);
  return img(rabbitSprite(pet.coat, face, 0, dress), scale, `${pet.name}${id ? ` in the ${outfitById(id)?.name.toLowerCase() ?? 'outfit'}` : ''}`);
}

function shopStage(): HTMLElement {
  if (shopView) return shopView.stage;
  const canvas = h('canvas', { role: 'img' });
  const stage = h('div', { class: 'shop-stage live' }, canvas);
  const scene = new Scene(canvas);
  shopView = { stage, canvas, scene };
  new ResizeObserver(() => fitShopScene()).observe(stage);
  return stage;
}

/**
 * What each framing keeps in view: the room's bottom (her and the floor) or
 * from near its top (the wall and window), and at least this many rows of it.
 */
const SHOP_FRAMES: Record<ShopFrame, { anchor: 'bottom' | number; rows: number }> = {
  play: { anchor: 'bottom', rows: 50 },
  floor: { anchor: 'bottom', rows: 50 },
  wall: { anchor: 16, rows: 44 },
};

/** Like fitScene, framed on part of the room: the room's width fills the display, unless that leaves too few rows. */
function fitShopScene(): void {
  if (!shopView || !shopPreview || !shopView.stage.isConnected) return;
  const { stage, canvas, scene } = shopView;
  const w = stage.clientWidth, hgt = stage.clientHeight;
  if (!w || !hgt) return;
  const f = SHOP_FRAMES[shopPreview.frame];
  const scale = Math.min(w / (SCENE_W - 2 * WALL_INSET), hgt / f.rows);
  const sw = Math.ceil(w / scale - 1e-6), sh = Math.ceil(hgt / scale - 1e-6);
  scene.resize(sw, sh, Math.round((sw - SCENE_W) / 2), f.anchor === 'bottom' ? sh - SCENE_H : -f.anchor);
  canvas.style.width = `${sw * scale}px`; canvas.style.height = `${sh * scale}px`;
  canvas.style.left = `${Math.floor((w - sw * scale) / 2)}px`; canvas.style.top = '0px';
}

function drawShopScene(t: number): void {
  const p = shopPreview;
  if (!shopView || !p) return;
  if (p.play && t >= shopPlayAt) {
    shopView.scene.react('play', t, p.play);
    shopPlayAt = t + 2600; // a play lasts 2.2 s: a short breath between, so the toy's nearly always there
  }
  // awake and on her own, whatever she's really up to: it's a fitting room
  shopView.scene.draw({
    ...burrowModel(now(), 'main'), burrow: inRoom(burrow, 'main'), decorating: false, selected: null,
    mood: 'content', absent: false, guests: [], critter: null, guest: true,
    room: { ...roomOf(burrow), ...p.room },
  }, t);
}

/** The display's backdrop for a sprite: her walls and floor, so a piece is seen against them. */
function shopBackdrop(kind: ShopBackdrop, art: Node): HTMLElement {
  const c = roomColours(roomOf(burrow));
  const el = h('div', { class: `shop-stage ${kind}` }, art);
  el.style.setProperty('--wall', c.wall);
  el.style.setProperty('--wall-d', c.wallD);
  el.style.setProperty('--floor', c.floor);
  el.style.setProperty('--floor-d', c.floorD);
  return el;
}

/** Buying or saving up, for anything with a price: the button for its state. */
function buyOrSave(it: ShopItem, buy: () => void): HTMLButtonElement[] {
  if (it.state === 'buy') {
    const b = h('button', { class: 'btn primary', type: 'button' }, 'Buy for ', priceTag(it.price));
    b.addEventListener('click', buy);
    return [b];
  }
  if (it.state === 'saving') {
    const pinned = pet.goal === it.key;
    return [button(pinned ? 'Stop saving for it' : 'Save up for it', pinned ? 'btn' : 'btn primary', () => { toggleGoal(it.key, it.name); shopSig = ''; renderShop(); }),
      button('How to get more', 'btn', () => openCloverSheet())];
  }
  return [];
}

function decorItems(): ShopItem[] {
  const n = now();
  const event = shopEvent ? activeEvents(n, tz).find((e) => e.id === shopEvent) : undefined;
  if (!event) shopEvent = null; // it ended while you were looking
  const out: ShopItem[] = [];
  for (const def of CATALOG) {
    if (isOutdoor(def)) continue; // the meadow's, sold in the garden
    if (event && !event.decor.includes(def.id) && event.gift?.id !== def.id) continue;
    const mine = burrow.items.filter((i) => i.id === def.id);
    const stored = mine.filter((i) => !i.placed);
    // seasonal pieces are for sale during their event; once owned, they're yours
    if (!mine.length && (def.giftOnly || (def.limited && !limitedAvailable(def.id, n, tz)))) continue;
    const locked = lockedBy({ kind: 'decor', def, stored });
    const canBuy = !def.giftOnly && !(def.limited && !limitedAvailable(def.id, n, tz));
    const state: ShopItem['state'] = stored.length ? 'place' : mine.length ? 'owned' : locked ? 'locked' : def.price <= pet.clover ? 'buy' : 'saving';
    const it: ShopItem = {
      key: `decor:${def.id}`, name: def.name, price: def.price, state, locked: locked ?? undefined, limited: def.limited,
      card: () => img(itemSprite(def.art), fitScale(itemSprite(def.art), 44)),
      big: () => img(itemSprite(def.art), fitScale(itemSprite(def.art), 104), def.name),
      backdrop: def.zone === 'hang' ? 'wall' : 'floor',
      what: [def.zone === 'hang' ? 'For the wall' : 'For the floor', def.bed ? 'she sleeps on it' : '', def.glow ? 'it glows at night' : ''].filter(Boolean).join(', '),
      section: state === 'place' ? 'In storage' : state === 'owned' ? 'In the burrow' : state === 'locked' ? 'Opens later' : 'For sale',
      note: state === 'place' ? `${stored.length} in storage` : state === 'owned' ? (mine.length > 1 ? `${mine.length} in the burrow` : 'In the burrow') : undefined,
      actions: () => {
        const buy = () => buyDecor(def);
        // out or not is up to you: put out what's stored, put away what's out
        const out = mine.filter((i) => i.placed);
        const more = canBuy && def.price <= pet.clover ? [buyAnother(def.price, buy)] : [];
        if (state === 'place') {
          const put = button('Put it out', 'btn primary', () => putOutPiece(stored[0]!));
          return [put, ...(out.length ? [button('Put one away', 'btn', () => storePiece(out[0]!))] : []), ...more];
        }
        if (state === 'owned') {
          return [button('Move it', 'btn', () => goTab('shop', { arrange: out[0]?.uid ?? true })), button('Put it away', 'btn', () => storePiece(out[0]!)), ...more];
        }
        return buyOrSave(it, buy);
      },
    };
    out.push(it);
  }
  return out;
}

function buyAnother(price: number, buy: () => void): HTMLButtonElement {
  const b = h('button', { class: 'btn', type: 'button', 'aria-label': `Buy another for ${price} clover` }, '+1 for ', priceTag(price));
  b.addEventListener('click', buy);
  return b;
}

/** Buy a piece: it waits in storage until you put it out (if you ever do). */
function buyDecor(def: DecorDef): void {
  const paid = spendClover(pet, def.price);
  if (!paid) { play('nope'); toast(moreClover(def.price)); return; }
  pet = paid;
  if (pet.goal === `decor:${def.id}`) pet = { ...pet, goal: null };
  savePet();
  burrow.items.push({ uid: newUid(), id: def.id, x: 0, y: 0, flip: false, placed: false });
  saveBurrow();
  haptic('light');
  play('clover');
  toast(def.bed ? `The ${def.name.toLowerCase()} is yours. Put it out and she'll sleep on it.` : `The ${def.name.toLowerCase()} is yours. Put it out whenever you like.`);
  note(`Got ${article(def.name)} for the burrow.`, def.art, `decor:${def.id}`);
  render();
}

/** Put a stored piece out in the room you're in, and go and arrange it. */
function putOutPiece(item: PlacedItem): void {
  placeNew(item);
  saveBurrow();
  goal();
  play('place');
  goTab('shop', { arrange: item.uid });
}

/** Take a placed piece back into storage, from the shop. */
function storePiece(item: PlacedItem): void {
  item.placed = false;
  delete item.room;
  saveBurrow();
  play('flip');
  toast('Put away. Put it out again any time.');
  render();
}

const SURFACE_SECTION: Record<SurfaceDef['kind'], string> = { wall: 'Walls', floor: 'Floors', window: 'Windows' };

function wallItems(): ShopItem[] {
  const inUse = surfacesOf(burrow);
  return [...SURFACES].sort((a, b) => ['wall', 'floor', 'window'].indexOf(a.kind) - ['wall', 'floor', 'window'].indexOf(b.kind) || a.price - b.price).map((def) => {
    const owned = ownsSurface(burrow, def.id);
    const locked = owned ? null : lockedBy({ kind: 'surface', def });
    const state: ShopItem['state'] = inUse[def.kind] === def.id ? 'inuse' : owned ? 'owned' : locked ? 'locked' : def.price <= pet.clover ? 'buy' : 'saving';
    const it: ShopItem = {
      key: `surface:${def.id}`, name: def.name, price: def.price, state, locked: locked ?? undefined,
      card: () => img(surfaceSprite(def), fitScale(surfaceSprite(def), 44)),
      big: () => img(surfaceSprite(def), fitScale(surfaceSprite(def), 88), def.name),
      preview: { room: { [def.kind]: def.id }, frame: def.kind === 'floor' ? 'floor' : 'wall', label: `${pet.name}'s burrow with the ${def.name.toLowerCase()}` },
      what: def.kind === 'wall' ? 'For the burrow walls' : def.kind === 'floor' ? 'For the burrow floor' : 'For the window',
      section: SURFACE_SECTION[def.kind],
      note: state === 'inuse' ? 'In use' : state === 'owned' ? 'Owned' : undefined,
      actions: () => {
        if (state === 'inuse') return [];
        if (state === 'owned') return [button('Use it', 'btn primary', () => { useSurface(burrow, def.id); saveBurrow(); play('flip'); toast(`The ${def.name.toLowerCase()} is up.`); render(); })];
        return buyOrSave(it, () => {
          const paid = spendClover(pet, def.price);
          if (!paid) { play('nope'); toast(moreClover(def.price)); return; }
          pet = paid;
          if (pet.goal === it.key) pet = { ...pet, goal: null };
          addSurface(burrow, def.id);
          savePet();
          saveBurrow();
          play('clover');
          haptic('success');
          toast(`The ${def.name.toLowerCase()} is up. Switch back any time.`);
          note(`Put up the ${def.name.toLowerCase()}.`, 'sparkle', `surface:${def.id}`);
          render();
        });
      },
    };
    return it;
  });
}

function wardrobeItems(): ShopItem[] {
  const n = now();
  const w = wardrobe(pet);
  const bl = bondLevel(pet.bond).level;
  const shown = OUTFITS.filter((o) => w.owned.includes(o.id) || (!o.giftOnly && (!o.limited || limitedAvailable(o.id, n, tz))));
  // on her head, then round her neck; hers first in each
  const order = (o: Outfit) => (o.slot === 'head' ? 0 : 2) + (w.owned.includes(o.id) ? 0 : 1);
  return shown.sort((a, b) => order(a) - order(b) || a.price - b.price).map((o) => {
    const owned = w.owned.includes(o.id);
    const on = w[o.slot] === o.id;
    const locked = !owned && o.bond && bl < o.bond ? `Opens at bond ${o.bond}. Your bond grows as you look after ${pet.name} each day (it's ${bl} now).` : null;
    const state: ShopItem['state'] = on ? 'wearing' : owned ? 'owned' : locked ? 'locked' : o.price <= pet.clover ? 'buy' : 'saving';
    const it: ShopItem = {
      key: `outfit:${o.id}`, name: o.name, price: o.price, state, locked: locked ?? undefined, limited: o.limited,
      card: () => h('span', { class: 'on-her' }, herIn(o.slot, o.id, 2)),
      // hers: her as she is, so taking it off (or putting it on) shows; not hers yet: trying it on
      big: () => herIn(o.slot, owned && !on ? null : o.id, 4, 'happy'),
      backdrop: 'her',
      what: o.slot === 'head' ? 'On her head' : 'Round her neck',
      section: o.slot === 'head' ? 'On her head' : 'Round her neck',
      note: on ? 'Wearing' : owned ? 'Hers' : undefined,
      actions: () => {
        if (on) return [button('Take it off', 'btn', () => { pet = wear(pet, o.slot, null); savePet(); play('flip'); render(); })];
        if (owned) return [button('Put it on', 'btn primary', () => { pet = wear(pet, o.slot, o.id); savePet(); play('flip'); goal('dress'); render(); })];
        return buyOrSave(it, () => {
          const r = buyOutfit(pet, o.id);
          if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? moreClover(o.price) : 'Not yet.'); return; }
          if (pet.goal === it.key) r.state.goal = null;
          // bought to wear: she puts it on
          pet = wear(r.state, o.slot, o.id);
          savePet();
          play('clover');
          haptic('success');
          toast(`${pet.name} puts on the ${o.name.toLowerCase()}.`);
          goal('dress');
          note(`Got ${article(o.name)}.`, 'gift', `outfit:${o.id}`);
          render();
        });
      },
    };
    return it;
  });
}

function toyItems(): ShopItem[] {
  return TOYS.map((t) => {
    const owned = ownsToy(pet, t.id);
    const locked = !owned && t.after && !ownsToy(pet, t.after) ? `Comes after the ${toyById(t.after)!.name.toLowerCase()}: get that one first.` : null;
    const state: ShopItem['state'] = owned ? 'owned' : locked ? 'locked' : t.price <= pet.clover ? 'buy' : 'saving';
    const art = TOY_ART[t.id] ?? 'sparkle';
    const it: ShopItem = {
      key: `toy:${t.id}`, name: t.name, price: t.price, state, locked: locked ?? undefined,
      card: () => img(itemSprite(art), fitScale(itemSprite(art), 44)),
      big: () => img(itemSprite(art), fitScale(itemSprite(art), 88), t.name),
      preview: { play: art, frame: 'play', label: `${pet.name} playing with the ${t.name.toLowerCase()}` },
      what: 'A toy for playtime, from Play at home',
      section: owned ? 'Her toys' : locked ? 'Opens later' : 'For sale',
      note: owned ? 'Hers' : undefined,
      actions: () => {
        if (owned) return [button('Play with it', 'btn primary', () => { goTab('burrow'); doAction('play', { toy: t.id }); })];
        return buyOrSave(it, () => {
          const r = buyToy(pet, t.id);
          if (!r.ok) { play('nope'); toast(moreClover(t.price)); return; }
          pet = r.state;
          if (pet.goal === it.key) pet = { ...pet, goal: null };
          savePet();
          play('clover');
          haptic('success');
          toast(`A new ${t.name.toLowerCase()} for ${pet.name}! Play with it from Play.`);
          note(`Got ${article(t.name)} for her toy box.`, art, `toy:${t.id}`);
          render();
        });
      },
    };
    return it;
  });
}

/**
 * The display case with nothing picked, the category's own word: a few
 * pieces for sale, her room, her as she's dressed, or her at play.
 */
function shopIntro(items: ShopItem[]): { big?: Node; backdrop?: ShopBackdrop; preview?: ShopPreview; name: string; what: string; actions: HTMLButtonElement[] } {
  const event = shopEvent ? activeEvents(now(), tz).find((e) => e.id === shopEvent) : undefined;
  const room: ShopPreview = { frame: 'wall', label: `${pet.name}'s burrow` };
  switch (shopCat) {
    case 'decor': {
      // what's for sale, cheapest first, standing together
      const arts = CATALOG.filter((d) => d.zone !== 'hang' && items.some((i) => i.key === `decor:${d.id}` && (i.state === 'buy' || i.state === 'saving')))
        .sort((a, b) => a.price - b.price).slice(0, 3).map((d) => img(itemSprite(d.art), fitScale(itemSprite(d.art), 64), d.name));
      const big = event ? img(itemSprite(EVENT_ART[event.id] ?? 'sparkle'), 4) : arts.length ? h('span', { class: 'shop-lineup' }, ...arts) : undefined;
      return event
        ? { big, backdrop: 'floor', name: `${event.name} decor`, what: 'Here for the season. Tap one to see it.', actions: [button('All decor', 'btn', () => { shopEvent = null; shopSig = ''; renderShop(); })] }
        : { big, backdrop: 'floor', preview: big ? undefined : room, name: 'Decor for the burrow', what: 'Tap something to see it. What you buy waits in storage until you put it out.', actions: [button('Arrange the burrow', 'btn', () => goTab('shop', { arrange: true }))] };
    }
    case 'walls': return { preview: room, name: 'Walls, floors and windows', what: "Tap one to see it in her burrow. Switch back any time.", actions: [] };
    case 'wardrobe': return { big: herIn(null, null, 4, 'happy'), backdrop: 'her', name: `${pet.name}'s wardrobe`, what: 'Tap something to try it on her.', actions: [] };
    case 'toys': return { preview: { frame: 'play', label: pet.name }, name: 'Her toy box', what: 'Tap a toy to see her play with it. At home, play from Play.', actions: [] };
  }
}

function renderShop(): void {
  const s = shopUi;
  if (!s || !pet) return;
  const n = now();
  const sig = [shopCat, shopSel, shopEvent, pet.clover, pet.goal, bondLevel(pet.bond).level, dressKey(dressOf(pet)), wardrobe(pet).owned.join(), (pet.toys ?? []).join(),
    burrow.items.map((i) => `${i.id}${i.placed ? '+' : '-'}`).join(), JSON.stringify(burrow.surfaces ?? null), activeEvents(n, tz).map((e) => e.id).join()].join('|');
  s.clover.textContent = String(pet.clover);
  if (sig === shopSig) return;
  shopSig = sig;
  const goalOf = goalInfo(pet.goal);
  s.sub.textContent = goalOf && !goalOf.owned ? `Saving for the ${goalOf.name.toLowerCase()}: ${Math.min(pet.clover, goalOf.price).toLocaleString()} of ${goalOf.price.toLocaleString()}` : 'Things for her and her burrow';
  for (const c of SHOP_CATS) s.cats[c].setAttribute('aria-pressed', String(c === shopCat));

  const items = shopCat === 'decor' ? decorItems() : shopCat === 'walls' ? wallItems() : shopCat === 'wardrobe' ? wardrobeItems() : toyItems();
  const sel = items.find((i) => i.key === shopSel) ?? null;
  if (!sel) shopSel = null;

  // the display case: a live preview of her room, or the thing itself against her walls
  const shown = sel
    ? { big: sel.preview ? undefined : sel.big(), backdrop: sel.backdrop, preview: sel.preview, name: sel.name, what: sel.what, actions: sel.actions() }
    : shopIntro(items);
  const wasPlaying = shopPreview?.play;
  shopPreview = shown.preview ?? null;
  // a new toy: she starts playing with it straight away
  if (shopPreview?.play !== wasPlaying) shopPlayAt = 0;
  const stage = shopPreview ? shopStage() : shopBackdrop(shown.backdrop ?? 'floor', shown.big ?? h('span'));
  if (shopPreview) shopView!.canvas.setAttribute('aria-label', shopPreview.label);
  // tried on: a little hop
  if (!shopPreview && shown.backdrop === 'her' && sel) stage.classList.add('hop');
  const status = !sel ? null
    : sel.state === 'locked' ? h('p', { class: 'shop-why' }, img(padlock(), 2), sel.locked ?? 'Not yet.')
      : sel.state === 'saving' ? h('p', { class: 'shop-why' }, priceTag(sel.price), ` · ${(sel.price - pet.clover).toLocaleString()} more to go`)
        : sel.state === 'buy' || !sel.note ? null : h('p', { class: 'shop-why owned', text: `✓ ${sel.note}` });
  const focusKey = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-key]')?.dataset.key
    ?? (s.display.contains(document.activeElement) ? 'display' : null);
  s.display.replaceChildren(
    stage,
    h('div', { class: 'shop-info' },
      h('h2', { text: shown.name }),
      h('p', { class: 'meta', text: shown.what }),
      status,
      shown.actions.length ? h('div', { class: 'shop-acts' }, ...shown.actions) : null));

  // the cards, in sections, in the order they came
  const sections = new Map<string, ShopItem[]>();
  for (const it of items) sections.set(it.section, [...(sections.get(it.section) ?? []), it]);
  const order = ['In storage', 'For sale', 'Her toys', 'In the burrow', 'Walls', 'Floors', 'Windows', 'On her head', 'Round her neck', 'Opens later'];
  const kids: Node[] = [];
  for (const name of [...sections.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const list = sections.get(name)!;
    // for sale: cheapest first
    if (name === 'For sale' || name === 'Opens later') list.sort((a, b) => a.price - b.price);
    kids.push(h('h3', { class: 'shop-section', text: name }), h('div', { class: 'shop-grid' }, ...list.map((it) => shopCard(it))));
  }
  if (!items.length) kids.push(h('p', { class: 'quiet', text: 'Nothing here just now.' }));
  s.grid.replaceChildren(...kids);
  fitShopScene();
  if (focusKey === 'display') (s.display.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  else if (focusKey) s.grid.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

function shopCard(it: ShopItem): HTMLButtonElement {
  const on = it.key === shopSel;
  const foot = it.state === 'locked' ? h('span', { class: 'pr locked' }, img(padlock(), 1), 'Locked')
    : it.note ? h('span', { class: `pr ${it.state === 'place' ? '' : 'mine'}`.trim(), text: it.note })
      : priceTag(it.price);
  const label = `${it.name}. ${it.state === 'locked' ? 'Locked' : it.note ?? `${it.price} clover${it.state === 'saving' ? ', not enough yet' : ''}`}.`;
  const b = h('button', { class: `shop-card ${it.state}`, type: 'button', 'aria-pressed': String(on), 'aria-label': label, 'data-key': it.key },
    it.limited && it.state !== 'owned' && it.state !== 'wearing' ? h('span', { class: 'tag', text: 'Limited' }) : null,
    pet.goal === it.key ? h('span', { class: 'tag goal', text: 'Goal' }) : null,
    h('span', { class: 'art' }, it.card()),
    h('span', { class: 'nm', text: it.name }),
    foot);
  b.addEventListener('click', () => {
    shopSel = on ? null : it.key;
    play('flip');
    renderShop();
  });
  return b;
}

// ------------------------------------------------------------------ live sheets

/**
 * A sheet whose contents rebuild in place (after planting, buying, wearing),
 * keeping focus on the same button where it can.
 */
function openLiveSheet(build: (close: () => void, redraw: () => void) => Node[]): void {
  openSheet((close) => {
    const body = h('div', { class: 'sheet-body' });
    const redraw = () => {
      const buttons = [...body.querySelectorAll('button')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      body.replaceChildren(...build(close, redraw));
      if (at >= 0) {
        const again = [...body.querySelectorAll('button')];
        (again[Math.min(at, again.length - 1)] as HTMLButtonElement | undefined)?.focus();
      }
      render();
    };
    body.append(...build(close, redraw));
    return [body];
  });
}

function pill(text: string, cls = ''): HTMLElement {
  return h('span', { class: `pill ${cls}`.trim(), text });
}

// ------------------------------------------------------------------ garden

const CROP_ART: Record<CropId, ItemArt> = { berry: 'strawberry', golden: 'golden', sprout: 'clover' };

function plotSprite(crop: CropId | null, st: 0 | 1 | 2 | 3): Sprite {
  const key = `p:${crop}:${st}`;
  let s = spriteCache.get(key);
  if (!s) { s = toSprite(drawPlot(crop ? CROP_ART[crop] : null, st)); spriteCache.set(key, s); }
  return s;
}

// ------------------------------------------------------------------ the garden room
// docs/rabbit-pets-garden.md: a second room, three areas wide. The scene is
// garden-scene.ts; what's where is garden.ts.

const AREA_NAME: Record<AreaId, string> = { patch: 'Veg patch', yard: 'Yard', meadow: 'Meadow' };
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];

/** Why bed `i` can't be bought yet: an earlier bed first, or richer soil. */
function plotLockReason(i: number): string {
  const n = plotCount(pet);
  if (i > n) return `Dig the ${ORDINAL[n]} plot first: tap its sign.`;
  const soil = plotUpgrade(i)?.requires?.soil ?? 0;
  return soil > soilLevel(pet) ? `The ${ORDINAL[i]} plot needs richer soil, level ${soil}. It's under Upgrades.` : 'Not yet.';
}

/** The next bed's offer, from tapping its sign or the patch's chip. */
function confirmPlot(i: number): void {
  const u = plotUpgrade(i);
  if (!u) return;
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite('sprout'), 4)),
    h('div', { class: 'eyebrow', text: 'The veg patch' }),
    h('h2', { text: `Dig a ${ORDINAL[i]} plot?` }),
    h('p', { text: 'One more bed to grow strawberries, golden carrots or clover sprouts in.' }),
    h('div', { class: 'actions-col' },
      button(pet.clover >= u.price ? `Dig it for ${u.price} clover` : `${u.price} clover: ${u.price - pet.clover} more to go`, 'btn primary', () => {
        const r = buyUpgrade(pet, u.id);
        if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? moreClover(u.price) : plotLockReason(i)); return; }
        pet = r.state;
        savePet();
        play('gift');
        haptic('success');
        toast(`The ${ORDINAL[i]} plot is dug. What shall we grow?`);
        goal();
        close();
        gardenScene?.burst('sparkle', 4, performance.now(), { x: PLOT_SPOTS[i]!.x, y: PLOT_SPOTS[i]!.y - 6 });
        gardenSig = '';
        renderGarden();
      }),
      button('Not now', 'btn', close)),
  ]);
}

interface GardenUi {
  nodes: Node[];
  title: HTMLElement;
  sub: HTMLElement;
  clover: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  chips: HTMLElement;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  dots: HTMLButtonElement[];
  /** The big Collect button over the yard, while clover is waiting. */
  claim: HTMLButtonElement;
  moodline: HTMLElement;
  acts: HTMLElement;
  /** Send her foraging, in every area; it counts down while she's out. */
  forage: HTMLButtonElement;
}

/** Which scene is drawn: the garden's while on the Garden tab, else the burrow's. */
let room: 'burrow' | 'garden' = 'burrow';
let area: AreaId = 'patch';
let gardenUi: GardenUi | null = null;
let gardenScene: GardenScene | null = null;

/** An area you have to pay to walk into, until you have: the meadow, behind its gate. */
const gated = (a: AreaId): boolean => a === 'meadow' && !hasUpgrade(pet, 'meadow');

/** Walk to an area; one still to pay for offers itself instead, and you walk in once it's open. */
function goArea(a: AreaId): void {
  if (a === area) return;
  if (gated(a)) { confirmMeadow(() => goArea(a)); return; }
  area = a;
  play('flip');
  renderGarden();
}

function buildGardenScreen(): GardenUi {
  const title = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  const canvas = h('canvas', { role: 'img', 'aria-label': 'The garden' });
  const chips = h('div', { class: 'float-chips' });
  const left = h('button', { type: 'button', class: 'area-arrow left' });
  const right = h('button', { type: 'button', class: 'area-arrow right' });
  left.addEventListener('click', () => goArea(AREAS[Math.max(0, AREAS.indexOf(area) - 1)]!));
  right.addEventListener('click', () => goArea(AREAS[Math.min(AREAS.length - 1, AREAS.indexOf(area) + 1)]!));
  const dots = AREAS.map((a) => {
    const b = h('button', { type: 'button', class: 'area-dot', 'aria-label': AREA_NAME[a] }, h('span'));
    b.addEventListener('click', () => goArea(a));
    return b;
  });
  const claim = h('button', { type: 'button', class: 'yard-claim', hidden: true });
  claim.addEventListener('click', () => collectYard(claim));
  const stage = h('main', { class: 'stage garden-stage' }, canvas, chips, left, right, claim, h('nav', { class: 'area-dots', 'aria-label': 'Areas of the garden' }, ...dots));
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite' });
  const acts = h('div', { class: 'actions' });
  const header = h('header', { class: 'hud' },
    h('div', { class: 'hud-top' },
      h('div', { class: 'who' }, title, sub),
      cloverChip(clover)));
  const panel = h('section', { class: 'panel' }, moodline, acts);
  // its label turns into the countdown while she's out; tap it then to call her home
  const forage = actButton('Forage', 'basket', () => openForage());

  gardenScene = new GardenScene(canvas);
  new ResizeObserver(() => layoutGarden()).observe(stage);
  wireGardenInput(canvas);
  return { nodes: [header, stage, panel], title, sub, clover, stage, canvas, chips, left, right, dots, claim, moodline, acts, forage };
}

function layoutGarden(): void {
  if (!gardenUi || !gardenScene || room !== 'garden') return;
  gardenScale = fitGarden(gardenUi.stage, gardenUi.canvas, gardenScene);
  // the arrows sit on the path, the way out of every area (the ground is on the canvas's floor)
  const c = gardenUi.canvas;
  const y = c.offsetTop + c.offsetHeight - (STRIP_H - GROUND.pathY - GROUND.pathH / 2) * gardenScale;
  for (const b of [gardenUi.left, gardenUi.right]) b.style.top = `${Math.round(y)}px`;
}

let gardenScale = 1;
/** fitScene for a garden: its canvas has a spare column on the right for the sub-pixel nudge. */
function fitGarden(stageEl: HTMLElement, el: HTMLCanvasElement, gs: GardenScene): number {
  const scale = fitScene(stageEl, el, gs as unknown as Scene);
  el.style.width = `${el.width * scale}px`;
  return scale;
}

/** Shift a garden canvas by the camera's fraction of a pixel, in screen pixels, so slides don't step. */
function nudgeGarden(el: HTMLCanvasElement, gs: GardenScene, scale: number): void {
  const x = -Math.round(gs.subX * scale * devicePixelRatio) / devicePixelRatio;
  const t = x ? `translateX(${x}px)` : '';
  if (el.style.transform !== t) el.style.transform = t;
}

function gardenModel(n: number): GardenModel {
  const w = today(n);
  return {
    pet, nowMs: n, area, season: w.season, weather: w.weather, night: isNight(n, tz), moon: moonPhase(n),
    coat: pet.coat, dress: dressOf(pet), asleep: isAsleep(pet, n, tz), absent: isOut(pet, n) || away(), meadowOpen: hasUpgrade(pet, 'meadow'),
    items: meadowItems(burrow), selected: arranging ? gardenSel : null,
    // everyone who came by today sits in the meadow, if there's somewhere to sit
    guests: visitTurns.map(({ visit, data: d }) => ({ id: visit.from.uuid, coat: d.coat, dress: { head: d.head, neck: d.neck, ears: d.ears } })),
    friends: mutualFriends(pet),
  };
}

function drawGardenFrame(t: number): void {
  if (!gardenScene || !pet || !gardenUi) return;
  gardenScene.draw(gardenModel(now()), t);
  nudgeGarden(gardenUi.canvas, gardenScene, gardenScale);
}

/** The garden follows a sideways drag and settles on an area when let go; a short drag is a tap. */
function wireGardenInput(canvas: HTMLCanvasElement): void {
  // `panning` once the drag is clearly sideways; `trail` is recent points, for the speed at release
  let start: { x: number; y: number; panning: boolean; trail: { x: number; t: number }[] } | null = null;
  let drag: { item: PlacedItem; dx: number; dy: number } | null = null;
  const strip = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return gardenScene!.toRoom(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (arranging && gardenScene) {
      const p = strip(e);
      const item = pieceAt(p.x, p.y);
      gardenSel = item?.uid ?? null;
      gardenSig = '';
      renderGarden();
      if (item) { drag = { item, dx: item.x - p.x, dy: item.y - p.y }; canvas.setPointerCapture(e.pointerId); }
      return;
    }
    start = { x: e.clientX, y: e.clientY, panning: false, trail: [{ x: e.clientX, t: e.timeStamp }] };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (start && gardenScene) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.panning && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        // pick up from here, so the view doesn't leap the 8px
        start.panning = true;
        start.x = e.clientX;
        gardenScene.grab();
      }
      if (start.panning) {
        gardenScene.dragTo((e.clientX - start.x) / gardenScale);
        start.trail.push({ x: e.clientX, t: e.timeStamp });
        if (start.trail.length > 6) start.trail.shift();
      }
      return;
    }
    if (!drag) return;
    const def = byId(drag.item.id);
    if (!def) return;
    const p = strip(e);
    Object.assign(drag.item, clampToZone(def.zone, p.x + drag.dx, p.y + drag.dy));
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag) { drag = null; saveBurrow(); return; }
    if (!start) return;
    const s = start;
    start = null;
    if (s.panning && gardenScene) {
      // the finger's speed over the last ~100ms, in scene px/ms
      const recent = s.trail.filter((p) => e.timeStamp - p.t < 100);
      const first = recent[0] ?? s.trail[s.trail.length - 1]!;
      const dt = e.timeStamp - first.t;
      const v = dt > 0 ? (e.clientX - first.x) / dt / gardenScale : 0;
      const to = gardenScene.release(area, v, performance.now());
      if (to !== area) goArea(to);
      return;
    }
    gardenTap(e);
  });
  canvas.addEventListener('pointercancel', () => {
    if (start?.panning) gardenScene?.release(area, 0, performance.now());
    start = null;
    if (drag) { drag = null; saveBurrow(); }
  });
  // Arranging by keyboard, as in Decorate: N and P pick a piece, arrows move it
  // (Shift for bigger steps), F flips it, Delete puts it away.
  canvas.addEventListener('keydown', (e) => {
    if (!arranging || e.ctrlKey || e.metaKey || e.altKey) return;
    const items = meadowItems(burrow);
    if (e.key === 'n' || e.key === 'p') {
      if (!items.length) return;
      e.preventDefault();
      const at = items.findIndex((i) => i.uid === gardenSel);
      const step = e.key === 'n' ? 1 : -1;
      const next = items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]!;
      gardenSel = next.uid;
      gardenSig = '';
      renderGarden();
      toast(`${byId(next.id)?.name ?? 'Piece'} selected. Arrow keys move it, F flips it, Delete puts it away.`);
      return;
    }
    const sel = items.find((i) => i.uid === gardenSel);
    const def = sel && byId(sel.id);
    if (!sel || !def) return;
    const step = e.shiftKey ? 4 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = d[e.key];
    if (mv) { e.preventDefault(); Object.assign(sel, clampToZone(def.zone, sel.x + mv[0], sel.y + mv[1])); saveBurrow(); }
    else if (e.key === 'f') { e.preventDefault(); sel.flip = !sel.flip; saveBurrow(); play('flip'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); putAwayMeadow(sel); }
    else if (e.key === 'Escape') { gardenSel = null; gardenSig = ''; renderGarden(); }
  });
}

function gardenTap(e: { clientX: number; clientY: number }): void {
  if (!gardenUi || !gardenScene) return;
  const r = gardenUi.canvas.getBoundingClientRect();
  const sx = ((e.clientX - r.left) / r.width) * gardenUi.canvas.width;
  const sy = ((e.clientY - r.top) / r.height) * gardenUi.canvas.height;
  const { x, y } = gardenScene.toRoom(sx, sy);
  const n = now();
  const hit = hitTest(pet, x, y, n);
  if (!hit) {
    if (areaAt(x) !== 'meadow') return;
    if (gated('meadow')) { confirmMeadow(() => goArea('meadow')); return; }
    const piece = pieceAt(x, y);
    const def = piece ? byId(piece.id) : undefined;
    if (def) toast(def.seats ? `${def.name}: visiting friends sit here.` : def.id === 'friendtree' ? `${def.name}: a fruit for each friend you visit back and forth.` : `${def.name}.`);
    return;
  }
  if (hit.kind === 'plot') {
    if (hit.state === 'locked') { if (plotOffer(pet, hit.index) === 'next') confirmPlot(hit.index); else toast(plotLockReason(hit.index)); }
    else if (hit.state === 'empty') openSeeds(hit.index);
    // picked, the bed's empty: straight on to what to grow next, the same again first
    else if (hit.state === 'ready') { const crop = pickPlot(hit.index); if (crop) openSeeds(hit.index, crop); }
    else {
      const p = plots(pet)[hit.index]!;
      toast(`${CROPS[p.crop].name}: ready in ${fmtDuration(p.readyAtMs - n)}.`);
    }
  } else if (hit.kind === 'building') {
    if (hit.state === 'owned') {
      if (stored(pet, n) >= 1) collectYard(gardenUi?.claim.hidden ? undefined : gardenUi?.claim);
      else toast(`${BUILDINGS[hit.id].name}: makes ${Math.round(BUILDINGS[hit.id].perHour * 24)} clover a day.`);
    } else if (hit.state === 'free') confirmBuild(hit.id);
    else { const q = BUILDINGS[hit.id].requires!; toast(`${BUILDINGS[hit.id].name}s come after ${q.count} ${q.building === 'patch' ? 'clover patches' : 'beehives'}.`); }
  } else if (hit.state === 'owned') toast(`The shed holds ${storageHours(pet)} hours of clover.`);
  else if (hit.state === 'free') confirmShed();
  else toast('The shed comes after 3 clover patches.');
  renderGarden();
}

/** Pick a ripe bed. `quiet`: no toast (Pick & replant says it all in one). Returns what was picked. */
function pickPlot(i: number, quiet = false): CropId | null {
  const r = harvest(pet, i, now());
  if (!r.ok) return null;
  pet = r.state;
  savePet();
  play('harvest');
  haptic('success');
  const spot = PLOT_SPOTS[i];
  if (spot) gardenScene?.burst(CROP_ART[r.crop], 2, performance.now(), { x: spot.x, y: spot.y - 14 });
  const got = r.crop === 'sprout' ? `+${r.clover} clover.` : r.crop === 'berry' ? `${cropYield(pet, 'berry')} strawberries, in the pantry.`
    : cropYield(pet, 'golden') > 1 ? 'Two golden carrots, in the pantry. She always loves these.' : 'A golden carrot, in the pantry. She always loves these.';
  if (!quiet) toast(`Picked! ${got}`);
  note(`First ${CROPS[r.crop].name.toLowerCase()} from the garden.`, CROP_ART[r.crop], `harvest:${r.crop}`);
  if (r.crop === 'sprout') goal('sprout');
  queueReconcile();
  renderGarden();
  return r.crop;
}

/** Pick every ripe bed and plant each with the same again, in one go. A bed whose seeds she can't afford is left empty. */
function pickAll(): void {
  const n = now();
  const ready = plots(pet).map((p, i) => (p && p.readyAtMs <= n ? i : -1)).filter((i) => i >= 0);
  const clover = pet.clover;
  let replanted = 0;
  const empty: string[] = [];
  for (const i of ready) {
    const crop = pickPlot(i, true);
    if (!crop) continue;
    const r = plant(pet, i, crop, now());
    if (r.ok) { pet = r.state; replanted++; } else empty.push(CROPS[crop].name.toLowerCase());
  }
  if (!ready.length) return;
  savePet();
  queueReconcile();
  renderGarden();
  const got = pet.clover - clover;
  const beds = ready.length === 1 ? 'the bed' : `${ready.length} beds`;
  toast(`Picked ${beds}${got > 0 ? `: +${got} clover` : ''}.${replanted ? ` ${replanted === ready.length ? 'Replanted' : `Replanted ${replanted}`}, the same again.` : ''}${empty.length ? ` Not enough clover to replant the ${empty[0]}.` : ''}`);
}

/** What to plant in plot `i`. `last`: what was just picked there, offered first as the same again. */
function openSeeds(i: number, last?: CropId): void {
  openLiveSheet((close) => {
    const order = (Object.keys(CROPS) as CropId[]).sort((a, b) => Number(b === last) - Number(a === last));
    const seeds = order.map((c) => {
      const info = CROPS[c];
      const s = itemSprite(CROP_ART[c]);
      const b = h('button', {
        class: 'seed', type: 'button',
        'aria-label': `${info.name}. ${info.seedCost ? `${info.seedCost} clover` : 'Free'}. Ready in ${fmtDuration(growMs(pet, c))}. Gives ${yields(c)}.`,
      },
      img(s, fitScale(s, 26)),
      h('span', { class: 'nm', text: c === last ? `${info.name} again` : info.name }),
      h('span', { class: 'meta', text: `${fmtDuration(growMs(pet, c))} · ${yields(c)}` }),
      info.seedCost ? h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(info.seedCost)) : h('span', { class: 'pr', text: 'Free' }));
      b.addEventListener('click', () => {
        const r = plant(pet, i, c, now());
        if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? 'Not enough clover for those seeds.' : 'That plot is busy.'); return; }
        pet = r.state;
        savePet();
        play('place');
        const spot = PLOT_SPOTS[i];
        if (spot) gardenScene?.burst('sparkle', 2, performance.now(), { x: spot.x, y: spot.y - 8 });
        toast(`Planted. Ready in ${fmtDuration(growMs(pet, c))}.`);
        queueReconcile();
        close();
        renderGarden();
      });
      if (pet.clover < info.seedCost) setOff(b, moreClover(info.seedCost));
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: `Plot ${i + 1}` }),
      h('h2', { text: 'What shall we grow?' }),
      h('div', { class: 'seeds', role: 'group', 'aria-label': `Plant in plot ${i + 1}` }, ...seeds),
      h('div', { class: 'actions-col' }, button('Not now', 'btn', close)),
    ];
  });
}

/** "Makes 6 clover a day": what the next one of a kind brings. (No payback: late in the yard it reads as "not worth it".) */
function paysLine(id: BuildingId): string {
  return `Makes ${Math.round(payback(pet, id).perDay)} clover a day`;
}

/** Build the next of a kind, from its "+" spot. */
function confirmBuild(id: BuildingId): void {
  const b = BUILDINGS[id];
  const price = nextPrice(pet, id);
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite(id), 4)),
    h('div', { class: 'eyebrow', text: 'The yard' }),
    h('h2', { text: `Build ${article(b.name)}?` }),
    h('p', { text: `${paysLine(id)}, even while you're away. You have ${countOf(pet, id)} of ${b.max}.` }),
    h('div', { class: 'actions-col' },
      button(pet.clover >= price ? `Build for ${price} clover` : `${price} clover: not enough yet`, 'btn primary', () => {
        const r = buyBuilding(pet, id, now());
        if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? 'Not enough clover yet.' : 'Not yet.'); return; }
        pet = r.state;
        savePet();
        play('place');
        haptic('success');
        toast(`${b.name} built. It makes clover every hour.`);
        note(`Built ${article(b.name)} in the yard.`, 'clover', `yard:${id}`);
        close();
        renderGarden();
      }),
      button('Not now', 'btn', close)),
  ]);
}

function confirmShed(): void {
  const price = shedPrice(pet);
  if (price === null) return;
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite('shed'), 4)),
    h('div', { class: 'eyebrow', text: 'The yard' }),
    h('h2', { text: 'Build the shed?' }),
    h('p', { text: `The yard's storage holds ${storageHours(pet) + 12} hours of clover, not ${storageHours(pet)}, so a day away wastes nothing.` }),
    h('div', { class: 'actions-col' },
      button(pet.clover >= price ? `Build for ${price} clover` : `${price} clover: not enough yet`, 'btn primary', () => {
        const r = buyShed(pet, now());
        if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
        pet = r.state;
        savePet();
        play('place');
        toast('The shed holds more clover now.');
        close();
        renderGarden();
      }),
      button('Not now', 'btn', close)),
  ]);
}

/** Upgrades and the yard's list, a tab each; it opens on the one for where you are. */
function openGardenUpgrades(tab: 'garden' | 'yard' = area === 'yard' ? 'yard' : 'garden'): void {
  openLiveSheet((close, redraw) => {
    const redrawAll = () => { redraw(); renderGarden(); };
    const tabs = (['garden', 'yard'] as const).map((t) => {
      const b = h('button', { type: 'button', class: 'seg-tab', 'aria-pressed': String(t === tab), text: t === 'garden' ? 'Garden' : 'Yard' });
      b.addEventListener('click', () => { if (tab !== t) { tab = t; play('flip'); redraw(); } });
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: 'The garden' }),
      h('h2', { text: 'Upgrades' }),
      h('nav', { class: 'seg', 'aria-label': 'Upgrades for' }, ...tabs),
      tab === 'garden' ? gardenUpgrades(redrawAll) : yardSection(redrawAll),
      h('div', { class: 'actions-col' }, button('Done', 'btn primary', close)),
    ];
  });
}

/** A garden action. `off`: why it can't be used now (see setOff), or nothing if it can. */
function actButton(label: string, art: ItemArt, onClick: () => void, opts: { badge?: string; off?: string | false } = {}): HTMLButtonElement {
  const s = itemSprite(art);
  const b = h('button', { class: 'act', type: 'button' }, img(s, fitScale(s, 30)), h('span', { text: label }));
  if (opts.badge) b.append(h('span', { class: 'badge', text: opts.badge }));
  b.addEventListener('click', onClick);
  if (opts.off) setOff(b, opts.off);
  return b;
}

let gardenSig = '';
function renderGarden(): void {
  if (!gardenUi || room !== 'garden' || !pet) return;
  const n = now();
  const w = today(n);
  const g = gardenUi;
  const i = AREAS.indexOf(area);
  g.title.textContent = `${pet.name}'s garden`;
  g.sub.textContent = `${AREA_NAME[area]} · ${weatherName(w.weather, isNight(n, tz))}`;
  if (!cloverCounting) g.clover.textContent = String(pet.clover);
  g.left.hidden = i === 0 || arranging;
  g.right.hidden = i === AREAS.length - 1 || arranging;
  const prev = AREAS[i - 1], next = AREAS[i + 1];
  // the next area still to pay for: a padlock on its arrow, and the camera won't go past this one
  const shut = !!next && gated(next);
  if (gardenScene) gardenScene.reach = gated('meadow') ? 'yard' : 'meadow';
  if (g.right.classList.contains('locked') !== shut) {
    g.right.classList.toggle('locked', shut);
    g.right.replaceChildren(...(shut ? [img(padlock(), 3)] : []));
  }
  g.left.setAttribute('aria-label', prev ? `Walk to the ${AREA_NAME[prev].toLowerCase()}` : '');
  g.right.setAttribute('aria-label', !next ? '' : shut ? `The ${AREA_NAME[next].toLowerCase()} is shut: open it for ${MEADOW.gate} clover` : `Walk to the ${AREA_NAME[next].toLowerCase()}`);
  g.dots.forEach((d, j) => {
    d.setAttribute('aria-current', String(j === i));
    d.classList.toggle('locked', gated(AREAS[j]!));
    d.setAttribute('aria-label', gated(AREAS[j]!) ? `${AREA_NAME[AREAS[j]!]} (shut)` : AREA_NAME[AREAS[j]!]);
  });

  const ps = plots(pet);
  const ready = ps.filter((p) => p && p.readyAtMs <= n).length;
  const empty = ps.findIndex((p) => !p);
  const growing = ps.filter((p) => p && p.readyAtMs > n).sort((a, b) => a!.readyAtMs - b!.readyAtMs)[0];
  const inYard = Math.floor(stored(pet, n));
  const asleep = isAsleep(pet, n, tz);

  let line: string;
  const chips: string[] = [];
  if (area === 'patch') {
    line = ready ? `${ready === 1 ? 'A crop is' : `${ready} crops are`} ready to pick.` : empty >= 0 ? 'A bed is free. What shall we grow?' : 'Everything is growing nicely.';
    if (growing) chips.push(`${CROPS[growing.crop].name} · ${fmtDuration(growing.readyAtMs - n)}`);
  } else if (area === 'yard') {
    line = perHour(pet)
      ? `The yard makes ${Math.round(perHour(pet) * 24)} clover a day. Tap a + to build.`
      : 'Tap a + to build a clover patch. It grows clover all day.';
    chips.push(`${countOf(pet, 'patch')} of ${BUILDINGS.patch.max} patches`, `${countOf(pet, 'hive')} of ${BUILDINGS.hive.max} hives`);
  } else {
    line = meadowLine();
  }
  // "she", not her name, to keep it short (the chip and the Collect button say what's waiting)
  if (asleep) line = `She's asleep. ${line}`;
  else if (isOut(pet, n)) line = `She's out foraging. ${line}`;
  if (!decorating) setLine(g.moodline, line);
  // Forage counts down in place of its label while she's out
  const outFor = isOut(pet, n) ? tripOf(pet)!.endsAtMs - n : 0;
  const forageLabel = g.forage.querySelector('span');
  const forageText = outFor ? fmtCountdown(outFor) : 'Forage';
  if (forageLabel && forageLabel.textContent !== forageText) forageLabel.textContent = forageText;
  g.forage.classList.toggle('counting', !!outFor);
  g.forage.setAttribute('aria-label', outFor ? `Out foraging, home in ${fmtLong(outFor)}` : 'Forage');

  const sig = [area, ready, empty, inYard, asleep, pet.clover, chips.join(), arranging, gardenSel, hasUpgrade(pet, 'meadow'), meadowItems(burrow).length].join('|');
  if (sig === gardenSig) return;
  gardenSig = sig;
  g.chips.replaceChildren(...chips.map((c) => h('div', { class: 'tchip', text: c })));
  // the next bed's price, where you can see it: tap for the offer, as on its sign
  const nextBed = plotCount(pet);
  const nextUp = area === 'patch' && !arranging && plotOffer(pet, nextBed) === 'next' ? plotUpgrade(nextBed) : undefined;
  if (nextUp) {
    const chip = h('button', { type: 'button', class: `tchip plot-offer${pet.clover >= nextUp.price ? ' ready' : ''}`, 'aria-label': `Dig the ${ORDINAL[nextBed]} plot for ${nextUp.price} clover` },
      h('span', { text: `Plot ${nextBed + 1}` }), img(itemSprite('clover'), 1), h('span', { text: String(nextUp.price) }));
    chip.addEventListener('click', () => confirmPlot(nextBed));
    g.chips.append(chip);
  }
  const showClaim = area === 'yard' && inYard >= 1 && !arranging;
  if (showClaim) {
    g.claim.replaceChildren(img(itemSprite('clover'), 3), h('span', { class: 'lbl', text: 'Collect' }), h('span', { class: 'amt', text: `+${inYard}` }));
    g.claim.setAttribute('aria-label', `Collect ${inYard} clover`);
  }
  if (!g.claim.classList.contains('popping')) g.claim.hidden = !showClaim;
  // (Upgrades has the yard's buildings too; Forage goes at the end of every area's row but while arranging)
  const upgrades = actButton('Upgrades', 'leafy', () => openGardenUpgrades());
  const buttons = area === 'patch'
    ? [actButton('Pick & replant', 'strawberry', () => pickAll(), { badge: ready ? String(ready) : undefined, off: !ready && "Nothing's ripe yet. Tap a plot to see how long." }),
      actButton('Plant', 'leafy', () => openSeeds(empty), { off: empty < 0 && 'Every plot is growing something.' }), upgrades]
    : area === 'yard'
      ? [actButton('Collect', 'clover', () => { collectYard(gardenUi?.claim.hidden ? undefined : gardenUi?.claim); renderGarden(); }, { badge: inYard >= 1 ? String(inYard) : undefined, off: inYard < 1 && (perHour(pet) ? 'Nothing to collect yet. The yard fills up every hour.' : 'Build a clover patch first: tap a + in the yard.') }),
        actButton('Build', 'shed', () => openGardenUpgrades())]
      : meadowButtons();
  if (!arranging) buttons.push(g.forage);
  g.acts.style.gridTemplateColumns = `repeat(${buttons.length}, minmax(0, 1fr))`;
  g.acts.replaceChildren(...buttons);
  g.canvas.setAttribute('aria-label', area === 'patch'
    ? `The veg patch: ${ps.length} plots, ${ready} ready to pick.`
    : area === 'yard' ? `The yard: ${countOf(pet, 'patch')} clover patches, ${countOf(pet, 'hive')} beehives, ${countOf(pet, 'log')} mushroom logs, ${inYard} clover waiting.`
      : hasUpgrade(pet, 'meadow') ? `The meadow: ${meadowItems(burrow).map((i) => byId(i.id)?.name).filter(Boolean).join(', ') || 'empty grass'}.${arranging ? ' Drag a piece to move it. With the keyboard: N and P pick a piece, arrow keys move it (Shift for bigger steps), F flips it, Delete puts it away.' : ''}` : 'The meadow, behind its gate.');
}

// ------------------------------------------------------------------ the meadow
// The garden's third area: outdoor decor (docs/rabbit-pets-garden.md §6).
// Visiting friends sit at its chairs and tea corner.

let arranging = false;
let gardenSel: string | null = null;

/** What a meadow piece does besides look nice, for the shop. */
function meadowWhat(d: DecorDef): string {
  if (d.seats) return 'Visiting friends sit here.';
  if (d.id === 'friendtree') return 'A fruit for each friend you visit back and forth.';
  return d.glow ? 'Glows at night.' : 'Just for looks.';
}

/** Bring pet.meadow in line with what's placed in the meadow; saves only if it changed. */
function syncMeadow(): void {
  const next = setMeadow(pet, meadowPieces(burrow));
  if (next === pet) return;
  pet = next;
  savePet();
}

/** The gate's offer; `then`, once it's open (walking in, when that's what you were doing). */
function confirmMeadow(then?: () => void): void {
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite('sunflowers'), 4)),
    h('div', { class: 'eyebrow', text: 'The meadow' }),
    h('h2', { text: 'Open the meadow?' }),
    h('p', { text: `Past the gate is a meadow for outdoor decor. Some pieces help the yard: sunflowers bring bees to the hives, a birdbath keeps the clover patches green.` }),
    h('div', { class: 'actions-col' },
      button(pet.clover >= MEADOW.gate ? `Open it for ${MEADOW.gate} clover` : `${MEADOW.gate} clover: not enough yet`, 'btn primary', () => {
        const r = buyUpgrade(pet, 'meadow');
        if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
        pet = r.state;
        savePet();
        play('gift');
        haptic('success');
        toast('The gate swings open. The meadow is yours.');
        note('Opened the meadow.', 'flower', 'meadow');
        goal('meadow');
        close();
        gardenSig = '';
        renderGarden();
        then?.();
      }),
      button('Not now', 'btn', close)),
  ]);
}

/** Somewhere free on the lawn (or the fence) for a piece coming out of the shop or storage. */
function freeSpot(def: DecorDef): { x: number; y: number } {
  const others = meadowItems(burrow);
  const tries = def.zone === 'fence'
    ? [247, 226, 268, 216, 278].map((x) => ({ x, y: ZONES.fence.y }))
    // left and back first: she sits on the right, at the front
    : [[214, 100], [238, 100], [226, 84], [252, 84], [214, 114], [240, 114], [246, 66], [270, 68], [210, 70], [262, 100]].map(([x, y]) => ({ x: x!, y: y! }));
  return tries.find((p) => others.every((o) => Math.abs(o.x - p.x) > 12 || Math.abs(o.y - p.y) > 10)) ?? tries[0]!;
}

function putOut(item: PlacedItem): void {
  const def = byId(item.id);
  if (!def) return;
  Object.assign(item, clampToZone(def.zone, ...Object.values(freeSpot(def)) as [number, number]), { placed: true });
  saveBurrow();
  syncMeadow();
}

/** Everything the meadow can have: buy it, put it out, or see it's out. */
function openMeadowShop(): void {
  openLiveSheet((close, redraw) => {
    const rows = CATALOG.filter((d) => isOutdoor(d)).sort((a, b) => a.price - b.price).map((def) => {
      const mine = burrow.items.find((i) => i.id === def.id);
      const what = meadowWhat(def);
      const s = itemSprite(def.art);
      let right: HTMLElement;
      if (mine?.placed) right = pill('Out', 'soft');
      else if (mine) {
        right = button('Put out', 'btn small', () => { putOut(mine); play('place'); redraw(); renderGarden(); });
      } else {
        right = h('button', { class: 'btn small', type: 'button', 'aria-label': `${def.name}. Buy for ${def.price} clover.` },
          img(itemSprite('clover'), 1), String(def.price));
        right.addEventListener('click', () => {
          const paid = spendClover(pet, def.price);
          if (!paid) { play('nope'); toast('Not enough clover yet.'); return; }
          pet = paid;
          savePet();
          const item: PlacedItem = { uid: newUid(), id: def.id, x: 0, y: 0, flip: false, placed: false };
          burrow.items.push(item);
          putOut(item);
          play('clover');
          haptic('success');
          toast(`${def.name} out in the meadow.`);
          note(`Got ${article(def.name)} for the meadow.`, 'flower', `decor:${def.id}`);
          redraw();
          renderGarden();
        });
        if (pet.clover < def.price) setOff(right as HTMLButtonElement, moreClover(def.price));
      }
      return h('div', { class: 'shop-row' }, h('span', { class: 'ico' }, img(s, fitScale(s, 28))),
        h('span', { class: 'txt' }, h('span', { class: 'nm', text: def.name }), h('span', { class: 'sub', text: what })), right);
    });
    return [
      h('div', { class: 'eyebrow', text: 'The meadow' }),
      h('h2', { text: 'For the meadow' }),
      h('p', { class: 'note', text: 'Where each piece stands is up to you: Arrange to move things. Friends who visit sit at the chairs and the tea corner.' }),
      h('div', { class: 'shop-list' }, ...rows),
      h('div', { class: 'actions-col' }, button('Done', 'btn primary', close)),
    ];
  });
}

/** The meadow piece under a strip point, front-most first. */
function pieceAt(x: number, y: number): PlacedItem | null {
  if (!gardenScene) return null;
  const items = meadowItems(burrow);
  const order = [
    ...items.filter((i) => byId(i.id)?.zone === 'lawn').sort((a, b) => b.y - a.y),
    ...items.filter((i) => byId(i.id)?.zone === 'fence'),
  ];
  for (const i of order) {
    const b = pieceBox(i, gardenScene.pieceArt(i));
    if (x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1) return i;
  }
  return null;
}

function startArranging(): void {
  arranging = true;
  gardenSel = null;
  gardenSig = '';
  renderGarden();
  if (gardenUi) { gardenUi.canvas.tabIndex = 0; gardenUi.canvas.focus(); }
}

function stopArranging(): void {
  arranging = false;
  gardenSel = null;
  gardenSig = '';
  if (gardenUi) gardenUi.canvas.removeAttribute('tabindex');
  saveBurrow();
  renderGarden();
}

function putAwayMeadow(item: PlacedItem): void {
  item.placed = false;
  gardenSel = null;
  saveBurrow();
  syncMeadow();
  play('flip');
  gardenSig = '';
  renderGarden();
}

/** The meadow's panel: the gate while it's shut; shop and arranging once open. */
function meadowButtons(): HTMLButtonElement[] {
  const upgrades = actButton('Upgrades', 'leafy', () => openGardenUpgrades());
  if (!hasUpgrade(pet, 'meadow')) return [actButton('Open it', 'flower', () => confirmMeadow(), { badge: String(MEADOW.gate) }), upgrades];
  if (!arranging) {
    return [actButton('Shop', 'sunflowers', () => openMeadowShop()), actButton('Arrange', 'bench', () => startArranging(), { off: !meadowItems(burrow).length && 'Nothing out in the meadow yet. Visit the shop.' }), upgrades];
  }
  const sel = gardenSel ? burrow.items.find((i) => i.uid === gardenSel) : undefined;
  return [
    actButton('Flip', 'stones', () => { if (sel) { sel.flip = !sel.flip; saveBurrow(); play('flip'); } }, { off: !sel && 'Tap a piece first.' }),
    actButton('Put away', 'basket', () => { if (sel) putAwayMeadow(sel); }, { off: !sel && 'Tap a piece first.' }),
    actButton('Done', 'sparkle', () => stopArranging()),
  ];
}

function meadowLine(): string {
  if (!hasUpgrade(pet, 'meadow')) return `Past the gate: the meadow. Open it for ${MEADOW.gate} clover.`;
  if (arranging) return gardenSel ? 'Drag it where you like.' : 'Tap a piece to move it.';
  return meadowItems(burrow).length ? 'A lovely spot for friends to sit when they visit.' : 'Nothing in the meadow yet. Try the shop.';
}

// ------------------------------------------------------------------ toys

const TOY_ART: Record<string, ItemArt> = { ball: 'ball', yarn: 'yarn', box: 'box', tunnel: 'tunnel', swing: 'swing', ballpit: 'ballpit', maze: 'maze', kite: 'kite' };

/** Foraging: send her out for a few hours, or call her home. */
function openForage(): void {
  openSheet((close) => {
    const n = now();
    const t = tripOf(pet);
    if (t && isOut(pet, n)) {
      const hours = Math.floor((n - t.startedAtMs) / HOUR_MS);
      return [
        h('div', { class: 'eyebrow', text: 'Forage' }),
        h('h2', { text: `${pet.name} is out foraging` }),
        h('p', { text: `She's home in ${fmtDuration(t.endsAtMs - n)}. ${hours
          ? `Call her back now and she brings what she found in the ${hours === 1 ? 'first hour' : `${hours} whole hours`} she's been out.`
          : "She's only just left: call her back now and she comes home empty-handed."}` }),
        h('div', { class: 'actions-col' },
          button('Let her explore', 'btn primary', close),
          button('Call her home', 'btn', () => { close(); doAction('recall'); })),
      ];
    }
    const why = away() ? `${pet.name} is on holiday.`
      : isAsleep(pet, n) ? "She's asleep. Let her wake up first."
        : pet.needs.energy < FORAGE.minEnergy ? "She's too tired to go out. Let her nap first." : null;
    const trips = FORAGE.hours.map((hrs) => {
      const b = h('button', { class: 'seed', type: 'button' }, img(itemSprite('basket'), 2),
        h('span', { class: 'nm', text: `${hrs} hours` }),
        h('span', { class: 'meta', text: hrs === 2 ? 'A quick look round' : hrs === 4 ? 'A good wander' : 'A full basket' }));
      b.addEventListener('click', () => { close(); doAction('forage', { hours: hrs }); });
      if (why) setOff(b, why);
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: 'Forage' }),
      h('h2', { text: `Send ${pet.name} foraging` }),
      h('div', { class: 'gift-kinds' }, ...trips),
      h('p', { class: 'note', text: 'She comes home with clover, strawberries, finds for the shelf, and now and then a golden carrot: the longer she\'s out, the fuller her basket. Nobody can feed or clean her while she\'s away, so she\'ll come back hungry.' }),
      h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
    ];
  });
}

// ------------------------------------------------------------------ garden upgrades and the yard

function yields(c: CropId): string {
  if (c === 'sprout') return `${sproutClover(pet)} clover`;
  const n = cropYield(pet, c);
  return c === 'berry' ? `${n} strawberries` : n === 1 ? '1 golden carrot' : `${n} golden carrots`;
}

/** Why something can't be bought yet. */
function moreClover(price: number): string {
  return `${price - pet.clover} more clover to go.`;
}

/** The clover count in a header: a button, to how to get more. */
function cloverChip(count: HTMLElement): HTMLButtonElement {
  const b = h('button', { class: 'chip clover-chip', type: 'button', 'aria-description': 'How to get more clover' }, img(itemSprite('clover'), 2, 'Clover'), count);
  b.addEventListener('click', () => openCloverSheet());
  return b;
}

/**
 * Tapping the clover count: what's ready to collect now (with a way there),
 * what boosts her clover and by how much, and every way to earn it, with the
 * game's real numbers. There's no buying clover: it's all earned.
 */
function openCloverSheet(): void {
  goal('earn');
  openSheet((close) => {
    const n = now();
    const go = (fn: () => void) => () => { close(); fn(); };
    type Ready = [ItemArt, string, string, HTMLButtonElement];
    const ready: Ready[] = [];
    const holiday = away();
    // her gift: what it pays today, as earn() will (the streak, the rate, Supporter)
    if (giftReady(pet, n, tz) && !holiday) {
      const base = Math.min(CLOVER.giftMax, CLOVER.giftBase + CLOVER.giftStep * pet.gift.streak);
      const amt = Math.floor(base * rate(pet).total * (pet.supporter ? SUPPORTER_BONUS : 1));
      const b = button('Open', 'btn small primary', () => { doAction('gift'); b.disabled = true; b.textContent = 'Opened'; });
      ready.push(['gift', 'Her daily gift', `About +${amt} today`, b]);
    }
    const inYard = Math.floor(stored(pet, n));
    if (inYard >= 1) ready.push(['clover', `${inYard} waiting in the yard`, 'Collect it in the garden', button('Go', 'btn small', go(() => { goTab('garden'); goArea('yard'); }))]);
    const ripe = plots(pet).filter((p) => p && p.readyAtMs <= n).length;
    if (ripe) ready.push(['strawberry', ripe === 1 ? 'A crop is ready' : `${ripe} crops are ready`, 'Pick them in the garden', button('Go', 'btn small', go(() => { goTab('garden'); goArea('patch'); }))]);
    if (!holiday && !isOut(pet, n) && !isAsleep(pet, n) && pet.needs.energy >= FORAGE.minEnergy) {
      ready.push(['basket', 'She can go foraging', 'She brings home clover and finds', button('Go', 'btn small', go(() => { goTab('garden'); openForage(); }))]);
    }
    const careLeft = BOND_DAILY_CAP - pet.bondToday;
    if (!holiday && careLeft > 0) ready.push(['heart', 'Look after her', `${careLeft} more today pay +${CLOVER.perCare} each`, button('Go', 'btn small', go(() => goTab('burrow')))]);
    if (socialOn() && paidVisitsLeft() > 0) ready.push(['carrot', 'Visit a friend', `${paidVisitsLeft()} more today pay +${visitPay(pet)} each`, button('Go', 'btn small', go(() => goTab('friends')))]);
    if (starterReady(pet)) {
      const step = STARTER_STEPS.find((s) => s.step === starterStep(pet))!;
      ready.push(['star', 'Getting started', `Step ${step.step} is done: +${step.clover} to claim`, button('Claim', 'btn small primary', go(() => openStarter()))]);
    }
    const goalsDone = goalsReady(pet);
    if (goalsDone.length) {
      const sum = goalsDone.reduce((t, g) => t + g.clover, 0);
      ready.push(['star', goalsDone.length === 1 ? 'A goal is done' : `${goalsDone.length} goals are done`, `+${sum} to claim`, button('Claim', 'btn small primary', go(() => openLaterGoals()))]);
    }

    const row = (art: ItemArt, nm: string, sub: string, end?: Node) => h('li', {},
      h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 28))),
      h('span', { class: 'txt' }, h('span', { class: 'nm', text: nm }), h('span', { class: 'sub', text: sub })), end ?? null);

    // what boosts it: the same sum rate() makes, part by part
    const r = rate(pet);
    const pct = (x: number) => `+${Math.round(x * 100)}%`;
    const boosts: [ItemArt, string, string][] = [];
    if (r.bond) boosts.push(['heart', `Bond level ${bondLevel(pet.bond).level}`, pct(r.bond)]);
    if (r.sets) boosts.push(['marble', 'Collection sets', pct(r.sets)]);
    if (r.friends) boosts.push(['gift', `${bestFriends(pet)} best ${bestFriends(pet) === 1 ? 'friend' : 'friends'}`, pct(r.friends)]);
    if (pet.supporter) boosts.push(['star', 'Supporter', `+${Math.round((SUPPORTER_BONUS - 1) * 100)}% on everything`]);

    const ways: [ItemArt, string, string][] = [
      ['heart', 'Look after her', `Feed, pet, play and clean: +${CLOVER.perCare} clover each, the first ${BOND_DAILY_CAP} times a day.`],
      ['gift', 'Her daily gift', `${CLOVER.giftBase} clover, +${CLOVER.giftStep} for each day of your streak, up to ${CLOVER.giftMax}. Streak milestones pay extra.`],
      ['clover', 'The yard', 'Clover patches, beehives and mushroom logs make clover every hour, even while you’re away.'],
      ['strawberry', 'The garden', `Clover sprouts grow into ${SPROUT_CLOVER} clover or more (richer soil adds to it).`],
      ['basket', 'Foraging', 'Send her out for a few hours: she brings home clover, strawberries and finds.'],
      ['carrot', 'Friends', `+${visitPay(pet)} when you visit a friend, and when one visits you. More friends pay bonuses.`],
      ['marble', 'Finds and sets', 'Finishing a set in her collection raises all the clover she earns.'],
      ['star', 'Her bond', 'Each new bond level pays a bonus, and raises the clover she earns.'],
    ];

    return [
      closeX(close),
      h('div', { class: 'eyebrow', text: 'Clover' }),
      h('h2', {}, img(itemSprite('clover'), 2), ` ${pet.clover.toLocaleString()}`),
      h('h3', { class: 'sheet-h', text: 'Ready now' }),
      ready.length
        ? h('ul', { class: 'list perks clover-ready' }, ...ready.map(([art, nm, sub, b]) => row(art, nm, sub, b)))
        : h('p', { class: 'note', text: holiday ? `${pet.name} is on holiday: clover waits until she's home.` : 'Nothing to collect right now. Her gift is back tomorrow, and the yard keeps filling.' }),
      h('h3', { class: 'sheet-h', text: boosts.length ? `Your clover rate: ${pct(r.total - 1)}` : 'Your clover rate' }),
      boosts.length ? h('ul', { class: 'list perks' }, ...boosts.map(([art, nm, sub]) => row(art, nm, sub))) : null,
      h('p', { class: 'note', text: boosts.length
        ? 'It boosts clover from looking after her, her gift, finds, foraging and wild visitors.'
        : 'Bond levels, collection sets and best friends each raise the clover she earns from care, her gift, finds, foraging and wild visitors.' }),
      h('h3', { class: 'sheet-h', text: 'Ways to earn' }),
      h('ul', { class: 'list perks' }, ...ways.map(([art, nm, sub]) => row(art, nm, sub))),
      h('div', { class: 'actions-col' }, button('Done', 'btn primary', close)),
    ].filter((x): x is HTMLElement => !!x);
  });
}

/** Extras for a shop row: its art, a progress line of pips, a key other rows can point to, and what a locked row waits on. */
interface RowOpts { art?: ItemArt; pips?: [number, number]; key?: string; need?: { text: string; key: string } }

let lockSprite: Sprite | null = null;
const padlock = (): Sprite => (lockSprite ??= toSprite(drawPadlock()));

/**
 * A row in a shop list: name and what it does, then its state. Buyable: a
 * price button, filled when you can afford it; saving up: the price, off, and
 * how far along you are; locked: dashed, with a padlock and what it waits on
 * (a link to that row when there is one); owned: quiet, with a tick. Rows
 * carry a rank for `arrangeRows`.
 */
function shopRow(name: string, what: string, state: { price: number } | { owned: string } | { locked: string }, onBuy: () => void, artOrOpts?: ItemArt | RowOpts): HTMLElement {
  const opts: RowOpts = typeof artOrOpts === 'string' ? { art: artOrOpts } : artOrOpts ?? {};
  let right: HTMLElement;
  let kind: 'buy' | 'saving' | 'locked' | 'owned';
  let save: HTMLElement | null = null;
  if ('price' in state) {
    kind = pet.clover >= state.price ? 'buy' : 'saving';
    right = h('button', { class: `btn small${kind === 'buy' ? ' primary' : ''}`, type: 'button', 'aria-label': `${name}. Buy for ${state.price} clover.` },
      img(itemSprite('clover'), 1), String(state.price));
    right.addEventListener('click', onBuy);
    if (kind === 'saving') {
      setOff(right as HTMLButtonElement, moreClover(state.price));
      const pct = Math.max(2, Math.min(100, Math.round((pet.clover / state.price) * 100)));
      save = h('span', { class: 'save-line' }, h('span', { class: 'save-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })),
        h('span', { text: `${state.price - pet.clover} to go` }));
    }
  } else if ('owned' in state) {
    kind = 'owned';
    right = h('span', { class: 'owned-tick', text: `✓ ${state.owned}` });
  } else {
    kind = 'locked';
    const need = opts.need;
    if (need) {
      right = h('button', { type: 'button', class: 'need-link' }, img(padlock(), 2), h('span', { text: `${need.text} →` }));
      right.addEventListener('click', () => {
        const to = document.querySelector<HTMLElement>(`.shop-row[data-row="${need.key}"]`);
        if (!to) { toast(`${need.text}.`); return; }
        to.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        to.classList.remove('flash');
        void to.offsetWidth; // restart the flash
        to.classList.add('flash');
        to.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      });
    } else right = h('span', { class: 'pill soft lock-pill' }, img(padlock(), 2), h('span', { text: state.locked }));
  }
  const art = opts.art;
  const icon = art ? h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 28))) : null;
  const pips = opts.pips ? h('span', { class: 'pips', 'aria-label': `${opts.pips[0]} of ${opts.pips[1]}` },
    ...Array.from({ length: opts.pips[1] }, (_, i) => h('i', { class: i < opts.pips![0] ? 'on' : '' }))) : null;
  // a locked row's condition goes under its text, where it has room to say itself
  const locked = kind === 'locked';
  const row = h('div', { class: `shop-row ${kind}` }, icon,
    h('span', { class: 'txt' }, h('span', { class: 'nm' }, h('span', { text: name }), pips), h('span', { class: 'sub', text: what }), save, locked ? right : null),
    locked ? null : right);
  row.dataset.rank = String({ buy: 0, saving: 1, locked: 2, owned: 3 }[kind]);
  if (opts.key) row.dataset.row = opts.key;
  return row;
}

/** Shop rows in the order you'd act on them: buyable, saving up, locked, then what's owned under its own heading. */
function arrangeRows(rows: HTMLElement[]): HTMLElement[] {
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.dataset.rank) - Number(b.r.dataset.rank) || a.i - b.i).map((x) => x.r);
  const first = sorted.findIndex((r) => r.dataset.rank === '3');
  if (first > 0) sorted.splice(first, 0, h('h4', { class: 'owned-head', text: 'Owned' }));
  return sorted;
}

function gardenUpgrades(redraw: () => void): HTMLElement {
  const buy = (id: UpgradeId | 'soil', label: string) => () => {
    const r = buyUpgrade(pet, id);
    if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? 'Not enough clover yet.' : 'Not yet.'); return; }
    pet = r.state;
    savePet();
    play('clover');
    haptic('success');
    toast(`${label}!`);
    goal();
    redraw();
  };
  const rows: HTMLElement[] = [];
  // the plots, as one row: the next one for sale, or what it waits on
  const n = plotCount(pet), max = PLOT_SPOTS.length;
  const next = plotUpgrade(n);
  if (!next) rows.push(shopRow('Garden plots', 'Every bed is dug.', { owned: 'All five' }, () => undefined, { art: 'sprout', pips: [n, max] }));
  else {
    const soil = next.requires?.soil ?? 0;
    const state = plotOffer(pet, n) === 'next' ? { price: next.price } : { locked: `Soil level ${soil}` };
    rows.push(shopRow('Garden plots', `The ${ORDINAL[n]} bed: one more to grow in.`, state, buy(next.id, `The ${ORDINAL[n]} plot is dug`),
      { art: 'sprout', pips: [n, max], key: 'plots', need: soil > soilLevel(pet) ? { text: `Needs soil level ${soil}`, key: 'soil' } : undefined }));
  }
  const lvl = soilLevel(pet);
  if (soilMaxed(pet)) {
    rows.push(shopRow('Richer soil', `As rich as it gets: sprouts give ${sproutClover(pet)} clover, strawberries come ${cropYield(pet, 'berry')} at a time and golden carrots in twos.`,
      { owned: 'Top level' }, () => undefined, { art: 'mound', pips: [lvl, SOIL.maxLevel], key: 'soil' }));
  } else {
    // what the next level adds: always sprouts, and sometimes more strawberries or golden carrots
    const more = [`sprouts give ${sproutClover(pet) + SOIL.perLevel} clover, not ${sproutClover(pet)}`];
    if (cropYield(pet, 'berry', lvl + 1) > cropYield(pet, 'berry')) more.push(`strawberries come ${cropYield(pet, 'berry', lvl + 1)} at a time`);
    if (cropYield(pet, 'golden', lvl + 1) > cropYield(pet, 'golden')) more.push('golden carrots come in twos');
    const list = more.length > 1 ? `${more.slice(0, -1).join(', ')} and ${more[more.length - 1]}` : more[0]!;
    rows.push(shopRow('Richer soil', `Level ${lvl + 1}: ${list}.`,
      { price: soilPrice(pet) }, buy('soil', `Soil level ${lvl + 1}`), { art: 'mound', pips: [lvl, SOIL.maxLevel], key: 'soil' }));
  }
  for (const u of UPGRADES) {
    if (u.id.startsWith('plot')) continue;
    const owned = hasUpgrade(pet, u.id);
    const state = owned ? { owned: 'Owned' } : !upgradeUnlocked(pet, u) ? { locked: 'Not yet' } : { price: u.price };
    rows.push(shopRow(u.name, u.what, state, buy(u.id, u.name), { art: u.id === 'can' ? 'can' : 'sunflowers', key: u.id }));
  }
  return h('div', { class: 'shop-list' }, ...arrangeRows(rows));
}

function yardSection(redraw: () => void): HTMLElement {
  const n = now();
  const buyB = (id: (typeof BUILDING_IDS)[number]) => () => {
    const r = buyBuilding(pet, id, now());
    if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? 'Not enough clover yet.' : r.reason === 'max' ? 'The yard has all of those it can hold.' : 'Not yet.'); return; }
    pet = r.state;
    savePet();
    play('place');
    haptic('success');
    toast(`${BUILDINGS[id].name} built. It makes clover every hour.`);
    note(`Built ${article(BUILDINGS[id].name)} in the yard.`, 'clover', `yard:${id}`);
    redraw();
  };
  const plural = (id: BuildingId) => (id === 'patch' ? 'clover patches' : id === 'hive' ? 'beehives' : 'mushroom logs');
  const rows = BUILDING_IDS.map((id) => {
    const b = BUILDINGS[id];
    const have = countOf(pet, id);
    const q = b.requires;
    const state = have >= b.max ? { owned: 'Full' }
      : !buildingUnlocked(pet, id) ? { locked: `After ${q!.count} ${plural(q!.building)}` }
        : { price: nextPrice(pet, id) };
    return shopRow(b.name, have >= b.max ? 'All built.' : paysLine(id), state, buyB(id),
      { art: id, pips: [have, b.max], key: id, need: q && !buildingUnlocked(pet, id) ? { text: `Needs ${q.count} ${plural(q.building)}`, key: q.building } : undefined });
  });
  const shed = shedPrice(pet);
  const shedLocked = countOf(pet, SHED_REQUIRES.building) < SHED_REQUIRES.count;
  rows.push(shopRow('Yard shed', `Storage holds ${storageHours(pet)} hours now${shed ? `; the next shed makes it ${storageHours(pet) + 12}` : ''}.`,
    shed === null ? { owned: 'Owned' } : shedLocked ? { locked: `After ${SHED_REQUIRES.count} ${plural(SHED_REQUIRES.building)}` } : { price: shed },
    () => {
      const r = buyShed(pet, now());
      if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
      pet = r.state;
      savePet();
      play('place');
      toast('The shed holds more clover now.');
      redraw();
    }, { art: 'shed', key: 'shed', need: shed !== null && shedLocked ? { text: `Needs ${SHED_REQUIRES.count} ${plural(SHED_REQUIRES.building)}`, key: SHED_REQUIRES.building } : undefined }));
  const inYard = Math.floor(stored(pet, n));
  const collectBtn = button(inYard ? `Collect ${inYard} clover` : 'Nothing to collect yet', 'btn primary', () => { collectYard(); redraw(); });
  collectBtn.disabled = inYard < 1;
  const rateLine = perHour(pet)
    ? `Makes ${Math.round(perHour(pet) * 24)} clover a day. Holds ${Math.round(capacity(pet))}.`
    : 'Build a clover patch and it makes clover every hour, even while you’re away.';
  return h('div', { class: 'shop-list' }, h('p', { class: 'note', text: rateLine }), perHour(pet) ? collectBtn : null, ...arrangeRows(rows));
}

/**
 * Collect the yard's clover (only from the garden). With `from`, the big
 * Collect button: it pops, and clovers fly from it into the clover counter,
 * which counts up as they land.
 */
function collectYard(from?: HTMLElement): void {
  const before = pet.clover;
  const r = collect(pet, now());
  if (r.clover < 1) return;
  pet = r.state;
  savePet();
  play('clover');
  haptic('success');
  gardenScene?.burst('clover', 6, performance.now(), { x: areaX('yard') + AREA_W / 2, y: 60 });
  const counter = gardenUi?.clover;
  if (from && counter && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    from.classList.add('popping');
    window.setTimeout(() => { from.classList.remove('popping'); gardenSig = ''; renderGarden(); }, 420);
    flyClover(from, counter.parentElement ?? counter, before, pet.clover);
  }
  toast(`+${r.clover} clover from the yard.`);
  goal('yard');
  render();
  renderGarden();
}

/** Held while the counter counts up, so a render doesn't jump it to the end. */
let cloverCounting = false;

/** Clovers fly from `from` to the counter `to`; each one that lands counts it up a step, from `a` to `b`. */
function flyClover(from: HTMLElement, to: HTMLElement, a: number, b: number): void {
  const counter = gardenUi?.clover;
  if (!counter) return;
  const f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
  const n = Math.min(10, Math.max(4, Math.round((b - a) / 10)));
  cloverCounting = true;
  counter.textContent = String(a);
  let landed = 0;
  for (let i = 0; i < n; i++) {
    const el = img(itemSprite('clover'), 3);
    el.className = 'px fly-clover';
    const x0 = f.left + f.width / 2 + (Math.random() - 0.5) * f.width * 0.6;
    const y0 = f.top + f.height / 2;
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    document.body.append(el);
    const dx = t.left + t.width / 2 - x0, dy = t.top + t.height / 2 - y0;
    // up and out a little first, then a swoop into the counter
    const lift = { x: (Math.random() - 0.5) * 80, y: -40 - Math.random() * 50 };
    const anim = el.animate([
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${lift.x}px), calc(-50% + ${lift.y}px)) scale(1.2)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.9 },
    ], { duration: 720, delay: i * 55, easing: 'cubic-bezier(.45, 0, .7, 1)', fill: 'backwards' });
    anim.onfinish = () => {
      el.remove();
      landed++;
      counter.textContent = String(landed === n ? b : Math.round(a + ((b - a) * landed) / n));
      to.classList.remove('bump');
      void to.offsetWidth;
      to.classList.add('bump');
      if (landed === n) { cloverCounting = false; renderGarden(); }
    };
  }
}

// ------------------------------------------------------------------ getting started

/** Draw the eye to a button: focus it and give it a little bounce. */
function nudge(el: HTMLElement): void {
  if (el.hidden) return;
  el.focus();
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
  window.setTimeout(() => el.classList.remove('nudge'), 1600);
}

/** Where to do each goal, for its "Show me" in Getting started. None: nowhere to point. */
function goalShortcut(g: StarterGoal): (() => void) | null {
  const inGarden = (a: AreaId) => () => { goTab('garden'); goArea(a); };
  const onBurrow = (el: () => HTMLElement) => () => { goTab('burrow'); nudge(el()); };
  switch (g) {
    case 'feed': return onBurrow(() => ui.acts.feed);
    case 'nap': return onBurrow(() => ui.acts.nap);
    // Bake is at the foot of the Feed tray
    case 'bake': return () => {
      goTab('burrow');
      if (tray?.kind !== 'feed') toggleTray('feed');
      const b = tray?.el.querySelector<HTMLElement>('.bake-btn');
      if (b) nudge(b);
    };
    case 'streak3': return onBurrow(() => ui.gift);
    case 'bed': return () => openShop({ cat: 'decor' });
    // out of storage and straight into arranging, or to it where it hangs
    case 'lantern': return () => {
      const l = burrow.items.find((i) => i.id === 'lantern');
      if (!l) openShop({ cat: 'decor' });
      else if (l.placed) goTab('shop', { arrange: l.uid });
      else putOutPiece(l);
    };
    case 'dress': return () => openShop({ cat: 'wardrobe' });
    case 'toy': return onBurrow(() => ui.acts.play);
    case 'groom': return onBurrow(() => ui.acts.clean);
    case 'sprout': return inGarden('patch');
    case 'earn': return () => openCloverSheet();
    case 'pin': return () => openShop();
    case 'forage': return () => { goTab('garden'); if (!isOut(pet, now())) openForage(); };
    case 'yard': return inGarden('yard');
    case 'patch2': case 'patch3': return inGarden('yard');
    case 'meadow': return inGarden('meadow');
    case 'meadowhelp': return () => { goTab('garden'); goArea('meadow'); if (!gated('meadow')) openMeadowShop(); };
    case 'gardenup': return () => { goTab('garden'); openGardenUpgrades('garden'); };
    case 'newtoy': return () => openShop({ cat: 'toys' });
    case 'surface': return () => openShop({ cat: 'walls' });
    // finds come home from foraging (and turn up on their own, now and then)
    case 'find': return () => { goTab('garden'); if (!isOut(pet, now())) openForage(); };
    case 'friend': return () => goTab('friends');
    case 'bond3': return null;
  }
}

/** A goal that can't be done yet, or is part way: a word on why, or how far. */
function goalHint(g: StarterGoal): string | null {
  switch (g) {
    case 'nap': return isAsleep(pet, now()) || pet.needs.energy < CARE.napBelowEnergy ? null : "She isn't tired yet";
    case 'groom': return pet.needs.clean < CARE.full ? null : "She's still clean";
    case 'sprout': {
      const n = now();
      const growing = plots(pet).filter((p): p is NonNullable<typeof p> => p?.crop === 'sprout');
      if (growing.some((p) => p.readyAtMs <= n)) return 'Ready to pick';
      if (growing.length) return `Ready in ${fmtDuration(Math.min(...growing.map((p) => p.readyAtMs)) - n)}`;
      return `They grow in ${fmtDuration(growMs(pet, 'sprout'))}: plant them and come back`;
    }
    case 'forage': return isOut(pet, now()) || pet.needs.energy >= FORAGE.minEnergy ? null : 'She needs a rest first';
    case 'find': return isOut(pet, now()) ? 'She might bring one home' : 'Foraging turns things up';
    case 'streak3': return `${Math.min(pet.gift.streak, 3)} of 3`;
    case 'bond3': return `Bond ${Math.min(bondLevel(pet.bond).level, 3)} of 3`;
    default: return null;
  }
}

/** The prize for a step, as pictures: clover, and the patch for step one. */
function prize(step: StarterStep, scale = 2): HTMLElement {
  return h('div', { class: 'prize-art' },
    h('span', {}, img(itemSprite('clover'), scale), `+${step.clover}`),
    step.patch ? h('span', {}, img(itemSprite('lucky'), scale), 'Clover patch') : null);
}

/**
 * Getting started as cards that slide sideways, one per step: claimed ones
 * behind, the open one in front, locked ones ahead (their goals shown, so
 * anything done early is done knowingly). Claiming slides to the next card.
 */
function openStarter(): void {
  let slideFrom: number | null = null;
  openLiveSheet((close, redraw) => {
    const view = starterView(pet);
    const openAt = Math.max(0, view.findIndex((v) => v.status === 'open' || v.status === 'waiting'));
    const cards = view.map(({ step, done, status }) => {
      const ready = status === 'open' && done.every(Boolean);
      let foot: Node;
      if (status === 'claimed') foot = h('div', { class: 'starter-foot', text: '✓ Claimed' });
      else if (status === 'locked') foot = h('div', { class: 'starter-foot', text: `Opens after step ${step.step - 1}` });
      else if (status === 'waiting') foot = h('div', { class: 'starter-foot', text: `Opens ${whenOpens(daysUntil(pet, step))}. Anything you do before then counts.` });
      else {
        const claim = button(ready ? 'Claim' : `${done.filter(Boolean).length} of ${done.length} done`, 'btn primary', () => {
          slideFrom = openAt;
          claimStep();
          redraw();
        });
        if (!ready) setOff(claim, 'Finish every goal in this step first.');
        foot = claim;
      }
      return h('section', { class: `starter-card ${status}${ready ? ' ready' : ''}`, 'aria-label': `Step ${step.step} of ${STARTER_STEPS.length}` },
        h('div', { class: 'starter-head' }, h('h3', { text: `Step ${step.step}` }), prize(step)),
        h('ul', {}, ...step.goals.map((g, i) => {
          const hint = done[i] || status === 'claimed' ? null : goalHint(g);
          const go = done[i] || (status !== 'open' && status !== 'waiting') ? null : goalShortcut(g);
          return h('li', { class: done[i] || status === 'claimed' ? 'done' : '' },
            h('span', {}, `${done[i] || status === 'claimed' ? '✓' : '○'} ${GOAL_TEXT[g]}`, hint ? h('span', { class: 'hint', text: ` · ${hint}` }) : null),
            go ? button('Show me', 'btn small', () => { close(); go(); }) : null);
        })),
        foot);
    });
    const track = h('div', { class: 'starter-track' }, ...cards);
    const dots = view.map(({ step, status }, i) => {
      const d = h('button', { class: `starter-dot ${status}`, type: 'button', 'aria-label': `Step ${step.step}` }, h('span'));
      d.addEventListener('click', () => slideTo(i, true));
      return d;
    });
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pitch = () => Math.max(1, (cards[1] ?? cards[0]!).offsetLeft - cards[0]!.offsetLeft);
    // Slides are animated here rather than with scrollTo's 'smooth': snap is off
    // while it runs (a snap turning back on mid-slide jumps straight to the
    // card), and a drag's release speed carries into it.
    let anim = 0;
    /** Slide to card i. `v` is the drag's release speed in px/ms; without one it's a plain ease-out. */
    const slideTo = (i: number, animate: boolean, v?: number) => {
      cancelAnimationFrame(anim);
      const from = track.scrollLeft;
      const d = cards[i]!.offsetLeft - cards[0]!.offsetLeft - from;
      if (!animate || !smooth || Math.abs(d) < 1) { track.scrollLeft = from + d; track.classList.remove('free'); return; }
      track.classList.add('free');
      const ms = 340;
      // ease-out cubic d·(1-u³) starts at speed 3d; the k·u² term swaps that for the release speed
      const s0 = v === undefined ? 3 * d : Math.max(-6 * Math.abs(d), Math.min(6 * Math.abs(d), v * ms));
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const u = 1 - k;
        track.scrollLeft = from + d * (1 - u * u * u) + (s0 - 3 * d) * k * u * u;
        if (k < 1) anim = requestAnimationFrame(step);
        else track.classList.remove('free');
      };
      anim = requestAnimationFrame(step);
    };
    const markDot = () => {
      const at = Math.round(track.scrollLeft / pitch());
      dots.forEach((d, i) => d.setAttribute('aria-current', String(i === at)));
    };
    track.addEventListener('scroll', markDot, { passive: true });
    // touch swipes natively; a mouse drags the track too, then settles on the nearest card
    // Recent pointer positions, for the speed at release.
    let drag: { x: number; left: number; moved: boolean; trail: { x: number; t: number }[] } | null = null;
    track.addEventListener('pointerdown', (e) => {
      // a touch mid-slide takes over from it
      cancelAnimationFrame(anim);
      if (e.pointerType !== 'mouse') { track.classList.remove('free'); return; }
      if (e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false, trail: [{ x: e.clientX, t: e.timeStamp }] };
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x) < 6) return;
        // pick up from here, so the track doesn't leap the 6px
        drag.moved = true;
        drag.x = e.clientX;
        cancelAnimationFrame(anim);
        drag.left = track.scrollLeft;
        track.setPointerCapture(e.pointerId);
        track.classList.add('dragging', 'free');
      }
      e.preventDefault();
      track.scrollLeft = drag.left - (e.clientX - drag.x);
      drag.trail.push({ x: e.clientX, t: e.timeStamp });
      if (drag.trail.length > 6) drag.trail.shift();
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      track.classList.remove('dragging');
      // speed over the last ~100ms, in scroll px/ms (dragging left scrolls right)
      const recent = d.trail.filter((p) => e.timeStamp - p.t < 100);
      const first = recent[0] ?? d.trail[d.trail.length - 1]!;
      const dt = e.timeStamp - first.t;
      const v = dt > 0 ? -(e.clientX - first.x) / dt : 0;
      // a flick goes on to the next card that way; slower, it settles on the nearest
      const from = Math.round(d.left / pitch());
      const to = Math.abs(v) >= 0.3 ? from + Math.sign(v) : Math.max(from - 1, Math.min(from + 1, Math.round(track.scrollLeft / pitch())));
      slideTo(Math.max(0, Math.min(cards.length - 1, to)), true, v);
      // the drag ended over a button: don't let it count as a tap
      // (the click comes straight after pointerup, so the guard only lives that long)
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      track.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => track.removeEventListener('click', eat, { capture: true }), 0);
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    // once it's on screen: start on the open card, or slide there from the one just claimed
    requestAnimationFrame(() => {
      if (slideFrom !== null) { slideTo(slideFrom, false); slideTo(openAt, true); slideFrom = null; }
      else slideTo(openAt, false);
      markDot();
    });
    const out: Node[] = [
      h('div', { class: 'eyebrow', text: `Getting started · step ${starterStep(pet)} of ${STARTER_STEPS.length}` }),
      h('h2', { text: starterDone(pet) ? `All settled in with ${pet.name}!` : `Settling in with ${pet.name}` }),
      track,
      h('div', { class: 'starter-dots' }, ...dots),
    ];
    if (!starterDone(pet)) out.push(h('p', { class: 'note', text: 'Two steps today, then a new one each day you visit. Anything you do early still counts.' }));
    out.push(h('div', { class: 'actions-col' },
      starterDone(pet) ? button('See your next goals', 'btn primary', () => { close(); openLaterGoals(); }) : button('Ways to earn clover', 'btn', () => { close(); openCloverSheet(); }),
      button('Close', 'btn', close)));
    return out;
  });
}

/** Where to go for a later goal, for its "Show me". */
function laterShortcut(id: LaterGoalId): (() => void) | null {
  const inGarden = (a: AreaId) => () => { goTab('garden'); goArea(a); };
  switch (id) {
    case 'hive': case 'patch5': case 'shed': case 'hive3': case 'log': return inGarden('yard');
    case 'soil2': return () => { goTab('garden'); openGardenUpgrades('garden'); };
    case 'set': return () => { goTab('garden'); if (!isOut(pet, now())) openForage(); };
    case 'bestfriend': return () => goTab('friends');
  }
}

/**
 * The goals after Getting started: the open few, each with how far along it
 * is and a Claim once it's done. Claiming one opens the next in its place.
 */
function openLaterGoals(): void {
  openLiveSheet((close, redraw) => {
    const open = openGoals(pet);
    const rows = open.map((g) => {
      const [have, need] = g.progress(pet);
      const done = have >= need;
      const end = done
        ? button(`Claim +${g.clover}`, 'btn small primary', () => { claimLater(g.id); redraw(); })
        : (() => { const go = laterShortcut(g.id); return go ? button('Show me', 'btn small', () => { close(); go(); }) : null; })();
      return h('li', { class: done ? 'done' : '' },
        h('span', { class: 'txt' },
          h('span', { class: 'nm' }, `${done ? '✓' : '○'} ${g.text}`, need > 1 && !done ? h('span', { class: 'hint', text: ` · ${have} of ${need}` }) : null),
          h('span', { class: 'sub' }, g.how, ' ', h('span', { class: 'prize' }, img(itemSprite('clover'), 1), `+${g.clover}`))),
        end);
    });
    return [
      closeX(close),
      h('div', { class: 'eyebrow', text: 'Goals' }),
      h('h2', { text: goalsAllDone(pet) ? 'Every goal done!' : `Growing with ${pet.name}` }),
      rows.length
        ? h('ul', { class: 'list perks goals-list' }, ...rows)
        : h('p', { class: 'note', text: 'You’ve done them all. New goals come with updates.' }),
      rows.length ? h('p', { class: 'note', text: 'Claim one and the next opens. Anything you do early still counts.' }) : null,
      h('div', { class: 'actions-col' }, button('Ways to earn clover', 'btn', () => { close(); openCloverSheet(); }), button('Close', 'btn', close)),
    ].filter((x): x is HTMLElement => !!x);
  });
}

// ------------------------------------------------------------------ clover rate

function openRate(): void {
  openSheet((close) => {
    const r = rate(pet);
    const pct = (x: number) => `+${Math.round(x * 100)}%`;
    const sets = COLLECTION_SETS.filter((set) => setComplete(pet.collection, set)).length;
    const rows: [string, string, string][] = [
      ['Bond', `Level ${bondLevel(pet.bond).level}`, pct(r.bond)],
      ['Collection', `${sets} of ${COLLECTION_SETS.length} sets complete`, pct(r.sets)],
      ['Best friends', `${bestFriends(pet)} of 5`, pct(r.friends)],
    ];
    if (pet.supporter) rows.push(['Supporter', 'Thank you!', '+25% on everything']);
    return [
      h('div', { class: 'eyebrow', text: 'Clover rate' }),
      h('h2', { text: `${pct(r.total - 1)} clover` }),
      h('ul', {}, ...rows.map(([name, sub, val]) =>
        h('li', {}, h('span', { class: 'txt' }, h('span', { class: 'nm', text: name }), h('span', { class: 'meta', text: sub })), h('span', { class: 'pr', text: val })))),
      h('p', { class: 'note', text: 'The rate boosts the daily gift, care, finds and friends. The garden and the yard pay the same whatever the rate.' }),
      h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
    ];
  });
}

// ------------------------------------------------------------------ her page: her things and the settings

/** A row in a page's menu: an icon, a name and a line, and optionally something on the right. */
function menuRow(label: string, sub: string, art: ItemArt | Node | null, onClick: () => void, right?: Node): HTMLButtonElement {
  const icon = typeof art === 'string' ? img(itemSprite(art), fitScale(itemSprite(art), 26)) : art;
  const b = h('button', { class: 'menu-row', type: 'button' },
    icon ? h('span', { class: 'ico' }, icon) : null,
    h('span', { class: 'txt' }, h('span', { class: 'nm', text: label }), h('span', { class: 'sub', text: sub })),
    right ?? h('span', { class: 'go', 'aria-hidden': 'true', text: '›' }));
  b.addEventListener('click', onClick);
  return b;
}

/** A menu row that's an on/off switch. */
function switchRow(label: string, sub: string, art: ItemArt | Node | null, on: boolean, onClick: () => void): HTMLButtonElement {
  const b = menuRow(label, sub, art, onClick, h('span', { class: `switch${on ? ' on' : ''}`, 'aria-hidden': 'true' }));
  b.setAttribute('aria-pressed', String(on));
  return b;
}

/** A section of a page: a small heading (with a note on the right, if any), then its contents. */
function pageSection(title: string, aside: string | null, ...kids: Child[]): HTMLElement {
  return h('section', { class: 'page-section' },
    h('div', { class: 'section-head' }, h('h3', { text: title }), aside ? h('span', { text: aside }) : null),
    ...kids);
}

/** Rebuild a page's body in place, keeping focus on the same button where it can. */
function fillPage(kids: Node[]): void {
  const body = ui.page.body;
  const before = [...body.querySelectorAll('button')];
  const at = before.indexOf(document.activeElement as HTMLButtonElement);
  body.replaceChildren(...kids);
  if (at >= 0) {
    const after = [...body.querySelectorAll('button')];
    (after[Math.min(at, after.length - 1)] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
  }
}

let herSig = '';

/** What a bond level brings: its boost to the clover rate, and what reaching it pays and opens up. */
function bondPerks(level: number): { rate: number; bonus: number; unlocks: string[] } {
  const rate = RATE.bondEarly * Math.min(level - 1, 6) + RATE.bondLate * Math.max(0, level - 7);
  const unlocks = [
    ...CATALOG.filter((d) => d.bond === level && !d.giftOnly && !d.limited && !isOutdoor(d)).map((d) => d.name),
    ...SURFACES.filter((d) => d.bond === level).map((d) => d.name),
    ...OUTFITS.filter((o) => o.bond === level && !o.giftOnly).map((o) => o.name),
  ].map((n) => n.toLowerCase());
  return { rate, bonus: BOND_LEVEL_CLOVER[level] ?? 0, unlocks };
}

/** "a, b and c" */
function listOf(xs: string[]): string {
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '';
}

/** Her page: her portrait and bond, her wardrobe, shelf and journal, and the settings. */
function renderHerPage(): void {
  const n = now();
  const w = wardrobe(pet);
  const bl = bondLevel(pet.bond);
  const found = COLLECTIBLES.filter((c) => (pet.collection?.[c.id] ?? 0) > 0).length;
  const met = CRITTERS.filter((c) => pet.critters?.seen[c.id]).length;
  const pct = Math.round((rate(pet).total - 1) * 100);
  const reminders = OR.capabilities.has('notifications.schedule') ? reminderSummary() : null;
  const sound = settings.sound !== false;
  const holiday = away();
  const sig = [pet.name, pet.coat, dressKey(dressOf(pet)), pet.daysVisited, bl.level, bl.into, w.owned.length, found, met, pct,
    journal.entries.length, reminders, sound, holiday ? pet.vacationUntilMs : 0, isOut(pet, n)].join('|');
  if (sig === herSig) return;
  herSig = sig;

  ui.page.title.textContent = pet.name;
  ui.page.action.replaceChildren();
  ui.page.sub.textContent = `${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} together · since ${fmtDate(pet.bornAtMs)}`;

  const bondPct = Math.max(2, Math.min(100, Math.round((bl.into / bl.span) * 100)));
  // what she has from it now, and what the next level brings
  const now_ = bondPerks(bl.level), next = bondPerks(bl.level + 1);
  const brings = [
    `+${Math.round((next.rate - now_.rate) * 100)}% more clover`,
    ...(next.bonus ? [`a ${next.bonus} clover bonus`] : []),
    ...(next.unlocks.length ? [`the ${listOf(next.unlocks)} in the shop`] : []),
  ];
  const nextLine = `Level ${bl.level + 1} (${bondPct}% there) brings ${listOf(brings)}.`;
  const profile = h('section', { class: 'her-card' },
    h('div', { class: 'profile-art' }, img(rabbitSprite(pet.coat, 'happy', 0, dressOf(pet)), 3, `${pet.name} in her outfit`)),
    h('div', { class: 'her-bond' },
      h('span', { class: 'eyebrow', text: 'Your bond' }),
      h('span', { class: 'bond-level', text: `Level ${bl.level}` }),
      h('span', { class: 'bond-bar', role: 'meter', 'aria-label': `Bond, on the way to level ${bl.level + 1}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': bondPct },
        h('span', { style: `width:${bondPct}%` })),
      h('span', { class: 'perk', text: now_.rate ? `+${Math.round(now_.rate * 100)}% clover from care, gifts, finds and friends` : 'Look after her each day and it grows' }),
      h('span', { class: 'meta', text: nextLine })));

  const tile = (label: string, sub: string, art: ItemArt, onClick: () => void) => {
    const s = itemSprite(art);
    const b = h('button', { class: 'tile', type: 'button' },
      h('span', { class: 'ico' }, img(s, fitScale(s, 34))), h('span', { class: 'nm', text: label }), h('span', { class: 'sub', text: sub }));
    b.addEventListener('click', onClick);
    return b;
  };
  const things = h('div', { class: 'tiles' },
    tile('Wardrobe', w.owned.length ? `${w.owned.length} of ${OUTFITS.length} outfits` : 'Bows, hats and scarves', 'bow', () => openShop({ cat: 'wardrobe' })),
    tile('Collection', `${found} of ${COLLECTIBLES.length} found`, 'marble', () => openCollection()),
    tile('Journal', journal.entries.length ? `${journal.entries.length} ${journal.entries.length === 1 ? 'entry' : 'entries'}` : 'Your story', 'book', () => openJournal()));

  const speaker = h('span', { class: 'svg-ico' });
  speaker.innerHTML = sound ? SPEAKER_ON : SPEAKER_OFF;
  const settingsRows: HTMLElement[] = [switchRow('Sound', sound ? 'On' : 'Off', speaker, sound, () => toggleSound())];
  if (reminders !== null) {
    settingsRows.push(menuRow('Reminders', reminderSummary(), 'moon', () => openSettings()));
  }
  settingsRows.push(
    menuRow(holiday ? 'On holiday' : 'Going away?', holiday ? `Until ${fmtDate(pet.vacationUntilMs!)}. Bring her home early` : 'Pause her needs for a trip', 'suitcase', () => openVacation()),
    menuRow('Share', `Tell a friend about ${pet.name}`, 'heart', () => void shareCard()),
    menuRow('Start over', `Say goodbye to ${pet.name} and adopt a new rabbit`, null, () => confirmStartOver()),
  );
  settingsRows[settingsRows.length - 1]!.classList.add('danger');

  fillPage([
    profile,
    pageSection('Her things', `${met} of ${CRITTERS.length} visitors met`, things,
      menuRow('Clover rate', `+${pct}% clover, from her bond, finds and best friends`, 'clover', () => openRate())),
    pageSection('Settings', null, h('div', { class: 'menu' }, ...settingsRows)),
  ]);
}

// ------------------------------------------------------------------ settings

/** "Off", "All on" or "4 of 6 on", for her page's Reminders row. */
function reminderSummary(): string {
  if (settings.reminders !== 'on') return 'Off';
  const on = REMINDER_KINDS.filter((k) => !settings.quiet?.includes(k.key)).length;
  return on === REMINDER_KINDS.length ? 'All on' : on ? `${on} of ${REMINDER_KINDS.length} on` : 'Off';
}

/**
 * The gear in the header: sound, the platform's mute for the whole game, and
 * reminders, all of them or kind by kind.
 */
function openSettings(): void {
  openSheet((close) => {
    const body = h('div', { class: 'menu' });
    // The game's mute lives on the server and can change from the app's own
    // settings, so it's read each time the sheet opens. Null until it answers,
    // and for good if it can't: the row only shows once the state is known.
    let muted: boolean | null = null;
    if (OR.capabilities.has('notifications.setMuted')) {
      void OR.notifications.muted().then((m) => {
        if (m === null || !body.isConnected) return;
        muted = m;
        fill();
      });
    }
    // One change at a time: taps while one is on its way are ignored, so
    // replies can't land out of order and a quick double tap can't run into
    // the host's rate limit.
    let saving = false;
    const setMuted = (next: boolean) => {
      if (saving) return;
      saving = true;
      const was = muted;
      muted = next;
      fill();
      OR.notifications.setMuted(next).then(
        (now) => { saving = false; muted = now; if (body.isConnected) fill(); },
        () => {
          saving = false;
          muted = was;
          if (body.isConnected) fill();
          toast("Couldn't change that just now. Try again in a moment.");
        });
    };
    const fill = () => {
      const sound = settings.sound !== false;
      const speaker = h('span', { class: 'svg-ico' });
      speaker.innerHTML = sound ? SPEAKER_ON : SPEAKER_OFF;
      const rows: HTMLElement[] = [switchRow('Sound', sound ? 'On' : 'Off', speaker, sound, () => { toggleSound(); fill(); })];
      if (muted !== null) {
        const row = switchRow('Notifications', muted ? 'Muted: nothing from Rabbit Pets reaches your phone' : 'Reminders, gifts and visits on your phone',
          null, !muted, () => setMuted(!muted));
        if (saving) row.setAttribute('aria-busy', 'true');
        rows.push(row);
      }
      if (OR.capabilities.has('notifications.schedule')) {
        const on = settings.reminders === 'on';
        const sub = !on ? 'Off: no reminders' : muted ? 'In your bell only while muted, the kinds below' : 'Nudges now and then, the kinds below';
        rows.push(switchRow('Reminders', sub, 'moon', on, () => {
          settings.reminders = on ? 'off' : 'on';
          saveSettings();
          queueReconcile();
          render();
          fill();
        }));
        if (on) {
          for (const k of REMINDER_KINDS) {
            const kindOn = !settings.quiet?.includes(k.key);
            const row = switchRow(k.label, k.sub, null, kindOn, () => {
              const quiet = new Set(settings.quiet ?? []);
              if (kindOn) quiet.add(k.key); else quiet.delete(k.key);
              settings.quiet = [...quiet];
              saveSettings();
              queueReconcile();
              render();
              fill();
            });
            row.classList.add('sub-row');
            rows.push(row);
          }
        }
      }
      // keep focus on the row that was tapped as the rows are rebuilt, by its
      // label rather than its place: the Notifications row arrives late
      for (const row of rows) row.dataset.row = row.querySelector('.nm')?.textContent ?? '';
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-row]');
      const at = focused && body.contains(focused) ? focused.dataset.row : undefined;
      body.replaceChildren(...rows);
      if (at !== undefined) rows.find((r) => r.dataset.row === at)?.focus();
    };
    fill();
    return [
      h('div', { class: 'eyebrow', text: 'Settings' }),
      h('h2', { text: 'Sound and notifications' }),
      body,
      h('div', { class: 'actions-col' }, button('Done', 'btn', close)),
    ];
  }, { kind: 'settings' });
}

// ------------------------------------------------------------------ starting over

/** Asks twice in one sheet: the button only works once her name is typed. */
function confirmStartOver(): void {
  openSheet((close) => {
    const name = pet.name;
    const input = h('input', { id: 'start-over-name', type: 'text', autocomplete: 'off', maxlength: 16 });
    const go = h('button', { class: 'btn danger', type: 'button', text: 'Start over', disabled: true });
    input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== name.toLowerCase(); });
    go.addEventListener('click', () => {
      go.disabled = true;
      void startOver().then(close, () => { go.disabled = false; toast("Couldn't start over just now. Try again in a moment."); });
    });
    return [
      h('div', { class: 'eyebrow', text: 'Start over' }),
      h('h2', { text: `Say goodbye to ${name}?` }),
      h('p', { text: `${name}, her burrow, clover, decor, outfits, garden, yard and journal will be gone for good, on every device. You'll adopt a new rabbit from the start. This can't be undone.` }),
      h('div', { class: 'field' }, h('label', { for: 'start-over-name', text: `Type ${name} to confirm` }), input),
      h('div', { class: 'actions-col' }, go, button('Keep her', 'btn', close)),
    ];
  });
}

async function startOver(): Promise<void> {
  // Her reminders go with her.
  if (OR.capabilities.has('notifications.schedule') && OR.user) {
    window.clearTimeout(reconcileTimer);
    settings.scheduled = await reconcile(OR, { ...settings, reminders: 'off' }, [], now());
  }
  await saver.drop();
  await deleteGame(OR);
  saveSettings();
  leaveForAdoption();
  toast('All clear. Who will you bring home?');
}

/** Tear down the burrow screen and show adoption, with no rabbit loaded. */
function leaveForAdoption(): void {
  closeTray();
  decorating = false;
  document.body.classList.remove('arranging-burrow');
  scene = null;
  pet = undefined as unknown as PetState;
  inStorage = { pet: null, burrow: null };
  burrow = starterBurrow();
  journal = emptyJournal();
  renderAdopt();
}

// ------------------------------------------------------------------ collection

function openCollection(): void {
  const have = pet.collection ?? {};
  const seen = pet.critters?.seen ?? {};
  const found = COLLECTIBLES.filter((c) => (have[c.id] ?? 0) > 0).length;
  const live = new Set(activeEvents(now(), tz).map((e) => e.id));
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Her shelf' }),
    h('h2', { text: `${found} of ${COLLECTIBLES.length} found` }),
    ...COLLECTION_SETS.flatMap((set) => {
      const done = setComplete(have, set);
      const bonus = set.kind === 'permanent' ? '+5%' : '+2%';
      return [
        h('h3', { class: 'set-name', text: `${set.name}${live.has(set.id) ? ' · on now' : ''} · ${done ? `complete, ${bonus} clover` : `finish for ${bonus} clover`}` }),
        h('ul', { class: 'shelf' }, ...set.items.map((id) => {
          const c = COLLECTIBLES.find((x) => x.id === id)!;
          const k = have[c.id] ?? 0;
          const sp = itemSprite(c.id as ItemArt);
          return h('li', { class: k ? 'found' : 'missing' },
            h('span', { class: 'art' }, img(sp, fitScale(sp, 36), k ? c.name : 'Not found yet')),
            h('span', { class: 'nm', text: k ? c.name : '???' }),
            k > 1 ? h('span', { class: 'ct', text: `×${k}` }) : null,
            c.rarity === 'rare' ? h('span', { class: 'tag', text: 'Rare' }) : null);
        })),
      ];
    }),
    h('p', { class: 'note', text: `${pet.name} finds things while you're away, and during a seasonal event she mostly finds that event's things. A finished set raises your clover rate. Woodland keepsakes only come from visitors.` }),
    // the visitors' album: who's been, how often, and a hint for who hasn't
    h('h3', { class: 'set-name', text: `Visitors · ${CRITTERS.filter((c) => seen[c.id]).length} of ${CRITTERS.length} met` }),
    h('ul', { class: 'shelf album' }, ...CRITTERS.map((c) => {
      const k = seen[c.id] ?? 0;
      const sp = itemSprite(c.id as ItemArt);
      return h('li', { class: k ? 'found' : 'missing' },
        h('span', { class: 'art' }, img(sp, fitScale(sp, 40), k ? c.name : 'Not met yet')),
        h('span', { class: 'nm', text: k ? c.name : '???' }),
        k ? h('span', { class: 'ct', text: `×${k}` }) : h('span', { class: 'hint', text: c.hint }));
    })),
    h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
  ]);
}

// ------------------------------------------------------------------ journal

function openJournal(): void {
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Journal' }),
    h('h2', { text: `You and ${pet.name}` }),
    journal.entries.length
      ? h('ul', { class: 'journal' }, ...journal.entries.map((e) => {
        const art = (e.art ?? 'heart') as ItemArt;
        return h('li', {},
          h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 26))),
          h('span', { class: 'txt' }, h('span', { class: 'when', text: fmtDate(e.atMs) }), h('span', { text: e.text })));
      }))
      : h('p', { text: 'Nothing written yet. Firsts and milestones will show up here.' }),
    h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
  ]);
}

// ------------------------------------------------------------------ going away

function openVacation(): void {
  openSheet((close) => {
    if (away()) {
      return [
        h('div', { class: 'eyebrow', text: 'On holiday' }),
        h('h2', { text: `${pet.name} is away until ${fmtDate(pet.vacationUntilMs!)}` }),
        h('p', { text: "She's staying with her auntie in the meadow. Her needs are paused and she'll be right as rain when she's back." }),
        h('div', { class: 'actions-col' },
          button('Bring her home now', 'btn primary', () => {
            pet = endVacation(pet);
            savePet();
            play('wake');
            toast(`${pet.name} hops back into the burrow.`);
            note(`${pet.name} came home from her holiday.`, 'suitcase');
            queueReconcile();
            render();
            close();
          }),
          button('Close', 'btn', close)),
      ];
    }
    const choices = VACATION_CHOICES.map((d) => button(d === 1 ? '1 day' : `${d} days`, 'btn', () => {
      pet = startVacation(pet, d, now());
      savePet();
      play('nap');
      toast(`Have a lovely trip. ${pet.name} will be back ${fmtDate(pet.vacationUntilMs!)}.`);
      note(`${pet.name} went on holiday for ${d === 1 ? 'a day' : `${d} days`}.`, 'suitcase');
      queueReconcile();
      render();
      close();
    }));
    // a holiday starts from home: not halfway through a foraging trip
    if (isOut(pet, now())) for (const c of choices) setOff(c, "She's out foraging. Send her on holiday once she's home.");
    return [
      h('div', { class: 'eyebrow', text: 'Going away?' }),
      h('h2', { text: `Send ${pet.name} on holiday` }),
      h('p', { text: "While she's away her needs pause, so she won't miss you. She won't find things or earn clover, and reminders stop, except one when she's home." }),
      h('div', { class: 'choice-row' }, ...choices),
      h('p', { class: 'note', text: `You can bring her home early any time from ${pet.name}'s page, in the tab bar.` }),
      h('div', { class: 'actions-col' }, button('Not now', 'btn', close)),
    ];
  });
}

// ------------------------------------------------------------------ seasonal events

const EVENT_ART: Record<string, ItemArt> = { snowday: 'snowflake', bloom: 'flower', summer: 'fan', harvest: 'pumpkin', spooky: 'jackolantern', winterfest: 'snowglobe' };

function openEvent(id: string): void {
  const e = activeEvents(now(), tz).find((x) => x.id === id);
  if (!e) return;
  const fmtMD = ([m, d]: [number, number]) => new Date(2000, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  openLiveSheet((close, redraw) => [
    h('div', { class: 'event-art' }, img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 4)),
    h('div', { class: 'eyebrow', text: `${fmtMD(e.from)} – ${fmtMD(e.to)}` }),
    h('h2', { text: e.name }),
    h('p', { text: e.blurb }),
    ...raffleSection(e, redraw),
    h('div', { class: 'actions-col' },
      e.decor.length ? button('See the decor', e.raffle ? 'btn' : 'btn primary', () => { close(); openShop({ cat: 'decor', event: e.id }); }) : null,
      button('Close', 'btn', close)),
  ]);
}

/** The festival raffle, in its event's sheet: the prize on her, the odds in plain words, and a ticket. */
function raffleSection(e: SeasonalEvent, redraw: () => void): Node[] {
  const prize = e.raffle ? outfitById(e.raffle) : undefined;
  if (!prize) return [];
  const preview = h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, 'happy', 0, { ...dressOf(pet), [prize.slot]: prize.id }), 3, `${pet.name} in the ${prize.name.toLowerCase()}`));
  if (prizeWon(pet, e)) {
    return [h('h3', { class: 'gift-sub', text: 'Festival raffle' }), preview, h('p', { text: `You won the ${prize.name.toLowerCase()}! It's in her wardrobe.` })];
  }
  const bought = ticketsBought(pet, e.id);
  const left = RAFFLE.guaranteeBy - bought;
  const ticket = h('button', { class: 'btn primary', type: 'button' }, img(itemSprite('clover'), 1), ` Buy a ticket (${RAFFLE.ticket})`);
  ticket.addEventListener('click', () => buyTicket(e, redraw));
  if (pet.clover < RAFFLE.ticket) setOff(ticket, moreClover(RAFFLE.ticket));
  const out: (Node | null)[] = [
    h('h3', { class: 'gift-sub', text: 'Festival raffle' }),
    preview,
    h('p', { text: `This year's prize is the ${prize.name.toLowerCase()}, and you can only win it. Each ticket has a 1 in ${Math.round(1 / RAFFLE.odds)} chance, and ${left === 1 ? 'your next ticket wins it for sure' : `you'll have it within ${left} more tickets at most`}.` }),
    rafflePips(e, bought),
    h('div', { class: 'actions-col' }, ticket),
    bought ? h('p', { class: 'note', text: `${bought} ${bought === 1 ? 'ticket' : 'tickets'} so far. They carry over to next year until you win.` }) : null,
  ];
  return out.filter((x): x is Node => x !== null);
}

/** One pip per ticket up to the one that always wins, filled for those bought. */
function rafflePips(e: SeasonalEvent, bought: number, fresh = false): HTMLElement {
  const pips = Array.from({ length: RAFFLE.guaranteeBy }, (_, i) =>
    h('span', { class: `pip${i < bought ? ' on' : ''}${fresh && i === bought - 1 ? ' fresh' : ''}${i === RAFFLE.guaranteeBy - 1 ? ' last' : ''}` }));
  return h('div', { class: `raffle-pips ev-${e.id}`, role: 'img', 'aria-label': `${Math.min(bought, RAFFLE.guaranteeBy)} of ${RAFFLE.guaranteeBy} tickets; the ${RAFFLE.guaranteeBy}th always wins` }, ...pips);
}

/** How long the box shakes before it opens (tap to skip). */
const DRAW_SHAKE_MS = 1500;

/**
 * Buy a ticket and open it, gacha style: the box shakes (glowing gold halfway
 * through if it's the prize), then bursts open. The draw is made and saved
 * before any of it plays, so closing early changes nothing.
 */
function buyTicket(e: SeasonalEvent, redrawEvent: () => void): void {
  const prize = e.raffle ? outfitById(e.raffle) : undefined;
  const r = drawTicket(pet, e);
  if (!prize || !r.ok) { play('nope'); toast(!r.ok && r.reason === 'broke' ? moreClover(RAFFLE.ticket) : 'The raffle is closed.'); return; }
  pet = r.state;
  savePet();
  render();
  redrawEvent();
  const won = r.draw.kind === 'prize';
  const bought = ticketsBought(pet, e.id);
  if (won) note(`Won the ${prize.name.toLowerCase()} in the ${e.name} raffle.`, 'gift', `raffle:${e.id}`);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  openSheet((close) => {
    let timer = 0;
    const box = h('button', { class: 'draw-box', type: 'button', 'aria-label': 'Open it' }, img(itemSprite('gift'), 7));
    const stage = h('div', { class: 'draw-stage' }, h('div', { class: 'draw-rays' }), box);
    const title = h('h2', { text: 'Festival raffle' });
    const line = h('p', { class: 'draw-line', 'aria-live': 'polite', text: `Ticket ${bought}…` });
    const pips = rafflePips(e, bought - 1);
    const actions = h('div', { class: 'actions-col' });
    const wrap = h('div', { class: 'draw' }, stage, title, line, pips, actions);

    const reveal = () => {
      window.clearTimeout(timer);
      if (!wrap.isConnected || wrap.dataset.phase === 'open') return;
      wrap.dataset.phase = 'open';
      box.remove();
      if (won) {
        wrap.dataset.won = '';
        stage.append(h('div', { class: 'draw-result' }, img(rabbitSprite(pet.coat, 'happy', 0, { ...dressOf(pet), [prize.slot]: prize.id }), 4, `${pet.name} in the ${prize.name.toLowerCase()}`)));
        // sparkles fly out all round
        for (let i = 0; i < 12; i++) {
          const s = h('span', { class: 'draw-spark' }, img(itemSprite('sparkle'), 2 + (i % 2)));
          s.style.setProperty('--a', `${i * 30 + (i % 3) * 7}deg`);
          s.style.setProperty('--d', `${90 + (i % 4) * 22}px`);
          stage.append(s);
        }
        title.textContent = 'You won!';
        line.textContent = `The ${prize.name.toLowerCase()} is hers. It's in her wardrobe.`;
        pips.replaceWith(rafflePips(e, RAFFLE.guaranteeBy));
        play('fanfare');
        haptic('success');
        actions.append(
          button('Put it on', 'btn primary', () => { pet = wear(pet, prize.slot, prize.id); savePet(); play('flip'); goal('dress'); close(); }),
          button('Later', 'btn', close));
      } else {
        stage.append(h('div', { class: 'draw-result miss' }, img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 5)));
        const left = RAFFLE.guaranteeBy - bought;
        title.textContent = 'Not this time';
        line.textContent = left === 1 ? 'Your next ticket wins it for sure!' : `It's yours within ${left} more tickets.`;
        pips.replaceWith(rafflePips(e, bought, true));
        play('puff');
        const again = h('button', { class: 'btn primary', type: 'button' }, img(itemSprite('clover'), 1), ` Another ticket (${RAFFLE.ticket})`);
        again.addEventListener('click', () => { if (pet.clover < RAFFLE.ticket) { play('nope'); toast(moreClover(RAFFLE.ticket)); return; } close(); buyTicket(e, redrawEvent); });
        if (pet.clover < RAFFLE.ticket) setOff(again, moreClover(RAFFLE.ticket));
        actions.append(again, button('Done', 'btn', close));
      }
      (actions.querySelector('button') as HTMLButtonElement | null)?.focus();
    };

    box.addEventListener('click', reveal);
    if (still) {
      queueMicrotask(reveal);
    } else {
      wrap.dataset.phase = 'shake';
      play('drumroll');
      // the tell: a winning box turns gold partway through
      if (won) window.setTimeout(() => { if (wrap.dataset.phase === 'shake') wrap.dataset.gold = ''; }, DRAW_SHAKE_MS * 0.55);
      timer = window.setTimeout(reveal, DRAW_SHAKE_MS);
    }
    return [wrap];
  }, { kind: 'draw' });
}

/**
 * Welcome pieces bought back when they raised what visits paid (pet.welcome
 * counted them, in WELCOME_BOUGHT's order): each goes in the meadow once.
 * Each has a fixed uid, so a piece bought on another device comes here too,
 * and never twice.
 */
function giveWelcomePieces(): void {
  let added = false;
  for (const def of WELCOME_BOUGHT.slice(0, Math.max(0, pet.welcome ?? 0)).map((id) => byId(id)).filter((d): d is DecorDef => !!d)) {
    const uid = `welcome-${def.id}`;
    if (burrow.items.some((i) => i.id === def.id && i.uid !== uid)) continue;
    if (burrow.items.some((i) => i.uid === uid)) continue;
    const item: PlacedItem = { uid, id: def.id, x: 0, y: 0, flip: false, placed: false };
    burrow.items.push(item);
    putOut(item);
    added = true;
  }
  if (added) saveBurrow();
}

/** Each event's free item, once, for opening the game while it runs. */
function handOutEventGifts(): void {
  for (const e of activeEvents(now(), tz)) {
    if (!e.gift || (pet.eventGifts ?? []).includes(e.id)) continue;
    pet.eventGifts = [...(pet.eventGifts ?? []), e.id];
    if (e.gift.kind === 'outfit') {
      const o = outfitById(e.gift.id);
      if (!o) continue;
      pet = giveOutfit(pet, o.id);
      savePet();
      note(`A ${e.name} gift: ${article(o.name)}.`, 'gift', `event:${e.id}`);
      // shown on her, but only worn if the player says so
      openSheet((close) => [
        h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, 'happy', 0, { ...dressOf(pet), [o.slot]: o.id }), 4, `${pet.name} trying on the ${o.name.toLowerCase()}`)),
        h('div', { class: 'eyebrow', text: e.name }),
        h('h2', { text: `A gift: ${article(o.name)}` }),
        h('p', { text: "It's in her wardrobe. Put it on now, or any time later." }),
        h('div', { class: 'actions-col' },
          button('Try it on', 'btn primary', () => {
            pet = wear(pet, o.slot, o.id);
            savePet();
            play('flip');
            goal('dress');
            close();
          }),
          button('Later', 'btn', close)),
      ], { queue: true });
    } else {
      const d = byId(e.gift.id);
      if (!d) continue;
      // The burrow keeps its own record (the uid), so a pet and burrow saved by
      // different devices can't hand the piece out twice.
      const uid = `event-${e.id}`;
      if (burrow.items.some((i) => i.uid === uid)) { savePet(); continue; }
      burrow.items.push({ uid, id: d.id, x: 0, y: 0, flip: false, placed: false });
      saveBurrow();
      savePet();
      note(`A ${e.name} gift: ${article(d.name)}.`, 'gift', `event:${e.id}`);
      openSheet((close) => [
        h('div', { class: 'event-art' }, img(itemSprite(d.art), 4)),
        h('div', { class: 'eyebrow', text: e.name }),
        h('h2', { text: `A gift: ${article(d.name)}` }),
        h('p', { text: 'It\'s waiting in the Shop, with your things. Place it wherever you like.' }),
        h('div', { class: 'actions-col' }, button('Place it', 'btn primary', () => {
          close();
          const it = burrow.items.find((i) => i.uid === uid && !i.placed);
          if (it) putOutPiece(it); else goTab('shop', { arrange: true });
        }), button('Later', 'btn', close)),
      ], { queue: true });
    }
  }
}

function newUid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ------------------------------------------------------------------ friends

const errCode = (e: unknown) => String((e as { code?: unknown })?.code ?? '');

let lastShowcaseSig = '';
let lastShowcaseAt = 0;
let showcaseTimer = 0;

/**
 * Publish her snapshot for friends and the home-screen widget. Debounced, and
 * only when something a friend would see changed, or it's gone stale (the
 * widget reads her needs from it).
 */
function queueShowcase(): void {
  if (!OR.user || !OR.capabilities.has('showcase.publish') || !pet) return;
  window.clearTimeout(showcaseTimer);
  showcaseTimer = window.setTimeout(publishShowcase, 4000);
}
function publishShowcase(): void {
  if (!OR.user || !OR.capabilities.has('showcase.publish') || !pet) return;
  window.clearTimeout(showcaseTimer);
  const d = buildShowcase(pet, burrow, pinsToShow());
  const sig = showcaseSignature(d);
  if (sig === lastShowcaseSig && Date.now() - lastShowcaseAt < 20 * 60_000) return;
  lastShowcaseSig = sig;
  lastShowcaseAt = Date.now();
  void OR.showcase.publish(d as unknown as Record<string, unknown>).catch(() => { lastShowcaseSig = ''; });
}

type GiftIn = Awaited<ReturnType<typeof OR.gifts.inbox>>[number];
/** Gifts a guest brought in, by the friend's id: tap them to open it (guests.ts carriedGifts). */
let carried = new Map<string, GiftIn>();

/** Open gifts: claim each and pay it out. Returns how many opened and the clover they paid. */
async function openGifts(gifts: GiftIn[]): Promise<{ opened: number; clover: number }> {
  let opened = 0, clover = 0;
  for (const g of gifts) {
    try {
      await OR.gifts.claim(g.giftUuid);
    } catch (e) {
      // claimed on another device, or expired: nothing to pay out
      if (errCode(e) !== 'gifts/claimed' && errCode(e) !== 'gifts/not-found') toast("Couldn't open that one. Try again later.");
      continue;
    }
    const paid = applyGift(pet, { kind: g.kind, from: g.from.uuid }, now(), tz);
    pet = paid.state;
    clover += paid.clover;
    opened++;
    const find = findOfGift(g.kind);
    if (find) note(`${article(find.name).replace(/^./, (x) => x.toUpperCase())} from ${g.from.username}, for the shelf.`, find.id as ItemArt);
    else note(`A gift from ${g.from.username}.`, (giftInfo(g.kind)?.art ?? 'gift') as ItemArt, `giftfrom:${g.from.uuid}`);
    if (paid.completed) {
      const set = paid.completed;
      toast(`${set.name} set complete, thanks to ${g.from.username}!`, () => play('find'));
      note(`Finished the ${set.name.toLowerCase()} set, with help from ${g.from.username}.`, 'sparkle', `set:${set.id}`);
    }
  }
  if (opened) { payLumps(settleLumps(pet)); savePet(); play('gift'); haptic('success'); }
  return { opened, clover };
}

/** A guest's parcel, opened by tapping them. */
async function openCarried(fromUuid: string, rabbit: string): Promise<void> {
  const g = carried.get(fromUuid);
  if (!g) return;
  carried.delete(fromUuid);
  const r = await openGifts([g]);
  if (r.opened) {
    const info = giftInfo(g.kind);
    toast(`${rabbit} brought you ${info ? info.name.replace(/^A /, 'a ') : 'a surprise'}!${r.clover ? ` +${r.clover} clover.` : ''}`);
  }
  render();
}

/**
 * Gifts from friends. One a guest brought waits with them in the burrow
 * (tap them to open it); the rest open together from a sheet.
 */
async function checkInbox(): Promise<void> {
  if (!OR.user || !OR.capabilities.has('gifts.send')) return;
  const all = await OR.gifts.inbox().catch(() => [] as GiftIn[]);
  const split = carriedGifts(all, visitTurns, now());
  const fresh = [...split.carried.keys()].filter((id) => !carried.has(id));
  carried = split.carried;
  const gifts = split.loose;
  // say so once, for a guest already in (one at the door will be noticed when they hop in)
  const inNow = guestsHere(visitTurns, now()).filter((t) => fresh.includes(t.visit.from.uuid));
  if (inNow.length) toast(`${names(inNow.map((t) => t.data.name))} brought ${inNow.length === 1 ? 'a gift' : 'gifts'}. Tap ${inNow.length === 1 ? 'them' : 'one'} to open it.`);
  render();
  if (!gifts.length || sheetPending('inbox')) return;
  openSheet((close) => {
    const open = button(gifts.length === 1 ? 'Open it' : `Open all ${gifts.length}`, 'btn primary', async () => {
      open.disabled = true;
      const { opened, clover } = await openGifts(gifts);
      if (opened) toast(`${opened === 1 ? 'Gift opened.' : `${opened} gifts opened.`}${clover ? ` +${clover} clover.` : ''}`);
      render();
      close();
    });
    return [
      h('div', { class: 'event-art' }, img(itemSprite('gift'), 4)),
      h('div', { class: 'eyebrow', text: 'From your friends' }),
      h('h2', { text: gifts.length === 1 ? `${gifts[0]!.from.username} sent you a gift` : `${gifts.length} gifts from friends` }),
      h('ul', {}, ...gifts.map((g) => {
        const info = giftInfo(g.kind);
        const art = (info?.art ?? 'gift') as ItemArt;
        return h('li', {}, h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 26))),
          h('span', { class: 'txt' }, h('span', { class: 'nm', text: info ? info.name : 'A surprise' }), h('span', { class: 'meta', text: `From ${g.from.username}${info ? ` · ${info.gives}` : ''}` })));
      })),
      h('div', { class: 'actions-col' }, open, button('Later', 'btn', close)),
    ];
  }, { queue: true, kind: 'inbox' });
}

interface Friend { uuid: string; username: string; data: ShowcaseData }

// ------------------------------------------------------------------ visits: friends' rabbits in her burrow

/** Today's guests and their turns in the burrow (guests.ts). */
let visitTurns: GuestTurn[] = [];
/** Who was in last tick, to say when someone arrives or goes home; null until the first look. */
let guestsSeen: string[] | null = null;

/** The guests drawn now: those whose turn it is, in the main room only (she brings friends to the burrow proper). */
function guestModelsHere(): GuestTurn[] {
  return burrowRoom === 'main' ? guestsHere(visitTurns, now()) : [];
}

function guestModels(): { id: string; coat: Coat; dress: Dress; parcel?: boolean }[] {
  return guestModelsHere().map(({ visit, data: d }) => ({ id: visit.from.uuid, coat: d.coat, dress: { head: d.head, neck: d.neck, ears: d.ears }, ...(carried.has(visit.from.uuid) ? { parcel: true } : {}) }));
}

/**
 * A guest waiting their turn hops in, and one whose hour is up hops home,
 * each with a line, while the game is open. The first look after loading is
 * silent: the visit toast has already said who came.
 */
function noticeGuests(): void {
  const n = now();
  const ids = guestsHere(visitTurns, n).map((g) => g.visit.from.uuid);
  const before = guestsSeen;
  guestsSeen = ids;
  if (!before) return;
  const byId = new Map(visitTurns.map((g) => [g.visit.from.uuid, g]));
  const left = before.map((id) => byId.get(id)).filter((g): g is GuestTurn => !!g && !ids.includes(g.visit.from.uuid) && g.untilMs <= n);
  // in after waiting a turn (not just now seen)
  const came = ids.map((id) => byId.get(id)).filter((g): g is GuestTurn => !!g && !before.includes(g.visit.from.uuid)
    && g.fromMs > (g.visit.seenAt ? Date.parse(g.visit.seenAt) : n) + 1000);
  const names = (gs: GuestTurn[]) => gs.map((g) => g.data.name).join(' and ');
  // a parcel nobody opened goes with the rest of the gifts
  if (left.some((g) => carried.has(g.visit.from.uuid))) void checkInbox();
  // one line for a changeover: "Maple and Bun hopped home, and Pip hopped in."
  const parts = [left.length ? `${names(left)} waved goodbye and hopped home` : '', came.length ? `${names(came)} hopped in to visit` : ''].filter(Boolean);
  if (parts.length) toast(`${parts.join(', and ')}.`, came.length ? () => play('pet') : undefined);
}

/**
 * Friends who visited: mark the unseen ones seen and pay out for exactly
 * those the server says this call marked (so two devices can't both pay),
 * then show who's here today.
 */
async function checkVisits(): Promise<void> {
  if (!OR.user || !OR.capabilities.has('visits.record')) return;
  const visits: VisitIn[] = await OR.visits.inbox().catch(() => []);
  const unseen = visits.filter((v) => !v.seenAt);
  if (unseen.length) {
    const r = await OR.visits.seen(unseen.slice(0, 50).map((v) => v.visitUuid)).catch(() => null);
    const fresh = r ? unseen.filter((v) => r.seen.includes(v.visitUuid)) : [];
    if (r) for (const v of unseen) if (r.seen.includes(v.visitUuid)) v.seenAt = r.seenAt;
    if (fresh.length) {
      const paid = applyVisits(pet, fresh, now(), tz);
      pet = paid.state;
      payLumps(settleLumps(pet));
      savePet();
      for (const v of fresh) note(`${v.from.username} came to visit.`, 'heart', `visitfrom:${v.from.uuid}`);
      window.setTimeout(() => {
        const who = fresh.length === 1 ? `${fresh[0]!.from.username} visited` : `${fresh.length} friends visited`;
        toast(`${who}!${paid.clover ? ` +${paid.clover} clover.` : ''}`, () => play('gift'));
      }, 1200);
    }
  }
  signGuestbookFrom(visits);
  visitTurns = guestTurns(visits, now(), tz);
  // who came in with this look goes without saying (the toast above names them)
  guestsSeen = guestsHere(visitTurns, now()).map((g) => g.visit.from.uuid);
  render();
}

/** Every visit in the inbox goes in her guest book (it keeps them past the inbox's week). */
function signGuestbookFrom(visits: VisitIn[]): void {
  const next = signGuestbook(journal, visits.map((v) => {
    const k = readKind(v.kind);
    const d = readShowcase(v.showcase);
    return {
      visitUuid: v.visitUuid, atMs: Date.parse(v.visitedAt) || now(), from: v.from.username,
      rabbit: d?.name ?? v.from.username, care: k.care, ...(k.note ? { note: k.note } : {}), ...(k.stamp ? { stamp: k.stamp } : {}),
      // how their rabbit looked, for the picture: the snapshot is only kept a week
      ...(d ? { look: { coat: d.coat, ears: d.ears, head: d.head, neck: d.neck } } : {}),
    };
  }));
  if (next === journal) return;
  journal = { ...next, rev: journal.rev + 1 };
  queueJournal();
}

function guestbookLine(): string {
  const n = journal.guestbook?.length ?? 0;
  return n ? `${n} ${n === 1 ? 'visit' : 'visits'}, and the notes friends left` : 'Who came to visit, and the notes they left';
}

function openGuestbook(): void {
  showFriends('book');
}

/** A rabbit's picture for a signature: their rabbit as they looked, with the stamp they signed with in the corner. */
function guestPicture(look: { coat?: string; ears?: string; head?: string | null; neck?: string | null } | undefined, stamp?: string): HTMLElement {
  const coat = (COATS as readonly string[]).includes(look?.coat ?? '') ? (look!.coat as Coat) : null;
  const ears = (EARS as readonly string[]).includes(look?.ears ?? '') ? (look!.ears as Ears) : 'long';
  const pic = coat ? img(rabbitSprite(coat, 'happy', 0, { head: look?.head ?? null, neck: look?.neck ?? null, ears }), 1) : img(itemSprite('heart'), 2);
  const st = stamp ? itemSprite(stamp as ItemArt) : null;
  return h('span', { class: 'polaroid', 'aria-hidden': 'true' }, pic, st ? h('span', { class: 'stamp' }, img(st, fitScale(st, 16))) : null);
}

/** One signature in the guest book: their rabbit's picture and stamp, who, when, what they did, their note, and a pin. */
function guestbookEntry(g: NonNullable<Journal['guestbook']>[number]): HTMLElement {
  const did = visitInfo(g.care)?.did;
  const note = g.note && isNote(g.note) ? noteText(g.note, pet.name) : null;
  const pinned = !!journal.pinned?.includes(g.visitUuid);
  let pin: HTMLButtonElement | null = null;
  if (note) {
    pin = button(pinned ? 'Pinned' : 'Pin', pinned ? 'btn small primary pin-btn' : 'btn small pin-btn', () => pinNote(g.visitUuid));
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', pinned ? `Take ${g.rabbit}'s note off the corkboard` : `Pin ${g.rabbit}'s note to the corkboard`);
  }
  return h('li', { class: `sig${pinned ? ' pinned' : ''}` },
    guestPicture(g.look, g.stamp),
    h('span', { class: 'txt' },
      h('span', { class: 'nm', text: `${g.rabbit} (${g.from})` }),
      h('span', { class: 'meta', text: `${fmtDate(g.atMs)}${did ? ` · ${did}` : ''}` }),
      note ? h('span', { class: 'quote', text: `“${note}”` }) : null),
    pin);
}

/** Pin a note to her corkboard, or take it down. Friends see what's pinned once the corkboard is up. */
function pinNote(visitUuid: string): void {
  const before = journal.pinned ?? [];
  const pinned = togglePin(before, visitUuid);
  const pinning = pinned.includes(visitUuid);
  journal = { ...journal, pinned, rev: journal.rev + 1 };
  queueJournal();
  play('flip');
  if (pinning && before.length >= MAX_PINS) toast(`The corkboard holds ${MAX_PINS}: the oldest note came down to make room.`);
  else if (pinning && !corkboardUp()) toast('Pinned. Hang the corkboard (in the Shop) and friends can read it too.');
  else toast(pinning ? 'Pinned to the corkboard.' : 'Taken down.');
  queueShowcase();
  friendsSig = '';
  render();
}

const corkboardUp = (): boolean => burrow.items.some((i) => i.id === 'corkboard' && i.placed);

/** Her pinned notes, as friends see them: only once the corkboard is up. */
function pinsToShow(): PinShow[] {
  if (!corkboardUp()) return [];
  const book = journal.guestbook ?? [];
  return (journal.pinned ?? []).map((u) => book.find((g) => g.visitUuid === u)).flatMap((g) => {
    if (!g?.note || !isNote(g.note)) return [];
    const c = (COATS as readonly string[]).includes(g.look?.coat ?? '') ? (g.look!.coat as Coat) : undefined;
    return [{ r: g.rabbit.slice(0, 16), n: g.note, ...(g.stamp ? { s: g.stamp } : {}), ...(c ? { c } : {}) }];
  });
}

/** A corkboard's notes, hers or a friend's: each with the visitor's rabbit and stamp, on the board's cover. */
function openCorkboard(title: string, pins: { rabbit: string; text: string; stamp?: string; look?: { coat?: string } }[], cover: string, empty: string): void {
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Corkboard' }),
    h('h2', { text: title }),
    pins.length
      ? h('ul', { class: `cork cover-${cover}` }, ...pins.map((p, i) => h('li', { class: `slip slip-${i % 4}` },
        guestPicture(p.look, p.stamp), h('span', { class: 'txt' }, h('span', { class: 'quote', text: `“${p.text}”` }), h('span', { class: 'meta', text: p.rabbit })))))
      : h('p', { text: empty }),
    h('div', { class: 'actions-col' }, button('OK', 'btn', close)),
  ]);
}

function openOwnCorkboard(): void {
  const book = journal.guestbook ?? [];
  const pins = (journal.pinned ?? []).map((u) => book.find((g) => g.visitUuid === u)).flatMap((g) =>
    g?.note && isNote(g.note) ? [{ rabbit: g.rabbit, text: noteText(g.note, pet.name), ...(g.stamp ? { stamp: g.stamp } : {}), ...(g.look ? { look: g.look } : {}) }] : []);
  openCorkboard(`${pet.name}'s corkboard`, pins, coverOf(pet), 'Nothing pinned yet. In the guest book (on the Friends tab), pin up to four notes friends left: anyone who visits can read them here.');
}

/** The guest book's covers: buy one with clover, or swap to one she has. */
function openCovers(): void {
  openLiveSheet((close, redraw) => {
    const rows = COVERS.map((c) => {
      const owned = c.price === 0 || !!pet.covers?.includes(c.id);
      const using = coverOf(pet) === c.id;
      const right = using ? h('span', { class: 'pill', text: 'On it' }) : owned ? h('span', { class: 'pill', text: 'Use' })
        : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), c.price.toLocaleString());
      const b = menuRow(c.name, using ? 'On her guest book now' : owned ? 'Yours: tap to put it on' : 'A cover for her guest book and corkboard',
        h('span', { class: `cover-swatch cover-${c.id}` }, img(itemSprite(c.art as ItemArt), 2)), () => {
          if (using) return;
          if (owned) { pet = useCover(pet, c.id); savePet(); play('flip'); queueShowcase(); friendsSig = ''; redraw(); return; }
          const r = buyCover(pet, c.id);
          if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? moreClover(c.price) : "Can't buy that one."); return; }
          pet = r.state; savePet(); play('clover'); toast(`${c.name} cover on.`); queueShowcase(); friendsSig = ''; redraw();
        }, right);
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: 'Guest book' }),
      h('h2', { text: 'Covers' }),
      h('p', { class: 'note', text: 'Friends see it on her corkboard too.' }),
      h('div', { class: 'menu' }, ...rows),
      h('div', { class: 'actions-col' }, button('Done', 'btn', close)),
    ];
  });
}

/** Writing a note for a friend's guest book: an opener, what it's about, and what to say, with a preview. */
function openComposer(d: ShowcaseData, current: string | null, done: (code: string | null) => void): void {
  const subjects = subjectsFor(d);
  const ph: Phrase = phraseOf(current) ?? { o: 0, s: subjects[0] ?? 0, p: 0 };
  openSheet((close) => {
    const preview = h('p', { class: 'note-preview', 'aria-live': 'polite' });
    const rows: { key: keyof Phrase; btns: { i: number; b: HTMLButtonElement }[] }[] = [];
    // updated in place, so each row keeps where it's scrolled to
    const sync = () => {
      preview.textContent = `“${noteText(phraseCode(ph), d.name)}”`;
      for (const r of rows) for (const { i, b } of r.btns) b.setAttribute('aria-pressed', String(ph[r.key] === i));
    };
    const row = (label: string, opts: { i: number; text: string }[], key: keyof Phrase) => {
      const btns = opts.map((o) => {
        const b = h('button', { class: 'note-chip', type: 'button', text: o.text });
        b.addEventListener('click', () => { ph[key] = o.i; play('flip'); sync(); });
        return { i: o.i, b };
      });
      rows.push({ key, btns });
      return h('div', { class: 'compose-row' }, h('div', { class: 'pick-label', text: label }),
        h('div', { class: 'note-chips', role: 'group', 'aria-label': label }, ...btns.map((x) => x.b)));
    };
    const shuffle = button('Surprise me', 'btn small', () => {
      ph.o = Math.floor(Math.random() * OPENERS.length);
      ph.s = subjects[Math.floor(Math.random() * subjects.length)] ?? 0;
      ph.p = Math.floor(Math.random() * PRAISE.length);
      play('flip');
      sync();
      for (const r of rows) r.btns.find((x) => x.i === ph[r.key])?.b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    const kids = [
      h('div', { class: 'eyebrow', text: `${d.name}'s guest book` }),
      h('h2', { text: 'Write a note' }),
      preview,
      row('Start', OPENERS.map((t, i) => ({ i, text: t ? t.replace('{name}', d.name) : '(none)' })), 'o'),
      row('About', subjects.map((i) => ({ i, text: subjectText(i, d.name) ?? '' })), 's'),
      row('Say', PRAISE.map((t, i) => ({ i, text: t })), 'p'),
      h('div', { class: 'actions-col' },
        button('Sign with this', 'btn primary', () => { done(phraseCode(ph)); close(); }),
        shuffle,
        button(current ? 'No note' : 'Not now', 'btn', () => { if (current) done(null); close(); })),
    ];
    sync();
    return kids;
  });
}

/** Her stamp, the one she signs friends' guest books with: the free ones and anything she's collected. */
function openStamps(current: string, done: (id: string) => void): void {
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Your stamp' }),
    h('h2', { text: 'Sign with…' }),
    h('p', { class: 'note', text: 'Every find and keepsake she collects is a stamp you can sign with.' }),
    h('div', { class: 'stamp-grid', role: 'group', 'aria-label': 'Stamps' }, ...stampsFor(pet).map((id) => {
      const sp = itemSprite(id as ItemArt);
      const b = h('button', { class: 'stamp-btn', type: 'button', 'aria-pressed': String(id === current), 'aria-label': id }, img(sp, fitScale(sp, 28)));
      b.addEventListener('click', () => { done(id); close(); });
      return b;
    })),
    h('div', { class: 'actions-col' }, button('Cancel', 'btn', close)),
  ]);
}

function visitLine(v: VisitIn, name: string): string {
  const info = visitInfo(v.kind);
  const note = readKind(v.kind).note;
  // kept short for the one-line line: who they are in full is in the guest book
  return `${name} ${info ? info.did : 'came to visit'}.${note ? ` “${noteText(note, pet.name)}”` : ''}`;
}

function greetGuest(i: number): void {
  const g = guestModelsHere()[i];
  if (!g || !scene) return;
  scene.cheerGuest(i, performance.now());
  if (carried.has(g.visit.from.uuid)) { void openCarried(g.visit.from.uuid, g.data.name); return; }
  play('pet');
  heldLine = { text: visitLine(g.visit, g.data.name), until: performance.now() + LINE_HOLD_MS };
  setLine(ui.moodline, heldLine.text);
}

function sendGift(f: Friend, done: () => void): void {
  openSheet((close) => {
    /** Send `kind`; on success, `after` updates her (a spare find leaves her shelf). */
    const send = async (b: HTMLButtonElement, kind: string, after: (p: PetState) => PetState = (p) => p) => {
      b.disabled = true;
      try {
        await OR.gifts.send({ toUserUuid: f.uuid, kind });
      } catch (e) {
        const c = errCode(e);
        play('nope');
        toast(c === 'gifts/already-sent-today' ? `You've sent ${f.username} a gift today already.`
          : c === 'gifts/too-many' ? "That's all the gifts for today. More tomorrow."
            : c === 'gifts/not-connected' ? `You and ${f.username} aren't connected any more.`
              : "Couldn't send it just now.");
        if (c === 'gifts/already-sent-today') done();
        close();
        return;
      }
      const reward = rewardGiftSent(after(pet), f.uuid, now(), tz);
      pet = reward.state;
      payLumps(settleLumps(pet));
      savePet();
      play('gift');
      haptic('success');
      toast(`Sent to ${f.username}!`);
      note(`Sent ${f.username} a gift.`, 'gift', 'gift:first');
      render();
      done();
      close();
    };
    const kinds = GIFT_KINDS.map((k) => {
      const info = GIFT_INFO[k];
      const s = itemSprite(info.art as ItemArt);
      const golden = pet.pantry?.golden ?? 0;
      const meta = k === 'golden' ? `${info.gives} · you have ${golden}` : info.gives;
      const b = h('button', { class: 'seed', type: 'button' }, img(s, fitScale(s, 26)), h('span', { class: 'nm', text: info.name }), h('span', { class: 'meta', text: meta }));
      // a golden carrot comes out of her pantry, so only when there's one to give
      b.addEventListener('click', () => void send(b, k, k === 'golden' ? (p) => takeGolden(p) ?? p : undefined));
      if (k === 'golden' && golden < 1) setOff(b, 'No golden carrots in the pantry. Grow one in the garden, or she might find one foraging.');
      return b;
    });
    // Spares: what they're missing first, when their snapshot says
    const missing = new Set(f.data.missing ?? []);
    const spares = spareFinds(pet).sort((a, b) => Number(missing.has(b.id)) - Number(missing.has(a.id)));
    const spareBtns = spares.map((c) => {
      const s = itemSprite(c.id as ItemArt);
      const needed = missing.has(c.id);
      const b = h('button', { class: 'seed', type: 'button', 'aria-label': `${c.name}. You have ${pet.collection?.[c.id] ?? 0}.${needed ? ` ${f.data.name} hasn't found one yet.` : ''}` },
        img(s, fitScale(s, 26)), h('span', { class: 'nm', text: c.name }),
        h('span', { class: 'meta', text: needed ? `${f.data.name} hasn't got one` : `You have ${pet.collection?.[c.id] ?? 0}` }));
      if (needed) b.classList.add('wanted');
      b.addEventListener('click', () => void send(b, findGiftKind(c.id), (p) => giveFind(p, c.id) ?? p));
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: `For ${f.data.name}` }),
      h('h2', { text: `Send ${f.username} a gift` }),
      h('div', { class: 'gift-kinds' }, ...kinds),
      ...(spareBtns.length ? [h('h3', { class: 'gift-sub', text: 'Or a spare find for their shelf' }), h('div', { class: 'gift-kinds' }, ...spareBtns)] : []),
      h('p', { class: 'note', text: spareBtns.length ? 'One gift a friend a day. Spares are finds you have more than one of.' : 'Finds you have more than one of can be given away too.' }),
      h('div', { class: 'actions-col' }, button('Not now', 'btn', close)),
    ];
  });
}

/** What thriving brings, and how to keep her there. */
function openThriving(): void {
  const pct = (x: number) => `${Math.round((x - 1) * 100)}%`;
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite('shine'), 4)),
    h('div', { class: 'eyebrow', text: 'Thriving' }),
    h('h2', { text: thriving(pet.needs) ? `${pet.name} is thriving` : `${pet.name} isn't thriving just now` }),
    h('p', { text: `While her food, joy and clean are all ${THRIVING.above} or more, she finds ${pct(THRIVING.odds)} more things, ${pct(THRIVING.odds)} more wild visitors drop by, and her daily gift is ${pct(THRIVING.gift)} bigger.` }),
    h('p', { class: 'note', text: "Look after her before bed and she'll still be thriving when you open her morning gift. Friends' visits help too." }),
    h('div', { class: 'actions-col' }, button('OK', 'btn', close)),
  ]);
}

/** A gift that can come along on a visit. `off`: why it can't, shown greyed. */
interface GiftPick { kind: string; name: string; short: string; art: ItemArt; meta: string; wanted?: boolean; off?: string; after?: (p: PetState) => PetState | null }

/** What she could bring a friend: spares they're missing first, then the pantry and a warm hello, then other spares. */
function giftChoices(d: ShowcaseData): GiftPick[] {
  const missing = new Set(d.missing ?? []);
  const golden = pet.pantry?.golden ?? 0;
  const spares = spareFinds(pet).map((c): GiftPick => ({
    kind: findGiftKind(c.id), name: c.name, short: c.name, art: c.id as ItemArt, wanted: missing.has(c.id),
    meta: missing.has(c.id) ? `${d.name} hasn't got one. You have ${pet.collection?.[c.id] ?? 0}.` : `A spare. You have ${pet.collection?.[c.id] ?? 0}.`,
    after: (p) => giveFind(p, c.id),
  }));
  const SHORT: Record<string, string> = { golden: 'Golden carrot', berry: 'Strawberry', hug: 'Warm hello' };
  const basics = GIFT_KINDS.map((k): GiftPick => ({
    kind: k, name: GIFT_INFO[k].name, short: SHORT[k] ?? GIFT_INFO[k].name, art: GIFT_INFO[k].art as ItemArt,
    meta: k === 'golden' ? `${GIFT_INFO[k].gives}. You have ${golden}.` : GIFT_INFO[k].gives,
    ...(k === 'golden' ? { after: (p: PetState) => takeGolden(p), ...(golden < 1 ? { off: 'No golden carrots in the pantry. Grow one in the garden, or she might find one foraging.' } : {}) } : {}),
  }));
  // what she can't give right now (no golden carrot yet) goes last
  return [...spares.filter((g) => g.wanted), ...basics.filter((g) => !g.off), ...spares.filter((g) => !g.wanted), ...basics.filter((g) => g.off)];
}

/** Send the gift that comes with a visit. A gift that can't go doesn't undo the visit: it just says so. */
async function bringGift(f: Friend, g: GiftPick): Promise<boolean> {
  try {
    await OR.gifts.send({ toUserUuid: f.uuid, kind: g.kind });
  } catch (e) {
    const c = errCode(e);
    toast(c === 'gifts/already-sent-today' ? `You've sent ${f.username} a gift today already, so it stayed home.`
      : c === 'gifts/too-many' ? "That's all the gifts for today, so it stayed home." : "The gift couldn't go just now, so it stayed home.");
    return false;
  }
  const given = g.after ? g.after(pet) ?? pet : pet;
  pet = rewardGiftSent(given, f.uuid, now(), tz).state;
  savePet();
  friendsCache?.giftSent.add(f.uuid);
  note(`Brought ${f.username} a gift.`, 'gift', 'gift:first');
  return true;
}

/** A friend's burrow, read-only: their room, their rabbit, pottering about. */
/** `onLeave`: after coming back home, as the Friends page does to see what changed. */
function visitFriend(f: Friend, onLeave?: () => void): void {
  const d = f.data;
  const prevFocus = document.activeElement as HTMLElement | null;
  const canvas = h('canvas', { role: 'img', 'aria-label': `${d.name}'s burrow` });
  const stage = h('div', { class: 'stage' }, canvas);
  const back = button('Back', 'btn', () => leave());
  back.setAttribute('aria-label', 'Back home');
  const holiday = !!d.vacationUntilMs && d.vacationUntilMs > now();
  const outNow = (n: number) => !!d.outUntilMs && d.outUntilMs > n;
  const needs = friendNeeds(d, now());
  const hint = holiday ? null : careHint(needs);
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite', text: holiday ? `${d.name} is away on holiday.`
    : outNow(now()) ? `${d.name} is out foraging. Pick something to leave for her.`
    : hint ? `${d.name}'s ${hint.word}. Pick something to do for her.` : `${d.name} is happy to have a visitor. Pick something to do for her.` });
  setLine(moodline, moodline.textContent ?? '');
  // How she is, from their snapshot: the one place a visitor sees it.
  const NEED_LABEL: Record<NeedKey, string> = { happy: 'Joy', clean: 'Clean', hunger: 'Food', energy: 'Rest' };
  const meters = holiday ? null : h('div', { class: 'visit-needs', role: 'group', 'aria-label': `How ${d.name} is` },
    ...(['happy', 'clean', 'hunger', 'energy'] as NeedKey[]).map((k) => {
      const v = Math.round(needs[k]);
      const low = !!hint && VISIT_INFO[hint.kind].need === k;
      return h('div', { class: low ? 'low' : '', role: 'meter', 'aria-label': NEED_LABEL[k], 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': v },
        h('span', { text: NEED_LABEL[k] }), h('s', {}, h('u', { style: `width:${Math.max(3, v)}%` })));
    }));

  // One act of care per friend a day: pick one (the one that helps most is
  // picked to start with), maybe a note for her guest book, then drop by. It
  // shows up in their burrow as you, and pays you a little.
  const canVisit = OR.capabilities.has('visits.record');
  let pick: VisitKind = hint?.kind ?? 'pat';
  let pickedNote: string | null = null;
  let stamp = settings.stamp && stampsFor(pet).includes(settings.stamp) ? settings.stamp : 'heart';
  const NEED_WORD: Record<VisitKind, string> = { pat: '+ joy', snack: '+ food', brush: '+ clean' };
  const care = VISIT_KINDS.map((k) => {
    const info = VISIT_INFO[k];
    const b = h('button', { class: 'act', type: 'button', 'aria-pressed': String(k === pick) },
      hint?.kind === k ? h('span', { class: 'helps', text: 'Helps most' }) : null,
      img(itemSprite(info.art as ItemArt), 3), h('span', { text: info.label }), h('small', { text: NEED_WORD[k] }));
    b.addEventListener('click', () => { pick = k; play('flip'); sync(); });
    return b;
  });
  const noteBtn = h('button', { class: 'note-chip write', type: 'button' });
  noteBtn.addEventListener('click', () => openComposer(d, pickedNote, (code) => { pickedNote = code; sync(); }));
  const stampBtn = h('button', { class: 'stamp-chip', type: 'button' });
  stampBtn.addEventListener('click', () => openStamps(stamp, (id) => { stamp = id; settings.stamp = id; saveSettings(); sync(); }));
  // A gift comes along on the visit: something from her pantry, a warm hello, or a spare find (theirs to finish a set first).
  const canGift = canVisit && OR.capabilities.has('gifts.send');
  let pickedGift: GiftPick | null = null;
  const giftPicks = canGift ? giftChoices(d) : [];
  const giftChips = giftPicks.map((g) => {
    const s = itemSprite(g.art);
    const b = h('button', { class: `gift-chip${g.wanted ? ' wanted' : ''}`, type: 'button', 'aria-pressed': 'false', 'aria-label': `${g.name}. ${g.meta}` },
      img(s, fitScale(s, 22)), h('span', { class: 'nm', text: g.short }));
    if (g.off) setOff(b, g.off);
    else b.addEventListener('click', () => { pickedGift = pickedGift === g ? null : g; play('flip'); sync(); });
    return b;
  });
  const giftLine = h('div', { class: 'pick-label' }, 'Bring a gift · ', h('em', { text: 'optional' }));
  const giftBox = h('div', { class: 'gift-chips', role: 'group', 'aria-label': `A gift for ${d.name}` }, ...giftChips);
  if (canGift) void OR.gifts.sentToday().then((s) => { if (s.includes(f.uuid)) { giftLine.hidden = giftBox.hidden = true; pickedGift = null; sync(); } }).catch(() => undefined);
  const DO: Record<VisitKind, (name: string) => string> = { pat: (n) => `Pat ${n}`, snack: (n) => `Feed ${n}`, brush: (n) => `Brush ${n}` };
  const go = h('button', { class: 'btn primary grow', type: 'button' });
  go.addEventListener('click', () => void doVisit());
  let done = false;
  function sync(): void {
    care.forEach((b, i) => b.setAttribute('aria-pressed', String(VISIT_KINDS[i] === pick)));
    noteBtn.textContent = pickedNote ? `“${noteText(pickedNote, d.name)}”` : 'Write a note…';
    noteBtn.setAttribute('aria-pressed', String(!!pickedNote));
    const sp = itemSprite(stamp as ItemArt);
    stampBtn.replaceChildren(img(sp, fitScale(sp, 22)));
    stampBtn.setAttribute('aria-label', 'Your stamp. Change it');
    giftChips.forEach((b, i) => b.setAttribute('aria-pressed', String(giftPicks[i] === pickedGift)));
    if (done) return;
    go.textContent = `${DO[pick](d.name)}${pickedGift ? ' + gift' : ''}${paidVisitsLeft() ? ` · +${visitPay(pet)} clover` : ''}`;
  }
  sync();
  const careBox = h('div', { class: 'visit-pick' },
    h('div', { class: 'pick-label', text: `Do something for ${d.name}` }),
    h('div', { class: 'actions visit-care', role: 'group', 'aria-label': 'Care' }, ...care),
    ...(giftChips.length ? [giftLine, giftBox] : []),
    h('div', { class: 'pick-label' }, 'Sign her guest book · ', h('em', { text: 'optional' })),
    h('div', { class: 'note-row' }, stampBtn, noteBtn));
  const visited = (line = `You've visited ${d.name} today.`) => {
    done = true;
    for (const b of [...care, noteBtn, stampBtn, ...giftChips]) b.disabled = true;
    careBox.hidden = true;
    go.disabled = true;
    go.textContent = 'Visited today';
    setLine(moodline, line);
  };
  if (canVisit) void OR.visits.sentToday().then((s) => { if (s.includes(f.uuid) && !done) visited(); }).catch(() => undefined);
  async function doVisit(): Promise<void> {
    if (done) return;
    const k = pick;
    go.disabled = true;
    try {
      await OR.visits.record({ toUserUuid: f.uuid, kind: visitKind(k, pickedNote, stamp) });
    } catch (e) {
      const c = errCode(e);
      play('nope');
      toast(c === 'visits/already-visited-today' ? `You've visited ${f.username} today already.`
        : c === 'visits/too-many' ? "That's all the visits for today. More tomorrow."
          : c === 'visits/not-connected' ? `You and ${f.username} aren't connected any more.`
            : "Couldn't do that just now.");
      if (c === 'visits/already-visited-today') visited(); else go.disabled = false;
      return;
    }
    const r = rewardVisit(pet, f.uuid, now(), tz);
    pet = r.state;
    payLumps(settleLumps(pet));
    savePet();
    sc.react('happy', performance.now());
    play('pet');
    haptic('success');
    const noted = !!pickedNote;
    const brought = pickedGift ? await bringGift(f, pickedGift) : false;
    const extras = [brought ? 'your gift' : '', noted ? 'your note' : ''].filter(Boolean).join(' and ');
    visited(`${VISIT_INFO[k].line(d.name)} ${f.username} will see your rabbit in their burrow${extras ? `, with ${extras}` : ''}.`);
    if (r.clover) toast(`+${r.clover} clover.`);
    note(`Visited ${d.name} and ${VISIT_INFO[k].did}.`, 'heart', `visitcare:${f.uuid}`);
    goal('friend');
    render();
  }

  // Hosts without visits still send gifts on their own.
  const giftRow = !canVisit && OR.capabilities.has('gifts.send') ? (() => {
    const giftBtn = button('Gift', 'btn small', () => sendGift(f, () => { giftBtn.disabled = true; giftBtn.textContent = 'Sent'; }));
    void OR.gifts.sentToday().then((s) => { if (s.includes(f.uuid)) { giftBtn.disabled = true; giftBtn.textContent = 'Sent'; } }).catch(() => undefined);
    return h('div', { class: 'also-gift' }, img(itemSprite('strawberry'), 2), h('span', { class: 'txt' }, h('b', { text: 'Send a gift?' }), h('span', { class: 'sub', text: 'One gift a friend a day.' })), giftBtn);
  })() : null;
  // Their garden, for friends on a version that shares it: the same garden
  // scene, drawn from a stand-in pet, showing only what they've built.
  const gardenPet = friendGardenPet(d);
  const gcanvas = h('canvas', { role: 'img', 'aria-label': `${d.name}'s garden`, hidden: true });
  const gscene = gardenPet ? new GardenScene(gcanvas) : null;
  // their rooms (the first, and any they've dug out) and their garden, as tabs
  let view: RoomId | 'garden' = 'main';
  let garea: AreaId = 'patch';
  const views: (RoomId | 'garden')[] = ['main', ...(ROOMS_OPEN ? EXTRA_ROOMS.filter((r) => d.rooms?.[r]) : []), ...(gscene ? ['garden' as const] : [])];
  const viewName = (v: RoomId | 'garden') => (v === 'garden' ? 'Garden' : ROOMS[v].name);
  const title = h('div', { class: 'name', text: `${d.name}'s burrow` });
  const areaTabs = h('div', { class: 'room-tabs visit-areas', role: 'group', 'aria-label': 'Areas of the garden', hidden: true },
    ...AREAS.map((a) => {
      const b = h('button', { class: 'room-tab', type: 'button', 'aria-pressed': String(a === garea), text: AREA_NAME[a] });
      b.addEventListener('click', () => { garea = a; areaTabs.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(AREAS[i] === a))); });
      return b;
    }));
  const viewTabs = h('div', { class: 'room-tabs visit-areas', role: 'group', 'aria-label': `Look round ${d.name}'s home` },
    ...views.map((v) => {
      const b = h('button', { class: 'room-tab', type: 'button', 'aria-pressed': String(v === view), text: viewName(v) });
      b.addEventListener('click', () => {
        view = v;
        viewTabs.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(views[i] === v)));
        canvas.hidden = v === 'garden';
        gcanvas.hidden = v !== 'garden';
        areaTabs.hidden = v !== 'garden';
        if (meters) meters.hidden = v === 'garden';
        title.textContent = v === 'garden' ? `${d.name}'s garden` : v === 'main' ? `${d.name}'s burrow` : `${d.name}'s ${ROOMS[v].name.toLowerCase()}`;
        canvas.setAttribute('aria-label', title.textContent);
        fit();
      });
      return b;
    }));
  stage.append(gcanvas);
  if (meters) stage.append(meters);
  // their corkboard: the notes they've pinned from their guest book
  const theirPins = d.items.some((i) => i.id === 'corkboard') ? d.pinned ?? [] : [];
  const readTheirs = () => openCorkboard(`${d.name}'s corkboard`, theirPins.map((p) => ({ rabbit: p.r, text: noteText(p.n, d.name), ...(p.s ? { stamp: p.s } : {}), ...(p.c ? { look: { coat: p.c } } : {}) })),
    d.cover ?? 'classic', `Nothing pinned up yet. Leave ${d.name} a note and it might end up here.`);
  const corkRow = theirPins.length ? h('button', { class: 'also-gift cork-row', type: 'button' }, img(itemSprite('corkboard'), 2),
    h('span', { class: 'txt' }, h('b', { text: 'Their corkboard' }), h('span', { class: 'sub', text: `${theirPins.length} ${theirPins.length === 1 ? 'note' : 'notes'} from their guest book` })),
    h('span', { class: 'go', 'aria-hidden': 'true', text: '›' })) : null;
  corkRow?.addEventListener('click', readTheirs);
  const wrap = h('div', { class: 'visit', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Visiting ${d.name}` },
    h('header', { class: 'visit-top' },
      h('div', { class: 'who' }, title, h('div', { class: 'sub', text: `${f.username} · ${d.daysVisited} days · Bond ${d.bondLevel}` }))),
    stage,
    h('section', { class: 'panel' },
      moodline,
      views.length > 1 ? viewTabs : null,
      areaTabs,
      canVisit && !holiday ? careBox : null,
      h('div', { class: 'row2' }, back, canVisit && !holiday ? go : null),
      corkRow,
      giftRow));
  document.body.append(wrap);
  visitingFriend = true;
  app.inert = true;
  const sc = new Scene(canvas);
  const roomBurrow = (items: { id: string; x: number; y: number; flip: boolean }[]): BurrowState =>
    ({ v: 2, rev: 0, items: items.map((it, i) => ({ uid: `g${i}`, id: it.id, x: it.x, y: it.y, flip: it.flip, placed: true })) });
  const guestRooms: Partial<Record<RoomId, BurrowState>> = { main: roomBurrow(d.items) };
  for (const r of EXTRA_ROOMS) if (d.rooms?.[r]) guestRooms[r] = roomBurrow(d.rooms[r]!);
  let gscale = 1;
  const fit = () => { if (view === 'garden' && gscene) gscale = fitGarden(stage, gcanvas, gscene); else fitScene(stage, canvas, sc); };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();
  let raf = 0, lastT = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - lastT < 66 && !(view === 'garden' && gscene?.moving)) return;
    lastT = t;
    const n = now();
    const w = today(n);
    // out foraging, she isn't home to nap
    const out = outNow(n);
    const asleep = !out && !!d.napEndsAtMs && d.napEndsAtMs > n;
    if (view === 'garden' && gscene && gardenPet) {
      gscene.draw({
        pet: gardenPet, nowMs: n, area: garea, season: w.season, weather: w.weather, night: isNight(n, tz), moon: moonPhase(n),
        coat: d.coat, dress: { head: d.head, neck: d.neck, ears: d.ears }, asleep, absent: holiday || out, meadowOpen: !!d.garden?.meadow,
        items: (d.garden?.meadow ?? []).map((it, i) => ({ uid: `m${i}`, ...it, placed: true })), selected: null, guest: true, friends: d.garden?.friends ?? 0,
      }, t);
      nudgeGarden(gcanvas, gscene, gscale);
      return;
    }
    const r = view === 'garden' ? 'main' : view;
    sc.draw({ coat: d.coat, night: isNight(n, tz), mood: asleep ? 'asleep' : 'content', burrow: guestRooms[r] ?? guestRooms.main!, decorating: false, selected: null,
      dress: { head: d.head, neck: d.neck, ears: d.ears }, season: w.season, weather: w.weather, guest: true, absent: holiday || out,
      room: { wall: d.wall ?? 'plainwall', floor: d.floor ?? 'plainfloor', window: d.window ?? 'roundwindow', ...(r !== 'main' ? { variant: r } : {}) }, moon: moonPhase(n), time: clockTime(n) }, t);
  };
  raf = requestAnimationFrame(loop);
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = sc.toRoom(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
    const b = sc.rabbitBox();
    if (!holiday && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { sc.react('happy', performance.now()); play('pet'); return; }
    if (view !== 'garden' && sc.hitTest(guestRooms[view] ?? guestRooms.main!, p.x, p.y)?.id === 'corkboard') readTheirs();
  });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.scrim')) leave(); };
  document.addEventListener('keydown', onKey);
  note(`Visited ${d.name}'s burrow.`, 'heart', `visit:${f.uuid}`);
  goal('friend');
  back.focus();
  function leave(): void {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    visitingFriend = false;
    app.inert = sheetStack.length > 0;
    prevFocus?.focus();
    onLeave?.();
  }
}

// ------------------------------------------------------------------ the friends page

/** Friends' burrows, and who you've gifted and visited today. `friends` is null until the first answer. */
interface FriendsCache { at: number; friends: Friend[] | null; failed: boolean; giftSent: Set<string>; visited: Set<string> }
let friendsCache: FriendsCache | null = null;
let friendsSig = '';

/** Whether this host lets her have friends (it doesn't signed out, or in preview). */
function socialOn(): boolean {
  return !!OR.user && OR.capabilities.has('showcase.friends');
}

/** Knock on friends' doors: on opening the tab, at most once a minute unless `force`d. */
function loadFriends(force = false): void {
  if (!socialOn()) return;
  if (!force && friendsCache && !friendsCache.failed && Date.now() - friendsCache.at < 60_000) return;
  const c: FriendsCache = friendsCache ?? { at: 0, friends: null, failed: false, giftSent: new Set(), visited: new Set() };
  c.at = Date.now();
  c.failed = false;
  friendsCache = c;
  void Promise.all([
    OR.showcase.friends({ limit: 100 }).catch(() => null),
    OR.gifts.sentToday().catch(() => null),
    OR.capabilities.has('visits.record') ? OR.visits.sentToday().catch(() => null) : Promise.resolve(null),
  ]).then(([rows, gifts, visits]) => {
    if (friendsCache !== c) return; // started over meanwhile
    if (rows) {
      c.friends = rows.flatMap((r) => {
        const data = readShowcase(r.data);
        return data ? [{ uuid: r.uuid, username: r.username, data }] : [];
      });
    } else if (!c.friends) c.failed = true;
    if (gifts) c.giftSent = new Set(gifts);
    if (visits) c.visited = new Set(visits);
    friendsSig = '';
    render();
  });
}

/** Of the visits you make, how many more today pay you clover. */
function paidVisitsLeft(): number {
  const t = pet.friendToday;
  const used = t && t.day === dayKey(now(), tz, DAY_ROLLOVER_HOUR) ? t.counts.visit ?? 0 : 0;
  return Math.max(0, FRIEND_CLOVER.paidPerDay - used);
}

/** A friend's rabbit, face on, for a list. */
function friendFace(d: ShowcaseData): HTMLElement {
  return h('span', { class: 'ico big' }, img(rabbitSprite(d.coat, 'content', 0, { head: d.head, neck: d.neck, ears: d.ears }), 1, d.name));
}

/** Friends' rabbits' faces, overlapping, for a line of who's over. The last `faded` are waiting, and fainter. */
function faceStack(ds: ShowcaseData[], faded = 0): HTMLElement {
  return h('span', { class: 'face-stack', 'aria-hidden': 'true' }, ...ds.map((d, i) =>
    h('span', { class: i >= ds.length - faded ? 'face faded' : 'face' }, img(rabbitSprite(d.coat, 'content', 0, { head: d.head, neck: d.neck, ears: d.ears }), 1))));
}

/** How close you are: ten hearts to best friends (a day of visiting or gifting each way is a point). */
function friendHearts(points: number): HTMLElement {
  const best = FRIEND_CLOVER.bestFriendPoints;
  const full = Math.min(10, Math.floor((points / best) * 10));
  const text = points >= best ? 'Best friends' : `${points} of ${best} days`;
  return h('span', { class: 'friend-bond', role: 'img', 'aria-label': points >= best ? 'Best friends' : `Friendship: ${points} of ${best} days to best friends` },
    h('span', { class: 'hearts' }, ...Array.from({ length: 10 }, (_, i) => h('i', { class: i < full ? 'f' : '' }))),
    h('span', { text }));
}

/** A rabbit's face in a door of the lane, or an empty plot when there's no `d`. */
interface LaneDoor { d?: ShowcaseData; label: string; lit?: boolean; parcel?: boolean; best?: boolean; badge?: string; aria: string; onClick: () => void }
function lane(doors: LaneDoor[], cls = ''): HTMLElement {
  return h('div', { class: `lane ${cls}`.trim() },
    h('div', { class: 'lane-doors', role: 'list' }, ...doors.map((o) => {
      const b = h('button', { class: o.d ? 'door' : 'door plot', type: 'button', 'aria-label': o.aria },
        o.badge ? h('span', { class: 'door-badge', text: o.badge }) : o.best ? h('span', { class: 'door-heart' }) : null,
        o.d ? h('span', { class: o.lit ? 'door-lamp on' : 'door-lamp' }) : null,
        o.parcel ? h('span', { class: 'door-parcel' }) : null,
        h('span', { class: 'arch' }, o.d ? img(rabbitSprite(o.d.coat, 'content', 0, { head: o.d.head, neck: o.d.neck, ears: o.d.ears }), 1) : h('span', { text: '+' })),
        h('span', { class: 'plate', text: o.label }));
      b.addEventListener('click', o.onClick);
      return h('div', { role: 'listitem' }, b);
    })));
}

/** Why have friends: what they bring, with the real numbers. */
function friendPerks(): HTMLElement {
  const other = COATS.filter((c) => c !== pet.coat)[1]!;
  const pay = visitPay(pet);
  const bonuses = Object.entries(FRIEND_MILESTONES);
  const [firstN, firstC] = bonuses[0]!;
  const [lastN, lastC] = bonuses[bonuses.length - 1]!;
  const art = (a: ItemArt) => img(itemSprite(a), fitScale(itemSprite(a), 28));
  const rows: [Node, string, string][] = [
    [img(rabbitSprite(other, 'happy'), 1), 'Guests in your burrow', `Their rabbit hops in and plays with ${pet.name} for about an hour.`],
    [art('carrot'), `Help looking after ${pet.name}`, 'Friends can pat, feed or brush her when they visit.'],
    [art('clover'), 'Clover both ways', `${pay} clover when you visit a friend, and ${pay} when one visits you. The first ${FRIEND_CLOVER.paidPerDay} of each a day pay.`],
    [art('heart'), 'Best friends boost everything', `Visit back and forth for ${FRIEND_CLOVER.bestFriendPoints} days: +${Math.round(RATE.bestFriend * 100)}% clover from care, finds and her daily gift, for each of up to ${FRIEND_CLOVER.maxBestFriends}.`],
    [art('gift'), 'Friend bonuses', `${Number(firstC).toLocaleString()} clover when you and ${firstN} friends have visited each other, up to ${Number(lastC).toLocaleString()} at ${lastN}.`],
    [art('strawberry'), 'Swap spare finds', 'Send finds you have two of to friends who are still missing them.'],
  ];
  return h('ul', { class: 'list perks' }, ...rows.map(([icon, nm, sub], i) =>
    h('li', {}, h('span', { class: i === 0 ? 'ico face' : 'ico' }, icon), h('span', { class: 'txt' }, h('span', { class: 'nm', text: nm }), h('span', { class: 'sub', text: sub })))));
}

/**
 * For the Friends tab with no friends yet: the lane as it is with friends, but
 * with only the Invite plot, and her hopping about on the grass on her own.
 */
function friendsHero(action: HTMLButtonElement, text: string): HTMLElement {
  const road = lane([{ label: 'INVITE', aria: 'Invite a friend', onClick: () => openInvite() }], 'small alone');
  road.append(h('span', { class: 'lane-hopper', 'aria-hidden': 'true' }, img(rabbitSprite(pet.coat, 'content', 0, dressOf(pet)), 1)));
  return h('div', { class: 'friends-hero' },
    road,
    h('div', { class: 'txt' }, h('h2', { text: `${pet.name} would love some company` }), h('p', { text }), action));
}

/** The next friend bonus, with the friend bonuses laid out as a ladder. */
function milestoneLadder(): HTMLElement {
  const have = mutualFriends(pet);
  return h('div', { class: 'ladder', role: 'list', 'aria-label': `Friend bonuses. You have ${have} friends who've visited you back.` },
    ...Object.entries(FRIEND_MILESTONES).map(([n, c]) => h('div', { role: 'listitem', class: Number(n) <= have ? 'got' : '' },
      h('b', { text: n }), `+${c.toLocaleString()}`)));
}

/** Invite a friend: what they'll get, how people become friends here, the friend bonuses, then share. */
function openInvite(): void {
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Invite a friend' }),
    h('h2', { text: `Share ${pet.name} with a friend` }),
    h('div', { class: 'invite-card' },
      h('span', { class: 'art' }, img(rabbitSprite(pet.coat, 'happy', 0, dressOf(pet)), 2, pet.name)),
      h('span', { class: 'txt' }, h('b', { text: `Come visit ${pet.name}!` }), h('span', { text: shareText() }))),
    h('p', { class: 'note', text: 'Anyone you follow on OddsRabbit, or who follows you, shows up in Friends as soon as they have a rabbit.' }),
    h('h3', { class: 'gift-sub', text: 'Friend bonuses' }),
    milestoneLadder(),
    h('p', { class: 'meta', text: `For friends you've visited who've visited you too. You have ${mutualFriends(pet)}.` }),
    h('div', { class: 'actions-col' },
      button('Share invite', 'btn primary', () => { close(); void shareCard(); }),
      button('Not now', 'btn', close)),
  ]);
}

/** How friends work: what they bring and the few rules. */
function openFriendRules(): void {
  openSheet((close) => [
    closeX(close),
    h('h2', { text: 'How friends work' }),
    h('p', { text: `Friends are people you follow on OddsRabbit, or who follow you, once they have a rabbit. Visit each one and send them a gift once a day.` }),
    friendPerks(),
    h('h3', { class: 'gift-sub', text: 'Friend bonuses' }),
    milestoneLadder(),
    h('div', { class: 'actions-col' }, button('Invite a friend', 'btn primary', () => { close(); openInvite(); }), button('Done', 'btn', close)),
  ]);
}

/** Today's visitors in full: who's in, who's at the door waiting a turn, who's hopped home. */
function openVisitors(): void {
  openSheet((close) => {
    const n = now();
    const here = guestsHere(visitTurns, n);
    const rank = (t: GuestTurn) => (here.includes(t) ? 0 : t.fromMs > n ? 1 : 2);
    const turns = [...visitTurns].sort((a, b) => rank(a) - rank(b) || a.fromMs - b.fromMs);
    const when = (t: GuestTurn) => (here.includes(t) ? 'Here now' : t.fromMs > n ? `At the door, in ${fmtLong(t.fromMs - n)}` : 'Hopped home');
    return [
      closeX(close),
      h('h2', { text: 'Visitors today' }),
      h('ul', { class: 'list' }, ...turns.map((t) => {
        const hi = here.includes(t) ? button('Say hi', 'btn small', () => { close(); sayHi(t); }) : null;
        const did = visitInfo(t.visit.kind)?.did;
        return h('li', { class: here.includes(t) ? 'here' : '' }, friendFace(t.data),
          h('span', { class: 'txt' },
            h('span', { class: 'nm', text: t.data.name }),
            h('span', { class: 'sub', text: `${t.visit.from.username} · ${when(t)}${did ? ` · ${did}` : ''}` })),
          hi);
      })),
      h('p', { class: 'note', text: 'Two friends can be over at once, for about an hour each; the rest wait at the door for a turn. Everyone signs the guest book.' }),
    ];
  });
}

/** Over to the burrow to say hello to a guest who's in. */
function sayHi(t: GuestTurn): void {
  goTab('burrow');
  if (burrowRoom !== 'main') goRoom('main');
  const i = guestModelsHere().findIndex((g) => g.visit.visitUuid === t.visit.visitUuid);
  if (i >= 0) greetGuest(i);
}

/** Names as a sentence: "Pip", "Pip and Bun", "Pip, Bun and Maple". */
function names(ns: string[]): string {
  return ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

/** The Friends page's three views: today at a glance, everyone, and the guest book. */
type FriendsView = 'today' | 'all' | 'book';
let friendsView: FriendsView = 'today';
/** Signatures newer than this showed as New when the guest book was opened (settings.guestbookSeenMs keeps up). */
let bookNewSince = 0;
/** Full cards on Today: the friends most worth visiting now; everyone's under Friends. */
const TODAY_CARDS = 6;
/** Past this many friends, the Friends view gets a search. */
const SEARCH_FROM = 15;

/** Guest book signatures since you last looked at it. */
function unreadGuestbook(): number {
  const seen = settings.guestbookSeenMs ?? 0;
  return (journal.guestbook ?? []).filter((g) => g.atMs > seen).length;
}

/** Switch the Friends page's view (and onto the Friends tab, if it isn't showing). */
function showFriends(v: FriendsView): void {
  if (v === 'book') {
    // what's new stays marked New while you read it; next time it isn't
    bookNewSince = settings.guestbookSeenMs ?? 0;
    const newest = (journal.guestbook ?? [])[0]?.atMs ?? 0;
    if (newest > (settings.guestbookSeenMs ?? 0)) { settings.guestbookSeenMs = newest; saveSettings(); }
  }
  friendsView = v;
  friendsSig = '';
  if (tab !== 'friends') goTab('friends');
  else { ui.page.body.scrollTop = 0; render(); }
}

/**
 * The Friends page, in three views under a switch: Today (who's over, or your
 * friends' doors; the ones to visit now; anything new in the guest book),
 * Friends (everyone, as a list to search), and the Guest book.
 */
function renderFriendsPage(): void {
  const n = now();
  const here = guestsHere(visitTurns, n);
  const waiting = visitTurns.filter((t) => t.fromMs > n).sort((a, b) => a.fromMs - b.fromMs);
  const c = friendsCache;
  const book = journal.guestbook ?? [];
  const unread = unreadGuestbook();
  const day = dayKey(n, tz, DAY_ROLLOVER_HOUR);
  const points = (uuid: string) => pet.friends?.[uuid]?.points ?? 0;
  const cameBy = (uuid: string) => pet.friends?.[uuid]?.in === day || visitTurns.some((t) => t.visit.from.uuid === uuid);
  const sig = [
    friendsView, unread,
    visitTurns.map((t) => `${t.visit.visitUuid}:${here.includes(t) ? 'h' : t.fromMs > n ? 'w' : 'g'}`).join(),
    waiting.length ? Math.floor(n / 60_000) : 0,
    // their needs wear down: look again every ten minutes
    Math.floor(n / 600_000), day,
    c ? `${c.friends?.map((f) => `${f.uuid}:${points(f.uuid)}:${cameBy(f.uuid)}`).join() ?? 'loading'}|${c.failed}|${[...c.giftSent].join()}|${[...c.visited].join()}` : 'none',
    book.length, recentVisitors().length, (journal.pinned ?? []).join(), coverOf(pet), paidVisitsLeft(), visitPay(pet), hasUpgrade(pet, 'meadow'), socialOn(), mutualFriends(pet), pet.name, pet.coat, dressKey(dressOf(pet)),
  ].join('|');
  if (sig === friendsSig) return;
  friendsSig = sig;

  const canShare = OR.capabilities.has('actions.share');
  const invite = button('Invite', 'btn small primary', () => openInvite());
  invite.prepend(img(itemSprite('heart'), 2));
  ui.page.action.replaceChildren(...(canShare ? [invite] : []));
  ui.page.title.textContent = 'Friends';
  const friends = c?.friends ?? null;
  const toVisit = friends ? friends.filter((f) => !c!.visited.has(f.uuid)).length : 0;
  const subs = [here.length ? `${here.length} over` : null, friends?.length ? (toVisit ? `${toVisit} to visit` : 'All visited today') : null].filter(Boolean);
  ui.page.sub.textContent = subs.length ? subs.join(' · ') : socialOn() ? `${pet.name}'s friends` : `${pet.name}'s visitors`;

  // everyone, in the order to visit them: anyone who came by first, then the closest
  const best = FRIEND_CLOVER.bestFriendPoints;
  const info = (friends ?? []).map((f) => {
    const visited = c!.visited.has(f.uuid);
    return { f, visited, sent: c!.giftSent.has(f.uuid), came: cameBy(f.uuid), p: points(f.uuid), rank: friendRank({ visitedYou: cameBy(f.uuid), visited }) };
  }).sort((a, b) => a.rank - b.rank || b.p - a.p || a.f.data.name.localeCompare(b.f.data.name));
  type Info = (typeof info)[number];
  // with visits, a gift is brought along on one (visitFriend); only a host without them sends gifts on their own
  const giftsOnTheirOwn = !OR.capabilities.has('visits.record');
  const gift = (x: Info) => {
    const g = button(x.sent ? 'Gift sent' : 'Gift', x.sent ? 'btn small ghost' : 'btn small', () => sendGift(x.f, () => { c!.giftSent.add(x.f.uuid); friendsSig = ''; render(); }));
    if (!x.sent) g.prepend(img(itemSprite('strawberry'), 2));
    g.disabled = x.sent;
    g.setAttribute('aria-label', x.sent ? `Already sent ${x.f.username} a gift today` : `Send ${x.f.username} a gift`);
    return g;
  };
  const visitBtn = (x: Info, label: string, cls: string) => {
    const b = button(label, cls, () => visitFriend(x.f, () => loadFriends(true)));
    b.setAttribute('aria-label', `${label} ${x.f.data.name}`);
    return b;
  };

  // the switch, pinned to the top of the page as it scrolls
  const seg = (v: FriendsView, label: string, badge?: number) => {
    const b = h('button', { type: 'button', class: 'seg-tab', 'aria-pressed': String(friendsView === v) }, label,
      badge ? h('span', { class: 'seg-badge', 'aria-label': `${badge} new`, text: badge > 9 ? '9+' : String(badge) }) : null);
    b.addEventListener('click', () => { if (friendsView !== v) { play('flip'); showFriends(v); } });
    return b;
  };
  const kids: Node[] = [h('nav', { class: 'seg friends-seg', 'aria-label': 'Friends' },
    seg('today', 'Today'), seg('all', friends?.length ? `Friends · ${friends.length}` : 'Friends'), seg('book', 'Guest book', unread))];

  if (friendsView === 'today') kids.push(...friendsToday());
  else if (friendsView === 'all') kids.push(...friendsAll());
  else kids.push(...guestbookView());
  fillPage(kids);

  /** Today: who's over (or your friends' doors), anything new in the guest book, and who to visit now. */
  function friendsToday(): Node[] {
    const out: Node[] = [];
    // Friends over or at the door: her burrow, live, with them in it. Otherwise
    // (the burrow is on Home already) your friends' doors, to go and visit.
    if (visitTurns.some((t) => here.includes(t) || t.fromMs > n) || recentVisitors().length) out.push(porchCard());
    else if (socialOn() && info.length) {
      const doors = [...info].sort((a, b) => a.rank - b.rank || Number(b.p >= best) - Number(a.p >= best) || b.p - a.p).slice(0, 8);
      out.push(lane([...doors.map((x): LaneDoor => {
        const d = x.f.data;
        const out = !!d.outUntilMs && d.outUntilMs > n;
        const asleep = !out && !!d.napEndsAtMs && d.napEndsAtMs > n;
        return { d, label: d.name.toUpperCase().slice(0, 8), lit: x.visited, parcel: x.sent, best: x.p >= best,
          badge: x.rank === 0 ? 'Visit back' : asleep ? 'zzz' : undefined,
          aria: `Visit ${d.name}${x.visited ? ', visited today' : ''}${x.sent ? ', gift sent' : ''}${x.p >= best ? ', best friends' : ''}`,
          onClick: () => visitFriend(x.f, () => loadFriends(true)) };
      }), ...(canShare ? [{ label: 'INVITE', aria: 'Invite a friend', onClick: () => openInvite() }] : [])]));
    }

    // new in the guest book: say so, with the newest note, right where you'll see it
    if (unread) {
      const fresh = book.slice(0, unread);
      const noted = fresh.find((g) => g.note && isNote(g.note));
      const b = h('button', { class: 'book-news', type: 'button' },
        h('span', { class: 'ico' }, img(itemSprite('book'), 3)),
        h('span', { class: 'txt' },
          h('b', { text: unread === 1 ? `${fresh[0]!.rabbit} signed the guest book` : `${unread} new in the guest book` }),
          noted ? h('span', { class: 'quote' }, h('q', { text: noteText(noted.note!, pet.name) }), ` ${noted.rabbit}`)
            : h('span', { text: names([...new Set(fresh.map((g) => g.rabbit))].slice(0, 3)) })),
        h('span', { class: 'go', 'aria-hidden': 'true', text: '›' }));
      b.addEventListener('click', () => showFriends('book'));
      out.push(b);
    }

    if (!socialOn()) {
      const go = OR.user ? null
        : button('Sign in to have friends over', 'btn primary', () => void OR.actions.requestSignIn(`Sign in so friends can visit ${pet.name}`).catch(() => undefined));
      out.push(go ? friendsHero(go, `Friends' rabbits can visit ${pet.name}, and she can visit theirs.`)
        : h('p', { class: 'quiet', text: "Visiting friends' burrows isn't available here yet." }));
      out.push(pageSection('Why have friends', null, friendPerks()));
      return out;
    }
    if (!c || (!friends && !c.failed)) { out.push(h('p', { class: 'quiet', text: 'Knocking on doors…' })); return out; }
    if (!friends) {
      out.push(h('div', { class: 'quiet-box' }, h('p', { text: "Couldn't reach your friends just now." }), button('Try again', 'btn small', () => { loadFriends(true); render(); })));
      return out;
    }
    if (!friends.length) {
      out.push(friendsHero(button('Invite a friend', 'btn primary', () => openInvite()), 'Invite someone and their rabbit can visit yours, and yours can visit theirs.'));
      out.push(pageSection('Why have friends', null, friendPerks()));
      return out;
    }

    // your visits today, in one line: the first few pay clover
    const left = paidVisitsLeft();
    const used = FRIEND_CLOVER.paidPerDay - left;
    const sent = c.giftSent.size;
    out.push(h('div', { class: 'today-line' },
      h('span', { class: 'pips', 'aria-hidden': 'true' }, ...Array.from({ length: FRIEND_CLOVER.paidPerDay }, (_, i) => h('i', { class: i < used ? 'f' : '' }))),
      h('span', { text: `${used} of ${FRIEND_CLOVER.paidPerDay} visits today · ${left ? `${visitPay(pet)} clover each` : 'more clover tomorrow'}${sent ? ` · ${sent} ${sent === 1 ? 'gift' : 'gifts'} sent` : ''}` })));

    // the few most worth visiting now, as full cards; the rest are a tap away
    const open = info.filter((x) => x.rank < 2);
    const top = open.slice(0, TODAY_CARDS);
    const more = open.length - top.length;
    const head = h('div', { class: 'section-head' }, h('h3', { text: 'To visit' }), button('How friends work', 'link-btn', () => openFriendRules()));
    out.push(h('section', { class: 'page-section' }, head,
      top.length ? h('ul', { class: 'list friends-cards' }, ...top.map((x) => friendCard(x)))
        : h('p', { class: 'quiet', text: `You've visited everyone today. ${pet.name}'s friends will be glad of it.` }),
      more > 0 ? button(`See all ${info.length} friends`, 'btn small', () => showFriends('all')) : null));

    // room for more: until there are five
    if (canShare && friends.length < 5) {
      const next = nextFriendMilestone(pet);
      out.push(h('div', { class: 'invite-slot' },
        h('span', { class: 'slot', 'aria-hidden': 'true', text: '+' }),
        h('span', { class: 'txt' },
          h('b', { text: 'Room for more friends' }),
          h('span', { text: next
            ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} so far. Visit back and forth with ${next.friends} for a ${next.clover.toLocaleString()} clover bonus.`
            : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} so far. More friends, more visitors.` })),
        button('Invite a friend', 'btn small primary', () => openInvite())));
    }

    // somewhere for friends to sit: the meadow's chairs and tea corner
    if (hasUpgrade(pet, 'meadow') && !meadowItems(burrow).some((i) => byId(i.id)?.seats)) {
      out.push(h('div', { class: 'menu' }, menuRow('Somewhere for friends to sit', 'Put out guest chairs or a tea corner in the meadow, and visiting friends sit there', 'guestchairs', () => {
        goTab('garden');
        if (tab !== 'garden') return;
        goArea('meadow');
        openMeadowShop();
      })));
    }
    return out;
  }

  /** A friend worth visiting now, in full: how they are, how close you are, visit and gift. */
  function friendCard(x: Info): HTMLElement {
    const d = x.f.data;
    const holiday = !!d.vacationUntilMs && d.vacationUntilMs > n;
    const out = !!d.outUntilMs && d.outUntilMs > n;
    const asleep = !out && !!d.napEndsAtMs && d.napEndsAtMs > n;
    const hint = holiday ? null : careHint(friendNeeds(d, n));
    const flag = x.came ? h('span', { class: 'flag back', text: 'Visited you today' })
      : x.p >= best ? h('span', { class: 'flag best', text: 'Best friends' })
        : best - x.p <= 5 ? h('span', { class: 'flag best', text: `${best - x.p} ${best - x.p === 1 ? 'day' : 'days'} to best friends` })
          : holiday ? h('span', { class: 'flag', text: 'On holiday' })
            : out ? h('span', { class: 'flag', text: 'Out foraging' })
            : asleep ? h('span', { class: 'flag', text: 'Napping' }) : null;
    return h('li', { class: 'fcard', 'data-friend': x.f.uuid },
      h('span', { class: 'hd' }, friendFace(d),
        h('span', { class: 'txt' },
          h('span', { class: 'nm' }, d.name, h('span', { class: 'user', text: ` ${x.f.username}` })),
          flag)),
      hint ? h('span', { class: 'hint' }, img(itemSprite(VISIT_INFO[hint.kind].art as ItemArt), 2), `${d.name}'s ${hint.word}. ${hint.kind === 'snack' ? 'A snack' : hint.kind === 'pat' ? 'A pat' : 'A brush'} would help most.`) : null,
      friendHearts(x.p),
      h('span', { class: 'btns' }, visitBtn(x, x.rank === 0 ? 'Visit back' : 'Visit', 'btn small primary'), giftsOnTheirOwn ? gift(x) : null));
  }

  /** Everyone, a row each, to search when there are lots. */
  function friendsAll(): Node[] {
    if (!socialOn()) return [h('p', { class: 'quiet', text: OR.user ? "Visiting friends' burrows isn't available here yet." : "Friends' burrows open once you're signed in to OddsRabbit." })];
    if (!c || (!friends && !c.failed)) return [h('p', { class: 'quiet', text: 'Knocking on doors…' })];
    if (!friends) return [h('div', { class: 'quiet-box' }, h('p', { text: "Couldn't reach your friends just now." }), button('Try again', 'btn small', () => { loadFriends(true); render(); }))];
    if (!friends.length) return [friendsHero(button('Invite a friend', 'btn primary', () => openInvite()), 'Invite someone and their rabbit can visit yours, and yours can visit theirs.')];
    const rows = info.map((x) => {
      const d = x.f.data;
      const status = x.visited ? (x.sent ? 'Visited · gift sent' : 'Visited today') : x.came ? 'Visited you today' : x.p >= best ? 'Best friends' : `${x.p}/${best} to best friends`;
      const li = h('li', { class: `frow${x.visited ? ' done' : ''}`, 'data-find': `${d.name} ${x.f.username}`.toLowerCase() }, friendFace(d),
        h('span', { class: 'txt' },
          h('span', { class: 'nm', text: d.name }),
          h('span', { class: 'st' }, h('span', { class: 'user', text: `${x.f.username} · ` }), h('span', { class: x.came && !x.visited ? 'back' : x.p >= best ? 'best' : '', text: status }))),
        h('span', { class: 'btns' }, visitBtn(x, x.rank === 0 ? 'Visit back' : 'Visit', x.visited ? 'btn small ghost' : 'btn small primary'), x.sent || !giftsOnTheirOwn ? null : gift(x)));
      return li;
    });
    const list = h('ul', { class: 'list friends-rows' }, ...rows);
    const none = h('p', { class: 'quiet', hidden: true, text: 'No friends by that name.' });
    const out: Node[] = [];
    if (info.length > SEARCH_FROM) {
      // filters in place, so typing never loses its place
      const search = h('input', { id: 'friend-search', class: 'search', type: 'search', placeholder: 'Find a friend', autocomplete: 'off', 'aria-label': 'Find a friend' });
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        let shown = 0;
        for (const r of rows) { r.hidden = !!q && !r.dataset.find!.includes(q); if (!r.hidden) shown++; }
        none.hidden = shown > 0;
      });
      out.push(search);
    }
    out.push(h('section', { class: 'page-section' },
      h('div', { class: 'section-head' }, h('h3', { text: 'Your friends' }), button('How friends work', 'link-btn', () => openFriendRules())),
      list, none,
      // the platform shares the 100 who've played most recently
      info.length >= 100 ? h('p', { class: 'meta', text: 'Showing the 100 friends who played most recently.' }) : null));
    if (canShare) out.push(h('div', { class: 'menu' }, menuRow('Invite a friend', `Tell a friend about ${pet.name}`, 'heart', () => openInvite())));
    return out;
  }

  /** The guest book, every signature, the new ones marked. */
  function guestbookView(): Node[] {
    if (!book.length) {
      return [h('div', { class: 'quiet-box' },
        h('p', { text: 'No signatures yet. When friends visit, they sign here, and some leave a note.' }),
        canShare ? button('Invite a friend', 'btn small primary', () => openInvite()) : null)];
    }
    const cover = coverOf(pet);
    const pinnedIds = journal.pinned ?? [];
    const pinned = pinnedIds.map((u) => book.find((g) => g.visitUuid === u)).filter((g): g is (typeof book)[number] => !!g);
    const coverBtn = button('Cover', 'btn small', () => openCovers());
    coverBtn.prepend(img(itemSprite((coverById(cover)?.art ?? 'book') as ItemArt), 2));
    const out: Node[] = [h('div', { class: `book-cover cover-${cover}` },
      h('span', { class: 'txt' }, h('b', { text: `${pet.name}'s guest book` }), h('span', { text: `${book.length} ${book.length === 1 ? 'visit' : 'visits'} · pin the best notes to her corkboard` })),
      coverBtn)];
    if (pinned.length) {
      out.push(h('section', { class: 'page-section' },
        h('div', { class: 'section-head' }, h('h3', { text: 'On the corkboard' }), h('span', { text: `${pinned.length} of ${MAX_PINS}` })),
        corkboardUp() ? null : h('p', { class: 'meta', text: 'Hang the corkboard (in the Shop) and friends who visit can read these.' }),
        h('ul', { class: `list guestbook cover-${cover}` }, ...pinned.map((g) => guestbookEntry(g)))));
    }
    out.push(h('section', { class: 'page-section' },
      h('div', { class: 'section-head' }, h('h3', { text: `${pet.name}'s visitors` }), h('span', { text: `${book.length} ${book.length === 1 ? 'visit' : 'visits'}` })),
      h('ul', { class: `list guestbook cover-${cover}` }, ...book.map((g) => {
        const li = guestbookEntry(g);
        if (g.atMs > bookNewSince) { li.classList.add('new'); li.prepend(h('span', { class: 'tag', text: 'New' })); }
        return li;
      }))));
    return out;
  }

  /** Her burrow, live, with whoever's over or at the door. */
  function porchCard(): HTMLElement {
    const gone = visitTurns.length - here.length - waiting.length;
    const recent = recentVisitors();
    if (!here.length && !waiting.length) {
      const who = [...new Set(recent.map((g) => g.rabbit))];
      return h('div', { class: 'at-place' },
        porchStage(),
        h('div', { class: 'body' },
          h('span', { class: 'txt' }, h('b', { text: `${names(who.slice(0, 3))}${who.length > 3 ? ` and ${who.length - 3} more` : ''} came by` }),
            h('small', { text: 'Friends who visited in the last few days' })),
          h('span', { class: 'row' }, h('span', { class: 'btns' }, button('Guest book', 'btn small', () => showFriends('book'))))));
    }
    const title = here.length ? `${names(here.map((t) => t.data.name))} ${here.length === 1 ? 'is' : 'are'} over`
      : `${names(waiting.map((t) => t.data.name))} ${waiting.length === 1 ? 'is' : 'are'} at the door`;
    const line = here.length && waiting.length ? `${names(waiting.map((t) => t.data.name))} ${waiting.length === 1 ? 'is' : 'are'} at the door, next in ${fmtLong(waiting[0]!.fromMs - n)}`
      : !here.length ? `Next one in ${fmtLong(waiting[0]!.fromMs - n)}`
        : gone ? (() => {
          const earlier = [...new Set(recent.map((g) => g.rabbit))].filter((r) => !here.some((t) => t.data.name === r));
          return earlier.length ? `${names(earlier.slice(0, 3))} came by earlier` : `${gone} hopped home`;
        })()
          : `${names(here.map((t) => `${t.data.name} ${visitInfo(t.visit.kind)?.did ?? 'came to visit'}`))}.`;
    const btns: HTMLButtonElement[] = [button('Who came', 'btn small', () => openVisitors())];
    if (here.length) btns.push(button('Say hi', 'btn small primary', () => sayHi(here[0]!)));
    return h('div', { class: 'at-place' },
      porchStage(),
      h('div', { class: 'body' },
        h('span', { class: 'txt' }, h('b', { text: title }), h('small', { text: line })),
        h('span', { class: 'row' },
          faceStack([...here, ...waiting].map((t) => t.data), waiting.length),
          h('span', { class: 'btns' }, ...btns))));
  }
}

// ------------------------------------------------------------------ share

/** What sharing her says: how she is, and an ask to come and visit. */
function shareText(): string {
  const m = mood(pet, now(), tz);
  const feeling: Record<Mood, string> = {
    content: 'feeling cozy', peckish: 'hoping for a carrot', lonely: 'waiting for a cuddle', sleepy: 'getting sleepy',
    dusty: 'a little dusty', grumpy: 'a bit grumpy', asleep: 'fast asleep',
  };
  return `${pet.name} and I have spent ${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} together, and she's ${feeling[m]} right now. Adopt a rabbit in Rabbit Pets on OddsRabbit and come visit us!`;
}

async function shareCard(): Promise<void> {
  try {
    await OR.actions.share({ title: `Come visit ${pet.name} in Rabbit Pets`, text: shareText() });
    goal('friend');
  } catch {
    toast("Couldn't open sharing here.");
  }
}

// ------------------------------------------------------------------ go

void boot().catch((e: unknown) => {
  console.error(e);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.textContent = "The burrow didn't open. Try reloading.";
  OR.ready();
});
