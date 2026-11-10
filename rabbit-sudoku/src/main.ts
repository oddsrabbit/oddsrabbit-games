// Rabbit Sudoku's shell: loads the day's puzzle, switches between home and
// the puzzle, sends the solve, and owns help, settings and the day rolling over.

import { ARCHIVE_PLAYED_KEY, archiveDate, archiveIntent, archiveKey, withArchivePlayed } from './archive';
import { friendsRows, hasBoard, isSolvedRow, showSolvers, solveScore, UNSOLVED_SCORE } from './board';
import { renderHome, TIER_NAME, type PlayState, type Solvers } from './home';
import { mountPlay, type PlayScreen, type SavedPlay } from './play';
import { DAY_MS, EPOCH_MS, dailyTierFor, parseDay, puzzleIndexAt, roundKey, type DayContent } from './puzzle';
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
}

let index = 0;
let day: DayContent | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let stats: Stats = { solvedDays: [] };
let playing: PlayScreen | null = null;
let stopHome = (): void => undefined;

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
  playing = null;
  stopHome();
  if (!day) return renderUnavailable();
  const signedIn = OR().user !== null;
  const saved = await readJson<DailySave | null>('daily', null);
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
        label,
        tier: dailyTierFor(monday + i),
        solved: solved.has(monday + i),
        today: monday + i === index,
        future: monday + i > index,
      })),
      solvers,
      board: hasBoard(canSignIn) ? () => showSolvers(index, canSignIn) : null,
      nextIn: () => EPOCH_MS + (index + 1) * DAY_MS - serverNow(),
    },
    {
      play: () => void play(),
      signIn: () => void OR().actions.requestSignIn('Sign up to keep your streak and see which friends solved it'),
      settings: showSettings,
      help: () => showHelp(),
      expired: () => void startDay(),
    }
  );
  window.scrollTo({ top: 0 });
}

async function play(): Promise<void> {
  // Guests play too: every save here is `storage`, which the host keeps in
  // this browser for a guest and carries over to the account they sign up
  // with. Only the solve's score row needs one (see `solved` below).
  if (!day) return;
  stopHome();
  delete document.documentElement.dataset.screen;
  const saved = await readJson<DailySave | null>('daily', null);
  const mine = saved?.index === index ? saved : null;
  const n = index;
  const tier = day.tier;
  // As the play screen saves it, so an untouched grid compares equal.
  const givens = formatGrid(parseGrid(day.givens)!);
  started = mine?.started ?? false;
  playing = mountPlay(app, {
    title: `Daily #${n + 1}`,
    tier: TIER_NAME[tier],
    givens: day.givens,
    saved: mine,
    settings,
    save: (s) => {
      writeJson('daily', { ...s, index: n, pending, started });
      if (touched(s, givens)) void sendStart(n, s);
    },
    solved: (s) => {
      stats = withDailySolved(stats, n);
      writeJson('stats', stats);
      // A guest's solve is never sent, now or after they sign in: it would
      // land on the friends board as if they'd been signed in to solve it.
      pending = OR().user !== null;
      writeJson('daily', { ...s, index: n, pending, started });
      void sendSolve();
      showSolved(s, n, tier);
    },
    exit: () => void leave(),
  });
}

/**
 * A past Daily, opened from its archive page. Practice only: no score row,
 * and today's save, stats and streak are never touched.
 */
async function playArchive(n: number): Promise<void> {
  let past: DayContent | null = null;
  try {
    past = parseDay((await OR().content.daily({ roundKey: roundKey(n) }))?.content);
  } catch {
    past = null;
  }
  if (!past) return showNotice(`Daily #${n + 1} didn't load`, "Check your connection and try again. Here's today's puzzle.");
  stopHome();
  delete document.documentElement.dataset.screen;
  const key = archiveKey(n);
  const saved = await readJson<SavedPlay | null>(key, null);
  const tier = past.tier;
  playing = mountPlay(app, {
    title: `Daily #${n + 1}`,
    tier: TIER_NAME[tier],
    note: `${archiveDate(n)} · Archive`,
    givens: past.givens,
    saved,
    settings,
    save: (s) => writeJson(key, s),
    solved: (s) => {
      writeJson(key, s);
      // Read, merge, write: the website reads this list server-side. A failed
      // read skips the write rather than replace the list with just this day.
      void readJsonForMerge(ARCHIVE_PLAYED_KEY).then(
        (raw) => writeJson(ARCHIVE_PLAYED_KEY, withArchivePlayed(raw, n)),
        () => undefined
      );
      showSolved(s, n, tier, true);
    },
    exit: () => void leave(),
  });
}

async function leave(): Promise<void> {
  playing?.dispose();
  playing = null;
  await showHome();
}

function showSolved(s: SavedPlay, n: number, tier: DayContent['tier'], archive = false): void {
  const body = el('div', 'solved');
  const streak = streakOf(stats.solvedDays, n);
  const hintLine = s.hints ? `${s.hints} hint${s.hints === 1 ? '' : 's'}` : 'No hints';
  body.append(
    el('p', 'solved-big', 'Solved!'),
    el('p', 'solved-line', `${TIER_NAME[tier]} · ${hintLine}`),
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
    body.appendChild(button('subtle solved-board', 'See how everyone did ›', () => showSolvers(n, canSignIn)));
  }
  const actions = el('div', 'sheet-actions');
  if (!archive && !OR().user && OR().capabilities.has('actions.requestSignIn')) {
    actions.appendChild(
      button('subtle', 'Sign up', () => void OR().actions.requestSignIn('Sign up to keep your Sudoku streak').catch(() => undefined))
    );
  }
  if (OR().capabilities.has('actions.share')) {
    const streakMark = archive ? '' : ` 🔥${streak}`;
    const text = `Rabbit Sudoku #${n + 1} · ${TIER_NAME[tier]} ✅${s.hints ? ` 💡${s.hints}` : ''}${streakMark}\n${SHARE_URL}`;
    actions.appendChild(button('subtle', 'Share', () => void OR().actions.share({ text }).catch(() => undefined)));
  }
  let close = (): void => undefined;
  actions.appendChild(
    button('primary', 'Done', () => {
      close();
      void leave();
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
  await showHome();
}

/** A day left open past midnight UTC moves on, once the player is back on home. */
function refreshIfStale(): void {
  void sendSolve();
  if (playing) return;
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
  if (past !== null) await playArchive(past);
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
  void upgradeLaunchRow();
  OR().ready();
}

bootstrap().catch((error) => {
  app.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  OR().ready();
});
