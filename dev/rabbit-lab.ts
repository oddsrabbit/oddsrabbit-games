// Rabbit lab: the game's own drawRabbit with TUNE (art/rabbit.ts) on sliders,
// for placing her head and outfits. Built by `npm run build` into
// dist/dev/rabbit-lab.js, which dev/rabbit-lab.html loads. Not shipped.

import type { PixelGrid } from '../src/art/pixels';
import { drawRabbit, RABBIT_H, RABBIT_W, TUNE, type Dress, type Face, type Frame } from '../src/art/rabbit';
import { OUTFITS } from '../src/extras';
import { COATS, EARS, type Coat, type Ears } from '../src/sim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'rabbit-lab:tune';
const ORIGINAL = JSON.parse(JSON.stringify(TUNE)) as typeof TUNE;
type Kind = 'top' | 'ear' | 'chin';

// the slot TUNE uses for each outfit; drawn once to find which anchor moves it
const kindOf = new Map<string, Kind>();

try {
  // kept only while rabbit.ts still has the TUNE it was tuned from
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (saved && JSON.stringify(saved.base) === JSON.stringify(ORIGINAL)) Object.assign(TUNE, saved.tune);
} catch { /* no storage, keep defaults */ }

const fill = (sel: HTMLSelectElement, values: readonly string[], labels?: string[]) => {
  values.forEach((v, i) => sel.append(new Option(labels?.[i] ?? v, v)));
};
fill($('coat'), COATS);
fill($('ears'), EARS);
const heads = OUTFITS.filter((o) => o.slot === 'head'), necks = OUTFITS.filter((o) => o.slot === 'neck');
fill($('head'), heads.map((o) => o.id), heads.map((o) => o.name));
fill($('neck'), necks.map((o) => o.id), necks.map((o) => o.name));
($('neck') as HTMLSelectElement).value = necks[0]?.id ?? '';

const pose = () => ({
  coat: ($('coat') as HTMLSelectElement).value as Coat,
  ears: ($('ears') as HTMLSelectElement).value as Ears,
  face: ($('face') as HTMLSelectElement).value as Face,
  frame: Number(($('frame') as HTMLSelectElement).value) as Frame,
  head: ($('head') as HTMLSelectElement).value || null,
  neck: ($('neck') as HTMLSelectElement).value || null,
});

function paint(c: HTMLCanvasElement, g: PixelGrid, scale: number, grid = false): void {
  c.width = g.w * scale; c.height = g.h * scale;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const p = g.px[y]![x]!;
    if (!p[3]) continue;
    ctx.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},${p[3] / 255})`;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  if (grid && scale >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= g.w; x++) { ctx.moveTo(x * scale + 0.5, 0); ctx.lineTo(x * scale + 0.5, g.h * scale); }
    for (let y = 0; y <= g.h; y++) { ctx.moveTo(0, y * scale + 0.5); ctx.lineTo(g.w * scale, y * scale + 0.5); }
    ctx.stroke();
  }
}

/** Draw with some other TUNE for a moment (the "original" view). */
function withTune<T>(t: typeof TUNE, f: () => T): T {
  const now = JSON.parse(JSON.stringify(TUNE));
  Object.assign(TUNE, JSON.parse(JSON.stringify(t)));
  try { return f(); } finally { Object.assign(TUNE, now); }
}

// Which anchor an outfit uses: nudge that anchor and see whether it moves.
function findKinds(): void {
  const saved = JSON.parse(JSON.stringify(TUNE));
  for (const o of OUTFITS) {
    const dress: Dress = { [o.slot]: o.id };
    for (const k of ['top', 'ear', 'chin'] as Kind[]) {
      Object.assign(TUNE, JSON.parse(JSON.stringify(ORIGINAL)));
      const a = JSON.stringify(drawRabbit('snow', 'content', 0, dress).px);
      TUNE[k] = [0, 3];
      const b = JSON.stringify(drawRabbit('snow', 'content', 0, dress).px);
      if (a !== b) { kindOf.set(o.id, k); break; }
    }
  }
  Object.assign(TUNE, saved);
}

function knob(parent: HTMLElement, label: string, get: () => number, set: (v: number) => void, min = -8, max = 8, step = 1): void {
  const row = document.createElement('label'); row.className = 'knob';
  const name = document.createElement('span'); name.textContent = label;
  const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
  const out = document.createElement('output');
  const show = () => { input.value = String(get()); out.textContent = String(get()); };
  input.addEventListener('input', () => { set(Number(input.value)); out.textContent = input.value; changed(); });
  row.append(name, input, out); parent.append(row); show();
}

const KIND_NAME: Record<Kind, string> = { top: 'hats (top)', ear: 'clips (ear)', chin: 'neck (chin)' };

function buildKnobs(): void {
  const head = $('k-head'); head.replaceChildren();
  knob(head, 'head y', () => TUNE.headY, (v) => { TUNE.headY = v; });
  const hint = document.createElement('div'); hint.className = 'hint';
  hint.textContent = 'Moves her head (and everything worn on it) up or down on her body while awake.';
  head.append(hint);

  const belly = $('k-belly'); belly.replaceChildren();
  knob(belly, 'x (px)', () => TUNE.belly.x, (v) => { TUNE.belly.x = v; }, -6, 6, 0.5);
  knob(belly, 'y (of body)', () => TUNE.belly.y, (v) => { TUNE.belly.y = v; }, -1, 1, 0.05);
  knob(belly, 'width', () => TUNE.belly.w, (v) => { TUNE.belly.w = v; }, 0, 1.2, 0.05);
  knob(belly, 'height', () => TUNE.belly.h, (v) => { TUNE.belly.h = v; }, 0, 1.2, 0.05);

  const kind = $('k-kind'); kind.replaceChildren();
  for (const k of ['chin', 'top', 'ear'] as Kind[]) {
    knob(kind, `${KIND_NAME[k]} x`, () => TUNE[k][0], (v) => { TUNE[k][0] = v; });
    knob(kind, `${KIND_NAME[k]} y`, () => TUNE[k][1], (v) => { TUNE[k][1] = v; });
  }

  const item = $('k-item'); item.replaceChildren();
  const p = pose();
  const ids = [p.neck, p.head].filter((x): x is string => !!x);
  if (!ids.length) { item.innerHTML = '<div class="hint">Pick a hat or neck outfit.</div>'; return; }
  for (const id of ids) {
    const nudge = () => TUNE.item[id] ?? [0, 0];
    const put = (i: 0 | 1, v: number) => {
      const n: [number, number] = [...nudge()];
      n[i] = v;
      if (n[0] === 0 && n[1] === 0) delete TUNE.item[id]; else TUNE.item[id] = n;
    };
    knob(item, `${id} x`, () => nudge()[0], (v) => put(0, v));
    knob(item, `${id} y`, () => nudge()[1], (v) => put(1, v));
  }
}

function tuneTs(): string {
  const pair = (p: [number, number]) => `[${p[0]}, ${p[1]}]`;
  const items = Object.entries(TUNE.item).filter(([, v]) => v[0] || v[1]);
  const itemTs = items.length ? `{ ${items.map(([k, v]) => `${k}: ${pair(v)}`).join(', ')} }` : '{}';
  return [
    'export const TUNE = {',
    '  /** Her head relative to her body while awake: negative raises it. */',
    `  headY: ${TUNE.headY},`,
    '  /** The light belly patch: x in pixels from centre; y, w, h as fractions of her body\'s radii. */',
    `  belly: { x: ${TUNE.belly.x}, y: ${TUNE.belly.y}, w: ${TUNE.belly.w}, h: ${TUNE.belly.h} },`,
    '  /** Where each kind of outfit sits, [dx, dy]. */',
    `  top: ${pair(TUNE.top)} as [number, number],`,
    `  ear: ${pair(TUNE.ear)} as [number, number],`,
    `  chin: ${pair(TUNE.chin)} as [number, number],`,
    '  /** Per-outfit nudges on top of those, by id. */',
    `  item: ${itemTs} as Record<string, [number, number]>,`,
    '};',
  ].join('\n');
}

let tick = 0;
function render(): void {
  const p = pose();
  const animate = ($('animate') as HTMLInputElement).checked;
  const frame: Frame = animate ? ([0, 1, 0, 2] as Frame[])[tick % 4]! : p.frame;
  const dress: Dress = { head: p.head, neck: p.neck, ears: p.ears };
  const grid = ($('grid') as HTMLInputElement).checked;
  paint($('big') as HTMLCanvasElement, drawRabbit(p.coat, p.face, frame, dress), 14, grid);
  const before = ($('before') as HTMLInputElement).checked;
  $('before-wrap').hidden = !before;
  if (before) paint($('orig') as HTMLCanvasElement, withTune(ORIGINAL, () => drawRabbit(p.coat, p.face, frame, dress)), 14, grid);

  const strip = (el: HTMLElement, list: typeof OUTFITS, slot: 'head' | 'neck') => {
    el.replaceChildren();
    for (const o of list) {
      const fig = document.createElement('figure');
      if (p[slot] === o.id) fig.className = 'on';
      const wrap = document.createElement('div'); wrap.className = 'stage';
      const c = document.createElement('canvas');
      paint(c, drawRabbit(p.coat, p.face === 'asleep' ? 'content' : p.face, 0, { ...dress, [slot]: o.id }), 4);
      wrap.append(c);
      const cap = document.createElement('figcaption');
      cap.textContent = `${o.name} · ${kindOf.get(o.id) ?? '?'}`;
      fig.append(wrap, cap);
      fig.addEventListener('click', () => { ($(slot) as HTMLSelectElement).value = o.id; buildKnobs(); render(); });
      el.append(fig);
    }
  };
  strip($('neck-strip'), necks, 'neck');
  strip($('head-strip'), heads, 'head');

  const faces = $('faces'); faces.replaceChildren();
  for (const coat of COATS) for (const face of ['content', 'happy', 'eating', 'grumpy', 'asleep'] as Face[]) {
    const fig = document.createElement('figure');
    const wrap = document.createElement('div'); wrap.className = 'stage';
    const c = document.createElement('canvas');
    paint(c, drawRabbit(coat, face, 0, dress), 3);
    wrap.append(c);
    const cap = document.createElement('figcaption'); cap.textContent = `${coat} ${face}`;
    fig.append(wrap, cap); faces.append(fig);
  }
  $('out').textContent = tuneTs();
}

function changed(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ base: ORIGINAL, tune: TUNE })); } catch { /* ignore */ }
  render();
}

for (const id of ['coat', 'ears', 'face', 'frame', 'animate', 'grid', 'before']) $(id).addEventListener('change', render);
for (const id of ['head', 'neck']) $(id).addEventListener('change', () => { buildKnobs(); render(); });
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(tuneTs());
  $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy as TS'; }, 1200);
});
$('reset').addEventListener('click', () => {
  Object.assign(TUNE, JSON.parse(JSON.stringify(ORIGINAL)));
  buildKnobs(); changed();
});
$('big').addEventListener('mousemove', (e) => {
  const r = (e.target as HTMLElement).getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / (r.width / RABBIT_W)), y = Math.floor((e.clientY - r.top) / (r.height / RABBIT_H));
  $('hover').textContent = `x ${x}, y ${y}`;
});
setInterval(() => { if (($('animate') as HTMLInputElement).checked) { tick++; render(); } }, 450);

findKinds();
buildKnobs();
render();
