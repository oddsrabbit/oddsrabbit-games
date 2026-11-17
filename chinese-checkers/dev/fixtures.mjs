// Writes test/fixtures.json: whole games played by the bots at each table
// size, with the board and jump path after every move. The JS rules are tested
// against it (test/rules.test.mjs), and so is ChineseCheckersRules.php
// (tools/test-match-rules.php in the web repo reads a copy), which is how the
// two are kept agreeing. Run again only when the rules change, then copy the
// file to the web repo's tools/fixtures/chinese-checkers.json.
//
//   node dev/fixtures.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../js/rules.js');
const Bot = require('../js/bot.js');

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const games = [];
for (const [seats, level] of [[2, 'hard'], [3, 'normal'], [4, 'easy'], [2, 'easy']]) {
  let s = { seats, board: R.start(seats), moves: 0, last: null, winner: null };
  const g = { seats, moves: [], boards: [], paths: [], winner: null };
  const prev = {};
  let seat = 0;
  while (s.winner === null && s.moves < 3000) {
    const m = Bot.choose(s.board, seats, seat, level, prev[seat], rand);
    const move = m ? { type: 'move', from: m.from, to: m.to } : { type: 'pass' };
    s = R.apply(s, seat, move);
    if (m) prev[seat] = m;
    g.moves.push({ seat, move });
    g.boards.push(s.board);
    g.paths.push(s.last.path || null);
    seat = (seat + 1) % seats;
  }
  g.winner = s.winner;
  games.push(g);
}
writeFileSync(new URL('../test/fixtures.json', import.meta.url), JSON.stringify(games));
console.log(games.map((g) => `${g.seats} seats: ${g.moves.length} moves, seat ${g.winner} home`).join('\n'));
