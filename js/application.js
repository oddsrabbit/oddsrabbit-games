// Bootstrap and screens for Word Battle, slug `word-battle`.
//
// Three screens: the match list, the new-game setup, and one match. Every
// piece of game state on screen comes from the server's per-viewer MatchView
// (`OR.matches.get` / the `watch` poll): this file holds only the tiles the
// player is in the middle of laying down (`pending`) and which tile is
// selected. A move is sent as an ACTION — the tiles placed, the letters
// exchanged, or a pass — and the server answers with the new view or a
// `match/*` reason, which is shown verbatim.
//
// The whole multiplayer surface is gated on `capabilities.has('matches.get')`
// after `whenReady()`: the mobile host ships these verbs behind App Store
// review, and a button that always fails is worse than no button.
//
// Rendering rules shared with every game here: usernames go through
// `textContent`, never `innerHTML`; avatars come from the shared leaderboard
// component so they hash to the same colour everywhere. (The one `innerHTML`
// below writes a fixed how-to-play string with nothing interpolated into it.)

(function () {
  var OR = window.OddsRabbit;
  var UI = window.OddsRabbitUI;
  var Rules = window.TilesRules;
  if (!OR) {
    showFatal("This game needs to run inside the OddsRabbit app or website.");
    return;
  }

  // The RULES-CLASS id the server selects on, not the app slug. It stays
  // "tiles" whatever the game is called: it is stored in `game` on every match
  // row, `MatchService::rulesFor()` switches on it, and `TilesRules::gameId()`
  // returns it. Renaming it would need a PHP change and a migration of live
  // matches to buy nothing a player can see.
  var GAME = "tiles";
  // Wild boards roll their premium squares per match on the server (see
  // TilesRules::wildLayout); the client just draws the layout each view sends.
  var GAME_WILD = "tiles-wild";

  function isWild(m) { return !!m && m.game === GAME_WILD; }
  var GAME_NAME = "Word Battle";
  // Invite links point at this game's page on the site, which forwards
  // `?target=join&code=…` to us. The slug is read from where we are served
  // (apps.oddsrabbit.com/<slug>/) rather than written down here, so a link
  // can never name a page that the registry calls something else.
  var SLUG = (function () {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts.length && /\.html?$/.test(parts[parts.length - 1])) parts.pop();
    var last = parts[parts.length - 1];
    return last && /^[a-z0-9-]{1,64}$/.test(last) ? last : "word-battle";
  })();
  var LANDING_URL = "https://www.oddsrabbit.com/games/" + SLUG + "/";
  var JOIN_STASH = "rwb.joinCode";
  // A stashed invite outlives the tab (localStorage) so a friend who signs up
  // in a new tab still gets their seat — but not forever.
  var JOIN_STASH_MS = 24 * 3600 * 1000;
  var LIST_POLL_MS = 20000;
  // `matches.invitable` answers at most 200 rows per call, so a follow graph
  // bigger than that has to be paged with `offset` — otherwise search runs
  // over a truncated list and reports people missing who are not.
  var INVITABLE_PAGE = 200;
  // 20 pages is 4000 people, past any real follow graph, and it bounds the
  // work if a host ever answers pages that never shorten.
  var INVITABLE_MAX_PAGES = 20;
  // Below this many people a search field is just another thing on screen.
  var SEARCH_THRESHOLD = 8;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    screens: {
      list: $(".screen-list"),
      choose: $(".screen-choose"),
      "new": $(".screen-new"),
      match: $(".screen-match")
    },
    listBody: $(".match-list"),
    listBand: $(".list-band"),
    listSheet: $(".list-sheet"),
    record: $(".record"),
    listStatus: $(".list-status"),
    hero: $(".hero"),
    heroActions: $(".hero-actions"),
    newGameButtons: $$(".new-game-button"),
    joinOpenButtons: $$(".join-open-button"),
    quickButtons: $$(".quick-button"),
    chooseFriends: $(".choose-friends"),
    chooseJoin: $(".choose-join"),
    findingPanel: $(".finding-panel"),
    findYou: $(".find-you"),
    findThem: $(".find-them"),
    findingSince: $(".finding-since"),
    findingBack: $(".finding-back"),
    findingStop: $(".finding-stop"),
    tableSeats: $(".table-seats"),
    lobbyLink: $(".lobby-link"),
    lobbyLinkField: $(".lobby-link-field"),
    copyLinkButton: $(".copy-link-button"),
    helpButtons: $$(".help-button, .help-link"),
    signIn: $(".sign-in"),
    signInActions: $(".sign-in-actions"),
    signInNote: $(".sign-in-note"),
    unsupported: $(".unsupported"),
    invitableList: $(".invitable-list"),
    invitableEmpty: $(".invitable-empty"),
    inviteSearch: $(".invite-search"),
    inviteInput: $(".invite-input"),
    inviteCount: $(".invite-count"),
    inviteClear: $(".invite-clear"),
    tableNote: $(".table-note"),
    createButton: $(".create-button"),
    createStatus: $(".create-status"),
    backButtons: $$(".back-button"),
    players: $(".players"),
    menuButton: $(".menu-button"),
    turnMain: $(".turn-main"),
    chipBag: $(".chip-bag"),
    chipWild: $(".chip-wild"),
    modeWild: $("#mode-wild"),
    modeStandard: $("#mode-standard"),
    turnWarning: $(".turn-warning"),
    stall: $(".stall"),
    stallText: $(".stall-text"),
    nudgeButton: $(".nudge-button"),
    claimButton: $(".claim-button"),
    lastMove: $(".last-move"),
    lobbyPanel: $(".lobby-panel"),
    lobbyLead: $(".lobby-lead"),
    lobbyCode: $(".lobby-code"),
    waitingSeats: $(".waiting-seats"),
    waitingTitle: $(".waiting-title"),
    lobbyBack: $(".lobby-back"),
    lobbyClose: $(".lobby-close"),
    shareCodeButton: $(".share-code-button"),
    boardWrap: $(".board-wrap"),
    boardCanvas: $(".board-canvas"),
    boardStatus: $(".board-status"),
    zoomIn: $(".zoom-in"),
    zoomOut: $(".zoom-out"),
    zoomFit: $(".zoom-fit"),
    scorePop: $(".score-pop"),
    rack: $(".rack"),
    preview: $(".preview"),
    playButton: $(".play-button"),
    recallButton: $(".recall-button"),
    shuffleButton: $(".shuffle-button"),
    exchangeButton: $(".exchange-button"),
    passButton: $(".pass-button"),
    waitBar: $(".wait-bar"),
    waitText: $(".wait-text"),
    waitShuffle: $(".wait-shuffle"),
    over: $(".game-over"),
    rematchButton: $(".rematch-button"),
    movesButton: $(".moves-button"),
    overTitle: $(".game-over-title"),
    overText: $(".game-over-text"),
    overKicker: $(".over-kicker"),
    overScores: $(".over-scores"),
    overHighlights: $(".over-highlights"),
    overBurst: $(".over-burst"),
    overBack: $(".game-over-back"),
    dialogWrap: $(".dialog-backdrop"),
    dialogCard: $(".dialog"),
    dialogTitle: $(".dialog-title"),
    dialogBody: $(".dialog-body"),
    dialogConfirm: $(".dialog-confirm"),
    dialogCancel: $(".dialog-cancel"),
    chatButton: $(".chat-button"),
    chatBadge: $(".chat-badge"),
    chatWrap: $(".chat-backdrop"),
    chatSheet: $(".chat-sheet"),
    chatSub: $(".chat-sub"),
    chatClose: $(".chat-close"),
    chatLog: $(".chat-log"),
    chatOlder: $(".chat-older"),
    chatEmpty: $(".chat-empty"),
    chatList: $(".chat-list"),
    chatQuick: $(".chat-quick"),
    chatForm: $(".chat-form"),
    chatInput: $(".chat-input"),
    chatSend: $(".chat-send"),
    toast: $(".toast")
  };

  var state = {
    screen: "list",
    match: null,
    pending: [],
    rackFree: [],
    selectedRack: null,
    dragSlot: null,
    cancelDrag: null,
    lift: null,
    invalidWords: {},
    nudged: {},
    stopWatch: null,
    invitable: [],
    inviteQuery: "",
    inviteCapped: false,
    inviteRun: 0,
    invitees: {},
    open: false,
    seats: 2,
    creating: false,
    sending: false,
    rows: [],
    listSignature: "",
    spot: null,
    spotLoading: null,
    // matches.check answers, per word, for the session: true is a word.
    dict: {},
    dictPending: {},
    dictOff: false,
    dictTimer: null,
    canQuick: false,
    celebrated: {},
    findTimer: null,
    listTimer: null,
    announcedPly: null,
    pendingFocus: undefined,
    // The open match's conversation (see the chat section); null elsewhere.
    chat: null
  };

  var board = null;
  var dialogState = null;

  // ------------------------------------------------------------ utilities

  function showFatal(text) {
    var node = document.querySelector(".fatal");
    if (node) { node.textContent = text; node.hidden = false; }
  }

  function toast(text, isError) {
    els.toast.textContent = text;
    els.toast.classList.toggle("is-error", !!isError);
    els.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { els.toast.hidden = true; }, 3200);
  }

  function haptic(kind) {
    try { OR.actions.haptic(kind); } catch (_) {}
  }

  // Hosts differ in how much of a rejection survives the bridge: some pass the
  // rules class's reason through ("not-a-word: QZX"), others flatten every
  // failure to one generic sentence. When the text says nothing specific, the
  // error code is the only thing left that does, so it goes in the message
  // rather than being dropped on the floor.
  var GENERIC_ERROR = /^(match|bridge)?\s*operation failed\.?$|^(request|operation) failed\.?$|^error\.?$/i;

  function errorText(err, fallback) {
    var message = err && typeof err.message === "string" ? err.message.trim() : "";
    var code = errorCode(err);
    if (message && (!GENERIC_ERROR.test(message) || !code)) return message;
    if (code) {
      if (message) console.warn("[word-battle]", code, err);
      return (message || fallback) + " (" + code + ")";
    }
    return message || fallback;
  }

  function errorCode(err) {
    return err && typeof err.code === "string" ? err.code : "";
  }

  // Word Battle has no turn clock (TilesRules returns a deadline of 0, so
  // `turnDeadline` is always null). What ends a stalled game instead is
  // scoreless turns: swaps and passes both count, and once every active player
  // has had two in a row the server ends the game and takes each player's
  // leftover tiles off their score. `view.passes` is the run so far.
  function scorelessLeft(view) {
    var v = view.view || {};
    var active = view.players.filter(function (p) { return p.status === "joined"; }).length;
    var passes = typeof v.passes === "number" ? v.passes : 0;
    return 2 * Math.max(1, active) - passes;
  }

  // True when the player on turn swapping or passing now would end the game.
  function scorelessEndsGame(view) {
    return view.status === "active" && scorelessLeft(view) <= 1;
  }

  // No clock also means nothing stops a player from vanishing mid-game. The
  // others can nudge them after a day, and after 14 days end the game scored
  // as it stands (two players) or drop them and play on (three or four). The
  // server holds the same thresholds and has the last word.
  var NUDGE_AFTER_MS = 24 * 3600 * 1000;
  var CLAIM_AFTER_MS = 14 * 24 * 3600 * 1000;

  function waitedMs(view) {
    if (!view.turnStartedAt) return null;
    var ms = Date.now() - new Date(view.turnStartedAt).getTime();
    return isNaN(ms) ? null : ms;
  }

  function waitingOn(view) {
    if (view.status !== "active" || view.isMyTurn || isOut(view) || !meIn(view)) return null;
    return view.players.filter(function (p) { return p.seat === view.turnSeat; })[0] || null;
  }

  function activeCount(view) {
    return view.players.filter(function (p) { return p.status === "joined"; }).length;
  }

  function daysText(ms) {
    var days = Math.floor(ms / 86400000);
    if (days >= 1) return days === 1 ? "a day" : days + " days";
    var hours = Math.max(1, Math.floor(ms / 3600000));
    return hours === 1 ? "an hour" : hours + " hours";
  }

  // "now", "12m", "5h", "3d", then a date: short enough for a list row.
  // `spoken` gives the same thing in words, for the row's aria-label.
  function ago(iso, spoken) {
    var ms = Date.now() - Date.parse(iso);
    if (!iso || isNaN(ms)) return "";
    var min = 60000, hour = 60 * min, day = 24 * hour;
    function say(n, unit, short) {
      return spoken ? n + " " + unit + (n === 1 ? "" : "s") + " ago" : n + short;
    }
    if (ms < min) return spoken ? "just now" : "now";
    if (ms < hour) return say(Math.floor(ms / min), "minute", "m");
    if (ms < day) return say(Math.floor(ms / hour), "hour", "h");
    if (ms < 7 * day) return say(Math.floor(ms / day), "day", "d");
    var date = new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return spoken ? "on " + date : date;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function avatar(username, url) {
    if (UI && typeof UI.leaderboardAvatar === "function") return UI.leaderboardAvatar(username, url);
    return el("span", "avatar-fallback", (username || "?").charAt(0).toUpperCase());
  }

  function meIn(view) {
    for (var i = 0; i < view.players.length; i++) if (view.players[i].isSelf) return view.players[i];
    return null;
  }

  function opponentsOf(view) {
    return view.players.filter(function (p) { return !p.isSelf; });
  }

  // Resigned or timed out of a table that plays on without them (3–4 seats).
  // The match stays `active`, but it is over as far as this player goes.
  function isOut(view) {
    var me = meIn(view);
    return !!me && (me.status === "resigned" || me.status === "forfeited");
  }

  // Whether a reply that arrives later still belongs on screen: the player
  // may have left the match, opened another one, or already had a newer
  // version of it from the watcher.
  function isCurrent(view) {
    var m = state.match;
    return state.screen === "match" && !!m && !!view
      && view.matchUuid === m.matchUuid && !(view.version < m.version);
  }

  function nameOf(player) {
    return player.isSelf ? "You" : "@" + player.username;
  }

  function boardIsEmpty(grid) {
    return !grid || grid.every(function (row) {
      return row.every(function (cell) { return cell === null; });
    });
  }

  function showScreen(name) {
    state.screen = name;
    if (name !== "match") stopFinding();
    Object.keys(els.screens).forEach(function (key) { els.screens[key].hidden = key !== name; });
    if (name !== "match") { stopWatching(); stopChat(); }
    // The board is sized from its box, and its box is 0x0 while the screen is
    // hidden — so it has to be measured again once the screen is up, or every
    // match opens one pixel wide.
    //
    // Measure synchronously first: the screen is visible as of the line above,
    // so this reads the real box, and it is the only path that does not depend
    // on a callback the host might never run (rAF is throttled in a hidden or
    // backgrounded WebView, and ResizeObserver is not everywhere). The frame
    // callback stays as a follow-up for hosts that defer layout.
    if (name === "match" && board) {
      board.resize();
      applyPendingFocus();
      requestAnimationFrame(function () {
        board.resize();
        applyPendingFocus();
      });
    }
  }

  // The opening zoom, applied the moment the board actually has a size —
  // whichever of the resize observer or the frame callback gets there first.
  function applyPendingFocus() {
    if (!board || state.pendingFocus === undefined || !board.hasSize()) return;
    openBoard(state.pendingFocus);
    state.pendingFocus = undefined;
  }

  function openBoard(target) {
    if (target === "fit") board.fit();
    else board.openAt(target);
  }

  // A join code that arrived before the player was signed in. `requestSignIn`
  // can take the WebView away and bring it back on a fresh load, so the
  // invite has to survive that or the friend who tapped the link lands on an
  // empty list with no idea what happened.
  //
  // localStorage, not sessionStorage: signing UP often finishes in another
  // tab (an email link), and a per-tab stash lost the invite on the way.
  function stashJoin(code) {
    try { localStorage.setItem(JOIN_STASH, JSON.stringify({ code: code, at: Date.now() })); } catch (_) {}
  }
  function peekJoin() {
    try {
      var saved = JSON.parse(localStorage.getItem(JOIN_STASH) || "null");
      if (saved && typeof saved.code === "string" && Date.now() - saved.at < JOIN_STASH_MS) return saved.code;
    } catch (_) {}
    return null;
  }
  function takeJoin() {
    var code = peekJoin();
    try { localStorage.removeItem(JOIN_STASH); } catch (_) {}
    return code;
  }

  // ------------------------------------------------------------- dialog

  // One modal for every prompt in the game: blank-letter picking, exchanging,
  // the match menu, join-by-code, how-to-play and the two confirmations that
  // used to be `window.confirm` (which in a WebView prints the origin above
  // the question and can be suppressed outright).
  function dialogFocusables() {
    return $$("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])", els.dialogCard)
      .filter(function (node) { return !node.hidden && !node.disabled && node.offsetParent !== null; });
  }

  function openDialog(opts) {
    if (dialogState) closeDialog(null);
    var restore = document.activeElement;
    els.dialogTitle.textContent = opts.title;
    els.dialogBody.className = "dialog-body"
      + (opts.prose ? " is-prose" : "")
      + (opts.menu ? " is-menu" : "");
    clear(els.dialogBody);
    var api = (opts.build ? opts.build(els.dialogBody, function (result) { closeDialog(result); }) : null) || {};
    els.dialogConfirm.hidden = !opts.confirmLabel;
    els.dialogConfirm.disabled = false;
    els.dialogConfirm.textContent = opts.confirmLabel || "OK";
    els.dialogConfirm.classList.toggle("is-danger", !!opts.danger);
    els.dialogCancel.hidden = opts.cancelLabel === null;
    els.dialogCancel.textContent = opts.cancelLabel || "Cancel";
    els.dialogWrap.hidden = false;
    // For the host, which reads the colour the status bar sits on from <html>
    // (styles.css, html[data-overlay]).
    document.documentElement.setAttribute("data-overlay", "dialog");
    dialogState = { api: api, done: opts.onClose || function () {}, restore: restore };
    els.dialogCard.scrollTop = 0;
    // Focusing a footer button inside a scrolling card scrolls the card to it,
    // so a long read (how to play) would open at its last line. Prose takes
    // the card itself; everything else takes the button it is about to press.
    var target = api.focus || (opts.prose ? els.dialogCard : (opts.confirmLabel ? els.dialogConfirm : els.dialogCancel));
    setTimeout(function () {
      if (target && target.focus) target.focus();
      els.dialogCard.scrollTop = 0;
    }, 0);
  }

  function closeDialog(result) {
    if (!dialogState) return;
    var current = dialogState;
    dialogState = null;
    els.dialogWrap.hidden = true;
    document.documentElement.removeAttribute("data-overlay");
    clear(els.dialogBody);
    if (current.restore && current.restore.focus) {
      try { current.restore.focus(); } catch (_) {}
    }
    current.done(result);
  }

  function wireDialog() {
    els.dialogConfirm.addEventListener("click", function () {
      if (!dialogState) return;
      closeDialog(dialogState.api.value ? dialogState.api.value() : true);
    });
    els.dialogCancel.addEventListener("click", function () { closeDialog(null); });
    els.dialogWrap.addEventListener("click", function (e) {
      if (e.target === els.dialogWrap) closeDialog(null);
    });
    els.dialogWrap.addEventListener("keydown", function (e) {
      if (!dialogState) return;
      if (e.key === "Escape") { e.preventDefault(); closeDialog(null); return; }
      if (e.key !== "Tab") return;
      var list = dialogFocusables();
      if (!list.length) return;
      e.preventDefault();
      var index = list.indexOf(document.activeElement);
      var next = e.shiftKey
        ? (index <= 0 ? list.length - 1 : index - 1)
        : (index === -1 || index === list.length - 1 ? 0 : index + 1);
      list[next].focus();
    });
  }

  function confirmDialog(opts, done) {
    openDialog({
      title: opts.title,
      prose: true,
      danger: opts.danger,
      confirmLabel: opts.confirmLabel || "OK",
      cancelLabel: opts.cancelLabel || "Cancel",
      build: function (body) {
        if (opts.text) body.appendChild(el("p", "muted", opts.text));
        return { value: function () { return true; } };
      },
      onClose: function (result) { if (result === true) done(); }
    });
  }

  // ------------------------------------------------------------ how to play

  // The rules-heaviest game on the platform shipped without a word of
  // explanation: premium squares were bare abbreviations, and nothing said
  // how a game ends.
  var HOW_TO_HTML = [
    '<div class="howto">',
    '<h3>The idea</h3>',
    '<p>Take turns building words on the board, crossword style. Highest score when the tiles run out wins. There is no clock to sit at — a turn lasts days.</p>',
    '<h3>Your turn</h3>',
    '<ul>',
    '<li>Drag a tile from your rack onto a square — or tap the tile, then the square. Dashed squares show where it would connect.</li>',
    '<li>Drag a tile sideways along the rack to reorder it; rearranging is how words turn up. You can do this while you wait for your turn, too.</li>',
    '<li>Drag a tile you have placed to move it, or back onto the rack. Tap it to take it back, or use <strong>Recall</strong> for all of them.</li>',
    '<li>The first word of the game must cover the ★ centre square. Every word after that has to touch what is already on the board.</li>',
    '<li>Your tiles must all land in one row or one column, with no gaps once the letters already there are counted.</li>',
    '<li>Nothing is sent until you press <strong>Play</strong>. The server checks the words against the dictionary and hands the tiles back if one is not in it.</li>',
    '</ul>',
    '<details><summary>Premium squares</summary>',
    '<p>They count only the first time a tile covers them. Letter multipliers apply first, then word multipliers.</p>',
    '<div class="legend">',
    '<span class="legend-swatch sq-star">★</span><span>Centre — the first word must cross it</span>',
    '<span class="legend-swatch sq-l"><b>2×</b><i>LETTER</i></span><span>That letter scores double</span>',
    '<span class="legend-swatch sq-L"><b>3×</b><i>LETTER</i></span><span>That letter scores triple</span>',
    '<span class="legend-swatch sq-w"><b>2×</b><i>WORD</i></span><span>The whole word scores double</span>',
    '<span class="legend-swatch sq-W"><b>3×</b><i>WORD</i></span><span>The whole word scores triple</span>',
    '</div>',
    '</details>',
    '<details><summary>Tiles</summary>',
    '<ul>',
    '<li>The small number is what the letter is worth.</li>',
    '<li>A <strong>blank</strong> (?) can stand in for any letter, but scores nothing — you pick the letter as you place it.</li>',
    '<li>Use all seven tiles in one turn for a <strong>bingo</strong>: +50 on top of the word.</li>',
    '<li><strong>Swap</strong> trades tiles back into the bag and ends your turn. <strong>Pass</strong> ends it for nothing.</li>',
    '</ul>',
    '</details>',
    '<details><summary>How it ends</summary>',
    '<ul>',
    '<li>When the bag is empty, the first player to use their last tile ends the game and adds everyone else\'s leftover tiles to their score.</li>',
    '<li>Swaps and passes both score nothing. Once every player has gone two turns in a row without scoring, the game ends and everyone\'s leftover tiles come off their own score.</li>',
    '</ul>',
    '</details>',
    '<details><summary>Wild boards</summary>',
    '<p>Pick <strong>Wild</strong> when you set up a game and the bonus squares land anywhere: clumps, lopsided corners, a board nobody has played before. The centre star and the lines through it stay free of word bonuses, so the opening move can\'t grab a jackpot.</p>',
    '</details>',
    '<details><summary>Who you can play</summary>',
    '<p>In <strong>Play with friends</strong> you can invite people you follow, or who follow you — nobody can drop a stranger into your game. To play with anyone else, add a <strong>seat for a link</strong>: whoever opens the link you send (or types its six-character code) takes that seat.</p>',
    '<p><strong>Find an opponent</strong> pairs you with the next player who is also looking for a game.</p>',
    '</details>',
    '<details><summary>Taking your time</summary>',
    '<p>There is no turn clock. Take as long as you like between moves — nobody is timed out, and no game is lost by not opening it. If you want out of one, use <strong>Resign</strong> from the ⋯ menu.</p>',
    '</details>',
    '<details class="keys"><summary>Keyboard</summary>',
    '<div class="keys"><ul>',
    '<li>Arrow keys move the caret and set which way typing runs.</li>',
    '<li>Type a letter to place it; a blank is used automatically if you have no matching tile.</li>',
    '<li><strong>Backspace</strong> takes the last tile back, <strong>Enter</strong> plays, <strong>Esc</strong> recalls everything.</li>',
    '</ul></div>',
    '</details>',
    '</div>'
  ].join("");

  function showHowTo() {
    openDialog({
      title: "How to play",
      prose: true,
      cancelLabel: "Close",
      build: function (body) {
        var wrap = document.createElement("div");
        wrap.innerHTML = HOW_TO_HTML; // fixed string, nothing interpolated
        body.appendChild(wrap);
        return {};
      }
    });
  }

  // ------------------------------------------------------------- list

  function loadList(quiet) {
    if (!quiet) els.listStatus.textContent = "Loading…";
    return OR.matches.list({ status: "all", limit: 100 }).then(function (rows) {
      els.listStatus.textContent = "";
      state.rows = rows;
      renderList(rows);
    }).catch(function (err) {
      if (!quiet) els.listStatus.textContent = errorText(err, "Couldn't load your games.");
    });
  }

  function startListPolling() {
    stopListPolling();
    state.listTimer = setInterval(function () {
      if (state.screen !== "list" || document.hidden || dialogState) return;
      loadList(true);
    }, LIST_POLL_MS);
  }

  function stopListPolling() {
    if (state.listTimer) { clearInterval(state.listTimer); state.listTimer = null; }
  }

  function listSignature(rows) {
    return rows.map(function (m) {
      // The age labels are in here so "4m" moves on to "5m" between polls,
      // and a quiet opponent's "2 days" to "3 days".
      // A chat message moves no version, so its count is in here on its own.
      return [m.matchUuid, m.version, m.status, m.isMyTurn ? 1 : 0, ago(m.updatedAt), ago(m.turnStartedAt), m.chatUnread || 0,
        m.players.map(function (p) { return p.score + ":" + p.status; }).join("/")].join("|");
    }).join(";");
  }

  function byNewest(a, b) {
    return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  }

  function isDone(m) {
    return m.status === "finished" || m.status === "abandoned" || isOut(m);
  }

  function renderList(rows) {
    rows = rows.slice().sort(byNewest);
    var mine = rows.filter(function (m) { return m.status === "active" && !isOut(m) && m.isMyTurn; });
    var groups = [
      { title: "Also your move", rows: mine.slice(1) },
      { title: "Their move", rows: rows.filter(function (m) { return m.status === "active" && !isOut(m) && !m.isMyTurn; }) },
      { title: "Waiting for players", rows: rows.filter(function (m) { return m.status === "lobby"; }) },
      { title: "Finished", rows: rows.filter(isDone), results: true }
    ];

    // With nothing to show, a centred hero holds the only two things worth
    // doing; with games, the band and its sheet.
    setListMode(rows.length ? "games" : "landing");
    renderRecord(rows);

    // Re-rendering identical rows every poll would throw away the player's
    // scroll position three times a minute.
    var signature = listSignature(rows);
    if (signature === state.listSignature && els.listBody.firstChild) return;
    state.listSignature = signature;

    var scroll = els.listBody.scrollTop;
    clear(els.listBody);
    if (mine.length) {
      els.listBody.appendChild(renderSpotlight(mine[0], mine.length));
      loadSpotlight(mine[0]);
    }
    groups.forEach(function (group) {
      if (!group.rows.length) return;
      // The first your-move game is the spotlight; with none, their move leads.
      var title = group.title === "Also your move" && !mine.length ? "Your move" : group.title;
      els.listBody.appendChild(el("h2", "group-title", title));
      group.rows.forEach(function (m) {
        els.listBody.appendChild(group.results ? renderResult(m) : renderRow(m));
      });
    });
    els.listBody.scrollTop = scroll;
  }

  // Me against the best of the rest: what "am I winning?" means at 3-4 seats.
  function leadOf(m) {
    var me = meIn(m);
    if (!me) return null;
    var others = opponentsOf(m).filter(function (p) { return m.status !== "active" || p.status === "joined"; });
    if (!others.length) return null;
    var best = Math.max.apply(null, others.map(function (p) { return p.score; }));
    if (me.score === 0 && best === 0) return null;
    return me.score - best;
  }

  function leadChip(diff) {
    if (diff === null) return null;
    var chip = el("span", "lead-chip " + (diff > 0 ? "is-up" : diff < 0 ? "is-down" : "is-even"),
      diff > 0 ? "+" + diff : diff < 0 ? "−" + (-diff) : "Tied");
    chip.setAttribute("aria-label", diff > 0 ? "ahead by " + diff : diff < 0 ? "behind by " + (-diff) : "tied");
    return chip;
  }

  // "You 142 · 128" with the viewer first; opponents are named on the line above.
  function scoreText(m) {
    var me = meIn(m);
    var parts = (me ? ["You " + me.score] : []).concat(opponentsOf(m).map(function (p) { return String(p.score); }));
    return parts.join(" · ");
  }

  function opponentNames(m) {
    var opponents = opponentsOf(m);
    if (opponents.length) return opponents.map(function (p) { return "@" + p.username; }).join(", ");
    return m.matchmaking ? "Quick match" : "Open table";
  }

  // "@clover played OX for 18", from the row alone: the server sends each
  // row's last move and the words it made (`recap`), so the list never has to
  // open a game to say what happened in it. False when there is nothing to say.
  function writeRecap(target, m) {
    var lm = m.lastMove;
    if (!lm || m.status === "lobby") return false;
    var player = m.players.filter(function (p) { return p.seat === lm.seat; })[0];
    var who = player ? nameOf(player) : "Someone";
    var move = lm.move || {};
    clear(target);
    if (move.type === "place") {
      var words = m.recap && Array.isArray(m.recap.lastWords) ? m.recap.lastWords : [];
      var tiles = Array.isArray(move.tiles) ? move.tiles.length : 0;
      var points = words.length
        ? words.reduce(function (sum, w) { return sum + (Number(w.score) || 0); }, 0) + (tiles === Rules.RACK ? Rules.BINGO : 0)
        : lm.scoreDelta;
      target.appendChild(document.createTextNode(who + " played "));
      words.forEach(function (w, i) {
        if (i) target.appendChild(document.createTextNode(", "));
        target.appendChild(el("span", "word", String(w.word || "")));
      });
      if (!words.length) target.appendChild(document.createTextNode("a word"));
      if (typeof points === "number") {
        target.appendChild(document.createTextNode(" for "));
        target.appendChild(el("span", "pts", String(points)));
      }
      return true;
    }
    if (move.type === "exchange") { target.textContent = who + " swapped tiles"; return true; }
    if (move.type === "pass") { target.textContent = who + (move.forced ? " was skipped" : " passed"); return true; }
    if (move.type === "claim") { target.textContent = who + " stopped playing"; return true; }
    return false;
  }

  function faces(m, limit) {
    var wrap = el("span", "match-faces");
    var opponents = opponentsOf(m);
    (opponents.length ? opponents : m.players).slice(0, limit || 3).forEach(function (p) {
      wrap.appendChild(avatar(p.username, p.avatar));
    });
    return wrap;
  }

  function openFromList(button, uuid) {
    if (button.classList.contains("is-busy")) return;
    button.classList.add("is-busy");
    openMatch(uuid).then(function () { button.classList.remove("is-busy"); });
  }

  function renderRow(m) {
    var row = el("div", "match-row" + (m.isMyTurn ? " is-mine" : ""));
    var open = el("button", "match-open");
    open.type = "button";
    open.appendChild(faces(m));

    var text = el("span", "match-text");
    var names = opponentNames(m);
    var nameLine = el("span", "match-names", names);
    if (isWild(m)) nameLine.appendChild(el("span", "tag-wild", "Wild"));
    text.appendChild(nameLine);
    var detail = el("span", "match-detail");
    var statusLine = el("span", "match-status");
    var status = "";
    if (m.status === "lobby" && m.matchmaking) {
      detail.textContent = "Looking for an opponent…";
      status = "We’ll let you know when someone sits down";
    } else if (m.status === "lobby") {
      detail.textContent = m.players.length + " of " + m.maxPlayers + " seated";
      status = "Open it to share the join code";
    } else {
      detail.appendChild(document.createTextNode(scoreText(m)));
      var chip = leadChip(leadOf(m));
      if (chip) detail.appendChild(chip);
      // A quiet opponent is the more useful thing to say; otherwise what
      // just happened in the game.
      var other = waitingOn(m);
      var waited = other ? waitedMs(m) : null;
      if (waited !== null && waited >= NUDGE_AFTER_MS) status = "Waiting on @" + other.username + " for " + daysText(waited);
      else if (writeRecap(statusLine, m)) status = statusLine.textContent;
    }
    text.appendChild(detail);
    if (status) {
      if (!statusLine.firstChild) statusLine.textContent = status;
      text.appendChild(statusLine);
    }
    open.appendChild(text);

    var side = el("span", "match-side");
    var when = ago(m.updatedAt);
    if (when) side.appendChild(el("span", "match-when", when));
    if (m.isMyTurn) side.appendChild(el("span", "badge", "Play"));
    var unread = canChat() && m.chatUnread > 0 ? m.chatUnread : 0;
    if (unread) side.appendChild(el("span", "row-chat", (unread > 9 ? "9+" : String(unread)) + " new"));
    open.appendChild(side);
    open.setAttribute("aria-label", names + ". " + detail.textContent + (status ? ". " + status : "")
      + (m.isMyTurn ? ". Your move." : "") + (unread ? " " + unread + " unread message" + (unread === 1 ? "" : "s") + "." : "") + (when ? " Last activity " + ago(m.updatedAt, true) + "." : ""));
    open.addEventListener("click", function () { openFromList(open, m.matchUuid); });
    row.appendChild(open);

    // Nudge right from the list, once the turn is a day old — the same rule
    // (and the same server check) as the match screen.
    var other2 = waitingOn(m);
    var waited2 = other2 ? waitedMs(m) : null;
    if (OR.capabilities.has("matches.nudge") && waited2 !== null && waited2 >= NUDGE_AFTER_MS) {
      var sent = nudgedRecently(m.matchUuid);
      var nudgeBtn = el("button", "row-nudge", sent ? "Nudged" : "Nudge");
      nudgeBtn.type = "button";
      nudgeBtn.disabled = sent;
      nudgeBtn.setAttribute("aria-label", "Nudge @" + other2.username);
      nudgeBtn.addEventListener("click", function () {
        nudgeBtn.disabled = true;
        nudgeMatch(m, function (ok) {
          nudgeBtn.textContent = ok ? "Nudged" : "Nudge";
          nudgeBtn.disabled = ok;
        });
      });
      row.appendChild(nudgeBtn);
    }
    return row;
  }

  // Finished games are history, not things to do: one thin line each.
  function renderResult(m) {
    var row = el("button", "result-row");
    row.type = "button";
    var me = meIn(m);
    var label, cls;
    if (m.status === "abandoned") { label = "Closed"; cls = "is-even"; }
    else if (isOut(m)) { label = me.status === "resigned" ? "Resigned" : "Left"; cls = "is-down"; }
    else if (m.winnerSeat === null) { label = "Draw"; cls = "is-even"; }
    else if (me && m.winnerSeat === me.seat) { label = "Won"; cls = "is-up"; }
    else { label = "Lost"; cls = "is-down"; }
    row.appendChild(el("span", "result-label " + cls, label));
    row.appendChild(el("span", "result-names", opponentNames(m)));
    var best = null;
    opponentsOf(m).forEach(function (p) { if (best === null || p.score > best) best = p.score; });
    var score = m.status === "abandoned" || !me || best === null ? "" : me.score + "–" + best;
    row.appendChild(el("span", "result-score", score));
    row.appendChild(el("span", "result-when", ago(m.updatedAt)));
    row.setAttribute("aria-label", label + " against " + opponentNames(m) + (score ? ", " + score : "")
      + ". " + ago(m.updatedAt, true) + ".");
    row.addEventListener("click", function () { openFromList(row, m.matchUuid); });
    return row;
  }

  // Wins and losses over the finished games the list holds (the last 100).
  function renderRecord(rows) {
    var won = 0, lost = 0, drawn = 0;
    rows.forEach(function (m) {
      var me = meIn(m);
      if (!me || m.status !== "finished") return;
      if (m.winnerSeat === null) drawn++;
      else if (m.winnerSeat === me.seat) won++;
      else lost++;
    });
    els.record.hidden = !(won + lost + drawn);
    clear(els.record);
    els.record.appendChild(document.createTextNode("Record "));
    els.record.appendChild(el("b", "", won + "–" + lost + (drawn ? "–" + drawn : "")));
    els.record.setAttribute("aria-label", won + (won === 1 ? " win, " : " wins, ") + lost + (lost === 1 ? " loss" : " losses")
      + (drawn ? ", " + drawn + (drawn === 1 ? " draw" : " draws") : ""));
  }

  // ---- the spotlight: the game waiting on you, big, with its board

  // The card is drawn at once from the list row; the board preview and the
  // last move need the full view, fetched once per version of that game.
  function renderSpotlight(m, waiting) {
    var spot = state.spot && state.spot.uuid === m.matchUuid && state.spot.version >= m.version ? state.spot.view : null;
    var card = el("section", "spotlight");
    card.setAttribute("data-uuid", m.matchUuid);
    card.setAttribute("aria-label", "Up next: your move against " + opponentNames(m));

    var head = el("div", "spot-head");
    head.appendChild(faces(m, 2));
    var titles = el("div", "spot-titles");
    titles.appendChild(el("span", "spot-kicker", waiting > 1 ? "Up next · " + waiting + " waiting on you" : "Your move"));
    var name = el("span", "spot-name", "vs " + opponentNames(m));
    if (isWild(m)) name.appendChild(el("span", "tag-wild", "Wild"));
    titles.appendChild(name);
    head.appendChild(titles);
    var when = ago(m.updatedAt);
    var unread = canChat() && m.chatUnread > 0 ? m.chatUnread : 0;
    if (when || unread) {
      var side = el("span", "match-side");
      if (when) side.appendChild(el("span", "match-when", when === "now" ? "just now" : when + " ago"));
      if (unread) side.appendChild(el("span", "row-chat", (unread > 9 ? "9+" : String(unread)) + " new"));
      head.appendChild(side);
    }
    if (unread) card.setAttribute("aria-label", card.getAttribute("aria-label") + ". " + unread + " unread message" + (unread === 1 ? "" : "s") + ".");
    card.appendChild(head);

    var last = el("p", "spot-last");
    if (spot && spot.view && spot.view.board) {
      card.appendChild(boardPreview(spot));
      if (writeLastMove(last, spot)) card.appendChild(last);
    } else {
      if (!state.spot || state.spot.uuid !== m.matchUuid || !state.spot.failed) {
        card.appendChild(el("div", "spot-board is-loading"));
      }
      if (writeRecap(last, m)) card.appendChild(last);
    }

    card.appendChild(scoreBar(m));

    var play = el("button", "primary spot-play", "Play your turn");
    play.type = "button";
    play.addEventListener("click", function () { openFromList(play, m.matchUuid); });
    card.appendChild(play);
    return card;
  }

  function loadSpotlight(m) {
    var have = state.spot && state.spot.uuid === m.matchUuid && state.spot.version >= m.version;
    var key = m.matchUuid + "@" + m.version;
    if (have || state.spotLoading === key) return;
    state.spotLoading = key;
    OR.matches.get({ matchUuid: m.matchUuid }).then(function (view) {
      state.spot = { uuid: view.matchUuid, version: view.version, view: view };
    }).catch(function () {
      state.spot = { uuid: m.matchUuid, version: m.version, view: null, failed: true };
    }).then(function () {
      if (state.spotLoading === key) state.spotLoading = null;
      var card = els.listBody.querySelector(".spotlight");
      if (state.screen !== "list" || !card || card.getAttribute("data-uuid") !== m.matchUuid) return;
      var row = state.rows.filter(function (r) { return r.matchUuid === m.matchUuid; })[0] || m;
      var waiting = state.rows.filter(function (r) { return r.status === "active" && !isOut(r) && r.isMyTurn; }).length;
      card.parentNode.replaceChild(renderSpotlight(row, waiting), card);
    });
  }

  // A strip of the board around the last move (or the centre), with the tiles
  // that move laid outlined: 9 squares wide, 5 deep — deeper, up to 9, only
  // when the move runs down the board, so the card never pushes every other
  // game off the screen. Decorative: the card's text says it all.
  var PREVIEW = 9;
  var PREVIEW_ROWS = 5;
  function boardPreview(view) {
    var v = view.view;
    var cells = lastMoveCells(view);
    var fresh = {};
    cells.forEach(function (c) { fresh[c[0] + "," + c[1]] = true; });
    var mid = cells.length
      ? [Math.round(cells.reduce(function (a, c) { return a + c[0]; }, 0) / cells.length),
         Math.round(cells.reduce(function (a, c) { return a + c[1]; }, 0) / cells.length)]
      : [Rules.CENTER, Rules.CENTER];
    var span = cells.length
      ? Math.max.apply(null, cells.map(function (c) { return c[0]; })) - Math.min.apply(null, cells.map(function (c) { return c[0]; })) + 1
      : 1;
    var rows = Math.max(PREVIEW_ROWS, Math.min(PREVIEW, span + 2));
    var r0 = Math.max(0, Math.min(Rules.SIZE - rows, mid[0] - Math.floor(rows / 2)));
    var c0 = Math.max(0, Math.min(Rules.SIZE - PREVIEW, mid[1] - Math.floor(PREVIEW / 2)));
    var layout = v.layout || Rules.layout();
    var grid = el("div", "spot-board");
    grid.setAttribute("aria-hidden", "true");
    for (var r = r0; r < r0 + rows; r++) {
      for (var c = c0; c < c0 + PREVIEW; c++) {
        var tile = v.board[r] && v.board[r][c];
        var cell;
        if (tile) {
          cell = el("span", "pv pv-tile" + (tile.b ? " is-blank" : "") + (fresh[r + "," + c] ? " is-new" : ""), tile.l);
        } else if (r === Rules.CENTER && c === Rules.CENTER) {
          cell = el("span", "pv pv-star", "★");
        } else {
          var code = layout[r] ? layout[r].charAt(c) : ".";
          cell = el("span", "pv " + ({ W: "pv-W", w: "pv-w", L: "pv-L", l: "pv-l" }[code] || "pv-plain"));
        }
        grid.appendChild(cell);
      }
    }
    return grid;
  }

  // Two players: big numbers either side of the lead. Three or four: a line each.
  function scoreBar(m) {
    var bar = el("div", "spot-scores");
    var me = meIn(m);
    var others = opponentsOf(m);
    if (me && others.length === 1) {
      bar.appendChild(scoreCell("You", me.score));
      var chip = leadChip(leadOf(m));
      if (chip) bar.appendChild(chip);
      var theirs = scoreCell("@" + others[0].username, others[0].score);
      theirs.classList.add("is-end");
      bar.appendChild(theirs);
    } else {
      bar.classList.add("is-table");
      (me ? [me] : []).concat(others).forEach(function (p) {
        bar.appendChild(scoreCell(nameOf(p), p.score));
      });
      var lead = leadChip(leadOf(m));
      if (lead) bar.appendChild(lead);
    }
    return bar;
  }

  function scoreCell(label, score) {
    var cell = el("span", "score-cell");
    cell.appendChild(el("span", "score-label", label));
    cell.appendChild(el("b", "score-num", String(score)));
    return cell;
  }

  function openJoinDialog() {
    openDialog({
      title: "Join a game",
      prose: true,
      confirmLabel: "Join",
      build: function (body, close) {
        body.appendChild(el("p", "muted", "Enter the six-character code your friend shared, or paste their invite link."));
        var input = document.createElement("input");
        input.className = "join-field";
        input.type = "text";
        input.inputMode = "text";
        input.autocapitalize = "characters";
        input.autocomplete = "off";
        input.placeholder = "ABC123";
        input.setAttribute("aria-label", "Join code");
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); close(input.value); }
        });
        body.appendChild(input);
        return { focus: input, value: function () { return input.value; } };
      },
      onClose: function (code) { if (code) joinByCode(code); }
    });
  }

  // -------------------------------------------------------------- new game

  // New game: the chooser when there are two kinds of game, else straight to
  // setting a table with friends.
  function openChooser() {
    if (state.canQuick) showScreen("choose");
    else openNewGame();
  }

  function openNewGame() {
    state.invitees = {};
    state.open = false; // derived in renderSeats from the seats left spare
    // A new table starts as you plus one seat for a link — the one thing that
    // works for anyone — until a friend is picked, which takes its place.
    state.openSeats = 1;
    state.openAuto = true;
    state.seats = 2;
    els.modeStandard.checked = true;
    state.inviteQuery = "";
    state.inviteCapped = false;
    els.inviteInput.value = "";
    els.inviteSearch.hidden = true;
    els.createStatus.textContent = "";
    renderSeats();
    showScreen("new");
    els.invitableEmpty.hidden = true;
    els.inviteCount.textContent = "";
    clear(els.invitableList);
    els.invitableList.appendChild(el("p", "muted", "Loading people you can invite…"));
    loadInvitable();
  }

  /**
   * Fetch the whole invitable set, a page at a time.
   *
   * The stop conditions are what make this safe on a host that has never heard
   * of `offset`: such a host answers every page with the first one, so the
   * second page contributes no unseen uuids and the loop ends there — exactly
   * today's behaviour, no worse. A short page means the end of the set, and
   * the page budget bounds everything else.
   *
   * `onPage(people, capped)` runs as each page lands (return false to stop
   * early); the promise resolves with `{ people, capped }`. `capped` means
   * there may be people past what was fetched.
   */
  function fetchInvitable(onPage) {
    var seen = {};
    var people = [];

    function page(offset, budget) {
      return OR.matches.invitable({ limit: INVITABLE_PAGE, offset: offset }).then(function (rows) {
        var fresh = 0;
        rows.forEach(function (person) {
          if (!person || seen[person.uuid]) return;
          seen[person.uuid] = true;
          people.push(person);
          fresh++;
        });
        var done = !fresh || rows.length < INVITABLE_PAGE;
        // A FULL page that repeated rows we already hold means the host
        // ignored `offset` — so there may be people past it we cannot reach.
        // A compliant host with exactly 200 people answers page 2 with [],
        // which is a short page and correctly not treated as truncation.
        var capped = done ? (!fresh && rows.length >= INVITABLE_PAGE) : budget <= 1;
        var result = { people: people, capped: capped };
        if (onPage && onPage(people, capped) === false) return result;
        if (done || budget <= 1) return result;
        return page(offset + rows.length, budget - 1);
      });
    }

    return page(0, INVITABLE_MAX_PAGES);
  }

  // Each page renders as it lands, so the picker is usable on the first 200
  // while the rest arrive rather than sitting on a spinner.
  function loadInvitable() {
    var run = state.inviteRun = (state.inviteRun || 0) + 1;
    state.invitable = [];
    state.inviteCapped = false;
    return fetchInvitable(function (people, capped) {
      if (run !== state.inviteRun) return false; // the screen was reopened
      state.invitable = people;
      state.inviteCapped = capped;
      renderInvitable();
    }).catch(function () {
      if (run !== state.inviteRun) return;
      renderInvitable();
    });
  }

  // `relation` is the viewer's side of the follow edge. Only two of the three
  // are worth a badge: that someone follows you is the non-obvious half.
  var RELATION_LABEL = { mutual: "mutual", follower: "follows you" };

  // Mutuals first, then people who follow you, then people you follow;
  // alphabetical inside each. The server treats all three the same — this is
  // only about which name a player is most likely to be hunting for.
  var RELATION_RANK = { mutual: 0, follower: 1, following: 2 };
  function byRelationThenName(a, b) {
    var ra = RELATION_RANK[a.relation], rb = RELATION_RANK[b.relation];
    if (ra !== rb) return (ra === undefined ? 9 : ra) - (rb === undefined ? 9 : rb);
    return a.username.toLowerCase() < b.username.toLowerCase() ? -1 : 1;
  }

  function inviteRow(person) {
    var label = el("label", "invitable-row");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!state.invitees[person.uuid];
    box.addEventListener("change", function () {
      if (box.checked) {
        if (state.openAuto) { state.openSeats = 0; state.openAuto = false; }
        if (Object.keys(state.invitees).length + state.openSeats >= 3) {
          box.checked = false;
          toast("A table seats four. Remove a seat to add someone else.");
          return;
        }
        state.invitees[person.uuid] = person;
      } else {
        delete state.invitees[person.uuid];
      }
      renderSeats();
      renderInvitable();
    });
    label.appendChild(box);
    label.appendChild(avatar(person.username, person.avatar));
    label.appendChild(el("span", "invitable-name", "@" + person.username));
    var relation = RELATION_LABEL[person.relation];
    if (relation) label.appendChild(el("span", "muted small relation", relation));
    return label;
  }

  function renderInvitable() {
    // Ticking a box re-renders the list to regroup it; without this the
    // roster jumps back to the top every time someone is picked.
    var scroll = els.invitableList.scrollTop;
    clear(els.invitableList);
    var total = state.invitable.length;
    var query = state.inviteQuery.trim().toLowerCase();
    els.inviteSearch.hidden = total <= SEARCH_THRESHOLD;

    var ordered = state.invitable.slice().sort(byRelationThenName);
    var matches = function (p) { return !query || p.username.toLowerCase().indexOf(query) !== -1; };
    // Anyone already picked stays on screen whatever is typed, so a selection
    // cannot quietly scroll out of the list mid-search.
    var picked = ordered.filter(function (p) { return !!state.invitees[p.uuid]; });
    var rest = ordered.filter(function (p) { return !state.invitees[p.uuid] && matches(p); });
    // Counted over everyone, not just the unpicked: someone you already
    // invited still matches what you typed, and saying "0 match" with their
    // row on screen reads as a bug.
    var matchCount = ordered.filter(matches).length;

    if (picked.length && query) els.invitableList.appendChild(el("div", "invite-group", "Invited"));
    picked.forEach(function (p) { els.invitableList.appendChild(inviteRow(p)); });
    if (picked.length && query && rest.length) els.invitableList.appendChild(el("div", "invite-group", "Results"));
    rest.forEach(function (p) { els.invitableList.appendChild(inviteRow(p)); });

    els.inviteClear.hidden = !els.inviteInput.value;

    // `total` is however many rows came back, and when that equals the limit we
    // asked for, it is a truncation rather than a count — so it must not be
    // read out as "of 200 people". Search only covers what was fetched, and
    // saying so is the difference between "they are not on here" and "they are
    // not in the part of the list I can see".
    var capped = state.inviteCapped;
    els.inviteCount.textContent = !total ? ""
      : query
        ? (matchCount === 0 ? "" // the empty-state line below says this better
          : matchCount + " of " + (capped ? "the first " + total : String(total))
            + " match “" + state.inviteQuery.trim() + "”")
      : capped
        ? "Showing " + total + " — search to narrow it down"
        : total + " " + (total === 1 ? "person" : "people") + " you can invite";

    // The rule itself lives in the note above the list, which is always on
    // screen; this only has to cover the two empty cases.
    var nothing = !picked.length && !rest.length;
    els.invitableEmpty.hidden = !nothing;
    if (nothing) {
      els.invitableEmpty.textContent = !total
        ? "Nobody to invite yet — follow a few people, or add a seat for a link and send it to anyone."
        : "Nobody matching that — you can only invite people you follow or who follow you. For anyone else, add a seat for a link.";
    }
    els.invitableList.scrollTop = scroll;
  }

  // A chain-link glyph, drawn rather than an emoji so it matches the theme.
  function linkIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "seat-link-icon");
    svg.setAttribute("aria-hidden", "true");
    ["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"].forEach(function (d) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  // The table, drawn as one chip per seat: you, each friend picked (tap ✕ to
  // drop them), each open seat for the invite link, and "+ Seat for a link"
  // while there is room. `open` and the seat count are derived from the
  // chips — every open seat is one only the join code can fill, so the code
  // is minted exactly when there is one. Usernames go through textContent.
  function renderSeats() {
    var invitees = Object.keys(state.invitees).map(function (uuid) { return state.invitees[uuid]; });
    var total = 1 + invitees.length + state.openSeats;
    state.seats = total;
    state.open = state.openSeats > 0;

    clear(els.tableSeats);
    var you = el("span", "table-seat is-you");
    you.setAttribute("role", "listitem");
    you.appendChild(avatar(OR.user ? OR.user.username : "you", OR.user ? OR.user.avatar : null));
    you.appendChild(el("span", "", "You"));
    els.tableSeats.appendChild(you);
    invitees.forEach(function (person) {
      var chip = el("span", "table-seat");
      chip.setAttribute("role", "listitem");
      chip.appendChild(avatar(person.username, person.avatar));
      chip.appendChild(el("span", "", "@" + person.username));
      var drop = el("button", "seat-remove", "✕");
      drop.type = "button";
      drop.setAttribute("aria-label", "Remove @" + person.username);
      drop.addEventListener("click", function () {
        delete state.invitees[person.uuid];
        renderSeats();
        renderInvitable();
      });
      chip.appendChild(drop);
      els.tableSeats.appendChild(chip);
    });
    for (var i = 0; i < state.openSeats; i++) {
      var open = el("span", "table-seat is-open");
      open.setAttribute("role", "listitem");
      open.appendChild(linkIcon());
      open.appendChild(el("span", "", "Seat for a link"));
      var remove = el("button", "seat-remove", "✕");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove the open seat");
      remove.addEventListener("click", function () {
        state.openSeats = Math.max(0, state.openSeats - 1);
        state.openAuto = false;
        renderSeats();
      });
      open.appendChild(remove);
      els.tableSeats.appendChild(open);
    }
    if (total < 4) {
      var add = el("button", "table-seat is-add", "+ Seat for a link");
      add.type = "button";
      add.addEventListener("click", function () {
        state.openSeats++;
        state.openAuto = false;
        renderSeats();
      });
      els.tableSeats.appendChild(add);
    }

    els.tableNote.textContent = total < 2
      ? "Pick a friend below, or add a seat for a link."
      : state.openSeats > 0
        ? "You’ll get a link to send for the open seat" + (state.openSeats > 1 ? "s" : "")
          + ". Whoever opens it signs in, then takes the seat. The game starts when every seat is filled."
        : total + " players. The game starts as soon as you press Start.";
    els.createStatus.textContent = "";
    els.createButton.disabled = total < 2;
    els.createButton.textContent = total < 2 ? "Add a player"
      : state.openSeats > 0 ? "Create table & get link" : "Start game";
  }

  function createMatch(share) {
    if (state.creating) return;
    state.creating = true;
    els.createButton.disabled = true;
    els.createStatus.textContent = "Setting the table…";
    OR.matches.create({
      game: els.modeWild.checked ? GAME_WILD : GAME,
      maxPlayers: state.seats,
      invitees: Object.keys(state.invitees),
      open: state.open
    }).then(function (view) {
      state.creating = false;
      haptic("success");
      enterMatch(view);
      if (share === true && view.joinCode) shareCode();
    }).catch(function (err) {
      state.creating = false;
      els.createButton.disabled = false;
      els.createStatus.textContent = errorText(err, "Couldn't create the game.");
    });
  }

  // People paste what they were sent: the bare code, the invite link, or the
  // whole share message ("Join my Word Battle table … code ABC123 — https://…").
  // The link's `code=` wins, then "code ABC123", then the input as a bare code.
  function parseJoinCode(raw) {
    var text = String(raw || "").trim();
    var found = /[?&]code=([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(text)
      || /\bcode:?\s+([A-Za-z0-9]{6})(?![A-Za-z0-9])/i.exec(text);
    return (found ? found[1] : text.replace(/[\s-]/g, "")).toUpperCase();
  }

  // Find an opponent: the server seats us at a public table or opens one.
  function quickMatch() {
    if (state.creating) return;
    state.creating = true;
    els.quickButtons.forEach(function (b) { b.disabled = true; });
    OR.matches.quick({ game: GAME }).then(function (view) {
      haptic("success");
      enterMatch(view);
    }).catch(function (err) {
      toast(errorText(err, "Couldn't start looking for an opponent."), true);
    }).then(function () {
      state.creating = false;
      els.quickButtons.forEach(function (b) { b.disabled = false; });
    });
  }

  function joinByCode(code) {
    code = parseJoinCode(code);
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast("Codes are six letters or digits.", true); return; }
    els.listStatus.textContent = "Joining " + code + "…";
    OR.matches.join({ joinCode: code }).then(function (view) {
      els.listStatus.textContent = "";
      haptic("success");
      enterMatch(view);
    }).catch(function (err) {
      els.listStatus.textContent = "";
      toast(errorText(err, "Couldn't join that table."), true);
    });
  }

  // ---------------------------------------------------------------- match

  function openMatch(uuid) {
    return OR.matches.get({ matchUuid: uuid }).then(enterMatch).catch(function (err) {
      toast(errorText(err, "Couldn't open that game."), true);
    });
  }

  function enterMatch(view) {
    state.match = null;
    state.pending = [];
    state.invalidWords = {};
    state.rackFree = [];
    state.selectedRack = null;
    state.announcedPly = view.lastMove ? view.lastMove.ply : null;
    applyView(view, true);
    showScreen("match");
    startWatching(view.matchUuid);
    startChat(view);
  }

  function startWatching(uuid) {
    stopWatching();
    state.stopWatch = OR.matches.watch(uuid, function (view) {
      // A poll sent before the player's own move can land after its reply.
      if (!isCurrent(view) || view.version === state.match.version) return;
      var wasMyTurn = state.match && state.match.isMyTurn;
      var wasFinding = state.match && state.match.status === "lobby" && state.match.matchmaking;
      applyView(view, false);
      if (wasFinding && view.status === "active") {
        var them = opponentsOf(view)[0];
        haptic("success");
        toast("Matched with " + (them ? "@" + them.username : "a new player") + " — " + (view.isMyTurn ? "you go first!" : "they go first."));
      }
      celebrateOpponent(view);
      if (!wasMyTurn && view.isMyTurn) haptic("light");
    }, { onError: function () {} });
  }

  function stopWatching() {
    if (state.stopWatch) { state.stopWatch(); state.stopWatch = null; }
  }

  // Take a fresh server view. Pending tiles survive if their squares are still
  // free and the rack still holds them — otherwise they go back.
  function applyView(view, focus) {
    if (state.lift) endLift();
    var wasActive = !!state.match && state.match.matchUuid === view.matchUuid && state.match.status === "active";
    state.match = view;
    var v = view.view || {};
    var left = (v.myRack || []).slice();
    var keep = [];
    state.pending.forEach(function (t) {
      var need = t.blank ? "_" : t.letter;
      var i = left.indexOf(need);
      var free = v.board && v.board[t.row] && v.board[t.row][t.col] === null;
      if (i !== -1 && free) { left.splice(i, 1); keep.push(t); }
    });
    // The server sends the rack in its own order. Keep the player's
    // arrangement (a shuffle, a word they were lining up) for every letter
    // still there, and add new tiles at the end.
    var selected = state.selectedRack !== null ? state.rackFree[state.selectedRack] : null;
    var rack = [];
    state.rackFree.forEach(function (letter) {
      var i = left.indexOf(letter);
      if (i !== -1) { left.splice(i, 1); rack.push(letter); }
    });
    rack = rack.concat(left);
    state.pending = keep;
    state.rackFree = rack;
    if (state.selectedRack !== null && rack[state.selectedRack] !== selected) state.selectedRack = null;

    els.screens.match.classList.toggle("is-lobby", view.status === "lobby");
    els.screens.match.classList.toggle("is-over", view.status === "finished" || view.status === "abandoned");

    renderPlayers(view);
    if (state.chat && state.chat.uuid === view.matchUuid) {
      var hadChat = !els.chatButton.hidden;
      renderChatButton();
      if (!hadChat && !els.chatButton.hidden) scheduleChat(0);
    }
    renderTurnStrip(view);
    renderLastMove(view);
    renderLobby(view);
    renderRack();
    renderBoard(view, focus);
    renderPreview();
    renderOver(view, wasActive && view.status === "finished");
  }

  // What the last placement scored: its words plus any bingo. Not
  // `scoreDelta`, which for a player going out also carries the leftover
  // tiles taken from everyone else.
  function placedScore(view) {
    var lm = view.lastMove;
    var words = view.view && Array.isArray(view.view.lastWords) ? view.view.lastWords : [];
    var bingo = !!(lm && lm.move && Array.isArray(lm.move.tiles) && lm.move.tiles.length === Rules.RACK);
    if (!words.length) {
      if (!lm || typeof lm.scoreDelta !== "number") return null;
      var main = Rules.wordThrough(view.view && view.view.board, lastMoveCells(view));
      return { score: lm.scoreDelta, bingo: bingo, word: main, words: main ? [{ word: main, score: lm.scoreDelta }] : [] };
    }
    words = words.map(function (w) { return { word: String(w.word || ""), score: Number(w.score) || 0 }; });
    var score = words.reduce(function (sum, w) { return sum + w.score; }, 0);
    return {
      score: score + (bingo ? Rules.BINGO : 0),
      bingo: bingo,
      word: words.slice(0, 3).map(function (w) { return w.word; }).join(" + "),
      words: words
    };
  }

  function lastMoveCells(view) {
    var lm = view.lastMove;
    if (!lm || !lm.move || lm.move.type !== "place" || !Array.isArray(lm.move.tiles)) return [];
    return lm.move.tiles.map(function (t) { return [t.row, t.col]; });
  }

  function renderBoard(view, focus) {
    var v = view.view || {};
    if (!board) {
      board = new window.TilesBoard(els.boardCanvas, {
        onCellTap: onCellTap,
        canLift: liftHandlers.canLift,
        onLiftStart: liftHandlers.onLiftStart,
        onLiftMove: liftHandlers.onLiftMove,
        onLiftEnd: liftHandlers.onLiftEnd,
        onLiftCancel: liftHandlers.onLiftCancel,
        onViewChange: function (zoomed) { els.zoomFit.hidden = !zoomed; },
        onResized: applyPendingFocus
      });
      board.setTheme();
    }
    if (v.board && v.layout) {
      var cells = lastMoveCells(view);
      board.setView(v.board, v.layout, cells);
      // Zoom in on the last move only when it is our turn to answer it. An
      // empty board, or someone else's turn, opens on the whole board — the
      // overview is what there is to look at.
      var target = view.status === "active" && view.isMyTurn && cells.length ? cells : "fit";
      if (focus) { state.pendingFocus = target; openBoard(target); }
    } else {
      board.setView(null, Rules.layout(), []);
      if (focus) { state.pendingFocus = null; board.openAt(null); }
    }
    syncBoard();
  }

  // Pending tiles, the selection, and the advisory "this square connects"
  // dots, all derived from one place so they cannot disagree.
  // Tiles in a word the server just refused, for as long as the same word is
  // still on the board.
  function invalidCells() {
    var out = {};
    var m = state.match;
    if (!state.pending.length || !m || !m.view || !m.view.board) return out;
    var result = Rules.evaluate(m.view.board, state.pending, m.view.layout, boardIsEmpty(m.view.board));
    if (!result.ok) return out;
    result.words.forEach(function (w) {
      if (!isKnownBad(w.word)) return;
      w.cells.forEach(function (cell) { out[cell[0] + "," + cell[1]] = true; });
    });
    return out;
  }

  // "Not a word: QZX, ZZT." → { QZX: true, ZZT: true }.
  function rejectedWords(err) {
    var message = err && typeof err.message === "string" ? err.message : "";
    var found = /not a word:\s*([A-Z ,]+)/i.exec(message);
    var out = {};
    if (found) found[1].split(",").forEach(function (w) { w = w.trim().toUpperCase(); if (w) out[w] = true; });
    return out;
  }

  function syncBoard() {
    if (!board) return;
    board.setPending(state.pending, invalidCells());
    board.setPlacing(state.selectedRack !== null);
    var m = state.match;
    var live = m && m.status === "active" && m.isMyTurn && m.view && m.view.board;
    if (live && (state.selectedRack !== null || state.dragSlot !== null || state.pending.length)) {
      board.setHints(Rules.hints(m.view.board, state.pending, boardIsEmpty(m.view.board)));
    } else {
      board.setHints([]);
    }
  }

  function playerDetail(view, p) {
    var sub = String(p.score);
    if (p.status === "resigned") sub += " · resigned";
    else if (p.status === "forfeited") sub += " · stopped playing";
    else if (view.view && view.view.rackCounts && !p.isSelf && view.status === "active") {
      var n = view.view.rackCounts[String(p.seat)];
      if (typeof n === "number") sub += " · " + n + " tiles";
    }
    return sub;
  }

  // Two players fit in the bar as name-and-score pills. Three or four don't:
  // next to the host's back-button lane and our three buttons there is room
  // for about two, and the rest were clipped, scores and all. So they move to
  // a row of their own under the bar, a column each, and the full list opens
  // on tap.
  function renderPlayers(view) {
    clear(els.players);
    var compact = view.players.length > 2;
    els.players.classList.toggle("is-compact", compact);
    els.players.style.setProperty("--seats", String(view.players.length));
    var bar = els.screens.match.querySelector(".bar");
    if (compact && els.players.parentNode === bar) bar.parentNode.insertBefore(els.players, bar.nextSibling);
    else if (!compact && els.players.parentNode !== bar) bar.insertBefore(els.players, bar.firstChild);
    if (compact) {
      els.players.setAttribute("role", "button");
      els.players.setAttribute("tabindex", "0");
      els.players.setAttribute("aria-label", "Players: " + view.players.map(function (p) {
        return nameOf(p) + " " + p.score + (view.turnSeat === p.seat ? ", on turn" : "");
      }).join("; ") + ". Show details.");
    } else {
      els.players.removeAttribute("role");
      els.players.removeAttribute("tabindex");
      els.players.removeAttribute("aria-label");
    }
    view.players.forEach(function (p) {
      var card = el("div", "player" + (view.turnSeat === p.seat ? " is-turn" : "") + (p.isSelf ? " is-self" : ""));
      card.appendChild(avatar(p.username, p.avatar));
      var col = el("div", "player-text");
      col.appendChild(el("div", "player-name", nameOf(p)));
      col.appendChild(el("div", "player-score", compact ? String(p.score) : playerDetail(view, p)));
      card.appendChild(col);
      els.players.appendChild(card);
    });
  }

  function showPlayers() {
    var m = state.match;
    if (!m || m.players.length <= 2) return;
    openDialog({
      title: "Players",
      confirmLabel: null,
      cancelLabel: "Close",
      build: function (body) {
        var list = el("div", "players-list");
        m.players.forEach(function (p) {
          var row = el("div", "player" + (m.turnSeat === p.seat ? " is-turn" : ""));
          row.appendChild(avatar(p.username, p.avatar));
          var col = el("div", "player-text");
          col.appendChild(el("div", "player-name", nameOf(p) + (m.turnSeat === p.seat ? " · on turn" : "")));
          col.appendChild(el("div", "player-score", playerDetail(m, p)));
          row.appendChild(col);
          list.appendChild(row);
        });
        body.appendChild(list);
        return {};
      }
    });
  }

  function renderTurnStrip(view) {
    var main = "";
    var mine = false;
    if (view.status === "lobby") {
      main = view.matchmaking ? "Finding an opponent" : "Waiting for players";
    } else if (view.status === "active") {
      mine = !!view.isMyTurn;
      var onTurn = view.players.filter(function (p) { return p.seat === view.turnSeat; })[0];
      main = mine ? "Your move" : (onTurn ? "@" + onTurn.username + "’s move" : "");
    } else if (view.status === "finished") {
      main = "Final";
    } else if (view.status === "abandoned") {
      main = "Table closed";
    }
    els.turnMain.textContent = main;
    els.turnMain.classList.toggle("is-mine", mine);

    els.chipWild.hidden = !isWild(view);

    var bag = view.view && typeof view.view.bagCount === "number" ? view.view.bagCount : null;
    els.chipBag.hidden = bag === null || view.status !== "active";
    if (bag !== null) {
      els.chipBag.textContent = bag + " in bag";
      els.chipBag.title = "Tiles left to draw. When the bag empties, the first player to use their last tile ends the game. Tap to see which letters are left.";
    }

    var warn = mine && scorelessEndsGame(view);
    els.turnWarning.hidden = !warn;
    if (warn) {
      els.turnWarning.textContent = "Nobody has scored for a while. If you swap or pass now, the game ends and everyone's leftover tiles come off their score.";
    }

    renderStall(view);

    // Waiting on someone else: the play controls give way to a line saying so.
    var waiting = view.status === "active" && !view.isMyTurn && !!meIn(view) && !isOut(view);
    els.screens.match.classList.toggle("is-waiting", waiting);
    els.waitBar.hidden = !waiting;
    if (waiting) {
      var onTurnNow = view.players.filter(function (p) { return p.seat === view.turnSeat; })[0];
      els.waitText.textContent = (onTurnNow ? "@" + onTurnNow.username + "’s move" : "Their move")
        + " — rearrange your tiles while you wait.";
    }

    var active = view.status === "active" && view.isMyTurn;
    els.exchangeButton.disabled = !active || !(view.view && view.view.bagCount >= 7);
    els.exchangeButton.title = active && !(view.view && view.view.bagCount >= 7)
      ? "Swapping needs at least seven tiles left in the bag." : "";
    els.passButton.disabled = !active;
    els.shuffleButton.disabled = view.status !== "active";
  }

  // Waiting on someone who has gone quiet: offer a nudge after a day, and
  // ending the game (or dropping them) after 14, when the server would allow it.
  function renderStall(view) {
    var other = waitingOn(view);
    var waited = other ? waitedMs(view) : null;
    var canNudge = OR.capabilities.has("matches.nudge") && waited !== null && waited >= NUDGE_AFTER_MS;
    var canClaim = OR.capabilities.has("matches.claim") && waited !== null && waited >= CLAIM_AFTER_MS;
    els.stall.hidden = !(canNudge || canClaim);
    if (els.stall.hidden) return;
    els.stallText.textContent = "@" + other.username + " hasn't moved in " + daysText(waited) + ".";
    var sent = nudgedRecently(view.matchUuid);
    els.nudgeButton.hidden = !canNudge;
    els.nudgeButton.disabled = !!sent;
    els.nudgeButton.textContent = sent ? "Nudged" : "Nudge";
    els.claimButton.hidden = !canClaim;
    els.claimButton.textContent = activeCount(view) > 2 ? "Drop @" + other.username : "End game";
  }

  function nudge() {
    var m = state.match;
    if (!m || !waitingOn(m)) return;
    var uuid = m.matchUuid;
    els.nudgeButton.disabled = true;
    nudgeMatch(m, function () {
      if (state.match && state.match.matchUuid === uuid) renderStall(state.match);
    });
  }

  // From the match screen or a list row. `after` runs either way.
  function nudgeMatch(m, after) {
    var other = waitingOn(m);
    if (!other) return;
    var uuid = m.matchUuid;
    OR.matches.nudge({ matchUuid: uuid }).then(function () {
      state.nudged[uuid] = Date.now();
      haptic("light");
      toast("Nudged @" + other.username + ".");
      after(true);
    }).catch(function (err) {
      // `match/too-soon` says when in its message, e.g. "You can nudge again in 5 hours."
      toast(errorText(err, "Couldn't send the nudge."), true);
      after(false);
    });
  }

  function nudgedRecently(uuid) {
    return !!state.nudged[uuid] && Date.now() - state.nudged[uuid] < NUDGE_AFTER_MS;
  }


  function claim() {
    var m = state.match;
    var other = m && waitingOn(m);
    if (!other) return;
    var table = activeCount(m) > 2;
    confirmDialog({
      title: table ? "Drop @" + other.username + "?" : "End this game?",
      text: table
        ? "@" + other.username + " hasn't moved in " + daysText(waitedMs(m)) + ". They leave the game, and the rest of you play on."
        : "@" + other.username + " hasn't moved in " + daysText(waitedMs(m)) + ". The game ends as it stands: the higher score wins, and a tie is a draw.",
      confirmLabel: table ? "Drop" : "End game",
      danger: true
    }, function () {
      var uuid = m.matchUuid;
      OR.matches.claim({ matchUuid: uuid }).then(function (view) {
        if (isCurrent(view)) applyView(view, false);
      }).catch(function (err) { toast(errorText(err, "Couldn't end the game."), true); });
    });
  }

  // What just happened, in words. `lastMove` carries the squares and the
  // points; the word itself is only readable off the board the move was
  // applied to, which is exactly what the view we just received holds.
  // On the match screen the line also opens the move log, and at a table of
  // three or four it says how much else happened since your own last move:
  // the line only has room for the latest.
  function renderLastMove(view) {
    var shown = writeLastMove(els.lastMove, view);
    els.lastMove.hidden = !shown;
    var log = shown && movesOf(view).length > 0;
    els.lastMove.classList.toggle("is-link", log);
    if (log) {
      els.lastMove.setAttribute("role", "button");
      els.lastMove.setAttribute("tabindex", "0");
      var others = view.status === "active" ? movesSinceMine(view).length - 1 : 0;
      if (others > 0) els.lastMove.appendChild(el("span", "more", " · +" + others + " more"));
      els.lastMove.classList.toggle("has-more", others > 0);
    } else {
      els.lastMove.classList.remove("has-more");
      els.lastMove.removeAttribute("role");
      els.lastMove.removeAttribute("tabindex");
    }
  }

  // Writes the last move into `target`; false when there is nothing to say.
  // Shared by the match screen and the list's spotlight card.
  function writeLastMove(target, view) {
    var lm = view.lastMove;
    if (!lm || view.status === "lobby") return false;
    var player = view.players.filter(function (p) { return p.seat === lm.seat; })[0];
    var who = player ? nameOf(player) : "Someone";
    var move = lm.move || {};
    var placed = move.type === "place" ? placedScore(view) : null;
    var points = placed ? placed.score : null;

    clear(target);
    if (move.type === "place") {
      var words = placed ? placed.words : [];
      target.appendChild(document.createTextNode(who + " played "));
      if (!words.length) target.appendChild(el("span", "word", "a word"));
      // One word reads "CAT for 10 points"; a move that also formed crosswords
      // lists each with its score, "CAT 10, AT 4 for 14 points".
      words.forEach(function (w, i) {
        if (i) target.appendChild(document.createTextNode(", "));
        target.appendChild(el("span", "word", w.word));
        if (words.length > 1) target.appendChild(document.createTextNode(" " + w.score));
      });
      if (points !== null) {
        target.appendChild(document.createTextNode(" for "));
        target.appendChild(el("span", "pts", points + (points === 1 ? " point" : " points")));
        if (placed.bingo) target.appendChild(document.createTextNode(", with a bingo"));
      }
    } else if (move.type === "exchange") {
      target.textContent = who + " swapped tiles.";
    } else if (move.type === "pass") {
      target.textContent = who + " passed.";
    } else if (move.type === "claim") {
      target.textContent = view.status === "finished"
        ? who + " stopped playing, so the game was ended as it stood."
        : who + " stopped playing and left the game.";
    } else {
      return false;
    }
    return true;
  }

  // The mystery tile on the finding screen flips through letters while we
  // wait. Stopped whenever the panel is not on screen, and never started for
  // players who asked for less motion.
  var FIND_LETTERS = "ABCDEFGHIJKLMNOPRSTUVWY";
  var FLIP_FIRST_MS = 900;    // the "?" shows for a moment first
  var FLIP_STAGGER_MS = 700;  // between open seats' first flips
  var FLIP_HOLD_MS = 1400;    // how long a letter stays up, at least
  var FLIP_JITTER_MS = 1000;  // ...plus up to this much
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function startFinding() {
    if (state.findTimer || (reduceMotion && reduceMotion.matches)) return;
    // Each tile keeps its own schedule: a letter holds for FLIP_HOLD_MS plus
    // up to FLIP_JITTER_MS, and several open seats start a beat apart, so the
    // row reads as calm and separate seats rather than one flickering strip.
    var started = Date.now();
    state.findTimer = setInterval(function () {
      if (state.screen !== "match" || document.hidden) return;
      var now = Date.now();
      $$(".flip-tile", els.screens.match).forEach(function (tile, i) {
        if (tile.offsetParent === null) return;
        var next = Number(tile.getAttribute("data-next")) || started + FLIP_FIRST_MS + i * FLIP_STAGGER_MS;
        if (now < next) { tile.setAttribute("data-next", String(next)); return; }
        tile.setAttribute("data-next", String(now + FLIP_HOLD_MS + Math.random() * FLIP_JITTER_MS));
        var letter;
        do { letter = FIND_LETTERS.charAt(Math.floor(Math.random() * FIND_LETTERS.length)); }
        while (letter === tile.textContent);
        tile.textContent = letter;
        tile.classList.remove("is-flip");
        void tile.offsetWidth; // restart the flip
        tile.classList.add("is-flip");
      });
    }, 150);
  }

  function stopFinding() {
    if (state.findTimer) { clearInterval(state.findTimer); state.findTimer = null; }
    $$(".flip-tile", els.screens.match).forEach(function (tile) {
      tile.textContent = "?";
      tile.classList.remove("is-flip");
      tile.removeAttribute("data-next");
    });
  }

  function renderFinding(view) {
    var finding = view.status === "lobby" && !!view.matchmaking;
    els.findingPanel.hidden = !finding;
    els.screens.match.classList.toggle("is-finding", finding);
    if (!finding) {
      if (view.status !== "lobby") stopFinding();
      return;
    }
    var me = meIn(view);
    els.findYou.textContent = me ? (me.username || "?").charAt(0).toUpperCase() : "?";
    var since = ago(view.updatedAt, true);
    els.findingSince.textContent = since ? "Started looking " + since + "." : "";
    startFinding();
  }

  function renderLobby(view) {
    renderFinding(view);
    if (view.status !== "lobby" || view.matchmaking) { els.lobbyPanel.hidden = true; return; }
    els.lobbyPanel.hidden = false;
    var missing = Math.max(0, view.maxPlayers - view.players.length);
    els.waitingTitle.textContent = missing > 0
      ? "Waiting for " + missing + " more player" + (missing > 1 ? "s" : "")
      : "Everyone’s here — starting";
    els.lobbyLead.textContent = missing > 0
      ? "The game starts the moment every seat is filled. Whoever opens the link signs in (or signs up), then takes a seat."
      : "";
    var code = view.joinCode;
    els.lobbyCode.textContent = code || "—";
    els.lobbyCode.parentNode.hidden = !code;
    els.shareCodeButton.hidden = !code;
    els.lobbyLink.hidden = !code;
    if (code) els.lobbyLinkField.value = inviteUrl(code);

    clear(els.waitingSeats);
    view.players.forEach(function (p) {
      els.waitingSeats.appendChild(waitingSeat((p.username || "?").charAt(0).toUpperCase(), nameOf(p), false));
    });
    for (var i = 0; i < missing; i++) els.waitingSeats.appendChild(waitingSeat("?", "Open seat", true));
    // The creator (seat 0) closing it ends the table; anyone else just leaves.
    var me = meIn(view);
    els.lobbyClose.textContent = me && me.seat === 0 ? "Close table" : "Leave table";
    if (missing > 0) startFinding();
  }

  function waitingSeat(letter, caption, open) {
    var seat = el("span", "waiting-seat" + (open ? " is-open" : ""));
    seat.appendChild(el("span", "find-tile" + (open ? " flip-tile" : ""), letter));
    seat.appendChild(el("span", "waiting-name", caption));
    return seat;
  }

  function rackActive() {
    var m = state.match;
    return !!(m && m.status === "active" && m.isMyTurn);
  }

  // Tiles can be rearranged while waiting for your turn, which is when most
  // of the thinking happens. Placing them waits for the turn.
  function rackMovable() {
    var m = state.match;
    return !!(m && m.status === "active" && !isOut(m));
  }

  function renderRack() {
    // A re-render mid-drag (a server update, say) removes the dragged tile, and
    // its pointerup never arrives. Drop the gesture rather than leave its ghost.
    if (state.cancelDrag) state.cancelDrag();
    clear(els.rack);
    var active = rackActive();
    var movable = rackMovable();
    state.rackFree.forEach(function (letter, index) {
      var tile = el("button", "tile" + (state.selectedRack === index ? " is-selected" : "") + (letter === "_" ? " is-blank" : ""));
      tile.type = "button";
      tile.disabled = !movable;
      tile.setAttribute("aria-pressed", state.selectedRack === index ? "true" : "false");
      tile.setAttribute("aria-label", letter === "_"
        ? "Blank tile, scores nothing"
        : letter + ", " + (Rules.VALUES[letter] || 0) + (Rules.VALUES[letter] === 1 ? " point" : " points"));
      tile.appendChild(el("span", "tile-letter", letter === "_" ? "" : letter));
      tile.appendChild(el("span", "tile-value", String(Rules.VALUES[letter] || 0)));
      bindRackTile(tile, index);
      els.rack.appendChild(tile);
    });
    els.rack.classList.toggle("is-inactive", !active);
    els.recallButton.disabled = !state.pending.length;
  }

  // A tile dropped somewhere it cannot go returns to the rack. Without a beat
  // of feedback that is indistinguishable from the drag not having registered.
  function rejectDrop(tile) {
    haptic("error");
    tile.classList.remove("is-rejected");
    void tile.offsetWidth; // restart the animation
    tile.classList.add("is-rejected");
    setTimeout(function () { tile.classList.remove("is-rejected"); }, 400);
  }

  // How far above the pointer a dragged tile rides. A finger would otherwise
  // hide both the tile and the square it is aimed at, so on touch the tile
  // floats clear of it; a mouse cursor hides nothing, and there the tile sits
  // on the cursor so it lands exactly where the player points. The drop is
  // always judged at the tile's centre, never at the pointer.
  function dragLift(pointerType) {
    return pointerType === "touch" ? 34 : 0;
  }

  function moveDragGhost(ghost, x, y, lift) {
    ghost.style.transform = "translate(" + x + "px, " + (y - lift) + "px) translate(-50%, -50%) scale(1.15)";
  }

  function selectRack(index) {
    state.selectedRack = state.selectedRack === index ? null : index;
    renderRack();
    syncBoard();
    renderPreview();
  }

  // One gesture, three outcomes, chosen by the dominant axis of the first few
  // pixels of movement:
  //   no movement   → tap to select (and the keyboard's click lands here too)
  //   sideways      → reorder the rack, which is how players find words
  //   towards the board → carry the tile to a square and drop it
  // A ghost follows the pointer during a board drag because the real tile is a
  // flex child of the rack and cannot leave it.
  function bindRackTile(tile, index) {
    var startX = 0, startY = 0, mode = null, target = index, siblings = null, step = 1;
    var ghost = null, dropCell = null, lift = 0;

    function makeGhost() {
      ghost = tile.cloneNode(true);
      ghost.classList.add("tile-ghost");
      ghost.classList.remove("is-selected");
      ghost.removeAttribute("disabled");
      document.body.appendChild(ghost);
      tile.classList.add("is-lifted");
    }

    function moveGhost(x, y) {
      if (ghost) moveDragGhost(ghost, x, y, lift);
    }

    function clearGhost() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      tile.classList.remove("is-lifted");
      if (board) board.setDropTarget(null);
      dropCell = null;
      if (state.dragSlot !== null) { state.dragSlot = null; syncBoard(); }
    }

    function cancel() {
      tile.style.transform = "";
      tile.classList.remove("is-dragging");
      if (siblings) siblings.forEach(function (node) { node.classList.remove("is-drop-target"); });
      siblings = null;
      mode = null;
      state.cancelDrag = null;
      clearGhost();
    }

    function startBoardDrag() {
      mode = "board";
      makeGhost();
      // The dashed "this connects" squares are shown for a selected tile;
      // a dragged tile wants them just as much, and wants them before the
      // drop rather than after it fails.
      state.dragSlot = index;
      syncBoard();
    }

    // Safari on macOS turns a mouse press-and-move into text selection or a
    // native drag unless the press is claimed, and a native drag cancels the
    // pointer stream mid-gesture. The click still follows a claimed press.
    tile.addEventListener("dragstart", function (e) { e.preventDefault(); });

    tile.addEventListener("pointerdown", function (e) {
      if (!rackMovable()) return;
      e.preventDefault();
      try { tile.setPointerCapture(e.pointerId); } catch (_) {}
      state.cancelDrag = cancel;
      startX = e.clientX;
      startY = e.clientY;
      lift = dragLift(e.pointerType);
      mode = null;
      target = index;
      siblings = $$(".tile", els.rack);
      step = tile.getBoundingClientRect().width + 6;
    });

    tile.addEventListener("pointermove", function (e) {
      if (!siblings) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!mode) {
        if (Math.hypot(dx, dy) <= 8) return;
        // Upward is towards the board; sideways is along the rack. Off turn
        // the rack can only be rearranged.
        if (Math.abs(dy) > Math.abs(dx) && rackActive()) {
          startBoardDrag();
        } else {
          mode = "reorder";
          tile.classList.add("is-dragging");
        }
      }
      // The first few pixels of a trackpad drag often run sideways, which
      // locked the gesture into reordering for good. A tile carried well
      // clear of the rack is headed for the board whatever it started as.
      if (mode === "reorder" && dy < -step && rackActive()) {
        tile.style.transform = "";
        tile.classList.remove("is-dragging");
        siblings.forEach(function (node) { node.classList.remove("is-drop-target"); });
        target = index;
        startBoardDrag();
      }
      if (mode === "board") {
        moveGhost(e.clientX, e.clientY);
        var cell = board ? board.cellAtClient(e.clientX, e.clientY - lift) : null;
        var free = cell && state.match && state.match.view
          && state.match.view.board[cell[0]][cell[1]] === null
          && !state.pending.some(function (t) { return t.row === cell[0] && t.col === cell[1]; });
        dropCell = free ? cell : null;
        board.setDropTarget(dropCell);
        e.preventDefault();
        return;
      }
      tile.style.transform = "translateX(" + dx + "px)";
      var next = Math.max(0, Math.min(siblings.length - 1, index + Math.round(dx / step)));
      if (next !== target) {
        siblings.forEach(function (node) { node.classList.remove("is-drop-target"); });
        if (next !== index) siblings[next].classList.add("is-drop-target");
        target = next;
      }
      e.preventDefault();
    });

    function finish() {
      if (!siblings) return;
      var landed = dropCell;
      var how = mode;
      tile.style.transform = "";
      tile.classList.remove("is-dragging");
      siblings.forEach(function (node) { node.classList.remove("is-drop-target"); });
      siblings = null;
      mode = null;
      state.dragSlot = null;
      state.cancelDrag = null;
      clearGhost();
      // A pointer sequence is followed by a synthetic click — but only
      // sometimes: a drag that moved far enough usually emits none. A sticky
      // "already handled" flag therefore outlived the gesture and swallowed
      // the player's NEXT tap, leaving the tile dead until something happened
      // to re-render the rack.
      //
      // A short deadline expires on its own instead. It is deliberately tight:
      // the synthetic click follows within a few milliseconds (the rack sets
      // `touch-action: none`, so there is no 300ms tap delay to wait out), and
      // erring long risks eating a real tap again — which is the bug. Erring
      // short only risks selecting a tile the player just dragged, which is
      // what they were reaching for anyway.
      tile._clickDeadline = Date.now() + 120;

      if (how === "board") {
        if (landed) placeFromRack(index, landed[0], landed[1]);
        else rejectDrop(tile);
        return;
      }
      if (how === "reorder") {
        if (target !== index) {
          var moved = state.rackFree.splice(index, 1)[0];
          state.rackFree.splice(target, 0, moved);
          state.selectedRack = null;
          haptic("light");
          renderRack();
          syncBoard();
        }
        return;
      }
      if (rackActive()) selectRack(index);
    }

    tile.addEventListener("pointerup", finish);
    // A cancelled gesture (the browser took it over) is not a drop: put the
    // tile back without the "rejected" shake or a stray select.
    tile.addEventListener("pointercancel", function () {
      if (!siblings) return;
      cancel();
    });
    // Keyboard activation still arrives as a click with no pointer sequence,
    // and must always select — hence a deadline rather than a flag.
    tile.addEventListener("click", function () {
      if (tile._clickDeadline && Date.now() < tile._clickDeadline) {
        tile._clickDeadline = 0;
        return;
      }
      tile._clickDeadline = 0;
      if (rackActive()) selectRack(index);
    });
  }

  // ---- dictionary check (matches.check): ask about the words a placement
  // makes while it is still on the board, so "not a word" arrives before Play
  // rather than as a refused move. Debounced, cached per word for the session,
  // and only for words not already known; the server stays the judge on Play.

  var DICT_DELAY_MS = 400;

  function isKnownBad(word) {
    return !!state.invalidWords[word] || state.dict[word] === false;
  }

  function checkWordsSoon(words) {
    if (state.dictOff || !OR.capabilities.has("matches.check") || typeof OR.matches.check !== "function" || !state.match) return;
    var unknown = words.filter(function (w) {
      return /^[A-Z]{2,15}$/.test(w) && !(w in state.dict) && !state.dictPending[w];
    });
    if (!unknown.length) return;
    clearTimeout(state.dictTimer);
    var uuid = state.match.matchUuid;
    state.dictTimer = setTimeout(function () {
      var ask = unknown.filter(function (w) { return !(w in state.dict) && !state.dictPending[w]; }).slice(0, 16);
      if (!ask.length) return;
      ask.forEach(function (w) { state.dictPending[w] = true; });
      OR.matches.check({ matchUuid: uuid, words: ask }).then(function (res) {
        var bad = {};
        (res && Array.isArray(res.invalid) ? res.invalid : []).forEach(function (w) { bad[String(w).toUpperCase()] = true; });
        ask.forEach(function (w) { state.dict[w] = !bad[w]; });
      }).catch(function (err) {
        // A game or host that cannot answer stops being asked; anything else
        // (a dropped request) is simply asked again on the next change.
        var code = errorCode(err);
        if (code === "match/unsupported" || code === "match/not-found" || !OR.capabilities.has("matches.check")) state.dictOff = true;
      }).then(function () {
        ask.forEach(function (w) { delete state.dictPending[w]; });
        if (state.screen === "match" && state.match && state.match.matchUuid === uuid) {
          syncBoard();
          renderPreview();
        }
      });
    }, DICT_DELAY_MS);
  }

  function renderPreview() {
    var m = state.match;
    els.preview.className = "preview";
    els.playButton.textContent = "Play";
    if (!m || m.status !== "active" || !m.isMyTurn) {
      els.preview.textContent = "";
      els.playButton.disabled = true;
      return;
    }
    if (!state.pending.length) {
      els.preview.classList.add("is-hint");
      els.preview.textContent = state.selectedRack === null
        ? "Drag a tile onto the board, or tap one then a square."
        : "Now tap a square — the dashed ones connect.";
      els.playButton.disabled = true;
      return;
    }
    var v = m.view;
    var result = Rules.evaluate(v.board, state.pending, v.layout, boardIsEmpty(v.board));
    if (!result.ok) {
      els.preview.classList.add("is-error");
      els.preview.textContent = result.reason;
      els.playButton.disabled = true;
      return;
    }
    clear(els.preview);
    checkWordsSoon(result.words.map(function (w) { return w.word; }));
    var refused = [];
    result.words.forEach(function (w, i) {
      if (i) els.preview.appendChild(document.createTextNode(" · "));
      if (isKnownBad(w.word)) {
        refused.push(w.word);
        els.preview.appendChild(el("span", "invalid", w.word));
        els.preview.appendChild(document.createTextNode(" " + w.score));
      } else {
        var word = el("span", state.dict[w.word] === true ? "word is-ok" : "word", w.word);
        if (state.dict[w.word] === true) word.setAttribute("title", "In the dictionary");
        els.preview.appendChild(word);
        els.preview.appendChild(document.createTextNode(" " + w.score));
      }
    });
    if (refused.length) {
      els.preview.classList.add("is-error");
      els.preview.appendChild(document.createTextNode(" — " + refused.join(", ") + (refused.length > 1 ? " aren't" : " isn't") + " in the dictionary"));
    }
    if (result.bingo) {
      els.preview.appendChild(document.createTextNode(" · "));
      els.preview.appendChild(el("span", "bingo", "bingo +50"));
    }
    if (result.words.length > 1 || result.bingo) {
      els.preview.appendChild(document.createTextNode(" = "));
      els.preview.appendChild(el("span", "score", String(result.score)));
    }
    // A word the dictionary has already refused cannot be played; say so on
    // the button rather than let the player find out from a refused move.
    els.playButton.disabled = refused.length > 0;
    els.playButton.textContent = refused.length ? "Not a word" : "Play for " + result.score;
  }

  // The end of a game, as a result card: who won and by how much, the final
  // table, and a couple of highlights read off the move log.
  function renderOver(view, justEnded) {
    var done = view.status === "finished" || view.status === "abandoned";
    els.over.hidden = !done;
    if (!done) return;
    els.rematchButton.hidden = !(view.status === "finished" && meIn(view) && OR.capabilities.has("matches.create"));
    var moves = movesOf(view);
    els.movesButton.hidden = !moves.length;
    var me = meIn(view);
    clear(els.overScores);
    clear(els.overHighlights);
    if (view.status === "abandoned") {
      els.overKicker.textContent = "Table closed";
      els.overTitle.textContent = "This game never got going";
      els.overText.textContent = "Nobody took the empty seat in time.";
      return;
    }

    var ranked = view.players.slice().sort(function (a, b) { return b.score - a.score; });
    var winner = view.winnerSeat === null ? null : view.players.filter(function (p) { return p.seat === view.winnerSeat; })[0];
    var margin = ranked.length > 1 ? ranked[0].score - ranked[1].score : 0;
    els.overKicker.textContent = "Final" + (moves.length ? " · " + moves.length + " moves" : "");
    if (!winner) {
      els.overTitle.textContent = "It’s a draw";
      els.overText.textContent = "Tied on " + ranked[0].score + ".";
    } else if (me && winner.seat === me.seat) {
      els.overTitle.textContent = "You won!";
      els.overText.textContent = margin ? "By " + margin + (margin === 1 ? " point." : " points.") : "";
      if (justEnded) haptic("success");
      celebrate(view.matchUuid);
    } else {
      els.overTitle.textContent = "@" + winner.username + " won";
      els.overText.textContent = margin ? "By " + margin + (margin === 1 ? " point." : " points.") : "";
    }

    ranked.forEach(function (p, i) {
      var row = el("li", "over-row" + (winner && p.seat === winner.seat ? " is-winner" : "") + (p.isSelf ? " is-self" : ""));
      row.appendChild(el("span", "over-rank", winner && p.seat === winner.seat ? "★" : String(i + 1)));
      row.appendChild(avatar(p.username, p.avatar));
      var name = nameOf(p) + (p.status === "resigned" ? " · resigned" : p.status === "forfeited" ? " · left" : "");
      row.appendChild(el("span", "over-name", name));
      row.appendChild(el("span", "over-score", String(p.score)));
      els.overScores.appendChild(row);
    });

    // Highlights from the viewer's own moves: the best word, how many words,
    // and any bingos. Only from a log the server sent (view.history).
    if (me && moves.length) {
      var mine = moves.filter(function (mv) { return mv.seat === me.seat && mv.type === "place"; });
      var best = null;
      mine.forEach(function (mv) { if (!best || mv.score > best.score) best = mv; });
      var bingos = mine.filter(function (mv) { return mv.count === Rules.RACK; }).length;
      if (best && best.words.length) els.overHighlights.appendChild(highlight("Best word", best.words[0], "+" + best.score));
      if (mine.length) els.overHighlights.appendChild(highlight("Words played", String(mine.length)));
      if (bingos) els.overHighlights.appendChild(highlight("Bingos", String(bingos)));
    }
  }

  function highlight(label, value, extra) {
    var box = el("div", "over-highlight");
    box.appendChild(el("span", "over-hl-label", label));
    var v = el("span", "over-hl-value", value);
    if (extra) v.appendChild(el("span", "over-hl-extra", " " + extra));
    box.appendChild(v);
    return box;
  }

  // A shower of tiles, once per won game per session. Nothing for players
  // who asked for less motion.
  function celebrate(uuid) {
    if (state.celebrated[uuid] || (reduceMotion && reduceMotion.matches)) return;
    state.celebrated[uuid] = true;
    clear(els.overBurst);
    var letters = "WINNERBRAVOYES";
    for (var i = 0; i < 18; i++) {
      var t = el("span", "burst-tile", letters.charAt(i % letters.length));
      t.style.left = (4 + Math.random() * 92) + "%";
      t.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s";
      t.style.setProperty("--spin", (Math.random() * 120 - 60).toFixed(0) + "deg");
      els.overBurst.appendChild(t);
    }
    setTimeout(function () { clear(els.overBurst); }, 2800);
  }

  // Same table, same board type, new game. Opponents the viewer can still
  // invite are seated straight away; anyone they cannot (a stranger who came
  // in on a join code) gets a spare seat, so the new game opens as a lobby
  // with a code to send them.
  function rematch() {
    var m = state.match;
    if (!m || state.creating) return;
    var others = opponentsOf(m);
    state.creating = true;
    els.rematchButton.disabled = true;
    els.rematchButton.textContent = "Setting up…";
    function settle() {
      state.creating = false;
      els.rematchButton.disabled = false;
      els.rematchButton.textContent = "Rematch";
    }
    fetchInvitable().then(function (res) {
      var ok = {};
      res.people.forEach(function (p) { ok[p.uuid] = true; });
      var invitees = others.filter(function (p) { return ok[p.uuid]; });
      var strangers = others.filter(function (p) { return !ok[p.uuid]; });
      return OR.matches.create({
        game: m.game,
        maxPlayers: m.players.length,
        invitees: invitees.map(function (p) { return p.uuid; }),
        open: strangers.length > 0
      }).then(function (view) {
        settle();
        haptic("success");
        // The player may have left the finished game while this was in flight.
        if (state.screen !== "match" || !state.match || state.match.matchUuid !== m.matchUuid) {
          toast("Your rematch is ready in your games.");
          return;
        }
        enterMatch(view);
        if (strangers.length) {
          toast("Send the code to " + strangers.map(function (p) { return "@" + p.username; }).join(", ")
            + " — you can only invite people you follow or who follow you.");
        }
      });
    }).catch(function (err) {
      settle();
      toast(errorText(err, "Couldn't set up the rematch."), true);
    });
  }

  // ------------------------------------------------------------ tiles left

  // Everything not on the board or the viewer's rack: in the bag or on an
  // opponent's rack. Counting from the full bag is what players do on paper,
  // and it needs nothing from the server that the view does not already carry.
  function showTiles() {
    var m = state.match;
    var v = m && m.view;
    if (!v || !v.board) return;
    var left = Rules.unseen(v.board, v.myRack);
    var letters = Object.keys(Rules.DISTRIBUTION);
    var total = letters.reduce(function (sum, l) { return sum + left[l]; }, 0);
    var bag = typeof v.bagCount === "number" ? v.bagCount : null;
    var racks = bag === null ? 0 : Math.max(0, total - bag);
    var live = opponentsOf(m).filter(function (p) { return p.status === "joined"; });
    var where = bag === null ? ""
      : ": " + bag + " in the bag" + (racks ? " and " + racks + " on "
        + (live.length === 1 ? "@" + live[0].username + "’s rack" : "your opponents’ racks") : "");
    openDialog({
      title: "Tiles left",
      prose: true,
      cancelLabel: "Close",
      build: function (body) {
        body.appendChild(el("p", "muted", total + " tile" + (total === 1 ? "" : "s") + " you can’t see" + where + "."));
        var grid = el("div", "tile-count-grid");
        letters.forEach(function (l) {
          var cell = el("span", "tile-count" + (left[l] ? "" : " is-gone"));
          cell.appendChild(el("b", "", l === "_" ? "?" : l));
          cell.appendChild(el("i", "", String(left[l])));
          cell.setAttribute("aria-label", (l === "_" ? "Blank" : l) + ": " + left[l] + " left");
          grid.appendChild(cell);
        });
        body.appendChild(grid);
        return {};
      }
    });
  }

  // ------------------------------------------------------------ move log

  // The move log, from `view.history`: every move as `lastMove` has it,
  // oldest first, already filtered for this viewer by the server. The log
  // keeps squares, not words, so the words each placement made are found by
  // replaying the tiles over an empty board — the same evaluate() that
  // previews a move, on the layout this match plays on. A host that predates
  // `history` sends none, and the Moves entries stay hidden.
  function movesOf(view) {
    var v = view && view.view;
    if (!v || !Array.isArray(v.history) || !v.history.length) return [];
    var layout = v.layout || Rules.layout();
    var grid = [];
    for (var r = 0; r < Rules.SIZE; r++) grid.push(new Array(Rules.SIZE).fill(null));
    return v.history.map(function (entry) {
      var move = (entry && entry.move) || {};
      var out = {
        ply: entry.ply, seat: entry.seat, type: move.type,
        score: typeof entry.scoreDelta === "number" ? entry.scoreDelta : 0,
        words: [], count: null, forced: !!move.forced
      };
      if (move.type === "place" && Array.isArray(move.tiles)) {
        var tiles = move.tiles.filter(function (t) {
          return t && t.row >= 0 && t.row < Rules.SIZE && t.col >= 0 && t.col < Rules.SIZE && typeof t.letter === "string";
        });
        var result = Rules.evaluate(grid, tiles, layout, boardIsEmpty(grid));
        if (result.ok) out.words = result.words.map(function (w) { return w.word; });
        tiles.forEach(function (t) {
          if (grid[t.row][t.col] === null) grid[t.row][t.col] = { l: t.letter, b: !!t.blank };
        });
        out.count = tiles.length;
      } else if (move.type === "exchange" && typeof move.count === "number") {
        out.count = move.count;
      }
      return out;
    });
  }

  // The other players' moves since the viewer's own last one (all of them,
  // before the viewer has moved), oldest first.
  function movesSinceMine(view) {
    var me = meIn(view);
    var moves = movesOf(view);
    if (!me) return [];
    var lastMine = -1;
    moves.forEach(function (mv) { if (mv.seat === me.seat) lastMine = mv.ply; });
    return moves.filter(function (mv) { return mv.ply > lastMine && mv.seat !== me.seat; });
  }

  function describeMove(mv) {
    if (mv.type === "place") {
      return (mv.words.join(", ") || "A word") + (mv.count === Rules.RACK ? " · bingo" : "");
    }
    if (mv.type === "exchange") return mv.count !== null ? "Swapped " + mv.count + " tile" + (mv.count === 1 ? "" : "s") : "Swapped tiles";
    if (mv.type === "pass") return mv.forced ? "Skipped" : "Passed";
    if (mv.type === "claim") return "Stopped playing";
    return "Moved";
  }

  function showMoves() {
    var m = state.match;
    var moves = movesOf(m);
    if (!moves.length) return;
    openDialog({
      title: "Moves",
      prose: true,
      cancelLabel: "Close",
      build: function (body) {
        var list = el("ol", "moves-list");
        // In a game still going, what the others did since your last move
        // comes first under its own heading: that is what a player opening
        // the log at a table of three or four wants to catch up on.
        var fresh = {};
        if (m.status === "active") movesSinceMine(m).forEach(function (mv) { fresh[mv.ply] = true; });
        var anyFresh = Object.keys(fresh).length > 0;
        var anyOld = moves.some(function (mv) { return !fresh[mv.ply]; });
        if (anyFresh) list.appendChild(el("li", "moves-divider", "Since your last move"));
        var dividedOld = false;
        moves.slice().reverse().forEach(function (mv) {
          var player = m.players.filter(function (p) { return p.seat === mv.seat; })[0];
          if (anyFresh && anyOld && !fresh[mv.ply] && !dividedOld) {
            list.appendChild(el("li", "moves-divider", "Earlier"));
            dividedOld = true;
          }
          var row = el("li", "move-row" + (fresh[mv.ply] ? " is-new" : ""));
          row.appendChild(el("span", "move-who", player ? nameOf(player) : "Someone"));
          row.appendChild(el("span", "move-what" + (mv.type === "place" ? " is-word" : ""), describeMove(mv)));
          // The move's own delta: a placement's points (plus everyone else's
          // leftover tiles when it goes out), or what a game-ending pass cost.
          var pts = mv.score > 0 ? "+" + mv.score : mv.score < 0 ? "−" + (-mv.score) : "—";
          row.appendChild(el("span", "move-pts" + (mv.score > 0 ? "" : mv.score < 0 ? " is-loss" : " is-none"), pts));
          list.appendChild(row);
        });
        body.appendChild(list);
        return {};
      }
    });
  }

  // ---------------------------------------------------------------- chat
  //
  // The match's conversation (`matches.chat` / `matches.chatSend`). It is the
  // platform's own chat seen through the match: two players share their DM,
  // three or four a group the server links to the match. So a message sent
  // here is in the other player's Chat inbox, and one sent from Chat shows up
  // here. A message does not move the match's `version`, so `watch` never
  // fires for one; the chat polls on its own, faster while the sheet is open.
  // Everything is gated on the host declaring both verbs.

  var CHAT_POLL_OPEN_MS = 4000;
  var CHAT_POLL_CLOSED_MS = 15000;
  var CHAT_PAGE = 30;
  var CHAT_MAX = 500;
  // A gap this long between two messages starts a new time heading.
  var CHAT_GAP_MS = 30 * 60 * 1000;
  var CHAT_QUICK = ["Good game!", "Nice word!", "Your move 👀", "👍"];

  function canChat() {
    return OR.capabilities.has("matches.chat") && OR.capabilities.has("matches.chatSend")
      && typeof OR.matches.chat === "function" && typeof OR.matches.chatSend === "function";
  }

  // Somebody to talk to: another seat that is (or was) actually at the table.
  // A lobby of one, or a quick-match table still looking, has nobody.
  function chatAvailable(view) {
    return !!view && canChat() && view.players.some(function (p) { return !p.isSelf && p.status !== "invited"; });
  }

  function newChatState(uuid) {
    return {
      uuid: uuid,
      messages: [],     // stored messages, oldest first, by messageUuid
      outbox: [],       // { nonce, text, failed, error } not yet stored
      unread: 0,
      hasMore: false,
      loaded: false,
      loadError: false,
      loadingOlder: false,
      open: false,
      timer: null,
      inFlight: false,
      lastSeenUuid: null
    };
  }

  function chatNonce() {
    var out = "wb-";
    for (var i = 0; i < 16; i++) out += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return out;
  }

  function startChat(view) {
    stopChat();
    state.chat = newChatState(view.matchUuid);
    renderChatButton();
    if (chatAvailable(view)) pollChat();
  }

  function stopChat() {
    var c = state.chat;
    if (!c) return;
    // Close first: closing schedules the next poll, which must not outlive us.
    if (c.open) closeChat();
    clearTimeout(c.timer);
    c.timer = null;
    state.chat = null;
  }

  function scheduleChat(ms) {
    var c = state.chat;
    if (!c) return;
    clearTimeout(c.timer);
    c.timer = setTimeout(pollChat, ms === undefined ? (c.open ? CHAT_POLL_OPEN_MS : CHAT_POLL_CLOSED_MS) : ms);
  }

  // One poll: the latest page, merged into what is already held (older pages
  // the player scrolled back to stay). Skipped while the page is hidden and
  // picked up again on the next tick.
  function pollChat() {
    var c = state.chat;
    if (!c || state.screen !== "match" || !chatAvailable(state.match)) return;
    if (document.hidden || c.inFlight) { scheduleChat(); return; }
    c.inFlight = true;
    var uuid = c.uuid;
    OR.matches.chat({ matchUuid: uuid, limit: CHAT_PAGE, markSeen: c.open }).then(function (page) {
      if (state.chat !== c) return;
      var fresh = mergeChat(c, page.messages);
      if (!c.loaded) c.hasMore = page.hasMore;
      c.loaded = true;
      c.loadError = false;
      c.unread = c.open ? 0 : page.unread;
      if (c.open && fresh.length) renderChatLog(false);
      else if (c.open && !c.messages.length) renderChatLog(true);
      else announceChat(fresh);
      renderChatButton();
    }).catch(function () {
      if (state.chat !== c) return;
      c.loadError = !c.loaded;
      if (c.open) renderChatLog(false);
    }).then(function () {
      if (state.chat !== c) return;
      c.inFlight = false;
      scheduleChat();
    });
  }

  // Add messages by uuid, keep the list oldest first, and retire any outbox
  // entry the server now holds (matched by the nonce it echoes). Returns the
  // messages that were not held before.
  function mergeChat(c, messages) {
    var have = {};
    c.messages.forEach(function (msg) { have[msg.messageUuid] = true; });
    var fresh = messages.filter(function (msg) { return !have[msg.messageUuid]; });
    if (!fresh.length) return fresh;
    c.messages = c.messages.concat(fresh).sort(function (a, b) {
      return Date.parse(a.sentAt) - Date.parse(b.sentAt);
    });
    var stored = {};
    fresh.forEach(function (msg) { if (msg.nonce) stored[msg.nonce] = true; });
    c.outbox = c.outbox.filter(function (o) { return !stored[o.nonce]; });
    return fresh;
  }

  // With the sheet closed: a short line for the newest message from someone
  // else, after the first load (which is history, not news).
  function announceChat(fresh) {
    var c = state.chat;
    if (!c || !c.lastSeenUuid) {
      if (c && c.messages.length) c.lastSeenUuid = c.messages[c.messages.length - 1].messageUuid;
      return;
    }
    var theirs = fresh.filter(function (msg) { return !msg.isSelf; });
    c.lastSeenUuid = c.messages[c.messages.length - 1].messageUuid;
    if (!theirs.length || dialogState) return;
    var last = theirs[theirs.length - 1];
    haptic("light");
    toast("@" + last.username + ": " + chatPreviewText(last));
  }

  function chatPreviewText(msg) {
    var text = msg.kind === "text" ? msg.text : chatKindText(msg.kind);
    return text.length > 60 ? text.slice(0, 57) + "…" : text;
  }

  function chatKindText(kind) {
    if (kind === "image") return "Sent a photo";
    if (kind === "voice") return "Sent a voice message";
    if (kind === "video") return "Sent a video";
    return "Sent something";
  }

  function renderChatButton() {
    var c = state.chat;
    var show = !!c && chatAvailable(state.match);
    els.chatButton.hidden = !show;
    var n = show ? c.unread : 0;
    els.chatBadge.hidden = !n;
    els.chatBadge.textContent = n > 9 ? "9+" : String(n);
    els.chatButton.setAttribute("aria-label", n ? "Chat, " + n + " unread" : "Chat");
  }

  function openChat() {
    var c = state.chat;
    var m = state.match;
    if (!c || !chatAvailable(m) || c.open) return;
    if (dialogState) closeDialog(null);
    c.open = true;
    c.unread = 0;
    // A "new message" toast would sit on the composer, and the message is here now.
    els.toast.hidden = true;
    var others = m.players.filter(function (p) { return !p.isSelf && p.status !== "invited"; });
    els.chatSub.textContent = others.length === 1
      ? "With @" + others[0].username + " · also in your Chat"
      : "Everyone in this game · also in your Chat";
    renderChatQuick();
    renderChatLog(true);
    renderChatButton();
    els.chatWrap.hidden = false;
    document.documentElement.setAttribute("data-overlay", "chat");
    fitChatToViewport();
    // Opening marks it read on the server, and fetches anything newer.
    scheduleChat(0);
    // On touch the keyboard would cover half the sheet the moment it opens;
    // a player usually wants to read first. With a real keyboard, type away.
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) {
      setTimeout(function () { els.chatInput.focus(); }, 0);
    } else {
      setTimeout(function () { els.chatClose.focus({ preventScroll: true }); }, 0);
    }
  }

  function closeChat() {
    var c = state.chat;
    if (!c || !c.open) return;
    c.open = false;
    els.chatWrap.hidden = true;
    els.chatInput.blur();
    if (!dialogState) document.documentElement.removeAttribute("data-overlay");
    if (c.messages.length) c.lastSeenUuid = c.messages[c.messages.length - 1].messageUuid;
    scheduleChat();
    try { els.chatButton.focus({ preventScroll: true }); } catch (_) {}
  }

  // The on-screen keyboard shrinks the visual viewport but not always the
  // layout one (iOS WebViews), which would leave the composer under it. Lift
  // the sheet by the difference while it is open.
  function fitChatToViewport() {
    var vv = window.visualViewport;
    var lift = 0;
    if (vv) lift = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    els.chatSheet.style.setProperty("--chat-kb", lift + "px");
  }

  function renderChatQuick() {
    clear(els.chatQuick);
    CHAT_QUICK.forEach(function (text) {
      var chip = el("button", "chat-chip", text);
      chip.type = "button";
      chip.addEventListener("click", function () { sendChat(text); });
      els.chatQuick.appendChild(chip);
    });
  }

  function chatTimeHeading(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    var today = new Date();
    var yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today " + time;
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday " + time;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + time;
  }

  // Redraw the whole log. Small (a page or a few), and simpler than patching:
  // stays pinned to the bottom when it was there (or `toBottom`), and keeps
  // its place when the player has scrolled up to read.
  function renderChatLog(toBottom) {
    var c = state.chat;
    if (!c) return;
    var log = els.chatLog;
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    var fromBottom = log.scrollHeight - log.scrollTop;
    var many = state.match && state.match.players.filter(function (p) { return !p.isSelf; }).length > 1;

    clear(els.chatList);
    var prev = null;
    c.messages.forEach(function (msg) {
      var t = Date.parse(msg.sentAt);
      if (!prev || t - Date.parse(prev.sentAt) > CHAT_GAP_MS) {
        els.chatList.appendChild(el("li", "chat-time", chatTimeHeading(msg.sentAt)));
        prev = null;
      }
      var first = !prev || prev.uuid !== msg.uuid;
      var row = el("li", "chat-msg" + (msg.isSelf ? " is-self" : "") + (first ? " is-first" : ""));
      if (first && many && !msg.isSelf) row.appendChild(el("span", "chat-who", "@" + msg.username));
      var bubble = el("span", "chat-bubble" + (msg.kind === "text" ? "" : " is-other"),
        msg.kind === "text" ? msg.text : chatKindText(msg.kind) + " — open Chat to see it");
      bubble.title = chatTimeHeading(msg.sentAt);
      row.appendChild(bubble);
      els.chatList.appendChild(row);
      prev = msg;
    });
    c.outbox.forEach(function (o) {
      var row = el("li", "chat-msg is-self is-first" + (o.failed ? " is-failed" : " is-sending"));
      var bubble = el("span", "chat-bubble", o.text);
      row.appendChild(bubble);
      if (o.failed) {
        // A refusal (muted, blocked, moderation) would only be refused again,
        // so it offers to take the bubble away; a dropped send offers a retry.
        var retry = el("button", "chat-retry", o.refused ? o.error + " · Remove" : "Not sent · Tap to retry");
        retry.type = "button";
        retry.addEventListener("click", function () { if (o.refused) dropChat(o); else retryChat(o); });
        row.appendChild(retry);
      }
      els.chatList.appendChild(row);
    });

    els.chatOlder.hidden = !(c.loaded && c.hasMore);
    els.chatOlder.disabled = c.loadingOlder;
    els.chatOlder.textContent = c.loadingOlder ? "Loading…" : "Earlier messages";
    var empty = !c.messages.length && !c.outbox.length;
    els.chatEmpty.hidden = !empty;
    els.chatEmpty.textContent = c.loadError ? "Couldn’t load messages. Trying again…"
      : !c.loaded ? "Loading…"
      : "No messages yet. Say hi — it’ll land in their Chat too.";
    els.chatQuick.hidden = !c.loaded;

    if (toBottom || atBottom) log.scrollTop = log.scrollHeight;
    else log.scrollTop = log.scrollHeight - fromBottom;
  }

  function loadOlderChat() {
    var c = state.chat;
    if (!c || c.loadingOlder || !c.hasMore || !c.messages.length) return;
    c.loadingOlder = true;
    renderChatLog(false);
    OR.matches.chat({ matchUuid: c.uuid, before: c.messages[0].messageUuid, limit: CHAT_PAGE }).then(function (page) {
      if (state.chat !== c) return;
      mergeChat(c, page.messages);
      c.hasMore = page.hasMore;
    }).catch(function (err) {
      if (state.chat === c) toast(errorText(err, "Couldn't load earlier messages."), true);
    }).then(function () {
      if (state.chat !== c) return;
      c.loadingOlder = false;
      if (c.open) {
        // Keep the message the player was looking at where it was.
        renderChatLog(false);
      }
    });
  }

  function sendChat(text) {
    var c = state.chat;
    text = String(text || "").trim();
    if (!c || !text) return;
    if (text.length > CHAT_MAX) text = text.slice(0, CHAT_MAX);
    var entry = { nonce: chatNonce(), text: text, failed: false, refused: false, error: "" };
    c.outbox.push(entry);
    renderChatLog(true);
    deliverChat(c, entry);
  }

  function retryChat(entry) {
    var c = state.chat;
    if (!c || !entry.failed) return;
    entry.failed = false;
    entry.error = "";
    renderChatLog(false);
    deliverChat(c, entry);
  }

  function dropChat(entry) {
    var c = state.chat;
    if (!c) return;
    c.outbox = c.outbox.filter(function (o) { return o !== entry; });
    renderChatLog(false);
  }

  // The nonce rides every attempt, so a retry after a reply that got lost is
  // stored once and its echo retires the bubble either way.
  function deliverChat(c, entry) {
    OR.matches.chatSend({ matchUuid: c.uuid, text: entry.text, nonce: entry.nonce }).then(function (msg) {
      if (state.chat !== c) return;
      if (!msg.nonce) msg.nonce = entry.nonce;
      c.outbox = c.outbox.filter(function (o) { return o !== entry; });
      mergeChat(c, [msg]);
      c.lastSeenUuid = c.messages[c.messages.length - 1].messageUuid;
      if (c.open) renderChatLog(true);
    }).catch(function (err) {
      if (state.chat !== c) return;
      entry.failed = true;
      entry.refused = errorCode(err) === "match/chat-refused";
      entry.error = entry.refused ? errorText(err, "That message can't be sent.") : "";
      if (c.open) renderChatLog(false);
      else toast(entry.refused ? entry.error : "Your message didn't send.", true);
    });
  }

  function submitChat() {
    var text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    sizeChatInput();
    sendChat(text);
  }

  function sizeChatInput() {
    var input = els.chatInput;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    els.chatSend.disabled = !input.value.trim();
  }

  function wireChat() {
    els.chatButton.addEventListener("click", openChat);
    els.chatClose.addEventListener("click", closeChat);
    els.chatOlder.addEventListener("click", loadOlderChat);
    els.chatWrap.addEventListener("click", function (e) {
      if (e.target === els.chatWrap) closeChat();
    });
    els.chatWrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeChat(); }
    });
    els.chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitChat();
    });
    els.chatInput.addEventListener("input", sizeChatInput);
    // Enter sends and Shift+Enter breaks the line, with a real keyboard. On a
    // phone the keyboard's own send key (enterkeyhint) is the Enter key too.
    els.chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submitChat();
      }
    });
    els.chatLog.addEventListener("scroll", function () {
      if (els.chatLog.scrollTop < 24) loadOlderChat();
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        if (state.chat && state.chat.open) {
          fitChatToViewport();
          els.chatLog.scrollTop = els.chatLog.scrollHeight;
        }
      });
    }
    // Back in view: catch up now rather than at the next tick.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && state.chat && state.screen === "match") scheduleChat(0);
    });
  }

  // ------------------------------------------------------------ celebration

  function popScore(points, bingo, word) {
    clear(els.scorePop);
    if (word) els.scorePop.appendChild(el("span", "pop-word", word));
    els.scorePop.appendChild(el("span", "pop-score", "+" + points));
    if (bingo) els.scorePop.appendChild(el("span", "pop-bingo", "BINGO +50"));
    els.scorePop.hidden = false;
    els.scorePop.classList.remove("is-live");
    void els.scorePop.offsetWidth; // restart the animation
    els.scorePop.classList.add("is-live");
    clearTimeout(popScore.timer);
    popScore.timer = setTimeout(function () {
      els.scorePop.hidden = true;
      els.scorePop.classList.remove("is-live");
    }, 1700);
  }

  // The opponent's word, announced the same way yours is, once per ply.
  function celebrateOpponent(view) {
    var lm = view.lastMove;
    if (!lm || lm.ply === state.announcedPly) return;
    state.announcedPly = lm.ply;
    var player = view.players.filter(function (p) { return p.seat === lm.seat; })[0];
    if (!player || player.isSelf) return;
    if (!lm.move || lm.move.type !== "place") return;
    var placed = placedScore(view);
    if (placed) popScore(placed.score, placed.bingo, placed.word);
  }

  // ------------------------------------------------------------ placing

  function onCellTap(row, col) {
    var m = state.match;
    if (!m || m.status !== "active" || !m.isMyTurn) return;
    var existing = null;
    for (var i = 0; i < state.pending.length; i++) {
      if (state.pending[i].row === row && state.pending[i].col === col) existing = i;
    }
    if (existing !== null) {
      // Tap a laid tile to pick it back up.
      var t = state.pending.splice(existing, 1)[0];
      state.rackFree.push(t.blank ? "_" : t.letter);
      state.selectedRack = null;
      renderRack();
      syncBoard();
      renderPreview();
      return;
    }
    if (state.selectedRack === null) {
      if (state.rackFree.length) toast("Pick a tile from your rack, or drag one onto the board.");
      return;
    }
    placeFromRack(state.selectedRack, row, col);
  }

  // Put rack tile `slot` on (row, col). Shared by tap-to-place, drag-to-place
  // and the keyboard, so all three obey the same rules and the blank picker
  // only exists once.
  function placeFromRack(slot, row, col) {
    var m = state.match;
    if (!m || m.status !== "active" || !m.isMyTurn) return false;
    if (slot === null || slot === undefined || slot < 0 || slot >= state.rackFree.length) return false;
    if (!m.view || !m.view.board || m.view.board[row][col] !== null) return false;
    var taken = state.pending.some(function (t) { return t.row === row && t.col === col; });
    if (taken) return false;
    var letter = state.rackFree[slot];
    if (letter === "_") {
      var uuid = m.matchUuid;
      pickLetter(function (chosen) {
        if (!chosen) return;
        // An update may have landed while the picker was open.
        var now = state.match;
        if (state.screen !== "match" || !now || now.matchUuid !== uuid || !rackActive()) return;
        var blankSlot = state.rackFree[slot] === "_" ? slot : state.rackFree.indexOf("_");
        var stillFree = now.view.board[row][col] === null
          && !state.pending.some(function (t) { return t.row === row && t.col === col; });
        if (blankSlot === -1 || !stillFree) return;
        commitPlace(row, col, chosen, true, blankSlot);
      });
      return true;
    }
    commitPlace(row, col, letter, false, slot);
    return true;
  }

  function commitPlace(row, col, letter, blank, slot) {
    if (slot === null || slot === undefined || slot >= state.rackFree.length) return;
    state.rackFree.splice(slot, 1);
    state.pending.push({ row: row, col: col, letter: letter, blank: blank });
    // Clear the selection rather than advancing it: a tile highlighted on its
    // own reads as the game suggesting that letter.
    state.selectedRack = null;
    haptic("light");
    renderRack();
    syncBoard();
    renderPreview();
  }

  // ---- moving a placed tile: the board reports the gesture, this side
  // owns the ghost and decides where the tile lands.

  function pendingIndexAt(row, col) {
    for (var i = 0; i < state.pending.length; i++) {
      if (state.pending[i].row === row && state.pending[i].col === col) return i;
    }
    return -1;
  }

  function overRack(clientX, clientY) {
    var r = els.rack.getBoundingClientRect();
    return clientY >= r.top - 12 && clientY <= r.bottom + 12 && clientX >= r.left - 12 && clientX <= r.right + 12;
  }

  function liftTarget(clientX, clientY) {
    var lift = state.lift;
    var cell = board ? board.cellAtClient(clientX, clientY) : null;
    if (!cell || !lift) return null;
    var m = state.match;
    // Any square without a played tile: empty, or holding another of this
    // turn's tiles, which the lifted one swaps with.
    return m.view.board[cell[0]][cell[1]] === null ? cell : null;
  }

  function endLift() {
    var lift = state.lift;
    state.lift = null;
    if (lift && lift.ghost.parentNode) lift.ghost.parentNode.removeChild(lift.ghost);
    els.rack.classList.remove("is-drop-target");
    if (board) { board.setLifted(null); board.setDropTarget(null); }
    return lift;
  }

  var liftHandlers = {
    canLift: function (row, col) { return rackActive() && pendingIndexAt(row, col) !== -1; },
    onLiftStart: function (row, col, x, y, pointerType) {
      var t = state.pending[pendingIndexAt(row, col)];
      var ghost = el("div", "tile tile-ghost");
      ghost.appendChild(el("span", "tile-letter", t.letter));
      ghost.appendChild(el("span", "tile-value", String(t.blank ? 0 : (Rules.VALUES[t.letter] || 0))));
      document.body.appendChild(ghost);
      state.lift = { row: row, col: col, ghost: ghost, by: dragLift(pointerType) };
      board.setLifted([row, col]);
      liftHandlers.onLiftMove(x, y);
    },
    onLiftMove: function (x, y) {
      if (!state.lift) return;
      moveDragGhost(state.lift.ghost, x, y, state.lift.by);
      y -= state.lift.by;
      var rack = overRack(x, y);
      els.rack.classList.toggle("is-drop-target", rack);
      board.setDropTarget(rack ? null : liftTarget(x, y));
    },
    onLiftEnd: function (x, y) {
      if (state.lift) y -= state.lift.by;
      var cell = liftTarget(x, y);
      var rack = overRack(x, y);
      var lift = endLift();
      if (!lift) return;
      var i = pendingIndexAt(lift.row, lift.col);
      if (i === -1) return;
      if (rack) {
        var t = state.pending.splice(i, 1)[0];
        state.rackFree.push(t.blank ? "_" : t.letter);
        state.selectedRack = null;
        haptic("light");
        renderRack();
      } else if (cell) {
        var other = pendingIndexAt(cell[0], cell[1]);
        if (other !== -1 && other !== i) {
          state.pending[other].row = lift.row;
          state.pending[other].col = lift.col;
        }
        state.pending[i].row = cell[0];
        state.pending[i].col = cell[1];
        haptic("light");
      }
      syncBoard();
      renderPreview();
    },
    onLiftCancel: function () {
      endLift();
      syncBoard();
    }
  };

  function recall() {
    state.pending.forEach(function (t) { state.rackFree.push(t.blank ? "_" : t.letter); });
    state.pending = [];
    state.selectedRack = null;
    renderRack();
    syncBoard();
    renderPreview();
  }

  function shuffleRack() {
    for (var i = state.rackFree.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = state.rackFree[i]; state.rackFree[i] = state.rackFree[j]; state.rackFree[j] = tmp;
    }
    state.selectedRack = null;
    renderRack();
    syncBoard();
  }

  // ------------------------------------------------------------ keyboard

  function announce(row, col) {
    if (board) els.boardStatus.textContent = board.describe(row, col);
  }

  function moveCursor(row, col, dir) {
    var size = window.TilesBoard.SIZE;
    row = Math.max(0, Math.min(size - 1, row));
    col = Math.max(0, Math.min(size - 1, col));
    board.setCursor(row, col, dir);
    announce(row, col);
  }

  function occupiedAt(row, col) {
    var m = state.match;
    if (!m || !m.view || !m.view.board) return false;
    if (m.view.board[row][col]) return true;
    return state.pending.some(function (t) { return t.row === row && t.col === col; });
  }

  // Walk the caret forward past anything already on the board, so typing
  // through an existing word does what a player expects.
  function advanceCursor(row, col, dir) {
    var size = window.TilesBoard.SIZE;
    var r = row + dir[0], c = col + dir[1];
    while (r >= 0 && c >= 0 && r < size && c < size && occupiedAt(r, c)) { r += dir[0]; c += dir[1]; }
    if (r < 0 || c < 0 || r >= size || c >= size) return [row, col];
    return [r, c];
  }

  function typeLetter(letter) {
    var cursor = board.getCursor();
    var dir = board.getCursorDir();
    if (occupiedAt(cursor[0], cursor[1])) {
      cursor = advanceCursor(cursor[0], cursor[1], dir);
      if (occupiedAt(cursor[0], cursor[1])) { toast("No room that way."); return; }
    }
    var slot = state.rackFree.indexOf(letter);
    var blank = false;
    if (slot === -1) {
      slot = state.rackFree.indexOf("_");
      blank = slot !== -1;
    }
    if (slot === -1) { toast("No " + letter + " on your rack.", true); return; }
    state.selectedRack = slot;
    commitPlace(cursor[0], cursor[1], letter, blank, slot);
    var next = advanceCursor(cursor[0], cursor[1], dir);
    board.setCursor(next[0], next[1], dir);
    announce(next[0], next[1]);
  }

  function backspaceTile() {
    if (!state.pending.length) return;
    var t = state.pending.pop();
    state.rackFree.push(t.blank ? "_" : t.letter);
    state.selectedRack = null;
    renderRack();
    syncBoard();
    renderPreview();
    board.setCursor(t.row, t.col, board.getCursorDir());
    announce(t.row, t.col);
  }

  function onKeyDown(e) {
    if (dialogState) return; // the dialog traps its own keys
    if (state.chat && state.chat.open) return; // and so does the chat sheet
    if (state.screen !== "match" || !board) return;
    var target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    // A focused button owns Enter and Space; letters and arrows still reach the board.
    if ((e.key === "Enter" || e.key === " ") && target && target.closest && target.closest("button, a, [role=button]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var m = state.match;
    if (!m || m.status !== "active" || !m.isMyTurn) return;

    var key = e.key;
    var arrows = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    var first = !board.getCursor();
    if (first && (arrows[key] || /^[a-zA-Z]$/.test(key))) {
      board.setCursor(7, 7, [0, 1]);
      try { els.boardCanvas.focus({ preventScroll: true }); } catch (_) { els.boardCanvas.focus(); }
      announce(7, 7);
      if (arrows[key]) { e.preventDefault(); return; } // the first arrow just reveals the caret
    }

    if (arrows[key]) {
      var cursor = board.getCursor();
      moveCursor(cursor[0] + arrows[key][0], cursor[1] + arrows[key][1], arrows[key]);
      e.preventDefault();
      return;
    }
    if (key === "Enter") {
      if (!els.playButton.disabled) play();
      e.preventDefault();
      return;
    }
    if (key === "Escape") {
      if (state.pending.length) recall();
      e.preventDefault();
      return;
    }
    if (key === "Backspace") {
      backspaceTile();
      e.preventDefault();
      return;
    }
    if (/^[a-zA-Z]$/.test(key)) {
      typeLetter(key.toUpperCase());
      e.preventDefault();
    }
  }

  // ------------------------------------------------------------- moves

  function sendMove(move, okText) {
    if (state.sending || !state.match) return;
    state.sending = true;
    els.playButton.disabled = true;
    var uuid = state.match.matchUuid;
    var mine = function () { return state.screen === "match" && state.match && state.match.matchUuid === uuid; };
    OR.matches.move({ matchUuid: uuid, version: state.match.version, move: move }).then(function (view) {
      state.sending = false;
      if (!isCurrent(view)) return;
      state.pending = [];
      state.invalidWords = {};
      state.selectedRack = null;
      state.announcedPly = view.lastMove ? view.lastMove.ply : state.announcedPly;
      haptic("success");
      if (okText) toast(okText);
      applyView(view, false);
      if (move.type === "place") {
        var placed = placedScore(view);
        if (placed) popScore(placed.score, placed.bingo, placed.word);
      }
    }).catch(function (err) {
      state.sending = false;
      if (!mine()) return;
      var code = errorCode(err);
      if (code === "match/version-conflict" || code === "match/not-your-turn") {
        toast("The game moved on — refreshing.", true);
        OR.matches.get({ matchUuid: uuid }).then(function (view) {
          if (isCurrent(view)) applyView(view, false);
        }).catch(function () {});
        return;
      }
      haptic("error");
      // The tiles stay where they are: a refusal is usually one word the
      // dictionary does not have, and the player wants to adjust it, not lay
      // the whole move out again.
      console.warn("[word-battle] move refused", err);
      state.invalidWords = rejectedWords(err);
      toast(errorText(err, "That move was refused — your tiles are still on the board."), true);
      syncBoard();
      renderPreview();
    });
  }

  function play() {
    if (!state.pending.length) return;
    var tiles = state.pending.map(function (t) {
      var o = { row: t.row, col: t.col, letter: t.letter };
      if (t.blank) o.blank = true;
      return o;
    });
    sendMove({ type: "place", tiles: tiles }, null);
  }

  function exchange() {
    if (!rackActive()) return;
    var go = function () {
      recall();
      pickTiles(state.rackFree, function (letters) {
        if (!letters || !letters.length) return;
        sendMove({ type: "exchange", letters: letters }, "Tiles exchanged.");
      });
    };
    if (scorelessEndsGame(state.match)) {
      confirmDialog({
        title: "End the game?",
        text: "Swapping scores nothing, and this would be the last scoreless turn in a row, so the game ends. Everyone's leftover tiles come off their score.",
        confirmLabel: "Swap and end"
      }, go);
      return;
    }
    if (state.pending.length) {
      confirmDialog({
        title: "Swap tiles?",
        text: "The " + state.pending.length + " tile" + (state.pending.length > 1 ? "s" : "")
          + " you have placed will go back to your rack first.",
        confirmLabel: "Continue"
      }, go);
      return;
    }
    go();
  }

  function pass() {
    if (!rackActive()) return;
    var ends = scorelessEndsGame(state.match);
    confirmDialog({
      title: ends ? "End the game?" : "Pass your turn?",
      text: "You score nothing this turn."
        + (state.pending.length ? " The tiles you have placed go back to your rack." : "")
        + (ends
          ? " This is the last scoreless turn in a row, so the game ends and everyone's leftover tiles come off their score."
          : " Swaps and passes both count: once everyone has gone two turns in a row without scoring, the game ends."),
      confirmLabel: ends ? "Pass and end" : "Pass"
    }, function () {
      recall();
      sendMove({ type: "pass" }, "Passed.");
    });
  }

  function resign() {
    var m = state.match;
    if (!m) return;
    var lobby = m.status === "lobby";
    var mine = lobby && !m.matchmaking && meIn(m) && meIn(m).seat === 0;
    confirmDialog({
      title: lobby ? (m.matchmaking ? "Stop looking?" : mine ? "Close this table?" : "Leave this table?") : "Resign this game?",
      text: lobby
        ? (m.matchmaking ? "You won’t be matched with anyone for this table."
          : mine ? "Nobody will be able to join it, and anyone already seated is told it was closed."
          : "The seat opens up again for someone else.")
        : "You forfeit the game and your opponents keep their scores. This cannot be undone.",
      confirmLabel: lobby ? (m.matchmaking ? "Stop looking" : mine ? "Close table" : "Leave") : "Resign",
      danger: true
    }, function () {
      OR.matches.resign({ matchUuid: m.matchUuid }).then(function (view) {
        // A 3–4 seat table plays on without this player, so leave either way.
        if (state.screen === "match" && state.match && state.match.matchUuid === view.matchUuid) {
          showScreen("list");
          loadList();
        }
      }).catch(function (err) { toast(errorText(err, "Couldn't resign."), true); });
    });
  }

  function inviteUrl(code) {
    return LANDING_URL + "?target=join&code=" + code;
  }

  function shareCode() {
    var m = state.match;
    if (!m || !m.joinCode) return;
    var url = inviteUrl(m.joinCode);
    var text = "Join my " + GAME_NAME + " table on OddsRabbit with code " + m.joinCode + " — " + url;
    OR.actions.share({ title: GAME_NAME, text: text }).catch(function () {
      // Copy the LINK, not the bare code: the fallback should hand over the
      // same thing the share sheet would have.
      copyLink(url);
    });
  }

  // The clipboard API where the host allows it (the web host's frame grants
  // clipboard-write); otherwise select the link in its field, which is what
  // a player long-presses to copy by hand, and try the legacy command.
  function copyLink(url) {
    function selected() {
      if (!els.lobbyLink.hidden) {
        els.lobbyLinkField.focus();
        els.lobbyLinkField.select();
      }
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      toast(ok ? "Invite link copied." : "Select the link and copy it.");
    }
    try {
      var done = navigator.clipboard && navigator.clipboard.writeText(url);
      if (done && done.then) {
        done.then(function () { toast("Invite link copied."); haptic("light"); }, selected);
        return;
      }
    } catch (_) {}
    selected();
  }

  function openMatchMenu() {
    var m = state.match;
    openDialog({
      title: "Match options",
      menu: true,
      confirmLabel: null,
      cancelLabel: "Close",
      build: function (body, close) {
        function item(label, danger, run) {
          var button = el("button", "menu-item" + (danger ? " is-danger" : ""), label);
          button.type = "button";
          button.addEventListener("click", function () { close(null); run(); });
          body.appendChild(button);
        }
        item("How to play", false, showHowTo);
        if (m && m.status === "active" && m.view && m.view.board) item("Tiles left", false, showTiles);
        if (movesOf(m).length) item("Moves", false, showMoves);
        if (m && m.joinCode && m.status === "lobby") item("Share invite", false, shareCode);
        if (m && (m.status === "lobby" || (m.status === "active" && !isOut(m)))) {
          item(m.status === "lobby" ? (m.matchmaking ? "Stop looking" : "Leave table") : "Resign", true, resign);
        }
        return {};
      }
    });
  }

  // ------------------------------------------------------------ pickers

  function pickLetter(done) {
    openDialog({
      title: "Blank tile — choose a letter",
      confirmLabel: null,
      build: function (body, close) {
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (letter) {
          var button = el("button", "picker-letter", letter);
          button.type = "button";
          button.addEventListener("click", function () { close(letter); });
          body.appendChild(button);
        });
        return {};
      },
      onClose: function (letter) { done(letter); }
    });
  }

  function pickTiles(letters, done) {
    openDialog({
      title: "Swap which tiles?",
      confirmLabel: "Swap",
      build: function (body) {
        var chosen = {};
        body.appendChild(el("p", "swap-hint muted small",
          "Tap the tiles to put back in the bag. You draw the same number, and your turn ends."));
        function count() {
          var n = Object.keys(chosen).filter(function (k) { return chosen[k]; }).length;
          els.dialogConfirm.textContent = n ? "Swap " + n + (n === 1 ? " tile" : " tiles") : "Swap";
          els.dialogConfirm.disabled = !n;
        }
        setTimeout(count, 0);
        letters.forEach(function (letter, index) {
          var button = el("button", "tile" + (letter === "_" ? " is-blank" : ""));
          button.type = "button";
          button.setAttribute("aria-pressed", "false");
          button.appendChild(el("span", "tile-letter", letter === "_" ? "" : letter));
          button.appendChild(el("span", "tile-value", String(Rules.VALUES[letter] || 0)));
          button.addEventListener("click", function () {
            chosen[index] = !chosen[index];
            button.classList.toggle("is-selected", chosen[index]);
            button.setAttribute("aria-pressed", chosen[index] ? "true" : "false");
            count();
          });
          body.appendChild(button);
        });
        return {
          value: function () { return letters.filter(function (_, i) { return chosen[i]; }); }
        };
      },
      onClose: function (picked) { done(picked); }
    });
  }

  // ------------------------------------------------------------- boot

  function applyTheme() {
    var dark = OR.colorScheme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (board) board.setTheme();
  }

  function handleDeepLink() {
    var initial = OR.initialState;
    if (initial && typeof initial === "object") {
      if (initial.target === "match" && typeof initial.matchUuid === "string") {
        takeJoin();
        openMatch(initial.matchUuid);
        return true;
      }
      if (initial.target === "join" && typeof initial.joinCode === "string") {
        takeJoin();
        joinByCode(initial.joinCode);
        return true;
      }
    }
    var stashed = takeJoin();
    if (stashed) { joinByCode(stashed); return true; }
    return false;
  }

  // Coming back to a list that is already drawn refreshes it quietly: a
  // "Loading…" line over rows that are already there is noise, and it pushed
  // the sheet down and back up again on every return.
  function backToList() {
    showScreen("list");
    loadList(state.rows.length > 0);
  }

  function wire() {
    els.newGameButtons.forEach(function (b) { b.addEventListener("click", openChooser); });
    els.joinOpenButtons.forEach(function (b) { b.addEventListener("click", openJoinDialog); });
    els.quickButtons.forEach(function (b) { b.addEventListener("click", quickMatch); });
    els.helpButtons.forEach(function (b) { b.addEventListener("click", showHowTo); });
    els.backButtons.forEach(function (b) {
      // Friends' setup steps back to the chooser it came from; every other
      // screen goes back to the list.
      var fromSetup = !!b.closest(".screen-new");
      b.addEventListener("click", function () {
        if (fromSetup && state.canQuick) showScreen("choose");
        else backToList();
      });
    });
    els.chooseFriends.addEventListener("click", openNewGame);
    els.chooseJoin.addEventListener("click", openJoinDialog);
    els.findingBack.addEventListener("click", backToList);
    els.findingStop.addEventListener("click", resign);
    els.lobbyBack.addEventListener("click", backToList);
    els.lobbyClose.addEventListener("click", resign);
    els.menuButton.addEventListener("click", openMatchMenu);
    wireChat();
    els.players.addEventListener("click", showPlayers);
    els.nudgeButton.addEventListener("click", nudge);
    els.claimButton.addEventListener("click", claim);
    els.players.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPlayers(); }
    });
    els.inviteInput.addEventListener("input", function () {
      state.inviteQuery = els.inviteInput.value;
      renderInvitable();
    });
    els.inviteClear.addEventListener("click", function () {
      els.inviteInput.value = "";
      state.inviteQuery = "";
      renderInvitable();
      els.inviteInput.focus();
    });
    els.inviteInput.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !els.inviteInput.value) return;
      els.inviteInput.value = "";
      state.inviteQuery = "";
      renderInvitable();
      e.stopPropagation();
    });
    // With an open seat, the table is only useful once the link is out, so
    // the share sheet opens as soon as the table exists.
    els.createButton.addEventListener("click", function () { createMatch(state.openSeats > 0); });
    els.copyLinkButton.addEventListener("click", function () {
      if (state.match && state.match.joinCode) copyLink(inviteUrl(state.match.joinCode));
    });
    els.lobbyLinkField.addEventListener("focus", function () { els.lobbyLinkField.select(); });
    els.playButton.addEventListener("click", play);
    els.recallButton.addEventListener("click", recall);
    els.shuffleButton.addEventListener("click", shuffleRack);
    els.waitShuffle.addEventListener("click", shuffleRack);
    els.exchangeButton.addEventListener("click", exchange);
    els.passButton.addEventListener("click", pass);
    els.shareCodeButton.addEventListener("click", shareCode);
    els.overBack.addEventListener("click", backToList);
    els.rematchButton.addEventListener("click", rematch);
    els.movesButton.addEventListener("click", showMoves);
    els.lastMove.addEventListener("click", function () {
      if (els.lastMove.classList.contains("is-link")) showMoves();
    });
    els.lastMove.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && els.lastMove.classList.contains("is-link")) { e.preventDefault(); showMoves(); }
    });
    els.chipBag.addEventListener("click", showTiles);
    els.signIn.addEventListener("click", function () {
      var code = peekJoin();
      OR.actions.requestSignIn(code
        ? "Sign in to take your seat at this table."
        : "Sign in to play against friends.");
    });

    els.zoomIn.addEventListener("click", function () { board && board.zoomBy(1.4); });
    els.zoomOut.addEventListener("click", function () { board && board.zoomBy(1 / 1.4); });
    els.zoomFit.addEventListener("click", function () { board && board.fit(); });
    els.boardCanvas.addEventListener("focus", function () {
      if (!board) return;
      var cursor = board.getCursor() || [7, 7];
      board.setCursor(cursor[0], cursor[1], board.getCursorDir());
      announce(cursor[0], cursor[1]);
    });
    els.boardCanvas.addEventListener("blur", function () { if (board) board.setCursor(null); });

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", function () { if (board && state.screen === "match") board.resize(true); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && state.screen === "list") loadList(true);
    });
    OR.lifecycle.on("resume", function () { if (state.screen === "list") loadList(true); });

  }

  // "landing" (the hero), "games" (band and sheet) or "none" (neither, while
  // loading or on a host that cannot play). The hero and the list never share
  // the screen.
  function setListMode(mode) {
    els.hero.hidden = mode !== "landing";
    els.listBand.hidden = mode !== "games";
    els.listSheet.hidden = mode !== "games";
    els.screens.list.classList.toggle("is-landing", mode === "landing");
    els.screens.list.classList.toggle("has-games", mode === "games");
  }

  function showHeroOnly(noteText) {
    setListMode("landing");
    if (noteText) {
      els.signInNote.textContent = noteText;
      els.signInNote.hidden = false;
    }
  }

  OR.whenReady().then(function () {
    applyTheme();
    wireDialog();
    wire();
    showScreen("list");

    if (!OR.capabilities.has("matches.get")) {
      els.unsupported.hidden = false;
      setListMode("none");
      OR.ready();
      return;
    }
    // The host declaring the verb is not enough on its own: a stale cached SDK
    // (one CDN copy served under a new version stamp) can lack the method, and
    // a button that throws is worse than no button.
    var canQuick = OR.capabilities.has("matches.quick") && typeof OR.matches.quick === "function";
    els.quickButtons.forEach(function (b) { b.hidden = !canQuick; });
    state.canQuick = canQuick;

    if (!OR.user) {
      // Hold on to an invite across the sign-in round trip, and say what the
      // player is being asked to sign in FOR.
      var initial = OR.initialState;
      if (initial && typeof initial === "object" && initial.target === "join" && typeof initial.joinCode === "string") {
        stashJoin(String(initial.joinCode).toUpperCase());
      }
      var invite = peekJoin();
      els.heroActions.hidden = true;
      showHeroOnly(invite
        ? "You’ve been invited to a table (code " + invite + "). Sign in to take your seat."
        : null);
      els.signInActions.hidden = !OR.capabilities.has("actions.requestSignIn");
      OR.ready();
      return;
    }

    startListPolling();
    var linked = handleDeepLink();
    loadList().then(function () { OR.ready(); });
    if (linked) OR.ready();
  });
})();
