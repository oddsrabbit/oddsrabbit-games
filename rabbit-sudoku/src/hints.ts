// What a hint says. The logic solver finds the step (logic.ts); this turns it
// into the two lines the player reads: where to look, then why.

import type { Step } from './logic';
import { colOf, rowOf } from './sudoku';

const unitName = (u: number): string => (u < 9 ? `row ${u + 1}` : u < 18 ? `column ${u - 8}` : `box ${u - 17}`);
const cellName = (c: number): string => `row ${rowOf(c) + 1}, column ${colOf(c) + 1}`;
const list = (items: readonly (string | number)[]): string =>
  items.length <= 1 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export interface HintCopy {
  /** Stage one: where to look, without giving it away. */
  look: string;
  /** Stage two: the reasoning, and what follows. */
  why: string;
}

export function hintCopy(step: Step): HintCopy {
  const d = step.digits[0] ?? 0;
  const ds = list(step.digits);
  const u0 = step.units[0];
  const u1 = step.units[1];
  const where = u0 !== undefined ? unitName(u0) : step.place ? cellName(step.place.cell) : 'the highlighted cells';
  const look = `Look at ${where}.`;

  switch (step.technique) {
    case 'full-house':
      return { look, why: `Only one cell is left empty in ${where}, so it must be the missing ${d}.` };
    case 'hidden-single':
      return { look: `Look for the ${d} in ${where}.`, why: `In ${where}, ${d} fits in only one cell. Every other empty cell there already sees a ${d}.` };
    case 'naked-single':
      return { look: 'Look at the highlighted cell.', why: `Every digit but ${d} is already in this cell's row, column or box, so it must be ${d}.` };
    case 'pointing':
      return {
        look: `Look at where ${d} can go in ${unitName(u0 ?? 18)}.`,
        why: `In ${unitName(u0 ?? 18)}, ${d} can only go in ${unitName(u1 ?? 0)}. So the rest of ${unitName(u1 ?? 0)} can't be ${d}.`,
      };
    case 'claiming':
      return {
        look: `Look at where ${d} can go in ${unitName(u0 ?? 0)}.`,
        why: `In ${unitName(u0 ?? 0)}, ${d} only fits inside ${unitName(u1 ?? 18)}. So no other cell in ${unitName(u1 ?? 18)} can be ${d}.`,
      };
    case 'naked-pair':
    case 'naked-triple': {
      const n = step.cells.length === 2 ? 'two' : 'three';
      return {
        look: `Look at the ${n} highlighted cells in ${where}.`,
        why: `These ${n} cells can only hold ${ds} between them, so no other cell in ${where} can be ${ds}.`,
      };
    }
    case 'hidden-pair':
    case 'hidden-triple': {
      const n = step.cells.length === 2 ? 'two' : 'three';
      return {
        look: `Look at where ${ds} can go in ${where}.`,
        why: `In ${where}, ${ds} fit only in these ${n} cells, so those cells can't hold anything else.`,
      };
    }
    case 'x-wing':
    case 'swordfish': {
      const lines = step.units.map(unitName);
      const across = (step.units[0] ?? 0) < 9 ? 'columns' : 'rows';
      const name = step.technique === 'x-wing' ? 'X-Wing' : 'Swordfish';
      return {
        look: `Look at where ${d} can go in ${list(lines)}.`,
        why: `${name}: in ${list(lines)}, ${d} fits only in the same ${step.units.length} ${across}. One ${d} per line has to use them, so ${d} can't go anywhere else in those ${across}.`,
      };
    }
    case 'xy-wing':
      return {
        look: 'Look at the three highlighted cells.',
        why: `XY-Wing: whichever digit the middle cell takes, one of the two outer cells ends up ${step.digits[step.digits.length - 1]}, so a cell that sees both outer cells can't be.`,
      };
    case 'xyz-wing':
      return {
        look: 'Look at the three highlighted cells.',
        why: 'XYZ-Wing: one of these three cells has to be the digit they all share, so a cell that sees all three can\'t be it.',
      };
    case 'skyscraper':
    case 'two-string-kite': {
      const name = step.technique === 'skyscraper' ? 'Skyscraper' : '2-String Kite';
      return {
        look: `Look at the four cells where ${d} can go.`,
        why: `${name}: ${d} has only two spots in each highlighted line, and two of those spots can't both be ${d}. So one of the far ends is ${d}, and a cell that sees both ends can't be.`,
      };
    }
    case 'simple-colouring':
      return {
        look: `Follow the cells where ${d} has only two spots.`,
        why: `Colouring: along this chain the ${d}s alternate, so every other cell is ${d}. The marked cells can't be ${d} either way.`,
      };
  }
}
