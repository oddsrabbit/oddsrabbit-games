// Rabbit Pets: a cozy virtual pet that lives in real time. She keeps living
// while the game is closed; each visit replays the time away (sim.ts) and
// shows what happened. See docs/rabbit-pets.md.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { drawItem, drawPlot, type ItemArt } from './art/items';
import { blank, toSprite, type PixelGrid, type Sprite } from './art/pixels';
import { drawRabbit, dressKey, type Dress, type Face, type Frame } from './art/rabbit';
import { drawBurrow, moonPhase, SCENE_H, SCENE_W, type RoomStyle } from './art/burrow';
import { clockOffset, now, syncClock } from './clock';
import {
  addSurface, burrowForSave, byId, CATALOG, clampToZone, hasBed, isOutdoor, meadowHelpers, meadowItems, ownsDecor, ownsSurface, starterBurrow, surfaceById, surfacesOf, SURFACES, useSurface, ZONES,
  type BurrowState, type DecorDef, type PlacedItem, type SurfaceDef,
  canDig, digRoom, EXTRA_ROOMS, inRoom, ROOMS, roomsOf, type ExtraRoom, type RoomId,
} from './decor';
import {
  buyOutfit, buyToy, buyUpgrade, COLLECTIBLES, CROPS, endVacation, giveOutfit, growMs, harvest, hasUpgrade, onVacation, OUTFITS,
  outfitById, ownsToy, plant, plots, toyById, cropYield, soilLevel, soilMaxed, soilPrice, sproutClover, stage as cropStage, startVacation, TOYS, UPGRADES, upgradeUnlocked,
  VACATION_CHOICES, wardrobe, wear, type CropId, type Slot, type UpgradeId,
} from './extras';
import { bestFriends, rate, type Lump } from './economy';
import { COLLECTION_SETS, setComplete } from './collectibles';
import { GOAL_TEXT, goalDone, markGoal, settleStarter, starterDone, starterStep, starterView, starterWaiting, STARTER_STEPS, type StarterGoal } from './starter';
import {
  BUILDING_IDS, BUILDINGS, buyBuilding, buyShed, capacity, collect, countOf, nextPrice, perHour, SHED_REQUIRES, shedPrice, storageHours, stored,
  unlocked as buildingUnlocked, meadowPerDay, setMeadow, type BuildingId,
  payback,
} from './yard';
import { AREA_W, areaAt, AREAS, areaX, hitTest, PLOT_SPOTS, type AreaId } from './garden';
import { GardenScene, pieceBox, type GardenModel } from './garden-scene';
import { CRITTERS, critterById } from './wildlife';
import { isOut, trip as tripOf, type Loot } from './forage';
import { drawTicket, prizeWon, ticketsBought } from './raffle';
import { addEntry, emptyJournal, mergeJournal, MILESTONE_DAYS, signGuestbook, type Journal } from './journal';
import {
  applyGift, applyVisits, buildShowcase, buyWelcome, findGiftKind, nextWelcome, takeGolden, visitPay, welcomeLevel, findOfGift, friendGardenPet, GIFT_INFO, GIFT_KINDS, giftInfo, giveFind, GUEST_NOTES, guestsToShow, noteOf, noteText, spareFinds, visitKind, readShowcase, rewardGiftSent, rewardVisit, showcaseSignature, VISIT_INFO, visitInfo, VISIT_KINDS,
  type GuestNote, type ShowcaseData, type VisitIn, type VisitKind,
} from './social';
import { deviceTimeZone } from './localtime';
import { desiredReminders, reconcile } from './reminders';
import { Scene, type Activity } from './render';
import { newPetId } from './rng';
import { pauseSound, play, resumeSound, setMuted } from './sound';
import {
  act, advance, bondLevel, COATS, giftReady, isAsleep, isNight, mood, newPet,
  FOOD_IDS, spendClover, timer, visit, earsOf, EARS, type Action, type FoodId, type Coat, type Ears, type Mood, type NeedKey, type PetEvent, type PetState,
} from './sim';
import { defaultSettings, deleteGame, KEYS, loadBurrow, loadJournal, loadPet, loadSettings, Saver, type Loaded, type Settings } from './store';
import { BOND_DAILY_CAP, DAY_ROLLOVER_HOUR, FORAGE, FRIEND_CLOVER, HOUR_MS, MEADOW, RAFFLE, SOIL, STREAK_MILESTONES, WELCOME } from './tuning';
import { dayKey } from './localtime';
import { activeEvents, limitedAvailable, seasonOf, TRAIT_INFO, traitOf, weatherOf, WEATHER_NAME, type Season, type SeasonalEvent, type Weather } from './world';

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
  saver.queue(KEYS.pet, () => pet);
  queueShowcase();
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
    void returnToPage(false).then(() => { if (pet && rp?.kind === 'ok' && rp.value.petId === pet.petId) toast('Picked up changes from your other device.'); });
    return null;
  }
  const p = docs.get(KEYS.pet) as PetState | undefined;
  if (p) inStorage.pet = storedOf(p);
  const b = docs.get(KEYS.burrow) as BurrowState | undefined;
  if (b) inStorage.burrow = b.rev;
  if (rj?.kind === 'ok') {
    journal = mergeJournal(journal, rj.value);
    docs.set(KEYS.journal, mergeJournal(docs.get(KEYS.journal) as Journal, rj.value));
  }
  return docs;
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

/** Count toward Getting started, and pay any step that's now complete. */
function goal(g?: StarterGoal): void {
  if (!pet || starterDone(pet)) return;
  if (g) markGoal(pet, g);
  // a bed in the burrow counts however it got there
  if (!goalDone(pet, 'bed') && hasBed(burrow)) markGoal(pet, 'bed');
  const r = settleStarter(pet, now());
  pet = r.state;
  savePet();
  for (const d of r.paid) {
    window.setTimeout(() => toast(`Getting started: step ${d.step} done! +${d.clover} clover${d.patch ? ' and a clover patch for the yard' : ''}.`, () => play('gift')), 700);
    note(`Getting started: step ${d.step} done.`, 'clover', `starter:${d.step}`);
  }
}

function note(text: string, art?: ItemArt, first?: string): void {
  const next = addEntry(journal, { atMs: now(), text, art }, first);
  if (next === journal) return;
  journal = { ...next, rev: journal.rev + 1 };
  saver.queue(KEYS.journal, () => journal);
}

// ------------------------------------------------------------------ boot

async function boot(): Promise<void> {
  await OR.whenReady();
  saver = new Saver(OR, () => toast("Couldn't save just now. We'll try again."), othersHaventWritten);

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
async function loadAndStart(): Promise<void> {
  await syncClockOrHold();
  const [p, b, s, j] = await Promise.all([loadPet(OR), loadBurrow(OR), loadSettings(OR), loadJournal(OR)]);
  if ([p, b, s, j].some((r) => r.kind === 'newer')) { stopForNewerVersion(); return; }
  const bad = [p, b, j].filter((r) => r.kind === 'error' || r.kind === 'broken');
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
  let ears: Ears = 'short';
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

interface Ui {
  name: HTMLElement;
  sub: HTMLElement;
  clover: HTMLElement;
  needs: Record<NeedKey, { wrap: HTMLElement; fill: HTMLElement }>;
  stage: HTMLElement;
  /** The rooms, to switch between (renderRoomNav). */
  roomNav: HTMLElement;
  canvas: HTMLCanvasElement;
  chips: HTMLElement;
  gift: HTMLButtonElement;
  panel: HTMLElement;
  moodline: HTMLElement;
  acts: Record<'feed' | 'pet' | 'clean' | 'nap', HTMLButtonElement>;
  feedBadge: HTMLElement;
  bake: HTMLButtonElement;
  garden: HTMLButtonElement;
  play: HTMLButtonElement;
  sound: HTMLButtonElement;
  goal: HTMLElement;
  /** The panel's normal contents, restored after decorating. */
  panelKids: Node[];
}
let ui: Ui;
let scale = 4;
let decorating = false;
/** The piece being moved while decorating. */
let selectedUid: string | null = null;
let drag: { uid: string; dx: number; dy: number; moved: boolean } | null = null;

let started = false;
function startGame(returning: boolean): void {
  // Browsers only allow audio after a gesture: unlock on the first one.
  setMuted(settings.sound === false);
  buildBurrowScreen();
  catchUp(returning);
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
  // a fresh burrow screen (a new game, or starting over) starts indoors
  room = 'burrow';
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
    const wrap = h('div', { class: 'need', role: 'meter', 'aria-label': d.label, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('div', { class: 'need-label' }, d.icon, d.label), h('div', { class: 'bar' }, fill));
    needs[d.key] = { wrap, fill };
    return wrap;
  });

  const name = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  const canvas = h('canvas', { role: 'img', 'aria-label': 'The burrow' });
  const chips = h('div', { class: 'float-chips' });
  const gift = h('button', { class: 'gift-btn', type: 'button', hidden: true }, img(itemSprite('gift'), 3), 'Daily gift');
  // chips and the gift button pin to the visible stage, not the (maybe cropped) scene
  // the rooms she has, once there's more than one (render keeps it up to date)
  const roomNav = h('nav', { class: 'room-nav', 'aria-label': 'Rooms', hidden: true });
  const stage = h('main', { class: 'stage' }, canvas, chips, gift, roomNav);

  const actBtn = (id: 'feed' | 'pet' | 'clean' | 'nap', label: string, icon: Node) =>
    h('button', { class: 'act', type: 'button', 'data-act': id }, icon, h('span', { text: label }));
  const feedBadge = h('span', { class: 'badge', hidden: true });
  const acts = {
    feed: actBtn('feed', 'Feed', img(itemSprite('carrot'), 3)),
    pet: actBtn('pet', 'Pet', img(itemSprite('heart'), 4)),
    clean: actBtn('clean', 'Clean', img(itemSprite('droplet'), 4)),
    nap: actBtn('nap', 'Bed', img(itemSprite('moon'), 4)),
  };
  acts.feed.append(feedBadge);
  // the second row: smaller tools, icon over label, five across
  const tool = (label: string, art: ItemArt, extra = '') => {
    const s = itemSprite(art);
    return h('button', { class: `tool ${extra}`.trim(), type: 'button' }, img(s, fitScale(s, 28)), h('span', { text: label }));
  };
  const decorate = tool('Shop', 'plant', 'green');
  decorate.setAttribute('aria-label', 'Shop and decorate');
  const garden = tool('Garden', 'leafy');
  const playBtn = tool('Play', 'basket');
  const bake = tool('Bake', 'treat');
  const more = tool('More', 'book');
  const sound = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Sound' });
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite' });
  const goalBar = h('button', { class: 'goal-bar', type: 'button', hidden: true });
  goalBar.addEventListener('click', () => enterDecorate());
  const panelKids = [moodline, h('div', { class: 'actions' }, acts.feed, acts.pet, acts.clean, acts.nap),
    h('div', { class: 'tools' }, decorate, garden, playBtn, bake, more)];
  const panel = h('section', { class: 'panel' }, ...panelKids);

  setScreen('burrow');
  app.replaceChildren(
    h('header', { class: 'hud' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'who' }, name, sub),
        h('div', { class: 'chip', 'aria-label': 'Clover' }, img(itemSprite('clover'), 2), clover), sound),
      h('div', { class: 'needs' }, ...needEls),
      goalBar),
    stage,
    panel
  );
  ui = { name, sub, clover, needs, stage, canvas, chips, gift, panel, moodline, acts, feedBadge, bake, garden, play: playBtn, sound, goal: goalBar, panelKids, roomNav };

  scene = new Scene(canvas);
  new ResizeObserver(layoutStage).observe(stage);
  layoutStage();

  for (const k of ['pet', 'clean'] as const) acts[k].addEventListener('click', () => doAction(k));
  acts.feed.setAttribute('aria-expanded', 'false');
  acts.feed.addEventListener('click', () => toggleFoodTray());
  // Bed doubles as "Wake" while she's asleep, at any hour.
  acts.nap.addEventListener('click', () => doAction(isAsleep(pet, now()) ? 'wake' : 'nap'));
  bake.addEventListener('click', () => doAction('bake'));
  gift.addEventListener('click', () => doAction('gift'));
  decorate.addEventListener('click', () => enterDecorate());
  garden.addEventListener('click', () => openGarden());
  playBtn.addEventListener('click', () => openToys());
  more.addEventListener('click', () => openMore());
  sound.addEventListener('click', () => {
    settings.sound = settings.sound === false;
    setMuted(!settings.sound);
    saveSettings();
    if (settings.sound) play('pet');
    render();
  });
  canvas.addEventListener('click', (e) => {
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
 * Whole-number scale, sized by width. On a short screen the ceiling is cropped
 * rather than shrinking everything: the scene is anchored to the floor, where
 * she and the decor are, and at most ~40% of its height goes above the fold.
 */
function layoutStage(): void {
  if (scene) scale = fitScene(ui.stage, ui.canvas, scene);
}

/** Size a scene's canvas to fill a stage element (the burrow, or a friend's). Returns the scale. */
function fitScene(stageEl: HTMLElement, el: HTMLCanvasElement, sc: Scene): number {
  const w = stageEl.clientWidth, hgt = stageEl.clientHeight;
  const scale = Math.max(2, Math.min(Math.round(w / SCENE_W), Math.floor(hgt / (SCENE_H * 0.6)) || 2));
  // The surface covers the whole stage in scene pixels; the room sits in it.
  const sw = Math.ceil(w / scale), sh = Math.ceil(hgt / scale);
  const offX = Math.round((sw - SCENE_W) / 2);
  // Taller than the room: most of the spare soil goes above it, like a burrow
  // under the ground. Shorter: crop the ceiling, keep the floor.
  const offY = sh >= SCENE_H ? Math.round((sh - SCENE_H) * 0.6) : sh - SCENE_H;
  sc.resize(sw, sh, offX, offY);
  el.style.width = `${sw * scale}px`; el.style.height = `${sh * scale}px`;
  el.style.left = `${Math.floor((w - sw * scale) / 2)}px`; el.style.top = '0px';
  return scale;
}

// ------------------------------------------------------------------ time passing

function catchUp(showSummary: boolean): void {
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
  void checkInbox();
  void checkVisits();
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
  render();
  renderGarden();
}

let lastFrame = 0;
/** A friend's burrow is open over hers: hers isn't seen, so isn't drawn. */
let visitingFriend = false;
function frame(t: number): void {
  requestAnimationFrame(frame);
  if (t - lastFrame < 66 || visitingFriend) return; // ~15 fps is plenty for pixel art
  if (room === 'garden') { lastFrame = t; drawGardenFrame(t); return; }
  if (!scene) return;
  lastFrame = t;
  const n = now();
  const w = today(n);
  scene.draw({
    coat: pet.coat,
    night: isNight(n, tz),
    mood: mood(pet, n, tz),
    burrow: here(),
    decorating,
    selected: decorating ? selectedUid : null,
    dress: dressOf(pet),
    season: w.season,
    weather: w.weather,
    absent: away() || isOut(pet, n),
    room: { ...roomOf(burrow), ...(burrowRoom !== 'main' ? { variant: burrowRoom } : {}) },
    moon: moonPhase(n),
    guests: guestModels(),
    seed: `${pet.petId}:${dayKey(n, tz, DAY_ROLLOVER_HOUR)}`,
    critter: critterHere(),
  }, t);
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
    case 'favourite': return `${name} is sitting by the ${(byId(a.piece)?.name ?? 'decor').toLowerCase()}. Her favourite spot today.`;
  }
}

function roomOf(b: BurrowState): RoomStyle {
  const sf = surfacesOf(b);
  return { wall: sf.wall, floor: sf.floor, window: sf.window };
}

/** The rooms you can switch between, over the burrow, once there's more than one. */
function renderRoomNav(): void {
  const rooms = roomsOf(burrow);
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
  if (!roomsOf(burrow).includes(burrowRoom)) burrowRoom = 'main';
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
  const bl = bondLevel(pet.bond);
  const w = today(n);
  ui.name.textContent = pet.name;
  ui.sub.textContent = `${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} · Bond ${bl.level} · ${WEATHER_NAME[w.weather]}`;
  ui.sub.title = `${pet.daysVisited} days together, bond level ${bl.level}. Today: ${WEATHER_NAME[w.weather].toLowerCase()} ${w.season}.`;
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

  const nap = timer(pet, 'nap');
  let line = MOOD_LINE[m](pet.name);
  const doing = m === 'content' ? scene?.activity() : null;
  if (doing) line = activityLine(doing, pet.name);
  const visitor = critterById(critterHere() ?? '');
  if (visitor && m !== 'asleep') line = `${article(visitor.name).replace(/^a/, 'A')} has dropped by. ${line}`;
  else if (visitor) line = `${line} ${article(visitor.name).replace(/^a/, 'A')} is tiptoeing about.`;
  // No countdown here: the line is read out when it changes, and the "Asleep"
  // chip already counts down.
  if (m === 'asleep' && nap && !hasBed(burrow)) line = `${pet.name} is asleep on the floor. A bed would be cozier.`;
  const holiday = away();
  if (holiday) line = `${pet.name} is on holiday until ${fmtDate(pet.vacationUntilMs!)}. Her needs are paused.`;
  // out foraging: hours, not minutes, so the line isn't read out every minute (the chip counts down)
  const outFor = isOut(pet, n) ? tripOf(pet)!.endsAtMs - n : 0;
  const homeIn = outFor > HOUR_MS ? `in about ${Math.round(outFor / HOUR_MS)} ${Math.round(outFor / HOUR_MS) === 1 ? 'hour' : 'hours'}` : 'within the hour';
  if (outFor) line = `${pet.name} is out foraging, home ${homeIn}.`;
  if (!decorating && ui.moodline.textContent !== line) ui.moodline.textContent = line;
  if (!decorating) {
    // what the picture shows, for anyone who can't see it
    const decor = here().items.filter((i) => { const d = byId(i.id); return i.placed && !!d && !isOutdoor(d); }).map((i) => byId(i.id)?.name.toLowerCase()).filter(Boolean);
    const guests = visitGuests.map((g) => g.data.name);
    const label = [
      `${pet.name}'s burrow, ${isNight(n, tz) ? 'at night' : 'by day'}, ${WEATHER_NAME[w.weather].toLowerCase()} outside.`,
      line,
      guests.length ? `Visiting: ${guests.join(', ')}.` : '',
      decor.length ? `In the burrow: ${decor.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    if (ui.canvas.getAttribute('aria-label') !== label) ui.canvas.setAttribute('aria-label', label);
  }

  const onHoliday = holiday ? `${pet.name} is on holiday. Her needs are paused.` : null;
  const sleeping = asleep ? "Shh, she's asleep. Tap Wake if you need her." : null;
  const foraging = outFor ? `She's out foraging, home ${homeIn}. Call her home from Play.` : null;
  setOff(ui.acts.feed, onHoliday ?? foraging ?? sleeping);
  setOff(ui.acts.clean, onHoliday ?? foraging ?? sleeping);
  setOff(ui.acts.pet, onHoliday ?? foraging);
  setOff(ui.acts.nap, onHoliday ?? foraging);
  const napLabel = ui.acts.nap.querySelector('span');
  if (napLabel) napLabel.textContent = asleep ? 'Wake' : 'Bed';
  const petLabel = ui.acts.pet.querySelector('span');
  if (petLabel) petLabel.textContent = asleep ? 'Pet gently' : 'Pet';
  ui.feedBadge.hidden = pet.treats === 0;
  ui.feedBadge.textContent = String(pet.treats);
  ui.feedBadge.setAttribute('aria-label', `${pet.treats} treats`);
  const bake = timer(pet, 'bake');
  setOff(ui.bake, onHoliday ?? (bake ? `A treat's in the oven, ready in ${fmtDuration(bake.endsAtMs - n)}.` : null));
  const bakeLabel = ui.bake.querySelector('span');
  if (bakeLabel) bakeLabel.textContent = bake ? 'Baking' : 'Bake';
  setOff(ui.play, onHoliday ?? sleeping);
  const ripe = plots(pet).filter((p) => p && p.readyAtMs <= n).length;
  setToolBadge(ui.garden, ripe ? String(ripe) : '');
  setOff(ui.garden, onHoliday);
  ui.gift.hidden = decorating || holiday || !giftReady(pet, n, tz);
  const soundOn = settings.sound !== false;
  if (ui.sound.dataset.on !== String(soundOn)) {
    ui.sound.dataset.on = String(soundOn);
    ui.sound.innerHTML = soundOn ? SPEAKER_ON : SPEAKER_OFF;
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    ui.sound.title = soundOn ? 'Sound on' : 'Sound off';
  }

  // rooms can be switched while decorating too
  renderRoomNav();
  if (decorating) return;
  // timer chips: rebuilt when which ones show changes, otherwise just the countdowns
  const napping = !!nap && nap.endsAtMs > n;
  const out = isOut(pet, n) ? tripOf(pet)! : null;
  const times = [napping ? nap!.endsAtMs : null, out ? out.endsAtMs : null, bake ? bake.endsAtMs : null].filter((t): t is number => t !== null);
  // Timers tick every second; event chips are buttons, rebuilt only when the
  // events change so a tap isn't lost to a rebuild.
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
    if (napping) chips.push(h('div', { class: 'tchip' }, img(itemSprite('moon'), 2), 'Asleep', h('span', { class: 'time' })));
    if (out) chips.push(h('div', { class: 'tchip' }, img(itemSprite('basket'), 2), 'Foraging', h('span', { class: 'time' })));
    if (bake) chips.push(h('div', { class: 'tchip' }, img(itemSprite('treat'), 2), 'Baking', h('span', { class: 'time' })));
    else if (pet.treats > 0) chips.push(h('div', { class: 'tchip ready' }, img(itemSprite('treat'), 2), `${pet.treats} ${pet.treats === 1 ? 'treat' : 'treats'} ready`));
    timersBox.replaceChildren(...chips);
  }
  timersBox.querySelectorAll('.time').forEach((el, i) => {
    const text = fmtCountdown(times[i]! - n);
    if (el.textContent !== text) el.textContent = text;
  });
  const events = holiday ? [] : activeEvents(n, tz);
  const inYard = Math.floor(stored(pet, n));
  const starter = starterDone(pet) ? null : starterView(pet).find((d) => !d.paid);
  // between steps: a quiet chip saying more is coming, so the sheet stays reachable
  const starterNext = !starter && starterWaiting(pet);
  const sig = [...events.map((e) => e.id), `y${inYard}`, `v${visitGuests.length}`, starter ? `s${starter.step.step}:${starter.done.filter(Boolean).length}` : '', starterNext ? 'sw' : ''].join('|');
  if (eventsBox.dataset.sig !== sig) {
    eventsBox.dataset.sig = sig;
    const chips = events.map((e) => {
      const chip = h('button', { class: 'tchip event', type: 'button', 'aria-label': `${e.name}. ${e.blurb}` }, img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 1), e.name);
      chip.addEventListener('click', () => openEvent(e.id));
      return chip;
    });
    if (visitGuests.length) {
      const n = visitGuests.length;
      const chip = h('button', { class: 'tchip event', type: 'button', 'aria-label': `${n} ${n === 1 ? 'friend is' : 'friends are'} visiting` },
        img(itemSprite('heart'), 2), n === 1 ? `${visitGuests[0]!.data.name} is visiting` : `${n} visiting`);
      chip.addEventListener('click', () => openVisitors());
      chips.push(chip);
    }
    if (inYard >= 1) {
      const chip = h('button', { class: 'tchip ready', type: 'button', 'aria-label': `Collect ${inYard} clover from the yard` }, img(itemSprite('clover'), 2), `+${inYard} from the yard`);
      chip.addEventListener('click', () => collectYard());
      chips.push(chip);
    }
    if (starter) {
      const done = starter.done.filter(Boolean).length;
      const chip = h('button', { class: 'tchip event', type: 'button', 'aria-label': `Getting started, step ${starter.step.step} of ${STARTER_STEPS.length}: ${done} of ${starter.step.goals.length} done` },
        img(itemSprite('sparkle'), 1), `Getting started · ${done}/${starter.step.goals.length}`);
      chip.addEventListener('click', () => openStarter());
      chips.push(chip);
    } else if (starterNext) {
      const chip = h('button', { class: 'tchip event', type: 'button', 'aria-label': 'Getting started: the next step opens next time you drop by' },
        img(itemSprite('sparkle'), 1), 'Getting started · more next time');
      chip.addEventListener('click', () => openStarter());
      chips.push(chip);
    }
    eventsBox.replaceChildren(...chips);
  }
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
  const goals: Partial<Record<Action, StarterGoal>> = { feed: 'feed', nap: 'nap', bake: 'bake', play: 'toy' };
  const g = goals[a];
  // settles too: care can finish a goal on its own (bond level 3)
  goal(g);
  switch (a) {
    case 'feed': {
      const food = opts.food ?? 'carrot';
      scene?.react('eating', t, FOOD_INFO[food].art);
      if (r.reaction === 'loves') {
        window.setTimeout(() => { play('pet'); scene?.burst('heart', 3, performance.now()); }, 500);
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

let foodTray: HTMLElement | null = null;

/** Close the food tray if it's open. */
function closeFoodTray(): void {
  if (!foodTray) return;
  foodTray.remove();
  foodTray = null;
  ui.acts.feed.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onOutsideFoodTray, true);
  document.removeEventListener('keydown', onFoodTrayKey);
}
function onOutsideFoodTray(e: Event): void {
  const t = e.target as Node;
  if (foodTray?.contains(t) || ui.acts.feed.contains(t)) return;
  closeFoodTray();
}
function onFoodTrayKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { closeFoodTray(); ui.acts.feed.focus(); }
}

/**
 * The food choices, as a row of buttons like the action row, popping up just
 * above it with a pointer to Feed.
 */
function toggleFoodTray(): void {
  if (foodTray) { closeFoodTray(); return; }
  const berries = pet.pantry?.berries ?? 0;
  const golden = pet.pantry?.golden ?? 0;
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
    b.addEventListener('click', () => { closeFoodTray(); doAction('feed', { food: id }); });
    if (!available) setOff(b, id === 'treat' ? REFUSAL.noTreats! : `Strawberries cost 3 clover, or grow them in the garden.`);
    return b;
  });
  foodTray = h('div', { class: 'food-tray', role: 'group', 'aria-label': `What would ${pet.name} like?` },
    h('div', { class: 'food-row', style: `grid-template-columns:repeat(${buttons.length},minmax(0,1fr))` }, ...buttons),
    h('p', { class: 'food-hint', text: 'Baked treats and berries delight her most.' }));
  ui.acts.feed.parentElement?.append(foodTray);
  ui.acts.feed.setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', onOutsideFoodTray, true);
  document.addEventListener('keydown', onFoodTrayKey);
  (foodTray.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
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
    if (inYard >= 1) quick.push(doing(`Collect ${inYard} clover`, 'Collected', () => collectYard()));
    if (ripe) quick.push(doing(ripe === 1 ? 'Pick it' : `Pick all ${ripe}`, 'Picked', () => pickAll()));
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
  const what = kind === 'nap' ? 'when she wakes up' : kind === 'forage' ? "when she's home" : 'when the treat is ready';
  openSheet((close) => [
    h('h2', { text: `Want a nudge ${what}?` }),
    h('p', { text: pushOff
      ? "Your phone notifications are off for games, so we'll leave a note in your notifications instead."
      : `We'll let you know ${kind === 'nap' ? `in about ${fmtDuration(sleepLeft())}` : kind === 'forage' ? `in about ${fmtDuration((tripOf(pet)?.endsAtMs ?? now()) - now())}` : 'in about an hour'}.` }),
    h('div', { class: 'actions-col' },
      button('Yes, nudge me', 'btn primary', () => { settings.reminders = 'on'; saveSettings(); queueReconcile(); render(); close(); }),
      button('Not now', 'btn', () => { settings.reminders = 'off'; saveSettings(); render(); close(); })),
    h('p', { class: 'note', text: 'You can turn reminders on or off any time under More.' }),
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

function enterDecorate(): void {
  decorating = true;
  selectedUid = null;
  ui.canvas.tabIndex = 0;
  ui.canvas.setAttribute('aria-label', 'The burrow. Drag decor to move it. With the keyboard: N and P pick a piece, arrow keys move it (Shift for bigger steps), F flips it, Delete puts it away.');
  renderDecoratePanel();
  render();
}

function exitDecorate(): void {
  decorating = false;
  selectedUid = null;
  drag = null;
  ui.canvas.removeAttribute('tabindex');
  ui.canvas.setAttribute('aria-label', 'The burrow');
  ui.panel.replaceChildren(...ui.panelKids);
  render();
  // anything that came in while decorating (a gift, a question) comes now
  if (!sheetStack.length) sheetQueue.shift()?.open();
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
  });
  const end = () => {
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
  toast('Put away. You can place it again for free.');
  renderDecoratePanel();
}

// ------------------------------------------------------------------ the shop (decorate tray)

/** A wall, floor or window, shown as a crop of the room it makes. */
function surfaceSprite(def: SurfaceDef): Sprite {
  const key = `sf:${def.id}`;
  let sp = spriteCache.get(key);
  if (!sp) {
    const room = drawBurrow(false, { ...roomOf(starterBurrow()), [def.kind]: def.id });
    const box = def.kind === 'wall' ? { x: 58, y: 36, w: 22, h: 16 } : def.kind === 'floor' ? { x: 38, y: 96, w: 22, h: 16 } : { x: 13, y: 17, w: 27, h: 27 };
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

/** Why it can't be bought yet, or null. */
function lockedBy(t: ShopThing): string | null {
  const bl = bondLevel(pet.bond).level;
  const bond = t.kind === 'decor' ? t.def.bond : t.def.bond ?? 1;
  if (bl < bond) return `Bond ${bond}`;
  const after = t.def.after;
  if (after && !ownsDecor(burrow, after)) return `After the ${(byId(after)?.name ?? surfaceById(after)?.name ?? after).toLowerCase()}`;
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
  toast(pet.goal ? `Saving up for the ${name.toLowerCase()}. It shows under your clover.` : 'Goal unpinned.');
  play('flip');
  render();
}

function renderDecoratePanel(): void {
  const n = now();
  const tray = h('div', { class: 'tray', role: 'list' });
  const things: ShopThing[] = [];
  for (const def of CATALOG) {
    if (isOutdoor(def)) continue; // the meadow's, sold in the garden
    const stored = burrow.items.filter((i) => i.id === def.id && !i.placed);
    // seasonal pieces are for sale during their event; once owned, they're yours
    if (!stored.length && (def.giftOnly || (def.limited && !limitedAvailable(def.id, n, tz)))) continue;
    things.push({ kind: 'decor', def, stored });
  }
  // a plain wall, floor or window only shows once there's something to switch back from
  const fancy = new Set(SURFACES.filter((d) => d.price > 0 && ownsSurface(burrow, d.id)).map((d) => d.kind));
  for (const def of SURFACES) if (def.price > 0 || fancy.has(def.kind)) things.push({ kind: 'surface', def });

  // owned first (put away, or a wall you can switch to), then what you can
  // afford, then what to save for, then what isn't open yet
  const rank = (t: ShopThing): number => {
    if (t.kind === 'decor' && t.stored.length) return 0;
    if (t.kind === 'surface' && ownsSurface(burrow, t.def.id)) return 1;
    if (lockedBy(t)) return 4;
    return t.def.price <= pet.clover ? 2 : 3;
  };
  // owned walls and floors come after what you can buy
  const order = [0, 2, 1, 3, 4];
  things.sort((a, b) => order[rank(a)]! - order[rank(b)]! || a.def.price - b.def.price);

  let savingShown = false;
  for (const t of things) {
    const r = rank(t);
    if (r >= 3 && !savingShown) {
      savingShown = true;
      tray.append(h('div', { class: 'tray-divider', role: 'presentation', text: 'Saving up' }));
    }
    tray.append(shopButton(t, r));
  }

  const sel = selected();
  const def = sel ? byId(sel.id) : undefined;
  const where = def?.zone === 'hang' ? 'anywhere on the wall' : 'anywhere on the floor';
  ui.moodline.textContent = sel && def
    ? `Drag the ${def.name.toLowerCase()} ${where}.`
    : 'Drag decor to move it, or pick something below. Tap something you can\'t afford yet to save up for it.';
  const done = button('Done', 'btn primary', exitDecorate);
  const flip = sel ? button('Flip', 'btn', () => { sel.flip = !sel.flip; saveBurrow(); play('flip'); }) : null;
  const away = sel ? button('Put away', 'btn', () => putAway(sel)) : null;
  ui.panel.replaceChildren(ui.moodline, tray, h('div', { class: 'row2' }, done, flip, away));
  ui.chips.replaceChildren();
}

function shopButton(t: ShopThing, rank: number): HTMLElement {
  const locked = lockedBy(t);
  const sp = t.kind === 'decor' ? itemSprite(t.def.art) : surfaceSprite(t.def);
  const key = `${t.kind}:${t.def.id}`;
  const pinned = pet.goal === key;
  const inUse = t.kind === 'surface' && surfacesOf(burrow)[t.def.kind] === t.def.id;
  const price = locked ? h('span', { class: 'pr', text: locked })
    : rank === 0 && t.kind === 'decor' ? h('span', { class: 'pr', text: `${t.stored.length} put away` })
      : rank === 1 ? h('span', { class: 'pr', text: inUse ? 'In use' : 'Owned' })
        : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(t.def.price));
  const label = locked ? `${t.def.name}. ${locked}.`
    : rank === 0 ? `${t.def.name}. Place one.`
      : rank === 1 ? `${t.def.name}. ${inUse ? 'In use.' : 'Owned. Use it.'}`
        : rank === 2 ? `${t.def.name}. Buy for ${t.def.price} clover.`
          : `${t.def.name}. ${t.def.price} clover. ${pinned ? 'Your goal. Tap to unpin.' : 'Tap to save up for it.'}`;
  const b = h('button', {
    class: 'titem' + (rank >= 3 ? ' saving' : '') + (pinned ? ' pinned' : ''), type: 'button', role: 'listitem',
    'aria-label': label, 'aria-pressed': t.kind === 'surface' ? String(inUse) : undefined,
  },
  t.kind === 'decor' && t.def.limited && rank > 0 ? h('span', { class: 'tag', text: 'Limited' }) : null,
  pinned ? h('span', { class: 'tag goal', text: 'Goal' }) : null,
  h('span', { class: 'art' }, img(sp, fitScale(sp, 54))), h('span', { class: 'nm', text: t.def.name }), price);
  b.addEventListener('click', () => {
    if (locked) { play('nope'); toast(`${locked}.`); return; }
    if (rank >= 3) { toggleGoal(key, t.def.name); renderDecoratePanel(); return; }
    if (t.kind === 'surface') {
      if (rank === 2) {
        const paid = spendClover(pet, t.def.price);
        if (!paid) { play('nope'); toast('Not enough clover yet.'); return; }
        pet = paid;
        addSurface(burrow, t.def.id);
        play('clover');
        toast(`${t.def.name} up. Switch any time.`);
        note(`Put up the ${t.def.name.toLowerCase()}.`, 'sparkle', `surface:${t.def.id}`);
      } else {
        useSurface(burrow, t.def.id);
        play('flip');
      }
      if (pet.goal === key) pet = { ...pet, goal: null };
      savePet();
      saveBurrow();
      renderDecoratePanel();
      render();
      return;
    }
    const first = t.stored[0];
    if (first) {
      placeNew(first);
    } else {
      const paid = spendClover(pet, t.def.price);
      if (!paid) { play('nope'); toast('Not enough clover yet.'); return; }
      pet = paid;
      if (pet.goal === key) pet = { ...pet, goal: null };
      savePet();
      const item: PlacedItem = { uid: newUid(), id: t.def.id, x: 0, y: 0, flip: false, placed: false };
      burrow.items.push(item);
      placeNew(item);
      toast(`${t.def.name} placed. Drag it where you like.`);
      play('clover');
    }
    saveBurrow();
    goal('decor');
    haptic('light');
    // bought: the blip first, then the thock as it lands
    if (first) play('place'); else window.setTimeout(() => play('place'), 180);
    renderDecoratePanel();
    render();
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
const PLOT_UNLOCK: Record<number, string> = {
  1: 'Opens with the second plot, under Upgrades.',
  2: 'Opens with the third plot, under Upgrades.',
  3: 'Opens with the fourth plot: soil level 3, then under Upgrades.',
  4: 'Opens with the fifth plot: soil level 5, then under Upgrades.',
};

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
  moodline: HTMLElement;
  acts: HTMLElement;
}

let room: 'burrow' | 'garden' = 'burrow';
let area: AreaId = 'patch';
let gardenUi: GardenUi | null = null;
let gardenScene: GardenScene | null = null;
let burrowNodes: Node[] = [];

/** Into the garden, on the area last looked at. */
function openGarden(): void {
  if (away()) return;
  if (decorating) exitDecorate();
  closeFoodTray();
  if (!gardenUi) gardenUi = buildGardenScreen();
  burrowNodes = [...app.childNodes];
  app.replaceChildren(...gardenUi.nodes);
  room = 'garden';
  gardenScene?.jumpTo(area);
  layoutGarden();
  renderGarden();
}

/** Back to the burrow. */
function leaveGarden(): void {
  if (room !== 'garden') return;
  if (arranging) stopArranging();
  room = 'burrow';
  app.replaceChildren(...burrowNodes);
  layoutStage();
  render();
}

function goArea(a: AreaId): void {
  if (a === area) return;
  area = a;
  play('flip');
  renderGarden();
}

function buildGardenScreen(): GardenUi {
  const title = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const clover = h('span');
  const toBurrow = h('button', { type: 'button', class: 'room-tab', text: 'Burrow' });
  const toGarden = h('button', { type: 'button', class: 'room-tab', 'aria-pressed': 'true', text: 'Garden' });
  toBurrow.addEventListener('click', () => leaveGarden());
  const canvas = h('canvas', { role: 'img', 'aria-label': 'The garden' });
  const chips = h('div', { class: 'float-chips' });
  const left = h('button', { type: 'button', class: 'area-arrow left', text: '‹' });
  const right = h('button', { type: 'button', class: 'area-arrow right', text: '›' });
  left.addEventListener('click', () => goArea(AREAS[Math.max(0, AREAS.indexOf(area) - 1)]!));
  right.addEventListener('click', () => goArea(AREAS[Math.min(AREAS.length - 1, AREAS.indexOf(area) + 1)]!));
  const dots = AREAS.map((a) => {
    const b = h('button', { type: 'button', class: 'area-dot', 'aria-label': AREA_NAME[a] }, h('span'));
    b.addEventListener('click', () => goArea(a));
    return b;
  });
  const stage = h('main', { class: 'stage garden-stage' }, canvas, chips, left, right, h('nav', { class: 'area-dots', 'aria-label': 'Areas of the garden' }, ...dots));
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite' });
  const acts = h('div', { class: 'actions' });
  const header = h('header', { class: 'hud' },
    h('div', { class: 'hud-top' },
      h('div', { class: 'who' }, title, sub),
      h('div', { class: 'chip', 'aria-label': 'Clover' }, img(itemSprite('clover'), 2), clover)),
    h('nav', { class: 'room-switch', 'aria-label': 'Rooms' }, toBurrow, toGarden));
  const panel = h('section', { class: 'panel' }, moodline, acts);

  gardenScene = new GardenScene(canvas);
  new ResizeObserver(() => layoutGarden()).observe(stage);
  wireGardenInput(canvas);
  return { nodes: [header, stage, panel], title, sub, clover, stage, canvas, chips, left, right, dots, moodline, acts };
}

function layoutGarden(): void {
  if (gardenUi && gardenScene && room === 'garden') fitScene(gardenUi.stage, gardenUi.canvas, gardenScene as unknown as Scene);
}

function gardenModel(n: number): GardenModel {
  const w = today(n);
  return {
    pet, nowMs: n, area, season: w.season, weather: w.weather, night: isNight(n, tz), moon: moonPhase(n),
    coat: pet.coat, dress: dressOf(pet), asleep: isAsleep(pet, n, tz), absent: isOut(pet, n) || away(), meadowOpen: hasUpgrade(pet, 'meadow'),
    items: meadowItems(burrow), selected: arranging ? gardenSel : null,
  };
}

function drawGardenFrame(t: number): void {
  if (!gardenScene || !pet) return;
  gardenScene.draw(gardenModel(now()), t);
}

/** Swipe between areas; a short drag is a tap. */
function wireGardenInput(canvas: HTMLCanvasElement): void {
  let start: { x: number; y: number } | null = null;
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
    start = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const def = byId(drag.item.id);
    if (!def) return;
    const p = strip(e);
    Object.assign(drag.item, clampToZone(def.zone, p.x + drag.dx, p.y + drag.dy));
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag) { drag = null; saveBurrow(); return; }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      const i = AREAS.indexOf(area) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < AREAS.length) goArea(AREAS[i]!);
      return;
    }
    gardenTap(e);
  });
  canvas.addEventListener('pointercancel', () => { start = null; if (drag) { drag = null; saveBurrow(); } });
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
    if (!hasUpgrade(pet, 'meadow')) { confirmMeadow(); return; }
    const piece = pieceAt(x, y);
    const def = piece ? byId(piece.id) : undefined;
    if (def) toast(def.boost ? `${def.name}: ${BOOST_LINE[def.boost].toLowerCase()}.` : `${def.name}.`);
    return;
  }
  if (hit.kind === 'plot') {
    if (hit.state === 'locked') toast(PLOT_UNLOCK[hit.index] ?? 'Not yet.');
    else if (hit.state === 'empty') openSeeds(hit.index);
    else if (hit.state === 'ready') pickPlot(hit.index);
    else {
      const p = plots(pet)[hit.index]!;
      toast(`${CROPS[p.crop].name}: ready in ${fmtDuration(p.readyAtMs - n)}.`);
    }
  } else if (hit.kind === 'building') {
    if (hit.state === 'owned') {
      if (stored(pet, n) >= 1) collectYard();
      else toast(`${BUILDINGS[hit.id].name}: makes ${Math.round(BUILDINGS[hit.id].perHour * 24)} clover a day.`);
    } else if (hit.state === 'free') confirmBuild(hit.id);
    else { const q = BUILDINGS[hit.id].requires!; toast(`${BUILDINGS[hit.id].name}s come after ${q.count} ${q.building === 'patch' ? 'clover patches' : 'beehives'}.`); }
  } else if (hit.state === 'owned') toast(`The shed holds ${storageHours(pet)} hours of clover.`);
  else if (hit.state === 'free') confirmShed();
  else toast('The shed comes after 3 clover patches.');
  renderGarden();
}

function pickPlot(i: number): boolean {
  const r = harvest(pet, i, now());
  if (!r.ok) return false;
  pet = r.state;
  savePet();
  play('harvest');
  haptic('success');
  const spot = PLOT_SPOTS[i];
  if (spot) gardenScene?.burst(CROP_ART[r.crop], 2, performance.now(), { x: spot.x, y: spot.y - 14 });
  const got = r.crop === 'sprout' ? `+${r.clover} clover.` : r.crop === 'berry' ? `${cropYield(pet, 'berry')} strawberries, in the pantry.`
    : cropYield(pet, 'golden') > 1 ? 'Two golden carrots, in the pantry. She always loves these.' : 'A golden carrot, in the pantry. She always loves these.';
  toast(`Picked! ${got}`);
  note(`First ${CROPS[r.crop].name.toLowerCase()} from the garden.`, CROP_ART[r.crop], `harvest:${r.crop}`);
  goal('harvest');
  queueReconcile();
  renderGarden();
  return true;
}

function pickAll(): void {
  const n = now();
  const ready = plots(pet).map((p, i) => (p && p.readyAtMs <= n ? i : -1)).filter((i) => i >= 0);
  for (const i of ready) pickPlot(i);
  if (ready.length > 1) toast(`Picked ${ready.length} plots.`);
}

/** What to plant in plot `i`. */
function openSeeds(i: number): void {
  openLiveSheet((close) => {
    const seeds = (Object.keys(CROPS) as CropId[]).map((c) => {
      const info = CROPS[c];
      const s = itemSprite(CROP_ART[c]);
      const b = h('button', {
        class: 'seed', type: 'button',
        'aria-label': `${info.name}. ${info.seedCost} clover. Ready in ${fmtDuration(growMs(pet, c))}. Gives ${yields(c)}.`,
      },
      img(s, fitScale(s, 26)),
      h('span', { class: 'nm', text: info.name }),
      h('span', { class: 'meta', text: `${fmtDuration(growMs(pet, c))} · ${yields(c)}` }),
      h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(info.seedCost)));
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

/** "Makes 6 clover a day · pays for itself in about 14 days": what the next one of a kind is worth. */
function paysLine(id: BuildingId): string {
  const p = payback(pet, id);
  return `Makes ${Math.round(p.perDay)} clover a day · pays for itself in about ${p.days} ${p.days === 1 ? 'day' : 'days'}`;
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

/** Upgrades and the yard's list: the old garden sheet, without the plots (they're in the garden now). */
function openGardenUpgrades(): void {
  openLiveSheet((close, redraw) => {
    const berries = pet.pantry?.berries ?? 0, golden = pet.pantry?.golden ?? 0;
    const pantry = berries || golden
      ? `In the pantry: ${[berries ? `${berries} ${berries === 1 ? 'strawberry' : 'strawberries'}` : '', golden ? `${golden} golden ${golden === 1 ? 'carrot' : 'carrots'}` : ''].filter(Boolean).join(' and ')}.`
      : 'Grow strawberries and golden carrots for her, or clover sprouts to sell.';
    const redrawAll = () => { redraw(); renderGarden(); };
    return [
      h('div', { class: 'eyebrow', text: 'The garden' }),
      h('h2', { text: 'Upgrades' }),
      h('p', { class: 'note', text: pantry }),
      gardenUpgrades(redrawAll),
      yardSection(redrawAll),
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
  g.sub.textContent = `${AREA_NAME[area]} · ${WEATHER_NAME[w.weather]}`;
  g.clover.textContent = String(pet.clover);
  g.left.hidden = i === 0 || arranging;
  g.right.hidden = i === AREAS.length - 1 || arranging;
  const prev = AREAS[i - 1], next = AREAS[i + 1];
  g.left.setAttribute('aria-label', prev ? `Walk to the ${AREA_NAME[prev].toLowerCase()}` : '');
  g.right.setAttribute('aria-label', next ? `Walk to the ${AREA_NAME[next].toLowerCase()}` : '');
  g.dots.forEach((d, j) => d.setAttribute('aria-current', String(j === i)));

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
      ? `${inYard >= 1 ? `${inYard} clover waiting. ` : ''}The yard makes ${Math.round(perHour(pet) * 24)} clover a day. Tap a + to build there.`
      : 'Tap a + to build a clover patch. It makes clover every hour, even while you’re away.';
    chips.push(`${countOf(pet, 'patch')} of 10 patches`, `${countOf(pet, 'hive')} of 5 hives`);
  } else {
    line = meadowLine();
  }
  if (area === 'yard') {
    const help = BUILDING_IDS.reduce((sum, id) => sum + meadowPerDay(pet, id) * countOf(pet, id), 0);
    if (help > 0) chips.push(`Meadow +${Math.round(help)} a day`);
  }
  if (asleep) line = `${pet.name} is asleep in the burrow. ${line}`;
  else if (isOut(pet, n)) line = `${pet.name} is out foraging. ${line}`;
  if (!decorating) g.moodline.textContent = line;

  const sig = [area, ready, empty, inYard, asleep, pet.clover, chips.join(), arranging, gardenSel, hasUpgrade(pet, 'meadow'), meadowItems(burrow).length].join('|');
  if (sig === gardenSig) return;
  gardenSig = sig;
  g.chips.replaceChildren(...chips.map((c) => h('div', { class: 'tchip', text: c })));
  // (the Burrow tab at the top goes back; Upgrades has the yard's buildings too)
  const upgrades = actButton('Upgrades', 'leafy', () => openGardenUpgrades());
  const buttons = area === 'patch'
    ? [actButton('Pick', 'strawberry', () => pickAll(), { badge: ready ? String(ready) : undefined, off: !ready && "Nothing's ripe yet. Tap a plot to see how long." }),
      actButton('Plant', 'leafy', () => openSeeds(empty), { off: empty < 0 && 'Every plot is growing something.' }), upgrades]
    : area === 'yard'
      ? [actButton('Collect', 'clover', () => { collectYard(); renderGarden(); }, { badge: inYard >= 1 ? String(inYard) : undefined, off: inYard < 1 && (perHour(pet) ? 'Nothing to collect yet. The yard fills up every hour.' : 'Build a clover patch first: tap a + in the yard.') }),
        actButton('Build', 'shed', () => openGardenUpgrades())]
      : meadowButtons();
  g.acts.style.gridTemplateColumns = `repeat(${buttons.length}, minmax(0, 1fr))`;
  g.acts.replaceChildren(...buttons);
  g.canvas.setAttribute('aria-label', area === 'patch'
    ? `The veg patch: ${ps.length} plots, ${ready} ready to pick.`
    : area === 'yard' ? `The yard: ${countOf(pet, 'patch')} clover patches, ${countOf(pet, 'hive')} beehives, ${countOf(pet, 'log')} mushroom logs, ${inYard} clover waiting.`
      : hasUpgrade(pet, 'meadow') ? `The meadow: ${meadowItems(burrow).map((i) => byId(i.id)?.name).filter(Boolean).join(', ') || 'empty grass'}.${arranging ? ' Drag a piece to move it. With the keyboard: N and P pick a piece, arrow keys move it (Shift for bigger steps), F flips it, Delete puts it away.' : ''}` : 'The meadow, behind its gate.');
}

// ------------------------------------------------------------------ the meadow
// The garden's third area: outdoor decor, six pieces of which help the yard
// (docs/rabbit-pets-garden.md §6, yard.ts meadowShare).

let arranging = false;
let gardenSel: string | null = null;

const BOOST_LINE: Record<'patch' | 'hive' | 'log', string> = {
  patch: 'Clover patches make 10% more',
  hive: 'Beehives make 10% more',
  log: 'Mushroom logs make 10% more',
};

/** Bring pet.meadow in line with what's placed in the meadow; saves only if it changed. */
function syncMeadow(): void {
  const next = setMeadow(pet, meadowHelpers(burrow), now());
  if (next === pet) return;
  pet = next;
  savePet();
}

/** The gate's offer. */
function confirmMeadow(): void {
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
    const rows = CATALOG.filter((d) => isOutdoor(d) && !d.welcome).map((def) => {
      const mine = burrow.items.find((i) => i.id === def.id);
      const what = def.boost ? `${BOOST_LINE[def.boost]}.` : 'Just for looks.';
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
          toast(def.boost ? `${def.name} out in the meadow. ${BOOST_LINE[def.boost]}.` : `${def.name} out in the meadow.`);
          note(`Got ${article(def.name)} for the meadow.`, 'flower', `decor:${def.id}`);
          redraw();
          renderGarden();
        });
        if (pet.clover < def.price) setOff(right as HTMLButtonElement, moreClover(def.price));
      }
      return h('div', { class: 'shop-row' }, h('span', { class: 'ico' }, img(s, fitScale(s, 28))),
        h('span', { class: 'txt' }, h('span', { class: 'nm', text: def.name }), h('span', { class: 'sub', text: what })), right);
    });
    // the welcome line, in order: what each adds to a visit, for you
    const next = nextWelcome(pet);
    const welcome = CATALOG.filter((d) => d.welcome).sort((a, b) => a.welcome! - b.welcome!).map((def) => {
      const have = welcomeLevel(pet) >= def.welcome!;
      const state = have ? { owned: 'Yours' } : next?.id === def.id ? { price: def.price } : { locked: `After the ${CATALOG.find((d) => d.welcome === def.welcome! - 1)!.name.toLowerCase()}` };
      return shopRow(def.name, `Every visit, made or received, pays you ${WELCOME.step} more clover.`, state, () => {
        const r = buyWelcome(pet);
        if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? moreClover(def.price) : 'You have them all.'); return; }
        pet = r.state;
        savePet();
        giveWelcomePieces();
        play('clover');
        haptic('success');
        toast(`${def.name} out in the meadow. Visits now pay you ${visitPay(pet)} clover.`);
        note(`Put out ${article(def.name)} for visiting friends.`, def.art, `decor:${def.id}`);
        redraw();
        renderGarden();
      }, def.art);
    });
    return [
      h('div', { class: 'eyebrow', text: 'The meadow' }),
      h('h2', { text: 'Welcome friends' }),
      h('p', { class: 'note', text: `A visit pays you ${visitPay(pet)} clover, whether you visit a friend or they visit you (the first ${FRIEND_CLOVER.paidPerDay} of each a day). Each of these adds ${WELCOME.step} more. They only pay off if friends visit.` }),
      h('div', { class: 'shop-list' }, ...welcome),
      h('h2', { text: 'For the meadow' }),
      h('p', { class: 'note', text: 'A piece helps while it’s out anywhere in the meadow. Where it stands is up to you: Arrange to move things.' }),
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
  const help = BUILDING_IDS.reduce((sum, id) => sum + meadowPerDay(pet, id) * countOf(pet, id), 0);
  if (help > 0) return `The meadow adds ${Math.round(help)} clover a day to the yard.`;
  return meadowItems(burrow).length ? 'A lovely spot. Some pieces would help the yard, too.' : 'An empty meadow. Visit the shop for something to put out.';
}

// ------------------------------------------------------------------ toys

const TOY_ART: Record<string, ItemArt> = { ball: 'ball', yarn: 'yarn', box: 'box', tunnel: 'tunnel', swing: 'swing', ballpit: 'ballpit', maze: 'maze', kite: 'kite' };

/** Play with her toys: no score, no limit. Toys she doesn't have yet can be bought here. */
function openToys(): void {
  openLiveSheet((close, redraw) => {
    const toys = TOYS.map((t) => {
      const owned = ownsToy(pet, t.id);
      const locked = !owned && t.after && !ownsToy(pet, t.after) ? `After the ${toyById(t.after)!.name.toLowerCase()}` : null;
      const key = `toy:${t.id}`;
      const s = itemSprite(TOY_ART[t.id] ?? 'sparkle');
      const b = h('button', {
        class: 'wear' + (pet.goal === key ? ' pinned' : ''), type: 'button',
        'aria-label': owned ? `Play with the ${t.name.toLowerCase()}` : locked ? `${t.name}. ${locked}.` : `${t.name}. ${t.price} clover.`,
      },
      pet.goal === key ? h('span', { class: 'tag goal', text: 'Goal' }) : null,
      h('span', { class: 'art' }, img(s, fitScale(s, 40))),
      h('span', { class: 'nm', text: t.name }),
      owned ? h('span', { class: 'pr', text: 'Play' }) : locked ? h('span', { class: 'pr', text: locked })
        : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(t.price)));
      b.addEventListener('click', () => {
        if (owned) {
          close();
          doAction('play', { toy: t.id });
          return;
        }
        if (pet.clover < t.price) { toggleGoal(key, t.name); redraw(); return; }
        const r = buyToy(pet, t.id);
        if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
        pet = r.state;
        savePet();
        play('clover');
        haptic('success');
        toast(`A new ${t.name.toLowerCase()} for ${pet.name}!`);
        note(`Got ${article(t.name)} for her toy box.`, TOY_ART[t.id] ?? 'gift', `toy:${t.id}`);
        redraw();
      });
      if (locked) setOff(b, `${locked}: you'll need that one first.`);
      return b;
    });
    return [
      h('div', { class: 'eyebrow', text: 'Play' }),
      h('h2', { text: `Play with ${pet.name}` }),
      h('div', { class: 'toys' }, ...toys),
      h('p', { class: 'note', text: 'Playing cheers her up and counts as care. Tap a toy you can\'t afford yet to save up for it.' }),
      ...forageSection(close),
      h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
    ];
  });
}

/** Foraging, in the Play sheet: send her out, or call her home. */
function forageSection(close: () => void): Node[] {
  const n = now();
  const t = tripOf(pet);
  if (t && isOut(pet, n)) {
    const hours = Math.floor((n - t.startedAtMs) / HOUR_MS);
    return [
      h('h3', { class: 'gift-sub', text: 'Out foraging' }),
      h('p', { text: `${pet.name} is home in ${fmtDuration(t.endsAtMs - n)}. ${hours
        ? `Call her back now and she brings what she found in the ${hours === 1 ? 'first hour' : `${hours} whole hours`} she's been out.`
        : "She's only just left: call her back now and she comes home empty-handed."}` }),
      h('div', { class: 'actions-col' }, button('Call her home', 'btn', () => { close(); doAction('recall'); })),
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
    h('h3', { class: 'gift-sub', text: 'Go foraging' }),
    h('div', { class: 'gift-kinds' }, ...trips),
    h('p', { class: 'note', text: 'She comes home with clover, strawberries, finds for the shelf, and now and then a golden carrot: the longer she\'s out, the fuller her basket. Nobody can feed or clean her while she\'s away, so she\'ll come back hungry.' }),
  ];
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

/** A row in a shop list: name and what it does, then a price button, "Owned" or its condition. */
function shopRow(name: string, what: string, state: { price: number } | { owned: string } | { locked: string }, onBuy: () => void, art?: ItemArt): HTMLElement {
  let right: HTMLElement;
  if ('price' in state) {
    right = h('button', { class: 'btn small', type: 'button', 'aria-label': `${name}. Buy for ${state.price} clover.` },
      img(itemSprite('clover'), 1), String(state.price));
    right.addEventListener('click', onBuy);
    if (pet.clover < state.price) setOff(right as HTMLButtonElement, moreClover(state.price));
  } else {
    right = pill('owned' in state ? state.owned : state.locked, 'soft');
  }
  const icon = art ? h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 28))) : null;
  return h('div', { class: 'shop-row' }, icon,
    h('span', { class: 'txt' }, h('span', { class: 'nm', text: name }), h('span', { class: 'sub', text: what })), right);
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
    goal('upgrade');
    redraw();
  };
  const rows = UPGRADES.map((u) => {
    const need = u.requires;
    const short: Record<string, string> = { plot2: 'plot 2', plot3: 'plot 3', plot4: 'plot 4', can: 'the can' };
    const cond = [need?.upgrade && !hasUpgrade(pet, need.upgrade) ? `After ${short[need.upgrade]}` : '',
      need?.soil && soilLevel(pet) < need.soil ? `Soil ${need.soil}` : ''].filter(Boolean).join(' + ');
    const state = hasUpgrade(pet, u.id) ? { owned: 'Owned' } : !upgradeUnlocked(pet, u) ? { locked: cond } : { price: u.price };
    return shopRow(u.name, u.what, state, buy(u.id, u.name));
  });
  const lvl = soilLevel(pet);
  if (soilMaxed(pet)) {
    rows.push(shopRow(`Richer soil (level ${lvl})`, `As rich as it gets: sprouts give ${sproutClover(pet)} clover, strawberries come ${cropYield(pet, 'berry')} at a time and golden carrots in twos.`, { owned: 'Top level' }, () => undefined));
  } else {
    // what the next level adds: always sprouts, and sometimes more strawberries or golden carrots
    const more = [`sprouts give ${sproutClover(pet) + SOIL.perLevel} clover, not ${sproutClover(pet)}`];
    if (cropYield(pet, 'berry', lvl + 1) > cropYield(pet, 'berry')) more.push(`strawberries come ${cropYield(pet, 'berry', lvl + 1)} at a time`);
    if (cropYield(pet, 'golden', lvl + 1) > cropYield(pet, 'golden')) more.push('golden carrots come in twos');
    const list = more.length > 1 ? `${more.slice(0, -1).join(', ')} and ${more[more.length - 1]}` : more[0]!;
    rows.push(shopRow(`Richer soil (level ${lvl + 1} of ${SOIL.maxLevel})`, `${list[0]!.toUpperCase()}${list.slice(1)}.`,
      { price: soilPrice(pet) }, buy('soil', `Soil level ${lvl + 1}`)));
  }
  return h('div', { class: 'shop-list' }, h('h3', { text: 'Garden upgrades' }), ...rows);
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
  const rows = BUILDING_IDS.map((id) => {
    const b = BUILDINGS[id];
    const have = countOf(pet, id);
    const what = have >= b.max ? `${have} of ${b.max}` : `${have} of ${b.max} · ${paysLine(id)}`;
    const state = have >= b.max ? { owned: 'Full' }
      : !buildingUnlocked(pet, id) ? { locked: `After ${b.requires!.count} ${b.requires!.building === 'patch' ? 'patches' : 'hives'}` }
        : { price: nextPrice(pet, id) };
    return shopRow(b.name, what, state, buyB(id), id);
  });
  const shed = shedPrice(pet);
  rows.push(shopRow('Yard shed', `Storage holds ${storageHours(pet)} hours now${shed ? `; the next shed makes it ${storageHours(pet) + 12}` : ''}.`,
    shed === null ? { owned: 'Owned' } : countOf(pet, SHED_REQUIRES.building) < SHED_REQUIRES.count ? { locked: 'After 3 patches' } : { price: shed },
    () => {
      const r = buyShed(pet, now());
      if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
      pet = r.state;
      savePet();
      play('place');
      toast('The shed holds more clover now.');
      redraw();
    }, 'shed'));
  const inYard = Math.floor(stored(pet, n));
  const collectBtn = button(inYard ? `Collect ${inYard} clover` : 'Nothing to collect yet', 'btn primary', () => { collectYard(); redraw(); });
  collectBtn.disabled = inYard < 1;
  const rateLine = perHour(pet)
    ? `Makes ${Math.round(perHour(pet) * 24)} clover a day. Holds ${Math.round(capacity(pet))}.`
    : 'Build a clover patch and it makes clover every hour, even while you’re away.';
  return h('div', { class: 'shop-list' }, h('h3', { text: 'The yard' }), h('p', { class: 'note', text: rateLine }), perHour(pet) ? collectBtn : null, ...rows);
}

function collectYard(): void {
  const r = collect(pet, now());
  if (r.clover < 1) return;
  pet = r.state;
  savePet();
  play('clover');
  haptic('light');
  // it rises from the yard if you're in the garden, and over the clover chip in the burrow
  if (room === 'garden') gardenScene?.burst('clover', 4, performance.now(), { x: areaX('yard') + AREA_W / 2, y: 60 });
  else scene?.burst('clover', 4, performance.now(), { x: 80, y: 14 });
  toast(`+${r.clover} clover from the yard.`);
  goal('yard');
  render();
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
  const inGarden = (a: AreaId) => () => { openGarden(); goArea(a); };
  switch (g) {
    case 'feed': return () => nudge(ui.acts.feed);
    case 'nap': return () => nudge(ui.acts.nap);
    case 'bake': return () => nudge(ui.bake);
    case 'streak3': return () => nudge(ui.gift);
    case 'bed': case 'decor': case 'decor3': return () => enterDecorate();
    case 'dress': return () => openWardrobe();
    case 'toy': return () => openToys();
    case 'harvest': return inGarden('patch');
    case 'yard': return inGarden('yard');
    case 'meadow': return inGarden('meadow');
    case 'upgrade': return () => { openGarden(); openGardenUpgrades(); };
    case 'friend': return OR.user && OR.capabilities.has('showcase.friends') ? () => openFriends() : null;
    case 'bond3': return null;
  }
}

function openStarter(): void {
  openLiveSheet((close) => {
    const steps = starterView(pet).map(({ step, done, paid }) =>
      h('div', { class: 'starter-day' + (paid ? ' paid' : '') },
        h('h3', { text: `Step ${step.step} · +${step.clover} clover${step.patch ? ' and a clover patch' : ''}${paid ? ' · done' : ''}` }),
        h('ul', {}, ...step.goals.map((g, i) => {
          const go = done[i] || paid ? null : goalShortcut(g);
          return h('li', { class: done[i] ? 'done' : '' }, h('span', { text: `${done[i] ? '✓' : '○'} ${GOAL_TEXT[g]}` }),
            go ? button('Show me', 'btn small', () => { close(); go(); }) : null);
        }))));
    const waiting = starterWaiting(pet);
    const next = starterDone(pet) ? null : h('p', { class: 'note', text: waiting
      ? `Step ${starterStep(pet)} opens next time you drop by (tomorrow or later). Anything you do before then still counts.`
      : `A new step opens each time you drop by on another day, whenever that is. Anything you do early still counts.` });
    const shown = waiting ? starterStep(pet) - 1 : starterStep(pet);
    const out: Node[] = [
      h('div', { class: 'eyebrow', text: `Getting started · step ${shown} of ${STARTER_STEPS.length}` }),
      h('h2', { text: `Settling in with ${pet.name}` }),
      ...steps,
    ];
    if (next) out.push(next);
    out.push(h('div', { class: 'actions-col' }, button('Close', 'btn', close)));
    return out;
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

// ------------------------------------------------------------------ more: profile and the rest

function openMore(): void {
  openSheet((close) => {
    const trait = traitOf(pet.petId);
    const info = TRAIT_INFO[trait];
    const bl = bondLevel(pet.bond).level;
    const found = COLLECTIBLES.filter((c) => (pet.collection?.[c.id] ?? 0) > 0).length;
    const profile = h('div', { class: 'profile' },
      h('div', { class: 'profile-art' }, img(rabbitSprite(pet.coat, 'content', 0, dressOf(pet)), 3, pet.name)),
      h('div', { class: 'profile-text' },
        h('h2', { text: pet.name }),
        h('div', { class: 'pills' }, pill(info.name)),
        h('p', { text: info.blurb }),
        h('p', { class: 'meta', text: `${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} together · Bond ${bl} · Since ${fmtDate(pet.bornAtMs)}` })));

    const row = (label: string, sub: string, art: ItemArt | null, onClick: () => void) => {
      const b = h('button', { class: 'menu-row', type: 'button' },
        art ? h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 26))) : h('span', { class: 'ico' }),
        h('span', { class: 'txt' }, h('span', { class: 'nm', text: label }), h('span', { class: 'sub', text: sub })));
      b.addEventListener('click', onClick);
      return b;
    };
    const w = wardrobe(pet);
    const rows: HTMLElement[] = [
      row('Wardrobe', w.owned.length ? `${w.owned.length} of ${OUTFITS.length} outfits` : 'Bows, hats and scarves', 'bow', () => { close(); openWardrobe(); }),
      row('Collection', `${found} of ${COLLECTIBLES.length} found · ${CRITTERS.filter((c) => pet.critters?.seen[c.id]).length} visitors met`, 'marble', () => { close(); openCollection(); }),
      row('Clover rate', `+${Math.round((rate(pet).total - 1) * 100)}% from her bond, collection and friends`, 'clover', () => { close(); openRate(); }),
      ...(EXTRA_ROOMS.some((r) => !roomsOf(burrow).includes(r)) ? [row('Dig a new room', `More space for decor, from ${ROOMS[EXTRA_ROOMS.find((r) => !roomsOf(burrow).includes(r))!].price.toLocaleString()} clover`, 'shed', () => { close(); openDig(); })] : []),
      row('Journal', journal.entries.length ? `${journal.entries.length} ${journal.entries.length === 1 ? 'entry' : 'entries'}` : 'Your story together', 'book', () => { close(); openJournal(); }),
      row(away() ? 'On holiday' : 'Going away?', away() ? `Until ${fmtDate(pet.vacationUntilMs!)}` : 'Pause her needs for a trip', 'suitcase', () => { close(); openVacation(); }),
      row('Share', `Tell a friend about ${pet.name}`, 'heart', () => { close(); void shareCard(); }),
    ];
    if (OR.user && OR.capabilities.has('showcase.friends')) {
      rows.splice(3, 0, row('Friends', `Visit their burrows, send a gift · visits pay you ${visitPay(pet)} clover`, 'gift', () => { close(); openFriends(); }),
        row('Guest book', guestbookLine(), 'book', () => { close(); openGuestbook(); }));
    }
    if (OR.capabilities.has('notifications.schedule')) {
      const on = settings.reminders === 'on';
      const r = row(`Reminders: ${on ? 'on' : 'off'}`, on ? 'Nudges when she wakes, treats, the garden and gifts' : 'Off. Tap to turn on.', 'moon', () => {
        settings.reminders = on ? 'off' : 'on';
        saveSettings();
        toast(settings.reminders === 'on' ? "Reminders on. We'll nudge you now and then." : 'Reminders off.');
        queueReconcile();
        close();
        openMore();
      });
      r.setAttribute('aria-pressed', String(on));
      rows.splice(4, 0, r);
    }
    rows.push(row('Start over', `Say goodbye to ${pet.name} and adopt a new rabbit`, null, () => { close(); confirmStartOver(); }));
    return [profile, h('div', { class: 'menu' }, ...rows), h('div', { class: 'actions-col' }, button('Close', 'btn', close))];
  });
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
  closeFoodTray();
  decorating = false;
  scene = null;
  pet = undefined as unknown as PetState;
  inStorage = { pet: null, burrow: null };
  burrow = starterBurrow();
  journal = emptyJournal();
  renderAdopt();
}

// ------------------------------------------------------------------ wardrobe

function openWardrobe(): void {
  openLiveSheet((close, redraw) => {
    const n = now();
    const w = wardrobe(pet);
    const section = (slot: Slot, title: string) => {
      const items = OUTFITS.filter((o) => o.slot === slot && (w.owned.includes(o.id) || (!o.giftOnly && (!o.limited || limitedAvailable(o.id, n, tz)))));
      const none = h('button', { class: 'wear', type: 'button', 'aria-pressed': String(!w[slot]) },
        h('span', { class: 'art' }, img(rabbitSprite(pet.coat, 'content', 0, { ...dressOf(pet), [slot]: null }), 2)),
        h('span', { class: 'nm', text: 'Nothing' }), h('span', { class: 'pr', text: ' ' }));
      none.addEventListener('click', () => { pet = wear(pet, slot, null); savePet(); play('flip'); redraw(); });
      const buttons = items.map((o) => {
        const owned = w.owned.includes(o.id);
        const on = w[slot] === o.id;
        const locked = !owned && o.bond && bondLevel(pet.bond).level < o.bond ? `Bond ${o.bond}` : null;
        const key = `outfit:${o.id}`;
        const b = h('button', {
          class: 'wear' + (pet.goal === key ? ' pinned' : ''), type: 'button', 'aria-pressed': String(on),
          'aria-label': `${o.name}. ${owned ? (on ? 'Wearing.' : 'Owned. Put it on.') : locked ? `${locked}.` : `${o.price} clover.`}`,
        },
        o.limited && !owned ? h('span', { class: 'tag', text: 'Limited' }) : null,
        pet.goal === key ? h('span', { class: 'tag goal', text: 'Goal' }) : null,
        h('span', { class: 'art' }, img(rabbitSprite(pet.coat, 'content', 0, { ...dressOf(pet), [slot]: o.id }), 2)),
        h('span', { class: 'nm', text: o.name }),
        owned ? h('span', { class: 'pr', text: on ? 'Wearing' : 'Owned' }) : locked ? h('span', { class: 'pr', text: locked })
          : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(o.price)));
        b.addEventListener('click', () => {
          if (owned) {
            pet = wear(pet, slot, on ? null : o.id);
            savePet();
            play('flip');
            if (!on) goal('dress');
          } else {
            if (pet.clover < o.price) { toggleGoal(key, o.name); redraw(); return; }
            const r = buyOutfit(pet, o.id);
            if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
            if (pet.goal === key) r.state.goal = null;
            pet = r.state;
            savePet();
            play('clover');
            haptic('success');
            toast(`${pet.name} tries on the ${o.name.toLowerCase()}.`);
            goal('dress');
            note(`Got ${article(o.name)}.`, 'gift', `outfit:${o.id}`);
          }
          redraw();
        });
        if (locked) setOff(b, `Opens at ${locked.toLowerCase()}.`);
        return b;
      });
      return h('div', { class: 'wear-section' }, h('div', { class: 'eyebrow', text: title }), h('div', { class: 'wear-row' }, none, ...buttons));
    };
    return [
      h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, 'happy', 0, dressOf(pet)), 4, `${pet.name} in her outfit`)),
      h('h2', { text: 'Wardrobe' }),
      section('head', 'On her head'),
      section('neck', 'Round her neck'),
      h('div', { class: 'actions-col' }, button('Done', 'btn primary', close)),
    ];
  });
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
      h('p', { class: 'note', text: 'You can bring her home early any time from More.' }),
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
      e.decor.length ? button('See the decor', e.raffle ? 'btn' : 'btn primary', () => { close(); enterDecorate(); }) : null,
      e.outfits.length || e.gift ? button('Open the wardrobe', e.decor.length ? 'btn' : 'btn primary', () => { close(); openWardrobe(); }) : null,
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
  ticket.addEventListener('click', () => {
    const r = drawTicket(pet, e);
    if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? moreClover(RAFFLE.ticket) : 'The raffle is closed.'); return; }
    pet = r.state;
    savePet();
    const d = r.draw;
    if (d.kind === 'prize') {
      play('gift');
      haptic('success');
      toast(`You won the ${prize.name.toLowerCase()}!`);
      note(`Won the ${prize.name.toLowerCase()} in the ${e.name} raffle.`, 'gift', `raffle:${e.id}`);
    } else if (d.kind === 'find') {
      const c = COLLECTIBLES.find((x) => x.id === d.id);
      play('find');
      toast(`Not the prize, but ${c ? article(c.name) : 'a find'} for the shelf!`);
      if (c) note(`Found ${article(c.name)} for the shelf, in the ${e.name} raffle.`, c.id, `find:${c.id}`);
    } else {
      play('clover');
      toast(`Not the prize this time. ${d.amount} clover back.`);
    }
    render();
    redraw();
  });
  if (pet.clover < RAFFLE.ticket) setOff(ticket, moreClover(RAFFLE.ticket));
  const out: (Node | null)[] = [
    h('h3', { class: 'gift-sub', text: 'Festival raffle' }),
    preview,
    h('p', { text: `This year's prize is the ${prize.name.toLowerCase()}, and you can only win it. Each ticket has a 1 in ${Math.round(1 / RAFFLE.odds)} chance, and ${left === 1 ? 'your next ticket wins it for sure' : `you'll have it within ${left} more tickets at most`}. Any other ticket brings a ${e.name} find you're missing, or ${RAFFLE.refund} clover back.` }),
    h('div', { class: 'actions-col' }, ticket),
    bought ? h('p', { class: 'note', text: `${bought} ${bought === 1 ? 'ticket' : 'tickets'} so far. They carry over to next year until you win.` }) : null,
  ];
  return out.filter((x): x is Node => x !== null);
}

/**
 * Her welcome pieces in the meadow, one for each she's bought (welcomeLevel,
 * kept with her). Each has a fixed uid, so a level bought on another device
 * brings its piece here too, and never twice.
 */
function giveWelcomePieces(): void {
  let added = false;
  for (const def of CATALOG.filter((d) => d.welcome && d.welcome <= welcomeLevel(pet))) {
    const uid = `welcome-${def.id}`;
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
        h('div', { class: 'actions-col' }, button('Place it', 'btn primary', () => { close(); enterDecorate(); }), button('Later', 'btn', close)),
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
  const d = buildShowcase(pet, burrow);
  const sig = showcaseSignature(d);
  if (sig === lastShowcaseSig && Date.now() - lastShowcaseAt < 20 * 60_000) return;
  lastShowcaseSig = sig;
  lastShowcaseAt = Date.now();
  void OR.showcase.publish(d as unknown as Record<string, unknown>).catch(() => { lastShowcaseSig = ''; });
}

/** Gifts from friends: open them all at once. */
async function checkInbox(): Promise<void> {
  if (!OR.user || !OR.capabilities.has('gifts.send')) return;
  const gifts = await OR.gifts.inbox().catch(() => []);
  if (!gifts.length || sheetPending('inbox')) return;
  openSheet((close) => {
    const open = button(gifts.length === 1 ? 'Open it' : `Open all ${gifts.length}`, 'btn primary', async () => {
      open.disabled = true;
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
      if (opened) { savePet(); play('gift'); haptic('success'); toast(`${opened === 1 ? 'Gift opened.' : `${opened} gifts opened.`}${clover ? ` +${clover} clover.` : ''}`); }
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

let visitGuests: { visit: VisitIn; data: ShowcaseData }[] = [];

function guestModels(): { coat: Coat; dress: Dress }[] {
  return visitGuests.slice(0, 2).map(({ data: d }) => ({ coat: d.coat, dress: { head: d.head, neck: d.neck, ears: d.ears } }));
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
      savePet();
      for (const v of fresh) note(`${v.from.username} came to visit.`, 'heart', `visitfrom:${v.from.uuid}`);
      window.setTimeout(() => {
        const who = fresh.length === 1 ? `${fresh[0]!.from.username} visited` : `${fresh.length} friends visited`;
        toast(`${who}!${paid.clover ? ` +${paid.clover} clover.` : ''}`, () => play('gift'));
      }, 1200);
    }
  }
  signGuestbookFrom(visits);
  visitGuests = guestsToShow(visits, now(), tz);
  render();
}

/** Every visit in the inbox goes in her guest book (it keeps them past the inbox's week). */
function signGuestbookFrom(visits: VisitIn[]): void {
  const next = signGuestbook(journal, visits.map((v) => {
    const note = noteOf(v.kind);
    return {
      visitUuid: v.visitUuid, atMs: Date.parse(v.visitedAt) || now(), from: v.from.username,
      rabbit: readShowcase(v.showcase)?.name ?? v.from.username, care: String(v.kind).split('-')[0] ?? '', ...(note ? { note } : {}),
    };
  }));
  if (next === journal) return;
  journal = { ...next, rev: journal.rev + 1 };
  saver.queue(KEYS.journal, () => journal);
}

function guestbookLine(): string {
  const n = journal.guestbook?.length ?? 0;
  return n ? `${n} ${n === 1 ? 'visit' : 'visits'}, and the notes friends left` : 'Who came to visit, and the notes they left';
}

function openGuestbook(): void {
  const book = journal.guestbook ?? [];
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Guest book' }),
    h('h2', { text: `${pet.name}'s visitors` }),
    book.length
      ? h('ul', { class: 'guestbook' }, ...book.map((g) => {
        const did = visitInfo(g.care)?.did;
        const note = g.note && Object.prototype.hasOwnProperty.call(GUEST_NOTES, g.note) ? noteText(g.note as GuestNote, pet.name) : null;
        return h('li', {},
          h('span', { class: 'txt' },
            h('span', { class: 'nm', text: `${g.rabbit} (${g.from})` }),
            h('span', { class: 'meta', text: `${fmtDate(g.atMs)}${did ? ` · ${did}` : ''}` }),
            note ? h('span', { class: 'quote', text: `“${note}”` }) : null));
      }))
      : h('p', { text: 'No visitors yet. When friends visit, they sign here, and some leave a note.' }),
    h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
  ]);
}

function visitLine(v: VisitIn, name: string): string {
  const info = visitInfo(v.kind);
  const note = noteOf(v.kind);
  return `${name} (${v.from.username}) came to visit${info ? ` and ${info.did}` : ''}.${note ? ` “${noteText(note, pet.name)}”` : ''}`;
}

function greetGuest(i: number): void {
  const g = visitGuests[i];
  if (!g || !scene) return;
  scene.cheerGuest(i, performance.now());
  play('pet');
  ui.moodline.textContent = visitLine(g.visit, g.data.name);
}

function openVisitors(): void {
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Visiting today' }),
    h('h2', { text: visitGuests.length === 1 ? `${visitGuests[0]!.data.name} is visiting` : `${visitGuests.length} friends visited` }),
    h('ul', {}, ...visitGuests.map(({ visit, data }) => h('li', {},
      h('span', { class: 'ico' }, img(rabbitSprite(data.coat, 'content', 0, { head: data.head, neck: data.neck, ears: data.ears }), 1, data.name)),
      h('span', { class: 'txt' }, h('span', { class: 'nm', text: data.name }), h('span', { class: 'meta', text: visitLine(visit, data.name) }))))),
    h('p', { class: 'note', text: 'Friends who visit stay until tomorrow at 5am. Visit them back from More → Friends.' }),
    h('div', { class: 'actions-col' }, button('Close', 'btn', close)),
  ]);
}

function openFriends(): void {
  let friends: Friend[] | null = null;
  let sent = new Set<string>();
  openLiveSheet((close, redraw) => {
    if (!friends) {
      void Promise.all([OR.showcase.friends({ limit: 100 }).catch(() => []), OR.gifts.sentToday().catch(() => [])]).then(([rows, s]) => {
        friends = rows.flatMap((r) => {
          const data = readShowcase(r.data);
          return data ? [{ uuid: r.uuid, username: r.username, data }] : [];
        });
        sent = new Set(s);
        redraw();
      });
      return [h('div', { class: 'eyebrow', text: 'Friends' }), h('h2', { text: 'Friends’ burrows' }), h('p', { text: 'Knocking on doors…' })];
    }
    const list = friends.length
      ? h('ul', { class: 'friends' }, ...friends.map((f) => {
        const d = f.data;
        const visit = button('Visit', 'btn', () => { close(); visitFriend(f); });
        const gift = button(sent.has(f.uuid) ? 'Sent' : 'Gift', sent.has(f.uuid) ? 'btn' : 'btn primary', () => sendGift(f, () => { sent.add(f.uuid); redraw(); }));
        gift.disabled = sent.has(f.uuid);
        gift.setAttribute('aria-label', sent.has(f.uuid) ? `Already sent ${f.username} a gift today` : `Send ${f.username} a gift`);
        return h('li', {},
          h('span', { class: 'ico big' }, img(rabbitSprite(d.coat, 'content', 0, { head: d.head, neck: d.neck, ears: d.ears }), 1, d.name)),
          h('span', { class: 'txt' }, h('span', { class: 'nm', text: `${d.name}` }), h('span', { class: 'sub', text: `${f.username} · ${d.daysVisited} ${d.daysVisited === 1 ? 'day' : 'days'} · Bond ${d.bondLevel}` })),
          h('span', { class: 'btns' }, visit, gift));
      }))
      : h('p', { text: "None of the people you follow have a rabbit yet. Share Rabbit Pets and they can visit you too." });
    return [
      h('div', { class: 'eyebrow', text: 'Friends' }),
      h('h2', { text: 'Friends’ burrows' }),
      list,
      h('p', { class: 'note', text: 'Friends are people you follow or who follow you. Send each one a gift a day; you get a clover for every gift you send.' }),
      h('div', { class: 'actions-col' }, friends.length ? null : button('Share', 'btn primary', () => { close(); void shareCard(); }), button('Close', 'btn', close)),
    ];
  });
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

/** A friend's burrow, read-only: their room, their rabbit, pottering about. */
function visitFriend(f: Friend): void {
  const d = f.data;
  const prevFocus = document.activeElement as HTMLElement | null;
  const canvas = h('canvas', { role: 'img', 'aria-label': `${d.name}'s burrow` });
  const stage = h('div', { class: 'stage' }, canvas);
  const back = button('Back home', 'btn', () => leave());
  const gift = button('Send a gift', 'btn primary', () => sendGift(f, () => { gift.disabled = true; gift.textContent = 'Gift sent'; }));
  void OR.gifts.sentToday().then((s) => { if (s.includes(f.uuid)) { gift.disabled = true; gift.textContent = 'Gift sent'; } }).catch(() => undefined);
  const holiday = !!d.vacationUntilMs && d.vacationUntilMs > now();
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite', text: holiday ? `${d.name} is away on holiday.` : `${d.name} is ${TRAIT_INFO[d.trait].name.toLowerCase()}, and happy to have a visitor. Pick something to do for her.` });
  // one act of care per friend a day: it shows up in their burrow as you, and pays you a little
  const canVisit = OR.capabilities.has('visits.record');
  const care = VISIT_KINDS.map((k) => {
    const info = VISIT_INFO[k];
    const b = h('button', { class: 'act', type: 'button' }, img(itemSprite(info.art as ItemArt), 3), h('span', { text: info.label }));
    b.addEventListener('click', () => void doVisit(k));
    return b;
  });
  // an optional note for her guest book, picked from a list
  const noteSelect = h('select', { id: 'visit-note', class: 'note-select' },
    h('option', { value: '', text: 'No note' }),
    ...(Object.keys(GUEST_NOTES) as GuestNote[]).map((n) => h('option', { value: n, text: noteText(n, d.name) })));
  const noteField = h('label', { class: 'note-field', for: 'visit-note' }, h('span', { text: 'Leave a note in her guest book' }), noteSelect);
  const visited = (text = 'Visited today') => { for (const b of care) { b.disabled = true; } noteSelect.disabled = true; const l = care[0]?.querySelector('span'); if (l) l.textContent = text; };
  if (canVisit) void OR.visits.sentToday().then((s) => { if (s.includes(f.uuid)) visited(); }).catch(() => undefined);
  async function doVisit(k: VisitKind): Promise<void> {
    for (const b of care) b.disabled = true;
    try {
      await OR.visits.record({ toUserUuid: f.uuid, kind: visitKind(k, (noteSelect.value || null) as GuestNote | null) });
    } catch (e) {
      const c = errCode(e);
      play('nope');
      toast(c === 'visits/already-visited-today' ? `You've visited ${f.username} today already.`
        : c === 'visits/too-many' ? "That's all the visits for today. More tomorrow."
          : c === 'visits/not-connected' ? `You and ${f.username} aren't connected any more.`
            : "Couldn't do that just now.");
      if (c === 'visits/already-visited-today') visited(); else for (const b of care) b.disabled = false;
      return;
    }
    const r = rewardVisit(pet, f.uuid, now(), tz);
    pet = r.state;
    savePet();
    sc.react('happy', performance.now());
    play('pet');
    haptic('success');
    moodline.textContent = VISIT_INFO[k].line(d.name);
    toast(`${f.username} will see your rabbit in their burrow${noteSelect.value ? ', and your note' : ''}.${r.clover ? ` +${r.clover} clover.` : ''}`);
    note(`Visited ${d.name} and ${VISIT_INFO[k].did}.`, 'heart', `visitcare:${f.uuid}`);
    goal('friend');
    visited();
    render();
  }
  // Their garden, for friends on a version that shares it: the same garden
  // scene, drawn from a stand-in pet, showing only what they've built.
  const gardenPet = friendGardenPet(d);
  const gcanvas = h('canvas', { role: 'img', 'aria-label': `${d.name}'s garden`, hidden: true });
  const gscene = gardenPet ? new GardenScene(gcanvas) : null;
  // their rooms (the first, and any they've dug out) and their garden, as tabs
  let view: RoomId | 'garden' = 'main';
  let garea: AreaId = 'patch';
  const views: (RoomId | 'garden')[] = ['main', ...EXTRA_ROOMS.filter((r) => d.rooms?.[r]), ...(gscene ? ['garden' as const] : [])];
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
        title.textContent = v === 'garden' ? `${d.name}'s garden` : v === 'main' ? `${d.name}'s burrow` : `${d.name}'s ${ROOMS[v].name.toLowerCase()}`;
        canvas.setAttribute('aria-label', title.textContent);
        fit();
      });
      return b;
    }));
  stage.append(gcanvas);
  const wrap = h('div', { class: 'visit', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Visiting ${d.name}` },
    h('header', { class: 'visit-top' },
      h('div', { class: 'who' }, title, h('div', { class: 'sub', text: `${f.username} · ${d.daysVisited} days · Bond ${d.bondLevel}` }))),
    stage,
    h('section', { class: 'panel' },
      moodline,
      views.length > 1 ? viewTabs : null,
      areaTabs,
      canVisit && !holiday ? h('div', { class: 'actions visit-care' }, ...care) : null,
      canVisit && !holiday ? noteField : null,
      h('div', { class: 'row2' }, back, gift)));
  document.body.append(wrap);
  visitingFriend = true;
  app.inert = true;
  const sc = new Scene(canvas);
  const roomBurrow = (items: { id: string; x: number; y: number; flip: boolean }[]): BurrowState =>
    ({ v: 2, rev: 0, items: items.map((it, i) => ({ uid: `g${i}`, id: it.id, x: it.x, y: it.y, flip: it.flip, placed: true })) });
  const guestRooms: Partial<Record<RoomId, BurrowState>> = { main: roomBurrow(d.items) };
  for (const r of EXTRA_ROOMS) if (d.rooms?.[r]) guestRooms[r] = roomBurrow(d.rooms[r]!);
  const fit = () => (view === 'garden' && gscene ? fitScene(stage, gcanvas, gscene as unknown as Scene) : fitScene(stage, canvas, sc));
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();
  let raf = 0, lastT = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - lastT < 66) return;
    lastT = t;
    const n = now();
    const w = today(n);
    const asleep = !!d.napEndsAtMs && d.napEndsAtMs > n;
    if (view === 'garden' && gscene && gardenPet) {
      gscene.draw({
        pet: gardenPet, nowMs: n, area: garea, season: w.season, weather: w.weather, night: isNight(n, tz), moon: moonPhase(n),
        coat: d.coat, dress: { head: d.head, neck: d.neck, ears: d.ears }, asleep, absent: holiday, meadowOpen: !!d.garden?.meadow,
        items: (d.garden?.meadow ?? []).map((it, i) => ({ uid: `m${i}`, ...it, placed: true })), selected: null, guest: true,
      }, t);
      return;
    }
    const r = view === 'garden' ? 'main' : view;
    sc.draw({ coat: d.coat, night: isNight(n, tz), mood: asleep ? 'asleep' : 'content', burrow: guestRooms[r] ?? guestRooms.main!, decorating: false, selected: null,
      dress: { head: d.head, neck: d.neck, ears: d.ears }, season: w.season, weather: w.weather, guest: true, absent: holiday,
      room: { wall: d.wall ?? 'plainwall', floor: d.floor ?? 'plainfloor', window: d.window ?? 'roundwindow', ...(r !== 'main' ? { variant: r } : {}) }, moon: moonPhase(n) }, t);
  };
  raf = requestAnimationFrame(loop);
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = sc.toRoom(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
    const b = sc.rabbitBox();
    if (!holiday && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { sc.react('happy', performance.now()); play('pet'); }
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
  }
}

// ------------------------------------------------------------------ share

async function shareCard(): Promise<void> {
  const m = mood(pet, now(), tz);
  const feeling: Record<Mood, string> = {
    content: 'feeling cozy', peckish: 'hoping for a carrot', lonely: 'waiting for a cuddle', sleepy: 'getting sleepy',
    dusty: 'a little dusty', grumpy: 'a bit grumpy', asleep: 'fast asleep',
  };
  try {
    await OR.actions.share({
      title: 'Rabbit Pets',
      text: `${pet.name} and I have spent ${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} together. She's ${feeling[m]} right now.`,
    });
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
