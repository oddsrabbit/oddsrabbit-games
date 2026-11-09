// The play screen: the grid, the tools and the row-of-nine pad, notes, undo,
// three-step hints, saving as you go, and the solve. No clock: it's a calm daily.

import { hintCopy } from './hints';
import { nextStep, stateFrom, type Step } from './logic';
import type { Settings } from './settings';
import { solve } from './solver';
import { bit, duplicateCells, formatGrid, isSolved, parseGrid, PEERS, rowOf, colOf, UNITS, unitsOf, type Grid } from './sudoku';
import { button, el, haptic } from './ui';

/** A puzzle in progress, as saved. */
export interface SavedPlay {
  values: string;
  notes: number[];
  hints: number;
  solved: boolean;
}

export interface PlayOptions {
  /** Header title, e.g. "Daily #7". */
  title: string;
  /** The difficulty, for the chip beside the title, e.g. "Medium". */
  tier: string;
  givens: string;
  saved: SavedPlay | null;
  settings: Settings;
  save(state: SavedPlay): void;
  solved(state: SavedPlay): void;
  exit(): void;
}

export interface PlayScreen {
  /** Save now, e.g. when the app goes to the background. */
  flush(): void;
  dispose(): void;
}

type Hint =
  | { kind: 'step'; step: Step; stage: 1 | 2 }
  | { kind: 'wrong'; cells: number[]; stage: 1 | 2 };

export function mountPlay(root: HTMLElement, o: PlayOptions): PlayScreen {
  const givens = parseGrid(o.givens)!;
  let values: Grid = (o.saved && parseGrid(o.saved.values)) || givens.slice();
  let notes: number[] = o.saved?.notes?.length === 81 ? o.saved.notes.slice() : new Array<number>(81).fill(0);
  let hints = o.saved?.hints ?? 0;
  let solvedNow = o.saved?.solved ?? false;
  let solution: Grid | null = null;
  const answer = (): Grid => (solution ??= solve(givens)!);

  let selected = -1;
  let activeDigit = 0;
  let noteMode = false;
  let hint: Hint | null = null;
  const undo: { values: Grid; notes: number[] }[] = [];

  const state = (): SavedPlay => ({ values: formatGrid(values), notes: notes.slice(), hints, solved: solvedNow });
  const persist = (): void => o.save(state());

  // ---------- DOM ----------
  root.innerHTML = '';
  const bar = el('header', 'bar');
  const tierChip = el('span', `tier tier-${o.tier.toLowerCase()}`, o.tier);
  bar.append(el('h1', 'title', o.title), tierChip, button('icon-button', '✕', () => o.exit(), 'Back home'));

  const main = el('main', 'play');
  const board = el('div', 'board');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Sudoku grid');
  const cells: HTMLButtonElement[] = [];
  for (let c = 0; c < 81; c++) {
    const b = el('button', 'cell');
    b.type = 'button';
    b.addEventListener('click', () => onCell(c));
    cells.push(b);
    board.appendChild(b);
  }

  const hintBox = el('div', 'hintbox');
  hintBox.setAttribute('role', 'status');
  const hintText = el('p', 'hint-text');
  const hintNext = button('primary small', 'Why?', () => advanceHint());
  const hintClose = button('icon-button', '✕', () => {
    hint = null;
    render();
  }, 'Close the hint');
  hintBox.append(hintText, el('div', 'hint-actions'));
  hintBox.lastElementChild!.append(hintNext, hintClose);

  const tools = el('div', 'tools');
  const undoBtn = button('tool', 'Undo', () => onUndo());
  const eraseBtn = button('tool', 'Erase', () => onErase());
  const notesBtn = button('tool', 'Notes', () => {
    noteMode = !noteMode;
    render();
  });
  const hintBtn = button('tool', 'Hint', () => startHint());
  tools.append(undoBtn, eraseBtn, notesBtn, hintBtn);

  const pad = el('div', 'pad');
  const keys: HTMLButtonElement[] = [];
  for (let d = 1; d <= 9; d++) {
    const k = el('button', 'key');
    k.type = 'button';
    k.addEventListener('click', () => onDigit(d));
    keys.push(k);
    pad.appendChild(k);
  }

  main.append(board, hintBox, tools, pad);
  root.append(bar, main);

  // ---------- moves ----------
  const remember = (): void => {
    undo.push({ values: values.slice(), notes: notes.slice() });
    if (undo.length > 200) undo.shift();
  };

  function sweepFinished(cell: number): void {
    for (const u of unitsOf(cell)) {
      const unit = UNITS[u]!;
      if (!unit.every((c) => values[c])) continue;
      if (new Set(unit.map((c) => values[c])).size !== 9) continue;
      unit.forEach((c, i) => {
        const node = cells[c]!;
        node.classList.remove('sweep');
        node.style.animationDelay = `${i * 30}ms`;
        void node.offsetWidth;
        node.classList.add('sweep');
      });
    }
  }

  function put(cell: number, d: number): void {
    if (solvedNow || cell < 0 || givens[cell]) return;
    if (noteMode && d) {
      if (values[cell]) return;
      remember();
      notes[cell] = notes[cell]! ^ bit(d);
      haptic('light');
    } else {
      remember();
      // Digit-first: the same digit again takes it back out.
      values[cell] = o.settings.digitFirst && values[cell] === d ? 0 : d;
      notes[cell] = 0;
      if (values[cell] && o.settings.autoNotes) for (const p of PEERS[cell]!) notes[p] = notes[p]! & ~bit(d);
      if (values[cell]) {
        const clash = o.settings.flagRepeats && duplicateCells(values).includes(cell);
        haptic(clash ? 'error' : 'light');
        sweepFinished(cell);
      }
    }
    hint = null;
    afterMove();
  }

  function afterMove(): void {
    if (isSolved(values)) {
      solvedNow = true;
      selected = -1;
      haptic('success');
      render();
      persist();
      o.solved(state());
      return;
    }
    render();
    persist();
  }

  function onCell(c: number): void {
    if (o.settings.digitFirst) {
      if (values[c] && (givens[c] || values[c] !== activeDigit)) activeDigit = values[c]!;
      else if (activeDigit) put(c, activeDigit);
      selected = c;
    } else {
      selected = c;
    }
    render();
  }

  function onDigit(d: number): void {
    if (o.settings.digitFirst) {
      activeDigit = activeDigit === d ? 0 : d;
      render();
    } else {
      put(selected, d);
    }
  }

  function onErase(): void {
    if (solvedNow || selected < 0 || givens[selected] || (!values[selected] && !notes[selected])) return;
    remember();
    values[selected] = 0;
    notes[selected] = 0;
    hint = null;
    afterMove();
  }

  function onUndo(): void {
    const last = undo.pop();
    if (!last || solvedNow) return;
    ({ values, notes } = last);
    hint = null;
    afterMove();
  }

  // ---------- hints ----------
  function startHint(): void {
    if (solvedNow) return;
    if (hint) {
      advanceHint();
      return;
    }
    hints++;
    const wrong = values.flatMap((v, i) => (v && !givens[i] && v !== answer()[i] ? [i] : []));
    if (wrong.length) {
      hint = { kind: 'wrong', cells: wrong, stage: 1 };
    } else {
      const step = nextStep(stateFrom(values));
      if (!step) return;
      hint = { kind: 'step', step, stage: 1 };
    }
    render();
    persist();
  }

  function advanceHint(): void {
    if (!hint) return;
    if (hint.stage === 1) {
      hint.stage = 2;
      render();
      return;
    }
    if (hint.kind === 'wrong') {
      // Point at it; fixing it is the player's.
      selected = hint.cells[0]!;
      hint = null;
      render();
      return;
    }
    // Stage two's button applies the step.
    const { step } = hint;
    remember();
    if (step.place) {
      const { cell, digit } = step.place;
      values[cell] = digit;
      notes[cell] = 0;
      if (o.settings.autoNotes) for (const p of PEERS[cell]!) notes[p] = notes[p]! & ~bit(digit);
      sweepFinished(cell);
    }
    if (step.eliminate.length) {
      // A player without notes there gets the cell's real candidates first,
      // so the removal shows.
      const cands = stateFrom(values).cands;
      for (const e of step.eliminate) {
        if (!notes[e.cell]) notes[e.cell] = cands[e.cell]!;
        notes[e.cell] = notes[e.cell]! & ~bit(e.digit);
      }
    }
    hint = null;
    afterMove();
  }

  // ---------- drawing ----------
  function render(): void {
    const dupes = new Set(o.settings.flagRepeats ? duplicateCells(values) : []);
    const focus = o.settings.digitFirst ? activeDigit : values[selected] ?? 0;
    const peers = new Set(!o.settings.digitFirst && selected >= 0 ? PEERS[selected] : []);
    const wrong = o.settings.showMistakes ? new Set(values.flatMap((v, i) => (v && !givens[i] && v !== answer()[i] ? [i] : []))) : null;

    const hintCells = new Set<number>();
    const hintUnit = new Set<number>();
    const hintElim = new Set<number>();
    if (hint?.kind === 'step') {
      for (const u of hint.step.units) for (const c of UNITS[u]!) hintUnit.add(c);
      if (hint.stage === 2 || !hint.step.units.length) for (const c of hint.step.cells) hintCells.add(c);
      if (hint.stage === 2) {
        for (const e of hint.step.eliminate) hintElim.add(e.cell);
        if (hint.step.place) hintCells.add(hint.step.place.cell);
      }
    } else if (hint?.kind === 'wrong' && hint.stage === 2) {
      for (const c of hint.cells) hintElim.add(c);
    }

    for (let c = 0; c < 81; c++) {
      const node = cells[c]!;
      const v = values[c]!;
      const cls = ['cell'];
      if (colOf(c) % 3 === 2 && colOf(c) < 8) cls.push('br');
      if (rowOf(c) % 3 === 2 && rowOf(c) < 8) cls.push('bb');
      if (givens[c]) cls.push('given');
      else if (v) cls.push('entered');
      if (c === selected) cls.push('sel');
      else if (peers.has(c)) cls.push('peer');
      if (focus && v === focus) cls.push('same');
      if (dupes.has(c) && !givens[c]) cls.push('dupe');
      if (wrong?.has(c)) cls.push('wrong');
      if (hintUnit.has(c)) cls.push('hint-unit');
      if (hintCells.has(c)) cls.push('hint-cell');
      if (hintElim.has(c)) cls.push('hint-elim');
      if (solvedNow) cls.push('done');
      const keep = node.classList.contains('sweep') ? ' sweep' : '';
      node.className = cls.join(' ') + keep;

      const where = `Row ${rowOf(c) + 1}, column ${colOf(c) + 1}`;
      if (v) {
        node.textContent = String(v);
        node.setAttribute('aria-label', `${where}, ${v}${givens[c] ? ', given' : ''}`);
      } else {
        node.textContent = '';
        node.setAttribute('aria-label', `${where}, empty`);
        if (notes[c]) {
          const grid = el('span', 'notes');
          for (let d = 1; d <= 9; d++) {
            const n = el('span', focus === d && notes[c]! & bit(d) ? 'on' : '', notes[c]! & bit(d) ? String(d) : '');
            grid.appendChild(n);
          }
          node.appendChild(grid);
        }
      }
    }

    keys.forEach((k, i) => {
      const d = i + 1;
      const left = 9 - values.filter((v) => v === d).length;
      k.innerHTML = '';
      k.append(el('span', 'key-digit', String(d)), el('span', 'key-left', left > 0 ? String(left) : ''));
      k.disabled = solvedNow || (left <= 0 && !noteMode);
      k.classList.toggle('active', o.settings.digitFirst && activeDigit === d);
      k.setAttribute('aria-label', `${d}, ${left} left`);
    });
    pad.classList.toggle('notes-mode', noteMode);
    notesBtn.classList.toggle('on', noteMode);
    notesBtn.textContent = noteMode ? 'Notes on' : 'Notes';
    notesBtn.setAttribute('aria-pressed', String(noteMode));
    for (const b of [undoBtn, eraseBtn, notesBtn, hintBtn]) b.disabled = solvedNow;

    hintBox.hidden = !hint;
    if (hint) {
      if (hint.kind === 'wrong') {
        hintText.textContent = hint.stage === 1 ? "One of your digits doesn't fit. Want to see which?" : "It's marked. Fix it and keep going.";
        hintNext.textContent = hint.stage === 1 ? 'Show me' : 'OK';
      } else {
        const copy = hintCopy(hint.step);
        hintText.textContent = hint.stage === 1 ? copy.look : copy.why;
        hintNext.textContent = hint.stage === 1 ? 'Why?' : 'Do it';
      }
    }
  }

  // ---------- keys ----------
  const onVisibility = (): void => {
    if (document.hidden) persist();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onKey = (e: KeyboardEvent): void => {
    if (document.documentElement.hasAttribute('data-sheet')) return;
    if (/^[1-9]$/.test(e.key)) onDigit(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') onErase();
    else if (e.key === 'n' || e.key === 'N') notesBtn.click();
    else if (e.key === 'z' || e.key === 'Z') onUndo();
    else if (e.key.startsWith('Arrow')) {
      const move = ({ ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[e.key] ?? 0;
      selected = selected < 0 ? 40 : Math.min(80, Math.max(0, selected + move));
      render();
    } else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  render();

  return {
    flush: persist,
    dispose(): void {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
      persist();
    },
  };
}
