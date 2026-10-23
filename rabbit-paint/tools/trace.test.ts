import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inkSvg } from './lib/trace';

const W = 120;
const H = 120;

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`ok  ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}

function mask(paint: (x: number, y: number) => boolean) {
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (paint(x + 0.5, y + 0.5)) ink[y * W + x] = 1;
  return ink;
}

/** Share of pixels where the rendered outlines disagree with the mask: edge
 *  pixels, smoothed and anti-aliased, are a few percent of these shapes. */
async function mismatch(ink: Uint8Array) {
  const { data } = await sharp(Buffer.from(inkSvg(ink, W, H))).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let off = 0;
  for (let p = 0; p < ink.length; p++) if ((data[p]! > 127 ? 1 : 0) !== ink[p]) off++;
  return off / ink.length;
}

await test('a ring traces with its hole open', async () => {
  const ink = mask((x, y) => { const r = Math.hypot(x - 60, y - 60); return r > 30 && r < 40; });
  assert.ok(await mismatch(ink) < 0.025);
});

await test('thin diagonal strokes and dots survive', async () => {
  const ink = mask((x, y) => Math.abs(x - y) < 1.5 || Math.abs(x + y - 120) < 2 || Math.hypot(x - 20, y - 100) < 2);
  assert.ok(await mismatch(ink) < 0.03);
});

await test('pixels touching at a corner make one shape', async () => {
  const ink = new Uint8Array(W * H);
  for (const [x, y] of [[10, 10], [11, 11], [12, 12]]) ink[y * W + x] = 1;
  assert.equal(inkSvg(ink, W, H).match(/M/g)?.length, 1);
  assert.equal(await mismatch(ink), 0);
});

await test('an empty page has no outlines', async () => {
  assert.equal(inkSvg(new Uint8Array(W * H), W, H).includes('d=""'), true);
});

if (failures) process.exit(1);
