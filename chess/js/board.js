// The chess board: 64 square buttons in a grid, with the pieces on a layer
// above them so a move can slide. DOM rather than canvas because an 8×8 board
// fits a phone without zooming, and real buttons give keyboard and screen
// reader access for nothing.
//
// The board knows nothing about the rules. application.js tells it what to
// show (setPosition) and hears back taps and drags (onSquareTap, onDrop); the
// legal-move dots are whatever squares it is handed.
//
// Gestures: tap a square, or press on a piece the app says can move and drag
// it to another square. A drag that ends where it began is a tap. Keys: the
// arrows move between squares (in board order, whichever way up it is), and
// Enter or Space taps the focused one.

(function (root) {
  var Pieces = root.ChessPieces;
  var Rules = root.ChessRules;
  var DRAG_SLOP = 6;
  var SLIDE_MS = 180;

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function pieceName(piece) {
    if (!piece || piece === ".") return "empty";
    return (piece === piece.toUpperCase() ? "white " : "black ") + Rules.NAMES[piece.toLowerCase()];
  }

  function ChessBoard(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.board = null;
    this.orientation = "w";
    this.marks = { last: null, check: null, selected: null, targets: [] };
    this.cursor = null;
    this.drag = null;
    this.size = 0;
    this.reduceMotion = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

    this.el = el("div", "chess-board");
    this.el.setAttribute("role", "grid");
    this.el.setAttribute("aria-label", "Chess board");
    this.squaresEl = el("div", "cb-squares");
    this.piecesEl = el("div", "cb-pieces");
    this.el.appendChild(this.squaresEl);
    this.el.appendChild(this.piecesEl);
    host.insertBefore(this.el, this.opts.before || null);

    this.squares = [];
    for (var i = 0; i < 64; i++) {
      var sq = el("button", "cb-sq");
      sq.type = "button";
      sq.tabIndex = -1;
      sq.setAttribute("data-sq", String(i));
      this.squares.push(sq);
    }
    this.layoutSquares();
    this.bind();
  }

  // Display slot (0 = top-left) for square `sq` under the current orientation.
  ChessBoard.prototype.slotOf = function (sq) {
    var f = sq % 8, r = Math.floor(sq / 8);
    return this.orientation === "w" ? (7 - r) * 8 + f : r * 8 + (7 - f);
  };

  ChessBoard.prototype.squareAtSlot = function (slot) {
    var row = Math.floor(slot / 8), col = slot % 8;
    return this.orientation === "w" ? (7 - row) * 8 + col : row * 8 + (7 - col);
  };

  // Squares in display order, with the coordinates on the edge ones.
  ChessBoard.prototype.layoutSquares = function () {
    while (this.squaresEl.firstChild) this.squaresEl.removeChild(this.squaresEl.firstChild);
    for (var slot = 0; slot < 64; slot++) {
      var sq = this.squareAtSlot(slot);
      var node = this.squares[sq];
      var f = sq % 8, r = Math.floor(sq / 8);
      node.className = "cb-sq " + ((f + r) % 2 ? "is-light" : "is-dark");
      node.textContent = "";
      if (slot % 8 === 0) node.appendChild(Object.assign(el("span", "cb-rank"), { textContent: String(r + 1) }));
      if (slot >= 56) node.appendChild(Object.assign(el("span", "cb-file"), { textContent: "abcdefgh".charAt(f) }));
      this.squaresEl.appendChild(node);
    }
  };

  ChessBoard.prototype.setOrientation = function (color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.layoutSquares();
    this.render(null);
  };

  /**
   * What to show. `board` is the 64-char board string; `marks` is
   * { last: {from, to} | null, check: sq | null, selected: sq | null,
   *   targets: [sq] }; `slide` is { from, to } to animate the piece now on
   * `to` in from `from` (and the rook, for a castle).
   */
  ChessBoard.prototype.setPosition = function (board, marks, slide) {
    this.board = board;
    this.marks = {
      last: marks && marks.last || null,
      check: marks && typeof marks.check === "number" ? marks.check : null,
      selected: marks && typeof marks.selected === "number" ? marks.selected : null,
      targets: marks && marks.targets || []
    };
    this.render(slide || null);
  };

  ChessBoard.prototype.setMarks = function (marks) {
    this.setPosition(this.board, marks, null);
  };

  ChessBoard.prototype.render = function (slide) {
    var board = this.board;
    var m = this.marks;
    var targets = {};
    m.targets.forEach(function (sq) { targets[sq] = true; });
    var dragFrom = this.drag && this.drag.lifted ? this.drag.from : null;

    for (var sq = 0; sq < 64; sq++) {
      var node = this.squares[sq];
      var piece = board ? board[sq] : ".";
      node.classList.toggle("is-last", !!m.last && (m.last.from === sq || m.last.to === sq));
      node.classList.toggle("is-check", m.check === sq);
      node.classList.toggle("is-selected", m.selected === sq);
      node.classList.toggle("is-target", !!targets[sq] && piece === ".");
      node.classList.toggle("is-capture", !!targets[sq] && piece !== ".");
      var label = Rules.squareName(sq) + ", " + pieceName(piece);
      if (m.selected === sq) label += ", selected";
      if (targets[sq]) label += piece === "." ? ", can move here" : ", can capture";
      if (m.check === sq) label += ", in check";
      if (m.last && m.last.to === sq) label += ", last move";
      node.setAttribute("aria-label", label);
    }

    while (this.piecesEl.firstChild) this.piecesEl.removeChild(this.piecesEl.firstChild);
    if (!board) return;
    var moving = [];
    for (var s = 0; s < 64; s++) {
      if (board[s] === ".") continue;
      var holder = el("div", "cb-piece" + (s === dragFrom ? " is-lifted" : ""));
      holder.innerHTML = Pieces.svg(board[s]);
      this.place(holder, s);
      holder.setAttribute("data-sq", String(s));
      this.piecesEl.appendChild(holder);
      if (slide && s === slide.to) moving.push([holder, slide.from, s]);
      if (slide && slide.rook && s === slide.rook.to) moving.push([holder, slide.rook.from, s]);
    }
    if (moving.length && !this.reduceMotion) this.slide(moving);
  };

  ChessBoard.prototype.place = function (node, sq) {
    var slot = this.slotOf(sq);
    node.style.transform = "translate(" + (slot % 8) * 100 + "%," + Math.floor(slot / 8) * 100 + "%)";
  };

  // Start each piece on its old square, then let the transition carry it.
  ChessBoard.prototype.slide = function (moving) {
    var self = this;
    moving.forEach(function (m) {
      m[0].style.transition = "none";
      self.place(m[0], m[1]);
      m[0].classList.add("is-moving");
    });
    void this.piecesEl.offsetWidth;
    moving.forEach(function (m) {
      m[0].style.transition = "transform " + SLIDE_MS + "ms ease-out";
      self.place(m[0], m[2]);
    });
    setTimeout(function () {
      moving.forEach(function (m) {
        m[0].style.transition = "";
        m[0].classList.remove("is-moving");
      });
    }, SLIDE_MS + 40);
  };

  // A square board as big as the box it sits in allows, less `reserve` px of
  // height for whatever shares the box with it, in whole pixels per square so
  // the grid lines stay crisp. The size is also set on the box as --board for
  // the things around it.
  ChessBoard.prototype.resize = function () {
    var box = this.host;
    var w = box.clientWidth, h = box.clientHeight - (this.opts.reserve || 0);
    if (!w || h <= 0) return false;
    var size = Math.max(8, Math.floor(Math.min(w, h) / 8) * 8);
    if (size === this.size) return true;
    this.size = size;
    this.el.style.width = size + "px";
    this.el.style.height = size + "px";
    this.el.style.setProperty("--sq", size / 8 + "px");
    box.style.setProperty("--board", size + "px");
    return true;
  };

  ChessBoard.prototype.hasSize = function () {
    return this.size > 0;
  };

  ChessBoard.prototype.squareFromPoint = function (x, y) {
    var rect = this.squaresEl.getBoundingClientRect();
    if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return null;
    var col = Math.floor((x - rect.left) / (rect.width / 8));
    var row = Math.floor((y - rect.top) / (rect.height / 8));
    return this.squareAtSlot(row * 8 + col);
  };

  ChessBoard.prototype.bind = function () {
    var self = this;
    this.el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      var sq = self.squareFromPoint(e.clientX, e.clientY);
      if (sq === null) return;
      var canDrag = !!(self.board && self.board[sq] !== "." && self.opts.canDrag && self.opts.canDrag(sq));
      self.drag = { id: e.pointerId, from: sq, x: e.clientX, y: e.clientY, canDrag: canDrag, lifted: false, ghost: null };
      if (canDrag) {
        e.preventDefault();
        try { self.el.setPointerCapture(e.pointerId); } catch (_) {}
      }
    });
    this.el.addEventListener("pointermove", function (e) {
      var d = self.drag;
      if (!d || d.id !== e.pointerId || !d.canDrag) return;
      if (!d.lifted) {
        if (Math.abs(e.clientX - d.x) < DRAG_SLOP && Math.abs(e.clientY - d.y) < DRAG_SLOP) return;
        d.lifted = true;
        d.ghost = el("div", "cb-ghost");
        d.ghost.innerHTML = Pieces.svg(self.board[d.from]);
        d.ghost.style.width = d.ghost.style.height = self.size / 8 + "px";
        document.body.appendChild(d.ghost);
        if (self.opts.onDragStart) self.opts.onDragStart(d.from);
        var lifted = self.piecesEl.querySelector('.cb-piece[data-sq="' + d.from + '"]');
        if (lifted) lifted.classList.add("is-lifted");
      }
      e.preventDefault();
      // Held a little above the finger, so the piece is not under it.
      var lift = e.pointerType === "touch" ? self.size / 16 : 0;
      d.ghost.style.transform = "translate(" + (e.clientX - self.size / 16) + "px," + (e.clientY - self.size / 16 - lift) + "px)";
      var over = self.squareFromPoint(e.clientX, e.clientY - lift);
      self.squares.forEach(function (node, i) { node.classList.toggle("is-hover", i === over); });
    });
    function end(e, cancelled) {
      var d = self.drag;
      if (!d || d.id !== e.pointerId) return;
      self.drag = null;
      try { self.el.releasePointerCapture(e.pointerId); } catch (_) {}
      self.squares.forEach(function (node) { node.classList.remove("is-hover"); });
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      if (!d.lifted) {
        if (!cancelled && self.opts.onSquareTap) self.opts.onSquareTap(d.from);
        return;
      }
      var lift = e.pointerType === "touch" ? self.size / 16 : 0;
      var to = cancelled ? null : self.squareFromPoint(e.clientX, e.clientY - lift);
      if (to === null || to === d.from) {
        self.render(null);
        if (to === d.from && self.opts.onSquareTap) self.opts.onSquareTap(d.from);
        return;
      }
      if (self.opts.onDrop) self.opts.onDrop(d.from, to);
      else self.render(null);
    }
    this.el.addEventListener("pointerup", function (e) { end(e, false); });
    this.el.addEventListener("pointercancel", function (e) { end(e, true); });
    // The pointer handler answers taps; a click from the keyboard (Enter on a
    // focused button fires one with detail 0) still has to reach the app.
    this.el.addEventListener("click", function (e) {
      var target = e.target.closest ? e.target.closest(".cb-sq") : null;
      if (!target || e.detail !== 0) return;
      if (self.opts.onSquareTap) self.opts.onSquareTap(Number(target.getAttribute("data-sq")));
    });
    this.el.addEventListener("keydown", function (e) {
      var target = e.target.closest ? e.target.closest(".cb-sq") : null;
      if (!target) return;
      var slot = self.slotOf(Number(target.getAttribute("data-sq")));
      var row = Math.floor(slot / 8), col = slot % 8;
      if (e.key === "ArrowUp") row = Math.max(0, row - 1);
      else if (e.key === "ArrowDown") row = Math.min(7, row + 1);
      else if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
      else if (e.key === "ArrowRight") col = Math.min(7, col + 1);
      else return;
      e.preventDefault();
      self.focusSquare(self.squareAtSlot(row * 8 + col));
    });
    this.el.addEventListener("focusin", function (e) {
      var target = e.target.closest ? e.target.closest(".cb-sq") : null;
      if (target) self.cursor = Number(target.getAttribute("data-sq"));
    });
  };

  // One square in the tab order at a time (roving tabindex): Tab enters the
  // board, the arrows move inside it.
  ChessBoard.prototype.focusSquare = function (sq) {
    var self = this;
    this.cursor = sq;
    this.squares.forEach(function (node, i) { node.tabIndex = i === sq ? 0 : -1; });
    this.squares[sq].focus();
    if (self.opts.onCursor) self.opts.onCursor(sq);
  };

  // Where Tab lands: the selected piece, else the last move, else e2/e7.
  ChessBoard.prototype.setEntry = function (sq) {
    this.squares.forEach(function (node, i) { node.tabIndex = i === sq ? 0 : -1; });
  };

  ChessBoard.prototype.cancelDrag = function () {
    var d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    this.squares.forEach(function (node) { node.classList.remove("is-hover"); });
  };

  // A small, static board for list cards: no buttons, no gestures.
  ChessBoard.preview = function (board, orientation, last) {
    var grid = el("div", "cb-preview");
    grid.setAttribute("aria-hidden", "true");
    for (var slot = 0; slot < 64; slot++) {
      var row = Math.floor(slot / 8), col = slot % 8;
      var sq = orientation === "b" ? row * 8 + (7 - col) : (7 - row) * 8 + col;
      var cell = el("span", "pv " + ((sq % 8 + Math.floor(sq / 8)) % 2 ? "is-light" : "is-dark")
        + (last && (last.from === sq || last.to === sq) ? " is-last" : ""));
      if (board[sq] !== ".") cell.innerHTML = Pieces.svg(board[sq]);
      grid.appendChild(cell);
    }
    return grid;
  };

  root.ChessBoard = ChessBoard;
})(window);
