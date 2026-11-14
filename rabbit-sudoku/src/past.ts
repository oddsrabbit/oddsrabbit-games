// The Past puzzles screen: every earlier Daily, newest first, each with its
// difficulty and whether you've solved it. Opened from home; a row opens that
// day as practice (main.ts, playArchive). Statuses arrive a moment after the
// rows, from storage.

import { archiveDate, type PastStatus } from './archive';
import type { Tier } from './grade';
import { TIER_NAME } from './home';
import { button, el } from './ui';

export interface PastData {
  /** The days to list, newest first. */
  days: number[];
  /** There are older days than these. */
  more: boolean;
  tierOf(n: number): Tier;
  statusOf(n: number): Promise<PastStatus>;
}

export interface PastActions {
  open(n: number): void;
  back(): void;
  /** List another page of older days. */
  more(): void;
}

const STATUS_TEXT: Record<PastStatus, string> = { solved: '✓ Solved', progress: 'In progress', new: 'Play ›' };

export function renderPast(root: HTMLElement, d: PastData, a: PastActions): void {
  root.innerHTML = '';
  const bar = el('header', 'bar');
  bar.append(el('h1', 'title', 'Past puzzles'), button('icon-button', '✕', a.back, 'Back home'));

  const main = el('main', 'past');
  main.appendChild(el('p', 'past-intro muted', "Every earlier Daily, to catch up on or play again. They're practice: no scores, and your streak stays as it is."));
  if (!d.days.length) main.appendChild(el('p', 'notice', 'No past puzzles yet. Each day joins this list once the next one starts.'));

  const list = el('ul', 'past-list');
  for (const n of d.days) {
    const tier = d.tierOf(n);
    const item = el('li');
    const row = button('past-row', '', () => a.open(n));
    const titles = el('span', 'past-titles');
    titles.append(el('span', 'past-name', `Daily #${n + 1}`), el('span', 'past-date', archiveDate(n)));
    const status = el('span', 'past-status', '');
    row.append(titles, el('span', `tier tier-${tier}`, TIER_NAME[tier]), status);
    row.setAttribute('aria-label', `Daily #${n + 1}, ${archiveDate(n)}, ${TIER_NAME[tier]}`);
    void d.statusOf(n).then((s) => {
      status.textContent = STATUS_TEXT[s];
      status.classList.add(`is-${s}`);
      row.setAttribute('aria-label', `${row.getAttribute('aria-label')}, ${s === 'solved' ? 'solved' : s === 'progress' ? 'in progress' : 'not played'}`);
    });
    item.appendChild(row);
    list.appendChild(item);
  }
  main.appendChild(list);
  if (d.more) main.appendChild(button('subtle past-more', 'Show older puzzles', a.more));

  root.append(bar, main);
}
