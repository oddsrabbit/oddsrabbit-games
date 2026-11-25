// Bubble Merge: drop bubbles into the box; two of the same colour touching
// become one bubble of the next size up. The game ends when the pile stays over the
// box's rim for a couple of seconds.
(function () {
  const RM = window.RM;
  const { PIECES, POINTS, GIANT_BONUS, World, Sound, SCENES, SCENE_ORDER, Scores } = RM;
  const OR = window.OddsRabbit || null;

  // ---------- world layout (world units, y down) ----------
  const W = 400;          // the box's inside width
  const RIM = 84;         // the box's rim: the line the pile mustn't stay over
  const FLOOR = 624;      // the box's floor (was 564 before 2026-11-18; same on
                          // every screen so leaderboard scores stay comparable)
  const WALL = 16;        // wall and floor thickness, drawn outside the play area
  const HOLD_Y = RIM - 48; // where the next bubble waits before it drops
  // The one after it is in the NEXT pill in the header, a little bigger per
  // size but always small (CSS px radius). On a drop it flies from the pill
  // to the aim point, growing to full size, and the pill refills with a pop.
  const nextR = (t) => 8.5 + t * 1.1;
  const HANDOFF = 0.32; // seconds for that flight, inside the drop cooldown
  const VIEW = { x0: -WALL, x1: W + WALL, y0: -16, y1: FLOOR + WALL };
  const VIEW_W = VIEW.x1 - VIEW.x0;
  const VIEW_H = VIEW.y1 - VIEW.y0;

  const DROP_COOLDOWN = 0.5; // seconds before the next bubble can drop
  const GRACE = 1.0;         // a new bubble may sit over the rim this long
  const OVER_LIMIT = 2.2;    // seconds over the rim before the game is over
  const DROP_WEIGHTS = [32, 26, 20, 13, 9]; // the five smallest sizes drop
  const STORE_KEY = 'bubble-merge:v1';
  // Saves from before the rename (Rabbit Merge, 2026-11-16) carry over once.
  const LEGACY_KEY = 'rabbit-merge:v2';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const board = $('board');
  const field = $('field');
  const ctx = board.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const nextEl = $('next');
  const hud = $('hud');
  const toastEl = $('toast');
  const overlay = $('overlay');

  const haptic = (kind) => { try { if (OR && OR.actions) OR.actions.haptic(kind).catch(() => {}); } catch (e) { /* no host */ } };

  // ---------- saved data ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* private mode */ } };
  if (!SCENES[saved.scene]) saved.scene = 'jar';
  // The best now lives in js/scores.js, with the boards; carry an older one over.
  if (saved.best > Scores.getBest()) Scores.recordScore(saved.best);
  delete saved.best;
  saved.found = Array.isArray(saved.found) && saved.found.length === PIECES.length ? saved.found : PIECES.map((_, i) => i === 0);
  Sound.setMuted(!!saved.muted);

  // ---------- game state ----------
  let world, score, cur, next, aimX, dropReadyAt, phase, clock, effects, biggest, danger, dropsMade;
  // When the NEXT pill's bubble appears (for its pop-in), when the last drop
  // was, and where the handoff flight starts ({ x, y, k } in world units).
  let nextBorn = 0, dropAt = 0, handFrom = null;

  function randomTier() {
    const total = DROP_WEIGHTS.reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    for (let i = 0; i < DROP_WEIGHTS.length; i++) { x -= DROP_WEIGHTS[i]; if (x < 0) return i; }
    return 0;
  }

  function newGame(restore) {
    world = new World(W, FLOOR);
    score = 0; clock = 0; effects = []; biggest = 0; danger = 0; dropsMade = 0;
    cur = randomTier(); next = randomTier();
    aimX = W / 2; dropReadyAt = 0; phase = 'play';
    if (restore && Array.isArray(restore.bodies)) {
      for (const s of restore.bodies) {
        if (!(s.t >= 0 && s.t < PIECES.length)) continue;
        const b = world.add(s.t, s.x, s.y, PIECES[s.t].r);
        b.a = s.a || 0; b.age = GRACE;
        biggest = Math.max(biggest, s.t);
      }
      score = restore.score || 0;
      if (restore.cur >= 0 && restore.cur < 5) cur = restore.cur;
      if (restore.next >= 0 && restore.next < 5) next = restore.next;
      dropsMade = restore.drops || 0;
    }
    nextBorn = 0; dropAt = 0; handFrom = null;
    updateHud();
  }

  function saveGame() {
    if (phase === 'over') { delete saved.game; persist(); return; }
    saved.game = {
      bodies: world.bodies.map((b) => ({ t: b.tier, x: round1(b.x), y: round1(b.y), a: round1(b.a) })),
      score, cur, next, drops: dropsMade,
    };
    persist();
  }
  const round1 = (v) => Math.round(v * 10) / 10;

  // ---------- dropping and merging ----------
  function clampAim(x) {
    const r = PIECES[cur].r;
    return Math.max(r, Math.min(W - r, x));
  }

  function drop() {
    if (phase !== 'play' || clock < dropReadyAt) return;
    Sound.unlock();
    const x = clampAim(aimX);
    const b = world.add(cur, x, HOLD_Y, PIECES[cur].r);
    b.vy = 60;
    handFrom = nextInWorld();
    cur = next;
    next = randomTier();
    dropAt = clock;
    nextBorn = clock + HANDOFF;
    dropReadyAt = clock + DROP_COOLDOWN;
    dropsMade++;
    Sound.drop();
    if (dropsMade === 1) hideToast();
  }

  function processMerges() {
    if (!world.touching.length) return;
    const used = new Set();
    for (const [a, b] of world.touching) {
      if (used.has(a) || used.has(b) || a.gone || b.gone || a.tier !== b.tier) continue;
      used.add(a); used.add(b);
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      world.remove(a); world.remove(b);
      if (a.tier === PIECES.length - 1) {
        // Two of the biggest: they pop and leave the box.
        score += GIANT_BONUS;
        burst(x, y, 18, 'heart', PIECES[a.tier].r);
        burst(x, y, 24, 'puff', PIECES[a.tier].r * 1.6, PIECES[a.tier].css);
        floatText(x, y, '+' + GIANT_BONUS);
        toast('Two giant bubbles popped! +' + GIANT_BONUS, 2600);
        Sound.discover();
        haptic('success');
        continue;
      }
      const t = a.tier + 1;
      const nb = world.add(t, x, y, PIECES[t].r, { r0: PIECES[a.tier].r });
      nb.vx = (a.vx + b.vx) / 2;
      nb.vy = Math.min((a.vy + b.vy) / 2, 0) - 40;
      nb.w = (a.w + b.w) / 2;
      nb.age = 0.4;
      score += POINTS[t];
      biggest = Math.max(biggest, t);
      burst(x, y, 6 + t, 'puff', PIECES[t].r, PIECES[t].css);
      floatText(x, y - PIECES[t].r * 0.4, '+' + POINTS[t]);
      Sound.merge(t);
      bumpScore();
      if (!saved.found[t]) {
        saved.found[t] = true;
        persist();
        toast('New bubble! ' + PIECES[t].name, 2400);
        Sound.discover();
        haptic('success');
      } else {
        haptic('light');
      }
    }
    updateHud();
  }

  function checkOver(dt) {
    let worst = 0, near = false;
    for (const b of world.bodies) {
      const top = b.y - b.r;
      if (b.age > GRACE && top < RIM) b.over = (b.over || 0) + dt;
      else b.over = Math.max(0, (b.over || 0) - dt * 2);
      if (b.age > GRACE && top < RIM + 36) near = true;
      worst = Math.max(worst, b.over);
    }
    danger = worst > 0 ? Math.min(1, 0.4 + worst / OVER_LIMIT) : near ? 0.25 : 0;
    if (worst > OVER_LIMIT) gameOver();
  }

  function gameOver() {
    phase = 'over';
    const result = Scores.recordScore(score);
    const newBest = result.isNewBest;
    lastResult = { score, isNewBest: newBest };
    delete saved.game;
    persist();
    Sound.over();
    haptic('error');
    updateHud();
    setTimeout(() => showOver(newBest), 700);
  }

  // ---------- effects ----------
  function burst(x, y, n, kind, r, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 160;
      effects.push({
        kind, x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.7 + Math.random() * 0.4, t: 0, size: kind === 'heart' ? 10 + Math.random() * 6 : 5 + Math.random() * 6,
        color: color || '#fff',
      });
    }
  }
  function floatText(x, y, text) { effects.push({ kind: 'text', x, y, vx: 0, vy: -50, life: 0.9, t: 0, text }); }

  function stepEffects(dt) {
    for (const e of effects) {
      e.t += dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.kind !== 'text') { e.vx *= 0.92; e.vy = e.vy * 0.92 + 30 * dt; }
    }
    effects = effects.filter((e) => e.t < e.life);
  }

  // ---------- HUD and panel ----------
  // Same chip pair as 2048, snake, match3 and flappy: the figure is a text
  // node, the label is CSS, and aria-label says both.
  function setChip(chip, label, n) {
    chip.textContent = String(n);
    chip.setAttribute('aria-label', label + ' ' + n);
  }
  function updateHud() {
    setChip(scoreEl, 'Score', score);
    setChip(bestEl, 'Best', Math.max(Scores.getBest(), score));
  }
  function bumpScore() {
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
  }

  const dpr = () => Math.min(3, window.devicePixelRatio || 1);

  /** Draws bubble `tier` into a canvas, `R` CSS px radius, centred at (cx, cy). */
  function paintIcon(canvas, tier, R, cx, cy) {
    const d = dpr();
    const c = canvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.translate(cx, cy);
    RM.drawPiece(c, tier, R);
  }

  let toastTimer = 0;
  /** A pill under the HUD. `ms` Infinity keeps it up until hideToast(). */
  function toast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    if (ms !== Infinity) toastTimer = setTimeout(hideToast, ms || 1800);
  }
  function hideToast() { clearTimeout(toastTimer); toastEl.classList.remove('show'); }

  // ---------- overlays ----------
  function openOverlay(title, bodyNodes, buttons) {
    $('ov-title').textContent = title;
    const body = $('ov-body');
    body.replaceChildren(...bodyNodes);
    const row = $('ov-buttons');
    row.replaceChildren(...buttons.map(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    }));
    overlay.hidden = false;
    const first = row.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeOverlay() { overlay.hidden = true; }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function stat(label, value, isNew) {
    const s = el('div', 'stat' + (isNew ? ' new' : ''));
    s.append(el('span', 'label', label), el('span', 'v', value));
    return s;
  }

  // The Leaderboard button only exists where the host can serve a global
  // board, as in every other game; js/scores.js decides.
  function leaderboardButton() {
    return Scores.leaderboardSupported() ? [['Leaderboard', '', () => Scores.openLeaderboard()]] : [];
  }

  function scenePicker() {
    const wrap = el('div', 'setting');
    wrap.append(el('span', 'label', 'Scene'));
    const row = el('div', 'seg');
    for (const id of SCENE_ORDER) {
      const b = el('button', 'seg-btn');
      b.type = 'button';
      b.textContent = SCENES[id].name;
      b.setAttribute('aria-pressed', String(saved.scene === id));
      b.addEventListener('click', () => {
        setScene(id);
        for (const o of row.children) o.setAttribute('aria-pressed', String(o === b));
      });
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }

  function showMenu() {
    if (phase !== 'play') return;
    phase = 'paused';
    const soundLabel = () => 'Sound: ' + (Sound.muted ? 'off' : 'on');
    const p = el('p', null, 'Drag to aim and let go to drop. Two bubbles of the same colour touching become one of the next size up. If the pile stays over the dashed line, the game is over.');
    openOverlay('Paused', [scenePicker(), p], [
      ['Resume', 'primary', () => { closeOverlay(); phase = 'play'; }],
      ...leaderboardButton(),
      [soundLabel(), '', (e) => {
        Sound.setMuted(!Sound.muted);
        saved.muted = Sound.muted; persist();
        e.currentTarget.textContent = soundLabel();
      }],
      ['New game', '', () => { closeOverlay(); delete saved.game; persist(); newGame(); }],
    ]);
  }

  // Game over, with the other games' wording and buttons: SCORE, NEW BEST!,
  // then Try again, Share and (where the host serves one) Leaderboard.
  let lastResult = null;
  function showOver(newBest) {
    const pic = document.createElement('canvas');
    const d = dpr();
    pic.width = pic.height = 120 * d;
    paintIcon(pic, biggest, 40, 60, 60);
    const final = el('p', 'final-score', 'SCORE ' + score);
    const note = el('p', 'new-best-note', newBest ? 'NEW BEST!' : 'BEST ' + Scores.getBest());
    if (newBest) note.classList.add('is-new');
    openOverlay('GAME OVER', [final, note, pic, el('p', null, 'Biggest bubble: <b>' + PIECES[biggest].name + '</b>')], [
      ['Try again', 'primary', () => { closeOverlay(); newGame(); }],
      ['Share', '', () => Scores.openShare(lastResult, toast)],
      ...leaderboardButton(),
    ]);
  }

  // ---------- input ----------
  let aiming = false;
  function toWorldX(clientX) {
    const r = board.getBoundingClientRect();
    return (clientX - r.left - view.ox) / view.s;
  }
  board.addEventListener('pointerdown', (e) => {
    if (phase !== 'play') return;
    aiming = true;
    try { board.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    aimX = clampAim(toWorldX(e.clientX));
    Sound.unlock();
  });
  board.addEventListener('pointermove', (e) => {
    if (phase !== 'play') return;
    if (aiming || e.pointerType === 'mouse') aimX = clampAim(toWorldX(e.clientX));
  });
  const release = (e) => {
    if (!aiming) return;
    aiming = false;
    aimX = clampAim(toWorldX(e.clientX));
    drop();
  };
  board.addEventListener('pointerup', release);
  board.addEventListener('pointercancel', () => { aiming = false; });

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (!overlay.hidden) {
      if (e.key === 'Escape' && phase === 'paused') { closeOverlay(); phase = 'play'; }
      return;
    }
    if (e.key === 'Escape' || e.key === 'p') { showMenu(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keys.add(e.key); e.preventDefault(); }
    if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); drop(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  $('menu-btn').addEventListener('click', showMenu);
  const lbBtn = $('lb-btn');
  lbBtn.addEventListener('click', () => Scores.openLeaderboard());
  Scores.onChange(() => { lbBtn.hidden = !Scores.leaderboardSupported(); updateHud(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveGame(); if (phase === 'play') showMenu(); }
  });
  window.addEventListener('pagehide', saveGame);

  // ---------- rendering ----------
  const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };
  function resize() {
    const r = field.getBoundingClientRect();
    const d = dpr();
    view.w = r.width; view.h = r.height;
    board.width = Math.round(r.width * d);
    board.height = Math.round(r.height * d);
    nextEl.width = nextEl.height = Math.round(28 * d);
    // The scene fills the screen and the HUD floats over it, so the box fits
    // in what the HUD leaves, centred in any spare height (tall phones).
    // Aiming reads only the finger's x anywhere on the screen, so the box
    // needn't sit low for the thumbs.
    const top = hud.getBoundingClientRect().bottom - r.top + 4;
    const bottom = cssPx('--oddsrabbit-safe-bottom') + 10;
    const avail = r.height - top - bottom;
    const s = Math.min(r.width / VIEW_W, avail / VIEW_H);
    const spare = Math.max(0, avail - VIEW_H * s);
    view.s = s;
    view.ox = (r.width - VIEW_W * s) / 2 - VIEW.x0 * s;
    view.oy = top + spare / 2 - VIEW.y0 * s;
    RM.clearSprites();
    buildSceneLayers();
  }
  new ResizeObserver(resize).observe(field);
  function cssPx(name) {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v) ? 0 : v;
  }

  // The scene's still parts, drawn once per size and scene: the background
  // with the inside of the box, and the box's walls in front of the bubbles.
  const backLayer = document.createElement('canvas');
  const frontLayer = document.createElement('canvas');
  function buildSceneLayers() {
    const scene = SCENES[saved.scene];
    const v = { w: view.w, h: view.h, s: view.s, ox: view.ox, oy: view.oy, d: dpr(), W, RIM, FLOOR, WALL, x0: VIEW.x0, x1: VIEW.x1 };
    for (const [layer, draw] of [[backLayer, scene.back], [frontLayer, scene.front]]) {
      layer.width = board.width; layer.height = board.height;
      const x = layer.getContext('2d');
      x.clearRect(0, 0, layer.width, layer.height);
      draw(x, v);
    }
    field.style.background = scene.field;
    document.body.style.background = scene.field; // the host reads it for the status bar
    document.body.dataset.scene = saved.scene;
  }
  function setScene(id) {
    if (!SCENES[id] || id === saved.scene) return;
    saved.scene = id;
    persist();
    buildSceneLayers();
  }

  function drawScene() {
    const d = dpr();
    const { s, ox, oy } = view;
    const scene = SCENES[saved.scene];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backLayer, 0, 0);

    // World space from here.
    ctx.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
    const px = 1 / s; // one CSS pixel in world units

    // The rim line. Turns red and pulses when the pile is over it.
    const pulse = danger > 0.3 ? 0.5 + 0.5 * Math.sin(clock * 12) : 0;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = danger > 0.3 ? `rgba(230, 70, 80, ${0.6 + 0.4 * pulse})` : danger > 0 ? 'rgba(235, 130, 60, 0.75)' : scene.rim;
    ctx.beginPath(); ctx.moveTo(0, RIM); ctx.lineTo(W, RIM); ctx.stroke();
    ctx.setLineDash([]);

    // The aim guide and the waiting bubble.
    if ((phase === 'play' || phase === 'paused') && clock >= dropReadyAt) {
      const x = clampAim(aimX);
      ctx.strokeStyle = scene.guide;
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(x, HOLD_Y + PIECES[cur].r); ctx.lineTo(x, FLOOR); ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const b of world.bodies) drawBody(b, s, d);

    // The held bubble, over the pile. During the drop cooldown it's the one
    // flying in from the NEXT pill.
    if (phase === 'play' || phase === 'paused') {
      const x = clampAim(aimX), y = HOLD_Y + Math.sin(clock * 3) * 1.5;
      if (clock >= dropReadyAt) drawPieceAt(cur, x, y, 1, s, d);
      else if (handFrom) {
        const e = 1 - Math.pow(1 - Math.min(1, (clock - dropAt) / HANDOFF), 3);
        const lerp = (a, b) => a + (b - a) * e;
        drawPieceAt(cur, lerp(handFrom.x, x), lerp(handFrom.y, y), lerp(handFrom.k, 1), s, d);
      }
    }

    // The box's walls, in front of the bubbles.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(frontLayer, 0, 0);
    ctx.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);

    // Effects.
    for (const e of effects) {
      const k = 1 - e.t / e.life;
      if (e.kind === 'text') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = '900 20px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5 * px;
        ctx.strokeStyle = 'rgba(63, 53, 80, 0.85)';
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(e.text, e.x, e.y);
      } else if (e.kind === 'heart') {
        ctx.globalAlpha = k;
        heart(e.x, e.y, e.size, '#e4566f');
      } else {
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (0.6 + k * 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(59,41,34,0.35)';
        ctx.lineWidth = 1.5 * px;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // The NEXT pill: empty while its bubble is flying to the aim point, then
  // the new one pops in (ease out, slight overshoot). Repainted only while
  // that's changing.
  let nextPainted = '';
  function paintNext() {
    const t = (clock - nextBorn) / 0.25;
    const key = t < 0 ? 'empty' : t >= 1 ? next + ':' + nextEl.width : '';
    if (key && key === nextPainted) return;
    nextPainted = key;
    // At t = 0 the curve is 0 give or take rounding (-2e-15), and a negative
    // radius makes arc() throw, so clamp it.
    const pop = t >= 1 ? 1 : Math.max(0, 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2));
    if (t >= 0) paintIcon(nextEl, next, nextR(next) * pop, 14, 14);
    else nextEl.getContext('2d').clearRect(0, 0, nextEl.width, nextEl.height);
  }

  // Where the pill's bubble is, in world units, for the handoff to start from.
  function nextInWorld() {
    const f = field.getBoundingClientRect(), r = nextEl.getBoundingClientRect();
    const cx = r.left + r.width / 2 - f.left, cy = r.top + r.height / 2 - f.top;
    return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s, k: nextR(next) / (PIECES[next].r * view.s) };
  }

  function drawBody(b, s, d) {
    drawPieceAt(b.tier, b.x, b.y, b.r / b.rTarget, s, d, b);
  }

  // Bubbles are drawn upright (their light is fixed to the screen). Near the
  // rim when the game is in danger, they blink.
  function drawPieceAt(tier, x, y, scale, s, d, body) {
    const R = PIECES[tier].r;
    const img = RM.sprite(tier, R * s * d);
    const size = (img.width / (s * d)) * scale; // world units
    ctx.save();
    if (body && danger > 0.3 && body.y - body.r < RIM + 20) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(clock * 14);
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }

  function heart(x, y, sz, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + sz * 0.35);
    ctx.bezierCurveTo(x - sz, y - sz * 0.3, x - sz * 0.4, y - sz, x, y - sz * 0.45);
    ctx.bezierCurveTo(x + sz * 0.4, y - sz, x + sz, y - sz * 0.3, x, y + sz * 0.35);
    ctx.fill();
  }

  // ---------- loop ----------
  const STEP = 1 / 60;
  let acc = 0, last = performance.now(), sinceSave = 0;
  function tick() {
    clock += STEP;
    if (keys.has('ArrowLeft')) aimX = clampAim(aimX - 260 * STEP);
    if (keys.has('ArrowRight')) aimX = clampAim(aimX + 260 * STEP);
    world.step(STEP);
    if (phase === 'play') { processMerges(); checkOver(STEP); }
    stepEffects(STEP);
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (phase === 'play' || phase === 'over') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        acc -= STEP; n++;
        tick();
      }
      if (n === 5) acc = 0;
      sinceSave += dt;
      if (phase === 'play' && sinceSave > 2) { sinceSave = 0; saveGame(); }
    } else {
      acc = 0;
    }
    drawScene();
    paintNext();
    requestAnimationFrame(frame);
  }

  // ---------- start ----------
  newGame(saved.game);
  resize();
  if (dropsMade === 0) toast('Drag to aim, let go to drop', Infinity);
  requestAnimationFrame(frame);

  // For dev tools and screenshots.
  RM.debug = {
    get world() { return world; },
    get phase() { return phase; },
    drop, setAim: (x) => { aimX = clampAim(x); },
    /** Runs n fixed steps at once (headless browsers barely animate). */
    run(n) { for (let i = 0; i < n; i++) { if (phase === 'play' || phase === 'over') tick(); if (i % 30 === 0 && phase === 'play' && clock >= dropReadyAt && this.auto) { aimX = clampAim(40 + Math.random() * 320); drop(); } } drawScene(); },
    auto: false,
    get score() { return score; },
    fill(n) { for (let i = 0; i < n; i++) { const t = randomTier(); world.add(t, 40 + Math.random() * 320, RIM + 40 + (i % 8) * 40, PIECES[t].r).age = 2; } },
    spawn(t, x, y) { const b = world.add(t, x, y, PIECES[t].r); b.age = 2; saved.found[t] = true; return b; },
  };
})();
