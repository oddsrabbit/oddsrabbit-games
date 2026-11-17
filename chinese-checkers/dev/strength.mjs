// How strong the computer is, measured two ways:
//   solo   one computer alone on the board: moves to get all ten home
//          (a good human takes about 30–35)
//   duel   one level against another; at bigger tables, one of the first
//          level against the rest of the second, its seat rotated each game
//
//   node dev/strength.mjs [games]
//
// Results on 2026-11-17, 24 games a pairing: solo Easy 66, Steady 45, Sharp 35
// moves (slowest Sharp move 22 ms). Head to head Sharp beat Steady 20/24 and
// Steady beat Easy 23/24. Against Steadys Sharp won 10/24 at three seats
// (a fair share is 8) and 6/24 at four (fair share 6); at six it is about
// chance, since five others move between each of its turns.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../js/rules.js');
const Bot = require('../js/bot.js');
const GAMES = Number(process.argv[2] || 8);

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function solo(level) {
  let total = 0, ms = 0;
  for (let g = 0; g < GAMES; g++) {
    let board = R.start(2).replace(/1/g, '.');
    let prev = null, n = 0;
    while (!R.isHome(board, 2, 0) && n < 300) {
      const t = performance.now();
      const m = Bot.choose(board, 2, 0, level, prev, rand);
      ms = Math.max(ms, performance.now() - t);
      board = R.put(board, m.from, m.to);
      prev = m;
      n++;
    }
    total += n;
  }
  return `${(total / GAMES).toFixed(1)} moves, slowest ${ms.toFixed(0)} ms`;
}

function duel(a, b, seats) {
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const levels = Array.from({ length: seats }, (_, i) => (i === g % seats ? a : b));
    let s = { seats, board: R.start(seats), moves: 0, last: null, winner: null };
    const prev = {};
    let seat = 0;
    while (s.winner === null && s.moves < 3000) {
      const m = Bot.choose(s.board, seats, seat, levels[seat], prev[seat], rand);
      s = m ? R.apply(s, seat, { type: 'move', from: m.from, to: m.to }) : R.apply(s, seat, { type: 'pass' });
      if (m) prev[seat] = m;
      seat = (seat + 1) % seats;
    }
    if (s.winner !== null && levels[s.winner] === a) wins++;
  }
  return `${wins}/${GAMES} (a fair share is ${(GAMES / seats).toFixed(1)})`;
}

for (const level of Bot.LEVELS) console.log(level.padEnd(7), 'solo', solo(level));
console.log('hard vs normal, 2 seats', duel('hard', 'normal', 2));
console.log('normal vs easy, 2 seats', duel('normal', 'easy', 2));
console.log('hard vs normal, 3 seats', duel('hard', 'normal', 3));
console.log('hard vs normal, 4 seats', duel('hard', 'normal', 4));
