// The home screen, in Word Battle's frame: a band of grid art under the status
// bar, a sheet pulled up over it, and today's puzzle as the spotlight card
// (a thumbnail of the grid, the streak, Play). Then the week and friends.

import type { Tier } from './grade';
import { parseGrid } from './sudoku';
import { button, el } from './ui';

export type PlayState = 'new' | 'progress' | 'solved';

export interface Solvers {
  friends: string[] | null;
  total: number | null;
}

export interface HomeData {
  index: number;
  /** e.g. "Thursday". */
  weekday: string;
  tier: Tier;
  /** Today's puzzle, for the thumbnail. */
  givens: string;
  signedIn: boolean;
  /** The host can raise its sign-in prompt (web; the app has no guests). */
  canSignIn: boolean;
  state: PlayState;
  streak: number;
  best: number;
  /** Monday to Sunday of this week. */
  week: { label: string; tier: Tier; solved: boolean; today: boolean; future: boolean }[];
  /**
   * Who has solved today's: friends' names (null with no friends list here)
   * and how many players in all (null when the host can't say). Null when
   * there's neither.
   */
  solvers: Promise<Solvers> | null;
  /** Opens the board of who solved it; null when this host has none. */
  board: (() => void) | null;
  /** Milliseconds until the next puzzle. */
  nextIn: () => number;
}

export interface HomeActions {
  play(): void;
  signIn(): void;
  settings(): void;
  help(): void;
  /** The countdown reached zero: today's puzzle is over. */
  expired(): void;
}

export const TIER_NAME: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

/**
 * A slice of a sudoku board running up under the status bar, in the icon's
 * rust: rust cells, darker lines, the thick 3×3 box lines, faint clues and a
 * couple of the player's digits in pale yellow. Nothing selected. Anchored to
 * the bottom, so a taller safe area crops the top. Static markup; the colours
 * are in styles.css.
 */
const BAND_SVG = (() => {
  const S = 40;
  const TOP = -10; // the first row starts above the view, as if the board ran on
  // Rows 1–2 stay clear behind the header (the host's back button on the
  // left, the buttons on the right), and the middle of row 3 behind the title.
  const given: Record<string, string> = { '0,0': '3', '5,0': '6', '8,3': '1', '3,4': '9', '1,4': '7', '8,4': '4' };
  const mine: Record<string, string> = { '0,3': '4', '7,3': '8', '2,4': '2' };
  let out = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${c},${r}`;
      const x = c * S + 0.5;
      const y = TOP + r * S + 0.5;
      out += `<rect class="${given[key] ? 'b-given' : 'b-cell'}" x="${x}" y="${y}" width="${S - 1}" height="${S - 1}"/>`;
      const cx = x + (S - 1) / 2;
      const cy = y + (S - 1) / 2;
      if (given[key]) out += `<text class="b-digit" x="${cx}" y="${cy}">${given[key]}</text>`;
      if (mine[key]) out += `<text class="b-digit b-mine" x="${cx}" y="${cy}">${mine[key]}</text>`;
    }
  }
  // The box lines: two down, one across.
  out += `<path class="b-box" d="M120 0V190M240 0V190M0 ${TOP + 3 * S}H360"/>`;
  // 360×190 is about the band's shape in the app (with its status bar); on
  // the web the band is shorter and the top crops away.
  return `<svg viewBox="0 0 360 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${out}</svg>`;
})();

/** The icon's rabbit ears, peeking over the title card. */
const EARS_SVG = (() => {
  const ear = (x: number, rot: number): string =>
    `<g transform="translate(${x} 44) rotate(${rot})"><ellipse class="ear" rx="14" ry="38"/><ellipse class="ear-in" cy="5" rx="6" ry="26"/></g>`;
  return `<svg class="brand-ears" viewBox="0 0 104 64" aria-hidden="true">${ear(34, -12)}${ear(70, 12)}</svg>`;
})();

/** Up to three names in full; past that, the first two and a count. */
export function friendsLine(names: string[]): string {
  if (!names.length) return 'None of your friends has solved it yet.';
  if (names.length === 1) return `${names[0]} solved it.`;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} solved it.`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more friends solved it.`;
}

/** "1 player has solved it today." / "42 players have…"; "Nobody…" at none. */
export function totalLine(total: number): string {
  if (total <= 0) return 'Nobody has solved it yet. Be the first.';
  return total === 1 ? '1 player has solved it today.' : `${total.toLocaleString('en-US')} players have solved it today.`;
}

/** `05:12:33` until the next puzzle. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function thumbnail(givens: string): HTMLElement {
  const board = el('div', 'spot-board');
  board.setAttribute('aria-hidden', 'true');
  const grid = parseGrid(givens) ?? [];
  grid.forEach((d, c) => {
    const cell = el('span', `pv${d ? ' pv-given' : ''}`, d ? String(d) : '');
    if (c % 9 === 2 || c % 9 === 5) cell.classList.add('pv-br');
    if (Math.floor(c / 9) === 2 || Math.floor(c / 9) === 5) cell.classList.add('pv-bb');
    board.appendChild(cell);
  });
  return board;
}

function scoreCell(label: string, value: string, end = false): HTMLElement {
  const cell = el('div', `score-cell${end ? ' is-end' : ''}`);
  cell.append(el('span', 'score-label', label), el('span', 'score-num', value));
  return cell;
}

/** Renders home; returns a stop function for its countdown. */
export function renderHome(root: HTMLElement, d: HomeData, a: HomeActions): () => void {
  root.innerHTML = '';
  const screen = el('div', 'screen-home');

  const band = el('div', 'band');
  band.innerHTML = BAND_SVG;
  const bar = el('header', 'bar');
  const brand = el('h1', 'brand');
  brand.append(el('span', 'brand-rabbit', 'Rabbit'), el('span', 'brand-sudoku', 'Sudoku'));
  const ears = el('span', 'brand-ears-wrap');
  ears.innerHTML = EARS_SVG;
  // The ears first, so the card covers their bottoms.
  bar.append(ears, brand, el('span', 'bar-space'), button('icon-button', '?', a.help, 'How to play'), button('icon-button', '⚙', a.settings, 'Settings'));

  const sheet = el('main', 'home-sheet');

  // ----- today's puzzle -----
  const spot = el('section', 'spotlight');
  const spotHead = el('div', 'spot-head');
  const titles = el('div', 'spot-titles');
  const kicker = d.state === 'solved' ? `Solved · ${d.weekday}` : `Today · ${d.weekday}`;
  titles.append(el('span', `spot-kicker${d.state === 'solved' ? ' is-done' : ''}`, kicker), el('span', 'spot-name', `Daily #${d.index + 1}`));
  spotHead.append(titles, el('span', `tier tier-${d.tier}`, TIER_NAME[d.tier]));
  spot.append(spotHead, thumbnail(d.givens));

  let stop = (): void => undefined;
  // Guests get the same daily and streak, kept in this browser; the note asks
  // them to sign up so the streak follows them (main.ts, play()).
  const scores = el('div', 'spot-scores');
  const thisWeek = d.week.filter((w) => w.solved).length;
  scores.append(scoreCell('Streak', String(d.streak)), scoreCell('Best', String(Math.max(d.best, d.streak))), scoreCell('This week', `${thisWeek}/7`, true));
  spot.appendChild(scores);
  const label = d.state === 'solved' ? 'See your solve' : d.state === 'progress' ? 'Continue' : 'Play';
  spot.appendChild(button(`primary big${d.state === 'solved' ? ' is-done' : ''}`, label, a.play));
  if (!d.signedIn && d.canSignIn) {
    const note = el('p', 'spot-note spot-guest', 'Playing as a guest: your streak is saved on this device only. ');
    const link = button('link-button', 'Sign up to keep it', a.signIn);
    note.appendChild(link);
    spot.appendChild(note);
  }

  // Ticks every second, signed in or not.
  const clock = el('p', 'spot-clock');
  const time = el('b', 'spot-clock-time', countdown(d.nextIn()));
  clock.append(d.state === 'solved' ? 'Next puzzle in ' : 'New puzzle in ', time);
  spot.appendChild(clock);
  let fired = false;
  const timer = window.setInterval(() => {
    const left = d.nextIn();
    time.textContent = countdown(left);
    if (left <= 0 && !fired) {
      fired = true;
      a.expired();
    }
  }, 1000);
  stop = () => window.clearInterval(timer);

  sheet.append(spot);

  // ----- the week and friends -----
  sheet.appendChild(el('h2', 'group-title', 'This week'));
  const week = el('div', 'week');
  for (const day of d.week) {
    const mark = el('div', `day tier-${day.tier}${day.solved ? ' is-solved' : ''}${day.today ? ' is-today' : ''}${day.future ? ' is-future' : ''}`);
    mark.setAttribute('aria-label', `${day.label}, ${TIER_NAME[day.tier]}${day.solved ? ', solved' : ''}`);
    mark.append(el('span', 'day-label', day.label), el('span', 'day-mark', day.solved ? '✓' : ''));
    week.appendChild(mark);
  }
  sheet.appendChild(week);
  if (d.solvers) {
    // A card: friends first (the names you know), then the whole field. Tap
    // for the full list.
    const card = d.board ? button('notice solvers', '', d.board) : el('div', 'notice solvers');
    const lines = el('span', 'solvers-lines');
    const first = el('span', 'solvers-main', ' ');
    const second = el('span', 'solvers-sub muted');
    lines.append(first, second);
    card.appendChild(lines);
    if (d.board) {
      card.setAttribute('aria-label', 'See who solved it');
      card.appendChild(el('span', 'solvers-more', 'See all ›'));
    }
    sheet.appendChild(card);
    void d.solvers.then(({ friends, total }) => {
      if (friends) {
        first.textContent = friendsLine(friends);
        if (total !== null && total > 0) second.textContent = totalLine(total);
      } else if (total !== null) first.textContent = totalLine(total);
      else card.remove();
      if (d.board) card.setAttribute('aria-label', `${first.textContent} ${second.textContent} See who solved it.`.trim());
    });
  }
  sheet.appendChild(el('p', 'foot muted', 'A new puzzle every day at midnight UTC: easy on Monday, hardest on Saturday.'));

  screen.append(band, bar, sheet);
  root.appendChild(screen);
  return stop;
}
