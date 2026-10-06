// The guest book: notes friends leave, the stamp they sign with, the notes
// she pins to her corkboard, and the book's cover. Pure; tested in
// guestbook.test.ts.
//
// A note is never a visitor's own words: the platform only carries a short
// kind ([a-z0-9-], 32 at most), and words picked from lists need no
// moderation. Notes are built from three lists (an opener, what it's about,
// and what they say about it), so they can still be about her burrow in
// particular: "Wow, your fireplace is so cozy!". It rides on the visit's kind
// after the care, as `n` and four base-36 digits, then the stamp as `s` and
// two: `snack-n1e34-s0b`. The six fixed notes from before are still read.
//
// Every list here is append-only: a visit names its words by their place in
// them, so reordering or removing one would change notes already sent.

import { byId } from './decor';
import { COATS, type Coat, type PetState } from './sim';

/** The fixed notes from before the phrase builder: still read, no longer offered. */
export const GUEST_NOTES = {
  cozy: 'Your burrow is so cozy!',
  sweet: '{name} is the sweetest.',
  decor: "Love what you've done with the place.",
  hello: 'Just popping in to say hello!',
  garden: 'Your garden is looking lovely.',
  again: "Can't wait to visit again!",
} as const;
export type GuestNote = keyof typeof GUEST_NOTES;

/** `{name}` is the host's rabbit. The first is no opener at all. */
export const OPENERS = ['', 'Wow,', 'Aww,', 'Hi!', 'Oh my,', 'Honestly,', 'Hooray!', 'Psst,', 'Ooh,', 'Dear {name},'] as const;

/**
 * What a note is about. `#id` is a piece of decor, named from the catalog
 * ("your fireplace"), offered when the host has it out.
 */
export const SUBJECTS = [
  'your burrow', '{name}', 'your garden', 'your decor', 'this place', 'your meadow', 'your yard', 'visiting you',
  'your style', 'your window', 'your wallpaper', 'your floor',
  '#cushion', '#plant', '#rug', '#lantern', '#mushroom', '#jar', '#garland', '#wallclock', '#flowerbox', '#herbs',
  '#kettle', '#patchcushion', '#bunting', '#lamp', '#bookshelf', '#hayloft', '#rocker', '#windowseat', '#fireplace',
  '#teatable', '#clock', '#seasontree', '#fireflies', '#wishingwell', '#sled', '#snowman', '#icicles', '#tulips',
  '#birdhouse', '#blossom', '#fan', '#fairlights', '#lemonade', '#pool', '#pumpkin', '#applecrate', '#scarecrow',
  '#candybasket', '#jackolantern', '#ghost', '#snowglobe', '#tinytree', '#stockings', '#corkboard',
] as const;

export const PRAISE = [
  'is so cozy!', 'is lovely!', 'made my day!', 'is the best!', 'is adorable!', 'is so pretty!', 'is perfect!',
  'is goals!', 'is so sweet!', 'is amazing!', 'is so you!', 'is magical!', 'is beautiful!', 'is the cutest!',
  'is so peaceful!', 'is very fancy!', 'makes me smile!', 'is my favourite!',
] as const;

export interface Phrase { o: number; s: number; p: number }

const inRange = (n: number, list: readonly unknown[]) => Number.isInteger(n) && n >= 0 && n < list.length;

/** A phrase as it travels: `n`, then the opener, subject (two digits) and praise in base 36. */
export function phraseCode(ph: Phrase): string {
  return `n${ph.o.toString(36)}${ph.s.toString(36).padStart(2, '0')}${ph.p.toString(36)}`;
}

export function phraseOf(code: unknown): Phrase | null {
  if (typeof code !== 'string' || !/^n[0-9a-z]{4}$/.test(code)) return null;
  const ph = { o: parseInt(code[1]!, 36), s: parseInt(code.slice(2, 4), 36), p: parseInt(code[4]!, 36) };
  return inRange(ph.o, OPENERS) && inRange(ph.s, SUBJECTS) && inRange(ph.p, PRAISE) && subjectText(ph.s, '') !== null ? ph : null;
}

/** A subject in words, for a host whose rabbit is `name`. Null for a piece this version doesn't know. */
export function subjectText(i: number, name: string): string | null {
  const s = SUBJECTS[i];
  if (!s) return null;
  if (!s.startsWith('#')) return s.replace('{name}', name);
  const d = byId(s.slice(1));
  return d ? `your ${d.name.toLowerCase()}` : null;
}

/** A note's code, a fixed note's key or a phrase, if it's one we can read. */
export function isNote(code: unknown): code is string {
  return typeof code === 'string' && (Object.prototype.hasOwnProperty.call(GUEST_NOTES, code) || phraseOf(code) !== null);
}

/** A note in words, for a host whose rabbit is `name`. */
export function noteText(code: string, name: string): string {
  if (Object.prototype.hasOwnProperty.call(GUEST_NOTES, code)) return GUEST_NOTES[code as GuestNote].replace('{name}', name);
  const ph = phraseOf(code);
  if (!ph) return '';
  const opener = OPENERS[ph.o]!.replace('{name}', name);
  let subject = subjectText(ph.s, name) ?? '';
  // a new sentence after no opener or an exclamation; otherwise it carries on
  if (!opener || opener.endsWith('!')) subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  return [opener, subject, PRAISE[ph.p]].filter(Boolean).join(' ');
}

/**
 * The subjects to offer about a friend's place: the general ones that fit
 * (their garden only if they share it, and so on), then each piece of
 * theirs this version knows, once.
 */
export function subjectsFor(d: { items: { id: string }[]; garden?: { meadow: unknown[] | null; yard: Record<string, number> } }): number[] {
  const general = ['your burrow', '{name}', 'your decor', 'this place', 'visiting you', 'your style', 'your window', 'your wallpaper', 'your floor'];
  if (d.garden) general.push('your garden');
  if (d.garden?.meadow) general.push('your meadow');
  if (d.garden && Object.keys(d.garden.yard).length) general.push('your yard');
  const idx = (s: string) => (SUBJECTS as readonly string[]).indexOf(s);
  const pieces = [...new Set(d.items.map((i) => `#${i.id}`))].map(idx).filter((i) => i >= 0);
  return [...general.map(idx).sort((a, b) => a - b), ...pieces];
}

// ---------------------------------------------------------------- stamps
//
// Every signature carries a stamp, picked by the visitor from what they've
// collected (the first five anyone can use). Append-only, like the words.

export const STAMPS = [
  'heart', 'clover', 'carrot', 'sparkle', 'strawberry',
  'pebble', 'feather', 'acorn', 'flower', 'seaglass', 'shell', 'pinecone', 'button', 'marble', 'lucky', 'key', 'star',
  'snowflake', 'mitten', 'icicle', 'snowball', 'petal', 'bee', 'robinegg', 'ladybug', 'firefly', 'cherry', 'butterfly',
  'daisy', 'maple', 'conker', 'chestnut', 'wheat', 'candy', 'bat', 'cobweb', 'owlfeather', 'jingle', 'candycane',
  'gingerbread', 'holly', 'quill', 'rowan', 'thimble', 'lilypad', 'dewdrop', 'hazelnut', 'moonstone', 'goldleaf',
] as const;
const FREE_STAMPS = 5;

export function stampCode(id: string): string | null {
  const i = (STAMPS as readonly string[]).indexOf(id);
  return i < 0 ? null : `s${i.toString(36).padStart(2, '0')}`;
}

export function stampOf(code: unknown): string | null {
  if (typeof code !== 'string' || !/^s[0-9a-z]{2}$/.test(code)) return null;
  return STAMPS[parseInt(code.slice(1), 36)] ?? null;
}

export const isStamp = (id: unknown): id is string => typeof id === 'string' && (STAMPS as readonly string[]).includes(id);

/** The stamps she can sign with: the free ones, then each find or keepsake she has. */
export function stampsFor(s: PetState): string[] {
  return STAMPS.filter((id, i) => i < FREE_STAMPS || (s.collection?.[id] ?? 0) > 0);
}

// ---------------------------------------------------------------- a visit's kind

/** The kind to record for a visit: the care, then the note and the stamp if there are any. */
export function visitKind(care: string, note?: string | null, stamp?: string | null): string {
  const s = stamp ? stampCode(stamp) : null;
  return [care, note && isNote(note) ? note : null, s].filter(Boolean).join('-');
}

/** A visit's kind read back: its care, its note's code and its stamp, each if there. */
export function readKind(kind: unknown): { care: string; note: string | null; stamp: string | null } {
  const parts = typeof kind === 'string' ? kind.split('-') : [];
  const rest = parts.slice(1);
  return { care: parts[0] ?? '', note: rest.find((p) => isNote(p)) ?? null, stamp: rest.map(stampOf).find((s) => s) ?? null };
}

// ---------------------------------------------------------------- pins

/** Notes she can pin to her corkboard, for friends to see. */
export const MAX_PINS = 4;

/** Pin or unpin a signature. Pinning past MAX_PINS lets the oldest pin go. */
export function togglePin(pinned: string[] | undefined, visitUuid: string): string[] {
  const now = pinned ?? [];
  if (now.includes(visitUuid)) return now.filter((u) => u !== visitUuid);
  return [...now, visitUuid].slice(-MAX_PINS);
}

/** A pinned note as friends see it in her snapshot: whose rabbit, the note, the stamp and their coat. */
export interface PinShow { r: string; n: string; s?: string; c?: Coat }

/** Friends' pins, checked: notes we can read, names cut short, unknown stamps and coats dropped. */
export function readPins(raw: unknown): PinShow[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_PINS).flatMap((x: unknown) => {
    const p = x as Record<string, unknown> | null;
    if (!p || typeof p.r !== 'string' || !p.r || !isNote(p.n)) return [];
    return [{ r: p.r.slice(0, 16), n: p.n, ...(isStamp(p.s) ? { s: p.s } : {}), ...((COATS as readonly unknown[]).includes(p.c) ? { c: p.c as Coat } : {}) }];
  });
}

// ---------------------------------------------------------------- covers

export interface Cover { id: string; name: string; price: number; art: string }

/** Covers for her guest book (and the corkboard's card): bought once with clover, swapped freely. */
export const COVERS: Cover[] = [
  { id: 'classic', name: 'Classic', price: 0, art: 'book' },
  { id: 'meadow', name: 'Meadow', price: 300, art: 'clover' },
  { id: 'berry', name: 'Berry', price: 500, art: 'strawberry' },
  { id: 'starry', name: 'Starry night', price: 800, art: 'sparkle' },
  { id: 'autumn', name: 'Autumn leaves', price: 1200, art: 'maple' },
  { id: 'snowy', name: 'Snowfall', price: 1800, art: 'snowflake' },
];

export const coverById = (id: unknown): Cover | undefined => COVERS.find((c) => c.id === id);
export const ownsCover = (s: PetState, id: string): boolean => coverById(id)?.price === 0 || !!s.covers?.includes(id);
/** The cover on her book: one she owns, or the classic. */
export const coverOf = (s: PetState): string => (s.cover && ownsCover(s, s.cover) ? s.cover : 'classic');

export function buyCover(s: PetState, id: string): { ok: true; state: PetState } | { ok: false; reason: 'owned' | 'broke' | 'unknown' } {
  const c = coverById(id);
  if (!c) return { ok: false, reason: 'unknown' };
  if (ownsCover(s, id)) return { ok: false, reason: 'owned' };
  if (s.clover < c.price) return { ok: false, reason: 'broke' };
  const state = JSON.parse(JSON.stringify(s)) as PetState;
  state.clover -= c.price;
  state.covers = [...(state.covers ?? []), id];
  state.cover = id;
  return { ok: true, state };
}

export function useCover(s: PetState, id: string): PetState {
  if (!ownsCover(s, id)) return s;
  return { ...s, cover: id };
}
