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
// account. A guest's storage writes are refused, so it's also kept on this
// device; either one is enough to skip the help.
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
  wrap.append(
    el('p', 'unavailable-title', "Today's boards aren't ready yet."),
    el('p', '', 'Check back in a moment, or make sure you have a connection.'),
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
  setMuted(settings.muted === true);
  paint();
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

async function bootstrap(): Promise<void> {
  await OR().whenReady();
  void setupSound();
  await syncClock();
  const index = puzzleIndexAt(now());
  const boardBtn = document.getElementById('btn-board') as HTMLButtonElement;
  document.getElementById('btn-help')!.addEventListener('click', () => showHelp());

  const [day, savedTab, seenHelp] = await Promise.all([
    loadDay(index),
    readJson<Tab>('tab', 'sprint'),
    seenHelpBefore(),
  ]);
  if (!day) {
    boardBtn.hidden = true;
    renderUnavailable();
    OR().ready();
    return;
  }

  boardBtn.addEventListener('click', () => showSprintLeaderboard(index, index));

  // Tabs, and a pane per mode so switching keeps each one's screen.
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const meta = el('p', 'day-meta', `#${index + 1} · ${formatPuzzleDate(index)}`);
  const panes: Record<Tab, HTMLElement> = { sprint: el('div', 'pane'), casual: el('div', 'pane') };
  const tabBtns: Record<Tab, HTMLButtonElement> = {
    sprint: button('tab', 'Ranked', () => select('sprint')),
    casual: button('tab', 'Casual', () => select('casual')),
  };
  for (const [t, b] of Object.entries(tabBtns)) {
    b.setAttribute('role', 'tab');
    b.dataset.tab = t;
  }
  tabs.append(tabBtns.sprint, tabBtns.casual);
  root.innerHTML = '';
  root.append(meta, tabs, panes.sprint, panes.casual);

  let active: Tab = savedTab === 'casual' ? 'casual' : 'sprint';
  let casual: CasualMode | null = null;
  let sprint: SprintMode | null = null;

  async function select(tab: Tab): Promise<void> {
    active = tab;
    void writeJson('tab', tab);
    for (const t of ['sprint', 'casual'] as const) {
      tabBtns[t].setAttribute('aria-selected', String(t === tab));
      panes[t].hidden = t !== tab;
    }
    // The casual board is built on first visit, so a Sprint-only player never pays for it.
    if (tab === 'casual' && !casual) casual = await mountCasualPane(panes.casual, index, day!.casual);
    window.scrollTo({ top: 0 });
  }

  const onPhase = (phase: SprintPhase): void => {
    // Mid-run, nothing but the clock and the board: no tabs, no leaderboard.
    const running = phase === 'playing';
    tabs.hidden = running;
    meta.hidden = running;
    boardBtn.hidden = running;
    // Mute stays reachable mid-run.
    document.body.classList.toggle('running', running);
  };

  sprint = await mountSprint(panes.sprint, {
    index,
    content: day.sprint,
    now,
    onPhase,
    openCasual: () => void select('casual'),
  });
  await select(active);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-backdrop, .lb-backdrop')) return;
    const tracer = active === 'sprint' ? sprint?.tracer() : casual?.tracer();
    if (tracer?.key(e)) e.preventDefault();
  });
  OR().lifecycle.on('pause', () => {
    sprint?.flush();
    casual?.flush();
  });

  // A daily game left open, or resumed from the background, past midnight UTC
  // starts over on the new day. A ranked run on screen finishes first; the
  // done screen then reloads, and the run carries over as yesterday's.
  const checkDay = (): void => {
    if (puzzleIndexAt(now()) === index || document.body.classList.contains('running')) return;
    sprint?.flush();
    casual?.flush();
    location.reload();
  };
  const onResume = (): void => void syncClock().then(checkDay);
  OR().lifecycle.on('resume', onResume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onResume();
  });
  window.setInterval(checkDay, 30_000);

  const intent = leaderboardIntent(OR().initialState);
  const openIntent = (): void => {
    if (intent !== null && intent <= index) {
      void select('sprint');
      showSprintLeaderboard(intent, index);
    }
  };
  if (!seenHelp) {
    showHelp(() => {
      rememberSeenHelp();
      openIntent();
    });
  } else {
    openIntent();
  }

  OR().ready();
}

watchOverlays();
bootstrap().catch((error) => {
  root.textContent = `Failed to start: ${error instanceof Error ? error.message : String(error)}`;
  OR().ready();
});
