// What's saved for the player: each page's fills, the "keep coloring" list,
// recent and favourite fills, and whether today's page was posted.
//
// A session is today's page (`day-N`: its own copy, so a page that comes
// round again in the rotation starts blank), a library page (`page-<slug>`),
// or one of the player's own pictures (`mine-<id>`, kept on this device with
// the picture; see mine.ts).
//
// Account storage holds 64 KB per game, so only the last few days' `day-N`
// keys are kept; older ones are deleted as new days are saved.

import { packColoring, unpackColoring, type Fill, type PackedColoring } from './fills';
import { readJson, removeJson, writeJson } from './ui';

export type SessionKey = `day-${number}` | `page-${string}` | `mine-${string}`;

export interface Session {
  key: SessionKey;
  slug: string;
  /** Set for today's page. */
  day: number | null;
}

interface SavedProgress extends PackedColoring {
  slug: string;
  /** Seconds spent coloring. */
  t: number;
  /** Set once posted to that day's gallery. */
  posted?: boolean;
  at: number;
}

export interface Progress {
  fills: Array<Fill | null>;
  seconds: number;
  posted: boolean;
}

export interface WipEntry {
  key: SessionKey;
  slug: string;
  filled: number;
  total: number;
  at: number;
}

const WIP_MAX = 12;
const DAYS_KEPT = 7;

const isLocal = (key: SessionKey) => key.startsWith('mine-');

export async function loadProgress(s: Session, regionCount: number): Promise<Progress> {
  const saved = await readJson<SavedProgress | null>(s.key, null, isLocal(s.key));
  const fills = saved?.slug === s.slug ? unpackColoring(saved, regionCount) : null;
  return {
    fills: fills ?? Array.from({ length: regionCount }, () => null),
    seconds: saved && Number.isFinite(saved.t) ? saved.t : 0,
    posted: saved?.posted === true,
  };
}

export async function saveProgress(s: Session, p: Progress): Promise<void> {
  const packed = packColoring(p.fills);
  const value: SavedProgress = { slug: s.slug, ...packed, t: Math.round(p.seconds), at: Date.now() };
  if (p.posted) value.posted = true;
  await writeJson(s.key, value, isLocal(s.key));
  if (s.day !== null) await noteDay(s.day);
  // Library pages in progress only: today's page has its own card, and the
  // player's own pictures their own shelf.
  if (s.day !== null || isLocal(s.key)) return;
  const filled = p.fills.filter(Boolean).length;
  const total = p.fills.length;
  const wip = (await loadWip()).filter((w) => w.key !== s.key);
  if (filled > 0 && filled < total) wip.unshift({ key: s.key, slug: s.slug, filled, total, at: Date.now() });
  await writeJson('wip', wip.slice(0, WIP_MAX));
}

/** Records a day with saved progress, and deletes all but the latest few. */
const notedDays = new Set<number>();
async function noteDay(day: number): Promise<void> {
  if (notedDays.has(day)) return;
  notedDays.add(day);
  const days = (await readJson<number[]>('days', [])).filter(Number.isInteger);
  if (days.includes(day)) return;
  const all = [day, ...days].sort((a, b) => b - a);
  await writeJson('days', all.slice(0, DAYS_KEPT));
  await Promise.all(all.slice(DAYS_KEPT).map((d) => removeJson(`day-${d}`)));
}

/** Forgets a deleted picture's progress. */
export function forgetProgress(key: SessionKey): Promise<void> {
  return removeJson(key, isLocal(key));
}

export async function loadWip(): Promise<WipEntry[]> {
  const list = await readJson<WipEntry[]>('wip', []);
  return Array.isArray(list) ? list.filter((w) => w && typeof w.slug === 'string' && typeof w.key === 'string') : [];
}

export interface ColorPrefs {
  recent: Fill[];
  favs: Fill[];
}

export const RECENT_MAX = 6;
export const FAVS_MAX = 10;

const DEFAULT_COLORS: ColorPrefs = {
  recent: ['#e8746a', '#f4d27a', '#9bcb6b', '#7fb7e6', '#b48ce0', '#9c6b47'],
  favs: [],
};

export async function loadColors(): Promise<ColorPrefs> {
  const c = await readJson<ColorPrefs | null>('colors', null);
  if (!c || !Array.isArray(c.recent) || !Array.isArray(c.favs)) return { ...DEFAULT_COLORS, recent: [...DEFAULT_COLORS.recent] };
  return { recent: c.recent.slice(0, RECENT_MAX), favs: c.favs.slice(0, FAVS_MAX) };
}

export function saveColors(c: ColorPrefs): Promise<void> {
  return writeJson('colors', c);
}

export function pushRecent(c: ColorPrefs, f: Fill): void {
  c.recent = [f, ...c.recent.filter((x) => x !== f)].slice(0, RECENT_MAX);
}
