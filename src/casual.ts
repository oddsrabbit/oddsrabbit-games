// The casual board: untimed, find every everyday word to clear it. No
// leaderboard; instead "X% of players found every word" and how friends did, from
// scores on `casual-N` that never reach the Ranked boards or the month.
//
// Today's board sits behind a start card like Ranked's. Past days' casual
// boards can be played from an archive (fetched with `content.daily`, which
// serves any day that has opened); they don't count toward the stats.

import { findPath, startTiles, type Board } from './board';
import {
  applyWord,
  checkWord,
  DEFAULT_STATS,
  freshProgress,
  isCleared,
  isProgress,
  listed,
  milestoneCrossed,
  nextReveal,
  scoreOf,
  submissionMetadata,
  type Progress,
  type Stats,
  type WordResult,
} from './game';
import { boardOf, casualRoundKey, parseDay, roundKey, shapeForPuzzle, SHAPES, type CasualContent } from './puzzle';
import { completion, percentLabel, scoreLabel } from './scoring';
import { banner, confetti, floatScore, praiseFor } from './juice';
import { play, playWord } from './sound';
import { pointsFor } from './sprint-rules';
import { fillLengthRow, lengthCounts, lengthRow, lengthTable } from './lengths';
import { openShareSheet } from './share';
import { createTracer, type Tracer } from './tracer';
import { button, el, formatPuzzleDate, haptic, OR, readJson, resetTimeLine, SHARE_URL, showToast, writeJson } from './ui';

/** Quiet time after the last find before the score goes to the server. */
const SUBMIT_DELAY_MS = 5000;
/** A score that found every required word. Revealed words don't score, so a board cleared with reveals stays below it. */
const ALL_FOUND = 1000 * 100;

export interface CasualMode {
  /** The live grid, or null on a start card or the archive. */
  tracer(): Tracer | null;
  /** Flush progress and the score (on pause). */
  flush(): void;
}

/** How many past boards the archive lists. */
const ARCHIVE_DAYS = 30;

const storageKey = (index: number): string => `casual-${index}`;

/**
 * The Casual tab: today's board, the archive of past boards, and a past board
 * being played. Switches between them in place.
 */
export async function mountCasualPane(pane: HTMLElement, today: number, todayContent: CasualContent): Promise<CasualMode> {
  let live: CasualMode | null = null;

  const openToday = async (): Promise<void> => {
    live?.flush();
    live = await mountCasual(pane, today, todayContent, { today: true, onPast: () => void showArchive() });
    window.scrollTo({ top: 0 });
  };

  const openPast = async (index: number): Promise<void> => {
    const day = await OR().content.daily({ roundKey: roundKey(index) }).then((d) => parseDay(d?.content)).catch(() => null);
    if (!day) {
      showToast("Couldn't load that board");
      return;
    }
    live?.flush();
    live = await mountCasual(pane, index, day.casual, {
      today: false,
      onPast: () => void showArchive(),
      onToday: () => void openToday(),
    });
    window.scrollTo({ top: 0 });
  };

  async function showArchive(): Promise<void> {
    live?.flush();
    live = null;
    pane.innerHTML = '';
    const head = el('div', 'meta');
    head.append(el('span', 'meta-number', 'Past casual boards'), button('secondary-btn small', 'Back to today', () => void openToday()));
    pane.appendChild(head);
    const days = Array.from({ length: Math.min(ARCHIVE_DAYS, Math.max(0, today)) }, (_, i) => today - 1 - i);
    if (days.length === 0) {
      pane.appendChild(el('p', 'sprint-rules muted', 'No past boards yet. A new one joins the list every day.'));
      return;
    }
    const saved = await Promise.all(days.map((d) => readJson<unknown>(storageKey(d), null)));
    const list = el('ul', 'archive');
    days.forEach((d, i) => {
      const p = saved[i];
      let status = 'New';
      let cls = 'archive-status';
      if (isProgress(p) && p.puzzleIndex === d && (p.started || listed(p) > 0)) {
        status = p.counted.cleared ? 'Cleared ✓' : `${listed(p)} found`;
        cls += p.counted.cleared ? ' done' : ' going';
      }
      const row = button('archive-row', '', () => void openPast(d));
      row.append(
        el('span', 'archive-date', `#${d + 1} · ${formatPuzzleDate(d)}`),
        el('span', 'archive-shape', SHAPES[shapeForPuzzle(d).id].name),
        el('span', cls, status)
      );
      const li = el('li');
      li.appendChild(row);
      list.appendChild(li);
    });
    pane.appendChild(list);
    window.scrollTo({ top: 0 });
  }

  await openToday();
  return {
    tracer: () => live?.tracer() ?? null,
    flush: () => live?.flush(),
  };
}

interface BoardOptions {
  /** Today's board: counts toward the stats. */
  today: boolean;
  onPast(): void;
  /** Past boards only: back to today's. */
  onToday?(): void;
}

async function mountCasual(root: HTMLElement, index: number, content: CasualContent, opts: BoardOptions): Promise<CasualMode> {
  const board: Board = boardOf(content);
  const stored = await readJson<unknown>(storageKey(index), null);
  const progress: Progress = isProgress(stored) && stored.puzzleIndex === index ? stored : freshProgress(index);
  // Drop anything an edited board no longer lists.
  progress.found = progress.found.filter((w) => content.words.includes(w));
  progress.revealed = progress.revealed.filter((w) => content.words.includes(w));
  progress.bonus = progress.bonus.filter((w) => content.bonus.includes(w));
  let stats: Stats = { ...DEFAULT_STATS, ...(await readJson<Stats>('casual-stats', DEFAULT_STATS)) };
  let showStarts = false;
  const save = (): Promise<void> => writeJson(storageKey(index), progress);

  const ui = {
    progressText: el('span', 'progress-text'),
    progressFill: el('div', 'progress-fill'),
    bonusChip: el('span', 'bonus-chip'),
    startsBtn: button('tool-btn', '', () => {
      showStarts = !showStarts;
      refresh();
    }),
    revealBtn: button('tool-btn', 'Reveal a word', () => onReveal()),
    done: el('section', 'done'),
    words: el('section', 'words'),
    social: el('section', 'social'),
  };

  const required = new Set(content.words);
  const bonusWords = new Set(content.bonus);
  const tracer = createTracer(
    board,
    (path, word) => onResult(checkWord(content, progress, word), path),
    (word) => {
      if (progress.found.includes(word) || progress.revealed.includes(word) || progress.bonus.includes(word)) return 'had';
      if (word.length < 4) return 'none';
      return required.has(word) ? 'new' : bonusWords.has(word) ? 'bonus' : 'none';
    }
  );

  // ---------- Layout ----------

  let playing = false;
  const lengths = lengthRow();
  const title = opts.today ? "Today's casual board" : `Casual #${index + 1} · ${formatPuzzleDate(index)}`;

  /** The start card, until Start is pressed: same shape as Ranked's. */
  function renderReady(): void {
    root.innerHTML = '';
    const card = el('section', 'sprint-card');
    card.append(
      // Same shape as Ranked's: the board's size and its clock (none), plus which day for a past board.
      el('p', 'eyebrow', `${opts.today ? "Today's board" : `Board #${index + 1}`} · ${SHAPES[content.shape].name} · No clock`),
      el('h2', 'sprint-title', `Find all ${content.words.length} everyday words.`),
      el('p', 'sprint-rules', 'No clock, no pressure. Words of 4+ letters through touching tiles. Words to find by length:'),
      lengthTable(lengthCounts(content.words)),
      el('p', 'sprint-rules', `★ The star word, the longest, has ${content.star.length} letters. Rarer words count as bonus words.`),
      el('p', 'sprint-rules muted', 'Hints if you get stuck.'),
      button('primary-btn start-btn', 'Start', () => {
        progress.started = true;
        void save();
        renderPlay();
      })
    );
    root.appendChild(card);
    root.appendChild(navLinks());
    if (opts.today) root.appendChild(resetTimeLine());
  }

  function navLinks(): HTMLElement {
    return opts.today
      ? button('link-btn', 'Play past boards →', opts.onPast)
      : button('link-btn', '← More past boards', opts.onPast);
  }

  function renderPlay(): void {
    playing = true;
    root.innerHTML = '';
    const meta = el('div', 'meta');
    meta.append(el('span', 'meta-number', title), el('span', 'meta-shape', SHAPES[content.shape].name));
    if (opts.onToday) meta.appendChild(button('secondary-btn small', 'Today', opts.onToday));
    const progressRow = el('div', 'progress');
    const bar = el('div', 'progress-bar');
    bar.appendChild(ui.progressFill);
    const counts = el('div', 'progress-counts');
    counts.append(ui.progressText, ui.bonusChip);
    progressRow.append(counts, bar);
    const tools = el('div', 'tools');
    tools.append(ui.startsBtn, ui.revealBtn);
    root.append(meta, progressRow, lengths.caption, lengths.row, tracer.wordLine, tracer.grid, tools, ui.done, ui.words, ui.social, navLinks());
    if (opts.today) root.appendChild(resetTimeLine());
    refresh();
    void loadSocial();
  }

  function refresh(): void {
    const total = content.words.length;
    const have = listed(progress);
    ui.progressText.textContent = `${have} of ${total} words`;
    ui.progressFill.style.width = `${(have / total) * 100}%`;
    ui.bonusChip.textContent = progress.bonus.length > 0 ? `+${progress.bonus.length} bonus` : '';
    ui.bonusChip.hidden = progress.bonus.length === 0;
    fillLengthRow(lengths.row, content.words, [...progress.found, ...progress.revealed]);
    const cleared = isCleared(content, progress);
    ui.startsBtn.textContent = showStarts ? 'Hide word starts' : 'Show word starts';
    ui.startsBtn.setAttribute('aria-pressed', String(showStarts));
    ui.startsBtn.hidden = cleared;
    ui.revealBtn.hidden = cleared;
    if (!revealArmed) ui.revealBtn.textContent = 'Reveal a word';
    renderStarts();
    renderWords();
    renderDone();
  }

  // ---------- Words ----------

  function onResult(result: WordResult, traced: number[]): void {
    switch (result.kind) {
      case 'short':
        tracer.flashLine('Words need 4+ letters', 'info');
        return;
      case 'unknown':
        tracer.flashLine(`${result.word} isn't in the word list`, 'bad');
        tracer.flashTiles(traced, 'bad');
        play('nope');
        haptic('error');
        return;
      case 'already':
        tracer.flashLine(`${result.word}: already found`, 'info');
        play('already');
        return;
      case 'revealed':
        tracer.flashLine(`${result.word} was revealed`, 'info');
        return;
      case 'bonus':
        applyWord(progress, result);
        tracer.flashLine(`${result.word} · bonus word!`, 'bonus');
        tracer.flashTiles(traced, 'bonus');
        floatScore(tracer.grid, traced[traced.length - 1]!, board.cols, board.rows, 'bonus', 'bonus');
        play('bonus');
        haptic('medium');
        afterChange(listed(progress));
        return;
      case 'found': {
        const before = listed(progress);
        applyWord(progress, result);
        tracer.flashLine(result.star ? `★ ${result.word} · star word!` : result.word, result.star ? 'star' : 'good');
        tracer.flashTiles(traced, 'good');
        floatScore(tracer.grid, traced[traced.length - 1]!, board.cols, board.rows, result.star ? '★' : '✓', result.star ? 'star' : 'good');
        if (result.star) {
          banner(tracer.grid, 'Star word!', 'star');
          play('star');
          confetti(0.7);
        } else {
          const praise = praiseFor(result.word.length);
          if (praise) banner(tracer.grid, praise, result.word.length >= 7 ? 'star' : 'good');
          playWord(pointsFor(result.word));
        }
        haptic(result.star ? 'success' : 'medium');
        afterChange(before);
      }
    }
  }

  /** After a find or a reveal: milestones, stats, save, and a submission soon. */
  function afterChange(before: number): void {
    const total = content.words.length;
    const after = listed(progress);
    const milestone = milestoneCrossed(before, after, total);

    // Only today's board feeds the stats; past boards are practice.
    if (!progress.counted.halfway && after >= Math.ceil(total / 2)) {
      progress.counted.halfway = true;
      if (opts.today) {
        stats = { ...stats, played: stats.played + 1 };
        void writeJson('casual-stats', stats);
      }
    }
    if (!progress.counted.cleared && isCleared(content, progress)) {
      progress.counted.cleared = true;
      if (opts.today) {
        stats = {
          ...stats,
          cleared: stats.cleared + 1,
          perfect: stats.perfect + (progress.revealed.length === 0 ? 1 : 0),
        };
        void writeJson('casual-stats', stats);
      }
    }

    void save();
    refresh();
    if (isCleared(content, progress)) void submitNow().then(loadSocial);
    else scheduleSubmit();

    if (milestone !== null && milestone < 100) window.setTimeout(() => play('milestone'), 350);
    if (milestone === 100) {
      haptic('success');
      window.setTimeout(() => {
        play('cleared');
        confetti(1.6);
      }, 300);
      showToast('Board cleared! 🐇');
      ui.done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (milestone === 50) {
      showToast('Halfway there!');
    } else if (milestone === 25) {
      showToast('A quarter of the way there');
    } else if (milestone === 75) {
      showToast('Three quarters done!');
    }
  }

  /** Group the required words by length, found ones shown, the rest counted. */
  function renderWords(): void {
    ui.words.innerHTML = '';
    const found = new Set(progress.found);
    const revealed = new Set(progress.revealed);
    const cleared = isCleared(content, progress);
    const lengths = [...new Set(content.words.map((w) => w.length))].sort((a, b) => a - b);

    for (const len of lengths) {
      const all = content.words.filter((w) => w.length === len);
      const shown = all.filter((w) => found.has(w) || revealed.has(w));
      const group = el('div', 'group');
      const head = el('div', 'group-head');
      head.append(el('h3', '', `${len} letters`), el('span', 'group-count', `${shown.length}/${all.length}`));
      const chips = el('div', 'chips');
      for (const w of shown.sort()) {
        const chip = el('span', revealed.has(w) ? 'chip revealed' : 'chip', w === content.star ? `★ ${w}` : w);
        if (w === content.star) chip.classList.add('star');
        chips.appendChild(chip);
      }
      const left = all.length - shown.length;
      if (left > 0) chips.appendChild(el('span', 'chip left', `${left} to find`));
      group.append(head, chips);
      ui.words.appendChild(group);
    }

    // The star word's length is the one clue the list gives away.
    if (!found.has(content.star) && !revealed.has(content.star) && !cleared) {
      ui.words.prepend(el('p', 'star-hint', `★ The star word has ${content.star.length} letters.`));
    }

    if (progress.bonus.length > 0) {
      const group = el('div', 'group bonus-group');
      const head = el('div', 'group-head');
      head.append(el('h3', '', 'Bonus words'), el('span', 'group-count', String(progress.bonus.length)));
      const chips = el('div', 'chips');
      for (const w of progress.bonus.slice().sort()) chips.appendChild(el('span', 'chip bonus', w));
      group.append(head, chips);
      ui.words.appendChild(group);
    }
  }

  // ---------- Hints ----------

  function renderStarts(): void {
    if (!showStarts) {
      tracer.setCounts(null);
      return;
    }
    const n = new Array<number>(content.tiles.length).fill(0);
    const done = new Set([...progress.found, ...progress.revealed]);
    for (const w of content.words) {
      if (done.has(w)) continue;
      for (const t of startTiles(board, w)) n[t]!++;
    }
    tracer.setCounts(n);
  }

  let revealArmed = false;
  let revealTimer: number | undefined;

  /** Two taps, so a stray one doesn't spend a word: the first arms, the second reveals. */
  function onReveal(): void {
    if (!revealArmed) {
      revealArmed = true;
      ui.revealBtn.textContent = "Tap again · won't score";
      ui.revealBtn.classList.add('armed');
      revealTimer = window.setTimeout(disarm, 3000);
      return;
    }
    disarm();
    const word = nextReveal(content, progress);
    if (!word) return;
    const before = listed(progress);
    progress.revealed.push(word);
    const route = findPath(board, word);
    if (route) tracer.flashTiles(route, 'bonus');
    tracer.flashLine(`Revealed: ${word}`, 'info');
    afterChange(before);
  }

  function disarm(): void {
    window.clearTimeout(revealTimer);
    revealArmed = false;
    ui.revealBtn.classList.remove('armed');
    ui.revealBtn.textContent = 'Reveal a word';
  }

  // ---------- Cleared ----------

  function renderDone(): void {
    ui.done.innerHTML = '';
    if (!isCleared(content, progress)) {
      ui.done.hidden = true;
      return;
    }
    ui.done.hidden = false;
    const own = progress.found.length;
    const total = content.words.length;
    ui.done.appendChild(el('h2', 'done-title', 'Board cleared! 🐇'));
    ui.done.appendChild(
      el(
        'p',
        'done-sub',
        progress.revealed.length === 0
          ? `You found all ${total} words${progress.bonus.length ? `, plus ${progress.bonus.length} bonus` : ''}.`
          : `You found ${own} of ${total} words yourself (${percentLabel(completion(own, total))}).`
      )
    );
    if (!opts.today) {
      const actions = el('div', 'done-actions');
      actions.append(button('primary-btn', 'Another past board', opts.onPast));
      ui.done.appendChild(actions);
      return;
    }
    const grid = el('div', 'stats');
    const cells: Array<[string, string]> = [
      ['Boards cleared', String(stats.cleared)],
      ['Perfect (no reveals)', String(stats.perfect)],
    ];
    for (const [label, value] of cells) {
      const cell = el('div', 'stat');
      cell.append(el('div', 'stat-value', value), el('div', 'stat-label', label));
      grid.appendChild(cell);
    }
    ui.done.appendChild(grid);
    const actions = el('div', 'done-actions');
    actions.append(
      button('primary-btn', 'Share', () =>
        openShareSheet({
          text: casualShare(),
          card: {
            title: `Word Rush Casual #${index + 1} · ${SHAPES[content.shape].name}`,
            headline: `${progress.found.length}/${content.words.length}`,
            lines: [
              'words found',
              ...(progress.found.includes(content.star) ? ['★ star word'] : []),
              ...(progress.bonus.length ? [`+${progress.bonus.length} bonus`] : []),
            ],
            rows: content.rows,
            cols: content.cols,
            tiles: content.tiles.map((t) => t !== null),
          },
          file: `word-rush-casual-${index + 1}`,
        })
      )
    );
    ui.done.appendChild(actions);
  }

  function casualShare(): string {
    const total = content.words.length;
    const own = progress.found.length;
    const filled = Math.round(completion(own, total) / 100);
    const parts = [`${own}/${total} words`];
    if (progress.found.includes(content.star)) parts.push('★ star word');
    if (progress.bonus.length > 0) parts.push(`+${progress.bonus.length} bonus`);
    if (progress.revealed.length > 0) parts.push(`${progress.revealed.length} revealed`);
    return [
      `Word Rush Casual #${index + 1} · ${SHAPES[content.shape].name}`,
      '🟩'.repeat(filled) + '⬜'.repeat(10 - filled),
      parts.join(' · '),
      SHARE_URL,
    ].join('\n');
  }

  // ---------- Scores ----------

  let submitTimer: number | undefined;

  function scheduleSubmit(): void {
    if (!OR().user) return;
    window.clearTimeout(submitTimer);
    submitTimer = window.setTimeout(() => void submitNow(), SUBMIT_DELAY_MS);
  }

  /** keepBest on `casual-N`, recomputed server-side from the masks. Skipped for guests and when nothing improved. */
  async function submitNow(): Promise<void> {
    window.clearTimeout(submitTimer);
    if (!OR().user) return;
    const score = scoreOf(content, progress);
    if (score <= progress.submitted) return;
    try {
      await OR().scores.submit({
        roundKey: casualRoundKey(index),
        score,
        metadata: submissionMetadata(content, progress),
        keepBest: true,
      });
      progress.submitted = Math.max(progress.submitted, score);
      await save();
    } catch {
      /* best-effort: retried on the next find, on pause, and on the next load */
    }
  }

  // ---------- Company ----------

  /** "62% of 40 players found every word" and friends' progress. Company, not a ranking. */
  async function loadSocial(): Promise<void> {
    const or = OR();
    const key = casualRoundKey(index);
    const [dist, friends] = await Promise.all([
      or.capabilities.has('scores.distribution') ? or.scores.distribution({ roundKey: key }).catch(() => null) : Promise.resolve(null),
      or.user ? or.scores.friends({ roundKey: key }).catch(() => []) : Promise.resolve([]),
    ]);
    ui.social.innerHTML = '';
    ui.social.appendChild(el('h3', '', opts.today ? 'Today on the casual board' : 'On this board'));
    if (dist) {
      const total = dist.reduce((n, e) => n + e.count, 0);
      const cleared = dist.reduce((n, e) => n + (e.score >= ALL_FOUND ? e.count : 0), 0);
      ui.social.appendChild(
        el(
          'p',
          'social-line',
          total === 0
            ? opts.today ? "You're one of the first here today." : 'Nobody else has played this one yet.'
            : `${Math.round((100 * cleared) / total)}% of ${total} ${total === 1 ? 'player' : 'players'} found every word without reveals.`
        )
      );
    }
    const others = friends.filter((f) => !f.isSelf).sort((a, b) => b.score - a.score);
    if (others.length > 0) {
      const list = el('ul', 'social-friends');
      for (const f of others.slice(0, 8)) {
        const li = el('li');
        li.append(el('span', 'social-name', `@${f.username}`), el('span', 'social-score', scoreLabel(f.score)));
        list.appendChild(li);
      }
      ui.social.appendChild(list);
    } else if (!or.user) {
      ui.social.appendChild(
        button('secondary-btn small', 'Sign in to see your friends', () => void or.actions.requestSignIn('See how your friends did'))
      );
    } else {
      ui.social.appendChild(el('p', 'social-line muted', 'None of the people you follow have played it yet.'));
    }
  }

  if (progress.started || listed(progress) > 0 || progress.bonus.length > 0) renderPlay();
  else renderReady();
  void submitNow();

  return {
    tracer: () => (playing ? tracer : null),
    flush() {
      void save();
      void submitNow();
    },
  };
}
