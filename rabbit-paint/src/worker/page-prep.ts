// A player's picture → a coloring page, in the browser. The same steps as
// tools/prep-page.ts (tools/lib/regions.ts), with two differences for pictures
// nobody curated:
//
// - Ink is found against the local paper colour, not one cutoff: a phone photo
//   of a printed page is grey in one corner and white in another.
// - The options scale with the picture. The defaults are tuned for 2100 px
//   pages; a 1000 px picture needs areas a quarter the size for the same
//   fingertip at fit size.

import { dilate, DEFAULTS, prepare, type PrepOptions } from '../../tools/lib/regions';
import { THUMB, type Detail, type PrepReply } from './messages';

const REF_SIDE = 2100;

export function scaledOptions(w: number, h: number, detail: Detail): Partial<PrepOptions> {
  const s = Math.max(w, h) / REF_SIDE;
  const areaFactor = detail === 0 ? 2 : detail === 2 ? 0.45 : 1;
  return {
    closeRadius: Math.max(2, Math.round(DEFAULTS.closeRadius * s)),
    minArea: Math.max(200, Math.round(DEFAULTS.minArea * s * s * areaFactor)),
    maxStrokePx: Math.max(200, Math.round(DEFAULTS.maxStrokePx * s * s)),
  };
}

/**
 * Ink → 0, paper → 255. A pixel is ink when it's clearly dark, or clearly
 * darker than the paper around it (mean of a window a fortieth of the picture
 * across). Clean digital line art comes out the same as a plain cutoff.
 */
export function inkMask(grey: Uint8Array, w: number, h: number): { grey: Uint8Array; inkShare: number } {
  const r = Math.max(8, Math.round(Math.max(w, h) / 40));
  // Summed-area table, (w+1)×(h+1). The largest sum is 1600²·255, under 2³².
  const W = w + 1;
  const sat = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grey[y * w + x];
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const g = grey[y * w + x];
      const isInk = g < 90 || (g < mean - 28 && g < 215);
      out[y * w + x] = isInk ? 0 : 255;
      if (isInk) ink++;
    }
  }
  return { grey: out, inkShare: ink / (w * h) };
}

export function prepPicture(grey: Uint8Array, w: number, h: number, detail: Detail): PrepReply {
  const masked = inkMask(grey, w, h);
  const res = prepare(masked.grey, w, h, scaledOptions(w, h, detail));
  if (res.regions.length > 65534) throw new Error('too many areas');
  const n = w * h;
  const ids = new Uint16Array(n);
  for (let p = 0; p < n; p++) ids[p] = res.owner[p] + 1;

  // Thumbnails as tools/prep-page.ts makes them: nearest-neighbour ids (an
  // average would invent regions) and thickened, box-averaged ink.
  const k = THUMB / Math.max(w, h);
  const thumbW = Math.max(1, Math.round(w * k));
  const thumbH = Math.max(1, Math.round(h * k));
  const thumbIds = new Uint16Array(thumbW * thumbH);
  const thumbInk = new Uint8Array(thumbW * thumbH);
  const bold = dilate(res.ink, w, h, Math.max(1, Math.round(1 / k / 2)));
  for (let ty = 0; ty < thumbH; ty++) {
    const sy0 = Math.floor(ty / k);
    const sy1 = Math.min(h, Math.max(sy0 + 1, Math.floor((ty + 1) / k)));
    for (let tx = 0; tx < thumbW; tx++) {
      const sx0 = Math.floor(tx / k);
      const sx1 = Math.min(w, Math.max(sx0 + 1, Math.floor((tx + 1) / k)));
      const cx = Math.min(w - 1, Math.floor((tx + 0.5) / k));
      const cy = Math.min(h - 1, Math.floor((ty + 0.5) / k));
      thumbIds[ty * thumbW + tx] = ids[cy * w + cx];
      let sum = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) sum += bold[y * w + x];
      thumbInk[ty * thumbW + tx] = Math.round((255 * sum) / ((sx1 - sx0) * (sy1 - sy0)));
    }
  }
  return { ok: true, w, h, regions: res.regions, ids, ink: res.ink, thumbW, thumbH, thumbIds, thumbInk, inkShare: masked.inkShare };
}
