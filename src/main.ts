// Rabbit Pets: a cozy virtual pet that lives in real time. She keeps living
// while the game is closed; each visit replays the time away (sim.ts) and
// shows what happened. See docs/rabbit-pets.md.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { drawItem, drawPlot, type ItemArt } from './art/items';
import { toSprite, type Sprite } from './art/pixels';
import { drawRabbit, dressKey, type Dress, type Face, type Frame } from './art/rabbit';
import { playCatch } from './catch';
import { SCENE_H, SCENE_W } from './art/burrow';
import { now, syncClock } from './clock';
import { byId, CATALOG, clampToZone, starterBurrow, ZONES, type BurrowState, type PlacedItem } from './decor';
import {
  buyOutfit, COLLECTIBLES, CROPS, endVacation, giveOutfit, harvest, MARKING_INFO, onVacation, OUTFITS, outfitById, plant, playsLeft, plots,
  recordPlay, stage as cropStage, startVacation, VACATION_CHOICES, wardrobe, wear, type CropId, type Slot,
} from './extras';
import { addEntry, emptyJournal, MILESTONE_DAYS, type Journal } from './journal';
import { applyGift, buildShowcase, GIFT_INFO, GIFT_KINDS, readShowcase, SEND_REWARD_CLOVER, showcaseSignature, type GiftKind, type ShowcaseData } from './social';
import { deviceTimeZone } from './localtime';
import { desiredReminders, reconcile } from './reminders';
import { Scene } from './render';
import { newPetId } from './rng';
import { pauseSound, play, resumeSound, setMuted } from './sound';
import {
  act, advance, bondLevel, COATS, giftReady, isAsleep, isNight, mood, newPet,
  FOOD_IDS, spendClover, timer, visit, earsOf, EARS, type Action, type FoodId, type Coat, type Ears, type Mood, type NeedKey, type PetEvent, type PetState,
} from './sim';
import { defaultSettings, KEYS, loadBurrow, loadJournal, loadPet, loadSettings, Saver, type Settings } from './store';
import { DAY_ROLLOVER_HOUR, WAKE_HOUR } from './tuning';
import { dayKey } from './localtime';
import { activeEvents, limitedAvailable, seasonOf, TRAIT_INFO, traitOf, weatherOf, WEATHER_NAME, type Season, type Weather } from './world';

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
/** Her outfit and marking, for drawing. */
function dressOf(p: PetState): Dress {
  const w = wardrobe(p);
  return { head: w.head, neck: w.neck, marking: p.marking ?? null, ears: earsOf(p) };
}
/** An <img> of a sprite at a whole-number scale. */
function img(s: Sprite, scale: number, alt = ''): HTMLImageElement {
  const el = h('img', { class: 'px', alt, width: s.w * scale, height: s.h * scale });
  el.src = s.canvas.toDataURL();
  return el;
}
/** Largest whole-number scale that fits the sprite in a box. */
function fitScale(s: Sprite, box: number): number {
  return Math.max(1, Math.floor(box / Math.max(s.w, s.h)));
}

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
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

function savePet(): void {
  pet.rev += 1;
  saver.queue(KEYS.pet, () => pet);
  queueShowcase();
}
function saveBurrow(): void {
  burrow.rev += 1;
  saver.queue(KEYS.burrow, () => burrow);
  queueShowcase();
}
function saveSettings(): void {
  settings.rev += 1;
  saver.queue(KEYS.settings, () => settings);
}
/** Write a line in her journal; with `first`, only the first time. */
function note(text: string, art?: ItemArt, first?: string): void {
  const next = addEntry(journal, { atMs: now(), text, art }, first);
  if (next === journal) return;
  journal = { ...next, rev: journal.rev + 1 };
  saver.queue(KEYS.journal, () => journal);
}

// ------------------------------------------------------------------ boot

async function boot(): Promise<void> {
  await OR.whenReady();
  saver = new Saver(OR, () => toast("Couldn't save just now. We'll try again."));

  if (!OR.user && !PREVIEW) {
    renderSignIn();
    OR.ready();
    return;
  }

  await Promise.race([syncClock(OR), new Promise((r) => setTimeout(r, 2500))]);
  const [p, b, s, j] = await Promise.all([loadPet(OR), loadBurrow(OR), loadSettings(OR), loadJournal(OR)]);
  settings = s ?? defaultSettings();
  journal = j ?? emptyJournal();
  burrow = b ?? starterBurrow();
  if (!p) {
    renderAdopt();
    OR.ready();
    return;
  }
  pet = p;
  startGame(true);
  OR.ready();
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
  const nameInput = h('input', { id: 'rabbit-name', type: 'text', value: 'Clover', maxlength: 16, autocomplete: 'off' });
  const go = h('button', { class: 'btn primary', type: 'submit', text: 'Bring her home' });
  const form = h('form', { class: 'inner' },
    h('div', { class: 'intro' },
      h('h1', { text: 'Adopt your rabbit' }),
      h('p', { text: "She'll live in her burrow in real time, and she'll always be happy to see you." })),
    h('div', { class: 'pen' }, preview),
    h('fieldset', { style: 'margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px' }, legend, label, h('div', { class: 'coats' }, ...coatBtns)),
    h('fieldset', { style: 'margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px' }, earLegend, earLabel, h('div', { class: 'coats ears' }, ...earBtns)),
    h('div', { class: 'field' }, h('label', { for: 'rabbit-name', text: 'Her name' }), nameInput),
    go
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) { toast('Give her a name first.'); nameInput.focus(); return; }
    pet = newPet(newPetId(), name, coat, now(), tz, ears);
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
  /** The panel's normal contents, restored after decorating. */
  panelKids: Node[];
}
let ui: Ui;
let scale = 4;
let decorating = false;
/** The piece being moved while decorating. */
let selectedUid: string | null = null;
let drag: { uid: string; dx: number; dy: number; moved: boolean } | null = null;

function startGame(returning: boolean): void {
  // Browsers only allow audio after a gesture: unlock on the first one.
  setMuted(settings.sound === false);
  const unlock = () => resumeSound();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  buildBurrowScreen();
  catchUp(returning);
  wireLifecycle();
  requestAnimationFrame(frame);
  window.setInterval(tick, 1000);
}

function buildBurrowScreen(): void {
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
  const stage = h('main', { class: 'stage' }, canvas, chips, gift);

  const actBtn = (id: 'feed' | 'pet' | 'clean' | 'nap', label: string, icon: Node) =>
    h('button', { class: 'act', type: 'button', 'data-act': id }, icon, h('span', { text: label }));
  const feedBadge = h('span', { class: 'badge', hidden: true });
  const acts = {
    feed: actBtn('feed', 'Feed', img(itemSprite('carrot'), 3)),
    pet: actBtn('pet', 'Pet', img(itemSprite('heart'), 4)),
    clean: actBtn('clean', 'Clean', img(itemSprite('droplet'), 4)),
    nap: actBtn('nap', 'Nap', img(itemSprite('moon'), 4)),
  };
  acts.feed.append(feedBadge);
  // the second row: smaller tools, icon over label, five across
  const tool = (label: string, art: ItemArt, extra = '') => {
    const s = itemSprite(art);
    return h('button', { class: `tool ${extra}`.trim(), type: 'button' }, img(s, fitScale(s, 28)), h('span', { text: label }));
  };
  const decorate = tool('Decor', 'plant', 'green');
  const garden = tool('Garden', 'leafy');
  const playBtn = tool('Play', 'basket');
  const bake = tool('Bake', 'treat');
  const more = tool('More', 'book');
  const sound = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Sound' });
  const moodline = h('p', { class: 'moodline', 'aria-live': 'polite' });
  const panelKids = [moodline, h('div', { class: 'actions' }, acts.feed, acts.pet, acts.clean, acts.nap),
    h('div', { class: 'tools' }, decorate, garden, playBtn, bake, more)];
  const panel = h('section', { class: 'panel' }, ...panelKids);

  setScreen('burrow');
  app.replaceChildren(
    h('header', { class: 'hud' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'who' }, name, sub),
        h('div', { class: 'chip', 'aria-label': 'Clover' }, img(itemSprite('clover'), 2), clover), sound),
      h('div', { class: 'needs' }, ...needEls)),
    stage,
    panel
  );
  ui = { name, sub, clover, needs, stage, canvas, chips, gift, panel, moodline, acts, feedBadge, bake, garden, play: playBtn, sound, panelKids };

  scene = new Scene(canvas);
  new ResizeObserver(layoutStage).observe(stage);
  layoutStage();

  for (const k of ['pet', 'clean'] as const) acts[k].addEventListener('click', () => doAction(k));
  acts.feed.setAttribute('aria-expanded', 'false');
  acts.feed.addEventListener('click', () => toggleFoodTray());
  // Nap doubles as "Wake" while she's napping in the daytime.
  acts.nap.addEventListener('click', () => doAction(napping() ? 'wake' : 'nap'));
  bake.addEventListener('click', () => doAction('bake'));
  gift.addEventListener('click', () => doAction('gift'));
  decorate.addEventListener('click', () => enterDecorate());
  garden.addEventListener('click', () => openGarden());
  playBtn.addEventListener('click', () => void startPlay());
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
    const b = scene.rabbitBox();
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) doAction('pet');
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
  if (pet.stepIndex !== before.stepIndex || v.newDay) savePet();
  recordFinds(events);
  if (v.newDay && MILESTONE_DAYS.includes(pet.daysVisited)) note(`${pet.daysVisited} days together.`, 'heart', `days:${pet.daysVisited}`);
  // home from her holiday
  const backFromHoliday = !!pet.vacationUntilMs && !onVacation(pet, now());
  if (backFromHoliday) {
    pet = endVacation(pet);
    savePet();
    note(`${pet.name} came home from her holiday.`, 'suitcase');
  }
  if (showSummary && gap > 30 * 60_000) showAway(gap, events, v.newDay, backFromHoliday);
  if (v.marking) showMarking(v.marking);
  handOutEventGifts();
  queueReconcile();
  queueShowcase();
  void checkInbox();
  render();
}

/** Put what she found in the journal, once per kind. */
function recordFinds(events: PetEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'found') continue;
    const c = COLLECTIBLES.find((x) => x.id === e.item);
    if (c) note(`Found ${article(c.name)} for the shelf${c.rarity === 'rare' ? '. A rare one!' : '.'}`, c.id, `find:${c.id}`);
  }
}
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`;
}

function tick(): void {
  if (!pet) return;
  const { state, events } = advance(pet, now(), tz);
  if (state.stepIndex !== pet.stepIndex) {
    pet = state;
    savePet();
    for (const e of events) {
      if (e.kind === 'napDone') toast(`${pet.name} woke up from her nap.`);
      if (e.kind === 'treatBaked') toast('Your treat is ready.');
      if (e.kind === 'found') {
        const c = COLLECTIBLES.find((x) => x.id === e.item);
        if (c) { play('find'); toast(`${pet.name} found ${article(c.name)}! +${2} clover`); }
      }
    }
    recordFinds(events);
  }
  render();
}

let lastFrame = 0;
function frame(t: number): void {
  requestAnimationFrame(frame);
  if (!scene || t - lastFrame < 66) return; // ~15 fps is plenty for pixel art
  lastFrame = t;
  const n = now();
  const w = today(n);
  scene.draw({
    coat: pet.coat,
    night: isNight(n, tz),
    mood: mood(pet, n, tz),
    burrow,
    decorating,
    selected: decorating ? selectedUid : null,
    dress: dressOf(pet),
    season: w.season,
    weather: w.weather,
    absent: away(),
  }, t);
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
  await syncClock(OR).catch(() => undefined);
  const [remote, remoteBurrow, remoteJournal] = await Promise.all([loadPet(OR), loadBurrow(OR), loadJournal(OR)]);
  if (remote && remote.petId === pet.petId && remote.rev > pet.rev) pet = remote;
  if (remoteBurrow && remoteBurrow.rev > burrow.rev) burrow = remoteBurrow;
  if (remoteJournal && remoteJournal.rev > journal.rev) journal = remoteJournal;
  catchUp(summary);
}

// ------------------------------------------------------------------ rendering the UI

const MOOD_LINE: Record<Mood, (name: string) => string> = {
  content: (n) => `${n} is content.`,
  peckish: (n) => `${n} is peckish. A carrot would help.`,
  lonely: (n) => `${n} wants some attention.`,
  sleepy: (n) => `${n} is getting sleepy. Maybe a nap?`,
  dusty: (n) => `${n} is a bit dusty.`,
  grumpy: (n) => `${n} is grumpy. A little care and she'll perk up.`,
  asleep: (n) => `${n} is asleep.`,
};

function render(): void {
  if (!ui || !pet) return;
  const n = now();
  const m = mood(pet, n, tz);
  const night = isNight(n, tz);
  const asleep = isAsleep(pet, n, tz);
  const bl = bondLevel(pet.bond);
  const w = today(n);
  ui.name.textContent = pet.name;
  ui.sub.textContent = `${pet.daysVisited} ${pet.daysVisited === 1 ? 'day' : 'days'} · Bond ${bl.level} · ${WEATHER_NAME[w.weather]}`;
  ui.sub.title = `${pet.daysVisited} days together, bond level ${bl.level}. Today: ${WEATHER_NAME[w.weather].toLowerCase()} ${w.season}.`;
  ui.clover.textContent = String(pet.clover);
  for (const k of ['hunger', 'happy', 'energy', 'clean'] as const) {
    const v = Math.round(pet.needs[k]);
    ui.needs[k].fill.style.width = `${v}%`;
    ui.needs[k].wrap.setAttribute('aria-valuenow', String(v));
    ui.needs[k].wrap.classList.toggle('low', v < 30);
  }

  const nap = timer(pet, 'nap');
  let line = MOOD_LINE[m](pet.name);
  if (m === 'asleep') line = nap && !night ? `${pet.name} is napping. Up in ${fmtDuration(nap.endsAtMs - n)}.` : `${pet.name} is asleep. She wakes at ${WAKE_HOUR}:00.`;
  const holiday = away();
  if (holiday) line = `${pet.name} is on holiday until ${fmtDate(pet.vacationUntilMs!)}. Her needs are paused.`;
  if (!decorating) ui.moodline.textContent = line;

  ui.acts.feed.disabled = asleep || holiday;
  ui.acts.clean.disabled = asleep || holiday;
  ui.acts.pet.disabled = holiday;
  const isNapping = napping();
  ui.acts.nap.disabled = holiday || night || (asleep && !isNapping);
  const napLabel = ui.acts.nap.querySelector('span');
  if (napLabel) napLabel.textContent = isNapping ? 'Wake' : 'Nap';
  const petLabel = ui.acts.pet.querySelector('span');
  if (petLabel) petLabel.textContent = asleep ? 'Pet gently' : 'Pet';
  ui.feedBadge.hidden = pet.treats === 0;
  ui.feedBadge.textContent = String(pet.treats);
  ui.feedBadge.setAttribute('aria-label', `${pet.treats} treats`);
  const bake = timer(pet, 'bake');
  ui.bake.disabled = !!bake || holiday;
  const bakeLabel = ui.bake.querySelector('span');
  if (bakeLabel) bakeLabel.textContent = bake ? 'Baking' : 'Bake';
  const left = playsLeft(pet, n, tz);
  ui.play.disabled = holiday || asleep || left === 0;
  ui.play.title = left ? `Carrot catch: ${left} ${left === 1 ? 'play' : 'plays'} left today` : 'No plays left today. Back tomorrow.';
  setToolBadge(ui.play, left && !holiday && !asleep ? String(left) : '');
  const ripe = plots(pet).filter((p) => p && p.readyAtMs <= n).length;
  setToolBadge(ui.garden, ripe ? String(ripe) : '');
  ui.garden.disabled = holiday;
  ui.gift.hidden = decorating || holiday || !giftReady(pet, n, tz);
  const soundOn = settings.sound !== false;
  if (ui.sound.dataset.on !== String(soundOn)) {
    ui.sound.dataset.on = String(soundOn);
    ui.sound.innerHTML = soundOn ? SPEAKER_ON : SPEAKER_OFF;
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    ui.sound.title = soundOn ? 'Sound on' : 'Sound off';
  }

  // timer chips
  const chips: Node[] = [];
  if (nap && !night) chips.push(h('div', { class: 'tchip' }, img(itemSprite('moon'), 2), 'Nap', h('span', { class: 'time', text: fmtCountdown(nap.endsAtMs - n) })));
  if (bake) chips.push(h('div', { class: 'tchip' }, img(itemSprite('treat'), 2), 'Baking', h('span', { class: 'time', text: fmtCountdown(bake.endsAtMs - n) })));
  else if (pet.treats > 0) chips.push(h('div', { class: 'tchip ready' }, img(itemSprite('treat'), 2), `${pet.treats} ${pet.treats === 1 ? 'treat' : 'treats'} ready`));
  if (decorating) return;
  // Timers tick every second; event chips are buttons, rebuilt only when the
  // events change so a tap isn't lost to a rebuild.
  let timersBox = ui.chips.querySelector<HTMLElement>('.chips-timers');
  let eventsBox = ui.chips.querySelector<HTMLElement>('.chips-events');
  if (!timersBox || !eventsBox) {
    timersBox = h('div', { class: 'chips-timers' });
    eventsBox = h('div', { class: 'chips-events' });
    ui.chips.replaceChildren(timersBox, eventsBox);
  }
  timersBox.replaceChildren(...chips);
  const events = holiday ? [] : activeEvents(n, tz);
  const sig = events.map((e) => e.id).join('|');
  if (eventsBox.dataset.sig !== sig) {
    eventsBox.dataset.sig = sig;
    eventsBox.replaceChildren(...events.map((e) => {
      const chip = h('button', { class: 'tchip event', type: 'button', 'aria-label': `${e.name}. ${e.blurb}` }, img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 1), e.name);
      chip.addEventListener('click', () => openEvent(e.id));
      return chip;
    }));
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

/** A daytime nap in progress (night sleep is not a nap and can't be ended). */
function napping(): boolean {
  const n = now();
  const nap = timer(pet, 'nap');
  return !!nap && nap.endsAtMs > n && !isNight(n, tz);
}

const REFUSAL: Record<string, string> = {
  full: "She's full.",
  clean: "She's already clean.",
  asleep: "Shh, she's asleep.",
  notTired: "She isn't tired yet.",
  notNapping: "She isn't napping.",
  noTreats: 'No treats in the pantry. Bake one first.',
  broke: 'Not enough clover for that.',
  busy: 'Something is already baking.',
  night: "It's bedtime. She'll sleep until morning.",
  claimed: "You've opened today's gift.",
};

function doAction(a: Action, opts: { food?: FoodId } = {}): void {
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
  if (a !== 'gift' && a !== 'nap' && a !== 'wake' && a !== 'bake') play(a);
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
    case 'clean':
      scene?.react('clean', t);
      haptic('light');
      break;
    case 'nap':
      play('nap');
      toast(`${pet.name} curls up for a nap. Back in 2 hours.`);
      void maybeAskReminders('nap');
      break;
    case 'wake':
      play('wake');
      toast(`${pet.name} stretches and wakes up.`);
      break;
    case 'bake':
      play('place');
      toast('Treat in the oven. Ready in an hour.');
      void maybeAskReminders('bake');
      break;
    case 'gift':
      play('gift');
      window.setTimeout(() => play('clover'), 380);
      scene?.burst('clover', 5, t, { x: 80, y: 14 });
      toast(`+${r.clover} clover. ${pet.gift.streak}-day streak.`);
      haptic('success');
      break;
  }
  queueReconcile();
  render();
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
      class: 'act food-act', type: 'button', disabled: !available,
      'aria-label': `${info.name}. ${info.blurb.replace(/·/g, ',')}. ${paysClover ? '3 clover' : cost}.`,
    },
    img(s, Math.max(1, Math.floor(30 / Math.max(s.w, s.h)))),
    h('span', { class: 'nm', text: info.short }),
    h('span', { class: 'cost' }, paysClover ? img(itemSprite('clover'), 1) : null, cost));
    b.addEventListener('click', () => { closeFoodTray(); doAction('feed', { food: id }); });
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

function showAway(gap: number, events: PetEvent[], newDay: boolean, backFromHoliday = false): void {
  const items: [ItemArt, string][] = [];
  const count = (k: PetEvent['kind']) => events.filter((e) => e.kind === k).length;
  if (backFromHoliday) items.push(['suitcase', `Home from her holiday, rested and happy to see you.`]);
  if (count('fellAsleep') && count('wokeUp')) items.push(['moon', 'Slept through the night.']);
  if (count('napDone')) items.push(['moon', 'Napped and woke up rested.']);
  if (count('treatBaked')) items.push(['treat', 'A treat finished baking. It\'s in the pantry.']);
  // each thing she found, by name, for the shelf
  const found = new Map<string, number>();
  for (const e of events) if (e.kind === 'found') found.set(e.item, (found.get(e.item) ?? 0) + 1);
  for (const [id, k] of found) {
    const c = COLLECTIBLES.find((x) => x.id === id);
    if (!c) continue;
    const what = k === 1 ? article(c.name) : `${k} × ${c.name.toLowerCase()}`;
    items.push([id, `Found ${what}${c.rarity === 'rare' ? ', a rare one' : ''}. +${k * 2} clover.`]);
  }
  const ripe = plots(pet).filter((p) => p && p.readyAtMs <= now()).length;
  if (ripe) items.push(['sprout', `${ripe === 1 ? 'Something is' : `${ripe} plots are`} ready in the garden.`]);
  const m = mood(pet, now(), tz);
  if (m !== 'content' && m !== 'asleep') items.push([m === 'peckish' ? 'carrot' : m === 'lonely' ? 'heart' : m === 'dusty' ? 'droplet' : 'moon', MOOD_LINE[m](pet.name)]);
  if (newDay) items.push(['heart', `Day ${pet.daysVisited} together.`]);
  if (!items.length) items.push(['heart', `${pet.name} pottered about the burrow.`]);

  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'While you were away' }),
    h('h2', { text: fmtLong(gap) }),
    h('ul', {}, ...items.map(([art, text]) =>
      h('li', {}, h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 30))), h('span', { text })))),
    h('div', { class: 'actions-col' }, button(`Say hi to ${pet.name}`, 'btn primary', close)),
  ]);
}

// ------------------------------------------------------------------ sheets

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button', text: label });
  b.addEventListener('click', onClick);
  return b;
}

function openSheet(build: (close: () => void) => Node[]): void {
  const prevFocus = document.activeElement as HTMLElement | null;
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  sheet.append(...build(close));
  const title = sheet.querySelector('h2');
  if (title) { title.id = 'sheet-title'; sheet.setAttribute('aria-labelledby', 'sheet-title'); }
  scrim.append(sheet);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(scrim);
  (sheet.querySelector('button') as HTMLButtonElement | null)?.focus();
}

// ------------------------------------------------------------------ reminders

async function maybeAskReminders(kind: 'nap' | 'bake'): Promise<void> {
  if (!OR.capabilities.has('notifications.schedule') || settings.reminders !== null) return;
  const status = await OR.notifications.status();
  const pushOff = status !== null && !status.push;
  const what = kind === 'nap' ? "when her nap's over" : 'when the treat is ready';
  openSheet((close) => [
    h('h2', { text: `Want a nudge ${what}?` }),
    h('p', { text: pushOff
      ? "Your phone notifications are off for games, so we'll leave a note in your notifications instead."
      : `We'll let you know ${kind === 'nap' ? 'in about 2 hours' : 'in about an hour'}.` }),
    h('div', { class: 'actions-col' },
      button('Yes, nudge me', 'btn primary', () => { settings.reminders = 'on'; saveSettings(); queueReconcile(); render(); close(); }),
      button('Not now', 'btn', () => { settings.reminders = 'off'; saveSettings(); render(); close(); })),
    h('p', { class: 'note', text: 'You can turn reminders on or off any time under More.' }),
  ]);
}

let reconcileTimer = 0;
let reconciling = false;
function queueReconcile(): void {
  if (!OR.capabilities.has('notifications.schedule') || !OR.user) return;
  window.clearTimeout(reconcileTimer);
  reconcileTimer = window.setTimeout(async () => {
    if (reconciling || settings.reminders === null) return;
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
    }
  }, 1500);
}

// ------------------------------------------------------------------ decorating

function enterDecorate(): void {
  decorating = true;
  selectedUid = null;
  ui.canvas.tabIndex = 0;
  ui.canvas.setAttribute('aria-label', 'The burrow. Drag decor to move it; with a piece selected, arrow keys nudge it.');
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
    const hit = scene.hitTest(burrow, p.x, p.y);
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
    const item = decorating ? selected() : undefined;
    if (!item) return;
    const step = e.shiftKey ? 4 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = d[e.key];
    if (mv) { e.preventDefault(); moveItem(item, item.x + mv[0], item.y + mv[1]); saveBurrow(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); putAway(item); }
    else if (e.key === 'Escape') { selectedUid = null; renderDecoratePanel(); }
  });
}

/** Put a piece down at its zone's usual spot, nudged so it doesn't land exactly on another. */
function placeNew(item: PlacedItem): void {
  const def = byId(item.id);
  if (!def) return;
  const z = ZONES[def.zone];
  const others = burrow.items.filter((i) => i.placed && i.id !== item.id).length;
  moveItem(item, z.x + ((others * 7) % 21) - 10, z.y);
  item.placed = true;
  selectedUid = item.uid;
}

function putAway(item: PlacedItem): void {
  item.placed = false;
  selectedUid = null;
  saveBurrow();
  toast('Put away. You can place it again for free.');
  renderDecoratePanel();
}

function renderDecoratePanel(): void {
  const bl = bondLevel(pet.bond).level;
  const tray = h('div', { class: 'tray', role: 'list' });
  const n = now();
  for (const def of CATALOG) {
    const s = itemSprite(def.art);
    const stored = burrow.items.filter((i) => i.id === def.id && !i.placed);
    // seasonal pieces are for sale during their event; once bought, they're yours
    if (def.limited && !stored.length && !limitedAvailable(def.id, n, tz)) continue;
    const locked = bl < def.bond;
    const price = locked
      ? h('span', { class: 'pr', text: `Bond ${def.bond}` })
      : stored.length
        ? h('span', { class: 'pr', text: `${stored.length} put away` })
        : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(def.price));
    const b = h('button', {
      class: 'titem', type: 'button', role: 'listitem',
      disabled: locked || (!stored.length && pet.clover < def.price),
      'aria-label': `${def.name}. ${locked ? `Unlocks at bond ${def.bond}.` : stored.length ? `${stored.length} put away. Place one.` : `Buy for ${def.price} clover.`}`,
    }, def.limited && !stored.length ? h('span', { class: 'tag', text: 'Limited' }) : null,
    h('span', { class: 'art' }, img(s, fitScale(s, 54))), h('span', { class: 'nm', text: def.name }), price);
    b.addEventListener('click', () => {
      const first = stored[0];
      if (first) {
        placeNew(first);
      } else {
        const paid = spendClover(pet, def.price);
        if (!paid) { play('nope'); toast('Not enough clover yet.'); return; }
        pet = paid;
        savePet();
        const item: PlacedItem = { uid: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, id: def.id, x: 0, y: 0, flip: false, placed: false };
        burrow.items.push(item);
        placeNew(item);
        toast(`${def.name} placed. Drag it where you like.`);
        play('clover');
      }
      saveBurrow();
      haptic('light');
      play('place');
      renderDecoratePanel();
      render();
    });
    tray.append(b);
  }
  const sel = selected();
  const def = sel ? byId(sel.id) : undefined;
  const where = def?.zone === 'hang' ? 'anywhere on the wall' : 'anywhere on the floor';
  ui.moodline.textContent = sel && def
    ? `Drag the ${def.name.toLowerCase()} ${where}.`
    : 'Drag decor to move it, or pick something new below.';
  const done = button('Done', 'btn primary', exitDecorate);
  const flip = sel ? button('Flip', 'btn', () => { sel.flip = !sel.flip; saveBurrow(); play('flip'); }) : null;
  const away = sel ? button('Put away', 'btn', () => putAway(sel)) : null;
  ui.panel.replaceChildren(ui.moodline, tray, h('div', { class: 'row2' }, done, flip, away));
  ui.chips.replaceChildren();
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

function openGarden(): void {
  let picking: number | null = null;
  openLiveSheet((close, redraw) => {
    const n = now();
    const ps = plots(pet);
    const cards = ps.map((p, i) => {
      let status: string, action: HTMLButtonElement;
      if (!p) {
        status = 'Empty';
        action = button(picking === i ? 'Choosing…' : 'Plant', picking === i ? 'btn primary' : 'btn', () => { picking = picking === i ? null : i; redraw(); });
        action.setAttribute('aria-expanded', String(picking === i));
      } else if (p.readyAtMs > n) {
        status = `${CROPS[p.crop].name}: ready in ${fmtDuration(p.readyAtMs - n)}`;
        action = button('Growing', 'btn', () => undefined);
        action.disabled = true;
      } else {
        status = `${CROPS[p.crop].name}: ready!`;
        action = button('Pick', 'btn primary', () => {
          const r = harvest(pet, i, now());
          if (!r.ok) return;
          pet = r.state;
          savePet();
          play('harvest');
          haptic('success');
          const got = r.crop === 'sprout' ? '+6 clover.' : r.crop === 'berry' ? 'Two strawberries, in the food tray.' : 'A golden carrot, in the food tray. She always loves these.';
          toast(`Picked! ${got}`);
          note(`First ${CROPS[r.crop].name.toLowerCase()} from the garden.`, CROP_ART[r.crop], `harvest:${r.crop}`);
          queueReconcile();
          redraw();
        });
      }
      const st = p ? cropStage(p, n) : 0;
      return h('div', { class: 'plot' + (picking === i ? ' picking' : '') },
        h('div', { class: 'plot-art' }, img(plotSprite(p?.crop ?? null, p ? st : 0), 3, p ? `${CROPS[p.crop].name}, ${st === 3 ? 'ready' : 'growing'}` : 'An empty plot')),
        h('div', { class: 'plot-status', text: status }),
        action);
    });

    const seeds = picking === null ? null : h('div', { class: 'seeds', role: 'group', 'aria-label': `Plant in plot ${picking + 1}` },
      ...(Object.keys(CROPS) as CropId[]).map((c) => {
        const info = CROPS[c];
        const s = itemSprite(CROP_ART[c]);
        const b = h('button', {
          class: 'seed', type: 'button', disabled: pet.clover < info.seedCost,
          'aria-label': `${info.name}. ${info.seedCost} clover. Ready in ${fmtDuration(info.growMs)}. Gives ${info.yields}.`,
        },
        img(s, fitScale(s, 26)),
        h('span', { class: 'nm', text: info.name }),
        h('span', { class: 'meta', text: `${fmtDuration(info.growMs)} · ${info.yields}` }),
        h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(info.seedCost)));
        b.addEventListener('click', () => {
          const r = plant(pet, picking!, c, now());
          if (!r.ok) { play('nope'); toast(r.reason === 'broke' ? 'Not enough clover for those seeds.' : 'That plot is busy.'); return; }
          pet = r.state;
          savePet();
          play('place');
          toast(`Planted. Ready in ${fmtDuration(info.growMs)}.`);
          picking = null;
          queueReconcile();
          redraw();
        });
        return b;
      }));

    const berries = pet.pantry?.berries ?? 0, golden = pet.pantry?.golden ?? 0;
    const pantry = berries || golden
      ? `In the pantry: ${[berries ? `${berries} ${berries === 1 ? 'strawberry' : 'strawberries'}` : '', golden ? `${golden} golden ${golden === 1 ? 'carrot' : 'carrots'}` : ''].filter(Boolean).join(' and ')}.`
      : 'Grow strawberries and golden carrots for her, or clover sprouts to sell.';
    return [
      h('div', { class: 'eyebrow', text: 'The garden' }),
      h('h2', { text: `${pet.name}'s garden` }),
      h('div', { class: 'plots' }, ...cards),
      seeds,
      h('p', { class: 'note', text: pantry }),
      h('div', { class: 'actions-col' }, button('Done', 'btn primary', close)),
    ].filter((x): x is HTMLDivElement => !!x);
  });
}

// ------------------------------------------------------------------ play

async function startPlay(): Promise<void> {
  const n = now();
  if (playsLeft(pet, n, tz) <= 0) { play('nope'); toast("That's all the plays for today. Back tomorrow."); return; }
  if (isAsleep(pet, n, tz)) { play('nope'); toast("Shh, she's asleep."); return; }
  const d = dressOf(pet);
  const caught = await playCatch(document.body, {
    rabbit: rabbitSprite(pet.coat, 'content', 0, d),
    happy: rabbitSprite(pet.coat, 'happy', 0, d),
    carrot: itemSprite('carrot'),
    golden: itemSprite('golden'),
  }, pet.name, (s) => play(s === 'catch' ? 'catch' : 'gift'));
  ui.play.focus();
  if (caught === null) return; // stopping early doesn't use up a play
  const r = recordPlay(pet, caught, now(), tz);
  if (!r.ok) { toast("That's all the plays for today."); return; }
  pet = r.state;
  savePet();
  window.setTimeout(() => play('clover'), 300);
  scene?.react('happy', performance.now());
  const left = playsLeft(pet, now(), tz);
  toast(`${caught} caught! +${r.clover} clover.${left ? ` ${left} ${left === 1 ? 'play' : 'plays'} left today.` : ''}`);
  note(`Played carrot catch together. ${caught} caught.`, 'basket', 'play:first');
  render();
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
        h('div', { class: 'pills' },
          pill(info.name),
          pet.marking ? pill(MARKING_INFO[pet.marking].name) : pill(`Marking on day 7`, 'soft')),
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
      row('Collection', `${found} of ${COLLECTIBLES.length} found`, 'marble', () => { close(); openCollection(); }),
      row('Journal', journal.entries.length ? `${journal.entries.length} ${journal.entries.length === 1 ? 'entry' : 'entries'}` : 'Your story together', 'book', () => { close(); openJournal(); }),
      row(away() ? 'On holiday' : 'Going away?', away() ? `Until ${fmtDate(pet.vacationUntilMs!)}` : 'Pause her needs for a trip', 'suitcase', () => { close(); openVacation(); }),
      row('Share', `Tell a friend about ${pet.name}`, 'heart', () => { close(); void shareCard(); }),
    ];
    if (OR.user && OR.capabilities.has('showcase.friends')) {
      rows.splice(3, 0, row('Friends', 'Visit their burrows, send a gift', 'gift', () => { close(); openFriends(); }));
    }
    if (OR.capabilities.has('notifications.schedule')) {
      const on = settings.reminders === 'on';
      const r = row(`Reminders: ${on ? 'on' : 'off'}`, on ? 'Nudges for naps, treats, the garden and gifts' : 'Off. Tap to turn on.', 'moon', () => {
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
    return [profile, h('div', { class: 'menu' }, ...rows), h('div', { class: 'actions-col' }, button('Close', 'btn', close))];
  });
}

// ------------------------------------------------------------------ wardrobe

function openWardrobe(): void {
  openLiveSheet((close, redraw) => {
    const n = now();
    const w = wardrobe(pet);
    const section = (slot: Slot, title: string) => {
      const items = OUTFITS.filter((o) => o.slot === slot && (w.owned.includes(o.id) || !o.limited || limitedAvailable(o.id, n, tz)));
      const none = h('button', { class: 'wear', type: 'button', 'aria-pressed': String(!w[slot]) },
        h('span', { class: 'art' }, img(rabbitSprite(pet.coat, 'content', 0, { ...dressOf(pet), [slot]: null }), 2)),
        h('span', { class: 'nm', text: 'Nothing' }), h('span', { class: 'pr', text: ' ' }));
      none.addEventListener('click', () => { pet = wear(pet, slot, null); savePet(); play('flip'); redraw(); });
      const buttons = items.map((o) => {
        const owned = w.owned.includes(o.id);
        const on = w[slot] === o.id;
        const b = h('button', {
          class: 'wear', type: 'button', 'aria-pressed': String(on), disabled: !owned && pet.clover < o.price,
          'aria-label': `${o.name}. ${owned ? (on ? 'Wearing.' : 'Owned. Put it on.') : `Buy for ${o.price} clover.`}`,
        },
        o.limited && !owned ? h('span', { class: 'tag', text: 'Limited' }) : null,
        h('span', { class: 'art' }, img(rabbitSprite(pet.coat, 'content', 0, { ...dressOf(pet), [slot]: o.id }), 2)),
        h('span', { class: 'nm', text: o.name }),
        owned ? h('span', { class: 'pr', text: on ? 'Wearing' : 'Owned' }) : h('span', { class: 'pr' }, img(itemSprite('clover'), 1), String(o.price)));
        b.addEventListener('click', () => {
          if (owned) {
            pet = wear(pet, slot, on ? null : o.id);
            savePet();
            play('flip');
          } else {
            const r = buyOutfit(pet, o.id);
            if (!r.ok) { play('nope'); toast('Not enough clover yet.'); return; }
            pet = r.state;
            savePet();
            play('clover');
            haptic('success');
            toast(`${pet.name} tries on the ${o.name.toLowerCase()}.`);
            note(`Got ${article(o.name)}.`, 'gift', `outfit:${o.id}`);
          }
          redraw();
        });
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
  const found = COLLECTIBLES.filter((c) => (have[c.id] ?? 0) > 0).length;
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: 'Her shelf' }),
    h('h2', { text: `${found} of ${COLLECTIBLES.length} found` }),
    h('ul', { class: 'shelf' }, ...COLLECTIBLES.map((c) => {
      const k = have[c.id] ?? 0;
      const s = itemSprite(c.id);
      return h('li', { class: k ? 'found' : 'missing' },
        h('span', { class: 'art' }, img(s, fitScale(s, 36), k ? c.name : 'Not found yet')),
        h('span', { class: 'nm', text: k ? c.name : '???' }),
        k > 1 ? h('span', { class: 'ct', text: `×${k}` }) : null,
        c.rarity === 'rare' ? h('span', { class: 'tag', text: 'Rare' }) : null);
    })),
    h('p', { class: 'note', text: `${pet.name} finds things while you're away. Each is worth 2 clover, and goes on her shelf.` }),
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

// ------------------------------------------------------------------ seasonal events and her marking

const EVENT_ART: Record<string, ItemArt> = { harvest: 'pumpkin', spooky: 'jackolantern', winterfest: 'snowglobe', bloom: 'flower' };

function openEvent(id: string): void {
  const e = activeEvents(now(), tz).find((x) => x.id === id);
  if (!e) return;
  const fmtMD = ([m, d]: [number, number]) => new Date(2000, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  openSheet((close) => [
    h('div', { class: 'event-art' }, img(itemSprite(EVENT_ART[e.id] ?? 'sparkle'), 4)),
    h('div', { class: 'eyebrow', text: `${fmtMD(e.from)} – ${fmtMD(e.to)}` }),
    h('h2', { text: e.name }),
    h('p', { text: e.blurb }),
    h('div', { class: 'actions-col' },
      e.decor.length ? button('See the decor', 'btn primary', () => { close(); enterDecorate(); }) : null,
      e.outfits.length || e.gift ? button('Open the wardrobe', e.decor.length ? 'btn' : 'btn primary', () => { close(); openWardrobe(); }) : null,
      button('Close', 'btn', close)),
  ]);
}

/** Free event outfits, once per event. */
function handOutEventGifts(): void {
  for (const e of activeEvents(now(), tz)) {
    if (!e.gift || (pet.eventGifts ?? []).includes(e.id)) continue;
    const o = outfitById(e.gift);
    if (!o) continue;
    pet = giveOutfit(pet, e.gift);
    pet.eventGifts = [...(pet.eventGifts ?? []), e.id];
    savePet();
    note(`A ${e.name} gift: ${article(o.name)}.`, 'gift', `event:${e.id}`);
    openSheet((close) => [
      h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, 'happy', 0, dressOf(pet)), 4, `${pet.name} in her ${o.name.toLowerCase()}`)),
      h('div', { class: 'eyebrow', text: e.name }),
      h('h2', { text: `A gift: ${article(o.name)}` }),
      h('p', { text: `${pet.name} is already wearing it. You can change outfits any time in the wardrobe.` }),
      h('div', { class: 'actions-col' }, button('Lovely', 'btn primary', close)),
    ]);
  }
}

function showMarking(m: NonNullable<PetState['marking']>): void {
  const info = MARKING_INFO[m];
  note(`${pet.name} grew ${info.name.toLowerCase()}, ${info.why}.`, 'sparkle', 'marking');
  openSheet((close) => [
    h('div', { class: 'wear-preview' }, img(rabbitSprite(pet.coat, 'happy', 0, dressOf(pet)), 4, `${pet.name} with her new marking`)),
    h('div', { class: 'eyebrow', text: `Day ${pet.daysVisited}` }),
    h('h2', { text: `${pet.name} has ${info.name.toLowerCase()}` }),
    h('p', { text: `It came ${info.why}. It's hers for life, and no one else's rabbit will have quite the same story.` }),
    h('div', { class: 'actions-col' }, button('Aww', 'btn primary', close)),
  ]);
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
  if (!gifts.length || document.querySelector('.scrim.inbox')) return;
  openSheet((close) => {
    const open = button(gifts.length === 1 ? 'Open it' : `Open all ${gifts.length}`, 'btn primary', async () => {
      open.disabled = true;
      let opened = 0;
      for (const g of gifts) {
        try {
          await OR.gifts.claim(g.giftUuid);
        } catch (e) {
          // claimed on another device, or expired: nothing to pay out
          if (errCode(e) !== 'gifts/claimed' && errCode(e) !== 'gifts/not-found') toast("Couldn't open that one. Try again later.");
          continue;
        }
        pet = applyGift(pet, g.kind);
        opened++;
        note(`A gift from ${g.from.username}.`, (GIFT_INFO[g.kind as GiftKind]?.art ?? 'gift') as ItemArt, `giftfrom:${g.from.uuid}`);
      }
      if (opened) { savePet(); play('gift'); haptic('success'); toast(opened === 1 ? 'Gift opened.' : `${opened} gifts opened.`); }
      render();
      close();
    });
    return [
      h('div', { class: 'event-art' }, img(itemSprite('gift'), 4)),
      h('div', { class: 'eyebrow', text: 'From your friends' }),
      h('h2', { text: gifts.length === 1 ? `${gifts[0]!.from.username} sent you a gift` : `${gifts.length} gifts from friends` }),
      h('ul', {}, ...gifts.map((g) => {
        const info = GIFT_INFO[g.kind as GiftKind];
        const art = (info?.art ?? 'gift') as ItemArt;
        return h('li', {}, h('span', { class: 'ico' }, img(itemSprite(art), fitScale(itemSprite(art), 26))),
          h('span', { class: 'txt' }, h('span', { class: 'nm', text: info ? info.name : 'A surprise' }), h('span', { class: 'meta', text: `From ${g.from.username}${info ? ` · ${info.gives}` : ''}` })));
      })),
      h('div', { class: 'actions-col' }, open, button('Later', 'btn', close)),
    ];
  });
  document.querySelector('.scrim:last-of-type')?.classList.add('inbox');
}

interface Friend { uuid: string; username: string; data: ShowcaseData }

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
          h('span', { class: 'ico big' }, img(rabbitSprite(d.coat, 'content', 0, { head: d.head, neck: d.neck, marking: d.marking, ears: d.ears }), 1, d.name)),
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
  openSheet((close) => [
    h('div', { class: 'eyebrow', text: `For ${f.data.name}` }),
    h('h2', { text: `Send ${f.username} a gift` }),
    h('div', { class: 'gift-kinds' }, ...GIFT_KINDS.map((k) => {
      const info = GIFT_INFO[k];
      const s = itemSprite(info.art as ItemArt);
      const b = h('button', { class: 'seed', type: 'button' }, img(s, fitScale(s, 26)), h('span', { class: 'nm', text: info.name }), h('span', { class: 'meta', text: info.gives }));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await OR.gifts.send({ toUserUuid: f.uuid, kind: k });
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
        pet = { ...pet, clover: pet.clover + SEND_REWARD_CLOVER };
        savePet();
        play('gift');
        haptic('success');
        toast(`Sent to ${f.username}! +${SEND_REWARD_CLOVER} clover.`);
        note(`Sent ${f.username} a gift.`, 'gift', 'gift:first');
        render();
        done();
        close();
      });
      return b;
    })),
    h('div', { class: 'actions-col' }, button('Not now', 'btn', close)),
  ]);
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
  const wrap = h('div', { class: 'visit', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Visiting ${d.name}` },
    h('header', { class: 'visit-top' },
      h('div', { class: 'who' }, h('div', { class: 'name', text: `${d.name}'s burrow` }), h('div', { class: 'sub', text: `${f.username} · ${d.daysVisited} days · Bond ${d.bondLevel}` }))),
    stage,
    h('section', { class: 'panel' },
      h('p', { class: 'moodline', text: holiday ? `${d.name} is away on holiday.` : `${d.name} is ${TRAIT_INFO[d.trait].name.toLowerCase()}, and happy to have a visitor.` }),
      h('div', { class: 'row2' }, back, gift)));
  document.body.append(wrap);
  const sc = new Scene(canvas);
  const guestBurrow: BurrowState = { v: 2, rev: 0, items: d.items.map((it, i) => ({ uid: `g${i}`, id: it.id, x: it.x, y: it.y, flip: it.flip, placed: true })) };
  const fit = () => fitScene(stage, canvas, sc);
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
    const asleep = isNight(n, tz) || (!!d.napEndsAtMs && d.napEndsAtMs > n);
    sc.draw({ coat: d.coat, night: isNight(n, tz), mood: asleep ? 'asleep' : 'content', burrow: guestBurrow, decorating: false, selected: null,
      dress: { head: d.head, neck: d.neck, marking: d.marking, ears: d.ears }, season: w.season, weather: w.weather, guest: true, absent: holiday }, t);
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
  back.focus();
  function leave(): void {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    wrap.remove();
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
