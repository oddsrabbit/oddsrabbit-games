// Small hand-drawn sprites (food, gifts, decor), as character grids, plus the
// two procedural ones (rug, cushion) and the lantern glow.

import { blank, fromRows, hex, outline, type PixelGrid } from './pixels';
import { SHOP_ART, SHOP_PALETTE } from './shop';

const C: Record<string, string> = {
  k: '3B2922', O: 'F08A3C', o: 'C8622A', g: '86C95E', G: '4E8C3A', r: 'E4566F', R: 'B03550',
  y: 'F6D24A', Y: 'D5A12A', w: 'FFFFFF', b: 'BFE3F2', B: '8FC3E8', p: 'F3A6B3', P: 'DE8697',
  n: '8A5A3C', N: '5E3B26', m: 'F4E3B5', s: 'FFF6C8', h: '8B6A52', H: '5C4333', f: 'EFD2AE',
  F: 'CFA982', c: 'F7EEDC', C: 'D9C9A8', T: 'B38F63', e: 'A8E0C8', E: '6FBF9E', v: '9A7FD1', V: '6E55A8',
};

const GRIDS: Record<string, string[]> = {
  carrot: [
    '........k.k.', '.......kgkGk', '.......kgGgk', '....kkkkGgk.', '...kOOOOkk..', '..kOOOoOk...',
    '..kOOoOOk...', '.kOOoOOk....', '.kOOOOk.....', 'kOoOOk......', 'kOOkk.......', '.kk.........',
  ],
  strawberry: [
    '...kGk...', '..kgGgk..', '.kkrrrkk.', 'krrwrrrrk', 'krrrryrrk', 'kryrrrrRk', '.krrryRk.', '.krrrRRk.', '..krRRk..', '...kkk...',
  ],
  greens: [
    '..k..k.....', '.kgk.kgk...', '.kggkggk.k.', 'kgGgkgGgkgk', '.kgGgGgGgk.', '..kgGgGgk..', '...kgGgk...', '....kGk....', '....kGk....', '....kkk....',
  ],
  clover: ['.kk.kk.', 'kggkgGk', 'kgGkGgk', '.kkgkk.', 'kGgkggk', 'kggkgGk', '.kk.kk.', '...k...', '..k....'],
  heart: ['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrRk', '.krrRk.', '..kRk..', '...k...'],
  gift: [
    '..kk...kk..', '.kyYk.kyYk.', '..kkkykkk..', 'kkkkkykkkkk', 'krrrryrrrRk', 'kkkkkykkkkk',
    '.krrrYrrRk.', '.krrrYrrRk.', '.krrrYrrRk.', '.kkkkkkkkk.',
  ],
  treat: ['..kkkkk..', '.kmmmmmk.', 'kmnmmmnmk', 'kmmmnmmmk', 'kmnmmmmTk', '.kmmmnTk.', '..kkkkk..'],
  dandelion: ['.k.k.k.', 'kykykyk', '.kyYyk.', 'kykYkyk', '.kkgkk.', '...g...', '..gG...', '...G...'],
  sparkle: ['..s..', '..s..', 'sswss', '..s..', '..s..'],
  hedgehog: [
    '.......kkkkk.......', '.....kkhHhHhkk.....', '....khHhHhHhHhk....', '...khHhHhHhHhHhk...',
    '..kfkhHhHhHhHhHhk..', '.kfffkhHhHhHhHhHk..', 'kffkffkhHhHhHhHhHk.', 'kffffffkhHhHhHhHHk.',
    'kkfffFffkhHhHhHHk..', '.kfffFFFfkkkkkkk...', '..kkkFkkkFkk.......', '.....k....k........',
  ],
  lantern: ['...k...', '...k...', '..kkk..', '.kNnNk.', 'kysyysk', 'kyssyyk', 'kysyysk', 'kyyyyyk', '.kNnNk.', '..kkk..'],
  plant: [
    '....kk..kk....', '...kgGkkgGk...', '..kggGkkGggk..', '...kkgGGgkk...', '..kgGkgGkGgk..', '.kgggGkgkGggk.',
    '..kkkkggkkkk..', '....kgGGgk....', '...kkkkkkkk...', '...kOOOOOOk...', '...koOOOOok...', '....koOOok....', '....kkkkkk....',
  ],
  mushroom: [
    '..kkkkkkkk..', '.krrwrrrrrk.', 'krrrrrwrrrrk', 'krwrrrrrrwRk', '.kkkkkkkkkk.',
    '...kcccck...', '...kcccck...', '...kccCck...', '..kkkkkkkk..',
  ],
  jar: [
    '.k.k..k.k.', 'kykyk.kyk.', '.kYk.kykyk', '..g...kYk.', '..g....g..', '.kbbbbbbk.',
    'kbwbbbbbbk', 'kbwbbgbbbk', 'kbbbbgbbbk', 'kbbbbbbbBk', '.kkkkkkkk.',
  ],
  garland: [
    'k............................k', '.k....k.........k.........k.k.', '..kk.kyk.....kkkyk.....kkkyk..',
    '....kyYyk.kk..kyYyk.kk..kyYyk.', '.....kyk.....kkkyk.....kkkyk..', '......k.........k.........k...',
  ],
  pebble: ['..kkk..', '.kcccCk', 'kccCcCk', 'kcCccCk', '.kkkkk.'],
  thought: [
    '..kkkkkkk..', '.kwwwwwwwk.', 'kwwwwwwwwwk', 'kwwwwwwwwwk', 'kwwwwwwwwwk', 'kwwwwwwwwwk',
    'kwwwwwwwwwk', '.kwwwwwwwk.', '..kkkwkkk..', '....kwk....', '.....k.....',
  ],
  droplet: ['...k...', '..kbk..', '.kbbBk.', 'kbwbbBk', 'kbbbbBk', '.kBBBk.', '..kkk..'],
  moon: ['..kkk..', '.kyyk..', 'kyyk...', 'kyyk...', 'kyyk...', '.kyyk..', '..kkk..'],
  zz: ['kkkk', '..k.', '.k..', 'kkkk'],

  // collectibles (the pebble is above)
  feather: ['.....kk', '....kbk', '...kbBk', '..kbBk.', '.kbBk..', '.kBk...', 'k.k....'],
  acorn: ['...k...', '.kkkkk.', 'kNnNnNk', 'kkkkkkk', '.kFFTk.', '.kFFTk.', '..kTk..', '...k...'],
  flower: ['.kk.kk.', 'kppkppk', 'kppyppk', '.kyYyk.', 'kppyppk', 'kppkPpk', '.kk.kk.'],
  seaglass: ['..kkk..', '.kewek.', 'keweeEk', 'keeeEEk', '.kEEEk.', '..kkk..'],
  shell: ['..kkkk..', '.kfFFfk.', 'kfFkkFfk', 'kfkfFkFk', 'kfFkkfFk', '.kfFFFk.', '..kkkkk.'],
  pinecone: ['...kk...', '..kNNk..', '.kNnnNk.', '.knNNnk.', 'kNnnnnNk', '.knNNnk.', '..kNNk..', '...kk...'],
  button: ['.kkkkk.', 'krrrrrk', 'krkrkrk', 'krrrrrk', 'krkrkrk', 'krrrrRk', '.kkkkk.'],
  marble: ['..kkk..', '.kbwbk.', 'kbwbgBk', 'kbggbBk', 'kbbgBBk', '.kBBBk.', '..kkk..'],
  lucky: ['.kk.kk.', 'kgGkGgk', 'kGgkgGk', '.kkykk.', 'kGgkgGk', 'kgGkGgk', '.kk.kk.', '...k...', '..k....'],
  key: ['.kkk......', 'kyyyk.....', 'ky.ykkkkkk', 'kyyyyyyyyk', '.kkkkkykyk', '......k.k.'],
  star: ['....k....', '...kyk...', 'kkkkyykkk', 'kyyyyyyYk', '.kyyyyYk.', '..kyyyYk.', '.kyYkkYYk', '.kYk..kYk', '.kk....kk'],

  // visitors (wildlife.ts); the hedgehog is above
  robin: [
    '....kkkk....', '...kNNNNk...', '..kNkNNNNk..', '.kyNNNNNNNk.', 'kyykOOONNNNk', '.kkOOOOONNNNk',
    '..kOOOOONNNk', '..kOOOONNNk.', '...kkkkkkk..', '....k...k...',
  ],
  mouse: [
    '..kk.kk.......', '.kpCkpCk......', '.kCCCCCk......', 'kCkCCCCCkk....', 'kCCCCCCCCCk...',
    '.kpCCCCCCCCk..', '..kCCCCCCCCk.k', '...kkkkkkkk.k.', '.............',
  ],
  frog: [
    '.kkk...kkk.', 'kwkgk.kwkgk', 'kkgGgkggGgk', 'kgggggggggk', 'kgGgggggGgk', '.kgGGGGGGk.',
    'kgkkkkkkkgk', 'kk.......kk',
  ],
  snail: [
    '.....kkkk...', '....kNnnNk..', '...kNnNNnNk.', '...knNkkNnk.', '...knNnnNnk.', 'k..kNnnnNk..',
    'kfk.kkkkk...', 'kffffffffk..', '.kkkkkkkkk..',
  ],
  squirrel: [
    '.......kkkk.', '..kk..koOOOk', '.kOOk.kOoOOk', 'kOkOOkkOOoOk', 'kyOOOOkOOOk.', '.kOwwOOkOOk.',
    '.kOwwOOOkk..', '..kOOOOk....', '..kkkkkk....',
  ],
  owl: [
    '.kk....kk.', 'knNkkkkNnk', 'kNyykkyyNk', 'kNykyykyNk', 'kNNNkkNNNk', 'knfFfFfFnk',
    'knFfFfFfnk', '.knfFfFnk.', '..kkkkkk..', '..y....y..',
  ],
  fox: [
    '.k..k...........', 'kOkkOk..........', 'kOOOOk..........', 'kOkOOOk.........', 'kyyOOOkkkkkk..kk',
    '.kwwOOOOOOOOkkOk', '..kwOOOOOOOOOOOk', '..kOOOOOOOOkkwwk', '..kNkkkNNkk.kkk.', '..kk..kkk.......',
  ],
  // their keepsakes (collectibles.ts)
  quill: ['......kk', '.....kHk', '....khk.', '...khk..', '..khk...', '.khk....', 'kwk.....', 'kk......'],
  rowan: ['...kGk..', '..kGk...', '.krkrk..', 'krRkrRk.', 'krkrkrk.', '.kRkRk..', '..kkk...'],
  thimble: ['..kkkk..', '.kbwbbk.', '.kbBbBk.', 'kbBbBbBk', 'kbbbbbBk', 'kkkkkkkk'],
  lilypad: ['..kkkkk..', '.kgGgpgk.', 'kgGgpwpgk', 'kgggkpggk', 'kgGk.kGgk', '.kgk.kgk.', '..k...k..'],
  dewdrop: ['...k...', '..kbk..', '.kbwbk.', 'kbwbbBk', 'kbbbbBk', '.kBBBk.', '..kkk..'],
  hazelnut: ['..kGk..', '.kkkkk.', 'kNnNnNk', 'kFFFFTk', 'kFfFFTk', '.kFFTk.', '..kkk..'],
  moonstone: ['..kkk..', '.kvwvk.', 'kvwvvVk', 'kvvvVVk', '.kvVVk.', '..kkk..'],
  goldleaf: ['.....kk', '...kkyk', '..kyyYk', '.kyYyYk', 'kyYyyk.', 'kyyYk..', '.kkk...', 'k......'],

  // seasonal decor
  pumpkin: [
    '.....kk.....', '.....kGk....', '..kkkkGkkk..', '.kOOoOOoOOk.', 'kOOoOOOOoOOk',
    'kOoOOOOOOoOk', 'kOoOOOOOOoOk', 'kOOoOOOOoOok', '.kOOoooooOk.', '..kkkkkkkk..',
  ],
  jackolantern: [
    '.....kk.....', '.....kGk....', '..kkkkGkkk..', '.kOOoOOoOOk.', 'kOkkOOOOkkOk',
    'kOkykOOkykOk', 'kOOOOkkOOOOk', 'kOkyykkyykOk', '.kOkkkkkkOk.', '..kkkkkkkk..',
  ],
  snowglobe: [
    '...kkkkk...', '.kkbbwbbkk.', 'kbwbbbbwbbk', 'kbbbgGbbbwk', 'kbwbgGgbbbk', 'kbbgGgGgbbk',
    '.kbwwwwwbk.', '..kkkkkkk..', '.kNnnnnnNk.', 'kNnnnnnnnNk', 'kkkkkkkkkkk',
  ],

  // the garden: a soil mound, and what grows in it
  can: ['....kkkk...', 'k..k....k..', 'kk.kkkkkkk.', '.kkkBbbbBk.', '..kkbwbbBk.', '...kbwbbBk.', '...kbbbbBk.', '....kkkkk..'],
  mound: ['..kkkkkkkkkk..', '.kNnNnnNnNnNk.', 'kNnnNnnnNnnnNk', 'kkkkkkkkkkkkkk'],
  seed: ['.....k..k.....', '....knk.knk...'],
  sprout: ['.....k..k.....', '....kgkkgk....', '.....kgGk.....', '......kk......'],
  leafy: [
    '...kk....kk...', '..kgGk..kGgk..', '..kggGkkGggk..', '...kkgGGgkk...', '..kgGkgGkGgk..', '...kk.kGk.kk..', '......kk......',
  ],

  // small icons for the menus
  bow: ['kk...kk', 'krk.krk', 'krrkrrk', 'krRRRrk', 'krrkrRk', 'krk.kRk', 'kk...kk'],
  basket: ['..kkkkkk..', '.k......k.', 'kkkkkkkkkk', 'kTnTnTnTnk', 'kTnTnTnTnk', '.kTnTnTnk.', '..kkkkkk..'],
  suitcase: ['...kkkk...', '...k..k...', 'kkkkkkkkkk', 'krrrrrrrRk', 'kyyyyyyyyk', 'krrrrrrrRk', 'krrrrrrrRk', 'kkkkkkkkkk'],
  book: ['.kkkkkkkk.', 'kvvvvvvvVk', 'kvwwwwwvVk', 'kvvvvvvvVk', 'kvwwwwvvVk', 'kvvvvvvvVk', 'kcccccccck', '.kkkkkkkk.'],
};

/** The golden carrot: the carrot, gilded. */
const GOLD: Record<string, string> = { ...C, O: 'F6D24A', o: 'D5A12A', g: 'F6D24A', G: 'D5A12A' };

export type ItemArt = keyof typeof GRIDS | keyof typeof SHOP_ART | 'rug' | 'cushion' | 'golden';

export function drawItem(name: ItemArt): PixelGrid {
  if (name === 'rug') return rug();
  if (name === 'cushion') return cushion();
  if (name === 'golden') return fromRows(GRIDS.carrot!, GOLD);
  const shop = (SHOP_ART as Record<string, string[] | undefined>)[name];
  if (shop) return outline(fromRows(shop, { ...C, ...SHOP_PALETTE }), hex(C.k!));
  return fromRows(GRIDS[name]!, C);
}

/**
 * A garden plot at a growth stage: a soil mound, with a seed, a sprout, leaves,
 * or leaves and the crop that's ready to pick.
 */
export function drawPlot(ready: ItemArt | null, stage: 0 | 1 | 2 | 3): PixelGrid {
  const g = blank(18, 20);
  const put = (src: PixelGrid, x: number, y: number) => {
    for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) {
      const p = src.px[yy]![xx]!;
      if (p[3] > 0 && y + yy >= 0 && y + yy < g.h && x + xx >= 0 && x + xx < g.w) g.px[y + yy]![x + xx] = p;
    }
  };
  const mound = drawItem('mound');
  const top = g.h - mound.h;
  // an empty bed (no crop coming) is just the mound; a seed means something's planted
  if (stage === 0 && ready) put(drawItem('seed'), 2, top - 1);
  if (stage === 1) put(drawItem('sprout'), 2, top - 3);
  if (stage >= 2) put(drawItem('leafy'), 2, top - 6);
  put(mound, 2, top);
  if (stage === 3 && ready) {
    const r = drawItem(ready);
    put(r, Math.round((g.w - r.w) / 2), Math.max(0, top - 5 - r.h));
  }
  return g;
}

function rug(w = 34, h = 9): PixelGrid {
  const g = blank(w, h);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const cols = ['E4566F', 'F7EEDC', 'E4566F', 'F3A6B3'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2;
    if (d <= 1) g.px[y]![x] = hex(cols[Math.min(3, Math.floor(d * 4))]!);
  }
  return outline(g, hex(C.k!));
}

function cushion(w = 26, h = 10): PixelGrid {
  const g = blank(w, h);
  const cx = (w - 1) / 2, cy = h - 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (((x - cx) / (w / 2 - 0.5)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 1) {
      g.px[y]![x] = hex('8FC3E8');
      if (((x - cx) / (w / 2 - 4)) ** 2 + ((y - cy + 1) / (h / 2 - 2.5)) ** 2 <= 1) g.px[y]![x] = hex('B9DAF2');
      if (y >= cy + 2) g.px[y]![x] = hex('4677AC');
    }
  }
  return outline(g, hex(C.k!));
}

/** A warm pool of lantern light in stepped rings, drawn additively at night. */
export function drawGlow(r = 30): PixelGrid {
  const size = r * 2 + 1;
  const g = blank(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - r, (y - r) * 1.15) / r;
    if (d > 1) continue;
    const step = Math.ceil((1 - d) * 4) / 4; // stepped, to stay on the pixel grid
    g.px[y]![x] = [255, 170, 80, Math.round(step * 70)];
  }
  return g;
}
