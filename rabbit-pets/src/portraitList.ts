// The list of every portrait the game can draw, published with each build as
// portraits.json so OddsRabbit can show her on a public profile.
//
// The showcase is written by the player's own session, so the server can't take
// `widget.sprites` on trust: anyone signed in could publish their own 40×40
// drawing. It doesn't draw rabbits itself either (a PHP copy of drawRabbit would
// drift from this one). Instead it hashes the published portrait and checks it
// against this list's entry for the published look. A portrait that isn't here
// never leaves the owner's home screen.
//
// The list ships next to main.js, so new art and its list go live in the same
// upload. The server side is RabbitPetsProfileService::portraitIsGenuine() in the
// theme repo; change portraitHashInput() and its PHP twin together, and keep the
// shared test vector in both test files.
//
// Only the current build's list is live. A tab still running an older main.js
// publishes portraits in the old art, so after an art change its portrait stays
// off the public profile until the page reloads. That fails safe; keep the
// previous build's list too if it ever matters.
//
// Hashing (SHA-1) happens in build.mjs and the tests, through node:crypto, so this
// module stays free of Node imports.

import { OUTFITS } from './extras';
import { COATS, EARS, type Coat, type Ears } from './sim';
import { WIDGET_FACES, widgetSprites, type WidgetSprites } from './widgetSprites';

/** The `v` of portraits.json. Bump on any change to the key or hash input. */
export const PORTRAIT_LIST_VERSION = 1;

/** Characters of hex kept from the SHA-1: 64 bits, far past forging a second preimage. */
export const PORTRAIT_HASH_LENGTH = 16;

export interface Look {
  coat: Coat;
  ears: Ears;
  head: string | null;
  neck: string | null;
}

/** `coat|ears|head|neck`, with an empty string for no outfit. The showcase carries all four. */
export function lookKey(look: Look): string {
  return `${look.coat}|${look.ears}|${look.head ?? ''}|${look.neck ?? ''}`;
}

/**
 * The string that gets hashed: `w|h|PALETTE|content|happy|grumpy|asleep`, the
 * palette as uppercase hex joined by commas. A plain string rather than JSON, so
 * TypeScript and PHP can't serialise it differently.
 */
export function portraitHashInput(s: WidgetSprites): string {
  return [s.w, s.h, s.palette.map((c) => c.toUpperCase()).join(','), ...WIDGET_FACES.map((f) => s.faces[f])].join('|');
}

/** Every look the game can dress her in: each coat and ear shape, each head and neck outfit or none. */
export function allLooks(): Look[] {
  const heads = [null, ...OUTFITS.filter((o) => o.slot === 'head').map((o) => o.id)];
  const necks = [null, ...OUTFITS.filter((o) => o.slot === 'neck').map((o) => o.id)];
  const looks: Look[] = [];
  for (const coat of COATS) for (const ears of EARS) for (const head of heads) for (const neck of necks) {
    looks.push({ coat, ears, head, neck });
  }
  return looks;
}

/**
 * The list body: look key => hash. `hash` is SHA-1 hex, passed in so this module
 * needs no crypto. A look that can't be encoded is left out, so the server treats
 * it as not genuine rather than trusting it.
 */
export function portraitList(hash: (input: string) => string): { v: number; looks: Record<string, string> } {
  const looks: Record<string, string> = {};
  for (const look of allLooks()) {
    const sprites = widgetSprites(look.coat, { head: look.head, neck: look.neck, ears: look.ears });
    if (sprites) looks[lookKey(look)] = hash(portraitHashInput(sprites)).slice(0, PORTRAIT_HASH_LENGTH);
  }
  return { v: PORTRAIT_LIST_VERSION, looks };
}
