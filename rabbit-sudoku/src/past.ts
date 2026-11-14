// The Past puzzles list, in home's frame (home.ts, homeFrame): every earlier
// Daily, newest first, each with a picture of its board, its difficulty and
// how far you got. Chips filter it by solved or not. A row opens that day
// straight onto the board, as practice (main.ts, playArchive).
//
// Two things arrive after the rows: each day's save from storage (its status
// and the cells filled in) and its givens from the network (content.daily),
// fetched only once its row nears the screen, so opening the list doesn't
// load thirty puzzles at once.

import { cellsToGo, shortDate, type PastFilter, type PastStatus } from './archive';
import type { Tier } from './grade';
import { homeFrame, TIER_NAME } from './home';
import { parseGrid } from './sudoku';
import { button, el } from './ui';

/** A past day as storage knows it. */
export interface PastRow {
  status: PastStatus;
  /** The saved board in its text form, or null with no save. */
  values: string | null;
}

export interface PastData {
  /** Today's index, for the dates. */
  today: number;
  /** The days to list, newest first. */
  days: number[];
  /** There are older days than these. */
  more: boolean;
  filter: PastFilter;
  /** How many past days each chip holds. */
  counts: Record<PastFilter, number>;
  tierOf(n: number): Tier;
  rowOf(n: number): Promise<PastRow>;
  /** The day's givens, or null when they didn't load. */
  givensOf(n: number): Promise<string | null>;
}

export interface PastActions {
  open(n: number): void;
  /** Back to today: home. */
  back(): void;
  /** List another page of older days. */
  more(): void;
  filter(f: PastFilter): void;
  help(): void;
  settings(): void;
  /** Today's board, from the header's trophy; null when this host has none. */
  board: (() => void) | null;
}

const CHIPS: readonly [PastFilter, string][] = [
  ['all', 'All'],
  ['unsolved', 'Unsolved'],
  ['solved', 'Solved'],
];

const EMPTY: Record<PastFilter, string> = {
  all: 'No past puzzles yet. Each day joins this list once the next one starts.',
  unsolved: "You've solved every past puzzle. Any of them can be played again from All.",
  solved: "None solved yet. They'll show here once you solve one.",
};

function statusText(row: PastRow): { text: string; label: string } {
  if (row.status === 'solved') return { text: 'Solved ✓', label: 'solved' };
  if (row.status === 'new') return { text: 'Play ›', label: 'not played' };
  const left = row.values ? cellsToGo(row.values) : 0;
  // Every cell filled but not solved: something's wrong on the board.
  return left ? { text: `${left} to go`, label: `${left} cells to go` } : { text: 'In progress', label: 'in progress' };
}

/** The board in miniature: givens in grey, your digits in blue, a solved one green. */
function paintThumb(thumb: HTMLElement, givens: string, row: PastRow): void {
  const g = parseGrid(givens);
  if (!g) return;
  const v = row.values ? parseGrid(row.values) : null;
  const solved = row.status === 'solved';
  thumb.classList.toggle('is-solved', solved);
  thumb.querySelectorAll('span').forEach((cell, c) => {
    cell.className = g[c] ? 'pt-given' : solved ? 'pt-done' : v?.[c] ? 'pt-mine' : '';
  });
}

/** Renders the list; returns a stop function for its lazy loading. */
export function renderPast(root: HTMLElement, d: PastData, a: PastActions): () => void {
  root.innerHTML = '';
  const { screen, sheet } = homeFrame(a);
  sheet.classList.add('past-sheet');

  const head = el('div', 'past-head');
  head.append(el('h2', 'past-title', 'Past puzzles'), button('subtle past-back', 'Back to today', a.back));
  sheet.appendChild(head);

  if (d.counts.all) {
    const chips = el('div', 'past-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Show');
    for (const [f, label] of CHIPS) {
      const chip = button(`chip chip-${f}${d.filter === f ? ' is-on' : ''}`, `${label} · ${d.counts[f]}`, () => a.filter(f));
      chip.setAttribute('aria-pressed', String(d.filter === f));
      chips.appendChild(chip);
    }
    sheet.appendChild(chips);
  }
  if (!d.days.length) sheet.appendChild(el('p', 'notice', EMPTY[d.filter]));

  // Givens load as their row comes within a screen or so of view.
  const loaders = new Map<Element, () => void>();
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              observer!.unobserve(e.target);
              loaders.get(e.target)?.();
              loaders.delete(e.target);
            }
          },
          { rootMargin: '400px 0px' }
        )
      : null;

  const list = el('ul', 'past-list');
  for (const n of d.days) {
    const tier = d.tierOf(n);
    const date = shortDate(n, d.today);
    const item = el('li');
    const row = button('past-row', '', () => a.open(n));
    const thumb = el('span', 'past-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < 81; c++) thumb.appendChild(el('span'));
    const titles = el('span', 'past-titles');
    const meta = el('span', 'past-meta');
    meta.append(el('span', 'past-date', date), el('span', `tier tier-${tier}`, TIER_NAME[tier]));
    titles.append(el('span', 'past-name', `Daily #${n + 1}`), meta);
    const status = el('span', 'past-status', '');
    row.append(thumb, titles, status);
    const label = `Daily #${n + 1}, ${date}, ${TIER_NAME[tier]}`;
    row.setAttribute('aria-label', label);

    let stored: PastRow | null = null;
    let givens: string | null = null;
    const paint = (): void => {
      if (stored && givens) paintThumb(thumb, givens, stored);
    };
    void d.rowOf(n).then((r) => {
      stored = r;
      const s = statusText(r);
      status.textContent = s.text;
      status.classList.add(`is-${r.status}`);
      row.setAttribute('aria-label', `${label}, ${s.label}`);
      paint();
    });
    const load = (): void => {
      void d.givensOf(n).then((g) => {
        givens = g;
        paint();
      });
    };
    if (observer) {
      loaders.set(thumb, load);
      observer.observe(thumb);
    } else load();

    item.appendChild(row);
    list.appendChild(item);
  }
  sheet.appendChild(list);
  if (d.more) sheet.appendChild(button('subtle past-more', 'Show older puzzles', a.more));

  root.appendChild(screen);
  return () => observer?.disconnect();
}
