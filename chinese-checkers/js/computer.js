// Games against the computer. They never touch the match server: each is a
// small record in the game's own storage (OR.storage, which a guest gets from
// the host's localStorage), replayed with js/rules.js into a view shaped
// exactly like the server's MatchView. So the match screen, the move log, the
// list rows and the result card all work on them unchanged, and
// application.js only asks `view.local` where the two really differ (no
// chat, no nudge, a rematch that needs no server, take back and hint).
//
// `wrap(OR.matches)` gives application.js one `matches` object: verbs on a
// `cpu-` uuid are answered here, everything else goes to the host, and `list`
// is both lists together.
//
// You are seat 0 and move first; the computer players are seats 1… in turn
// order round the star. Two, three, four or six at the table (six only here:
// the platform seats four at most).
//
// A record: { id, seats, level, bots: [{ name, line }] (seat 1 first),
// moves: "12-30 44-61 p …" (from-to by hole number, "p" a pass), end: null |
// { type: "resign", seat: 0 }, created, updated, takebacks, hints, counted }.
// The record against the computer is kept beside the games, per level:
// { easy: { w, l }, … }. It outlives the games, which are trimmed.

(function (root) {
  var R = root.CCRules;
  var Bot = root.CCBot;
  var PREFIX = "cpu-";
  var STORE_KEY = "cpu.v1";
  var LOCAL_KEY = "chinese-checkers.cpu.v1";
  var MAX_BYTES = 15000;   // under storage's 16 KB per value
  var KEEP_FINISHED = 10;
  var BOT_UUID = "00000000-0000-4000-8000-00000000cc0";

  var LEVELS = [
    { id: "easy", name: "Easy", blurb: "Hops about happily and often takes the scenic route." },
    { id: "normal", name: "Steady", blurb: "Always heads for home, one good move at a time." },
    { id: "hard", name: "Sharp", blurb: "Plans its jumps ahead and builds long ladders." }
  ];
  var TABLES = [2, 3, 4, 6];

  var FIRST = ["Clover", "Thistle", "Bramble", "Pip", "Juniper", "Hazel", "Moss", "Biscuit", "Nutmeg", "Pepper",
    "Sorrel", "Fern", "Basil", "Maple", "Wren", "Toffee", "Marigold", "Rye", "Quince", "Barley", "Poppy", "Tansy",
    "Alder", "Bracken", "Sable", "Dandelion", "Cobble", "Mallow", "Rowan", "Sprout"];
  var LINES = {
    easy: ["Likes the scenic route.", "Just here for the hopping.", "Counts jumps on their paws.", "Gets distracted by shiny marbles."],
    normal: ["Steady and sure-footed.", "Never takes a step backwards.", "Knows the way home.", "Quietly gets there."],
    hard: ["Builds ladders three jumps long.", "Sees the whole star at once.", "Leaves no marble behind.", "Has never lost a race. Allegedly."]
  };

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return LEVELS[1];
  }

  function any(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** `count` made-up opponents at `levelId`, with different names. */
  function roll(levelId, count, not) {
    var level = levelById(levelId), used = {}, out = [];
    (not || []).forEach(function (n) { used[n] = true; });
    while (out.length < count) {
      var name = any(FIRST);
      if (used[name] && Object.keys(used).length < FIRST.length) continue;
      used[name] = true;
      out.push({ name: name, line: any(LINES[level.id]) });
    }
    return out;
  }

  // -------------------------------------------------------------- the store

  var store = { games: {}, record: {}, loaded: null, saving: Promise.resolve(), storage: null, user: null };
  var watchers = {};
  var thinking = {};
  var changed = [];

  function useLocalStorage() {
    return {
      get: function () { try { return Promise.resolve(localStorage.getItem(LOCAL_KEY)); } catch (_) { return Promise.resolve(null); } },
      set: function (k, v) { try { localStorage.setItem(LOCAL_KEY, v); } catch (_) {} return Promise.resolve(); }
    };
  }

  function init(opts) {
    if (store.loaded) return store.loaded;
    store.storage = opts.storage || useLocalStorage();
    store.user = opts.user || null;
    store.loaded = store.storage.get(STORE_KEY).then(function (raw) {
      var saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved.games)) {
        saved.games.forEach(function (g) {
          if (g && typeof g.id === "string" && R.SEATS[g.seats] && Array.isArray(g.bots)) store.games[g.id] = g;
        });
      }
      if (saved && saved.record && typeof saved.record === "object") store.record = saved.record;
    }).catch(function (err) {
      console.warn("[chinese-checkers] couldn't load computer games", err);
    }).then(function () {
      Object.keys(store.games).forEach(botTurnIfDue);
    });
    return store.loaded;
  }

  function save() {
    var all = Object.keys(store.games).map(function (id) { return store.games[id]; })
      .sort(function (a, b) { return b.updated - a.updated; });
    var open = all.filter(function (g) { return !build(g).over; });
    var done = all.filter(function (g) { return build(g).over; }).slice(0, KEEP_FINISHED);
    var keep = open.concat(done);
    var text = JSON.stringify({ games: keep, record: store.record });
    while (text.length > MAX_BYTES && keep.length > 1) {
      keep.pop();
      text = JSON.stringify({ games: keep, record: store.record });
    }
    store.games = {};
    keep.forEach(function (g) { store.games[g.id] = g; });
    Object.keys(built).forEach(function (id) { if (!store.games[id]) delete built[id]; });
    store.saving = store.saving.then(function () {
      return store.storage.set(STORE_KEY, text);
    }).catch(function (err) { console.warn("[chinese-checkers] couldn't save computer games", err); });
    return store.saving;
  }

  function newId() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    return PREFIX + s;
  }

  function isLocal(uuid) { return typeof uuid === "string" && uuid.indexOf(PREFIX) === 0; }

  // ------------------------------------------------------------ the referee

  var built = {};

  function build(g) {
    var key = g.moves + "|" + (g.end ? JSON.stringify(g.end) : "");
    var hit = built[g.id];
    if (hit && hit.key === key) return hit.s;
    var s = replayGame(g);
    built[g.id] = { key: key, s: s };
    return s;
  }

  // The record replayed through rules.js, as the server would apply it.
  function replayGame(g) {
    var st = { seats: g.seats, board: R.start(g.seats), moves: 0, last: null, winner: null };
    var history = [], turn = 0, lastBy = {};
    var tokens = g.moves ? g.moves.split(" ") : [];
    for (var i = 0; i < tokens.length && st.winner === null; i++) {
      var t = tokens[i], move;
      if (t === "p") move = { type: "pass" };
      else {
        var parts = t.split("-");
        move = { type: "move", from: Number(parts[0]), to: Number(parts[1]) };
      }
      try { st = R.apply(st, turn, move); } catch (_) { break; }
      history.push({ ply: history.length, seat: turn, move: move, scoreDelta: 0 });
      if (move.type === "move") lastBy[turn] = { from: move.from, to: move.to };
      turn = (turn + 1) % g.seats;
    }
    var s = { st: st, history: history, turn: turn, lastBy: lastBy, winner: st.winner, resigned: null };
    if (st.winner === null && g.end && g.end.type === "resign") {
      // You left the race: whoever was closest to home takes it.
      s.resigned = 0;
      var best = null;
      for (var seat = 1; seat < g.seats; seat++) {
        var left = R.remaining(st.board, g.seats, seat);
        if (best === null || left < best.left) best = { seat: seat, left: left };
      }
      s.winner = best.seat;
    }
    s.over = s.winner !== null;
    s.turnSeat = s.over ? null : turn;
    return s;
  }

  // Always rising, as the server's is: a takeback removes at most a round,
  // so counting a table's worth per takeback keeps it moving up.
  function versionOf(g) {
    return (g.moves ? g.moves.split(" ").length : 0) + (g.end ? 1 : 0) + 1 + 7 * (g.takebacks || 0);
  }

  function view(g) {
    var s = build(g);
    var iso = new Date(g.updated).toISOString();
    var user = store.user;
    var players = [{ seat: 0, uuid: user ? user.uuid : "guest", username: user ? user.username : "you",
      avatar: user ? user.avatar || null : null, status: s.resigned === 0 ? "resigned" : "joined", score: 0, isSelf: true }];
    g.bots.forEach(function (b, i) {
      players.push({ seat: i + 1, uuid: BOT_UUID + (i + 1), username: b.name, avatar: null, status: "joined", score: 0,
        isSelf: false, bot: { level: g.level, line: b.line } });
    });
    var lastMove = s.history.length ? s.history[s.history.length - 1] : null;
    var last = s.st.last && s.st.last.path ? s.st.last : null;
    return {
      matchUuid: g.id, game: "chinese-checkers", local: true, status: s.over ? "finished" : "active",
      version: versionOf(g), maxPlayers: g.seats,
      players: players, turnSeat: s.turnSeat, turnDeadline: null, winnerSeat: s.over ? s.winner : null,
      turnStartedAt: s.over ? null : iso, mySeat: 0, mySeatStatus: s.resigned === 0 ? "resigned" : "joined",
      isMyTurn: !s.over && s.turnSeat === 0, updatedAt: iso, joinCode: null,
      recap: last ? { hops: last.path.length - 1, jump: R.describe(last.path) !== "a step" } : null,
      matchmaking: false, chatUnread: 0, thinking: !s.over && s.turnSeat !== 0,
      takebacks: g.takebacks || 0, hints: g.hints || 0, level: g.level,
      view: { seats: g.seats, board: s.st.board, moves: s.st.moves, last: last, winner: s.st.winner, history: s.history },
      lastMove: lastMove
    };
  }

  function tally(g) {
    if (g.counted) return false;
    var s = build(g);
    if (!s.over) return false;
    var r = store.record[g.level] = store.record[g.level] || { w: 0, l: 0 };
    if (s.winner === 0) r.w++;
    else r.l++;
    g.counted = true;
    return true;
  }

  function commit(id, quiet) {
    var g = store.games[id];
    if (!g) return;
    g.updated = Date.now();
    tally(g);
    save();
    if (!quiet) notify(id);
    changed.forEach(function (fn) { fn(id); });
  }

  function fail(code, message) {
    var err = new Error(message);
    err.code = code;
    return Promise.reject(err);
  }

  function notify(id) {
    var g = store.games[id];
    if (!g || !watchers[id]) return;
    var v = view(g);
    watchers[id].slice().forEach(function (cb) { try { cb(v); } catch (err) { console.error(err); } });
  }

  // ------------------------------------------------------------ the bots

  // A move should seem to take a moment, so a table of bots plays out at a
  // pace the eye can follow: long enough to see each hop land.
  function thinkMs(g, s) {
    var base = { easy: 650, normal: 800, hard: 950 }[g.level] || 800;
    return base * (0.75 + Math.random() * 0.5) * (s.st.moves < g.seats * 2 ? 0.75 : 1);
  }

  function botTurnIfDue(id) {
    var g = store.games[id];
    if (!g || thinking[id]) return;
    var s = build(g);
    if (s.over || s.turnSeat === 0) return;
    thinking[id] = true;
    var moves = g.moves;
    var seat = s.turnSeat;
    setTimeout(function () {
      thinking[id] = false;
      var now = store.games[id];
      // Resigned, taken back, or otherwise changed while it was thinking:
      // drop this answer, and look again at whose turn it is now (a bot
      // whose own turn came round while this one held the lock would
      // otherwise never be started).
      if (!now || now.moves !== moves || now.end) { botTurnIfDue(id); return; }
      var m = Bot.choose(s.st.board, g.seats, seat, g.level, s.lastBy[seat]);
      now.moves = (now.moves ? now.moves + " " : "") + (m ? m.from + "-" + m.to : "p");
      commit(id);
      botTurnIfDue(id);
    }, thinkMs(g, s));
  }

  // -------------------------------------------------------------- the verbs

  /** A new game at a table of `seats` against `bots` (from `roll`) at `level`. */
  function create(seats, level, bots) {
    if (!R.SEATS[seats] || seats < 2) return fail("match/invalid", "Pick 2, 3, 4 or 6 players.");
    var g = { id: newId(), seats: seats, level: levelById(level).id, bots: bots.slice(0, seats - 1), moves: "", end: null,
      created: Date.now(), updated: Date.now(), takebacks: 0, hints: 0 };
    while (g.bots.length < seats - 1) g.bots = g.bots.concat(roll(g.level, seats - 1 - g.bots.length, g.bots.map(function (b) { return b.name; })));
    store.games[g.id] = g;
    save();
    return Promise.resolve(view(g));
  }

  function rematch(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    return create(g.seats, g.level, g.bots);
  }

  function list() {
    return Promise.resolve(Object.keys(store.games).map(function (id) { return view(store.games[id]); }));
  }

  function get(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    botTurnIfDue(uuid);
    return Promise.resolve(view(g));
  }

  function move(uuid, version, mv) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    var s = build(g);
    if (s.over) return fail("match/not-active", "This game is over.");
    if (version !== versionOf(g)) return fail("match/version-conflict", "The game moved on.");
    if (s.turnSeat !== 0) return fail("match/not-your-turn", "It isn’t your move.");
    try { R.apply(s.st, 0, mv || {}); } catch (err) { return fail("match/illegal-move", err.message); }
    g.moves = (g.moves ? g.moves + " " : "") + (mv.type === "pass" ? "p" : mv.from + "-" + mv.to);
    commit(uuid, true);
    botTurnIfDue(uuid);
    return Promise.resolve(view(g));
  }

  function resign(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    if (!build(g).over) {
      g.end = { type: "resign", seat: 0 };
      commit(uuid, true);
    }
    return Promise.resolve(view(g));
  }

  // Take back your last move and every reply since, so it is your move again
  // in the position before it. A bot still thinking finds the game changed
  // and drops its answer.
  function takeback(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    if (build(g).over) return fail("match/not-active", "This game is over.");
    var list = g.moves ? g.moves.split(" ") : [];
    var last = -1;
    for (var i = list.length - 1; i >= 0; i--) if (i % g.seats === 0) { last = i; break; }
    if (last === -1) return fail("match/illegal-move", "There’s no move of yours to take back.");
    g.moves = list.slice(0, last).join(" ");
    g.takebacks = (g.takebacks || 0) + 1;
    commit(uuid, true);
    botTurnIfDue(uuid);
    return Promise.resolve(view(g));
  }

  /** The Sharp computer's move for you: { from, to, path }, or null. */
  function hint(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    var s = build(g);
    if (s.over || s.turnSeat !== 0) return fail("match/not-your-turn", "It isn’t your move.");
    var m = Bot.choose(s.st.board, g.seats, 0, "hard", s.lastBy[0]);
    if (m) {
      g.hints = (g.hints || 0) + 1;
      save();
    }
    return Promise.resolve(m);
  }

  function record() {
    var out = {};
    LEVELS.forEach(function (l) {
      var r = store.record[l.id] || {};
      out[l.id] = { w: r.w || 0, l: r.l || 0 };
    });
    return out;
  }

  function watch(uuid, cb) {
    (watchers[uuid] = watchers[uuid] || []).push(cb);
    botTurnIfDue(uuid);
    return function () {
      watchers[uuid] = (watchers[uuid] || []).filter(function (x) { return x !== cb; });
    };
  }

  function wrap(remote, online) {
    function route(local, name) {
      return function (payload) {
        if (payload && isLocal(payload.matchUuid)) return local(payload);
        return remote[name](payload);
      };
    }
    var out = {
      list: function (payload) {
        var theirs = online() ? remote.list(payload) : Promise.resolve([]);
        return Promise.all([theirs, (store.loaded || Promise.resolve()).then(list)]).then(function (both) { return both[0].concat(both[1]); });
      },
      get: route(function (p) { return get(p.matchUuid); }, "get"),
      move: route(function (p) { return move(p.matchUuid, p.version, p.move); }, "move"),
      resign: route(function (p) { return resign(p.matchUuid); }, "resign"),
      watch: function (uuid, cb, opts) { return isLocal(uuid) ? watch(uuid, cb) : remote.watch(uuid, cb, opts); }
    };
    ["create", "join", "quick", "invitable", "searchPlayers", "nudge", "claim", "chat", "chatSend"].forEach(function (name) {
      out[name] = function (payload) { return remote[name](payload); };
    });
    return out;
  }

  root.CCComputer = {
    LEVELS: LEVELS, TABLES: TABLES, levelById: levelById, roll: roll, init: init, isLocal: isLocal, create: create,
    rematch: rematch, takeback: takeback, hint: hint, record: record,
    loaded: function () { return store.loaded || Promise.resolve(); },
    wrap: wrap,
    onChange: function (fn) { changed.push(fn); },
    _build: build, _view: view
  };
})(typeof window !== "undefined" ? window : this);
