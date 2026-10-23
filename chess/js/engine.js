// The computer opponent's brain: Stockfish 18 (lite, single-threaded WASM,
// from the `stockfish` npm package, GPLv3) in a Web Worker, plus the part
// that makes it play like a person of a given rating.
//
// Stockfish's own strength limit (UCI_Elo) bottoms out at 1320 on the CCRL
// computer scale, which is still far too strong for a beginner. So:
//
//   rating >= STRONG_FROM   UCI_LimitStrength + UCI_Elo, one line, and the
//                           move Stockfish picks.
//   below it                full strength at a shallow depth with MultiPV,
//                           then `pick` chooses among the top lines: a
//                           softmax over their scores whose temperature grows
//                           as the rating falls, plus a chance of a plain
//                           random legal move (a blunder). Lichess weakens
//                           its low levels the same way.
//
// The numbers in TUNING are set by feel, not measured: the ratings a player
// sees are what the bot is meant to play like, not a calibrated Elo.
//
// The engine talks UCI over postMessage, one request at a time. If the worker
// cannot start (no WASM, the file failed to load), `choose` still answers,
// with a capture-preferring random move, so a game never stalls.

(function (root) {
  var Rules = root.ChessRules;
  var ENGINE_URL = "./engine/stockfish-18-lite-single.js";
  var STRONG_FROM = 1500;
  var MULTIPV = 6;
  var START_TIMEOUT_MS = 30000;
  var MOVE_TIMEOUT_MS = 15000;
  var MATE = 100000;

  // Linear between two (rating, value) points, clamped at both ends.
  function ramp(r, r0, v0, r1, v1) {
    if (r <= r0) return v0;
    if (r >= r1) return v1;
    return v0 + (v1 - v0) * (r - r0) / (r1 - r0);
  }

  var TUNING = {
    // How likely a move is a random legal one rather than one of the top lines.
    blunder: function (r) { return ramp(r, 300, 0.3, 1500, 0.01); },
    // Softmax temperature over the top lines, in centipawns: higher means a
    // second- or fifth-best move is picked more often.
    temperature: function (r) { return ramp(r, 300, 300, 1500, 30); },
    // Search depth for the weak path.
    depth: function (r) { return r < 600 ? 3 : r < 1000 ? 5 : r < 1300 ? 7 : 9; },
    // Thinking time for the strong path.
    movetime: function (r) { return Math.round(ramp(r, STRONG_FROM, 400, 2700, 1500)); },
    elo: function (r) { return Math.max(1320, Math.min(3190, Math.round(r))); }
  };

  // ---------------------------------------------------------------- FEN

  function toFen(pos, halfmove, fullmove) {
    var rows = [];
    for (var rank = 7; rank >= 0; rank--) {
      var row = "", empty = 0;
      for (var file = 0; file < 8; file++) {
        var p = pos.board[rank * 8 + file];
        if (p === ".") { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      rows.push(row + (empty || ""));
    }
    return rows.join("/") + " " + pos.turn + " " + (pos.castling || "-") + " " + (pos.ep || "-")
      + " " + (halfmove || 0) + " " + (fullmove || 1);
  }

  function uciOf(m) {
    return Rules.squareName(m.from) + Rules.squareName(m.to) + (m.promo || "");
  }

  // ---------------------------------------------------------------- picking

  // Choose a move from the engine's lines for a player of `rating`. `lines`
  // are best first, each { move: "e2e4", cp } with cp from the mover's side;
  // `legal` is every legal move in UCI. `rand` is Math.random unless a test
  // passes its own. Pure, so it can be tested without a worker.
  function pick(lines, legal, rating, rand) {
    rand = rand || Math.random;
    if (!lines.length) return legal.length ? { move: legal[Math.floor(rand() * legal.length)], cp: null, how: "random" } : null;
    if (rating >= STRONG_FROM) return { move: lines[0].move, cp: lines[0].cp, how: "best" };
    // Never blunder out of a forced mate it has found, or into a
    // one-legal-move position where there is nothing to choose.
    var mating = lines[0].cp >= MATE / 2;
    if (!mating && legal.length > 1 && rand() < TUNING.blunder(rating)) {
      return { move: legal[Math.floor(rand() * legal.length)], cp: null, how: "blunder" };
    }
    var t = TUNING.temperature(rating);
    var best = lines[0].cp;
    var weights = lines.map(function (l) { return Math.exp((Math.max(l.cp, best - 2000) - best) / t); });
    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    var x = rand() * sum;
    for (var i = 0; i < lines.length; i++) {
      x -= weights[i];
      if (x <= 0) return { move: lines[i].move, cp: lines[i].cp, how: i ? "line" + (i + 1) : "best" };
    }
    return { move: lines[0].move, cp: lines[0].cp, how: "best" };
  }

  // The harness's stand-in, kept for when the engine cannot run.
  function fallback(pos) {
    var legal = Rules.legalMoves(pos);
    var takes = legal.filter(function (m) { return pos.board[m.to] !== "." || m.flag === "ep"; });
    var pool = takes.length && Math.random() < 0.7 ? takes : legal;
    var m = pool[Math.floor(Math.random() * pool.length)];
    return m ? { move: uciOf(m), cp: null, how: "fallback" } : null;
  }

  // ---------------------------------------------------------------- worker

  var worker = null;
  var started = null;   // Promise<boolean>: whether the engine came up
  var listener = null;  // the current request's line handler
  var queue = Promise.resolve();

  function post(cmd) { worker.postMessage(cmd); }

  // Resolves once `test(line)` is true for a line the engine prints, with
  // that line; rejects after `ms`.
  function until(test, ms, onLine) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { listener = null; reject(new Error("engine timed out")); }, ms);
      listener = function (line) {
        if (onLine) onLine(line);
        if (!test(line)) return;
        clearTimeout(timer);
        listener = null;
        resolve(line);
      };
    });
  }

  // Start the worker, at most once. Safe to call early (on opening the
  // computer screen) so the 7 MB download overlaps with picking a level.
  function warm() {
    if (started) return started;
    started = new Promise(function (resolve) {
      try {
        if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return resolve(false);
        worker = new Worker(ENGINE_URL);
      } catch (err) {
        console.warn("[chess] engine failed to start", err);
        return resolve(false);
      }
      worker.onmessage = function (e) { if (listener && typeof e.data === "string") listener(e.data); };
      worker.onerror = function (e) {
        console.warn("[chess] engine error", e && e.message);
        if (listener) listener("__error__");
      };
      var ready = until(function (l) { return l === "uciok" || l === "__error__"; }, START_TIMEOUT_MS).then(function (l) {
        if (l === "__error__") throw new Error("engine failed to load");
        post("isready");
        return until(function (x) { return x === "readyok"; }, START_TIMEOUT_MS);
      });
      post("uci");
      ready.then(function () { resolve(true); }, function (err) {
        console.warn("[chess] engine unavailable", err);
        try { worker.terminate(); } catch (_) {}
        worker = null;
        resolve(false);
      });
    });
    return started;
  }

  function parseInfo(line) {
    var mpv = /\bmultipv (\d+)/.exec(line);
    var cp = /\bscore cp (-?\d+)/.exec(line);
    var mate = /\bscore mate (-?\d+)/.exec(line);
    var pv = /\bpv (\S+)/.exec(line);
    if (!pv || (!cp && !mate) || / (upperbound|lowerbound)/.test(line)) return null;
    var score = cp ? Number(cp[1]) : (Number(mate[1]) > 0 ? MATE - Number(mate[1]) : -MATE - Number(mate[1]));
    return { k: mpv ? Number(mpv[1]) : 1, move: pv[1], cp: score };
  }

  // Ask the engine for its lines in `fen` at the settings for `rating`.
  function search(fen, rating, legalCount) {
    var strong = rating >= STRONG_FROM;
    var lines = {};
    post("setoption name UCI_LimitStrength value " + (strong ? "true" : "false"));
    if (strong) post("setoption name UCI_Elo value " + TUNING.elo(rating));
    post("setoption name MultiPV value " + (strong ? 1 : Math.max(1, Math.min(MULTIPV, legalCount))));
    post("position fen " + fen);
    var done = until(function (l) { return l.indexOf("bestmove") === 0 || l === "__error__"; }, MOVE_TIMEOUT_MS, function (l) {
      if (l.indexOf("info ") !== 0) return;
      var info = parseInfo(l);
      if (info) lines[info.k] = info;
    });
    post(strong ? "go movetime " + TUNING.movetime(rating) : "go depth " + TUNING.depth(rating));
    return done.then(function (l) {
      if (l === "__error__") throw new Error("engine error");
      var best = /^bestmove (\S+)/.exec(l);
      var out = Object.keys(lines).sort(function (a, b) { return a - b; }).map(function (k) { return lines[k]; });
      // With strength limited, Stockfish may play a move other than its pv's first.
      if (strong && best && best[1] !== "(none)") out = [{ move: best[1], cp: out.length ? out[0].cp : 0 }];
      return out;
    });
  }

  // The bot's move in `pos` for a player of `rating`: { move: "e7e5", cp, how }.
  // `cp` is the engine's view of the position from the bot's side (null when
  // the move was random), which computer.js uses to resign and to answer
  // draw offers. Requests run one at a time.
  function choose(pos, rating, halfmove, fullmove) {
    var job = queue.then(function () {
      return warm().then(function (ok) {
        var legal = Rules.legalMoves(pos).map(uciOf);
        if (!legal.length) return null;
        if (!ok) return fallback(pos);
        return search(toFen(pos, halfmove, fullmove), rating, legal.length).then(function (lines) {
          lines = lines.filter(function (l) { return legal.indexOf(l.move) !== -1; });
          var choice = pick(lines, legal, rating);
          // pick's cp is the chosen line's; the position's worth is the best line's.
          if (choice && lines.length) choice.eval = lines[0].cp;
          return choice;
        }).catch(function (err) {
          console.warn("[chess] engine search failed", err);
          return fallback(pos);
        });
      });
    });
    queue = job.catch(function () {});
    return job;
  }

  var api = { warm: warm, choose: choose, pick: pick, toFen: toFen, TUNING: TUNING, STRONG_FROM: STRONG_FROM, MATE: MATE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(typeof window !== "undefined" ? window : this);
