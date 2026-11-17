// The computer's move. It races: it plans its own moves and pays no attention
// to anyone else's plans (other marbles are just ladders and obstacles).
//
// A position is scored by how far the computer's marbles still have to go:
// rows to the far tip, counted along the axis the point faces (so a sideways
// hop is not progress), plus a little for each marble off the point's centre
// line (so they funnel into the point rather than arrive at its edges), plus a
// squared term so a straggler costs more than its rows (the last marble out is
// what loses races).
//
// It plans by looking at sequences of its own moves on the board as it
// stands, keeping only the best few lines at each step (a beam search): that
// is how it finds jump ladders, where one move sets up a long chain the next.
//
//   easy    two moves ahead, picks loosely among the decent ones, and now and
//           then just hops forward                         ~66 moves solo
//   normal  three moves ahead                               ~45 moves solo
//   hard    seven moves ahead, with a wider beam            ~35 moves solo
//           and, head to head, a guard: it marks down moves that hand the
//           other player a long ladder. At a table of three or more it plans
//           four moves ahead instead (see hardCrowd).
//
// "Moves solo" is how long it takes alone on the board to get all ten home
// (a good human takes about 30–35). The settings below were tuned with
// dev/strength.mjs, which measures that and the head-to-head results. The
// hint is the hard move. Synchronous; hard takes about 20 ms a move on a
// laptop, so well under a frame's worth of waiting on a phone.

(function (root) {
  "use strict";
  var R = typeof module !== "undefined" && module.exports ? require("./rules.js") : root.CCRules;

  var LEVELS = ["easy", "normal", "hard"];
  var PLAN = {
    easy: { depth: 2, beam: 6 },
    normal: { depth: 3, beam: 10 },
    hard: { depth: 7, beam: 20 },
    // Sharp at a table of three or more: the others move several times
    // between its turns, so a long plan is mostly fiction there. A shorter
    // one, and no guard (watching only the next player cost it races).
    hardCrowd: { depth: 4, beam: 16 }
  };
  // How loose Easy is: the chance it just hops any marble forward, and how
  // far down the ranking its pick can wander (higher is looser).
  var EASY = { forward: 0.08, temperature: 1.0 };
  // Sharp, head to head, also asks what each of its best moves hands the
  // other player: how much their best reply would gain. A move that opens a
  // long ladder for them is marked down by this much of their gain. `top` is
  // how many of its own best moves it checks. Tuned with dev/strength.mjs:
  // without it Sharp beat Steady 5 times in 16, with it 22 in 24.
  var GUARD = { weight: 1.0, top: 12 };

  // rows[point][hole]: rows from the hole to that point's tip, along the
  // point's axis. side[point][hole]: how far the hole is off that axis.
  var AXIS = [[1, 1], [0, -1], [2, 1], [1, -1], [0, 1], [2, -1]];
  var rows = [], side = [];
  for (var p = 0; p < 6; p++) {
    var a = AXIS[p][0], sign = AXIS[p][1];
    var o1 = (a + 1) % 3, o2 = (a + 2) % 3;
    rows.push(R.holes.map(function (h) {
      var c = [h.q, h.r, h.s];
      return 8 - sign * c[a];
    }));
    side.push(R.holes.map(function (h) {
      var c = [h.q, h.r, h.s];
      return Math.abs(c[o1] - c[o2]) / 2;
    }));
  }

  // The score's weights: stragglers (squared rows), off-centre, and from how
  // many rows out off-centre starts to count (17: everywhere on the board).
  var W = { sq: 0.08, off: 0.6, near: 17 };

  // Lower is better. Home is 20 rows (0+1+1+2+2+2+3+3+3+3) and a little side.
  function evaluate(board, seatCount, seat) {
    var t = R.targetOf(seatCount, seat), mark = String(seat);
    var rw = rows[t], sd = side[t], sum = 0, sq = 0, off = 0;
    for (var i = 0; i < R.SIZE; i++) {
      if (board.charAt(i) !== mark) continue;
      var d = rw[i];
      sum += d;
      sq += d * d;
      // Off-centre counts from W.near rows out (everywhere, as tuned).
      if (d < W.near) off += sd[i];
    }
    return sum + W.sq * sq + W.off * off;
  }

  // The score of a move: the position after it, with a penalty for undoing
  // the last move (how a stuck computer dithers) and for leaving the target.
  function scoreMove(board, seatCount, seat, m, prev) {
    var after = R.put(board, m.from, m.to);
    var v = evaluate(after, seatCount, seat);
    if (R.isHome(after, seatCount, seat)) v -= 1000;
    if (prev && prev.from === m.to && prev.to === m.from) v += 3;
    var t = R.targetOf(seatCount, seat);
    if (R.holes[m.from].point === t && R.holes[m.to].point !== t) v += 2;
    return { v: v, after: after };
  }

  // Every first move, each valued by the best position reachable from it in
  // `depth` moves of its own, keeping the `beam` best lines at each step. A
  // little weight on the nearer positions means of two plans that end equally
  // well, the one that makes progress sooner wins.
  function plan(board, seatCount, seat, prev, depth, beam, rand) {
    var first = R.allMoves(board, seat).map(function (m) {
      var s = scoreMove(board, seatCount, seat, m, prev);
      return { m: m, v: s.v + rand() * 0.01, after: s.after, best: s.v };
    });
    if (!first.length) return [];
    first.sort(function (x, y) { return x.v - y.v; });
    if (depth <= 1) return first;
    // Lines: { root: index into first, board, last, v }
    var lines = first.slice(0, beam * 2).map(function (x, i) {
      return { root: i, board: x.after, last: x.m, v: x.v };
    });
    for (var d = 2; d <= depth; d++) {
      var next = [];
      lines.forEach(function (line) {
        if (line.v < -500) { next.push(line); return; }
        R.allMoves(line.board, seat).forEach(function (m) {
          var s = scoreMove(line.board, seatCount, seat, m, line.last);
          next.push({ root: line.root, board: s.after, last: m, v: s.v });
        });
      });
      next.sort(function (x, y) { return x.v - y.v; });
      // Keep the best lines, but no more than two per first move, so one
      // good opening does not crowd out every alternative.
      var kept = [], perRoot = {};
      for (var k = 0; k < next.length && kept.length < beam; k++) {
        var r = next[k].root;
        if ((perRoot[r] || 0) >= 2) continue;
        perRoot[r] = (perRoot[r] || 0) + 1;
        kept.push(next[k]);
        var f = first[r];
        // Discount the far future a touch: progress now beats progress later.
        var val = next[k].v + 0.02 * d * f.v;
        if (val < f.best) f.best = val;
      }
      lines = kept;
    }
    first.forEach(function (x) { if (x.v < -500) x.best = -1e9; });
    return first.slice().sort(function (x, y) { return x.best - y.best; });
  }

  /**
   * A move for `seat`: { from, to, path }, or null when it has none (it
   * passes). `prev` is its own last move, `rand` injectable for tests.
   */
  function choose(board, seatCount, seat, level, prev, rand) {
    rand = rand || Math.random;
    var cfg = level === "hard" && seatCount > 2 ? PLAN.hardCrowd : PLAN[level] || PLAN.normal;
    var ranked = plan(board, seatCount, seat, prev, cfg.depth, cfg.beam, rand);
    if (!ranked.length) return null;

    if (level === "easy") {
      if (rand() < EASY.forward) {
        var now = evaluate(board, seatCount, seat);
        var forward = ranked.filter(function (x) { return x.v < now; });
        if (forward.length) return forward[Math.floor(rand() * forward.length)].m;
      }
      var top = ranked.slice(0, 6);
      var w = top.map(function (x) { return Math.exp(-(x.v - top[0].v) / EASY.temperature); });
      var t = rand() * w.reduce(function (s, x) { return s + x; }, 0);
      for (var i = 0; i < top.length; i++) if ((t -= w[i]) <= 0) return top[i].m;
      return top[0].m;
    }
    if (level === "hard" && seatCount === 2 && GUARD.weight > 0) {
      var next = (seat + 1) % seatCount;
      var pool = ranked.slice(0, GUARD.top);
      var bestPick = null;
      pool.forEach(function (x) {
        if (x.best < -500) { if (!bestPick) bestPick = { m: x.m, v: -1e12 }; return; }
        var after = x.after;
        var theirNow = evaluate(after, seatCount, next);
        var theirBest = theirNow;
        R.allMoves(after, next).forEach(function (m2) {
          var v2 = evaluate(R.put(after, m2.from, m2.to), seatCount, next);
          if (v2 < theirBest) theirBest = v2;
        });
        var v = x.best + GUARD.weight * (theirNow - theirBest);
        if (!bestPick || v < bestPick.v) bestPick = { m: x.m, v: v };
      });
      return bestPick.m;
    }
    return ranked[0].m;
  }

  var api = { LEVELS: LEVELS, choose: choose, evaluate: evaluate, PLAN: PLAN, EASY: EASY, W: W, GUARD: GUARD };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CCBot = api;
})(typeof self !== "undefined" ? self : this);
