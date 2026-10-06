// The daily Ranked run ("sprint" in the code): 90 seconds or 2 minutes,
// by board, on a board everyone shares, classic Boggle
// points, one run a day. Your points are locked in when the clock stops; when
// the day closes the server doubles every word nobody else found, and the
// next day's results card shows how your words compared.

import {
  boardOf,
  DAY_MS,
  EPOCH_MS,
  parseDay,
  parseResults,
  resultsRoundKey,
  roundKey,
  SHAPES,
  type SprintContent,
  type SprintResults,
} from './puzzle';
import { decodeMask } from './scoring';
import { showSprintLeaderboard } from './leaderboard';
import {
  basePoints,
  checkSprintWord,
  CLOSE_MARGIN_MS,
  clockLabel,
  freshSprint,
  isSprintProgress,
  phaseOf,
  pointsFor,
  remainingMs,
  rowMeta,
  rowPoints,
  runFitsDay,
  sprintMetadata,
  sprintLabel,
  sprintMs,
  type SprintPhase,
  type SprintProgress,
} from './sprint-rules';
import { banner, floatScore, praiseFor, rollNumber } from './juice';
import { fillLengthRow, lengthRow } from './lengths';
import { play, playWord } from './sound';
import { openShareSheet } from './share';
import { createTracer, type Tracer } from './tracer';
import { button, el, haptic, OR, readJson, resetTimeLine, SHARE_URL, writeJson } from './ui';

export interface SprintContext {
  index: number;
  content: SprintContent;
  /** Server-synced clock (ms). */
  now(): number;
  /** Tell the shell when a run starts or stops, so it can hide the tabs mid-run. */
  onPhase(phase: SprintPhase): void;
  openCasual(): void;
}

export interface SprintMode {
  tracer(): Tracer | null;
  flush(): void;
}

const errorCode = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');

export async function mountSprint(root: HTMLElement, ctx: SprintContext): Promise<SprintMode> {
  const { index } = ctx;
  let content = ctx.content;
  const stored = await readJson<unknown>('sprint', null);
  let progress: SprintProgress = freshSprint(index);

  if (isSprintProgress(stored)) {
    if (stored.puzzleIndex === index) {
      progress = stored;
    } else if (stored.puzzleIndex === index - 1 && stored.startedAt !== null) {
      // Yesterday's run. If it started before midnight and is still going (or
      // ended without reaching the server), finish it on yesterday's board
      // first; otherwise it becomes the results card's "your words". Only a
      // signed-in player has a score to send, so only they carry one over.
      if (!stored.submitted && OR().user) {
        const prevDay = await OR().content.daily({ roundKey: roundKey(index - 1) }).then((d) => parseDay(d?.content)).catch(() => null);
        if (prevDay && phaseOf(stored, ctx.now(), sprintMs(prevDay.sprint.shape)) !== 'ready') {
          content = prevDay.sprint;
          progress = stored;
        }
      }
      if (progress !== stored) await writeJson('sprint-prev', stored);
    }
  }

  /** This run's length: from the board being played (yesterday's, for a run carried over). */
  const runMs = (): number => sprintMs(content.shape);
  const save = (): Promise<void> => writeJson('sprint', progress);
  let tracer: Tracer | null = null;
  let clockTimer: number | undefined;
  let readyTimer: number | undefined;
  let rankLine: string | null = null;

  // ---------- Screens ----------

  function render(): void {
    window.clearInterval(clockTimer);
    window.clearTimeout(readyTimer);
    root.innerHTML = '';
    const phase = phaseOf(progress, ctx.now(), runMs());
    ctx.onPhase(phase);
    if (phase === 'playing') {
      renderPlaying();
      return;
    }
    tracer = null;
    const results = el('div', 'results-slot');
    root.appendChild(results);
    void renderResults(results);
    if (phase === 'ready') renderReady();
    else renderDone();
    root.appendChild(resetTimeLine());
  }

  function renderReady(): void {
    const card = el('section', 'sprint-card');
    card.append(
      // The board's details in one place: its size and how long the run lasts,
      // both of which change through the week.
      el('p', 'eyebrow', `Today's board · ${SHAPES[content.shape].name} · ${sprintLabel(content.shape)}`),
      el('h2', 'sprint-title', 'Compete for the leaderboard'),
      el('p', 'sprint-rules', 'Find words of 3+ letters through touching tiles. Longer words are worth more:')
    );
    // A points scale, not counters: labelled in letters and points so it can't
    // be read as the "words left" row the run shows in the same place.
    const table = el('div', 'points-scale');
    for (const [len, pts] of [['3–4', 1], ['5', 2], ['6', 3], ['7', 5], ['8+', 11]] as const) {
      const item = el('div', 'points-step');
      item.append(el('span', 'points-step-len', `${len} letters`), el('span', 'points-step-pts', `+${pts} ${pts === 1 ? 'pt' : 'pts'}`));
      table.appendChild(item);
    }
    card.append(
      table,
      el('p', 'sprint-rules', 'Words nobody else finds score double. Those are added after midnight UTC, when the day closes.'),
      el('p', 'sprint-rules muted', 'One run a day, the same board for everyone. It appears when you press Start.')
    );
    const closesAt = EPOCH_MS + (progress.puzzleIndex + 1) * DAY_MS;
    if (runFitsDay(progress.puzzleIndex, ctx.now(), runMs())) {
      card.appendChild(button('primary-btn start-btn', 'Start', () => void start()));
      // Swap Start for the closed note when the last full run's window passes.
      readyTimer = window.setTimeout(render, closesAt - CLOSE_MARGIN_MS - runMs() - ctx.now() + 50);
    } else {
      const closed = button('primary-btn start-btn', 'Closed for today', () => undefined);
      closed.disabled = true;
      card.append(closed, el('p', 'sprint-rules muted', 'Too close to midnight UTC to finish a run. A new board opens at midnight.'));
    }
    if (!OR().user) {
      card.append(
        el('p', 'sprint-rules muted', "You're not signed in, so this run won't be ranked."),
        button('secondary-btn small', 'Sign in', () => void OR().actions.requestSignIn('Get on the daily leaderboard'))
      );
    }
    root.appendChild(card);
    root.appendChild(button('link-btn', 'Or take it easy on the casual board →', ctx.openCasual));
  }

  function renderPlaying(): void {
    const hud = el('div', 'sprint-hud');
    const clock = el('div', 'sprint-clock');
    const score = el('div', 'sprint-score');
    hud.append(clock, score);
    const bar = el('div', 'timer-bar');
    const fill = el('div', 'timer-fill');
    bar.appendChild(fill);
    const found = el('div', 'chips sprint-found');
    const lengths = lengthRow();

    const board = boardOf(content);
    const words = new Set(content.words);
    tracer = createTracer(
      board,
      (path, word) => {
        const result = checkSprintWord(content, progress, word);
        const t = tracer!;
        if (result.kind === 'short') t.flashLine('3+ letters', 'info');
        else if (result.kind === 'unknown') {
          t.flashLine(`${word}?`, 'bad');
          t.flashTiles(path, 'bad');
          play('nope');
          haptic('error');
        } else if (result.kind === 'already') {
          t.flashLine(`${word}: got it already`, 'info');
          play('already');
        } else {
          const before = basePoints(progress.found);
          progress.found.push(word);
          void save();
          const big = result.points >= 5;
          t.flashLine(`${word} +${result.points}`, big ? 'star' : 'good');
          t.flashTiles(path, 'good');
          floatScore(t.grid, path[path.length - 1]!, board.cols, board.rows, `+${result.points}`, big ? 'star' : 'good');
          const praise = praiseFor(word.length);
          if (praise) banner(t.grid, praise, big ? 'star' : 'good');
          playWord(result.points);
          haptic(big ? 'success' : 'medium');
          update(before);
          // Every word on the board: no point running the clock down.
          if (progress.found.length >= content.words.length) void finish(true, 'Every word!');
        }
      },
      (word) => (word.length < 3 ? 'none' : progress.found.includes(word) ? 'had' : words.has(word) ? 'new' : 'none')
    );

    let lastTick = -1;
    const pointsLabel = (n: number): string => `${n} ${n === 1 ? 'pt' : 'pts'}`;
    const ptsEl = el('span', 'sprint-pts');
    const countEl = el('span', 'sprint-count');
    score.append(ptsEl, countEl);

    const update = (from?: number): void => {
      const left = remainingMs(progress, ctx.now(), runMs());
      clock.textContent = clockLabel(left);
      clock.classList.toggle('low', left <= 10_000);
      fill.style.width = `${(left / runMs()) * 100}%`;
      // The last ten seconds tick, once a second.
      const secs = Math.ceil(left / 1000);
      if (secs <= 10 && secs > 0 && secs !== lastTick) {
        lastTick = secs;
        play('tick');
      }
      const pts = basePoints(progress.found);
      if (from !== undefined) rollNumber(ptsEl, from, pts, pointsLabel);
      else if (!ptsEl.textContent) ptsEl.textContent = pointsLabel(pts);
      countEl.textContent = ` · ${progress.found.length} of ${content.words.length} words`;
      // Rebuilt only when a word lands, not on every clock tick.
      if (from !== undefined || lengths.row.childElementCount === 0) fillLengthRow(lengths.row, content.words, progress.found);
      if (from !== undefined || found.childElementCount !== progress.found.length) {
        found.innerHTML = '';
        progress.found.slice().reverse().forEach((w, i) => {
          const chip = el('span', i === 0 && from !== undefined ? 'chip new' : 'chip', w);
          found.appendChild(chip);
        });
      }
    };

    root.append(hud, bar, lengths.caption, lengths.row, tracer.wordLine, tracer.grid, found);
    update();
    clockTimer = window.setInterval(() => {
      if (remainingMs(progress, ctx.now(), runMs()) <= 0) void finish(true);
      else update();
    }, 200);
  }

  function renderDone(): void {
    const pts = basePoints(progress.found);
    const longest = progress.found.reduce((a, w) => (w.length > a.length ? w : a), '');
    const card = el('section', 'sprint-card done-card');
    card.append(
      el('p', 'eyebrow', `Today's ranked board · ${SHAPES[content.shape].name}`),
      el('h2', 'sprint-points', `${pts} pts`),
      el(
        'p',
        'sprint-sub',
        progress.found.length === 0
          ? 'No words this time.'
          : `${progress.found.length} of ${content.words.length} words${longest ? ` · longest ${longest}` : ''}`
      )
    );
    if (progress.closed) {
      card.appendChild(el('p', 'sprint-rank', 'This ranked board closed at midnight UTC before your score arrived, so it isn’t on the leaderboard.'));
    } else if (!OR().user) {
      card.append(
        el('p', 'sprint-rank', 'Not ranked: you weren’t signed in.'),
        button('secondary-btn small', 'Sign in for tomorrow', () => void OR().actions.requestSignIn('Get on the daily leaderboard'))
      );
    } else {
      card.appendChild(el('p', 'sprint-rank', rankLine ?? 'Checking your place…'));
      card.appendChild(el('p', 'sprint-rules muted', 'Final places after midnight UTC, when words nobody else found score double.'));
    }

    if (progress.found.length > 0) {
      const chips = el('div', 'chips');
      for (const w of progress.found.slice().sort((a, b) => pointsFor(b) - pointsFor(a) || a.localeCompare(b))) {
        const chip = el('span', 'chip', w);
        chip.appendChild(el('sup', 'chip-pts', String(pointsFor(w))));
        chips.appendChild(chip);
      }
      card.appendChild(chips);
    }

    const actions = el('div', 'done-actions');
    actions.append(
      button('primary-btn', 'Share', () => openSprintShare()),
      button('secondary-btn', 'Leaderboard', () => showSprintLeaderboard(progress.puzzleIndex, index))
    );
    card.appendChild(actions);
    root.appendChild(card);
    root.appendChild(button('link-btn', 'Now try the casual board →', ctx.openCasual));
  }

  function openSprintShare(): void {
    const pts = basePoints(progress.found);
    const longest = progress.found.reduce((a, w) => (w.length > a.length ? w : a), '');
    const rank = rankLine && rankLine.startsWith('#') ? rankLine : null;
    const title = `Word Rush Ranked #${progress.puzzleIndex + 1} · ${SHAPES[content.shape].name}`;
    const stats = `${progress.found.length} words${longest ? ` · longest ${longest.length} letters` : ''}`;
    openShareSheet({
      text: [
        title,
        `⏱️ ${pts} pts · ${stats}`,
        ...(rank ? [`🏆 ${rank}`] : []),
        SHARE_URL,
      ].join('\n'),
      card: {
        title,
        headline: `${pts} pts`,
        lines: [stats, ...(rank ? [rank] : [])],
        rows: content.rows,
        cols: content.cols,
        tiles: content.tiles.map((t) => t !== null),
      },
      file: `word-rush-ranked-${progress.puzzleIndex + 1}`,
    });
  }

  // ---------- Flow ----------

  async function start(): Promise<void> {
    if (!runFitsDay(progress.puzzleIndex, ctx.now(), runMs())) {
      render();
      return;
    }
    progress.startedAt = ctx.now();
    progress.found = [];
    // Saved before the board shows, so reopening mid-run carries on the same
    // clock rather than starting a fresh one.
    await save();
    haptic('medium');
    play('start');
    render();
  }

  let finishing = false;

  /**
   * `live` when the run ended on screen (the clock ran out, or every word was
   * found): then there's a moment, "Time!", before the results.
   */
  async function finish(live = false, label = 'Time!'): Promise<void> {
    if (finishing) return;
    finishing = true;
    window.clearInterval(clockTimer);
    tracer?.setEnabled(false);
    if (live && tracer) {
      play('time');
      haptic('success');
      if (label === 'Time!') root.querySelector('.sprint-clock')!.textContent = '0:00';
      banner(tracer.grid, label, 'time');
      await Promise.all([submit(), new Promise((r) => window.setTimeout(r, 1400))]);
    } else {
      await submit();
    }
    // A run carried over from yesterday is done: today's board is next.
    if (progress.puzzleIndex !== index) {
      await writeJson('sprint-prev', progress);
      content = ctx.content;
      progress = freshSprint(index);
      await save();
    }
    finishing = false;
    render();
    void loadRank();
  }

  /** One run per day: no keepBest, so a second submission is refused and the first stands. */
  async function submit(): Promise<void> {
    if (progress.submitted || !OR().user || progress.startedAt === null) return;
    try {
      await OR().scores.submit({
        roundKey: roundKey(progress.puzzleIndex),
        score: basePoints(progress.found),
        metadata: sprintMetadata(content, progress),
      });
      progress.submitted = true;
    } catch (e) {
      const code = errorCode(e);
      if (code === 'scores/already-submitted') progress.submitted = true;
      if (code === 'scores/round-closed') {
        progress.submitted = true;
        progress.closed = true;
      }
    }
    await save();
  }

  async function loadRank(): Promise<void> {
    if (!OR().user || progress.closed || !OR().capabilities.has('scores.rank')) return;
    try {
      const r = await OR().scores.rank({ roundKey: roundKey(progress.puzzleIndex), order: 'top' });
      rankLine = r ? `#${r.rank} of ${r.total} so far` : null;
    } catch {
      rankLine = null;
    }
    if (phaseOf(progress, ctx.now(), runMs()) === 'done') {
      const line = root.querySelector('.sprint-rank');
      if (line) line.textContent = rankLine ?? 'Ranked once the server catches up.';
    }
  }

  // ---------- Yesterday's results ----------

  /** The card for yesterday's Sprint, once its day has closed: place, bonus, and how your words compared. */
  async function renderResults(slot: HTMLElement): Promise<void> {
    const y = index - 1;
    if (y < 0) return;
    if ((await readJson<number | null>('results-seen', null)) === y) return;
    const or = OR();
    const prev = await readJson<unknown>('sprint-prev', null);
    const [day, rawResults, rank, top] = await Promise.all([
      or.content.daily({ roundKey: roundKey(y) }).then((d) => parseDay(d?.content)).catch(() => null),
      or.content.daily({ roundKey: resultsRoundKey(y) }).then((d) => d?.content ?? null).catch(() => null),
      or.user && or.capabilities.has('scores.rank')
        ? or.scores.rank({ roundKey: roundKey(y), order: 'top' }).catch(() => null)
        : Promise.resolve(null),
      or.capabilities.has('scores.top')
        ? or.scores.top({ roundKey: roundKey(y), order: 'top', limit: 3 }).catch(() => [])
        : Promise.resolve([]),
    ]);
    if (!day) return;
    const words = day.sprint.words;
    // Your words: from this device, else from your row's mask.
    let mine: string[] = isSprintProgress(prev) && prev.puzzleIndex === y ? prev.found : [];
    const meta = rank ? rowMeta(rank.entry.metadata) : null;
    const mask = rank?.entry.metadata?.['f'];
    if (mine.length === 0 && typeof mask === 'string') mine = decodeMask(words, mask);
    if (mine.length === 0 && !rank) return;

    const results: SprintResults | null = parseResults(rawResults, words.length);
    const card = el('section', 'results-card');
    const head = el('div', 'results-head');
    head.append(
      el('p', 'eyebrow', `Yesterday's ranked board · #${y + 1}`),
      button('icon-btn small', '×', () => {
        void writeJson('results-seen', y);
        card.remove();
      }, 'Dismiss')
    );
    card.appendChild(head);

    if (!results) {
      card.appendChild(el('p', 'sprint-rules', 'Results are still being tallied. Check back in a few minutes.'));
      slot.appendChild(card);
      return;
    }

    const counts = new Map(words.map((w, i) => [w, results.counts[i] ?? 0]));
    // Whether the counts include this player: a word is theirs alone at 1 if
    // so, at 0 if not (a guest's run, or one that never reached the server).
    const counted = rank !== null || (isSprintProgress(prev) && prev.puzzleIndex === y && prev.submitted && !prev.closed);
    const alone = counted ? 1 : 0;
    if (top.length > 0) card.appendChild(podium(top, OR().user?.uuid ?? null));
    if (rank) card.appendChild(el('h2', 'results-place', `You placed #${rank.rank} of ${rank.total}`));
    if (meta?.sealed && meta.base !== undefined && meta.final !== undefined) {
      card.appendChild(el('p', 'results-sum', `${meta.base} + ${meta.bonus ?? 0} rare-word bonus = ${meta.final} pts`));
    }

    const others = Math.max(0, results.players - alone);
    const ranked = mine.slice().sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || pointsFor(b) - pointsFor(a));
    // Rarest first; the rest folds away so the card doesn't bury today's Start.
    const FOLD = 10;
    const chips = el('div', 'chips');
    ranked.forEach((w, i) => {
      const n = counts.get(w) ?? 0;
      const unique = n <= alone;
      const chip = el('span', unique ? 'chip star' : 'chip', w);
      chip.appendChild(el('sup', 'chip-pts', unique ? 'only you' : `${n}/${results.players}`));
      chip.hidden = i >= FOLD;
      chips.appendChild(chip);
    });
    if (ranked.length > FOLD) {
      const more = button('chip left more-btn', `+ ${ranked.length - FOLD} more`, () => {
        chips.querySelectorAll<HTMLElement>('.chip[hidden]').forEach((c) => (c.hidden = false));
        more.remove();
      });
      chips.appendChild(more);
    }
    const uniqueCount = ranked.filter((w) => (counts.get(w) ?? 0) <= alone).length;
    card.append(
      el(
        'h3',
        '',
        `Your ${mine.length} words${others > 0 ? ` vs ${others} other ${others === 1 ? 'player' : 'players'}` : ''}${uniqueCount ? ` · ${uniqueCount} only you found` : ''}`
      ),
      chips
    );

    const mineSet = new Set(mine);
    const nobody = words.filter((w) => (counts.get(w) ?? 0) === 0).sort((a, b) => b.length - a.length).slice(0, 6);
    if (nobody.length > 0) {
      const list = el('div', 'chips');
      for (const w of nobody) list.appendChild(el('span', 'chip left', w));
      card.append(el('h3', '', 'Best words nobody found'), list);
    }
    const missed = words
      .filter((w) => !mineSet.has(w) && (counts.get(w) ?? 0) > 0)
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || b.length - a.length)
      .slice(0, 6);
    if (missed.length > 0) {
      const list = el('div', 'chips');
      for (const w of missed) {
        const chip = el('span', 'chip left', w);
        chip.appendChild(el('sup', 'chip-pts', `${counts.get(w)}/${results.players}`));
        list.appendChild(chip);
      }
      card.append(el('h3', '', 'Most-found words you missed'), list);
    }
    card.appendChild(button('secondary-btn small', 'Full results', () => showSprintLeaderboard(y, index)));
    slot.appendChild(card);
  }

  /** Yesterday's top three, second-first-third, on steps. */
  function podium(rows: Array<{ uuid: string; username: string; score: number; metadata: Record<string, unknown> | null }>, me: string | null): HTMLElement {
    const wrap = el('div', 'podium');
    const order = [1, 0, 2];
    const medals = ['🥇', '🥈', '🥉'];
    for (const i of order) {
      const row = rows[i];
      if (!row) continue;
      const step = el('div', `podium-step place-${i + 1}${row.uuid === me ? ' me' : ''}`);
      step.append(
        el('span', 'podium-medal', medals[i]!),
        el('span', 'podium-name', `@${row.username}`),
        el('span', 'podium-pts', `${rowPoints(row.score, row.metadata)} pts`),
        el('span', 'podium-block', String(i + 1))
      );
      wrap.appendChild(step);
    }
    return wrap;
  }

  // A run that ran out while the game was closed goes in now. (Guests have
  // nothing to send, so for them it's just the done screen.)
  if (phaseOf(progress, ctx.now(), runMs()) === 'done' && !progress.submitted && OR().user) {
    await finish();
  } else {
    render();
    if (phaseOf(progress, ctx.now(), runMs()) === 'done') void loadRank();
  }

  return {
    tracer: () => tracer,
    flush() {
      void save();
    },
  };
}
