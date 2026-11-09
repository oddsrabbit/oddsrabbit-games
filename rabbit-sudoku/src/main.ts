// Rabbit Sudoku's shell: loads the day's puzzle, switches between home and
// the puzzle, sends the solve, and owns help, settings and the day rolling over.

import { renderHome, TIER_NAME, type PlayState } from './home';
import { mountPlay, type PlayScreen, type SavedPlay } from './play';
import { DAY_MS, EPOCH_MS, dailyTierFor, parseDay, puzzleIndexAt, roundKey, type DayContent } from './puzzle';
import { DEFAULT_SETTINGS, parseSettings, SETTING_LABELS, type Settings } from './settings';
import { bestStreak, parseStats, streakOf, withDailySolved, type Stats } from './stats';
import { button, el, openSheet, OR, readJson, serverNow, setVibration, SHARE_URL, syncClock, writeJson } from './ui';

const app = document.getElementById('app')!;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DailySave extends SavedPlay {
  index: number;
  /** The solve hasn't reached the server yet. */
  pending: boolean;
}

let index = 0;
let day: DayContent | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let stats: Stats = { solvedDays: [] };
let playing: PlayScreen | null = null;
let stopHome = (): void => undefined;

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

async function sendSolve(): Promise<void> {
  const saved = await readJson<DailySave | null>('daily', null);
  if (saved?.pending) pending = true;
  if (sending || !pending || !saved || !OR().user || !OR().capabilities.has('scores.submit')) return;
  sending = true;
  const done = (): void => {
    pending = false;
    writeJson('daily', { ...saved, pending: false });
  };
  try {
    await OR().scores.submit({ roundKey: roundKey(saved.index), score: 1, metadata: { hints: saved.hints } });
    done();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'scores/already-submitted') done();
    // Anything else: try again on resume, back online, or the next open.
  } finally {
    sending = false;
  }
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
  const friends =
    signedIn && OR().capabilities.has('scores.friends')
      ? OR()
          .scores.friends({ roundKey: roundKey(index) })
          .then((rows) => rows.filter((r) => !r.isSelf).map((r) => r.username))
          .catch(() => [])
      : null;

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
      friends,
      nextIn: () => EPOCH_MS + (index + 1) * DAY_MS - serverNow(),
    },
    {
      play: () => void play(),
      signIn: () => void OR().actions.requestSignIn('Sign in to play the daily puzzle and keep a streak'),
      settings: showSettings,
      help: () => showHelp(),
      expired: () => void startDay(),
    }
  );
  window.scrollTo({ top: 0 });
}

async function play(): Promise<void> {
  if (!day || !OR().user) return;
  stopHome();
  delete document.documentElement.dataset.screen;
  const saved = await readJson<DailySave | null>('daily', null);
  const mine = saved?.index === index ? saved : null;
  const n = index;
  const tier = day.tier;
  playing = mountPlay(app, {
    title: `Daily #${n + 1}`,
    tier: TIER_NAME[tier],
    givens: day.givens,
    saved: mine,
    settings,
    save: (s) => writeJson('daily', { ...s, index: n, pending }),
    solved: (s) => {
      stats = withDailySolved(stats, n);
      writeJson('stats', stats);
      pending = true;
      writeJson('daily', { ...s, index: n, pending: true });
      void sendSolve();
      showSolved(s, n, tier);
    },
    exit: () => void leave(),
  });
}

async function leave(): Promise<void> {
  playing?.dispose();
  playing = null;
  await showHome();
}

function showSolved(s: SavedPlay, n: number, tier: DayContent['tier']): void {
  const body = el('div', 'solved');
  const streak = streakOf(stats.solvedDays, n);
  const hintLine = s.hints ? `${s.hints} hint${s.hints === 1 ? '' : 's'}` : 'No hints';
  body.append(
    el('p', 'solved-big', 'Solved!'),
    el('p', 'solved-line', `${TIER_NAME[tier]} · ${hintLine}`),
    el('p', 'solved-streak', streak === 1 ? 'Your streak starts today.' : `${streak} days in a row.`)
  );
  const actions = el('div', 'sheet-actions');
  if (OR().capabilities.has('actions.share')) {
    const text = `Rabbit Sudoku #${n + 1} · ${TIER_NAME[tier]} ✅${s.hints ? ` 💡${s.hints}` : ''} 🔥${streak}\n${SHARE_URL}`;
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
    close = openSheet("Today's puzzle", body);
  }, 700);
}

function showSettings(): void {
  const body = el('div', 'settings');
  // Nothing buzzes on a desktop, so no switch there (solitaire does the same).
  const touch = window.matchMedia('(pointer: coarse)').matches;
  for (const key of Object.keys(SETTING_LABELS) as (keyof Settings)[]) {
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
    body.appendChild(row);
  }
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
  stats = parseStats(rawStats);
  await startDay();
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
  OR().ready();
}

bootstrap().catch((error) => {
  app.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  OR().ready();
});
