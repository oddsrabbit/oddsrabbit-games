import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const R = require('../js/rules.js');
const Bot = require('../js/bot.js');

const at = (q, r) => R.holes.findIndex((h) => h.q === q && h.r === r);
const empty = () => '.'.repeat(R.SIZE);
const set = (board, i, c) => board.slice(0, i) + c + board.slice(i + 1);

test('the star has 121 holes and six points of ten', () => {
  assert.equal(R.holes.length, 121);
  for (const p of R.pointHoles) assert.equal(p.length, 10);
  assert.equal(R.holes.filter((h) => h.point === -1).length, 61);
});

test('each point is the ten holes nearest its tip', () => {
  for (let p = 0; p < 6; p++) {
    assert.equal(R.pointHoles[p].reduce((a, i) => a + R.distToTip[p][i], 0), R.HOME_SUM);
  }
});

test('openings: ten marbles per seat, each seat at its point, everyone can move', () => {
  for (const n of [2, 3, 4, 6]) {
    const b = R.start(n);
    for (let seat = 0; seat < n; seat++) {
      assert.equal([...b].filter((c) => c === String(seat)).length, 10);
      for (const h of R.pointHoles[R.pointOf(n, seat)]) assert.equal(b[h], String(seat));
      assert.ok(R.hasMove(b, seat));
    }
  }
});

test('steps and jump chains, never both', () => {
  let b = empty();
  const from = at(0, 0);
  b = set(b, from, '0');
  b = set(b, at(1, 0), '1');
  b = set(b, at(3, 0), '1');
  const moves = R.movesFrom(b, from);
  assert.deepEqual(moves[at(4, 0)], [from, at(2, 0), at(4, 0)]);
  assert.ok(moves[at(0, 1)]);
  assert.ok(!moves[at(1, 0)]);
  assert.ok(!moves[at(3, 0)]);
  assert.equal(R.describe(moves[at(4, 0)]), '2 jumps');
  assert.equal(R.describe(moves[at(0, 1)]), 'a step');
});

test('home: a full target with at least one of yours', () => {
  let b = R.start(2);
  const tgt = R.pointHoles[R.targetOf(2, 0)];
  for (const i of tgt) b = set(b, i, '0');
  b = set(b, tgt[0], '1');
  assert.ok(R.isHome(b, 2, 0));
  b = set(b, tgt[1], '.');
  assert.ok(!R.isHome(b, 2, 0));
});

test('apply refuses what the server would', () => {
  const s = { seats: 2, board: R.start(2), moves: 0, last: null, winner: null };
  assert.throws(() => R.apply(s, 0, { type: 'move', from: R.pointHoles[3][0], to: at(0, 0) }));
  assert.throws(() => R.apply(s, 0, { type: 'move', from: R.pointHoles[0][0], to: at(0, 0) }));
  assert.throws(() => R.apply(s, 0, { type: 'move', from: 'x', to: 3 }));
  assert.throws(() => R.apply(s, 0, { type: 'pass' }));
  const m = R.allMoves(s.board, 0)[0];
  const next = R.apply(s, 0, { type: 'move', from: m.from, to: m.to });
  assert.equal(next.moves, 1);
  assert.deepEqual(next.last.path, m.path);
});

test('replay rebuilds the board from the log', () => {
  let s = { seats: 3, board: R.start(3), moves: 0, last: null, winner: null };
  const history = [];
  for (let ply = 0; ply < 30; ply++) {
    const seat = ply % 3;
    const m = Bot.choose(s.board, 3, seat, 'normal');
    s = R.apply(s, seat, { type: 'move', from: m.from, to: m.to });
    history.push({ ply, seat, move: { type: 'move', from: m.from, to: m.to } });
  }
  const log = R.replay(3, history);
  assert.equal(log.length, 30);
  assert.equal(log[29].board, s.board);
});

// The fixtures the PHP rules are tested against (test/fixtures.json, made by
// dev/fixtures.mjs): replaying them here must still give the same boards.
test('agrees with the fixtures the server is tested on', () => {
  const games = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
  for (const g of games) {
    let s = { seats: g.seats, board: R.start(g.seats), moves: 0, last: null, winner: null };
    g.moves.forEach((mv, i) => {
      s = R.apply(s, mv.seat, mv.move);
      assert.equal(s.board, g.boards[i]);
      assert.deepEqual(s.last.path || null, g.paths[i]);
    });
    assert.equal(s.winner, g.winner);
  }
});

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function race(n, levels, seed) {
  const rand = rng(seed);
  let s = { seats: n, board: R.start(n), moves: 0, last: null, winner: null };
  const prev = {};
  let seat = 0;
  while (s.winner === null && s.moves < 3000) {
    const m = Bot.choose(s.board, n, seat, levels[seat % levels.length], prev[seat], rand);
    s = m ? R.apply(s, seat, { type: 'move', from: m.from, to: m.to }) : R.apply(s, seat, { type: 'pass' });
    if (m) prev[seat] = m;
    seat = (seat + 1) % n;
  }
  return s;
}

for (const level of Bot.LEVELS) {
  for (const n of [2, 3, 4, 6]) {
    test(`${level} bots get someone home at a table of ${n}`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const s = race(n, [level], seed);
        assert.notEqual(s.winner, null, `seed ${seed}: nobody home after ${s.moves} moves`);
      }
    });
  }
}

test('hard beats easy most of the time', () => {
  let wins = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const hardFirst = seed % 2 === 1;
    const s = race(2, hardFirst ? ['hard', 'easy'] : ['easy', 'hard'], seed);
    if (s.winner === (hardFirst ? 0 : 1)) wins++;
  }
  assert.ok(wins >= 8, `hard won ${wins}/10`);
});
