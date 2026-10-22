// Scoring, and the found-word bitmasks a submission carries.
//
// MIRRORED IN PHP. The backend recomputes every submission from the bitmasks
// (AppScoreVerifier::scoreWordGrid) and bounds it (AppScoreBounds,
// `word-rush`). Change the formula here and there together, or the verifier
// starts logging a mismatch for every player.
//
// A day's score ranks completion first, then bonus words:
//
//   score = completion × 100 + min(bonus, 99)
//   completion = floor(1000 × found / total)   (0–1000; 1000 only when all found)
//
// so 0–100,099. Completion in thousandths means a 4×4 and a 5×5 are worth the
// same, which keeps the month's board fair across board sizes. Bonus words
// break ties between players on the same completion and never lift an
// unfinished board past a finished one. Words revealed by a hint don't count.

export const BONUS_CAP = 99;
export const MAX_SCORE = 1000 * 100 + BONUS_CAP;

export function completion(found: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((1000 * Math.min(found, total)) / total);
}

export function scoreFor(found: number, total: number, bonus: number): number {
  return completion(found, total) * 100 + Math.min(Math.max(bonus, 0), BONUS_CAP);
}

export interface ScoreParts {
  /** 0–1000. */
  completion: number;
  bonus: number;
}

export function partsOf(score: number): ScoreParts {
  const s = Math.max(0, Math.min(MAX_SCORE, Math.floor(score)));
  return { completion: Math.floor(s / 100), bonus: s % 100 };
}

/** "87%" — whole percent, rounded down so 99.9% never reads as 100%. */
export function percentLabel(completionThousandths: number): string {
  return `${Math.floor(completionThousandths / 10)}%`;
}

/** "100% · +7" (7 bonus words), the value on a day's leaderboard. Short, so names aren't cut. */
export function scoreLabel(score: number): string {
  const { completion: c, bonus } = partsOf(score);
  return bonus > 0 ? `${percentLabel(c)} · +${bonus}` : percentLabel(c);
}

// ---------- Bitmasks ----------
//
// Bit i (byte i >> 3, bit i & 7, least significant first) is set when the word
// at index i of the content list was found. Encoded as unpadded base64url.
// 85 required words is 11 bytes; 300 bonus words is 38 bytes, comfortably
// inside the 2 KB metadata cap.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeMask(list: readonly string[], found: ReadonlySet<string>): string {
  const bytes = new Uint8Array(Math.ceil(list.length / 8));
  list.forEach((word, i) => {
    if (found.has(word)) bytes[i >> 3]! |= 1 << (i & 7);
  });
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** The words a mask marks. Bits past the end of the list are ignored. */
export function decodeMask(list: readonly string[], mask: string): string[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of mask) {
    const v = B64.indexOf(ch);
    if (v < 0) return [];
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return list.filter((_, i) => ((bytes[i >> 3] ?? 0) >> (i & 7)) & 1);
}
