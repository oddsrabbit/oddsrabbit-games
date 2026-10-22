// Words by length, the same look in both modes: a table on the start cards
// and a row of counters above the board while playing. Lengths of 8 and up
// share one "8+" column, as they share one score in classic Boggle.

import { el } from './ui';

const bucket = (word: string): number => Math.min(word.length, 8);
const label = (n: number): string => (n >= 8 ? '8+' : String(n));

/** How many words of each length, shortest first. */
export function lengthCounts(words: Iterable<string>): Array<[number, number]> {
  const counts = new Map<number, number>();
  for (const w of words) counts.set(bucket(w), (counts.get(bucket(w)) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0] - b[0]);
}

/** The start-card table: a cell per length, a big number under each. */
export function lengthTable(cells: Array<[number, number | string]>): HTMLElement {
  const table = el('div', 'points-table');
  table.style.setProperty('--n', String(cells.length));
  for (const [n, value] of cells) {
    const cell = el('div', 'points-cell');
    cell.append(el('span', 'points-len', label(n)), el('span', 'points-pts', String(value)));
    table.appendChild(cell);
  }
  return table;
}

/**
 * "Words left by length": one counter per length showing how many are still
 * to find, ticking down as words are found, a ✓ once that length is done.
 * The background fills from the bottom as the length gets found.
 */
export function fillLengthRow(row: HTMLElement, words: readonly string[], found: Iterable<string>): void {
  const have = new Map<number, number>();
  for (const w of found) have.set(bucket(w), (have.get(bucket(w)) ?? 0) + 1);
  row.innerHTML = '';
  for (const [n, total] of lengthCounts(words)) {
    const got = have.get(n) ?? 0;
    const pill = el('div', got >= total ? 'len-pill done' : 'len-pill');
    pill.title = `${n >= 8 ? '8 or more' : n} letters`;
    // The fill is the pill's whole background, rising from the bottom.
    pill.style.setProperty('--k', String(got / total));
    const left = total - got;
    pill.setAttribute('aria-label', left > 0 ? `${left} ${n >= 8 ? '8+' : n}-letter words left` : `All ${n >= 8 ? '8+' : n}-letter words found`);
    const count = el('span', 'len-count');
    count.appendChild(el('b', '', left > 0 ? String(left) : '✓'));
    pill.append(el('span', 'len-label', label(n)), count);
    row.appendChild(pill);
  }
}

export function lengthRow(): { caption: HTMLElement; row: HTMLElement } {
  return { caption: el('p', 'sprint-lengths-caption', 'Words left, by number of letters'), row: el('div', 'sprint-lengths') };
}
