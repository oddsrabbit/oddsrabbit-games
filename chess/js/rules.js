// Chess rules, the client's copy. Mirrors ChessRules.php in the WordPress
// backend (rest-routes/services/matches/), which is the referee: this copy
// exists so a player sees legal moves, check and notation without a round
// trip. Both are checked against the same perft counts (test/rules.test.mjs
// and tools/test-match-rules.php); if they ever disagree, the server is right.
//
// A position is { board, turn, castling, ep }, the same fields the server's
// view carries:
//   board     64-char string, index rank*8+file, a1 = 0, h8 = 63, "." empty,
//             white pieces upper case (PNBRQK), black lower case
//   turn      "w" | "b"
//   castling  "KQkq" or a subset, "" for none
//   ep        "e3" | null
//
// A move here is { from, to, promo, flag } with squares as indexes; on the
// wire it is { type: "move", from: "e2", to: "e4", promo? }.

(function (root) {
  var START = "RNBQKBNRPPPPPPPP" + "................................" + "pppppppprnbqkbnr";
  var KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  var ROOK = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  var BISHOP = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  var VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

  function start() {
    return { board: START, turn: "w", castling: "KQkq", ep: null };
  }

  function colorOf(piece) {
    if (!piece || piece === ".") return null;
    return piece === piece.toUpperCase() ? "w" : "b";
  }

  function squareIndex(name) {
    if (typeof name !== "string" || !/^[a-h][1-8]$/.test(name)) return null;
    return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
  }

  function squareName(sq) {
    return String.fromCharCode(97 + (sq % 8)) + String.fromCharCode(49 + Math.floor(sq / 8));
  }

  function setAt(board, sq, piece) {
    return board.slice(0, sq) + piece + board.slice(sq + 1);
  }

  // Whether any `by` piece attacks square `sq`.
  function attacked(board, sq, by) {
    var f = sq % 8, r = Math.floor(sq / 8), up = by === "w", i, nf, nr;
    var pawn = up ? "P" : "p", pr = r + (up ? -1 : 1);
    if (pr >= 0 && pr < 8) {
      for (i = -1; i <= 1; i += 2) {
        nf = f + i;
        if (nf >= 0 && nf < 8 && board[pr * 8 + nf] === pawn) return true;
      }
    }
    var knight = up ? "N" : "n", king = up ? "K" : "k";
    for (i = 0; i < 8; i++) {
      nf = f + KNIGHT[i][0]; nr = r + KNIGHT[i][1];
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && board[nr * 8 + nf] === knight) return true;
      nf = f + KING[i][0]; nr = r + KING[i][1];
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && board[nr * 8 + nf] === king) return true;
    }
    var lines = [[ROOK, up ? "RQ" : "rq"], [BISHOP, up ? "BQ" : "bq"]];
    for (var l = 0; l < 2; l++) {
      var dirs = lines[l][0], sliders = lines[l][1];
      for (i = 0; i < 4; i++) {
        nf = f + dirs[i][0]; nr = r + dirs[i][1];
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          var p = board[nr * 8 + nf];
          if (p !== ".") {
            if (sliders.indexOf(p) !== -1) return true;
            break;
          }
          nf += dirs[i][0]; nr += dirs[i][1];
        }
      }
    }
    return false;
  }

  function inCheck(board, color) {
    var king = board.indexOf(color === "w" ? "K" : "k");
    return king !== -1 && attacked(board, king, color === "w" ? "b" : "w");
  }

  function pseudoMoves(pos) {
    var board = pos.board, color = pos.turn, out = [];
    var ep = pos.ep ? squareIndex(pos.ep) : null;
    for (var sq = 0; sq < 64; sq++) {
      var p = board[sq];
      if (p === "." || colorOf(p) !== color) continue;
      var f = sq % 8, r = Math.floor(sq / 8);
      switch (p.toLowerCase()) {
        case "p": pawnMoves(out, board, sq, f, r, color, ep); break;
        case "n": steps(out, board, sq, KNIGHT, color); break;
        case "b": slides(out, board, sq, BISHOP, color); break;
        case "r": slides(out, board, sq, ROOK, color); break;
        case "q": slides(out, board, sq, ROOK.concat(BISHOP), color); break;
        case "k":
          steps(out, board, sq, KING, color);
          castles(out, pos, sq, color);
          break;
      }
    }
    return out;
  }

  function addPawn(out, from, to, promotes) {
    if (!promotes) { out.push({ from: from, to: to, promo: null, flag: null }); return; }
    ["q", "r", "b", "n"].forEach(function (promo) { out.push({ from: from, to: to, promo: promo, flag: null }); });
  }

  function pawnMoves(out, board, sq, f, r, color, ep) {
    var dir = color === "w" ? 1 : -1;
    var startRank = color === "w" ? 1 : 6, lastRank = color === "w" ? 7 : 0;
    var r1 = r + dir;
    if (r1 >= 0 && r1 < 8 && board[r1 * 8 + f] === ".") {
      addPawn(out, sq, r1 * 8 + f, r1 === lastRank);
      var r2 = r + 2 * dir;
      if (r === startRank && board[r2 * 8 + f] === ".") out.push({ from: sq, to: r2 * 8 + f, promo: null, flag: "double" });
    }
    for (var df = -1; df <= 1; df += 2) {
      var cf = f + df;
      if (cf < 0 || cf > 7 || r1 < 0 || r1 > 7) continue;
      var to = r1 * 8 + cf;
      if (board[to] !== "." && colorOf(board[to]) !== color) addPawn(out, sq, to, r1 === lastRank);
      else if (to === ep) out.push({ from: sq, to: to, promo: null, flag: "ep" });
    }
  }

  function steps(out, board, sq, list, color) {
    var f = sq % 8, r = Math.floor(sq / 8);
    for (var i = 0; i < list.length; i++) {
      var nf = f + list[i][0], nr = r + list[i][1];
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      var to = nr * 8 + nf;
      if (board[to] === "." || colorOf(board[to]) !== color) out.push({ from: sq, to: to, promo: null, flag: null });
    }
  }

  function slides(out, board, sq, dirs, color) {
    var f = sq % 8, r = Math.floor(sq / 8);
    for (var i = 0; i < dirs.length; i++) {
      var nf = f + dirs[i][0], nr = r + dirs[i][1];
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        var to = nr * 8 + nf;
        if (board[to] === ".") {
          out.push({ from: sq, to: to, promo: null, flag: null });
        } else {
          if (colorOf(board[to]) !== color) out.push({ from: sq, to: to, promo: null, flag: null });
          break;
        }
        nf += dirs[i][0]; nr += dirs[i][1];
      }
    }
  }

  // Castling: rights kept, squares between empty, the king never in or through check.
  function castles(out, pos, sq, color) {
    var board = pos.board, rights = pos.castling || "";
    var home = color === "w" ? 4 : 60, enemy = color === "w" ? "b" : "w";
    if (sq !== home || attacked(board, home, enemy)) return;
    var rook = color === "w" ? "R" : "r";
    if (rights.indexOf(color === "w" ? "K" : "k") !== -1 && board[home + 3] === rook
      && board[home + 1] === "." && board[home + 2] === "."
      && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) {
      out.push({ from: home, to: home + 2, promo: null, flag: "castleK" });
    }
    if (rights.indexOf(color === "w" ? "Q" : "q") !== -1 && board[home - 4] === rook
      && board[home - 1] === "." && board[home - 2] === "." && board[home - 3] === "."
      && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) {
      out.push({ from: home, to: home - 2, promo: null, flag: "castleQ" });
    }
  }

  // The board after `m`, pieces only.
  function movePieces(board, m, color) {
    var piece = board[m.from];
    board = setAt(board, m.from, ".");
    if (m.promo) piece = color === "w" ? m.promo.toUpperCase() : m.promo;
    board = setAt(board, m.to, piece);
    if (m.flag === "ep") board = setAt(board, m.to + (color === "w" ? -8 : 8), ".");
    else if (m.flag === "castleK") { board = setAt(board, m.from + 1, board[m.from + 3]); board = setAt(board, m.from + 3, "."); }
    else if (m.flag === "castleQ") { board = setAt(board, m.from - 1, board[m.from - 4]); board = setAt(board, m.from - 4, "."); }
    return board;
  }

  function legalMoves(pos) {
    return pseudoMoves(pos).filter(function (m) {
      return !inCheck(movePieces(pos.board, m, pos.turn), pos.turn);
    });
  }

  var LOST = { 4: "KQ", 0: "Q", 7: "K", 60: "kq", 56: "q", 63: "k" };

  // The position after legal move `m`.
  function play(pos, m) {
    var color = pos.turn, rights = pos.castling || "";
    [m.from, m.to].forEach(function (sq) {
      if (LOST[sq]) LOST[sq].split("").forEach(function (c) { rights = rights.replace(c, ""); });
    });
    var board = movePieces(pos.board, m, color);
    var ep = null;
    if (m.flag === "double") {
      // Only when a capture is really possible, as the server records it.
      var enemyPawn = color === "w" ? "p" : "P", f = m.to % 8;
      if ((f > 0 && board[m.to - 1] === enemyPawn) || (f < 7 && board[m.to + 1] === enemyPawn)) {
        ep = squareName((m.from + m.to) / 2);
      }
    }
    return { board: board, turn: color === "w" ? "b" : "w", castling: rights, ep: ep };
  }

  // Standard algebraic notation for legal move `m`, check and mate included.
  function san(pos, m, legal) {
    var board = pos.board, text;
    legal = legal || legalMoves(pos);
    if (m.flag === "castleK" || m.flag === "castleQ") {
      text = m.flag === "castleK" ? "O-O" : "O-O-O";
    } else {
      var piece = board[m.from].toUpperCase();
      var capture = board[m.to] !== "." || m.flag === "ep";
      var to = squareName(m.to);
      if (piece === "P") {
        text = (capture ? squareName(m.from).charAt(0) + "x" : "") + to + (m.promo ? "=" + m.promo.toUpperCase() : "");
      } else {
        var sameFile = false, sameRank = false, ambiguous = false;
        legal.forEach(function (o) {
          if (o.to !== m.to || o.from === m.from || board[o.from] !== board[m.from]) return;
          ambiguous = true;
          sameFile = sameFile || o.from % 8 === m.from % 8;
          sameRank = sameRank || Math.floor(o.from / 8) === Math.floor(m.from / 8);
        });
        var from = squareName(m.from), dis = "";
        if (ambiguous) dis = !sameFile ? from.charAt(0) : !sameRank ? from.charAt(1) : from;
        text = piece + dis + (capture ? "x" : "") + to;
      }
    }
    var after = play(pos, m);
    if (inCheck(after.board, after.turn)) text += legalMoves(after).length ? "+" : "#";
    return text;
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    var moves = legalMoves(pos);
    if (depth === 1) return moves.length;
    var n = 0;
    for (var i = 0; i < moves.length; i++) n += perft(play(pos, moves[i]), depth - 1);
    return n;
  }

  function fromFen(fen) {
    var parts = fen.trim().split(/\s+/), rows = parts[0].split("/"), board = "";
    for (var rank = 0; rank < 8; rank++) {
      board += rows[7 - rank].replace(/\d/g, function (d) { return new Array(Number(d) + 1).join("."); });
    }
    return {
      board: board,
      turn: parts[1] || "w",
      castling: !parts[2] || parts[2] === "-" ? "" : parts[2],
      ep: !parts[3] || parts[3] === "-" ? null : parts[3]
    };
  }

  // The legal move a wire move names, or null. `promo` is required exactly
  // when the move promotes, as on the server.
  function find(pos, from, to, promo, legal) {
    var f = typeof from === "number" ? from : squareIndex(from);
    var t = typeof to === "number" ? to : squareIndex(to);
    legal = legal || legalMoves(pos);
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from === f && m.to === t && (m.promo || null) === (promo || null)) return m;
    }
    return null;
  }

  // Replays the server's move log (view.history) from the start: each entry
  // gets its SAN, and the position after it. Entries that are not moves (a
  // claim, an accepted draw) pass through with `san` null. Stops at the first
  // move it cannot replay, which would mean the two copies of the rules
  // disagree.
  function replay(history) {
    var pos = start(), out = [];
    for (var i = 0; i < (history || []).length; i++) {
      var entry = history[i] || {}, move = entry.move || {};
      var row = { ply: entry.ply, seat: entry.seat, type: move.type, san: null, from: null, to: null, capture: null, offerDraw: !!move.offerDraw, pos: pos };
      if (move.type === "move") {
        var legal = legalMoves(pos), m = find(pos, move.from, move.to, move.promo, legal);
        if (!m) break;
        row.san = san(pos, m, legal);
        row.from = m.from; row.to = m.to;
        var taken = m.flag === "ep" ? (pos.turn === "w" ? "p" : "P") : pos.board[m.to];
        row.capture = taken !== "." ? taken : null;
        row.color = pos.turn;
        pos = play(pos, m);
        row.pos = pos;
      }
      out.push(row);
    }
    return out;
  }

  // Pieces each side has lost, against a full set, and the material balance
  // (white minus black). Promotions can push a side past the full set, which
  // reads as nothing lost.
  function captured(board) {
    var full = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    var have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    var score = { w: 0, b: 0 };
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (p === "." ) continue;
      var c = colorOf(p), k = p.toLowerCase();
      score[c] += VALUES[k];
      if (k !== "k") have[c][k]++;
    }
    var lost = { w: [], b: [] };
    ["w", "b"].forEach(function (c) {
      ["q", "r", "b", "n", "p"].forEach(function (k) {
        for (var n = have[c][k]; n < full[k]; n++) lost[c].push(k);
      });
    });
    return { lost: lost, balance: score.w - score.b };
  }

  var api = {
    START: START,
    VALUES: VALUES,
    NAMES: NAMES,
    start: start,
    colorOf: colorOf,
    squareIndex: squareIndex,
    squareName: squareName,
    attacked: attacked,
    inCheck: inCheck,
    legalMoves: legalMoves,
    play: play,
    san: san,
    perft: perft,
    fromFen: fromFen,
    find: find,
    replay: replay,
    captured: captured
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessRules = api;
})(typeof window !== "undefined" ? window : this);
