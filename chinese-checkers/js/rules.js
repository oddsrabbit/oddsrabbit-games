// Chinese Checkers rules, the client's copy of ChineseCheckersRules.php in the
// WordPress backend (rest-routes/services/matches/, game id
// `chinese-checkers`). Used for the legal-move dots, the jump paths and the
// move log; if the two ever disagree, the server is right and the move comes
// back refused. Pure, with no DOM, so node tests it (test/rules.test.mjs).
//
// The board is a six-pointed star of 121 holes in cube coordinates (q, r, s
// with q + r + s = 0): the up triangle (every coordinate ≥ −4) plus the down
// triangle (every coordinate ≤ 4). Holes are numbered row by row, r from −8 to
// 8 and q from −8 to 8 within a row, which is the order the PHP builds them in
// too, so a hole's number means the same thing on both sides.
//
// The six points are numbered clockwise as drawn with point 0 at the bottom:
//   0 bottom   1 lower left   2 upper left   3 top   4 upper right   5 lower right
// and each races to the point opposite, (p + 3) % 6.
//
// A board is a 121-character string: "." for an empty hole, else the seat
// ("0"–"5") whose marble is in it. Seats sit at points by table size (SEATS),
// clockwise in seat order, so turns go round the star.
//
// Moves: one step to an empty neighbouring hole, or a chain of jumps, each over
// one neighbouring marble (any colour) into the empty hole straight beyond. A
// move is one or the other, never both, and nothing is captured.
//
// Home: every hole of your target point is filled and at least one marble in
// it is yours. So marbles parked in your target (a player who never left, or
// left the table) can't keep you out forever. The first player home wins.

(function (root) {
  "use strict";

  var DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
  // Which coordinate leaves the middle hexagon, and which way, for each point.
  var POINT_AXIS = [[1, 1], [0, -1], [2, 1], [1, -1], [0, 1], [2, -1]];
  // Each point's tip: the hole farthest from the middle.
  var TIPS = [[-4, 8, -4], [-8, 4, 4], [-4, -4, 8], [4, -8, 4], [8, -4, -4], [4, 4, -8]];
  // The points each table size plays from, by seat. 2–4 are what the server
  // seats; 6 is for games against the computer only.
  var SEATS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
  var SIZE = 121;
  var EMPTY = ".";

  var holes = [];
  var index = {};
  for (var r = -8; r <= 8; r++) {
    for (var q = -8; q <= 8; q++) {
      var s = -q - r;
      var up = q >= -4 && r >= -4 && s >= -4;
      var down = q <= 4 && r <= 4 && s <= 4;
      if (!up && !down) continue;
      var c = [q, r, s], point = -1;
      for (var p = 0; p < 6; p++) {
        var axis = POINT_AXIS[p][0], sign = POINT_AXIS[p][1];
        if (sign > 0 ? c[axis] > 4 : c[axis] < -4) point = p;
      }
      index[q + "," + r] = holes.length;
      holes.push({ q: q, r: r, s: s, point: point });
    }
  }

  // neighbours[i][d]: the hole one step from i in direction d, or −1 off the board.
  var neighbours = holes.map(function (h) {
    return DIRS.map(function (d) {
      var n = index[(h.q + d[0]) + "," + (h.r + d[1])];
      return n === undefined ? -1 : n;
    });
  });

  var pointHoles = [0, 1, 2, 3, 4, 5].map(function (p) {
    var out = [];
    holes.forEach(function (h, i) { if (h.point === p) out.push(i); });
    return out;
  });

  function hexDist(a, b) {
    var A = holes[a], B = holes[b];
    return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs(A.s - B.s));
  }

  var tipIndex = TIPS.map(function (t) { return index[t[0] + "," + t[1]]; });
  // distToTip[point][hole]
  var distToTip = tipIndex.map(function (t) { return holes.map(function (_, i) { return hexDist(i, t); }); });
  // Sum of distances to the tip with all ten marbles home: 0+1+1+2+2+2+3+3+3+3.
  var HOME_SUM = 20;

  function opposite(point) { return (point + 3) % 6; }
  function pointOf(seatCount, seat) { return SEATS[seatCount][seat]; }
  function targetOf(seatCount, seat) { return opposite(pointOf(seatCount, seat)); }
  function holeOk(i) { return typeof i === "number" && i === Math.floor(i) && i >= 0 && i < SIZE; }

  /** The opening board for a table of `seatCount`. */
  function start(seatCount) {
    var seats = SEATS[seatCount];
    if (!seats) throw new Error("A table is 2, 3, 4 or 6 players.");
    var b = [];
    for (var i = 0; i < SIZE; i++) b.push(EMPTY);
    seats.forEach(function (point, seat) {
      pointHoles[point].forEach(function (h) { b[h] = String(seat); });
    });
    return b.join("");
  }

  /**
   * Every hole the marble at `from` can end on, with the shortest path there.
   * Returns { dest: [from, …, dest] }. Jumps are breadth first, so each hole
   * keeps its shortest chain; the marble's own hole counts as empty once it
   * has left.
   */
  function movesFrom(board, from) {
    var out = {};
    if (!holeOk(from) || board.charAt(from) === EMPTY) return out;
    neighbours[from].forEach(function (n) {
      if (n >= 0 && board.charAt(n) === EMPTY) out[n] = [from, n];
    });
    var seen = {};
    seen[from] = true;
    var queue = [[from]];
    while (queue.length) {
      var path = queue.shift();
      var at = path[path.length - 1];
      for (var d = 0; d < 6; d++) {
        var over = neighbours[at][d];
        if (over < 0 || over === from || board.charAt(over) === EMPTY) continue;
        var land = neighbours[over][d];
        if (land < 0 || seen[land]) continue;
        if (land !== from && board.charAt(land) !== EMPTY) continue;
        seen[land] = true;
        var next = path.concat([land]);
        if (land !== from) out[land] = next;
        queue.push(next);
      }
    }
    return out;
  }

  /** Every move for `seat`: [{ from, to, path }]. */
  function allMoves(board, seat) {
    var mark = String(seat), list = [];
    for (var i = 0; i < SIZE; i++) {
      if (board.charAt(i) !== mark) continue;
      var dests = movesFrom(board, i);
      for (var k in dests) list.push({ from: i, to: Number(k), path: dests[k] });
    }
    return list;
  }

  function hasMove(board, seat) {
    var mark = String(seat);
    for (var i = 0; i < SIZE; i++) {
      if (board.charAt(i) !== mark) continue;
      for (var k in movesFrom(board, i)) return true; // eslint-disable-line no-unused-vars
    }
    return false;
  }

  /** The path for from → to, or null when it isn't a legal move for `seat`. */
  function pathFor(board, seat, from, to) {
    if (!holeOk(from) || !holeOk(to) || board.charAt(from) !== String(seat)) return null;
    return movesFrom(board, from)[to] || null;
  }

  function put(board, from, to) {
    var b = board.split("");
    b[to] = b[from];
    b[from] = EMPTY;
    return b.join("");
  }

  function isHome(board, seatCount, seat) {
    var mark = String(seat), mine = false, target = pointHoles[targetOf(seatCount, seat)];
    for (var i = 0; i < target.length; i++) {
      var c = board.charAt(target[i]);
      if (c === EMPTY) return false;
      if (c === mark) mine = true;
    }
    return mine;
  }

  /** How many of `seat`'s marbles are in its target. */
  function homeCount(board, seatCount, seat) {
    var mark = String(seat);
    return pointHoles[targetOf(seatCount, seat)].filter(function (i) { return board.charAt(i) === mark; }).length;
  }

  /** Sum of `seat`'s marbles' distances to its target tip: HOME_SUM when home. */
  function remaining(board, seatCount, seat) {
    var mark = String(seat), dist = distToTip[targetOf(seatCount, seat)], sum = 0;
    for (var i = 0; i < SIZE; i++) if (board.charAt(i) === mark) sum += dist[i];
    return sum;
  }

  /**
   * One move, as the server applies it. `state` is { seats, board, moves,
   * last, winner }; returns the new state or throws an Error with a message
   * for the player. `move` is { type: "move", from, to } or { type: "pass" }
   * (only when there is nothing else).
   */
  function apply(state, seat, move) {
    if (state.winner !== null && state.winner !== undefined) throw new Error("The game is over.");
    if (move && move.type === "pass") {
      if (hasMove(state.board, seat)) throw new Error("You can only pass with no move to make.");
      return { seats: state.seats, board: state.board, moves: state.moves + 1, last: { seat: seat, pass: true }, winner: null };
    }
    if (!move || move.type !== "move") throw new Error("A move is { type: \"move\", from, to }.");
    var path = pathFor(state.board, seat, move.from, move.to);
    if (!path) throw new Error("That move isn’t legal.");
    var board = put(state.board, move.from, move.to);
    return {
      seats: state.seats,
      board: board,
      moves: state.moves + 1,
      last: { seat: seat, from: move.from, to: move.to, path: path },
      winner: isHome(board, state.seats, seat) ? seat : null
    };
  }

  /**
   * The move log (the server's `view.history`) replayed from the start:
   * [{ ply, seat, type, from, to, path, hops, jump, board }] where `board` is
   * the position after the move. Entries that aren't moves (a pass, a claim)
   * come through with their type and the board unchanged. Stops at the first
   * move that doesn't replay.
   */
  function replay(seatCount, history) {
    var board = start(seatCount), out = [];
    for (var i = 0; i < (history || []).length; i++) {
      var h = history[i], mv = h && h.move || {};
      if (mv.type === "move") {
        var path = pathFor(board, h.seat, mv.from, mv.to);
        if (!path) break;
        board = put(board, mv.from, mv.to);
        out.push({ ply: h.ply, seat: h.seat, type: "move", from: mv.from, to: mv.to, path: path,
          hops: path.length - 1, jump: path.length > 2 || hexDist(path[0], path[1]) === 2, board: board });
      } else {
        out.push({ ply: h.ply, seat: h.seat, type: mv.type || "other", board: board });
      }
    }
    return out;
  }

  /** "a step", "a jump", "3 jumps": what a move did, for sentences. */
  function describe(path) {
    if (!path || path.length < 2) return "a move";
    var jumps = path.length > 2 || hexDist(path[0], path[1]) === 2;
    if (!jumps) return "a step";
    var n = path.length - 1;
    return n === 1 ? "a jump" : n + " jumps";
  }

  var api = {
    SIZE: SIZE, EMPTY: EMPTY, DIRS: DIRS, SEATS: SEATS, TIPS: TIPS, HOME_SUM: HOME_SUM,
    holes: holes, neighbours: neighbours, pointHoles: pointHoles, distToTip: distToTip,
    opposite: opposite, pointOf: pointOf, targetOf: targetOf, hexDist: hexDist,
    start: start, movesFrom: movesFrom, allMoves: allMoves, hasMove: hasMove, pathFor: pathFor, put: put,
    isHome: isHome, homeCount: homeCount, remaining: remaining, apply: apply, replay: replay, describe: describe
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CCRules = api;
})(typeof self !== "undefined" ? self : this);
