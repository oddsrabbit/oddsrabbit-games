import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { OUTFITS } from './extras';
import { allLooks, lookKey, portraitHashInput, portraitList, PORTRAIT_HASH_LENGTH } from './portraitList';
import { COATS, EARS } from './sim';
import { widgetSprites } from './widgetSprites';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
// Built once for the tests below: it draws every look, which takes a few seconds.
const list = portraitList(sha1);

test('the hash input matches the server (shared vector: keep in step with RabbitPetsProfileBuilderTest)', () => {
  const s = { w: 2, h: 1, palette: ['aabbcc'], faces: { content: '2A', happy: 'A.', grumpy: '.A', asleep: '2.' } };
  assert.equal(portraitHashInput(s), '2|1|AABBCC|2A|A.|.A|2.');
  assert.equal(sha1(portraitHashInput(s)).slice(0, PORTRAIT_HASH_LENGTH), '1b24d5a7c394178c');
});

test('the list covers every coat, ear shape and outfit, each with its own hash', () => {
  const heads = OUTFITS.filter((o) => o.slot === 'head').length + 1;
  const necks = OUTFITS.filter((o) => o.slot === 'neck').length + 1;
  const expected = COATS.length * EARS.length * heads * necks;
  assert.equal(allLooks().length, expected);
  // Every look encodes (widgetSprites.test checks the colour budget), so none is left out.
  assert.equal(Object.keys(list.looks).length, expected);
  for (const o of OUTFITS) {
    const key = lookKey({ coat: 'cream', ears: 'long', head: o.slot === 'head' ? o.id : null, neck: o.slot === 'neck' ? o.id : null });
    assert.ok(list.looks[key], `${o.id} is listed`);
  }
  // Two looks that drew the same would let one stand in for the other; harmless, but a sign
  // an outfit isn't drawing at all.
  assert.equal(new Set(Object.values(list.looks)).size, expected);
});

test("a look's entry is the hash of the portrait the showcase publishes for it", () => {
  const look = { coat: 'midnight', ears: 'lop', head: 'witchhat', neck: 'bell' } as const;
  const sprites = widgetSprites(look.coat, look);
  assert.ok(sprites);
  assert.equal(list.looks[lookKey(look)], sha1(portraitHashInput(sprites)).slice(0, PORTRAIT_HASH_LENGTH));
  assert.equal(lookKey({ coat: 'snow', ears: 'short', head: null, neck: null }), 'snow|short||');
});
