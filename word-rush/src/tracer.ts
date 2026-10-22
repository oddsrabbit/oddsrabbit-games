// The letter grid and how words are traced on it, shared by both modes.
//
// Drag to trace, release to submit. Tapping works too: tap tiles one by one
// and tap the last one again to submit. A drag that adds tiles always submits
// on release; a press that adds none leaves the taps pending. On a keyboard,
// typed letters are traced on the board as they're typed, and Enter submits.

import { findPath, isAdjacent, wordForPath, type Board } from './board';
import { playTrace } from './sound';
import { el, haptic } from './ui';

export type Tone = 'good' | 'bonus' | 'star' | 'bad' | 'info';

/**
 * What the word being traced is right now, so the tiles can light up before
 * the finger lifts: `new` (a word that would score), `bonus` (a casual bonus
 * word), `had` (already found) or `none`.
 */
export type TraceState = 'new' | 'bonus' | 'had' | 'none';

/** One paw print, centred on 0,0, toes pointing up (-y). */
const PAW =
  '<ellipse cx="0" cy="4" rx="7" ry="6"/><ellipse cx="-7" cy="-5" rx="2.6" ry="3.4"/><ellipse cx="-2.4" cy="-9" rx="2.6" ry="3.4"/><ellipse cx="2.4" cy="-9" rx="2.6" ry="3.4"/><ellipse cx="7" cy="-5" rx="2.6" ry="3.4"/>';

export interface Tracer {
  /** The word being traced, or the verdict on the last one. */
  wordLine: HTMLElement;
  grid: HTMLElement;
  /** Handle a key press; true when it was the tracer's. */
  key(e: KeyboardEvent): boolean;
  flashLine(text: string, tone: Tone): void;
  flashTiles(tiles: number[], tone: 'good' | 'bonus' | 'bad'): void;
  /** Small numbers in the tile corners (hints), or null to clear them. Zero dims a tile. */
  setCounts(counts: number[] | null): void;
  setEnabled(on: boolean): void;
  clear(): void;
}

export function createTracer(
  board: Board,
  onWord: (path: number[], word: string) => void,
  judge: (word: string) => TraceState = () => 'none'
): Tracer {
  const wordLine = el('div', 'word-line');
  wordLine.setAttribute('aria-live', 'polite');
  const grid = el('div', 'grid');
  grid.style.setProperty('--cols', String(board.cols));
  grid.style.setProperty('--rows', String(board.rows));
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Letter grid. Drag across touching letters to spell a word.');

  const tiles = board.tiles.map((text, i) => {
    const tile = el('div', text === null ? 'tile hole' : 'tile');
    tile.dataset.i = String(i);
    if (text !== null) tile.append(el('span', 'tile-letter', text === 'QU' ? 'Qu' : text), el('span', 'tile-count'));
    grid.appendChild(tile);
    return tile;
  });
  // The trail is paw prints hopping from tile to tile, not a line: two prints
  // per hop, left and right of the line of travel, pointing the way.
  const svgNs = 'http://www.w3.org/2000/svg';
  const trail = document.createElementNS(svgNs, 'svg');
  trail.setAttribute('class', 'trail');
  trail.setAttribute('viewBox', `0 0 ${board.cols * 100} ${board.rows * 100}`);
  trail.setAttribute('aria-hidden', 'true');
  trail.innerHTML = `<defs><g id="paw">${PAW}</g></defs>`;
  const prints = document.createElementNS(svgNs, 'g');
  trail.appendChild(prints);
  grid.appendChild(trail);

  const centre = (i: number): [number, number] => [(i % board.cols) * 100 + 50, Math.floor(i / board.cols) * 100 + 50];
  const drawPrints = (route: number[]): void => {
    let out = '';
    for (let k = 1; k < route.length; k++) {
      const [x0, y0] = centre(route[k - 1]!);
      const [x1, y1] = centre(route[k]!);
      const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI + 90;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      [0.36, 0.64].forEach((t, j) => {
        const side = j === 0 ? -9 : 9;
        const x = x0 + (x1 - x0) * t + nx * side;
        const y = y0 + (y1 - y0) * t + ny * side;
        out += `<use href="#paw" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(0)})" class="${k === route.length - 1 ? 'paw fresh' : 'paw'}"/>`;
      });
    }
    prints.innerHTML = out;
  };

  let path: number[] = [];
  let typed = '';
  let enabled = true;
  let lineTimer: number | undefined;

  const hitTile = (clientX: number, clientY: number, strict: boolean): number | null => {
    const rect = grid.getBoundingClientRect();
    const cw = rect.width / board.cols;
    const ch = rect.height / board.rows;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.floor(x / cw);
    const r = Math.floor(y / ch);
    if (c < 0 || r < 0 || c >= board.cols || r >= board.rows) return null;
    const i = r * board.cols + c;
    if (board.tiles[i] === null) return null;
    if (strict) {
      // Mid-drag, a tile only counts near its centre, so cutting a diagonal
      // past a neighbour's corner doesn't pick the neighbour up.
      const dx = x - (c + 0.5) * cw;
      const dy = y - (r + 0.5) * ch;
      const radius = 0.4 * Math.min(cw, ch);
      if (dx * dx + dy * dy > radius * radius) return null;
    }
    return i;
  };

  const show = (): void => {
    const route = typed ? findPath(board, typed) ?? [] : path;
    const on = new Set(route);
    tiles.forEach((tile, i) => tile.classList.toggle('on', on.has(i)));
    drawPrints(route);
    const word = typed || wordForPath(board, path);
    grid.dataset.trace = word && route.length > 0 ? judge(word) : 'none';
    if (word) {
      window.clearTimeout(lineTimer);
      wordLine.className = typed && route.length === 0 ? 'word-line typing missing' : 'word-line typing';
      wordLine.textContent = word;
    } else if (wordLine.classList.contains('typing')) {
      wordLine.className = 'word-line';
      wordLine.textContent = '';
    }
  };

  const submit = (): void => {
    const traced = path.slice();
    const word = wordForPath(board, traced);
    path = [];
    typed = '';
    show();
    if (traced.length >= 2) onWord(traced, word);
  };

  let dragging = false;
  let added = 0;

  grid.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    const t = hitTile(e.clientX, e.clientY, false);
    if (t === null) return;
    e.preventDefault();
    typed = '';
    grid.setPointerCapture(e.pointerId);
    dragging = true;
    added = 0;
    const last = path[path.length - 1];
    if (last === t && path.length > 0) {
      dragging = false;
      submit();
      return;
    }
    const at = path.indexOf(t);
    if (at >= 0) path = path.slice(0, at + 1);
    else if (last !== undefined && isAdjacent(board, last, t)) path.push(t);
    else path = [t];
    haptic('light');
    playTrace(path.length);
    show();
  });

  grid.addEventListener('pointermove', (e) => {
    if (!dragging || !enabled) return;
    const t = hitTile(e.clientX, e.clientY, true);
    if (t === null) return;
    const last = path[path.length - 1];
    if (t === last) return;
    if (path.length >= 2 && path[path.length - 2] === t) {
      path.pop();
      added = Math.max(0, added - 1);
      show();
      return;
    }
    if (last !== undefined && !path.includes(t) && isAdjacent(board, last, t)) {
      path.push(t);
      added++;
      haptic('light');
      playTrace(path.length);
      show();
    }
  });

  grid.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (added > 0 && enabled) submit();
  });
  grid.addEventListener('pointercancel', () => {
    dragging = false;
  });

  const clear = (): void => {
    path = [];
    typed = '';
    show();
  };

  return {
    wordLine,
    grid,
    key(e) {
      if (!enabled || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (/^[a-zA-Z]$/.test(e.key)) {
        path = [];
        typed = (typed + e.key.toUpperCase()).slice(0, 25);
        playTrace(typed.length);
        show();
        return true;
      }
      if (e.key === 'Backspace' && typed) {
        typed = typed.slice(0, -1);
        show();
        return true;
      }
      if (e.key === 'Enter' && typed) {
        const route = findPath(board, typed);
        if (route) {
          path = route;
          submit();
        } else {
          this.flashLine('Not on the board', 'bad');
          typed = '';
          show();
        }
        return true;
      }
      if (e.key === 'Escape' && (typed || path.length)) {
        clear();
        return true;
      }
      return false;
    },
    flashLine(text, tone) {
      window.clearTimeout(lineTimer);
      wordLine.className = `word-line ${tone}`;
      wordLine.textContent = text;
      lineTimer = window.setTimeout(() => {
        wordLine.className = 'word-line';
        wordLine.textContent = '';
      }, 1600);
    },
    flashTiles(list, tone) {
      for (const i of list) {
        const tile = tiles[i];
        if (!tile) continue;
        tile.classList.remove('flash-good', 'flash-bonus', 'flash-bad');
        void tile.offsetWidth;
        tile.classList.add(`flash-${tone}`);
      }
    },
    setCounts(counts) {
      tiles.forEach((tile, i) => {
        const badge = tile.querySelector<HTMLElement>('.tile-count');
        if (!badge) return;
        const n = counts?.[i] ?? 0;
        badge.textContent = counts && n > 0 ? String(n) : '';
        tile.classList.toggle('dead', !!counts && n === 0);
      });
    },
    setEnabled(on) {
      enabled = on;
      grid.classList.toggle('disabled', !on);
      if (!on) clear();
    },
    clear,
  };
}
