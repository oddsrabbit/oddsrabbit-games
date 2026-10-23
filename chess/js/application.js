// Bootstrap and screens for Chess, slug `chess`.
//
// Three screens, the same as Word Battle's (whose match plumbing this shares
// line for line where the two games agree): the match list, the new-game
// setup, and one match. Every piece of game state on screen comes from the
// server's per-viewer MatchView (`Matches.get` / the `watch` poll); this
// file holds only the piece the player has picked up (`selected`) and the
// move they have made on the board but not yet sent (`pending`). A move goes
// to the server as `{ type: "move", from, to, promo?, offerDraw? }` and the
// server answers with the new view or a `match/*` reason, shown verbatim.
//
// The rules are ChessRules.php on the server; js/rules.js is a copy for
// legal-move dots, check and notation, and the server's word is final.
//
// Games against the computer (js/computer.js) are kept on the device and come
// back as the same MatchView, through `Matches`, which routes each verb by
// uuid. They work signed out and on hosts without the match verbs.
//
// The whole multiplayer surface is gated on `capabilities.has('matches.get')`
// after `whenReady()`: the mobile host ships these verbs behind App Store
// review, and a button that always fails is worse than no button.
//
// Usernames go through `textContent`, never `innerHTML`. The `innerHTML`
// below writes fixed strings (the how-to-play text) and the piece SVGs from
// pieces.js, with nothing from a player interpolated into either.

(function () {
  var OR = window.OddsRabbit;
  var UI = window.OddsRabbitUI;
  var Rules = window.ChessRules;
  var Pieces = window.ChessPieces;
  var Board = window.ChessBoard;
  var Computer = window.ChessComputer;
  if (!OR) {
    showFatal("This game needs to run inside the OddsRabbit app or website.");
    return;
  }

  // The rules-class id the server selects on (MatchService::rulesFor), stored
  // in `game` on every match row.
  // OR.matches with computer games mixed in (js/computer.js). Its `list`
  // asks the host only while `state.online`.
  var Matches = Computer.wrap(OR.matches || {}, function () { return state.online; });

  var GAME = "chess";
  var GAME_NAME = "Chess";
  var SLUG = (function () {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts.length && /\.html?$/.test(parts[parts.length - 1])) parts.pop();
    var last = parts[parts.length - 1];
    return last && /^[a-z0-9-]{1,64}$/.test(last) ? last : "chess";
  })();
  var LANDING_URL = "https://www.oddsrabbit.com/games/" + SLUG + "/";
  var JOIN_STASH = "rch.joinCode";
  var JOIN_STASH_MS = 24 * 3600 * 1000;
  var LIST_POLL_MS = 20000;
  var INVITABLE_PAGE = 200;
  var INVITABLE_MAX_PAGES = 20;
  var SEARCH_THRESHOLD = 8;
  var SEARCH_MIN = 2;
  var SEARCH_DELAY_MS = 250;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    screens: {
      list: $(".screen-list"),
      choose: $(".screen-choose"),
      "new": $(".screen-new"),
      cpu: $(".screen-cpu"),
      match: $(".screen-match")
    },
    listBody: $(".match-list"),
    listBand: $(".list-band"),
    listSheet: $(".list-sheet"),
    record: $(".record"),
    listStatus: $(".list-status"),
    hero: $(".hero"),
    heroBoard: $(".hero-board"),
    heroActions: $(".hero-actions"),
    newGameButtons: $$(".new-game-button"),
    joinOpenButtons: $$(".join-open-button"),
    quickButtons: $$(".quick-button"),
    chooseFriends: $(".choose-friends"),
    cpuOpenButtons: $$(".cpu-open-button"),
    cpuLevels: $(".cpu-levels"),
    cpuAvatar: $(".cpu-avatar"),
    cpuName: $(".cpu-name"),
    cpuRating: $(".cpu-rating"),
    cpuLine: $(".cpu-line"),
    cpuReroll: $(".cpu-reroll"),
    cpuColors: $$(".cpu-color"),
    cpuStart: $(".cpu-start"),
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
    chipCheck: $(".chip-check"),
    stall: $(".stall"),
    stallText: $(".stall-text"),
    nudgeButton: $(".nudge-button"),
    claimButton: $(".claim-button"),
    drawOffer: $(".draw-offer"),
    drawOfferText: $(".draw-offer-text"),
    acceptDrawButton: $(".accept-draw-button"),
    lastMove: $(".last-move"),
    recentMoves: $(".recent-moves"),
    lobbyPanel: $(".lobby-panel"),
    lobbyLead: $(".lobby-lead"),
    lobbyCode: $(".lobby-code"),
    waitingSeats: $(".waiting-seats"),
    waitingTitle: $(".waiting-title"),
    lobbyBack: $(".lobby-back"),
    lobbyClose: $(".lobby-close"),
    inviteNote: $(".invite-note"),
    challengeActions: $(".challenge-actions"),
    acceptButton: $(".accept-button"),
    declineButton: $(".decline-button"),
    shareCard: $(".lobby-panel .share-card"),
    shareCodeButton: $(".share-code-button"),
    boardWrap: $(".board-wrap"),
    boardHost: $(".board-host"),
    capturesThem: $(".captures.is-them"),
    capturesMe: $(".captures.is-me"),
    boardStatus: $(".board-status"),
    moveHint: $(".move-hint"),
    moveBar: $(".move-bar"),
    undoButton: $(".undo-button"),
    sendButton: $(".send-button"),
    offerChip: $(".offer-chip"),
    waitBar: $(".wait-bar"),
    waitText: $(".wait-text"),
    reviewBar: $(".review-bar"),
    reviewText: $(".review-text"),
    resultButton: $(".result-button"),
    over: $(".game-over"),
    rematchButton: $(".rematch-button"),
    boardButton: $(".board-button"),
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
    // The square of the piece picked up, or null.
    selected: null,
    // A move made on the board and not yet sent: { move, san, pos }, where
    // `move` is a rules.js move and `pos` the position after it.
    pending: null,
    // The result card was put away to look at the final position.
    reviewing: false,
    // A draw offer picked from the ⋯ menu, to go with the next move sent.
    offerDraw: false,
    nudged: {},
    stopWatch: null,
    invitable: [],
    inviteQuery: "",
    inviteCapped: false,
    inviteRun: 0,
    searchResults: [],
    searchFor: "",
    searchTimer: null,
    searchRun: 0,
    invitees: {},
    open: false,
    openSeats: 1,
    openAuto: true,
    seats: 2,
    creating: false,
    sending: false,
    rows: [],
    listSignature: "",
    spot: null,
    spotLoading: null,
    canQuick: false,
    celebrated: {},
    findTimer: null,
    listTimer: null,
    announcedPly: null,
    // The open match's conversation (see the chat section); null elsewhere.
    chat: null,
    // Signed in on a host with the match verbs: games with people are on.
    online: false,
    // The computer screen's choices; `bot` is the opponent rolled for `level`.
    cpu: { level: "casual", color: "random", bot: null }
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
      if (message) console.warn("[chess]", code, err);
      return (message || fallback) + " (" + code + ")";
    }
    return message || fallback;
  }

  function errorCode(err) {
    return err && typeof err.code === "string" ? err.code : "";
  }

  // No clock means nothing stops a player from vanishing mid-game. The other
  // can nudge them after a day, and after 14 days end the game and take the
  // win (ChessRules::claimWinner). The server holds the same thresholds and
  // has the last word.
  var NUDGE_AFTER_MS = 24 * 3600 * 1000;
  var CLAIM_AFTER_MS = 14 * 24 * 3600 * 1000;

  function waitedMs(view) {
    if (!view.turnStartedAt) return null;
    var ms = Date.now() - new Date(view.turnStartedAt).getTime();
    return isNaN(ms) ? null : ms;
  }

  function waitingOn(view) {
    if (view.local) return null;
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

  // A challenge waiting on this viewer: their seat is held as 'invited' until
  // they accept (matches.join) or decline (matches.resign). `mySeatStatus`
  // where the host sends it, the player row otherwise.
  function isChallenge(view) {
    if (!view || view.status !== "lobby") return false;
    if (view.mySeatStatus) return view.mySeatStatus === "invited";
    var me = meIn(view);
    return !!me && me.status === "invited";
  }

  function hostOf(view) {
    return view.players.filter(function (p) { return p.seat === 0; })[0] || null;
  }

  // Seats still to fill or to accept: an invited seat is held, not taken.
  function seatsMissing(view) {
    var joined = view.players.filter(function (p) { return p.status === "joined"; }).length;
    return Math.max(0, view.maxPlayers - joined);
  }

  function invitedOthers(view) {
    return view.players.filter(function (p) { return !p.isSelf && p.status === "invited"; });
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
    return player.isSelf ? "You" : handle(player);
  }

  // "@clover" for a person; a computer opponent's made-up name goes bare.
  function handle(player) {
    return player.bot ? player.username : "@" + player.username;
  }


  function showScreen(name) {
    state.screen = name;
    if (name !== "match") stopFinding();
    Object.keys(els.screens).forEach(function (key) { els.screens[key].hidden = key !== name; });
    if (name !== "match") { stopWatching(); stopChat(); clearPending(); }
    // The board is sized from its box, and its box is 0x0 while the screen is
    // hidden, so it is measured again once the screen is up: at once, and on
    // the next frame for hosts that defer layout.
    if (name === "match") {
      fitRecentMoves();
      markPlayerEdges();
      resizeBoard();
      requestAnimationFrame(resizeBoard);
    }
  }

  function resizeBoard() {
    if (board && state.screen === "match") board.resize();
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

  var HOW_TO_HTML = [
    '<div class="howto">',
    '<h3>The idea</h3>',
    '<p>Ordinary chess against a friend, played at your own pace: there is no clock, a move can take a minute or a few days, and you get a notification when it is your turn. Whoever moves first plays White, picked at random when the game starts.</p>',
    '<h3>Your move</h3>',
    '<ul>',
    '<li>Tap a piece, then tap where it goes. The dots show every legal square; a ring marks a capture. You can drag the piece instead.</li>',
    '<li>Nothing is sent until you press <strong>Send</strong>, so a slip of the finger costs nothing: <strong>Take back</strong> puts the piece back.</li>',
    '<li>A pawn reaching the far side asks what it should become.</li>',
    '</ul>',
    '<details><summary>The pieces</summary>',
    '<div class="legend">',
    '<span class="legend-swatch">' + Pieces.svg("K") + '</span><span><strong>King</strong> — one square any way. Keep it out of check.</span>',
    '<span class="legend-swatch">' + Pieces.svg("Q") + '</span><span><strong>Queen</strong> — any distance in a straight line or diagonal.</span>',
    '<span class="legend-swatch">' + Pieces.svg("R") + '</span><span><strong>Rook</strong> — any distance along a rank or file.</span>',
    '<span class="legend-swatch">' + Pieces.svg("B") + '</span><span><strong>Bishop</strong> — any distance along a diagonal.</span>',
    '<span class="legend-swatch">' + Pieces.svg("N") + '</span><span><strong>Knight</strong> — our rabbit. Hops in an L, two one way and one across, over anything in between.</span>',
    '<span class="legend-swatch">' + Pieces.svg("P") + '</span><span><strong>Pawn</strong> — one square forward (two from its start), and captures diagonally.</span>',
    '</div>',
    '</details>',
    '<details><summary>Special moves</summary>',
    '<ul>',
    '<li><strong>Castling</strong>: move the king two squares towards a rook and the rook jumps over it. Neither may have moved, the squares between must be empty, and the king may not be in, pass through, or land in check.</li>',
    '<li><strong>En passant</strong>: a pawn that steps two squares past an enemy pawn can be captured as if it had stepped one, but only on the very next move.</li>',
    '<li><strong>Promotion</strong>: a pawn on the last rank becomes a queen, rook, bishop or knight.</li>',
    '</ul>',
    '</details>',
    '<details><summary>How it ends</summary>',
    '<ul>',
    '<li><strong>Checkmate</strong> wins: the king is attacked and nothing can save it.</li>',
    '<li><strong>Draws</strong>: stalemate (no legal move, but not in check), the same position three times, fifty moves each with no capture or pawn move, or too few pieces left for anyone to mate. These end the game on their own.</li>',
    '<li>You can <strong>offer a draw</strong> from the ⋯ menu on your turn. It goes with your next move and stands until your opponent replies: they accept, or decline by moving.</li>',
    '<li><strong>Resign</strong> is in the ⋯ menu.</li>',
    '</ul>',
    '</details>',
    '<details><summary>Taking your time</summary>',
    '<p>Nobody is timed out. If your opponent stops moving, you can nudge them after a day, and after 14 days without a move you can end the game and take the win.</p>',
    '</details>',
    '<details><summary>Who you can play</summary>',
    '<p>In <strong>Play a friend</strong> you can challenge people you follow, or who follow you. To play anyone else, use a <strong>seat for a link</strong>: whoever opens the link you send (or types its six-character code) takes the seat.</p>',
    '<p><strong>Find an opponent</strong> pairs you with the next player who is also looking for a game.</p>',
    '<p><strong>Play the computer</strong> to practise: pick a level and you get an opponent with a rating to match. These games stay on this device, work without an account, and don’t count toward your record.</p>',
    '</details>',
    '<details class="keys"><summary>Keyboard</summary>',
    '<div class="keys"><ul>',
    '<li>Tab onto the board, move between squares with the arrow keys, and press <strong>Enter</strong> to pick up a piece or put it down.</li>',
    '<li><strong>Esc</strong> drops the piece, or takes back a move you have not sent.</li>',
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
    return Matches.list({ status: "all", limit: 100 }).then(function (rows) {
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
      { title: "Challenges", rows: rows.filter(isChallenge), challenges: true },
      { title: "Also your move", rows: mine.slice(1) },
      { title: "Their move", rows: rows.filter(function (m) { return m.status === "active" && !isOut(m) && !m.isMyTurn; }) },
      { title: "Waiting for players", rows: rows.filter(function (m) { return m.status === "lobby" && !isChallenge(m); }) },
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
        els.listBody.appendChild(group.results ? renderResult(m) : group.challenges ? renderChallenge(m) : renderRow(m));
      });
    });
    els.listBody.scrollTop = scroll;
  }


  function opponentNames(m) {
    var opponents = opponentsOf(m);
    if (opponents.length) return opponents.map(function (p) { return p.bot ? p.username + " (" + p.bot.rating + ")" : "@" + p.username; }).join(", ");
    return m.matchmaking ? "Quick match" : "Open table";
  }

  // "@clover played Nxe5+", from the row alone: the server sends each row's
  // last move, and the move in notation as its `recap`, so the list never has
  // to open a game to say what happened in it. False when there is nothing
  // to say.
  function writeRecap(target, m) {
    var lm = m.lastMove;
    if (!lm || m.status === "lobby") return false;
    var player = m.players.filter(function (p) { return p.seat === lm.seat; })[0];
    var who = player ? nameOf(player) : "Someone";
    var move = lm.move || {};
    clear(target);
    if (move.type === "move") {
      var san = m.recap && typeof m.recap.san === "string" ? m.recap.san : "";
      target.appendChild(document.createTextNode(who + " played "));
      target.appendChild(el("span", "san", san || move.from + "–" + move.to));
      if (move.offerDraw) target.appendChild(document.createTextNode(" and offered a draw"));
      return true;
    }
    if (move.type === "acceptDraw") { target.textContent = who + " accepted a draw"; return true; }
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
    text.appendChild(el("span", "match-names", names));
    var detail = el("span", "match-detail");
    var status = "";
    if (m.status === "lobby" && m.matchmaking) {
      detail.textContent = "Looking for an opponent…";
      status = "We’ll let you know when someone sits down";
    } else if (m.status === "lobby") {
      var asked = invitedOthers(m);
      detail.textContent = asked.length
        ? "Waiting for " + asked.map(function (p) { return "@" + p.username; }).join(", ") + " to accept"
        : "Open it to share the link";
    } else {
      // A quiet opponent is the more useful thing to say; otherwise what
      // just happened in the game.
      var other = waitingOn(m);
      var waited = other ? waitedMs(m) : null;
      if (waited !== null && waited >= NUDGE_AFTER_MS) detail.textContent = "Waiting on @" + other.username + " for " + daysText(waited);
      else if (!writeRecap(detail, m)) detail.textContent = m.isMyTurn ? "You start" : "They start";
    }
    text.appendChild(detail);
    if (status) text.appendChild(el("span", "match-status", status));
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

  // A challenge row: who asked, and the two answers right on the row.
  function renderChallenge(m) {
    var host = hostOf(m);
    var row = el("div", "match-row is-challenge");
    var open = el("button", "match-open");
    open.type = "button";
    open.appendChild(faces(m));
    var text = el("span", "match-text");
    var nameLine = el("span", "match-names", (host ? "@" + host.username : "Someone") + " challenged you");
    text.appendChild(nameLine);
    text.appendChild(el("span", "match-detail", "A game of chess"));
    open.appendChild(text);
    var side = el("span", "match-side");
    var when = ago(m.updatedAt);
    if (when) side.appendChild(el("span", "match-when", when));
    open.appendChild(side);
    open.setAttribute("aria-label", nameLine.textContent + (when ? ". " + ago(m.updatedAt, true) : ""));
    open.addEventListener("click", function () { openFromList(open, m.matchUuid); });
    row.appendChild(open);

    var actions = el("span", "row-actions");
    var accept = el("button", "row-accept primary", "Accept");
    accept.type = "button";
    accept.addEventListener("click", function () { acceptChallenge(m, accept); });
    var decline = el("button", "row-decline subtle", "Decline");
    decline.type = "button";
    decline.addEventListener("click", function () { declineChallenge(m); });
    actions.appendChild(accept);
    actions.appendChild(decline);
    row.appendChild(actions);
    return row;
  }

  function acceptChallenge(m, button) {
    if (button) button.disabled = true;
    Matches.join({ matchUuid: m.matchUuid }).then(function (view) {
      haptic("success");
      if (view.status === "active") toast("Game on — " + (view.isMyTurn ? "you play White!" : "they play White."));
      enterMatch(view);
    }).catch(function (err) {
      if (button) button.disabled = false;
      toast(errorText(err, "Couldn't accept the challenge."), true);
      loadList(true);
    });
  }

  function declineChallenge(m) {
    var host = hostOf(m);
    confirmDialog({
      title: "Decline this challenge?",
      text: (host ? "@" + host.username : "They") + " won’t get a notification; the game just closes. To stop challenges from people you don’t follow, turn on “Only People I Follow Can Challenge Me” in your OddsRabbit settings.",
      confirmLabel: "Decline"
    }, function () {
      Matches.resign({ matchUuid: m.matchUuid }).then(function () {
        if (state.screen === "match") showScreen("list");
        loadList();
      }).catch(function (err) { toast(errorText(err, "Couldn't decline."), true); });
    });
  }

  // Finished games are history, not things to do: one thin line each.
  function renderResult(m) {
    var row = el("button", "result-row");
    row.type = "button";
    var me = meIn(m);
    var label, cls;
    if (m.status === "abandoned") { label = "Closed"; cls = "is-even"; }
    else if (m.winnerSeat === null) { label = "Draw"; cls = "is-even"; }
    else if (me && m.winnerSeat === me.seat) { label = "Won"; cls = "is-up"; }
    else if (me && me.status === "resigned") { label = "Resigned"; cls = "is-down"; }
    else { label = "Lost"; cls = "is-down"; }
    row.appendChild(el("span", "result-label " + cls, label));
    row.appendChild(el("span", "result-names", opponentNames(m)));
    var san = m.status === "finished" && m.recap && typeof m.recap.san === "string" ? m.recap.san : "";
    row.appendChild(el("span", "result-score", /#$/.test(san) ? san : ""));
    row.appendChild(el("span", "result-when", ago(m.updatedAt)));
    row.setAttribute("aria-label", label + " against " + opponentNames(m) + ". " + ago(m.updatedAt, true) + ".");
    row.addEventListener("click", function () { openFromList(row, m.matchUuid); });
    return row;
  }

  // Wins and losses over the finished games the list holds (the last 100).
  function renderRecord(rows) {
    var won = 0, lost = 0, drawn = 0;
    rows.forEach(function (m) {
      var me = meIn(m);
      if (!me || m.status !== "finished" || m.local) return;
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
    titles.appendChild(el("span", "spot-name", "vs " + opponentNames(m)));
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
      var body = el("div", "spot-body");
      body.appendChild(Board.preview(spot.view.board, myColor(spot) || "w", lastSquares(spot)));
      var facts = el("div", "spot-facts");
      if (writeLastMove(last, spot)) facts.appendChild(last);
      facts.appendChild(el("p", "spot-meta", sideLine(spot)));
      body.appendChild(facts);
      card.appendChild(body);
    } else {
      if (!state.spot || state.spot.uuid !== m.matchUuid || !state.spot.failed) {
        card.appendChild(el("div", "spot-body is-loading"));
      }
      if (writeRecap(last, m)) card.appendChild(last);
    }

    var play = el("button", "primary spot-play", "Play your move");
    play.type = "button";
    play.addEventListener("click", function () { openFromList(play, m.matchUuid); });
    card.appendChild(play);
    return card;
  }

  // "You play Black · move 14 · +2", for the spotlight.
  function sideLine(view) {
    var color = myColor(view);
    var v = view.view || {};
    var parts = [];
    if (color) parts.push("You play " + (color === "w" ? "White" : "Black"));
    if (typeof v.fullmove === "number") parts.push("move " + v.fullmove);
    if (color && v.board) {
      var bal = Rules.captured(v.board).balance * (color === "w" ? 1 : -1);
      if (bal) parts.push(bal > 0 ? "you’re up " + bal : "you’re down " + (-bal));
    }
    return parts.join(" · ");
  }

  function loadSpotlight(m) {
    var have = state.spot && state.spot.uuid === m.matchUuid && state.spot.version >= m.version;
    var key = m.matchUuid + "@" + m.version;
    if (have || state.spotLoading === key) return;
    state.spotLoading = key;
    Matches.get({ matchUuid: m.matchUuid }).then(function (view) {
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

  // New game: the chooser. The computer is always on it; Find an opponent
  // when the host can quick-match.
  function openChooser() {
    els.chooseJoin.hidden = !state.online;
    showScreen("choose");
  }

  // Play a friend needs an account; a guest who picks it is asked to sign in.
  function chooseFriends() {
    if (state.online) { openNewGame(); return; }
    if (!OR.user && OR.capabilities.has("actions.requestSignIn")) {
      OR.actions.requestSignIn("Sign in to play against friends.");
      return;
    }
    toast("Playing against friends isn’t available on this version of the app yet.", true);
  }

  // ------------------------------------------------------------ computer

  var CPU_PREFS = "chess.cpu.prefs";

  function openComputer() {
    Computer.warm();
    try {
      var saved = JSON.parse(localStorage.getItem(CPU_PREFS) || "null");
      if (saved && Computer.LEVELS.some(function (l) { return l.id === saved.level; })) state.cpu.level = saved.level;
      if (saved && /^(w|b|random)$/.test(saved.color)) state.cpu.color = saved.color;
    } catch (_) {}
    if (!state.cpu.bot || state.cpu.bot.level !== state.cpu.level) state.cpu.bot = Computer.roll(state.cpu.level);
    renderComputer();
    showScreen("cpu");
  }

  function saveCpuPrefs() {
    try { localStorage.setItem(CPU_PREFS, JSON.stringify({ level: state.cpu.level, color: state.cpu.color })); } catch (_) {}
  }

  function renderComputer() {
    var c = state.cpu;
    clear(els.cpuLevels);
    Computer.LEVELS.forEach(function (level) {
      var on = level.id === c.level;
      var b = el("button", "cpu-level" + (on ? " is-on" : ""));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(on));
      var head = el("span", "cpu-level-head");
      head.appendChild(el("strong", "", level.name));
      head.appendChild(el("span", "cpu-level-range", level.min + "–" + level.max));
      b.appendChild(head);
      b.appendChild(el("span", "cpu-level-blurb", level.blurb));
      b.addEventListener("click", function () {
        if (c.level === level.id) return;
        c.level = level.id;
        c.bot = Computer.roll(level.id);
        saveCpuPrefs();
        haptic("light");
        renderComputer();
      });
      els.cpuLevels.appendChild(b);
    });
    clear(els.cpuAvatar);
    els.cpuAvatar.appendChild(avatar(c.bot.name, null));
    els.cpuName.textContent = c.bot.name;
    els.cpuRating.textContent = "Rated " + c.bot.rating + " · " + Computer.levelById(c.bot.level).name;
    els.cpuLine.textContent = c.bot.line;
    els.cpuColors.forEach(function (b) {
      var on = b.getAttribute("data-color") === c.color;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
    });
    els.cpuStart.textContent = "Play " + c.bot.name.split(" ")[0];
  }

  function rerollComputer() {
    state.cpu.bot = Computer.roll(state.cpu.level, state.cpu.bot && state.cpu.bot.name);
    haptic("light");
    renderComputer();
  }

  function startComputer() {
    if (state.creating) return;
    state.creating = true;
    Computer.create(state.cpu.bot, state.cpu.color).then(function (view) {
      state.creating = false;
      // A fresh face for next time.
      state.cpu.bot = Computer.roll(state.cpu.level, state.cpu.bot.name);
      haptic("success");
      enterMatch(view);
      if (!view.isMyTurn) toast("You play Black. " + opponentsOf(view)[0].username + " moves first.");
    }).catch(function (err) {
      state.creating = false;
      toast(errorText(err, "Couldn't start the game."), true);
    });
  }

  function openNewGame() {
    state.invitees = {};
    state.open = false; // derived in renderSeats from the seats left spare
    // A new game starts as you plus a seat for a link — the one thing that
    // works for anyone — until someone is picked, who takes its place.
    state.openSeats = 1;
    state.openAuto = true;
    state.seats = 2;
    state.inviteQuery = "";
    state.inviteCapped = false;
    els.inviteInput.value = "";
    els.inviteSearch.hidden = !canSearch();
    resetSearch();
    els.inviteNote.textContent = canSearch()
      ? "Search for anyone on OddsRabbit. They get a challenge to accept or decline."
      : "People you follow, or who follow you. For anyone else, use a seat for a link.";
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
      return Matches.invitable({ limit: INVITABLE_PAGE, offset: offset }).then(function (rows) {
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

  function canSearch() {
    return OR.capabilities.has("matches.searchPlayers");
  }

  function resetSearch() {
    if (state.searchTimer) { clearTimeout(state.searchTimer); state.searchTimer = null; }
    state.searchRun++;
    state.searchResults = [];
    state.searchFor = "";
  }

  // Ask the server for everyone matching, a beat after typing stops. The
  // follow list is filtered locally in the meantime, so names you know show
  // at once and the rest of the platform fills in under them.
  function searchSoon() {
    if (!canSearch()) return;
    var query = state.inviteQuery.trim();
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = null;
    if (query.length < SEARCH_MIN) {
      state.searchRun++;
      state.searchResults = [];
      state.searchFor = "";
      return;
    }
    state.searchTimer = setTimeout(function () {
      state.searchTimer = null;
      var run = ++state.searchRun;
      Matches.searchPlayers({ query: query, limit: 20 }).then(function (rows) {
        if (run !== state.searchRun) return;
        state.searchResults = rows;
        state.searchFor = query;
        renderInvitable();
      }).catch(function () {
        if (run !== state.searchRun) return;
        state.searchResults = [];
        state.searchFor = query;
        renderInvitable();
      });
    }, SEARCH_DELAY_MS);
  }

  // `relation` is the viewer's side of the follow edge. Only two of the three
  // are worth a badge: that someone follows you is the non-obvious half.
  // ('none' only comes from search: someone you have no follow with.)
  var RELATION_LABEL = { mutual: "mutual", follower: "follows you", none: "not following" };

  // Mutuals first, then people who follow you, then people you follow;
  // alphabetical inside each. The server treats all three the same — this is
  // only about which name a player is most likely to be hunting for.
  var RELATION_RANK = { mutual: 0, follower: 1, following: 2, none: 3 };
  function byRelationThenName(a, b) {
    var ra = RELATION_RANK[a.relation], rb = RELATION_RANK[b.relation];
    if (ra !== rb) return (ra === undefined ? 9 : ra) - (rb === undefined ? 9 : rb);
    return a.username.toLowerCase() < b.username.toLowerCase() ? -1 : 1;
  }


  // Chess is for two, so picking someone replaces whoever was picked before
  // (and the open seat): the list works like radio buttons that can also be
  // cleared.
  function inviteRow(person) {
    var label = el("label", "invitable-row");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!state.invitees[person.uuid];
    box.addEventListener("change", function () {
      if (box.checked) {
        state.invitees = {};
        state.invitees[person.uuid] = person;
        state.openSeats = 0;
        state.openAuto = false;
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
    var searching = canSearch();
    els.inviteSearch.hidden = !searching && total <= SEARCH_THRESHOLD;

    var ordered = state.invitable.slice().sort(byRelationThenName);
    var matches = function (p) { return !query || p.username.toLowerCase().indexOf(query) !== -1; };
    // Anyone already picked stays on screen whatever is typed, so a selection
    // cannot quietly scroll out of the list mid-search. Read from the picks
    // themselves: someone found by search is not in the follow list.
    var picked = Object.keys(state.invitees).map(function (uuid) { return state.invitees[uuid]; }).sort(byRelationThenName);
    var rest = ordered.filter(function (p) { return !state.invitees[p.uuid] && matches(p); });
    // Everyone else the server found for this query, minus anyone already
    // listed above. Only while the results are for what is typed now.
    var known = {};
    ordered.forEach(function (p) { known[p.uuid] = true; });
    var found = searching && query.length >= SEARCH_MIN && state.searchFor.toLowerCase() === query
      ? state.searchResults.filter(function (p) { return !known[p.uuid] && !state.invitees[p.uuid]; })
      : [];
    var pending = searching && query.length >= SEARCH_MIN && state.searchFor.toLowerCase() !== query;
    // Counted over everyone, not just the unpicked: someone you already
    // invited still matches what you typed, and saying "0 match" with their
    // row on screen reads as a bug.
    var matchCount = ordered.filter(matches).length;

    if (picked.length && query) els.invitableList.appendChild(el("div", "invite-group", "Invited"));
    picked.forEach(function (p) { els.invitableList.appendChild(inviteRow(p)); });
    if (picked.length && query && rest.length) els.invitableList.appendChild(el("div", "invite-group", "Results"));
    rest.forEach(function (p) { els.invitableList.appendChild(inviteRow(p)); });
    if (found.length) {
      els.invitableList.appendChild(el("div", "invite-group", "Everyone else"));
      found.forEach(function (p) { els.invitableList.appendChild(inviteRow(p)); });
    }

    els.inviteClear.hidden = !els.inviteInput.value;

    // `total` is however many rows came back, and when that equals the limit we
    // asked for, it is a truncation rather than a count — so it must not be
    // read out as "of 200 people". Search only covers what was fetched, and
    // saying so is the difference between "they are not on here" and "they are
    // not in the part of the list I can see". (With server search, a name
    // past the fetched part still turns up under "Everyone else".)
    var capped = state.inviteCapped;
    els.inviteCount.textContent = searching && query
      ? (pending ? "Searching…" : "")
      : !total ? ""
      : query
        ? (matchCount === 0 ? "" // the empty-state line below says this better
          : matchCount + " of " + (capped ? "the first " + total : String(total))
            + " match “" + state.inviteQuery.trim() + "”")
      : capped
        ? "Showing " + total + " — search to narrow it down"
        : total + " " + (total === 1 ? "person" : "people") + " you follow or who follow you";

    // The rule itself lives in the note above the list, which is always on
    // screen; this only has to cover the empty cases.
    var nothing = !picked.length && !rest.length && !found.length && !pending;
    els.invitableEmpty.hidden = !nothing;
    if (nothing) {
      els.invitableEmpty.textContent = searching
        ? (query.length >= SEARCH_MIN
          ? "Nobody by that name is taking challenges. Check the spelling, or add a seat for a link."
          : !total
            ? "Search for anyone by username, or add a seat for a link and send it to anyone."
            : "Keep typing to search everyone on OddsRabbit.")
        : !total
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

  // The two seats, drawn as chips: you, and either the friend picked (tap ✕
  // to drop them), a seat for a link, or "+ Seat for a link" while the
  // second seat is empty. The open seat is what mints a join code.
  function renderSeats() {
    var invitees = Object.keys(state.invitees).map(function (uuid) { return state.invitees[uuid]; });
    var total = 1 + invitees.length + state.openSeats;
    state.seats = 2;
    state.open = state.openSeats > 0;

    clear(els.tableSeats);
    var you = el("span", "table-seat is-you");
    you.setAttribute("role", "listitem");
    you.appendChild(avatar(OR.user ? OR.user.username : "you", OR.user ? OR.user.avatar : null));
    you.appendChild(el("span", "", "You"));
    els.tableSeats.appendChild(you);
    els.tableSeats.appendChild(el("span", "table-vs", "vs"));
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
    if (state.openSeats > 0) {
      var open = el("span", "table-seat is-open");
      open.setAttribute("role", "listitem");
      open.appendChild(linkIcon());
      open.appendChild(el("span", "", "Seat for a link"));
      var remove = el("button", "seat-remove", "✕");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove the open seat");
      remove.addEventListener("click", function () {
        state.openSeats = 0;
        state.openAuto = false;
        renderSeats();
      });
      open.appendChild(remove);
      els.tableSeats.appendChild(open);
    }
    if (total < 2) {
      var add = el("button", "table-seat is-add", "+ Seat for a link");
      add.type = "button";
      add.addEventListener("click", function () {
        state.openSeats = 1;
        state.openAuto = false;
        renderSeats();
      });
      els.tableSeats.appendChild(add);
    }

    els.tableNote.textContent = total < 2
      ? "Pick someone below, or add a seat for a link."
      : state.openSeats > 0
        ? "You’ll get a link to send. Whoever opens it signs in, then takes the seat, and the game starts."
        : "They get a challenge to accept or decline. The game starts when they accept.";
    els.createStatus.textContent = "";
    els.createButton.disabled = total < 2;
    els.createButton.textContent = total < 2 ? "Pick an opponent"
      : state.openSeats > 0 ? "Create game & get link" : "Send challenge";
  }

  function createMatch(share) {
    if (state.creating) return;
    state.creating = true;
    els.createButton.disabled = true;
    els.createStatus.textContent = "Setting up the board…";
    Matches.create({
      game: GAME,
      maxPlayers: 2,
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
  // whole share message ("Play me at chess … code ABC123: https://…").
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
    Matches.quick({ game: GAME }).then(function (view) {
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
    Matches.join({ joinCode: code }).then(function (view) {
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
    return Matches.get({ matchUuid: uuid }).then(enterMatch).catch(function (err) {
      toast(errorText(err, "Couldn't open that game."), true);
    });
  }

  function enterMatch(view) {
    state.match = null;
    state.selected = null;
    state.pending = null;
    state.reviewing = false;
    state.offerDraw = false;
    state.announcedPly = view.lastMove ? view.lastMove.ply : null;
    applyView(view);
    showScreen("match");
    startWatching(view.matchUuid);
    startChat(view);
  }

  function startWatching(uuid) {
    stopWatching();
    state.stopWatch = Matches.watch(uuid, function (view) {
      // A poll sent before the player's own move can land after its reply.
      if (!isCurrent(view) || view.version === state.match.version) return;
      var wasMyTurn = state.match && state.match.isMyTurn;
      var wasFinding = state.match && state.match.status === "lobby" && state.match.matchmaking;
      // The computer answers a draw offer by moving: say so, as a person
      // declining would be seen to.
      var declined = view.local && view.status === "active" && state.match.view && state.match.view.drawOffer === 0
        && view.view && view.view.drawOffer === null;
      var fresh = view.lastMove && view.lastMove.ply !== state.announcedPly;
      applyView(view, fresh ? slideOf(view) : null);
      if (wasFinding && view.status === "active") {
        var them = opponentsOf(view)[0];
        haptic("success");
        toast("Matched with " + (them ? "@" + them.username : "a new player") + " — " + (view.isMyTurn ? "you play White!" : "they play White."));
      }
      announceMove(view);
      if (declined) {
        var bot = opponentsOf(view)[0];
        toast((bot ? bot.username : "The computer") + " declined your draw offer.");
      }
      if (!wasMyTurn && view.isMyTurn) haptic("light");
    }, { onError: function () {} });
  }

  function stopWatching() {
    if (state.stopWatch) { state.stopWatch(); state.stopWatch = null; }
  }

  // ------------------------------------------------------------ the position

  // Which side this viewer plays: "w", "b", or null in a lobby. White is
  // whoever moves first, so until a move is made it is the seat on turn.
  function whiteSeat(view) {
    var v = view && view.view || {};
    if (typeof v.white === "number") return v.white;
    return view && view.status === "active" && typeof view.turnSeat === "number" ? view.turnSeat : null;
  }

  function colorOfSeat(view, seat) {
    var white = whiteSeat(view);
    if (white === null) return null;
    return seat === white ? "w" : "b";
  }

  function myColor(view) {
    var me = view && meIn(view);
    return me ? colorOfSeat(view, me.seat) : null;
  }

  function colorName(c) { return c === "w" ? "White" : "Black"; }

  function posOf(view) {
    var v = view.view || {};
    return { board: v.board || Rules.START, turn: v.turn || "w", castling: v.castling == null ? "KQkq" : v.castling, ep: v.ep || null };
  }

  // The live position this player can move in, or null when it is not theirs
  // to move (their turn, the game on, not mid-send).
  function livePos() {
    var m = state.match;
    if (!m || m.status !== "active" || !m.isMyTurn || isOut(m) || state.sending || !m.view || !m.view.board) return null;
    return posOf(m);
  }

  function lastSquares(view) {
    var last = view.view && view.view.last;
    if (!last) return null;
    var from = Rules.squareIndex(last.from), to = Rules.squareIndex(last.to);
    return from === null || to === null ? null : { from: from, to: to };
  }

  // The slide for the last move: the piece, and the rook too for a castle.
  function slideOf(view) {
    var sq = lastSquares(view);
    if (!sq) return null;
    var san = view.view.last.san || "";
    if (/^O-O/.test(san)) {
      var rank = Math.floor(sq.from / 8) * 8;
      sq.rook = san.indexOf("O-O-O") === 0 ? { from: rank, to: rank + 3 } : { from: rank + 7, to: rank + 5 };
    }
    return sq;
  }

  function kingSquare(board, color) {
    var i = board.indexOf(color === "w" ? "K" : "k");
    return i === -1 ? null : i;
  }

  // Take a fresh server view. A pending move survives only if it was made in
  // the same position, which a new version means it was not.
  function applyView(view, slide) {
    var same = state.match && state.match.matchUuid === view.matchUuid;
    var wasActive = same && state.match.status === "active";
    if (!same || view.version !== state.match.version) {
      if (state.pending && (!same || view.version !== state.match.version)) state.pending = null;
      if (!same || !view.isMyTurn) state.selected = null;
    }
    if (!same) state.reviewing = false;
    state.match = view;

    els.screens.match.classList.toggle("is-lobby", view.status === "lobby");
    els.screens.match.classList.toggle("is-over", view.status === "finished" || view.status === "abandoned");

    renderPlayers(view);
    if (state.chat && state.chat.uuid === view.matchUuid) {
      var hadChat = !els.chatButton.hidden;
      renderChatButton();
      if (!hadChat && !els.chatButton.hidden) scheduleChat(0);
    }
    renderTurnStrip(view);
    renderDrawOffer(view);
    renderLastMove(view);
    renderLobby(view);
    renderBoard(slide || null);
    renderControls();
    renderOver(view, wasActive && view.status === "finished");
    fitRecentMoves();
    resizeBoard();
  }

  function renderBoard(slide) {
    var m = state.match;
    if (!m) return;
    if (!board) {
      board = new Board(els.boardHost, {
        onSquareTap: onSquareTap,
        onDrop: onDrop,
        canDrag: canDrag,
        before: els.capturesMe,
        // The two capture rows and the gaps beside the board.
        reserve: 2 * (24 + 6)
      });
    }
    board.setOrientation(myColor(m) || "w");
    renderCaptures(m, state.pending ? state.pending.pos.board : posOf(m).board);
    if (state.pending) {
      var p = state.pending;
      board.setPosition(p.pos.board, {
        last: { from: p.move.from, to: p.move.to },
        check: Rules.inCheck(p.pos.board, p.pos.turn) ? kingSquare(p.pos.board, p.pos.turn) : null
      }, slide);
      return;
    }
    var v = m.view || {};
    var pos = posOf(m);
    var live = livePos();
    var targets = [];
    if (live && state.selected !== null) {
      targets = Rules.legalMoves(live).filter(function (mv) { return mv.from === state.selected; })
        .map(function (mv) { return mv.to; });
    }
    // The king in check, or the one that was mated.
    var checked = (m.status === "active" && (v.check || Rules.inCheck(pos.board, pos.turn)))
      || (!!v.result && v.result.type === "checkmate");
    board.setPosition(pos.board, {
      last: lastSquares(m),
      check: checked ? kingSquare(pos.board, pos.turn) : null,
      selected: live ? state.selected : null,
      targets: targets
    }, slide);
  }

  // The pieces each side has taken, smallest first like a captures tray, and
  // the material lead on the side that has it.
  function renderCaptures(view, boardString) {
    var mine = myColor(view) || "w";
    var theirs = mine === "w" ? "b" : "w";
    var c = Rules.captured(boardString);
    var lead = c.balance * (mine === "w" ? 1 : -1);
    [[els.capturesMe, theirs, lead], [els.capturesThem, mine, -lead]].forEach(function (row) {
      var node = row[0], lostColor = row[1], ahead = row[2];
      clear(node);
      if (view.status === "lobby") return;
      var prev = null;
      c.lost[lostColor].slice().reverse().forEach(function (kind) {
        var cap = el("span", "cap" + (kind === prev ? " is-same" : ""));
        cap.innerHTML = Pieces.svg(lostColor === "w" ? kind.toUpperCase() : kind);
        node.appendChild(cap);
        prev = kind;
      });
      if (ahead > 0) node.appendChild(el("span", "cap-lead", "+" + ahead));
    });
  }

  // ------------------------------------------------------------ moving

  function ownPiece(pos, sq) {
    return Rules.colorOf(pos.board[sq]) === pos.turn;
  }

  function canDrag(sq) {
    var pos = livePos();
    return !!pos && !state.pending && ownPiece(pos, sq);
  }

  function onSquareTap(sq) {
    if (state.pending) { clearPending(); haptic("light"); renderBoard(null); renderControls(); return; }
    var pos = livePos();
    if (!pos) return;
    if (state.selected !== null && state.selected !== sq) {
      var moves = Rules.legalMoves(pos).filter(function (mv) { return mv.from === state.selected && mv.to === sq; });
      if (moves.length) { makeMove(pos, moves, true); return; }
    }
    if (ownPiece(pos, sq) && state.selected !== sq) {
      state.selected = sq;
      haptic("light");
    } else {
      state.selected = null;
    }
    renderBoard(null);
    renderControls();
  }

  function onDrop(from, to) {
    var pos = livePos();
    if (!pos) { renderBoard(null); return; }
    var moves = Rules.legalMoves(pos).filter(function (mv) { return mv.from === from && mv.to === to; });
    if (!moves.length) {
      // Dropped somewhere it cannot go: back home, still in hand.
      state.selected = from;
      haptic("error");
      renderBoard(null);
      renderControls();
      return;
    }
    makeMove(pos, moves, false);
  }

  // Put the move on the board, waiting for Send. Four candidates means a
  // promotion: ask which piece first.
  function makeMove(pos, moves, slide) {
    function place(mv) {
      var legal = Rules.legalMoves(pos);
      state.pending = { move: mv, san: Rules.san(pos, mv, legal), pos: Rules.play(pos, mv) };
      state.selected = null;
      haptic("light");
      var rook = mv.flag === "castleK" ? { from: mv.from + 3, to: mv.from + 1 }
        : mv.flag === "castleQ" ? { from: mv.from - 4, to: mv.from - 1 } : null;
      renderBoard(slide || rook ? { from: slide ? mv.from : mv.to, to: mv.to, rook: rook } : null);
      renderControls();
      els.sendButton.focus({ preventScroll: true });
    }
    if (moves.length > 1) {
      pickPromotion(pos.turn, function (promo) {
        var chosen = moves.filter(function (mv) { return mv.promo === promo; })[0];
        if (chosen) place(chosen);
        else { state.selected = null; renderBoard(null); renderControls(); }
      });
      return;
    }
    place(moves[0]);
  }

  function clearPending() {
    state.pending = null;
    state.selected = null;
  }

  function undoPending() {
    if (!state.pending) return;
    var from = state.pending.move.from;
    clearPending();
    state.selected = from;
    renderBoard(null);
    renderControls();
  }

  function sendPending() {
    var p = state.pending;
    if (!p) return;
    var move = { type: "move", from: Rules.squareName(p.move.from), to: Rules.squareName(p.move.to) };
    if (p.move.promo) move.promo = p.move.promo;
    var offering = state.offerDraw && canOfferDraw(state.match);
    if (offering) move.offerDraw = true;
    sendMove(move, offering ? "Move sent, with a draw offer." : null);
  }

  // What the bottom of the screen says and offers: a hint while it is your
  // move, Send / Take back once a move is on the board, a line about the other
  // player while it is theirs, and the result while looking at a finished one.
  function renderControls() {
    var m = state.match;
    var live = !!livePos() || (state.sending && m && m.isMyTurn);
    var p = state.pending;
    var waiting = !!m && m.status === "active" && !m.isMyTurn && !!meIn(m) && !isOut(m);
    var over = !!m && (m.status === "finished" || m.status === "abandoned");

    els.moveBar.hidden = !p;
    els.moveHint.hidden = !live || !!p;
    var offering = state.offerDraw && canOfferDraw(m);
    els.moveHint.textContent = (state.selected !== null
      ? "Tap a dot to move there, or another piece."
      : "Tap a piece to see where it can go.")
      + (offering ? " Your draw offer goes with it." : "");
    if (p) {
      els.offerChip.hidden = !offering;
      els.offerChip.disabled = state.sending;
      els.sendButton.textContent = state.sending ? "Sending…" : "Send " + p.san;
      els.sendButton.disabled = state.sending;
      els.undoButton.disabled = state.sending;
    }

    els.screens.match.classList.toggle("is-waiting", waiting);
    els.waitBar.hidden = !waiting;
    if (waiting) {
      var onTurn = m.players.filter(function (pl) { return pl.seat === m.turnSeat; })[0];
      var offered = m.view && m.view.drawOffer === (meIn(m) || {}).seat;
      if (m.local) {
        els.waitText.textContent = (onTurn ? onTurn.username : "The computer") + " is thinking…"
          + (offered ? " Your draw offer is with them." : "");
      } else {
        els.waitText.textContent = (onTurn ? "@" + onTurn.username + "’s move" : "Their move")
          + (offered ? " — your draw offer is with them." : " — we’ll let you know when they play.");
      }
    }

    els.reviewBar.hidden = !(over && state.reviewing);
    if (over && state.reviewing) els.reviewText.textContent = resultLine(m);
  }

  // ------------------------------------------------------------ players

  // "White · +2": the side, and the material lead when there is one.
  function playerDetail(view, p) {
    if (p.status === "invited") return "invited";
    var color = colorOfSeat(view, p.seat);
    var sub = color ? colorName(color) : "";
    if (p.bot) sub = (sub ? sub + " · " : "") + p.bot.rating;
    var v = view.view || {};
    if (color && v.board && view.status !== "lobby") {
      var bal = Rules.captured(v.board).balance * (color === "w" ? 1 : -1);
      if (bal > 0) sub += " · +" + bal;
    }
    if (p.status === "resigned") sub += " · resigned";
    return sub;
  }

  function renderPlayers(view) {
    clear(els.players);
    var onTurn = null;
    view.players.forEach(function (p) {
      var color = colorOfSeat(view, p.seat);
      var card = el("div", "player" + (view.turnSeat === p.seat && view.status === "active" ? " is-turn" : "") + (p.isSelf ? " is-self" : ""));
      card.appendChild(avatar(p.username, p.avatar));
      var col = el("div", "player-text");
      var name = el("div", "player-name", nameOf(p));
      if (color) {
        var dot = el("span", "side-dot is-" + color);
        dot.setAttribute("aria-hidden", "true");
        name.insertBefore(dot, name.firstChild);
      }
      col.appendChild(name);
      var detail = playerDetail(view, p);
      if (detail) col.appendChild(el("div", "player-score", detail));
      card.appendChild(col);
      els.players.appendChild(card);
      if (view.turnSeat === p.seat) onTurn = card;
    });
    markPlayerEdges();
  }

  function markPlayerEdges() {
    var s = els.players;
    s.classList.toggle("more-left", s.scrollLeft > 1);
    s.classList.toggle("more-right", s.scrollLeft + s.clientWidth < s.scrollWidth - 1);
  }

  function renderTurnStrip(view) {
    var main = "";
    var mine = false;
    var v = view.view || {};
    if (view.status === "lobby") {
      main = view.matchmaking ? "Finding an opponent" : "Waiting for players";
    } else if (view.status === "active") {
      mine = !!view.isMyTurn;
      var onTurn = view.players.filter(function (p) { return p.seat === view.turnSeat; })[0];
      main = mine ? "Your move" : (onTurn ? handle(onTurn) + "’s move" : "");
    } else if (view.status === "finished") {
      main = "Final";
    } else if (view.status === "abandoned") {
      main = "Table closed";
    }
    els.turnMain.textContent = main;
    els.turnMain.classList.toggle("is-mine", mine);
    els.chipCheck.hidden = !(view.status === "active" && v.check);
    els.chipCheck.textContent = mine ? "You’re in check" : "Check";
    renderStall(view);
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
    els.claimButton.textContent = "Claim the win";
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
    Matches.nudge({ matchUuid: uuid }).then(function () {
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
    confirmDialog({
      title: "End this game?",
      text: "@" + other.username + " hasn't moved in " + daysText(waitedMs(m)) + ". The game ends now and you win.",
      confirmLabel: "Claim the win"
    }, function () {
      var uuid = m.matchUuid;
      Matches.claim({ matchUuid: uuid }).then(function (view) {
        if (isCurrent(view)) applyView(view);
      }).catch(function (err) { toast(errorText(err, "Couldn't end the game."), true); });
    });
  }

  // The other player's draw offer, while it is this player's move to answer.
  function renderDrawOffer(view) {
    var v = view.view || {};
    var me = meIn(view);
    var offer = view.status === "active" && me && typeof v.drawOffer === "number" && v.drawOffer !== me.seat && view.isMyTurn;
    els.drawOffer.hidden = !offer;
    if (!offer) return;
    var from = view.players.filter(function (p) { return p.seat === v.drawOffer; })[0];
    els.drawOfferText.textContent = (from ? handle(from) : "Your opponent") + " offers a draw. Accept it, or make a move to decline.";
  }

  function acceptDraw() {
    var m = state.match;
    if (!m || els.drawOffer.hidden) return;
    confirmDialog({
      title: "Accept the draw?",
      text: "The game ends as a draw.",
      confirmLabel: "Accept draw"
    }, function () {
      clearPending();
      sendMove({ type: "acceptDraw" }, null);
    });
  }

  // What just happened, in words. `lastMove` carries the squares and the
  // points; the word itself is only readable off the board the move was
  // applied to, which is exactly what the view we just received holds.
  // On the match screen the line also opens the move log. Under it, the
  // moves before it, as many as fit (fitRecentMoves).
  function renderLastMove(view) {
    var shown = writeLastMove(els.lastMove, view);
    els.lastMove.hidden = !shown;
    var log = shown && movesOf(view).length > 0;
    els.lastMove.classList.toggle("is-link", log);
    if (log) {
      els.lastMove.setAttribute("role", "button");
      els.lastMove.setAttribute("tabindex", "0");
    } else {
      els.lastMove.removeAttribute("role");
      els.lastMove.removeAttribute("tabindex");
    }
  }

  // Rows of the recent-moves box: three at most, so it reads as a glance at
  // what happened rather than a wall of text, and fewer when three don’t fit.
  var RECENT_ROWS = [3, 2, 1];

  // Every move before the last one, newest first, in a short box that
  // scrolls, fading at whichever edge has more behind it. It only takes room
  // the board leaves over: the board is square, so on a tall phone its box is
  // taller than it is wide and the spare height is just margin around it. On
  // a short phone there is none, the box stays hidden, and whatever the
  // others did since your last move is counted on the last-move line instead
  // ("+2 more"). Run again whenever the screen's height may have changed.
  function fitRecentMoves() {
    var view = state.match;
    var list = els.recentMoves;
    // Rebuilt on every refresh: keep the reader's place unless a move came in.
    var key = view ? view.matchUuid + ":" + (view.lastMove ? view.lastMove.ply : "") : "";
    var keepTop = list.dataset.key === key ? list.scrollTop : 0;
    list.dataset.key = key;
    clear(list);
    var more = els.lastMove.querySelector(".more");
    if (more) more.parentNode.removeChild(more);
    els.lastMove.classList.remove("has-more");
    if (!view || els.lastMove.hidden || !els.lastMove.classList.contains("is-link")) { list.hidden = true; return; }

    var moves = movesOf(view);
    var earlier = moves.slice(0, -1).reverse();
    earlier.forEach(function (mv) {
      var player = view.players.filter(function (p) { return p.seat === mv.seat; })[0];
      var row = el("li", "recent-move");
      writeMoveSentence(row, mv, player ? nameOf(player) : "Someone");
      list.appendChild(row);
    });
    list.hidden = !earlier.length || view.status !== "active";
    // Hidden screen: no boxes to measure. show() runs this again once it's up.
    var wrap = els.boardWrap;
    if (!list.hidden && wrap.clientWidth) {
      var rowHeight = list.firstChild.offsetHeight;
      var fits = RECENT_ROWS.some(function (rows) {
        list.style.maxHeight = Math.min(rows, earlier.length) * rowHeight + "px";
        return wrap.clientHeight >= wrap.clientWidth;
      });
      list.hidden = !fits;
    }
    list.scrollTop = keepTop;
    markRecentEdges();

    var missed = view.status === "active" && list.hidden ? movesSinceMine(view).length - 1 : 0;
    if (missed > 0) {
      els.lastMove.appendChild(el("span", "more", " · +" + missed + " more"));
      els.lastMove.classList.add("has-more");
    }
  }


  // A logged move as a sentence: "@pip played Nf3", "You played O-O and
  // offered a draw", "@hopper accepted a draw."
  function writeMoveSentence(target, mv, who) {
    if (mv.type === "move") {
      target.appendChild(document.createTextNode(who + " played "));
      target.appendChild(el("span", "san", mv.san || "a move"));
      if (mv.offerDraw) target.appendChild(document.createTextNode(" and offered a draw"));
    } else if (mv.type === "acceptDraw") {
      target.textContent = who + " accepted a draw.";
    } else if (mv.type === "claim") {
      target.textContent = who + " stopped playing.";
    } else {
      target.textContent = who + " moved.";
    }
  }

  function markRecentEdges() {
    var l = els.recentMoves;
    l.classList.toggle("more-up", l.scrollTop > 1);
    l.classList.toggle("more-down", l.scrollTop + l.clientHeight < l.scrollHeight - 1);
  }

  // Writes the last move into `target`; false when there is nothing to say.
  // Shared by the match screen and the list's spotlight card.
  function writeLastMove(target, view) {
    var lm = view.lastMove;
    if (!lm || view.status === "lobby") return false;
    var player = view.players.filter(function (p) { return p.seat === lm.seat; })[0];
    var who = player ? nameOf(player) : "Someone";
    var move = lm.move || {};
    clear(target);
    if (move.type === "move") {
      var san = view.view && view.view.last && view.view.last.san;
      target.appendChild(document.createTextNode(who + " played "));
      target.appendChild(el("span", "san", san || move.from + "–" + move.to));
      if (move.offerDraw) target.appendChild(document.createTextNode(" and offered a draw"));
    } else if (move.type === "acceptDraw") {
      target.textContent = who + " accepted a draw.";
    } else if (move.type === "claim") {
      target.textContent = who + " stopped playing.";
    } else {
      return false;
    }
    return true;
  }

  // The other player's move, read out once per ply for screen readers.
  function announceMove(view) {
    var lm = view.lastMove;
    if (!lm || lm.ply === state.announcedPly) return;
    state.announcedPly = lm.ply;
    var player = view.players.filter(function (p) { return p.seat === lm.seat; })[0];
    if (!player || player.isSelf) return;
    var line = el("span");
    if (writeLastMove(line, view)) els.boardStatus.textContent = line.textContent + (view.view && view.view.check && view.isMyTurn ? " You are in check." : "");
  }

  // The mystery seat on the finding and lobby screens turns through pieces
  // while we wait. Stopped whenever the panel is not on screen, and never
  // started for players who asked for less motion.
  var FIND_PIECES = "NqBrKnQbRk";
  var FLIP_FIRST_MS = 900;
  var FLIP_STAGGER_MS = 700;
  var FLIP_HOLD_MS = 1400;
  var FLIP_JITTER_MS = 1000;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function startFinding() {
    if (state.findTimer || (reduceMotion && reduceMotion.matches)) return;
    var started = Date.now();
    state.findTimer = setInterval(function () {
      if (state.screen !== "match" || document.hidden) return;
      var now = Date.now();
      $$(".flip-tile", els.screens.match).forEach(function (tile, i) {
        if (tile.offsetParent === null) return;
        var next = Number(tile.getAttribute("data-next")) || started + FLIP_FIRST_MS + i * FLIP_STAGGER_MS;
        if (now < next) { tile.setAttribute("data-next", String(next)); return; }
        tile.setAttribute("data-next", String(now + FLIP_HOLD_MS + Math.random() * FLIP_JITTER_MS));
        var piece;
        do { piece = FIND_PIECES.charAt(Math.floor(Math.random() * FIND_PIECES.length)); }
        while (piece === tile.getAttribute("data-piece"));
        tile.setAttribute("data-piece", piece);
        tile.innerHTML = Pieces.svg(piece);
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
      tile.removeAttribute("data-piece");
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
    var challenged = isChallenge(view);
    var missing = seatsMissing(view);
    var empty = Math.max(0, view.maxPlayers - view.players.length);
    var asked = invitedOthers(view);
    var host = hostOf(view);
    els.waitingTitle.textContent = challenged
      ? (host ? "@" + host.username : "Someone") + " challenged you"
      : missing === 0
        ? "Everyone’s here — starting"
        : asked.length && !empty
          ? "Waiting for " + asked.map(function (p) { return "@" + p.username; }).join(", ") + " to accept"
          : "Waiting for " + missing + " more player" + (missing > 1 ? "s" : "");
    els.lobbyLead.textContent = challenged
      ? "A game of chess. Who plays White is picked at random when it starts."
      : missing === 0 ? ""
      : asked.length && !empty
        ? "They’ve been sent your challenge. The game starts as soon as they accept."
        : "The game starts the moment the seat is filled. Whoever opens the link signs in (or signs up), then sits down.";
    var code = challenged ? null : view.joinCode;
    els.lobbyCode.textContent = code || "—";
    els.lobbyCode.parentNode.hidden = !code;
    els.shareCodeButton.hidden = !code;
    els.lobbyLink.hidden = !code;
    if (els.shareCard) els.shareCard.hidden = !code;
    if (code) els.lobbyLinkField.value = inviteUrl(code);
    els.challengeActions.hidden = !challenged;
    els.acceptButton.disabled = false;
    els.lobbyClose.hidden = challenged;

    clear(els.waitingSeats);
    view.players.forEach(function (p) {
      var invited = p.status === "invited" && !p.isSelf;
      els.waitingSeats.appendChild(waitingSeat((p.username || "?").charAt(0).toUpperCase(),
        nameOf(p) + (invited ? " · invited" : ""), invited));
    });
    for (var i = 0; i < empty; i++) els.waitingSeats.appendChild(waitingSeat("?", "Open seat", true));
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

  // ------------------------------------------------------------ game over

  // "Checkmate", "Draw by repetition", "@pip resigned": how it ended.
  function endReason(view) {
    var v = view.view || {};
    var r = v.result;
    var winner = view.winnerSeat === null ? null : view.players.filter(function (p) { return p.seat === view.winnerSeat; })[0];
    var loser = winner ? view.players.filter(function (p) { return p.seat !== winner.seat; })[0] : null;
    if (r && r.type) {
      return {
        checkmate: "Checkmate.",
        stalemate: "Stalemate: no legal move, but no check either.",
        repetition: "The same position came up three times.",
        fifty: "Fifty moves each without a capture or a pawn move.",
        material: "Neither side has the pieces left to checkmate.",
        agreed: "Draw agreed."
      }[r.type] || "";
    }
    var lm = view.lastMove;
    if (lm && lm.move && lm.move.type === "claim" && loser) {
      return (loser.isSelf ? "You" : "@" + loser.username) + " stopped moving, so the game was claimed.";
    }
    var resigned = view.players.filter(function (p) { return p.status === "resigned"; })[0];
    if (resigned) return nameOf(resigned) + " resigned.";
    return "";
  }

  function resultLine(view) {
    if (view.status === "abandoned") return "Table closed";
    var me = meIn(view);
    var head = view.winnerSeat === null ? "Draw" : me && view.winnerSeat === me.seat ? "You won" : "You lost";
    var why = endReason(view);
    return head + (why ? " · " + why.replace(/\.$/, "") : "");
  }

  // The end of a game, as a result card: who won, how, and a few numbers read
  // off the move log. "See the board" puts the card away to look at the final
  // position; the review bar brings it back.
  function renderOver(view, justEnded) {
    var done = view.status === "finished" || view.status === "abandoned";
    if (justEnded) state.reviewing = false;
    els.over.hidden = !done || state.reviewing;
    if (!done) return;
    els.rematchButton.hidden = !(view.status === "finished" && meIn(view) && (view.local || OR.capabilities.has("matches.create")));
    var moves = movesOf(view);
    els.movesButton.hidden = !moves.some(function (mv) { return mv.type === "move"; });
    els.boardButton.hidden = view.status !== "finished";
    var me = meIn(view);
    clear(els.overScores);
    clear(els.overHighlights);
    if (view.status === "abandoned") {
      els.overKicker.textContent = "Table closed";
      els.overTitle.textContent = "This game never got going";
      els.overText.textContent = "Nobody took the empty seat in time.";
      return;
    }

    var played = moves.filter(function (mv) { return mv.type === "move"; });
    var full = Math.ceil(played.length / 2);
    var winner = view.winnerSeat === null ? null : view.players.filter(function (p) { return p.seat === view.winnerSeat; })[0];
    els.overKicker.textContent = "Final" + (full ? " · " + full + (full === 1 ? " move" : " moves") : "");
    if (!winner) {
      els.overTitle.textContent = "It’s a draw";
    } else if (me && winner.seat === me.seat) {
      els.overTitle.textContent = "You won!";
      if (justEnded) haptic("success");
      celebrate(view.matchUuid);
    } else {
      els.overTitle.textContent = handle(winner) + " won";
    }
    els.overText.textContent = endReason(view);

    // White first, as a scoresheet has it: 1, 0 or ½ each.
    var players = view.players.slice().sort(function (a, b) {
      return (colorOfSeat(view, a.seat) === "w" ? 0 : 1) - (colorOfSeat(view, b.seat) === "w" ? 0 : 1);
    });
    players.forEach(function (p) {
      var color = colorOfSeat(view, p.seat);
      var row = el("li", "over-row" + (winner && p.seat === winner.seat ? " is-winner" : "") + (p.isSelf ? " is-self" : ""));
      var side = el("span", "over-rank");
      if (color) side.innerHTML = Pieces.svg(color === "w" ? "K" : "k");
      row.appendChild(side);
      row.appendChild(avatar(p.username, p.avatar));
      row.appendChild(el("span", "over-name", nameOf(p) + (p.status === "resigned" ? " · resigned" : "")));
      row.appendChild(el("span", "over-score", !winner ? "½" : p.seat === winner.seat ? "1" : "0"));
      els.overScores.appendChild(row);
    });

    // The viewer's own game in three numbers.
    if (me && played.length) {
      var mine = played.filter(function (mv) { return mv.seat === me.seat; });
      var captures = mine.filter(function (mv) { return mv.capture; }).length;
      var checks = mine.filter(function (mv) { return /[+#]$/.test(mv.san || ""); }).length;
      els.overHighlights.appendChild(highlight("Your moves", String(mine.length)));
      els.overHighlights.appendChild(highlight("Captures", String(captures)));
      els.overHighlights.appendChild(highlight("Checks", String(checks)));
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

  // Pieces rain down, once per won game per session. Nothing for players
  // who asked for less motion.
  function celebrate(uuid) {
    if (state.celebrated[uuid] || (reduceMotion && reduceMotion.matches)) return;
    state.celebrated[uuid] = true;
    clear(els.overBurst);
    var pieces = "KQRBNPkqrbnp";
    for (var i = 0; i < 18; i++) {
      var t = el("span", "burst-tile");
      t.innerHTML = Pieces.svg(pieces.charAt(i % pieces.length));
      t.style.left = (4 + Math.random() * 92) + "%";
      t.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s";
      t.style.setProperty("--spin", (Math.random() * 120 - 60).toFixed(0) + "deg");
      els.overBurst.appendChild(t);
    }
    setTimeout(function () { clear(els.overBurst); }, 2800);
  }

  // Same opponent, new game. Someone the viewer can still challenge is
  // invited straight away; anyone they cannot (a stranger who came in on a
  // join code) gets the open seat, so the new game opens as a lobby with a
  // code to send them.
  function rematch() {
    var m = state.match;
    if (!m || state.creating) return;
    if (m.local) {
      Computer.rematch(m.matchUuid).then(function (view) {
        haptic("success");
        enterMatch(view);
      }).catch(function (err) { toast(errorText(err, "Couldn't set up the rematch."), true); });
      return;
    }
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
      return Matches.create({
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

  // ------------------------------------------------------------ move log

  // The move log, from `view.history` (oldest first, as `lastMove` has each
  // entry), replayed from the start to get each move's notation. A host that
  // predates `history` sends none, and the Moves entries stay hidden.
  function movesOf(view) {
    var v = view && view.view;
    if (!v || !Array.isArray(v.history) || !v.history.length) return [];
    return Rules.replay(v.history);
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

  // A scoresheet: one line per full move, White's and Black's side by side.
  function showMoves() {
    var m = state.match;
    var moves = movesOf(m);
    if (!moves.length) return;
    openDialog({
      title: "Moves",
      prose: true,
      cancelLabel: "Close",
      build: function (body) {
        var white = m.players.filter(function (p) { return colorOfSeat(m, p.seat) === "w"; })[0];
        var black = m.players.filter(function (p) { return colorOfSeat(m, p.seat) === "b"; })[0];
        var head = el("div", "sheet-players");
        head.appendChild(el("span", "", "White: " + (white ? nameOf(white) : "?")));
        head.appendChild(el("span", "", "Black: " + (black ? nameOf(black) : "?")));
        body.appendChild(head);
        var list = el("ol", "score-sheet");
        var line = null;
        moves.forEach(function (mv, i) {
          if (mv.type !== "move") {
            var player = m.players.filter(function (p) { return p.seat === mv.seat; })[0];
            var note = el("li", "sheet-note");
            writeMoveSentence(note, mv, player ? nameOf(player) : "Someone");
            list.appendChild(note);
            line = null;
            return;
          }
          if (mv.color === "w" || !line) {
            line = el("li", "sheet-line");
            line.appendChild(el("span", "sheet-num", Math.floor(i / 2) + 1 + "."));
            if (mv.color === "b") line.appendChild(el("span", "sheet-san", "…"));
            list.appendChild(line);
          }
          var cell = el("span", "sheet-san" + (i === moves.length - 1 ? " is-last" : ""), mv.san);
          if (mv.offerDraw) cell.appendChild(el("span", "sheet-offer", " (=)"));
          line.appendChild(cell);
          if (mv.color === "b") line = null;
        });
        body.appendChild(list);
        if (moves.some(function (mv) { return mv.offerDraw; })) body.appendChild(el("p", "muted small", "(=) a draw was offered with that move."));
        setTimeout(function () { els.dialogCard.scrollTop = els.dialogCard.scrollHeight; }, 0);
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
  var CHAT_QUICK = ["Good game!", "Nice move!", "Your move 👀", "👍"];

  function canChat() {
    return OR.capabilities.has("matches.chat") && OR.capabilities.has("matches.chatSend")
      && typeof OR.matches.chat === "function" && typeof OR.matches.chatSend === "function";
  }

  // Somebody to talk to: another seat that is (or was) actually at the table.
  // A lobby of one, or a quick-match table still looking, has nobody. Nor
  // does a challenge this player has not accepted: the server keeps an
  // invited seat out of the table's chat until they say yes.
  function chatAvailable(view) {
    return !!view && !view.local && canChat() && !isChallenge(view)
      && view.players.some(function (p) { return !p.isSelf && p.status !== "invited"; });
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
    var out = "ch-";
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
    Matches.chat({ matchUuid: uuid, limit: CHAT_PAGE, markSeen: c.open }).then(function (page) {
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
    Matches.chat({ matchUuid: c.uuid, before: c.messages[0].messageUuid, limit: CHAT_PAGE }).then(function (page) {
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
    Matches.chatSend({ matchUuid: c.uuid, text: entry.text, nonce: entry.nonce }).then(function (msg) {
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

  // ------------------------------------------------------------- moves

  function sendMove(move, okText) {
    if (state.sending || !state.match) return;
    state.sending = true;
    renderControls();
    var uuid = state.match.matchUuid;
    var mine = function () { return state.screen === "match" && state.match && state.match.matchUuid === uuid; };
    Matches.move({ matchUuid: uuid, version: state.match.version, move: move }).then(function (view) {
      state.sending = false;
      state.offerDraw = false;
      if (!isCurrent(view)) return;
      clearPending();
      state.announcedPly = view.lastMove ? view.lastMove.ply : state.announcedPly;
      haptic("success");
      if (okText) toast(okText);
      applyView(view);
    }).catch(function (err) {
      state.sending = false;
      if (!mine()) return;
      var code = errorCode(err);
      if (code === "match/version-conflict" || code === "match/not-your-turn") {
        toast("The game moved on — refreshing.", true);
        clearPending();
        Matches.get({ matchUuid: uuid }).then(function (view) {
          if (isCurrent(view)) applyView(view);
        }).catch(function () {});
        renderBoard(null);
        renderControls();
        return;
      }
      // The rules here and on the server disagree, or the move was otherwise
      // refused: the piece goes back and the server's reason is shown.
      haptic("error");
      console.warn("[chess] move refused", err);
      clearPending();
      toast(errorText(err, "That move was refused."), true);
      renderBoard(null);
      renderControls();
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
        : "Your opponent wins. This cannot be undone.",
      confirmLabel: lobby ? (m.matchmaking ? "Stop looking" : mine ? "Close table" : "Leave") : "Resign",
      danger: true
    }, function () {
      Matches.resign({ matchUuid: m.matchUuid }).then(function (view) {
        if (isCurrent(view) || (state.match && state.match.matchUuid === view.matchUuid)) {
          if (view.status === "finished") { applyView(view); return; }
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
    var text = "Play me at chess on OddsRabbit — join with code " + m.joinCode + ": " + url;
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

  // A draw can be offered with a move of yours, unless the other player's
  // offer is standing: that one is answered with Accept, not a counter.
  function canOfferDraw(m) {
    if (!m || m.status !== "active" || !m.isMyTurn || isOut(m) || !m.view) return false;
    var opp = m.view.drawOffer;
    return !(typeof opp === "number" && opp !== (meIn(m) || {}).seat);
  }

  function toggleDrawOffer() {
    state.offerDraw = !state.offerDraw;
    toast(state.offerDraw ? "Your draw offer will go with your move." : "Draw offer taken back.");
    haptic("light");
    renderControls();
  }

  function openMatchMenu() {
    var m = state.match;
    openDialog({
      title: "Game options",
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
        if (movesOf(m).some(function (mv) { return mv.type === "move"; })) item("Moves", false, showMoves);
        if (m && m.joinCode && m.status === "lobby") item("Share invite", false, shareCode);
        if (canOfferDraw(m) && !state.sending) item(state.offerDraw ? "Don’t offer a draw" : "Offer a draw", false, toggleDrawOffer);
        if (m && (m.status === "lobby" || (m.status === "active" && !isOut(m)))) {
          item(m.status === "lobby" ? (m.matchmaking ? "Stop looking" : "Leave table") : "Resign", true, resign);
        }
        return {};
      }
    });
  }

  // ------------------------------------------------------------ pickers

  // What a pawn on the last rank becomes. Closing the dialog cancels the move.
  function pickPromotion(color, done) {
    openDialog({
      title: "Promote to",
      confirmLabel: null,
      build: function (body, close) {
        ["q", "r", "b", "n"].forEach(function (kind) {
          var button = el("button", "picker-piece");
          button.type = "button";
          button.innerHTML = Pieces.svg(color === "w" ? kind.toUpperCase() : kind);
          button.setAttribute("aria-label", Rules.NAMES[kind]);
          button.addEventListener("click", function () { close(kind); });
          body.appendChild(button);
        });
        return {};
      },
      onClose: function (kind) { done(kind || null); }
    });
  }

  // ------------------------------------------------------------- art

  // The hero's corner of a board, mid-game, and the list band: the pieces
  // the game draws, so the art can never drift from the board.
  var HERO_ROWS = ["..rk.", "pp.np", "..N..", ".B.P.", "PP..Q"];
  function drawHero() {
    clear(els.heroBoard);
    HERO_ROWS.forEach(function (row, r) {
      row.split("").forEach(function (piece, c) {
        var cell = el("span", "hero-sq " + ((r + c) % 2 ? "is-dark" : "is-light"));
        if (piece !== ".") {
          cell.innerHTML = Pieces.svg(piece);
          cell.style.animationDelay = (0.04 * (r * 5 + c)).toFixed(2) + "s";
          cell.classList.add("has-piece");
        }
        els.heroBoard.appendChild(cell);
      });
    });
  }

  function drawBand() {
    clear(els.listBand);
    var squares = el("div", "band-squares");
    els.listBand.appendChild(squares);
    var pair = el("div", "band-pieces");
    var knight = el("span", "band-piece is-back");
    knight.innerHTML = Pieces.svg("n");
    var rabbit = el("span", "band-piece is-front");
    rabbit.innerHTML = Pieces.svg("N");
    pair.appendChild(knight);
    pair.appendChild(rabbit);
    els.listBand.appendChild(pair);
  }

  function drawChooseArt() {
    $$(".choose-art").forEach(function (node) {
      clear(node);
      (node.getAttribute("data-pieces") || "").split("").forEach(function (piece) {
        var tile = el("span", "art-piece");
        tile.innerHTML = Pieces.svg(piece);
        node.appendChild(tile);
      });
    });
  }

  // ------------------------------------------------------------- boot

  function applyTheme() {
    var dark = OR.colorScheme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
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

  function onKeyDown(e) {
    if (dialogState || state.screen !== "match" || (state.chat && state.chat.open)) return;
    if (e.key === "Escape") {
      if (state.pending) { e.preventDefault(); undoPending(); }
      else if (state.selected !== null) { e.preventDefault(); state.selected = null; renderBoard(null); renderControls(); }
    }
  }

  function wire() {
    els.newGameButtons.forEach(function (b) { b.addEventListener("click", openChooser); });
    els.joinOpenButtons.forEach(function (b) { b.addEventListener("click", openJoinDialog); });
    els.quickButtons.forEach(function (b) { b.addEventListener("click", quickMatch); });
    els.helpButtons.forEach(function (b) { b.addEventListener("click", showHowTo); });
    els.backButtons.forEach(function (b) {
      // The friend setup steps back to the chooser it came from; every other
      // screen goes back to the list.
      var fromSetup = !!b.closest(".screen-new, .screen-cpu");
      b.addEventListener("click", function () {
        if (fromSetup) showScreen("choose");
        else backToList();
      });
    });
    els.chooseFriends.addEventListener("click", chooseFriends);
    els.cpuOpenButtons.forEach(function (b) { b.addEventListener("click", openComputer); });
    els.cpuReroll.addEventListener("click", rerollComputer);
    els.cpuStart.addEventListener("click", startComputer);
    els.cpuColors.forEach(function (b) {
      b.addEventListener("click", function () {
        state.cpu.color = b.getAttribute("data-color");
        saveCpuPrefs();
        renderComputer();
      });
    });
    els.chooseJoin.addEventListener("click", openJoinDialog);
    els.findingBack.addEventListener("click", backToList);
    els.findingStop.addEventListener("click", resign);
    els.lobbyBack.addEventListener("click", backToList);
    els.lobbyClose.addEventListener("click", resign);
    els.acceptButton.addEventListener("click", function () {
      if (state.match) acceptChallenge(state.match, els.acceptButton);
    });
    els.declineButton.addEventListener("click", function () {
      if (state.match) declineChallenge(state.match);
    });
    els.menuButton.addEventListener("click", openMatchMenu);
    els.offerChip.addEventListener("click", toggleDrawOffer);
    wireChat();
    els.nudgeButton.addEventListener("click", nudge);
    els.claimButton.addEventListener("click", claim);
    els.acceptDrawButton.addEventListener("click", acceptDraw);
    els.players.addEventListener("scroll", markPlayerEdges, { passive: true });
    els.inviteInput.addEventListener("input", function () {
      state.inviteQuery = els.inviteInput.value;
      searchSoon();
      renderInvitable();
    });
    els.inviteClear.addEventListener("click", function () {
      els.inviteInput.value = "";
      state.inviteQuery = "";
      resetSearch();
      renderInvitable();
      els.inviteInput.focus();
    });
    els.inviteInput.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !els.inviteInput.value) return;
      els.inviteInput.value = "";
      state.inviteQuery = "";
      resetSearch();
      renderInvitable();
      e.stopPropagation();
    });
    // With an open seat, the game is only useful once the link is out, so
    // the share sheet opens as soon as the table exists.
    els.createButton.addEventListener("click", function () { createMatch(state.openSeats > 0); });
    els.copyLinkButton.addEventListener("click", function () {
      if (state.match && state.match.joinCode) copyLink(inviteUrl(state.match.joinCode));
    });
    els.lobbyLinkField.addEventListener("focus", function () { els.lobbyLinkField.select(); });
    els.sendButton.addEventListener("click", sendPending);
    els.undoButton.addEventListener("click", undoPending);
    els.shareCodeButton.addEventListener("click", shareCode);
    els.overBack.addEventListener("click", backToList);
    els.rematchButton.addEventListener("click", rematch);
    els.movesButton.addEventListener("click", showMoves);
    els.boardButton.addEventListener("click", function () {
      state.reviewing = true;
      els.over.hidden = true;
      renderControls();
    });
    els.resultButton.addEventListener("click", function () {
      state.reviewing = false;
      if (state.match) renderOver(state.match, false);
      renderControls();
    });
    els.recentMoves.addEventListener("click", showMoves);
    els.recentMoves.addEventListener("scroll", markRecentEdges, { passive: true });
    els.lastMove.addEventListener("click", function () {
      if (els.lastMove.classList.contains("is-link")) showMoves();
    });
    els.lastMove.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && els.lastMove.classList.contains("is-link")) { e.preventDefault(); showMoves(); }
    });
    els.signIn.addEventListener("click", function () {
      var code = peekJoin();
      OR.actions.requestSignIn(code
        ? "Sign in to take your seat in this game."
        : "Sign in to play against friends.");
    });

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", function () {
      if (state.screen !== "match") return;
      fitRecentMoves();
      markPlayerEdges();
      resizeBoard();
    });
    if (window.ResizeObserver) new ResizeObserver(resizeBoard).observe(els.boardWrap);
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
    els.screens.list.classList.toggle("is-bare", mode === "none");
  }

  // No games with people here (signed out, or a host without the match
  // verbs): the computer is the one way in, so it is the only button left.
  function offlineOnly() {
    els.newGameButtons.forEach(function (b) { if (b.closest(".hero")) b.hidden = true; });
    els.joinOpenButtons.forEach(function (b) { b.hidden = true; });
    els.quickButtons.forEach(function (b) { b.hidden = true; });
    state.canQuick = false;
    els.cpuOpenButtons.forEach(function (b) {
      if (b.closest(".hero")) b.classList.add("primary");
    });
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
    drawHero();
    drawBand();
    drawChooseArt();
    wireDialog();
    wire();
    showScreen("list");

    // Computer games come from the game's own storage, so they load first and
    // work whatever else the host can do.
    Computer.init({ storage: OR.capabilities.has("storage.get") ? OR.storage : null, user: OR.user });
    Computer.onChange(function () { if (state.screen === "list") loadList(true); });
    state.online = OR.capabilities.has("matches.get") && !!OR.user;

    if (!OR.capabilities.has("matches.get")) {
      els.unsupported.hidden = false;
      offlineOnly();
      loadList().then(function () { OR.ready(); });
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
      offlineOnly();
      els.signInActions.hidden = !OR.capabilities.has("actions.requestSignIn");
      loadList().then(function () {
        // The note goes on the hero, which only shows with no computer games.
        if (invite) showHeroOnly("You’ve been invited to a table (code " + invite + "). Sign in to take your seat.");
        OR.ready();
      });
      return;
    }

    startListPolling();
    var linked = handleDeepLink();
    loadList().then(function () { OR.ready(); });
    if (linked) OR.ready();
  });
})();
