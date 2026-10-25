import assert from 'node:assert/strict';
import { prepare } from './lib/regions';

const W = 200;
const H = 200;

function canvas() {
  return new Uint8Array(W * H).fill(255);
}
function rect(img: Uint8Array, x0: number, y0: number, x1: number, y1: number, t = 3) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x - x0 < t || x1 - x < t || y - y0 < t || y1 - y < t) img[y * W + x] = 0;
  }
}
function line(img: Uint8Array, x0: number, y0: number, x1: number, len: number) {
  for (let i = 0; i < len; i++) img[(y0 + i) * W + x0 + Math.round(((x1 - x0) * i) / len)] = 0;
}

const opts = { minArea: 400, maxStrokePx: 200, closeRadius: 2 };
let failures = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}

test('a box splits the page into outside and inside', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  assert.equal(prepare(img, W, H, opts).regions.length, 2);
});

test('a small gap in the outline does not leak', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  for (let y = 98; y < 101; y++) for (let x = 40; x < 43; x++) img[y * W + x] = 255;
  assert.equal(prepare(img, W, H, opts).regions.length, 2);
});

test('loose hatching strokes are dropped, not regions', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  for (let i = 0; i < 5; i++) line(img, 60 + i * 15, 60, 70 + i * 15, 20);
  const res = prepare(img, W, H, opts);
  assert.equal(res.regions.length, 2);
  assert.equal(res.stats.droppedStrokes, 5);
});

test('closed shapes survive the stroke filter', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  rect(img, 70, 70, 130, 130); // an eye, a button: encloses something
  assert.equal(prepare(img, W, H, opts).regions.length, 3);
});

test('small shapes walled in by ink stay their own areas', () => {
  const img = canvas();
  rect(img, 20, 20, 180, 180);
  for (let i = 0; i < 6; i++) rect(img, 30 + i * 22, 90, 50 + i * 22, 110);
  // touching beads, each under minArea: outside, inside the frame, 6 beads
  assert.equal(prepare(img, W, H, opts).regions.length, 8);
});

test('a small piece pinched off through paper rejoins its area', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  // a corner nook under minArea, open to the box through a 3 px gap the walls close
  for (let y = 40; y < 60; y++) img[y * W + 60] = 0;
  for (let x = 40; x < 57; x++) img[60 * W + x] = 0;
  const res = prepare(img, W, H, opts);
  assert.equal(res.regions.length, 2);
  assert.equal(res.stats.tinyMerged, 1);
});

test('merge hints join regions', () => {
  const img = canvas();
  rect(img, 20, 20, 90, 180);
  rect(img, 110, 20, 180, 180);
  assert.equal(prepare(img, W, H, opts).regions.length, 3);
  assert.equal(prepare(img, W, H, { ...opts, merges: [[[50, 100], [140, 100]]] }).regions.length, 2);
});

test('label points sit inside their region', () => {
  const img = canvas();
  rect(img, 40, 40, 160, 160);
  const res = prepare(img, W, H, opts);
  for (const r of res.regions) {
    const [x, y] = r.label;
    assert.equal(res.owner[y * W + x], r.id);
    assert.ok(!res.ink[y * W + x]);
  }
});

test('a thin channel between two thick lines, pinched off at its mouth, folds back into the page', () => {
  const img = canvas();
  const fill = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img[y * W + x] = 0; };
  // Two 9 px lines 8 px apart, closed at the right, nearly touching at the
  // left: the channel's paper is under minArea, though with its half of each
  // line it is over.
  fill(60, 80, 95, 89);
  fill(60, 97, 95, 106);
  fill(95, 80, 104, 106);
  fill(60, 89, 66, 92);
  fill(60, 94, 66, 97);
  const res = prepare(img, W, H, opts);
  assert.equal(res.regions.length, 1);
});

if (failures) process.exit(1);
