// Games against the computer. They never touch the match server: each one is
// a small record in the game's own storage (OR.storage, which a guest gets
// from the host's localStorage), replayed with js/rules.js into a view shaped
// exactly like the server's MatchView. So the match screen, the move log, the
// list rows and the result card all work on them unchanged, and application.js
// only has to ask `isLocal(uuid)` where the two really differ (no chat, no
// nudge, a rematch that needs no server).
//
// `wrap(OR.matches)` gives application.js one `matches` object: verbs on a
// `cpu-` uuid are answered here, everything else goes to the host, and
// `list` is both lists together.
//
// The opponent: pick a level, and `roll` makes up someone at it, a name and a
// rating inside the level's band. The rating drives js/engine.js. It is what
// the bot is meant to play like, not a measured Elo.
//
// A record: { id, bot: { name, rating, level, line }, me: "w" | "b",
// moves: "e2e4 e7e5 g1f3=" (UCI, "=" marks a draw offer sent with the move),
// end: null | { type: "resign", seat } | { type: "agreed" },
// created, updated, ev } where `ev` is the bot's last evaluation, for resigning.

(function (root) {
  var Rules = root.ChessRules;
  var Engine = root.ChessEngine;
  var PREFIX = "cpu-";
  var STORE_KEY = "cpu.v1";
  var LOCAL_KEY = "chess.cpu.v1";
  var MAX_BYTES = 15000;   // under storage's 16 KB per value
  var KEEP_FINISHED = 12;
  var BOT_UUID = "00000000-0000-4000-8000-00000000c0de";

  // The levels a player picks from, weakest first. `min`–`max` is the band a
  // rolled opponent's rating falls in.
  var LEVELS = [
    { id: "beginner", name: "Beginner", min: 250, max: 650, blurb: "Knows how the pieces move. Leaves things hanging." },
    { id: "casual", name: "Casual", min: 650, max: 1050, blurb: "Plays for fun, spots the obvious, misses the rest." },
    { id: "club", name: "Club", min: 1050, max: 1450, blurb: "Solid basics. Punishes loose pieces." },
    { id: "strong", name: "Strong", min: 1450, max: 1850, blurb: "Rarely blunders. Needs a real plan to beat." },
    { id: "expert", name: "Expert", min: 1850, max: 2250, blurb: "Sharp tactics, good endgames." },
    { id: "master", name: "Master", min: 2250, max: 2700, blurb: "Plays like a titled player. Good luck." }
  ];

  var FIRST = ["Clover", "Thistle", "Bramble", "Pip", "Juniper", "Hazel", "Moss", "Biscuit", "Nutmeg", "Pepper",
    "Sorrel", "Fern", "Basil", "Maple", "Wren", "Toffee", "Marigold", "Rye", "Quince", "Barley", "Poppy", "Tansy",
    "Alder", "Bracken", "Sable", "Dandelion", "Cobble", "Mallow", "Rowan", "Sprout"];
  var LAST = ["Burrows", "Longears", "Meadowby", "Ashgrove", "Hollins", "Fenwick", "Dewberry", "Warrenby",
    "Hedgerow", "Thornfield", "Briarwood", "Puddleby", "Oakhollow", "Fernsby", "Clovermead", "Hopgood",
    "Mosswick", "Larkspur", "Sweetbriar", "Rootley"];
  var LINES = {
    beginner: ["Still working out how the knight moves.", "Thinks the queen is just a very big pawn.", "Has never heard of en passant and won’t believe you."],
    casual: ["Plays on the bus to work.", "Knows one opening and loves it.", "Will grab any pawn you leave lying around."],
    club: ["Tuesday nights at the club, rain or shine.", "Has opinions about the Sicilian.", "Counts every exchange twice."],
    strong: ["Studies endgames for fun.", "Rarely hangs a piece. Rarely.", "Happy to grind out a long game."],
    expert: ["Has a favourite gambit and a backup.", "Sees three moves ahead, minimum.", "Remembers every game they’ve lost."],
    master: ["Plays blindfold on weekends.", "Doesn’t make mistakes. Mostly.", "Tournament-hardened and calm about it."]
  };

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return LEVELS[0];
  }

  function any(list, rand) { return list[Math.floor((rand || Math.random)() * list.length)]; }

  // A made-up opponent at `levelId`. `not` is a name to avoid (the last roll).
  function roll(levelId, not) {
    var level = levelById(levelId), name;
    do { name = any(FIRST) + " " + any(LAST); } while (name === not);
    return {
      name: name,
      rating: Math.round(level.min + Math.random() * (level.max - level.min)),
      level: level.id,
      line: any(LINES[level.id])
    };
  }

  // -------------------------------------------------------------- the store

  var store = { games: {}, loaded: null, saving: Promise.resolve(), storage: null, user: null };
  var watchers = {};
  var thinking = {};
  var changed = [];

  function useLocalStorage() {
    return {
      get: function () { try { return Promise.resolve(localStorage.getItem(LOCAL_KEY)); } catch (_) { return Promise.resolve(null); } },
      set: function (k, v) { try { localStorage.setItem(LOCAL_KEY, v); } catch (_) {} return Promise.resolve(); }
    };
  }

  // `opts.storage` is OR.storage where the host has it; `opts.user` is OR.user
  // (null for a guest). Loads the saved games and starts any bot whose move it is.
  function init(opts) {
    if (store.loaded) return store.loaded;
    store.storage = opts.storage || useLocalStorage();
    store.user = opts.user || null;
    store.loaded = store.storage.get(STORE_KEY).then(function (raw) {
      var saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved.games)) {
        saved.games.forEach(function (g) { if (g && typeof g.id === "string" && g.bot) store.games[g.id] = g; });
      }
    }).catch(function (err) {
      console.warn("[chess] couldn't load computer games", err);
    }).then(function () {
      Object.keys(store.games).forEach(botTurnIfDue);
    });
    return store.loaded;
  }

  // Everything, newest first, trimmed to fit: every unfinished game, then as
  // many finished ones as fit under KEEP_FINISHED and the size cap.
  function save() {
    var all = Object.keys(store.games).map(function (id) { return store.games[id]; })
      .sort(function (a, b) { return b.updated - a.updated; });
    var open = all.filter(function (g) { return !build(g).over; });
    var done = all.filter(function (g) { return build(g).over; }).slice(0, KEEP_FINISHED);
    var keep = open.concat(done);
    var text = JSON.stringify({ games: keep });
    while (text.length > MAX_BYTES && keep.length > 1) {
      keep.pop();
      text = JSON.stringify({ games: keep });
    }
    store.games = {};
    keep.forEach(function (g) { store.games[g.id] = g; });
    store.saving = store.saving.then(function () {
      return store.storage.set(STORE_KEY, text);
    }).catch(function (err) { console.warn("[chess] couldn't save computer games", err); });
    return store.saving;
  }

  function newId() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    return PREFIX + s;
  }

  function isLocal(uuid) { return typeof uuid === "string" && uuid.indexOf(PREFIX) === 0; }

  // ------------------------------------------------------------ the referee

  function bare(board) {
    var rest = board.replace(/[.kK]/g, "");
    return rest === "" || (rest.length === 1 && /[nNbB]/.test(rest));
  }

  // Replay a record into the full game state: ChessRules::applyMove, move by
  // move, as the harness and the server do it. Seat 0 is the player, seat 1
  // the bot.
  function build(g) {
    var white = g.me === "w" ? 0 : 1;
    var s = {
      pos: Rules.start(), halfmove: 0, fullmove: 1, ply: 0, positions: {}, history: [],
      last: null, drawOffer: null, result: null, winner: null, over: false, white: white
    };
    var list = g.moves ? g.moves.split(" ") : [];
    for (var i = 0; i < list.length && !s.result; i++) {
      var token = list[i], offer = token.charAt(token.length - 1) === "=";
      var uci = offer ? token.slice(0, -1) : token;
      var seat = s.pos.turn === "w" ? white : 1 - white;
      var legal = Rules.legalMoves(s.pos);
      var mv = Rules.find(s.pos, uci.slice(0, 2), uci.slice(2, 4), uci.charAt(4) || null, legal);
      if (!mv) break;
      var capture = s.pos.board[mv.to] !== "." || mv.flag === "ep";
      var pawn = s.pos.board[mv.from].toLowerCase() === "p";
      var san = Rules.san(s.pos, mv, legal);
      if (s.pos.turn === "b") s.fullmove++;
      s.pos = Rules.play(s.pos, mv);
      s.ply++;
      s.halfmove = pawn || capture ? 0 : s.halfmove + 1;
      if (pawn || capture) s.positions = {};
      var key = [s.pos.board, s.pos.turn, s.pos.castling, s.pos.ep].join(" ");
      s.positions[key] = (s.positions[key] || 0) + 1;
      s.drawOffer = offer ? seat : null;
      s.last = { from: uci.slice(0, 2), to: uci.slice(2, 4), san: san };
      var rec = { type: "move", from: uci.slice(0, 2), to: uci.slice(2, 4) };
      if (mv.promo) rec.promo = mv.promo;
      if (offer) rec.offerDraw = true;
      s.history.push({ ply: s.history.length, seat: seat, move: rec, scoreDelta: 0 });
      if (!Rules.legalMoves(s.pos).length) {
        s.result = Rules.inCheck(s.pos.board, s.pos.turn) ? { type: "checkmate", winner: seat } : { type: "stalemate" };
        s.winner = s.result.type === "checkmate" ? seat : null;
      } else if (s.positions[key] >= 3) s.result = { type: "repetition" };
      else if (s.halfmove >= 100) s.result = { type: "fifty" };
      else if (bare(s.pos.board)) s.result = { type: "material" };
    }
    if (!s.result && g.end) {
      if (g.end.type === "agreed") {
        s.result = { type: "agreed" };
        s.history.push({ ply: s.history.length, seat: 0, move: { type: "acceptDraw" }, scoreDelta: 0 });
        s.drawOffer = null;
      } else if (g.end.type === "resign") {
        s.resigned = g.end.seat;
        s.winner = 1 - g.end.seat;
        s.drawOffer = null;
      }
    }
    s.over = !!s.result || s.resigned !== undefined;
    s.turnSeat = s.over ? null : (s.pos.turn === "w" ? white : 1 - white);
    return s;
  }

  function versionOf(g) {
    return (g.moves ? g.moves.split(" ").length : 0) + (g.end ? 1 : 0) + 1;
  }

  // The record as the server's MatchView.
  function view(g) {
    var s = build(g);
    var iso = new Date(g.updated).toISOString();
    var user = store.user;
    var players = [
      { seat: 0, uuid: user ? user.uuid : "guest", username: user ? user.username : "you", avatar: user ? user.avatar || null : null,
        status: s.resigned === 0 ? "resigned" : "joined", score: 0, isSelf: true },
      { seat: 1, uuid: BOT_UUID, username: g.bot.name, avatar: null,
        status: s.resigned === 1 ? "resigned" : "joined", score: 0, isSelf: false,
        bot: { rating: g.bot.rating, level: g.bot.level, line: g.bot.line } }
    ];
    var lastMove = s.history.length ? s.history[s.history.length - 1] : null;
    return {
      matchUuid: g.id, game: "chess", local: true, status: s.over ? "finished" : "active", version: versionOf(g), maxPlayers: 2,
      players: players, turnSeat: s.turnSeat, turnDeadline: null, winnerSeat: s.over ? s.winner : null,
      turnStartedAt: s.over ? null : iso, mySeat: 0, mySeatStatus: "joined",
      isMyTurn: !s.over && s.turnSeat === 0, updatedAt: iso, joinCode: null,
      recap: s.last ? { san: s.last.san } : null, matchmaking: false, chatUnread: 0,
      thinking: !s.over && s.turnSeat === 1,
      view: {
        board: s.pos.board, white: s.white, turn: s.pos.turn, castling: s.pos.castling, ep: s.pos.ep,
        halfmove: s.halfmove, fullmove: s.fullmove, ply: s.ply, drawOffer: s.drawOffer,
        last: s.last, result: s.result, check: !s.result && Rules.inCheck(s.pos.board, s.pos.turn), history: s.history
      },
      lastMove: lastMove
    };
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

  // ------------------------------------------------------------ the bot

  // Time a move should seem to take, so replies don't land the instant the
  // player lets go: longer for stronger bots and busier positions.
  function thinkMs(g, s) {
    var base = 500 + Math.min(1200, g.bot.rating / 2);
    return base * (0.6 + Math.random() * 0.8) * (s.ply < 6 ? 0.6 : 1);
  }

  function botTurnIfDue(id) {
    var g = store.games[id];
    if (!g || thinking[id]) return;
    var s = build(g);
    if (s.over || s.turnSeat !== 1) return;
    thinking[id] = true;
    var startedAt = Date.now();
    var moves = g.moves;
    Engine.choose(s.pos, g.bot.rating, s.halfmove, s.fullmove).then(function (choice) {
      var wait = Math.max(0, thinkMs(g, s) - (Date.now() - startedAt));
      return new Promise(function (resolve) { setTimeout(function () { resolve(choice); }, wait); });
    }).then(function (choice) {
      thinking[id] = false;
      var now = store.games[id];
      // Resigned, or otherwise changed, while the bot was thinking.
      if (!now || now.moves !== moves || now.end) return;
      var ev = choice && typeof choice.eval === "number" ? choice.eval : null;
      if (ev !== null && answerDraw(now, s, ev)) { now.end = { type: "agreed" }; }
      else if (ev !== null && wantsToResign(now, ev)) { now.end = { type: "resign", seat: 1 }; }
      else if (choice && choice.move) { now.moves = (now.moves ? now.moves + " " : "") + choice.move; }
      else return;
      now.ev = ev;
      now.updated = Date.now();
      save();
      notify(id);
      changed.forEach(function (fn) { fn(id); });
    }).catch(function (err) {
      thinking[id] = false;
      console.error("[chess] the computer couldn't move", err);
    });
  }

  // The player offered a draw with their last move: a bot that is clearly
  // worse takes it, and so does one in a long, level game. `ev` is from the
  // bot's side.
  function answerDraw(g, s, ev) {
    if (s.drawOffer !== 0) return false;
    return ev <= -150 || (s.ply >= 60 && Math.abs(ev) <= 40);
  }

  // Club players and up resign a lost position (down most of a queen, twice
  // running) rather than play it out. Weaker bots play on, as people do.
  function wantsToResign(g, ev) {
    return g.bot.rating >= 1050 && ev <= -700 && typeof g.ev === "number" && g.ev <= -700;
  }

  // -------------------------------------------------------------- the verbs

  // A new game against `bot` (from `roll`). `color` is "w", "b" or "random".
  function create(bot, color) {
    var me = color === "w" || color === "b" ? color : (Math.random() < 0.5 ? "w" : "b");
    var g = { id: newId(), bot: bot, me: me, moves: "", end: null, created: Date.now(), updated: Date.now(), ev: null };
    store.games[g.id] = g;
    save();
    botTurnIfDue(g.id);
    return Promise.resolve(view(g));
  }

  // Same opponent, colours swapped.
  function rematch(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    return create(g.bot, g.me === "w" ? "b" : "w");
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
    if (!mv || mv.type !== "move") return fail("match/illegal-move", "There is no draw offer to accept.");
    var legal = Rules.find(s.pos, mv.from, mv.to, mv.promo || null);
    if (!legal) return fail("match/illegal-move", "That move is not legal.");
    var token = mv.from + mv.to + (legal.promo || "") + (mv.offerDraw ? "=" : "");
    g.moves = (g.moves ? g.moves + " " : "") + token;
    g.updated = Date.now();
    save();
    botTurnIfDue(uuid);
    return Promise.resolve(view(g));
  }

  function resign(uuid) {
    var g = store.games[uuid];
    if (!g) return fail("match/not-found", "That game is gone.");
    if (!build(g).over) {
      g.end = { type: "resign", seat: 0 };
      g.updated = Date.now();
      save();
    }
    return Promise.resolve(view(g));
  }

  // Calls `cb(view)` whenever the game changes. Returns the unsubscribe.
  function watch(uuid, cb) {
    (watchers[uuid] = watchers[uuid] || []).push(cb);
    botTurnIfDue(uuid);
    return function () {
      watchers[uuid] = (watchers[uuid] || []).filter(function (x) { return x !== cb; });
    };
  }

  // One `matches` for application.js. `online()` says whether the host's
  // match verbs may be used at all (signed in, and the host has them); when
  // not, `list` is the computer games alone.
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

  var api = {
    LEVELS: LEVELS, levelById: levelById, roll: roll, init: init, isLocal: isLocal, create: create, rematch: rematch,
    wrap: wrap, warm: function () { return Engine.warm(); },
    // `fn(uuid)` after the computer moves in any game, for the list.
    onChange: function (fn) { changed.push(fn); },
    // For tests.
    _build: build, _view: view
  };
  root.ChessComputer = api;
})(typeof window !== "undefined" ? window : this);
