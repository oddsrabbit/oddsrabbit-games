// Games against the computer: how the bot picks among the engine's lines
// (js/engine.js `pick`), and how a saved game replays into a MatchView
// (js/computer.js). The engine itself is not run here; a stub stands in.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(engineStub) {
  const window = {};
  const context = { window, console, setTimeout, clearTimeout, Promise, JSON, Math, Date, localStorage: undefined };
  for (const f of ['rules.js', 'engine.js', 'computer.js']) {
    if (f === 'engine.js' && engineStub) { window.ChessEngine = engineStub; continue; }
    vm.runInNewContext(readFileSync(new URL('../js/' + f, import.meta.url), 'utf8'), context);
  }
  return window;
}

const { ChessEngine: E, ChessRules: R } = load();
const seq = (...xs) => () => xs.shift();

test('a strong bot plays its best line', () => {
  const lines = [{ move: 'e2e4', cp: 30 }, { move: 'd2d4', cp: 25 }];
  assert.equal(E.pick(lines, ['e2e4', 'd2d4', 'a2a3'], 2000, seq(0.99)).move, 'e2e4');
});

test('a weak bot sometimes blunders into any legal move', () => {
  const lines = [{ move: 'e2e4', cp: 30 }];
  const choice = E.pick(lines, ['e2e4', 'a2a3', 'h2h3'], 300, seq(0, 0.99));
  assert.equal(choice.how, 'blunder');
  assert.equal(choice.move, 'h2h3');
});

test('no blunder out of a mate it has found', () => {
  const lines = [{ move: 'd8h4', cp: E.MATE - 1 }, { move: 'a7a6', cp: 0 }];
  assert.equal(E.pick(lines, ['d8h4', 'a7a6', 'b7b6'], 300, seq(0, 0)).move, 'd8h4');
});

test('weaker bots pick worse lines more often', () => {
  const lines = [{ move: 'a', cp: 100 }, { move: 'b', cp: 0 }, { move: 'c', cp: -300 }];
  const share = (rating) => {
    let best = 0;
    for (let i = 0; i < 400; i++) {
      const u = (i + 0.5) / 400;
      // First draw skips the blunder roll; the second walks the softmax.
      if (E.pick(lines, ['a', 'b', 'c'], rating, seq(0.999, u)).move === 'a') best++;
    }
    return best / 400;
  };
  assert.ok(share(1400) > share(800));
  assert.ok(share(800) > share(400));
});

test('FEN for the start position', () => {
  assert.equal(E.toFen(R.start(), 0, 1), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

const { ChessComputer: C } = load({ choose: () => new Promise(() => {}), warm: () => Promise.resolve(false) });
const bot = { name: 'Hazel Burrows', rating: 900, level: 'casual', line: '' };
const game = (fields) => ({ id: 'cpu-test', bot, me: 'w', moves: '', end: null, created: 0, updated: 0, ev: null, ...fields });

test('a saved game replays into a MatchView', () => {
  const v = C._view(game({ moves: 'e2e4 e7e5' }));
  assert.equal(v.status, 'active');
  assert.equal(v.local, true);
  assert.equal(v.isMyTurn, true);
  assert.equal(v.view.history.length, 2);
  assert.equal(v.view.last.san, 'e5');
  assert.equal(v.players[1].bot.rating, 900);
  assert.equal(v.version, 3);
});

test('checkmate ends it, with the winner', () => {
  // Fool's mate: the player is White and gets mated.
  const v = C._view(game({ moves: 'f2f3 e7e5 g2g4 d8h4' }));
  assert.equal(v.status, 'finished');
  assert.equal(v.view.result.type, 'checkmate');
  assert.equal(v.winnerSeat, 1);
});

test('the player as Black: the bot is White and moves first', () => {
  const v = C._view(game({ me: 'b' }));
  assert.equal(v.view.white, 1);
  assert.equal(v.isMyTurn, false);
  assert.equal(v.thinking, true);
});

test('resigning, and an agreed draw', () => {
  const resigned = C._view(game({ moves: 'e2e4', end: { type: 'resign', seat: 0 } }));
  assert.equal(resigned.status, 'finished');
  assert.equal(resigned.winnerSeat, 1);
  assert.equal(resigned.players[0].status, 'resigned');
  const drawn = C._view(game({ moves: 'e2e4=', end: { type: 'agreed' } }));
  assert.equal(drawn.winnerSeat, null);
  assert.equal(drawn.view.result.type, 'agreed');
  assert.equal(drawn.lastMove.move.type, 'acceptDraw');
});

test('a draw offer rides on the move', () => {
  const v = C._view(game({ moves: 'e2e4=' }));
  assert.equal(v.view.drawOffer, 0);
  assert.equal(v.view.history[0].move.offerDraw, true);
});

test('a rolled opponent is inside its level', () => {
  for (const level of C.LEVELS) {
    for (let i = 0; i < 50; i++) {
      const b = C.roll(level.id);
      assert.ok(b.rating >= level.min && b.rating <= level.max, level.id + ' ' + b.rating);
      assert.equal(b.level, level.id);
    }
  }
});
