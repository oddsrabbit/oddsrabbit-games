// The painting screen: the picture fills the screen behind floating controls.
// One finger drags, two pinch; a quick tap fills the region under it.

import { composite, loadArt, Painter, regionAt, type Art } from './art';
import { dayRoundKey } from './catalog';
import { cssFor, filledCount, packColoring, type Fill } from './fills';
import { openPicker } from './picker';
import { loadColors, loadProgress, pushRecent, saveColors, saveProgress, type ColorPrefs, type Progress, type Session } from './store';
import { button, confirmSheet, el, formatDuration, haptic, icon, OR, toast } from './ui';

export interface PaintOptions {
  session: Session;
  onDone(): void;
  onShare(art: Art, fills: ReadonlyArray<Fill | null>): void;
  onGallery(day: number): void;
  /** The player's own picture, and sending for review is available. */
  onSuggest?(): void;
}

interface View { s: number; tx: number; ty: number }
/** One undo step: a tap changes one area, Clear all every filled one. */
type Step = Array<{ id: number; prev: Fill | null; next: Fill | null }>;

const TAP_MOVE = 10;
const TAP_MS = 600;
const MAX_ZOOM = 10;

export async function mountPaint(root: HTMLElement, o: PaintOptions): Promise<() => void> {
  const { session } = o;
  const screen = el('div', 'paint');
  screen.append(el('p', 'boot', 'Opening your page…'));
  root.replaceChildren(screen);

  let art: Art;
  let progress: Progress;
  let colors: ColorPrefs;
  try {
    art = await loadArt(session.slug, 'full');
    [progress, colors] = await Promise.all([loadProgress(session, art.info.regions.length), loadColors()]);
  } catch {
    screen.replaceChildren(el('p', 'boot', 'This page didn’t load. Check your connection and try again.'), button('pill', 'Back', o.onDone));
    return () => {};
  }
  const total = art.info.regions.length;
  let current: Fill = colors.recent[0] ?? '#7fb7e6';
  const undo: Step[] = [];
  const redo: Step[] = [];
  let eyedropper = false;

  // --- stage -----------------------------------------------------------------------
  const stage = el('div', 'stage');
  const board = el('div', 'board');
  board.style.width = `${art.w}px`;
  board.style.height = `${art.h}px`;
  const painter = new Painter(art);
  painter.canvas.className = 'fills';
  const lines = el('img', 'lines');
  lines.src = art.linesUrl;
  lines.onerror = () => { lines.onerror = null; lines.src = art.lineart.src; };
  lines.alt = art.info.title;
  lines.draggable = false;
  const pulse = el('div', 'pulse');
  pulse.hidden = true;
  board.append(painter.canvas, lines, pulse);
  stage.append(board);
  painter.paintAll(progress.fills);

  // --- chrome ------------------------------------------------------------------------
  const bar = el('header', 'paint-bar');
  const status = el('button', 'status-pill');
  status.type = 'button';
  const statusTop = el('span', 'status-top', session.day !== null ? 'Today’s page' : art.info.title);
  const statusSub = el('span', 'status-sub');
  status.append(statusTop, statusSub);
  status.addEventListener('click', () => { if (filledCount(progress.fills) === total) showFinish(); });
  const shareBtn = button('round-btn', icon('share'), () => o.onShare(art, progress.fills), 'Share or save');
  const doneBtn = button('done-btn', 'Done', () => { void flush().then(o.onDone); });
  bar.append(status, el('div', 'grow'), shareBtn, doneBtn);

  const side = el('div', 'side-tools');
  side.append(
    button('round-btn', icon('fit'), () => { fit(); animate(); }, 'Fit to screen'),
    button('round-btn', icon('find'), findEmpty, 'Find an empty area'),
  );
  const clearBtn = button('round-btn', icon('clear'), () => void clearAll(), 'Clear all');
  side.append(clearBtn);

  const toolbar = el('div', 'toolbar');
  const undoBtn = button('tool-btn', icon('undo', 19), () => step(undo, redo, 'prev'), 'Undo');
  const redoBtn = button('tool-btn', icon('redo', 19), () => step(redo, undo, 'next'), 'Redo');
  const strip = el('div', 'strip');
  const moreBtn = button('more-btn', `<span>${icon('plus', 14)}</span>`, togglePicker, 'More colors and fills');
  toolbar.append(undoBtn, strip, redoBtn, moreBtn);

  const pickerHost = el('div', 'picker-host');
  screen.replaceChildren(stage, bar, side, pickerHost, toolbar);

  // --- view: pan and zoom ----------------------------------------------------------
  const view: View = { s: 1, tx: 0, ty: 0 };
  let fitScale = 1;

  function insets() {
    const top = bar.getBoundingClientRect().bottom + 8;
    const bottom = toolbar.getBoundingClientRect().top - 8;
    return { top, bottom: Math.max(top + 100, bottom) };
  }
  function fit() {
    const { top, bottom } = insets();
    const sw = stage.clientWidth;
    fitScale = Math.min((sw - 16) / art.w, (bottom - top) / art.h);
    view.s = fitScale;
    view.tx = (sw - art.w * view.s) / 2;
    view.ty = top + (bottom - top - art.h * view.s) / 2;
    apply();
  }
  function clamp() {
    view.s = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * 0.6, view.s));
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const bw = art.w * view.s;
    const bh = art.h * view.s;
    view.tx = Math.min(sw * 0.6, Math.max(sw * 0.4 - bw, view.tx));
    view.ty = Math.min(sh * 0.6, Math.max(sh * 0.4 - bh, view.ty));
  }
  // The board is its own layer only while it moves: a still one is redrawn at
  // the new zoom, so the vector lines stay sharp instead of a stretched bitmap.
  let settle = 0;
  function apply() {
    clamp();
    board.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    board.classList.add('moving');
    clearTimeout(settle);
    settle = window.setTimeout(() => board.classList.remove('moving'), 250);
  }
  function animate() {
    board.classList.add('animate');
    setTimeout(() => board.classList.remove('animate'), 320);
  }
  function zoomAt(cx: number, cy: number, s: number) {
    const bx = (cx - view.tx) / view.s;
    const by = (cy - view.ty) / view.s;
    view.s = s;
    clamp();
    view.tx = cx - bx * view.s;
    view.ty = cy - by * view.s;
    apply();
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'idle' | 'tap' | 'pan' | 'pinch' | 'done' = 'idle';
  let start = { x: 0, y: 0, t: 0, tx: 0, ty: 0 };
  let pinch = { d: 1, mx: 0, my: 0, s: 1, tx: 0, ty: 0 };
  const local = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  stage.addEventListener('pointerdown', (e) => {
    picker?.close();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      const p = local(e);
      mode = 'tap';
      start = { x: p.x, y: p.y, t: performance.now(), tx: view.tx, ty: view.ty };
    } else if (pointers.size === 2) {
      mode = 'pinch';
      pinch = { ...pinchState(), s: view.s, tx: view.tx, ty: view.ty };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (mode === 'tap' && Math.hypot(p.x - start.x, p.y - start.y) > TAP_MOVE) mode = 'pan';
    if (mode === 'pan') {
      view.tx = start.tx + p.x - start.x;
      view.ty = start.ty + p.y - start.y;
      apply();
    } else if (mode === 'pinch' && pointers.size === 2) {
      const now = pinchState();
      const bx = (pinch.mx - pinch.tx) / pinch.s;
      const by = (pinch.my - pinch.ty) / pinch.s;
      view.s = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * 0.6, (pinch.s * now.d) / pinch.d));
      view.tx = now.mx - bx * view.s;
      view.ty = now.my - by * view.s;
      apply();
    }
  });
  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (mode === 'tap' && e.type === 'pointerup' && performance.now() - start.t < TAP_MS) tap(p.x, p.y);
    // After a pinch, wait for every finger to lift before the next gesture.
    mode = pointers.size ? 'done' : 'idle';
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e as unknown as PointerEvent);
    zoomAt(p.x, p.y, view.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // --- filling -----------------------------------------------------------------------
  let lastTapAt = performance.now();
  function tap(x: number, y: number) {
    const id = regionAt(art, (x - view.tx) / view.s, (y - view.ty) / view.s);
    if (id === null) return;
    if (eyedropper) {
      eyedropper = false;
      stage.classList.remove('dropper');
      const f = progress.fills[id];
      if (f) { setCurrent(f); toast('Picked that fill'); } else toast('That area is still empty');
      return;
    }
    const prev = progress.fills[id] ?? null;
    if (prev === current) return;
    const wasDone = filledCount(progress.fills) === total;
    setRegion(id, current);
    undo.push([{ id, prev, next: current }]);
    redo.length = 0;
    const now = performance.now();
    progress.seconds += Math.min(60, (now - lastTapAt) / 1000);
    lastTapAt = now;
    pushRecent(colors, current);
    void saveColors(colors);
    haptic('light');
    renderChrome();
    if (!wasDone && filledCount(progress.fills) === total) {
      haptic('success');
      setTimeout(showFinish, 350);
    }
  }
  function setRegion(id: number, f: Fill | null) {
    progress.fills[id] = f;
    painter.paint(id, f);
    pulse.hidden = true;
    scheduleSave();
  }
  function step(from: Step[], to: Step[], which: 'prev' | 'next') {
    const s = from.pop();
    if (!s) return;
    for (const c of s) setRegion(c.id, c[which]);
    to.push(s);
    renderChrome();
  }
  async function clearAll() {
    const filled = filledCount(progress.fills);
    if (!filled) return;
    const sure = await confirmSheet('Clear this page?', `All ${filled} colored areas go back to blank. Undo brings them back until you leave the page.`, 'Clear all', 'Keep coloring');
    if (!sure) return;
    const s: Step = [];
    progress.fills.forEach((f, id) => { if (f) s.push({ id, prev: f, next: null }); });
    for (const c of s) setRegion(c.id, null);
    undo.push(s);
    redo.length = 0;
    haptic('light');
    toast('Cleared. Undo brings it back.');
    renderChrome();
  }
  function setCurrent(f: Fill) {
    current = f;
    renderChrome();
  }

  let findCursor = 0;
  function findEmpty() {
    const empty = art.info.regions.filter((r) => !progress.fills[r.id]).sort((a, b) => a.area - b.area);
    if (!empty.length) { toast('Every area is colored'); return; }
    const r = empty[findCursor++ % empty.length]!;
    const { top, bottom } = insets();
    const sw = stage.clientWidth;
    const bw = r.bbox[2] - r.bbox[0] + 1;
    const bh = r.bbox[3] - r.bbox[1] + 1;
    view.s = Math.min(fitScale * 4, Math.max(fitScale, Math.min((sw * 0.5) / bw, ((bottom - top) * 0.5) / bh)));
    view.tx = sw / 2 - r.label[0] * view.s;
    view.ty = (top + bottom) / 2 - r.label[1] * view.s;
    apply();
    animate();
    const size = 90 / view.s;
    Object.assign(pulse.style, { left: `${r.label[0] - size / 2}px`, top: `${r.label[1] - size / 2}px`, width: `${size}px`, height: `${size}px`, borderWidth: `${4 / view.s}px` });
    pulse.hidden = false;
    pulse.classList.remove('go');
    void pulse.offsetWidth;
    pulse.classList.add('go');
  }

  // --- picker ----------------------------------------------------------------------
  let picker: { close(): void } | null = null;
  function togglePicker() {
    if (picker) { picker.close(); return; }
    picker = openPicker(pickerHost, {
      current,
      colors,
      onPick: setCurrent,
      onFavsChange: () => void saveColors(colors),
      onEyedropper: () => {
        picker?.close();
        eyedropper = true;
        stage.classList.add('dropper');
        toast('Tap an area to pick its fill');
      },
      onClose: () => { picker = null; moreBtn.setAttribute('aria-expanded', 'false'); },
    });
    moreBtn.setAttribute('aria-expanded', 'true');
  }

  function renderChrome() {
    const filled = filledCount(progress.fills);
    statusSub.textContent = filled === total ? 'Finished · tap to post' : `${filled} of ${total} areas`;
    if (session.day === null && filled === total) statusSub.textContent = 'Finished';
    undoBtn.disabled = !undo.length;
    clearBtn.disabled = filled === 0;
    redoBtn.disabled = !redo.length;
    strip.replaceChildren();
    const list = [current, ...colors.recent.filter((f) => f !== current)].slice(0, 6);
    for (const f of list) {
      const b = button(f === current ? 'swatch current' : 'swatch', '', () => setCurrent(f), f === current ? 'Current fill' : 'Use this fill');
      b.style.background = cssFor(f, 8);
      strip.append(b);
    }
  }

  // --- saving ------------------------------------------------------------------------
  let saveTimer = 0;
  let saving: Promise<void> = Promise.resolve();
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void flush(), 700);
  }
  function flush(): Promise<void> {
    clearTimeout(saveTimer);
    saving = saving.then(() => saveProgress(session, progress)).catch(() => {});
    return saving;
  }
  const offPause = OR().lifecycle.on('pause', () => void flush());
  const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
  document.addEventListener('visibilitychange', onHide);

  // --- finishing ---------------------------------------------------------------------
  function showFinish() {
    if (screen.querySelector('.sheet-wrap')) return;
    const wrap = el('div', 'sheet-wrap');
    const sheet = el('div', 'sheet finish');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Finished');
    const pic = composite(art, progress.fills, 560);
    pic.className = 'finish-pic';
    const actions = el('div', 'sheet-actions');
    const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
    sheet.append(
      el('h2', '', 'Finished!'),
      el('p', 'muted', `All ${total} areas in ${formatDuration(progress.seconds)}`),
      pic,
      actions,
    );
    if (session.day !== null) {
      const day = session.day;
      if (progress.posted) {
        actions.append(button('primary-btn', 'See today’s gallery', () => { close(); void flush().then(() => o.onGallery(day)); }));
      } else {
        const post = button('primary-btn', 'Post to today’s gallery', () => void postToday(day, post, close));
        actions.append(post);
      }
    }
    if (o.onSuggest) {
      const suggest = o.onSuggest;
      actions.append(button('secondary-btn', 'Share with everyone', () => { close(); suggest(); }));
    }
    actions.append(
      button('secondary-btn', `${icon('share')} Share`, () => o.onShare(art, progress.fills)),
      button('text-btn', 'Keep coloring', close),
    );
    wrap.append(sheet);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    screen.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
  }

  async function postToday(day: number, btn: HTMLButtonElement, close: () => void) {
    if (!OR().user) {
      if (OR().capabilities.has('actions.requestSignIn')) void OR().actions.requestSignIn('Sign in to post your page to today’s gallery');
      else toast('Sign in to post to the gallery');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Posting…';
    try {
      await OR().scores.submit({
        roundKey: dayRoundKey(day),
        // Areas colored. The gallery orders by posting time, not this.
        score: total,
        metadata: { v: 1, slug: session.slug, ...packColoring(progress.fills), t: Math.round(progress.seconds) },
      });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      if (code !== 'scores/already-submitted') {
        btn.disabled = false;
        btn.textContent = 'Post to today’s gallery';
        toast('Couldn’t post. Try again in a moment.');
        return;
      }
    }
    progress.posted = true;
    await flush();
    haptic('success');
    close();
    o.onGallery(day);
  }

  // --- go ------------------------------------------------------------------------------
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  renderChrome();
  requestAnimationFrame(fit);
  // Back on a finished daily that wasn't posted: offer it straight away.
  if (session.day !== null && !progress.posted && filledCount(progress.fills) === total) setTimeout(showFinish, 400);

  return () => {
    void flush();
    offPause();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('resize', onResize);
    picker?.close();
  };
}
