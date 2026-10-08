// Word Rush's shell: loads the day, switches between the Sprint and the
// casual board, and owns the header, help and deep links.

import { mountCasualPane, type CasualMode } from './casual';
import { showSprintLeaderboard } from './leaderboard';
import { parseDay, puzzleIndexAt, roundKey, type DayContent } from './puzzle';
import { mountSprint, type SprintMode } from './sprint';
import { isMuted, pauseSound, setMuted, unlockSound } from './sound';
import type { SprintPhase } from './sprint-rules';
import { button, el, formatPuzzleDate, OR, openModal, readJson, resetTimeLine, serverNow, syncClock, writeJson } from './ui';

type Tab = 'sprint' | 'casual';

const root = document.getElementById('root')!;

const now = serverNow;

/** Today's content, cached under `day` so reopening doesn't refetch a few KB. */
async function loadDay(index: number): Promise<DayContent | null> {
  const cached = await readJson<{ puzzleIndex?: number; content?: unknown } | null>('day', null);
  if (cached?.puzzleIndex === index) {
    const parsed = parseDay(cached.content);
    if (parsed) return parsed;
  }
  try {
    const daily = await OR().content.daily({ roundKey: roundKey(index) });
    const parsed = parseDay(daily?.content);
    if (parsed) void writeJson('day', { puzzleIndex: index, content: parsed });
    return parsed;
  } catch {
    return null;
  }
}

function showHelp(onClose?: () => void): void {
  openModal(
    `<h2>How to play</h2>
    <p><strong>Drag across touching letters</strong> to spell words. Any direction works, diagonals too, but each tile only once per word. You can also tap letters one at a time and tap the last again, or type and press Enter.</p>
    <h3>Ranked</h3>
    <p>Everyone gets the same board and goes on the leaderboard. You get <strong>90 seconds</strong> (2 minutes on the bigger boards) and one run a day to find as many words of 3+ letters as you can. Longer words score more: 3–4 letters 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11.</p>
    <p>Your points lock in when the clock stops. After midnight UTC the day closes: <strong>words nobody else found score double</strong>, and the next day you'll see your final place and how your words compared.</p>
    <p>The month's board adds up your best days, each rated out of 1,000 against that day's top score, so big and small boards count the same.</p>
    <h3>Casual</h3>
    <p>No clock. Find every everyday word on its own board to clear it, including the ★ star word, the longest one; rarer words count as bonus words. Hints help if you're stuck, and you can play past days' boards too.</p>
    <p class="muted">New boards every day at midnight UTC: 4×4 Monday to Thursday, 5×5 Friday and Saturday, a special shape on Sunday.</p>
    <button type="button" class="primary-btn modal-close">Got it</button>`,
    onClose
  );
}

// "Seen how to play" lives in the player's storage, which follows a signed-in
// account (a guest's is kept by the host in this browser). It's also kept on
// this device, so signing in doesn't bring the help back; either one is
// enough to skip it.
const SEEN_HELP_LOCAL = 'word-rush:seen-help';

async function seenHelpBefore(): Promise<boolean> {
  try {
    if (localStorage.getItem(SEEN_HELP_LOCAL) === '1') return true;
  } catch {
    /* storage blocked: fall through to the account */
  }
  return readJson<boolean>('seen_help', false);
}

function rememberSeenHelp(): void {
  void writeJson('seen_help', true);
  try {
    localStorage.setItem(SEEN_HELP_LOCAL, '1');
  } catch {
    /* best-effort */
  }
}

function renderUnavailable(): void {
  root.innerHTML = '';
  const wrap = el('div', 'unavailable');
  wrap.setAttribute('role', 'status');
  const retry = button('secondary-btn', 'Try again', () => {
    retry.disabled = true;
    retry.textContent = 'Checking…';
    void startDay();
  });
  wrap.append(
    el('p', 'unavailable-title', "Today's boards aren't ready yet."),
    el('p', '', 'Check back in a moment, or make sure you have a connection.'),
    retry,
    resetTimeLine()
  );
  root.appendChild(wrap);
}

/** `{ target: 'leaderboard', roundKey: 'puzzle-N' }` from a push tap, else null. */
function leaderboardIntent(state: Record<string, unknown> | null): number | null {
  if (!state || state.target !== 'leaderboard' || typeof state.roundKey !== 'string') return null;
  const m = /^puzzle-(\d+)$/.exec(state.roundKey);
  return m ? Number(m[1]) : null;
}

/** Mirrors "a modal is open" onto <html> for the status bar tone (styles.css). */
function watchOverlays(): void {
  const sync = (): void => {
    const open = document.querySelector('.modal-backdrop, .lb-backdrop') !== null;
    document.documentElement.toggleAttribute('data-overlay', open);
  };
  new MutationObserver(sync).observe(document.body, { childList: true });
  sync();
}

/**
 * Sound: off until the first tap (browsers require a gesture), muted from the
 * header, remembered under `settings`, paused while the app is hidden.
 */
async function setupSound(): Promise<void> {
  const btn = document.getElementById('btn-sound') as HTMLButtonElement;
  const settings = await readJson<{ muted?: boolean }>('settings', {});
  const paint = (): void => {
    btn.textContent = isMuted() ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', String(isMuted()));
    btn.setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound');
  };
  // Only ever mute here: unmuting would start audio outside a gesture.
  if (settings.muted === true) setMuted(true);
  paint();
  // Hidden until the setting is known, so a muted player never sees 🔊 flip to 🔇.
  btn.hidden = false;
  btn.addEventListener('click', () => {
    setMuted(!isMuted());
    paint();
    void writeJson('settings', { ...settings, muted: isMuted() });
  });
  // Browsers only start audio inside an "activating" gesture, and which events
  // count differs: pointerdown does for a mouse, but on touch screens only
  // pointerup / touchend do. Listen for all of them; unlocking twice is free.
  const unlock = (): void => unlockSound();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, unlock, { capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSound();
    else unlockSound();
  });
}

/** The day on screen: its boards and both modes. Null while nothing could load. */
interface Day {
  index: number;
  active: Tab;
  sprint: SprintMode;
  casual: CasualMode | null;
  select(tab: Tab): Promise<void>;
}

let current: Day | null = null;
const boardBtn = (): HTMLButtonElement => document.getElementById('btn-board') as HTMLButtonElement;

/**
 * Load (or reload) today's boards and build both modes. Runs at boot, from the
 * unavailable screen's Try again, and when the day rolls over with the game
 * open: in place, never `location.reload()`, because a reloaded game never
 * hears the host's `init` again. Concurrent calls share one run.
 */
let startingDay: Promise<void> | null = null;
function startDay(): Promise<void> {
  startingDay ??= (async () => {
    const previous = current;
    previous?.sprint.flush();
    previous?.casual?.flush();
    const index = puzzleIndexAt(now());
    const [day, savedTab] = await Promise.all([loadDay(index), readJson<Tab>('tab', previous?.active ?? 'sprint')]);
    previous?.sprint.dispose();
    current = null;
    if (!day) {
      boardBtn().hidden = true;
      document.body.classList.remove('running');
      renderUnavailable();
      return;
    }
    boardBtn().hidden = false;

    // Tabs, and a pane per mode so switching keeps each one's screen.
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const meta = el('p', 'day-meta', `#${index + 1} · ${formatPuzzleDate(index)}`);
    const panes: Record<Tab, HTMLElement> = { sprint: el('div', 'pane'), casual: el('div', 'pane') };
    const tabBtns: Record<Tab, HTMLButtonElement> = {
      sprint: button('tab', 'Ranked', () => void d.select('sprint')),
      casual: button('tab', 'Casual', () => void d.select('casual')),
    };
    for (const [t, b] of Object.entries(tabBtns)) {
      b.setAttribute('role', 'tab');
      b.dataset.tab = t;
    }
    tabs.append(tabBtns.sprint, tabBtns.casual);
    root.innerHTML = '';
    root.append(meta, tabs, panes.sprint, panes.casual);

    const onPhase = (phase: SprintPhase): void => {
      // Mid-run, nothing but the clock and the board: no tabs, no leaderboard.
      const running = phase === 'playing';
      tabs.hidden = running;
      meta.hidden = running;
      boardBtn().hidden = running;
      // Mute stays reachable mid-run.
      document.body.classList.toggle('running', running);
    };

    const d: Day = {
      index,
      active: savedTab === 'casual' ? 'casual' : 'sprint',
      sprint: null as unknown as SprintMode,
      casual: null,
      async select(tab: Tab): Promise<void> {
        d.active = tab;
        void writeJson('tab', tab);
        for (const t of ['sprint', 'casual'] as const) {
          tabBtns[t].setAttribute('aria-selected', String(t === tab));
          panes[t].hidden = t !== tab;
        }
        // The casual board is built on first visit, so a Sprint-only player never pays for it.
        if (tab === 'casual' && !d.casual) d.casual = await mountCasualPane(panes.casual, index, day.casual);
        window.scrollTo({ top: 0 });
      },
    };
    d.sprint = await mountSprint(panes.sprint, {
      index,
      content: day.sprint,
      now,
      onPhase,
      openCasual: () => void d.select('casual'),
    });
    current = d;
    await d.select(d.active);
  })().finally(() => {
    startingDay = null;
  });
  return startingDay;
}

/**
 * On resume, on a timer, and back online: the unavailable screen tries again,
 * a day left open past midnight UTC starts the new one (a ranked run on screen
 * finishes first; it then carries over as yesterday's), and a score that
 * didn't reach the server is sent again.
 */
function refreshIfStale(): void {
  if (startingDay) return;
  if (!current) {
    void startDay();
    return;
  }
  if (document.body.classList.contains('running')) return;
  if (puzzleIndexAt(now()) !== current.index) {
    void startDay();
    return;
  }
  current.sprint.retrySubmit();
}

async function bootstrap(): Promise<void> {
  await OR().whenReady();
  void setupSound();
  await syncClock();
  document.getElementById('btn-help')!.addEventListener('click', () => showHelp());
  boardBtn().addEventListener('click', () => {
    if (current) showSprintLeaderboard(current.index, current.index);
  });

  const [, seenHelp] = await Promise.all([startDay(), seenHelpBefore()]);

  document.addEventListener('keydown', (e) => {
    if (!current || document.querySelector('.modal-backdrop, .lb-backdrop')) return;
    const tracer = current.active === 'sprint' ? current.sprint.tracer() : current.casual?.tracer();
    if (tracer?.key(e)) e.preventDefault();
  });
  OR().lifecycle.on('pause', () => {
    current?.sprint.flush();
    current?.casual?.flush();
  });
  const onResume = (): void => void syncClock().then(refreshIfStale);
  OR().lifecycle.on('resume', onResume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onResume();
  });
  window.addEventListener('online', onResume);
  window.setInterval(refreshIfStale, 30_000);

  // A push tap. The end-of-day push points at yesterday's ranked board: its
  // results card is at the top of the Ranked tab, so show that rather than
  // covering it with the leaderboard. Never over a run in progress.
  const intent = leaderboardIntent(OR().initialState);
  const openIntent = async (): Promise<void> => {
    const d = current;
    if (intent === null || !d || intent > d.index) return;
    void d.select('sprint');
    if (document.body.classList.contains('running')) return;
    if (intent === d.index - 1 && (await d.sprint.hasResultsCard())) return;
    showSprintLeaderboard(intent, d.index);
  };
  if (!seenHelp && current) {
    showHelp(() => {
      rememberSeenHelp();
      void openIntent();
    });
  } else {
    void openIntent();
  }

  OR().ready();
}

watchOverlays();
bootstrap().catch((error) => {
  root.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  OR().ready();
});
