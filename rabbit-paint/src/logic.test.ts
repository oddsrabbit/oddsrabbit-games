import assert from 'node:assert/strict';
import { dailySlug, dayIndex, msUntilNextDay, parseCatalog } from './catalog';
import { cssFor, fillName, gradient, hexToHsv, hsvToHex, packColoring, parseFill, pattern, solid, unpackColoring } from './fills';

let failures = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}

test('fill strings round-trip through parse', () => {
  assert.deepEqual(parseFill(solid('#7FB7E6')), { kind: 'solid', style: 0, a: '#7fb7e6', b: '#7fb7e6' });
  assert.deepEqual(parseFill(gradient(3, '#F2A541', '#d9604c')), { kind: 'gradient', style: 3, a: '#f2a541', b: '#d9604c' });
  assert.deepEqual(parseFill(pattern(4, '#000000', '#ffffff')), { kind: 'pattern', style: 4, a: '#000000', b: '#ffffff' });
});

test('bad fill strings are rejected', () => {
  for (const s of ['', '#fff', '#gggggg', 'g9aaaaaabbbbbb', 'p5aaaaaabbbbbb', 'x0aaaaaabbbbbb', 42, null]) assert.equal(parseFill(s), null, String(s));
});

test('fill names and css', () => {
  assert.equal(fillName('#7fb7e6'), '#7FB7E6');
  assert.equal(fillName(gradient(3, '#000000', '#ffffff')), 'Glow gradient');
  assert.equal(fillName(pattern(1, '#000000', '#ffffff')), 'Stripes');
  assert.match(cssFor(pattern(0, '#111111', '#222222')), /radial-gradient\(#111111/);
});

test('a page packs and unpacks', () => {
  const fills = ['#ff0000', null, gradient(0, '#000000', '#ffffff'), '#ff0000', null];
  const packed = packColoring(fills);
  assert.deepEqual(packed.f, ['#ff0000', 'g0000000ffffff']);
  assert.equal(packed.r, 'A.BA.');
  assert.deepEqual(unpackColoring(JSON.parse(JSON.stringify(packed)), 5), fills);
});

test('unpack rejects data for another page or tampered data', () => {
  const packed = packColoring(['#ff0000', '#00ff00']);
  assert.equal(unpackColoring(packed, 3), null);
  assert.equal(unpackColoring({ f: ['nope'], r: 'A' }, 1), null);
  assert.equal(unpackColoring({ f: ['#ff0000'], r: 'B' }, 1), null);
  assert.equal(unpackColoring(null, 1), null);
});

test('a 70-region page with distinct gradients fits the 2 KB score metadata cap', () => {
  const fills = Array.from({ length: 70 }, (_, i) => gradient(i % 4, `#${(i * 99999).toString(16).padStart(6, '0').slice(-6)}`, '#ffffff'));
  const meta = { v: 1, slug: 'some-long-page-slug-name', ...packColoring(fills), t: 1234 };
  assert.ok(JSON.stringify(meta).length <= 2048, `${JSON.stringify(meta).length} bytes`);
});

test('hsv conversions agree', () => {
  for (const hex of ['#7fb7e6', '#e8746a', '#000000', '#ffffff', '#4fa77a']) {
    const [h, s, v] = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
});

const catalog = parseCatalog({
  epoch: '2026-10-27',
  categories: [{ id: 'a', name: 'A' }],
  daily: ['one', 'missing', 'two'],
  pages: [{ slug: 'one', title: 'One', category: 'a', regions: 3 }, { slug: 'two', title: 'Two', category: 'a', regions: 4 }],
})!;

test('the catalog drops daily slugs with no page', () => {
  assert.deepEqual(catalog.daily, ['one', 'two']);
});

test('day index and the daily rotation', () => {
  const day0 = Date.UTC(2026, 9, 27);
  assert.equal(dayIndex(catalog, day0), 0);
  assert.equal(dayIndex(catalog, day0 - 1), -1);
  assert.equal(dayIndex(catalog, day0 + 86_400_000 * 3 + 5), 3);
  assert.equal(dailySlug(catalog, 0), 'one');
  assert.equal(dailySlug(catalog, 3), 'two');
  assert.equal(dailySlug(catalog, -1), 'two');
  assert.equal(msUntilNextDay(catalog, day0 + 1000), 86_400_000 - 1000);
});

if (failures) process.exit(1);
