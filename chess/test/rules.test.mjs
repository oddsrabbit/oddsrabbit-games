// The client copy of the chess rules. The server's ChessRules.php is the
// referee; these hold this copy to the same perft counts its suite checks
// (tools/test-match-rules.php in the WordPress repo), so the two cannot drift
// apart on which moves are legal.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../js/rules.js', import.meta.url), 'utf8'), { window });
const R = window.ChessRules;

// Plays UCI strings ("e2e4", "e7e8q") from `pos`.
function playAll(pos, moves) {
  for (const uci of moves) {
    const m = R.find(pos, uci.slice(0, 2), uci.slice(2, 4), uci[4] || null);
    assert.ok(m, `${uci} is legal`);
    pos = R.play(pos, m);
  }
  return pos;
}

function sanOf(pos, uci) {
  return R.san(pos, R.find(pos, uci.slice(0, 2), uci.slice(2, 4), uci[4] || null));
}

const PERFT = [
  ['start position', R.start(), [20, 400, 8902, 197281]],
  ['kiwipete', R.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), [48, 2039, 97862]],
  ['position 3', R.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), [14, 191, 2812, 43238]],
  ['position 4', R.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), [6, 264, 9467]],
  ['position 5', R.fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'), [44, 1486, 62379]],
];

for (const [name, pos, counts] of PERFT) {
  test(`perft ${name}`, () => {
    counts.forEach((want, i) => assert.equal(R.perft(pos, i + 1), want, `depth ${i + 1}`));
  });
}

test('notation: mate, check, castling, en passant, promotion, disambiguation', () => {
  const fool = playAll(R.start(), ['f2f3', 'e7e5', 'g2g4']);
  assert.equal(sanOf(fool, 'd8h4'), 'Qh4#');
  assert.equal(sanOf(playAll(R.start(), ['e2e4', 'f7f6']), 'd1h5'), 'Qh5+');
  assert.equal(sanOf(R.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1g1'), 'O-O');
  assert.equal(sanOf(R.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1c1'), 'O-O-O');
  const ep = playAll(R.start(), ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
  assert.equal(ep.ep, 'd6');
  assert.equal(sanOf(ep, 'e5d6'), 'exd6');
  assert.equal(sanOf(R.fromFen('k7/4P3/8/8/8/8/8/K7 w - - 0 1'), 'e7e8n'), 'e8=N');
  assert.equal(sanOf(R.fromFen('k7/8/8/8/8/8/8/KR3R2 w - - 0 1'), 'f1d1'), 'Rfd1');
  assert.equal(sanOf(R.fromFen('k7/8/8/8/R7/8/8/R6K w - - 0 1'), 'a4a2'), 'R4a2+');
});

test('no en passant square when nothing can take', () => {
  assert.equal(playAll(R.start(), ['e2e4']).ep, null);
});

test('a promotion must name its piece', () => {
  const pos = R.fromFen('k7/4P3/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(R.find(pos, 'e7', 'e8', null), null);
  assert.ok(R.find(pos, 'e7', 'e8', 'q'));
});

test('replay turns the server log into notation and positions', () => {
  const history = [
    { ply: 0, seat: 1, move: { type: 'move', from: 'e2', to: 'e4' } },
    { ply: 1, seat: 0, move: { type: 'move', from: 'd7', to: 'd5', offerDraw: true } },
    { ply: 2, seat: 1, move: { type: 'move', from: 'e4', to: 'd5' } },
    { ply: 3, seat: 0, move: { type: 'claim', claimedBy: 1 } },
  ];
  const rows = R.replay(history);
  assert.deepEqual([...rows].map((r) => r.san), ['e4', 'd5', 'exd5', null]);
  assert.equal(rows[1].offerDraw, true);
  assert.equal(rows[2].capture, 'p');
  assert.equal(rows[2].pos.board[R.squareIndex('d5')], 'P');
  assert.equal(rows[3].type, 'claim');
});

test('captured pieces and the material balance', () => {
  const pos = playAll(R.start(), ['e2e4', 'd7d5', 'e4d5', 'd8d5']);
  const c = R.captured(pos.board);
  assert.deepEqual([...c.lost.w], ['p']);
  assert.deepEqual([...c.lost.b], ['p']);
  assert.equal(c.balance, 0);
});
