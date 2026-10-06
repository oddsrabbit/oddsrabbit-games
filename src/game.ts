// The casual board's rules, free of the DOM: checking a traced word against
// the day's lists, progress and milestones, and what gets submitted.

import { MIN_WORD } from './board';
import type { CasualContent } from './puzzle';
import { encodeMask, scoreFor } from './scoring';

/** One day's play, stored under the `today` key. */
export interface Progress {
  puzzleIndex: number;
  /** Required words the player found, in the order found. */
  found: string[];
  /** Bonus words the player found. */
  bonus: string[];
  /** Required words shown by a hint. They complete the list but never score. */
  revealed: string[];
  /** Best score sent to the server so far (0 = nothing sent). */
  submitted: number;
  /** Whether this board already counted toward the stats. */
  counted: { halfway: boolean; cleared: boolean };
  /** Start was pressed (the board stays hidden behind its start card until then). */
  started?: boolean;
}

export function freshProgress(puzzleIndex: number): Progress {
  return {
    puzzleIndex,
    found: [],
    bonus: [],
    revealed: [],
    submitted: 0,
    counted: { halfway: false, cleared: false },
  };
}

export function isProgress(v: unknown): v is Progress {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<Progress>;
  const strings = (x: unknown): boolean => Array.isArray(x) && x.every((w) => typeof w === 'string');
  return (
    typeof p.puzzleIndex === 'number' &&
    strings(p.found) &&
    strings(p.bonus) &&
    strings(p.revealed) &&
    typeof p.submitted === 'number' &&
    !!p.counted &&
    typeof p.counted.halfway === 'boolean' &&
    typeof p.counted.cleared === 'boolean'
  );
}

export type WordResult =
  | { kind: 'found'; word: string; star: boolean }
  | { kind: 'bonus'; word: string }
  | { kind: 'already'; word: string }
  | { kind: 'revealed'; word: string }
  | { kind: 'short'; word: string }
  | { kind: 'unknown'; word: string };

/** What a traced word means today. Doesn't change `progress`; see applyWord. */
export function checkWord(content: CasualContent, progress: Progress, word: string): WordResult {
  if (word.length < MIN_WORD) return { kind: 'short', word };
  if (content.words.includes(word)) {
    if (progress.found.includes(word)) return { kind: 'already', word };
    if (progress.revealed.includes(word)) return { kind: 'revealed', word };
    return { kind: 'found', word, star: word === content.star };
  }
  if (content.bonus.includes(word)) {
    return progress.bonus.includes(word) ? { kind: 'already', word } : { kind: 'bonus', word };
  }
  return { kind: 'unknown', word };
}

export function applyWord(progress: Progress, result: WordResult): void {
  if (result.kind === 'found') progress.found.push(result.word);
  else if (result.kind === 'bonus') progress.bonus.push(result.word);
}

/** Required words off the list, found or revealed. */
export function listed(progress: Progress): number {
  return progress.found.length + progress.revealed.length;
}

export function isCleared(content: CasualContent, progress: Progress): boolean {
  return listed(progress) >= content.words.length;
}

export function scoreOf(content: CasualContent, progress: Progress): number {
  return scoreFor(progress.found.length, content.words.length, progress.bonus.length);
}

/** The score submission's metadata: which words of each list were found. */
export function submissionMetadata(content: CasualContent, progress: Progress): { f: string; b: string } {
  return {
    f: encodeMask(content.words, new Set(progress.found)),
    b: encodeMask(content.bonus, new Set(progress.bonus)),
  };
}

export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

/** The highest milestone crossed going from `before` to `after` words listed, if any. */
export function milestoneCrossed(before: number, after: number, total: number): Milestone | null {
  let hit: Milestone | null = null;
  for (const m of MILESTONES) {
    const at = Math.ceil((total * m) / 100);
    if (before < at && after >= at) hit = m;
  }
  return hit;
}

/**
 * The next word a hint reveals: the shortest unlisted required word, so a hint
 * nudges rather than hands over the star word.
 */
export function nextReveal(content: CasualContent, progress: Progress): string | null {
  const done = new Set([...progress.found, ...progress.revealed]);
  const left = content.words.filter((w) => !done.has(w));
  left.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return left[0] ?? null;
}

// ---------- Stats ----------

export interface Stats {
  /** Boards that reached halfway. */
  played: number;
  /** Days with every required word listed, reveals included. */
  cleared: number;
  /** Days cleared with every word found by the player, no reveals. */
  perfect: number;
}

export const DEFAULT_STATS: Stats = { played: 0, cleared: 0, perfect: 0 };
