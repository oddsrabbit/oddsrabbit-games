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

// [seats, bot level, seat that leaves before the first move or null]. The
// last game has seat 2 leave untouched: its ten marbles fill seat 0's target
// until they come off after the first move.
const games = [];
for (const [seats, level, leaver] of [[2, 'hard', null], [3, 'normal', null], [4, 'easy', null], [2, 'easy', null], [4, 'normal', 2]]) {
  const active = [...Array(seats).keys()].filter((s) => s !== leaver);
  let s = { seats, board: R.start(seats), moves: 0, last: null, winner: null, gone: [] };
  const g = { seats, active, moves: [], boards: [], paths: [], winner: null };
  const prev = {};
  let turn = 0;
  while (s.winner === null && s.moves < 3000) {
    const seat = active[turn];
    const m = Bot.choose(s.board, seats, seat, level, prev[seat], rand);
    const move = m ? { type: 'move', from: m.from, to: m.to } : { type: 'pass' };
    s = R.apply(s, seat, move, active);
    if (m) prev[seat] = m;
    g.moves.push({ seat, move });
    g.boards.push(s.board);
    g.paths.push(s.last.path || null);
    turn = (turn + 1) % active.length;
  }
  g.winner = s.winner;
  g.gone = s.gone;
  games.push(g);
}

// One move per line, so a regenerated file diffs move by move.
const lines = (xs) => xs.map((x) => '    ' + JSON.stringify(x)).join(',\n');
const text = '[\n' + games.map((g) => [
  '  {',
  `   "seats": ${g.seats}, "active": ${JSON.stringify(g.active)}, "winner": ${g.winner}, "gone": ${JSON.stringify(g.gone)},`,
  '   "moves": [\n' + lines(g.moves) + '\n   ],',
  '   "boards": [\n' + lines(g.boards) + '\n   ],',
  '   "paths": [\n' + lines(g.paths) + '\n   ]',
  '  }',
].join('\n')).join(',\n') + '\n]\n';
writeFileSync(new URL('../test/fixtures.json', import.meta.url), text);
console.log(games.map((g) => `${g.seats} seats${g.active.length < g.seats ? ` (${g.active.length} playing)` : ''}: ${g.moves.length} moves, seat ${g.winner} home`).join('\n'));
