// Into the gallery without a Post button: once most of a page is colored, the
// player's version goes in, and it keeps up as they color.
//
// A post is a score row (gallery.ts). `keepBest` lets the row be written again,
// replacing it only when the score beats the stored one, so the score is the
// time of posting: every later version wins, across devices and after Start
// over. The gallery never shows the score.

import { pageRoundKey } from './catalog';
import { packColoring } from './fills';
import type { Progress } from './store';
import { OR, serverNow } from './ui';

/** The share of a page's areas colored before it goes in. */
export const POST_AT = 0.6;
/** Score 0: posts before this. Seconds from here fit the score's 32 bits until 2094. */
const STAMP_EPOCH = Date.UTC(2026, 0, 1);

/** Areas to color before a page goes in. */
export const postThreshold = (total: number): number => Math.max(1, Math.ceil(total * POST_AT));

export const canAutoPost = (): boolean => !!OR().user && OR().capabilities.has('scores.submit');

/** Writes the player's current version of a page to its gallery. */
export async function postVersion(slug: string, progress: Progress): Promise<void> {
  try {
    await OR().scores.submit({
      roundKey: pageRoundKey(slug),
      score: Math.max(1, Math.floor((serverNow() - STAMP_EPOCH) / 1000)),
      metadata: { v: 1, slug, ...packColoring(progress.fills), t: Math.round(progress.seconds) },
      keepBest: true,
    });
  } catch (e) {
    // A host from before keepBest: the row is there, just frozen at the first version.
    if ((e as { code?: string })?.code !== 'scores/already-submitted') throw e;
  }
}
