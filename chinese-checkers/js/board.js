// The star board, in SVG: 121 holes, marbles on a layer above them, and the
// marks (where the picked-up marble can go, the last move's trail, the hint).
// It knows nothing of the rules: application.js says what to show
// (setPosition) and hears back taps (onTap). Every colour is a custom property
// from styles.css, gradients included, so the host theme reaches the board
// without a redraw.
//
// Turned so the viewer's own point is at the bottom, as across a real table:
// the star is symmetric under a sixth of a turn, so the holes land on holes.
//
// Whose turn it is shows on the board itself: a name tag in that player's
// colour ("Your move", "@pip's move") just outside the tip of their starting
// point, so a glance at the star answers it without reading the strip above.
//
// Taps go to the nearest hole within most of a hole's spacing, so the targets
// are bigger than the holes look.

(function (root) {
  var R = root.CCRules;
  var NS = "http://www.w3.org/2000/svg";
  var SQ3 = Math.sqrt(3);
  var MARBLE_R = 0.7;
  var HOLE_R = 0.42;
  var DOT_R = 0.28;
  var HOP_MS = 190;
  var STEP_MS = 160;
  // The star is 25 units wide and 29 tall in these units, with room above
  // and below for the turn tag.
  var VIEW = "-13.2 -16.4 26.4 32.8";
  var ASPECT = 32.8 / 26.4;
  var VIEW_HALF_W = 13.2;
  var TAG_FONT = 0.9;

  function svgEl(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Unrotated position of each hole, and of each tip.
  var BASE = R.holes.map(function (h) { return { x: SQ3 * (h.q + h.r / 2), y: 1.5 * h.r }; });
  var TIP_BASE = R.TIPS.map(function (t) { return { x: SQ3 * (t[0] + t[1] / 2), y: 1.5 * t[1] }; });

  function rotated(list, turns) {
    var a = -turns * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
    return list.map(function (p) {
      // Rounded so the same hole always lands on exactly the same spot.
      return { x: Math.round((p.x * c - p.y * s) * 1000) / 1000, y: Math.round((p.x * s + p.y * c) * 1000) / 1000 };
    });
  }

  // Each seat's marble gradient, light from the top left. Defined once per
  // page; the stops read the seat's custom properties.
  var defsDone = false;
  function ensureDefs() {
    if (defsDone) return;
    defsDone = true;
    var holder = svgEl("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute;width:0;height:0" });
    var defs = svgEl("defs", {}, holder);
    for (var s = 0; s < 6; s++) {
      var g = svgEl("radialGradient", { id: "cc-m" + s, cx: "38%", cy: "32%", r: "72%" }, defs);
      svgEl("stop", { offset: "0%", style: "stop-color: var(--s" + s + "-hi)" }, g);
      svgEl("stop", { offset: "34%", style: "stop-color: var(--s" + s + ")" }, g);
      svgEl("stop", { offset: "100%", style: "stop-color: var(--s" + s + "-lo)" }, g);
    }
    document.body.appendChild(holder);
  }

  // A marble at (x, y): shadow, body, shine. `scale` lifts a picked-up one.
  function marble(parent, seat, x, y, cls) {
    var g = svgEl("g", { class: "cc-marble" + (cls ? " " + cls : ""), transform: "translate(" + x + " " + y + ")" }, parent);
    svgEl("ellipse", { class: "cc-shadow", cx: 0.06, cy: 0.18, rx: MARBLE_R, ry: MARBLE_R * 0.9 }, g);
    svgEl("circle", { r: MARBLE_R, fill: "url(#cc-m" + seat + ")" }, g);
    svgEl("ellipse", { class: "cc-shine", cx: -0.21, cy: -0.27, rx: 0.21, ry: 0.13, transform: "rotate(-30 -0.21 -0.27)" }, g);
    return g;
  }

  // The star itself: two triangles drawn as fat rounded outlines, then filled
  // over the top so the seam between them vanishes.
  function drawStar(parent, tips) {
    var k = (12 + 1.6) / 12;
    function tri(points) {
      return points.map(function (p) { return (tips[p].x * k).toFixed(3) + "," + (tips[p].y * k).toFixed(3); }).join(" ");
    }
    var up = tri([0, 2, 4]), down = tri([3, 5, 1]);
    [up, down].forEach(function (pts) { svgEl("polygon", { class: "cc-star-edge", points: pts }, parent); });
    [up, down].forEach(function (pts) { svgEl("polygon", { class: "cc-star", points: pts }, parent); });
  }

  function CCBoard(host, opts) {
    ensureDefs();
    this.host = host;
    this.opts = opts || {};
    this.seats = 2;
    this.turns = 0;
    this.board = null;
    this.marks = {};
    this.anim = null;
    this.reduceMotion = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

    this.el = svgEl("svg", { class: "cc-board", viewBox: VIEW, preserveAspectRatio: "xMidYMid meet", role: "img" });
    this.el.setAttribute("aria-label", "Star board");
    this.gStar = svgEl("g", {}, this.el);
    this.gHoles = svgEl("g", {}, this.el);
    this.gTrail = svgEl("g", {}, this.el);
    this.gDots = svgEl("g", {}, this.el);
    this.gMarbles = svgEl("g", {}, this.el);
    this.gTop = svgEl("g", {}, this.el);
    host.insertBefore(this.el, this.opts.before || null);
    this.layout();
    this.bind();
  }

  // Where everything sits for this table and viewer.
  CCBoard.prototype.layout = function () {
    this.pos = rotated(BASE, this.turns);
    this.tips = rotated(TIP_BASE, this.turns);
    while (this.gStar.firstChild) this.gStar.removeChild(this.gStar.firstChild);
    while (this.gHoles.firstChild) this.gHoles.removeChild(this.gHoles.firstChild);
    drawStar(this.gStar, this.tips);
    var self = this;
    this.pos.forEach(function (p) {
      svgEl("circle", { class: "cc-hole", cx: p.x, cy: p.y, r: HOLE_R }, self.gHoles);
    });
  };

  /**
   * The table: `seats` at it, and `viewerSeat` (whose point goes at the
   * bottom; null for someone not seated, who sees seat 0 there).
   */
  CCBoard.prototype.setTable = function (seats, viewerSeat) {
    var turns = R.pointOf(seats, typeof viewerSeat === "number" ? viewerSeat : 0);
    if (seats === this.seats && turns === this.turns) return;
    this.seats = seats;
    this.turns = turns;
    this.layout();
    this.render(null);
  };

  /**
   * What to show. `board` is the 121-char board string; `marks` is
   * { last: { seat, path } | null, selected: hole | null, targets: [hole],
   *   hint: hole | null, turnSeat: seat | null }; `hop` is { seat, path } to
   * play the marble now at the path's end in along its path.
   */
  CCBoard.prototype.setPosition = function (board, marks, hop) {
    this.board = board;
    this.marks = marks || {};
    this.render(hop || null);
  };

  CCBoard.prototype.render = function (hop) {
    var self = this, pos = this.pos, m = this.marks, board = this.board;
    this.stopAnim();
    [this.gTrail, this.gDots, this.gMarbles, this.gTop].forEach(function (g) {
      while (g.firstChild) g.removeChild(g.firstChild);
    });

    var turn = typeof m.turnSeat === "number" ? m.turnSeat : null;

    if (m.last && m.last.path && m.last.path.length > 1) {
      var pts = m.last.path.map(function (i) { return pos[i].x + "," + pos[i].y; }).join(" ");
      svgEl("polyline", { class: "cc-trail", points: pts, style: "stroke: var(--s" + m.last.seat + ")" }, this.gTrail);
      var from = pos[m.last.path[0]];
      svgEl("circle", { class: "cc-from", cx: from.x, cy: from.y, r: HOLE_R + 0.12, style: "stroke: var(--s" + m.last.seat + ")" }, this.gTrail);
    }

    (m.targets || []).forEach(function (i) {
      svgEl("circle", { class: "cc-dot", cx: pos[i].x, cy: pos[i].y, r: DOT_R }, self.gDots);
    });
    if (typeof m.hint === "number") {
      svgEl("circle", { class: "cc-hint", cx: pos[m.hint].x, cy: pos[m.hint].y, r: MARBLE_R + 0.05 }, this.gTop);
    }

    this.nodes = {};
    if (!board) return;
    var lifted = null;
    for (var i = 0; i < R.SIZE; i++) {
      var c = board.charAt(i);
      if (c === R.EMPTY) continue;
      var seat = Number(c);
      if (i === m.selected) { lifted = i; continue; }
      this.nodes[i] = marble(this.gMarbles, seat, pos[i].x, pos[i].y, "");
    }
    // The picked-up marble last, so it sits over its neighbours, with a ring.
    if (lifted !== null) {
      var p = pos[lifted];
      this.nodes[lifted] = marble(this.gMarbles, Number(board.charAt(lifted)), p.x, p.y - 0.12, "is-lifted");
      this.nodes[lifted].setAttribute("transform", "translate(" + p.x + " " + (p.y - 0.12) + ") scale(1.14)");
      svgEl("circle", { class: "cc-selected", cx: p.x, cy: p.y - 0.12, r: MARBLE_R * 1.14 + 0.14 }, this.gTop);
    }
    if (turn !== null) this.turnTag(turn);
    var label = "Star board";
    if (turn !== null && this.opts.seatName) label += ". " + this.opts.seatName(turn) + " to move";
    if (m.targets && m.targets.length) label += ". " + m.targets.length + " places this marble can go";
    this.el.setAttribute("aria-label", label);

    if (hop && hop.path && hop.path.length > 1) this.hop(hop.path);
  };

  // "Your move" in the player's colour, just past the tip of their starting
  // point: below a point in the lower half, above one in the upper half, so
  // it always sits in open space outside the star, kept inside the board's
  // width. It takes no taps.
  CCBoard.prototype.turnTag = function (seat) {
    var text = this.opts.turnLabel ? this.opts.turnLabel(seat) : "";
    if (!text) return;
    var tip = this.tips[R.pointOf(this.seats, seat)];
    var k = (12 + 1.6) / 12, h = 1.7;
    var g = svgEl("g", { class: "cc-tag" }, this.gTop);
    var rect = svgEl("rect", { height: h, rx: h / 2, y: -h / 2, style: "fill: var(--s" + seat + ")" }, g);
    var t = svgEl("text", { "font-size": TAG_FONT, "dominant-baseline": "central", y: 0.02 }, g);
    t.textContent = text;
    // The real width once it is on the page; an estimate while the board is
    // hidden (it is drawn again when shown).
    var len = 0;
    try { len = t.getComputedTextLength(); } catch (_) {}
    if (!(len > 0)) len = text.length * TAG_FONT * 0.6;
    var w = h + 0.25 + len + 0.75;
    var x = Math.max(-VIEW_HALF_W + w / 2 + 0.1, Math.min(VIEW_HALF_W - w / 2 - 0.1, tip.x * k));
    var y = tip.y * k + (tip.y > 0 ? 1.7 : -1.7);
    g.setAttribute("transform", "translate(" + x.toFixed(3) + " " + y.toFixed(3) + ")");
    rect.setAttribute("x", (-w / 2).toFixed(3));
    rect.setAttribute("width", w.toFixed(3));
    t.setAttribute("x", (-w / 2 + h + 0.25).toFixed(3));
    var dot = marble(g, seat, 0, 0, "cc-tag-marble");
    dot.setAttribute("transform", "translate(" + (-w / 2 + h / 2).toFixed(3) + " 0) scale(0.8)");
  };

  // Play the marble now at the path's end in from the path's start, hop by
  // hop. A timer finishes it regardless, in case frames stop coming (a hidden
  // tab), so the marble can't be left anywhere but where it belongs.
  CCBoard.prototype.hop = function (path) {
    var node = this.nodes[path[path.length - 1]];
    if (!node || this.reduceMotion) return;
    var pos = this.pos, self = this;
    var jump = path.length > 2 || R.hexDist(path[0], path[1]) === 2;
    var each = jump ? HOP_MS : STEP_MS;
    var end = pos[path[path.length - 1]];
    var anim = { node: node, done: false };
    this.anim = anim;
    this.gMarbles.appendChild(node); // on top while it travels
    node.classList.add("is-moving");
    var t0 = null;
    function frame(now) {
      if (anim.done) return;
      if (t0 === null) t0 = now;
      var t = (now - t0) / each;
      var k = Math.min(path.length - 2, Math.floor(t));
      var f = Math.min(1, t - k);
      if (t >= path.length - 1) { finish(); return; }
      var a = pos[path[k]], b = pos[path[k + 1]];
      var e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      var lift = Math.sin(Math.PI * f) * (jump ? 0.9 : 0.35);
      var x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - lift;
      node.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + (1 + lift * 0.16) + ")");
      if (self.opts.onHop && Math.floor(t) !== anim.k) { anim.k = Math.floor(t); if (anim.k > 0) self.opts.onHop(anim.k); }
      root.requestAnimationFrame(frame);
    }
    function finish() {
      if (anim.done) return;
      anim.done = true;
      clearTimeout(anim.timer);
      node.setAttribute("transform", "translate(" + end.x + " " + end.y + ")");
      node.classList.remove("is-moving");
      if (self.opts.onHop) self.opts.onHop(path.length - 1);
      if (self.anim === anim) self.anim = null;
    }
    anim.finish = finish;
    anim.timer = setTimeout(finish, each * (path.length - 1) + 400);
    node.setAttribute("transform", "translate(" + pos[path[0]].x + " " + pos[path[0]].y + ")");
    root.requestAnimationFrame(frame);
  };

  CCBoard.prototype.stopAnim = function () {
    if (this.anim && this.anim.finish) this.anim.finish();
    this.anim = null;
  };

  CCBoard.prototype.moving = function () {
    return !!this.anim;
  };

  // The box sets the size; the SVG scales to fit it. Records the board's
  // drawn size on the box as --board for what sits around it.
  CCBoard.prototype.resize = function () {
    var w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return false;
    var width = Math.min(w, h / ASPECT);
    this.host.style.setProperty("--board", Math.round(width) + "px");
    return true;
  };

  CCBoard.prototype.holeAt = function (clientX, clientY) {
    var ctm = this.el.getScreenCTM();
    if (!ctm) return null;
    var pt = this.el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var p = pt.matrixTransform(ctm.inverse());
    var best = null, bd = 0.95 * 0.95;
    for (var i = 0; i < this.pos.length; i++) {
      var dx = this.pos[i].x - p.x, dy = this.pos[i].y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  /** Screen point of hole `i`, for tests and the harness. */
  CCBoard.prototype.pointOf = function (i) {
    var ctm = this.el.getScreenCTM(), pt = this.el.createSVGPoint();
    pt.x = this.pos[i].x;
    pt.y = this.pos[i].y;
    var p = pt.matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };

  CCBoard.prototype.bind = function () {
    var self = this;
    this.el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      var i = self.holeAt(e.clientX, e.clientY);
      if (self.opts.onTap) self.opts.onTap(i);
    });
  };

  /** A small, static board for list cards: no taps. */
  CCBoard.preview = function (board, seats, viewerSeat, last) {
    ensureDefs();
    var turns = R.pointOf(seats, typeof viewerSeat === "number" ? viewerSeat : 0);
    var pos = rotated(BASE, turns);
    var svg = svgEl("svg", { class: "cc-preview", viewBox: VIEW, "aria-hidden": "true" });
    drawStar(svgEl("g", {}, svg), rotated(TIP_BASE, turns));
    var holesG = svgEl("g", {}, svg);
    pos.forEach(function (p) { svgEl("circle", { class: "cc-hole", cx: p.x, cy: p.y, r: HOLE_R }, holesG); });
    if (last && last.path && last.path.length > 1) {
      svgEl("polyline", { class: "cc-trail", points: last.path.map(function (i) { return pos[i].x + "," + pos[i].y; }).join(" "),
        style: "stroke: var(--s" + last.seat + ")" }, svg);
    }
    var marbles = svgEl("g", {}, svg);
    for (var i = 0; i < R.SIZE; i++) {
      var c = board.charAt(i);
      if (c !== R.EMPTY) marble(marbles, Number(c), pos[i].x, pos[i].y, "");
    }
    return svg;
  };

  /** One marble on its own, for the art and the player pills. */
  CCBoard.marbleIcon = function (seat, className) {
    ensureDefs();
    var svg = svgEl("svg", { class: className || "cc-icon", viewBox: "-0.85 -0.85 1.7 1.75", "aria-hidden": "true" });
    marble(svg, seat, 0, 0, "");
    return svg;
  };

  CCBoard.ASPECT = ASPECT;
  root.CCBoard = CCBoard;
})(window);
