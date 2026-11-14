// Rabbit Sudoku's shell: loads the day's puzzle, switches between home and
// the puzzle, sends the solve, runs the opt-in race (race.ts), and owns help,
// settings and the day rolling over.

import { ARCHIVE_PLAYED_KEY, archiveDate, archiveIntent, archiveKey, PAST_PAGE, pastDays, pastStatus, parseArchivePlayed, unsolvedPast, withArchivePlayed } from './archive';
import { friendsRows, hasBoard, isSolvedRow, showSolvers, solveScore, UNSOLVED_SCORE } from './board';
import { renderHome, TIER_NAME, type PlayState, type RaceHome, type Solvers } from './home';
import { renderPast } from './past';
import { mountPlay, type PlayScreen, type SavedPlay } from './play';
import { DAY_MS, EPOCH_MS, dailyTierFor, parseDay, puzzleIndexAt, roundKey, type DayContent } from './puzzle';
import { formatTime, isFinalRefusal, isRacing, parseRace, RACE_STARTED_SCORE, raceKey, raceScore, type RaceState } from './race';
import { DEFAULT_SETTINGS, parseSettings, resolveTheme, SETTING_LABELS, THEME_LABELS, type Settings, type ThemeChoice, type Toggle } from './settings';
import { bestStreak, parseStats, streakOf, withDailySolved, type Stats } from './stats';
import { formatGrid, parseGrid } from './sudoku';
import { button, el, openSheet, OR, readJson, readJsonForMerge, serverNow, setVibration, SHARE_URL, syncClock, writeJson } from './ui';

const app = document.getElementById('app')!;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DailySave extends SavedPlay {
  index: number;
  /** The solve hasn't reached the server yet. */
  pending: boolean;
  /** The day's row is on the server: the "not solved yet" one, or the solve. */
  started?: boolean;
  /** Today's race, when the day was raced (race.ts). */
  race?: RaceState;
}

let index = 0;
let day: DayContent | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let stats: Stats = { solvedDays: [] };
let playing: PlayScreen | null = null;
/** Today's race as the play screen last knew it; every daily save carries it. */
let dailyRace: RaceState | null = null;
let stopHome = (): void => undefined;
/** On the Past puzzles list: the day rolling over waits until the player leaves it. */
let onPast = false;
/** How many past days the list shows; kept while the player dips into one and back. */
let pastShown = PAST_PAGE;
/**
 * Bumped by every screen change. A past day loads over the network, so one
 * that lands after the player has moved on (or tapped again) is dropped.
 */
let navTicket = 0;

// ---------- colours ----------

/** This device's last theme, so a return visit doesn't open on the wrong colours. */
const THEME_CACHE = 'rabbit-sudoku:theme';

function applyTheme(choice: ThemeChoice): void {
  const theme = resolveTheme(choice, OR()?.colorScheme);
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_CACHE, theme);
  } catch {
    /* private window: the colours just come a moment later next time */
  }
}

try {
  const cached = localStorage.getItem(THEME_CACHE);
  if (cached === 'light' || cached === 'paper' || cached === 'dark') document.documentElement.dataset.theme = cached;
} catch {
  /* no storage: light until the settings load */
}

const stateOf = (s: SavedPlay | null): PlayState => (!s ? 'new' : s.solved ? 'solved' : 'progress');

async function loadDay(n: number): Promise<DayContent | null> {
  const cached = await readJson<{ index?: number; content?: unknown } | null>('day', null);
  if (cached?.index === n) {
    const parsed = parseDay(cached.content);
    if (parsed) return parsed;
  }
  const daily = await OR().content.daily({ roundKey: roundKey(n) });
  const parsed = parseDay(daily?.content);
  if (parsed) writeJson('day', { index: n, content: parsed });
  return parsed;
}

// ---------- the solve's row on the server ----------

/**
 * The solve still to send. One flag for the whole game, so a save from the
 * play screen can't set it again after the send cleared it.
 */
let pending = false;
let sending = false;

// Both rows go with `keepBest`: the server keeps the higher score, so the
// solve always replaces the "not solved yet" row whichever lands first, and a
// resend is a no-op rather than a 409.

async function sendSolve(): Promise<void> {
  const saved = await readJson<DailySave | null>('daily', null);
  if (saved?.pending) pending = true;
  if (sending || !pending || !saved || !OR().user || !OR().capabilities.has('scores.submit')) return;
  sending = true;
  const done = (): void => {
    pending = false;
    writeJson('daily', { ...saved, pending: false, started: true });
  };
  try {
    await OR().scores.submit({
      roundKey: roundKey(saved.index),
      score: solveScore(saved.hints),
      metadata: { solved: true, hints: saved.hints },
      keepBest: true,
    });
    done();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'scores/already-submitted') done();
    // Anything else: try again on resume, back online, or the next open.
  } finally {
    sending = false;
  }
}

/**
 * The day's "not solved yet" row, sent on the first digit, note or hint, so
 * the board shows who's had a go. Signed in only, as with the solve. Tried
 * again on the next move until it lands.
 */
let started = false;
let starting = false;

async function sendStart(n: number, s: SavedPlay): Promise<void> {
  if (started || starting || s.solved || !OR().user || !OR().capabilities.has('scores.submit')) return;
  starting = true;
  try {
    await OR().scores.submit({ roundKey: roundKey(n), score: UNSOLVED_SCORE, metadata: { solved: false, hints: s.hints }, keepBest: true });
    started = true;
    const saved = await readJson<DailySave | null>('daily', null);
    if (saved?.index === n) writeJson('daily', { ...saved, started: true });
  } catch {
    // Offline or a host hiccup: the next move tries again.
  } finally {
    starting = false;
  }
}

/** Whether the player has done anything to the puzzle: a digit, a note or a hint. */
const touched = (s: SavedPlay, givens: string): boolean => s.hints > 0 || s.values !== givens || s.notes.some((m) => m !== 0);

/**
 * Launch-day solves (Daily #1 and #2) went up as a score of 1 whatever their
 * hints, which now ranks as 99 of them. Raise this player's row to its real
 * score, once a session. `keepBest` only ever raises it, and asking the server
 * first means a solve made as a guest, which has no row, still never gets one.
 * Dead once Daily #2 closes to scores; remove it then.
 */
let upgradeTried = false;

async function upgradeLaunchRow(): Promise<void> {
  const caps = OR().capabilities;
  if (upgradeTried || !OR().user || !caps.has('scores.rank') || !caps.has('scores.submit')) return;
  const saved = await readJson<DailySave | null>('daily', null);
  if (!saved?.solved || saved.pending || saved.index > 1) return;
  upgradeTried = true;
  const key = roundKey(saved.index);
  const score = solveScore(saved.hints);
  try {
    const mine = await OR().scores.rank({ roundKey: key, order: 'top' });
    if (mine && mine.entry.score === 1 && score > 1) {
      await OR().scores.submit({ roundKey: key, score, metadata: { solved: true, hints: saved.hints }, keepBest: true });
    }
  } catch {
    // The day closed, or offline: launch day keeps its 1s.
  }
}

// ---------- the race ----------

/** Racing needs a signed-in player and score rows: the server times it. */
const canRace = (): boolean => OR().user !== null && OR().capabilities.has('scores.submit');

/** How home shows today's race, from today's save (null when there's none yet). */
function raceHomeFor(today: DailySave | null): RaceHome | null {
  const r = parseRace(today?.race);
  if (r?.finishedSec !== undefined) return { kind: 'done', seconds: r.finishedSec, counted: !r.refused };
  if (isRacing(r) && !today?.solved) return { kind: 'running', startedAt: r.startedAt, now: serverNow };
  // Any save at all means the grid has been seen, so the race is off for today.
  if (today || !canRace()) return null;
  return { kind: 'open' };
}

/** The rules, then the start. */
function offerRace(): void {
  const body = el('div', 'help');
  body.append(
    el('p', '', "The clock starts when the grid appears and runs on real time. It doesn't stop if you leave the app."),
    el('p', '', 'No hints and no mistake check. Repeated digits are still flagged.'),
    el('p', '', 'You can leave the race at any time and finish calmly, with hints. Your streak counts either way.')
  );
  const actions = el('div', 'sheet-actions');
  let close = (): void => undefined;
  actions.append(
    button('subtle', 'Not now', () => close()),
    button('primary', 'Start the clock', () => {
      close();
      void startRace();
    })
  );
  body.appendChild(actions);
  close = openSheet("Race today's puzzle", body);
}

let startingRace = false;

/**
 * The start row first, then the grid: its server timestamp is the race's
 * start, so a race can't begin offline. The server refuses it once the day
 * has been played without racing.
 */
async function startRace(): Promise<void> {
  if (startingRace || !day || !canRace()) return;
  const n = index;
  const current = day;
  const saved = await readJson<DailySave | null>('daily', null);
  if (saved?.index === n) return showHome();
  startingRace = true;
  try {
    await OR().scores.submit({ roundKey: raceKey(n), score: RACE_STARTED_SCORE, metadata: { finished: false }, keepBest: true });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'scores/race-unavailable') {
      return showNotice('Racing is off today', "Today's puzzle was already played without the race, so it can't be raced. Tomorrow's can.");
    }
    return showNotice("The race didn't start", 'Starting a race needs a connection, so the server can time it. Check yours and try again.');
  } finally {
    startingRace = false;
  }
  const fresh: DailySave = {
    values: formatGrid(parseGrid(current.givens)!),
    notes: new Array<number>(81).fill(0),
    hints: 0,
    solved: false,
    index: n,
    pending: false,
    started: false,
    race: { startedAt: serverNow() },
  };
  writeJson('daily', fresh);
  await play();
}

/** Leaving keeps the board and drops into the calm game; the time won't count. */
function confirmLeave(): void {
  const body = el('div', 'help');
  body.appendChild(el('p', '', "Your time won't count. You keep your board and can finish calmly, with hints. Your streak still counts."));
  const actions = el('div', 'sheet-actions');
  let close = (): void => undefined;
  actions.append(
    button('subtle', 'Keep racing', () => close()),
    button('primary', 'Leave race', () => {
      close();
      if (dailyRace) dailyRace = { ...dailyRace, left: true };
      // dispose() saves the board, with the race marked left, before the calm game reopens it.
      playing?.dispose();
      playing = null;
      void play();
    })
  );
  body.appendChild(actions);
  close = openSheet('Leave the race?', body);
}

let sendingRace = false;

/**
 * The race's finish, until it lands. A refusal that will never change (too
 * fast, closed) is final: marked, and never resent.
 */
async function sendRaceFinish(): Promise<void> {
  const saved = await readJson<DailySave | null>('daily', null);
  const r = parseRace(saved?.race);
  if (sendingRace || !saved || !r?.pending || r.finishedSec === undefined || !canRace()) return;
  sendingRace = true;
  const settle = async (patch: Partial<RaceState>): Promise<void> => {
    const latest = await readJson<DailySave | null>('daily', null);
    if (latest?.index !== saved.index) return;
    const next: RaceState = { ...r, ...parseRace(latest.race), pending: false, ...patch };
    if (latest.index === index) dailyRace = next;
    writeJson('daily', { ...latest, race: next });
  };
  try {
    await OR().scores.submit({
      roundKey: raceKey(saved.index),
      score: raceScore(r.finishedSec),
      metadata: { finished: true, seconds: r.finishedSec },
      keepBest: true,
    });
    await settle({});
  } catch (error) {
    if (isFinalRefusal((error as { code?: string } | null)?.code)) await settle({ refused: true });
    // Anything else: try again on resume, back online, or the next open.
  } finally {
    sendingRace = false;
  }
}

// ---------- who solved it ----------

/** Friends who solved day `n`, and how many players did; null with neither verb. */
function loadSolvers(n: number, signedIn: boolean): Promise<Solvers> | null {
  const caps = OR().capabilities;
  const key = roundKey(n);
  const hasFriends = signedIn && caps.has('scores.friends');
  const hasTotal = caps.has('scores.distribution');
  if (!hasFriends && !hasTotal) return null;
  const friends = hasFriends
    ? OR()
        .scores.friends({ roundKey: key })
        .then((rows) => friendsRows(rows).filter((r) => !r.isSelf && isSolvedRow(r)).map((r) => r.username))
        .catch(() => [])
    : Promise.resolve(null);
  const total = hasTotal
    ? OR()
        .scores.distribution({ roundKey: key })
        .then((rows) => rows.filter(isSolvedRow).reduce((sum, r) => sum + r.count, 0))
        .catch(() => null)
    : Promise.resolve(null);
  return Promise.all([friends, total]).then(([f, t]) => ({ friends: f, total: t }));
}

// ---------- screens ----------

async function showHome(): Promise<void> {
  navTicket++;
  playing = null;
  onPast = false;
  stopHome();
  if (!day) return renderUnavailable();
  const signedIn = OR().user !== null;
  const [saved, archivePlayed] = await Promise.all([readJson<DailySave | null>('daily', null), readJson<unknown>(ARCHIVE_PLAYED_KEY, null)]);
  const today = saved?.index === index ? saved : null;
  const date = new Date(EPOCH_MS + index * DAY_MS);
  const monday = index - ((date.getUTCDay() + 6) % 7);
  const solved = new Set(stats.solvedDays);
  const canSignIn = OR().capabilities.has('actions.requestSignIn');
  const solvers = loadSolvers(index, signedIn);

  // The status bar sits on home's rust band (styles.css).
  document.documentElement.dataset.screen = 'home';
  stopHome = renderHome(
    app,
    {
      index,
      weekday: WEEKDAYS[date.getUTCDay()]!,
      tier: day.tier,
      givens: day.givens,
      signedIn,
      canSignIn,
      state: stateOf(today),
      streak: streakOf(stats.solvedDays, index),
      best: bestStreak(stats.solvedDays),
      week: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => ({
        index: monday + i,
        label,
        tier: dailyTierFor(monday + i),
        solved: solved.has(monday + i),
        today: monday + i === index,
        future: monday + i > index,
      })),
      solvers,
      board: hasBoard(canSignIn) ? () => showSolvers(index, canSignIn) : null,
      nextIn: () => EPOCH_MS + (index + 1) * DAY_MS - serverNow(),
      race: raceHomeFor(today),
      pastUnsolved: index > 0 ? unsolvedPast(index, stats.solvedDays, parseArchivePlayed(archivePlayed)) : null,
    },
    {
      play: () => void play(),
      race: offerRace,
      signIn: () => void OR().actions.requestSignIn('Sign up to keep your streak and see which friends solved it'),
      settings: showSettings,
      help: () => showHelp(),
      expired: () => void startDay(),
      openDay: (n) => void playArchive(n, 'home'),
      past: () => void showPast(),
    }
  );
  window.scrollTo({ top: 0 });
}

async function play(): Promise<void> {
  // Guests play too: every save here is `storage`, which the host keeps in
  // this browser for a guest and carries over to the account they sign up
  // with. Only the solve's score row needs one (see `solved` below).
  if (!day) return;
  navTicket++;
  stopHome();
  delete document.documentElement.dataset.screen;
  const saved = await readJson<DailySave | null>('daily', null);
  const mine = saved?.index === index ? saved : null;
  const n = index;
  const tier = day.tier;
  // As the play screen saves it, so an untouched grid compares equal.
  const givens = formatGrid(parseGrid(day.givens)!);
  started = mine?.started ?? false;
  dailyRace = parseRace(mine?.race);
  const racing = isRacing(dailyRace) && !mine?.solved ? dailyRace : null;
  // Every daily save carries the race, so nothing here can drop it.
  const persist = (s: SavedPlay): void => writeJson('daily', { ...s, index: n, pending, started, ...(dailyRace ? { race: dailyRace } : {}) });
  playing = mountPlay(app, {
    title: `Daily #${n + 1}`,
    tier: TIER_NAME[tier],
    givens: day.givens,
    saved: mine,
    settings,
    ...(racing ? { race: { startedAt: racing.startedAt, now: serverNow, leave: confirmLeave } } : {}),
    save: (s) => {
      persist(s);
      if (touched(s, givens)) void sendStart(n, s);
    },
    solved: (s) => {
      stats = withDailySolved(stats, n);
      writeJson('stats', stats);
      // A guest's solve is never sent, now or after they sign in: it would
      // land on the friends board as if they'd been signed in to solve it.
      pending = OR().user !== null;
      // A race's time is real time from its start, the same clock the play screen showed.
      if (racing) dailyRace = { ...racing, finishedSec: Math.round((serverNow() - racing.startedAt) / 1000), pending: true };
      persist(s);
      void sendSolve();
      void sendRaceFinish();
      showSolved(s, n, tier, false, dailyRace);
    },
    exit: () => void leave(),
  });
}

/** The Past puzzles list: every earlier day, newest first. */
async function showPast(): Promise<void> {
  navTicket++;
  playing = null;
  stopHome();
  onPast = true;
  delete document.documentElement.dataset.screen;
  const archivePlayed = parseArchivePlayed(await readJson<unknown>(ARCHIVE_PLAYED_KEY, null));
  const days = pastDays(index, pastShown);
  renderPast(
    app,
    {
      days,
      more: days.length > 0 && days[days.length - 1]! > 0,
      tierOf: dailyTierFor,
      statusOf: async (n) => pastStatus(n, stats.solvedDays, archivePlayed, await readJson<SavedPlay | null>(archiveKey(n), null)),
    },
    {
      open: (n) => void playArchive(n, 'past'),
      back: () => void showHome(),
      more: () => {
        pastShown += PAST_PAGE;
        const y = window.scrollY;
        void showPast().then(() => window.scrollTo({ top: y }));
      },
    }
  );
  window.scrollTo({ top: 0 });
}

/** Past days' puzzles, once loaded this session. */
const pastContent = new Map<number, DayContent>();

async function loadPast(n: number): Promise<DayContent | null> {
  const known = pastContent.get(n);
  if (known) return known;
  let past: DayContent | null = null;
  try {
    past = parseDay((await OR().content.daily({ roundKey: roundKey(n) }))?.content);
  } catch {
    past = null;
  }
  if (past) pastContent.set(n, past);
  return past;
}

type Origin = 'home' | 'past';

/**
 * A past Daily: from its archive page on the website, the week strip or the
 * Past puzzles list. Practice only: no score row, and today's save, stats and
 * streak are never touched. Leaving goes back where it was opened from.
 */
async function playArchive(n: number, from: Origin): Promise<void> {
  const ticket = ++navTicket;
  const past = await loadPast(n);
  if (ticket !== navTicket) return;
  if (!past) {
    const back = from === 'past' ? 'the list' : "today's puzzle";
    return showNotice(`Daily #${n + 1} didn't load`, `Check your connection and try again. Here's ${back}.`);
  }
  const key = archiveKey(n);
  const saved = await readJson<SavedPlay | null>(key, null);
  if (ticket !== navTicket) return;
  // Only now, with nothing left to wait for, does the screen change.
  stopHome();
  onPast = false;
  delete document.documentElement.dataset.screen;
  const tier = past.tier;
  // As the play screen saves it, so an untouched grid compares equal.
  const givens = formatGrid(parseGrid(past.givens)!);
  // Saved only once touched, so opening a day for a look doesn't mark it in progress.
  let kept = saved !== null;
  const note = !saved && stats.solvedDays.includes(n) ? `${archiveDate(n)} · You solved it on the day` : `${archiveDate(n)} · Archive`;
  playing = mountPlay(app, {
    title: `Daily #${n + 1}`,
    tier: TIER_NAME[tier],
    note,
    givens: past.givens,
    saved,
    settings,
    save: (s) => {
      if (!kept && !touched(s, givens)) return;
      kept = true;
      writeJson(key, s);
    },
    solved: (s) => {
      kept = true;
      writeJson(key, s);
      // Read, merge, write: the website reads this list server-side. A failed
      // read skips the write rather than replace the list with just this day.
      void readJsonForMerge(ARCHIVE_PLAYED_KEY).then(
        (raw) => writeJson(ARCHIVE_PLAYED_KEY, withArchivePlayed(raw, n)),
        () => undefined
      );
      showSolved(s, n, tier, true, null, () => void leave('past'), from);
    },
    replay: () => {
      // Clear the save first: dispose() saves the solved board, and the write after it wins.
      playing?.dispose();
      playing = null;
      writeJson(key, null);
      void playArchive(n, from);
    },
    exit: () => void leave(from),
  });
}

/**
 * The Daily left unfinished when its day ended. The `daily` save holds one
 * day, and today's first save would replace it, so it moves to that day's
 * archive save, where the Past puzzles list shows it in progress. Only a board
 * that was played, and never over an archive save already there.
 */
async function keepUnfinished(): Promise<void> {
  const saved = await readJson<DailySave | null>('daily', null);
  if (!saved || saved.solved || saved.index >= index || saved.index < 0) return;
  const key = archiveKey(saved.index);
  try {
    // Solved from the archive since (perhaps then cleared by Play again): the old board stays gone.
    if (parseArchivePlayed(await readJsonForMerge(ARCHIVE_PLAYED_KEY)).includes(saved.index)) return;
    if ((await readJsonForMerge(key)) !== null) return;
  } catch {
    return;
  }
  const past = await loadPast(saved.index);
  if (!past || !touched(saved, formatGrid(parseGrid(past.givens)!))) return;
  const kept: SavedPlay = { values: saved.values, notes: saved.notes, hints: saved.hints, solved: false, ...(saved.activeMs ? { activeMs: saved.activeMs } : {}) };
  writeJson(key, kept);
}

async function leave(to: Origin = 'home'): Promise<void> {
  playing?.dispose();
  playing = null;
  await (to === 'past' ? showPast() : showHome());
}

function showSolved(
  s: SavedPlay,
  n: number,
  tier: DayContent['tier'],
  archive = false,
  race: RaceState | null = null,
  /** A past day's way on to the rest of the list. */
  more: (() => void) | null = null,
  /** Where Done goes. */
  done: Origin = 'home'
): void {
  const body = el('div', 'solved');
  const streak = streakOf(stats.solvedDays, n);
  const raced = race?.finishedSec !== undefined && !race.left ? race.finishedSec : null;
  const hintLine = s.hints ? `${s.hints} hint${s.hints === 1 ? '' : 's'}` : 'No hints';
  // The private timer shows here only when the player turned it on.
  const myTime = settings.showTime && s.activeMs ? ` · ${formatTime(s.activeMs / 1000)}` : '';
  body.append(
    el('p', 'solved-big', 'Solved!'),
    el('p', 'solved-line', raced !== null ? `${TIER_NAME[tier]} · ⏱ ${formatTime(raced)}` : `${TIER_NAME[tier]} · ${hintLine}${myTime}`),
    archive
      ? el('p', 'solved-guest', "Past puzzles don't count toward your streak.")
      : el('p', 'solved-streak', streak === 1 ? 'Your streak starts today.' : `${streak} days in a row.`)
  );
  // The sign-up pitch is about the streak, which an archive solve doesn't touch.
  if (!archive && !OR().user && OR().capabilities.has('actions.requestSignIn')) {
    body.appendChild(el('p', 'solved-guest', 'Your streak is saved on this device. Sign up to keep it everywhere and see which friends solved today.'));
  }
  // Today's board, on its own row so it doesn't crowd the actions. The modal
  // opens over this sheet and hands back to it on close.
  const canSignIn = OR().capabilities.has('actions.requestSignIn');
  if (!archive && hasBoard(canSignIn)) {
    body.appendChild(
      raced !== null
        ? button('subtle solved-board', 'See the race ›', () => showSolvers(n, canSignIn, { tab: 'race' }))
        : button('subtle solved-board', 'See how everyone did ›', () => showSolvers(n, canSignIn))
    );
  }
  let close = (): void => undefined;
  if (more) {
    body.appendChild(
      button('subtle solved-board', 'More past puzzles ›', () => {
        close();
        more();
      })
    );
  }
  const actions = el('div', 'sheet-actions');
  if (!archive && !OR().user && OR().capabilities.has('actions.requestSignIn')) {
    actions.appendChild(
      button('subtle', 'Sign up', () => void OR().actions.requestSignIn('Sign up to keep your Sudoku streak').catch(() => undefined))
    );
  }
  if (OR().capabilities.has('actions.share')) {
    const streakMark = archive ? '' : ` 🔥${streak}`;
    const result = raced !== null ? `⏱ ${formatTime(raced)} 🏁` : `✅${s.hints ? ` 💡${s.hints}` : ''}`;
    const text = `Rabbit Sudoku #${n + 1} · ${TIER_NAME[tier]} ${result}${streakMark}\n${SHARE_URL}`;
    actions.appendChild(button('subtle', 'Share', () => void OR().actions.share({ text }).catch(() => undefined)));
  }
  actions.appendChild(
    button('primary', 'Done', () => {
      close();
      void leave(done);
    })
  );
  body.appendChild(actions);
  // Let the last digit and the sweep land first.
  window.setTimeout(() => {
    close = openSheet(archive ? `Daily #${n + 1} · Archive` : "Today's puzzle", body);
  }, 700);
}

function showSettings(): void {
  const body = el('div');
  // Colours: four swatches, applied the moment one is tapped.
  const themes = el('div', 'themes');
  themes.setAttribute('role', 'radiogroup');
  themes.setAttribute('aria-label', 'Colours');
  const swatches = (Object.keys(THEME_LABELS) as ThemeChoice[]).map((choice) => {
    const b = button(`theme theme-${choice}`, '', () => {
      settings = { ...settings, theme: choice };
      applyTheme(choice);
      writeJson('settings', settings);
      mark();
    });
    b.setAttribute('role', 'radio');
    b.append(el('span', 'theme-swatch'), el('span', 'theme-name', THEME_LABELS[choice]));
    return b;
  });
  const mark = (): void => swatches.forEach((b, i) => b.setAttribute('aria-checked', String(Object.keys(THEME_LABELS)[i] === settings.theme)));
  mark();
  themes.append(...swatches);

  const toggles = el('div', 'settings');
  // Nothing buzzes on a desktop, so no switch there (solitaire does the same).
  const touch = window.matchMedia('(pointer: coarse)').matches;
  for (const key of Object.keys(SETTING_LABELS) as Toggle[]) {
    if (key === 'vibration' && !touch) continue;
    const row = el('label', 'toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings = { ...settings, [key]: input.checked };
      setVibration(settings.vibration);
      writeJson('settings', settings);
    });
    row.append(el('span', '', SETTING_LABELS[key]), input);
    toggles.appendChild(row);
  }
  body.append(el('h3', 'group-title', 'Colours'), themes, el('h3', 'group-title', 'Play'), toggles);
  openSheet('Settings', body);
}

function showHelp(onClose?: () => void): void {
  const body = el('div', 'help');
  const p = (html: string): HTMLParagraphElement => {
    const node = el('p');
    node.innerHTML = html;
    return node;
  };
  body.append(
    p('Fill the grid so every <strong>row</strong>, <strong>column</strong> and <strong>3×3 box</strong> has each digit 1 to 9 once.'),
    p('Tap a cell, then a digit. <strong>Notes</strong> lets you pencil in the digits a cell could be. <strong>Hint</strong> shows where to look, then why.'),
    p('There\'s <strong>one puzzle a day</strong> for everyone: easy on Monday, hardest on Saturday. Solve it each day to keep your streak. No clock, no rush.'),
    p('Want a race? Pick <strong>Race it</strong> before you open the day\'s puzzle: no hints, and the clock doesn\'t stop. You can leave the race any time.'),
    p('Every puzzle can be solved by logic alone, without guessing.')
  );
  const actions = el('div', 'sheet-actions');
  let close = (): void => undefined;
  actions.appendChild(button('primary', 'Got it', () => close()));
  body.appendChild(actions);
  close = openSheet('How to play', body, onClose);
}

/** A short message over home, with one button to close it. */
function showNotice(title: string, text: string): void {
  const body = el('div', 'help');
  body.appendChild(el('p', '', text));
  const actions = el('div', 'sheet-actions');
  let close = (): void => undefined;
  actions.appendChild(button('primary', 'OK', () => close()));
  body.appendChild(actions);
  close = openSheet(title, body);
}

function renderUnavailable(): void {
  delete document.documentElement.dataset.screen;
  app.innerHTML = '';
  const wrap = el('div', 'unavailable');
  wrap.append(
    el('p', 'unavailable-title', "Today's puzzle isn't ready yet."),
    el('p', 'muted', 'Check back in a moment, or make sure you have a connection.'),
    button('primary', 'Try again', () => void startDay())
  );
  app.appendChild(wrap);
}

// ---------- the day ----------

async function startDay(): Promise<void> {
  index = puzzleIndexAt(serverNow());
  try {
    day = await loadDay(index);
  } catch {
    day = null;
  }
  void keepUnfinished();
  await showHome();
}

/** A day left open past midnight UTC moves on, once the player is back on home. */
function refreshIfStale(): void {
  void sendSolve();
  void sendRaceFinish();
  if (playing || onPast) return;
  if (!day || puzzleIndexAt(serverNow()) !== index) void startDay();
}

async function bootstrap(): Promise<void> {
  await OR().whenReady();
  await syncClock();
  const [rawSettings, rawStats, seenHelp] = await Promise.all([
    readJson<unknown>('settings', null),
    readJson<unknown>('stats', null),
    readJson<boolean>('seen_help', false),
  ]);
  settings = parseSettings(rawSettings);
  setVibration(settings.vibration);
  applyTheme(settings.theme);
  stats = parseStats(rawStats);
  await startDay();
  // A past day's archive page opens straight into that day; anything else
  // (today, the future, a malformed intent) is a normal launch on home.
  const past = archiveIntent(OR().initialState, index);
  if (past !== null) await playArchive(past, 'home');
  if (!seenHelp) showHelp(() => writeJson('seen_help', true));

  OR().lifecycle.on('pause', () => playing?.flush());
  window.addEventListener('pagehide', () => playing?.flush());
  const onResume = (): void => void syncClock().then(refreshIfStale);
  OR().lifecycle.on('resume', onResume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onResume();
  });
  window.addEventListener('online', onResume);
  window.setInterval(refreshIfStale, 30_000);
  void sendSolve();
  void sendRaceFinish();
  void upgradeLaunchRow();
  OR().ready();
}

bootstrap().catch((error) => {
  app.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  OR().ready();
});
