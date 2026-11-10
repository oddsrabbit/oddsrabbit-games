// The day's board: everyone who played today's puzzle, and the people you
// follow. The shared leaderboard (src/ui/leaderboard.ts), as in Word Rush; its
// stylesheet is ../leaderboard-v1.css, themed by the --lb-* aliases in
// styles.css.
//
// It ranks by hints, gently. A solve scores 100 less its hints, and equal
// scores share a place, so everyone who solved without a hint is first
// together: the board reads as "clean solve, a hint or two, more" rather than
// a race. There's no clock to rank by, on purpose. Starting the day puts you
// on the board too, as "Not solved yet" with no place, as Solitaire does, so
// the board shows who's had a go as well as who got there.

import type { FriendScore } from '@oddsrabbit/apps-sdk';
import { openLeaderboardModal, pinnedFromRank, type LeaderboardRow, type LeaderboardTab } from '@oddsrabbit/apps-sdk/ui/leaderboard';
import { roundKey } from './puzzle';
import { OR, SHARE_URL } from './ui';

const BOARD_LIMIT = 100;

/**
 * A day started but not solved. Below every solve, so it sorts last and
 * holds no place. Sent with `keepBest`, so the solve replaces it.
 */
export const UNSOLVED_SCORE = 0;

/**
 * A solve's score: 100 less its hints, never below 1, so fewer hints rank
 * higher and every solve ranks above every unsolved row. The server bounds
 * the range to 0..100 (`AppScoreBounds`, web repo). Launch-day rows were all
 * 1 whatever their hints; see `upgradeLaunchRow` in main.ts.
 */
export function solveScore(hints: number): number {
  const n = Number.isFinite(hints) ? Math.max(0, Math.round(hints)) : 0;
  return 100 - Math.min(n, 99);
}

/** Whether a row is a solve rather than a day started. */
export const isSolvedRow = (row: { score: number }): boolean => row.score > UNSOLVED_SCORE;

/** "No hints", "1 hint", "3 hints"; nothing when the row doesn't say. */
export function hintsLabel(metadata: Record<string, unknown> | null): string {
  const n = metadata?.hints;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  return n === 0 ? 'No hints' : n === 1 ? '1 hint' : `${Math.round(n)} hints`;
}

/** What a row says beside the name. */
export function rowLabel(row: Pick<LeaderboardRow, 'score' | 'metadata'>): string {
  return isSolvedRow(row) ? hintsLabel(row.metadata) : 'Not solved yet';
}

/**
 * The server's order: highest score first, then whoever got on the board
 * first. Just the viewer isn't a comparison, so that's empty (the invite).
 */
export function friendsRows(rows: FriendScore[]): FriendScore[] {
  if (rows.every((r) => r.isSelf)) return [];
  return rows.slice().sort((a, b) => b.score - a.score || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Whether there's any board to open here. */
export function hasBoard(canSignIn: boolean): boolean {
  const caps = OR().capabilities;
  return caps.has('scores.top') || (caps.has('scores.friends') && (OR().user !== null || canSignIn));
}

export function showSolvers(index: number, canSignIn: boolean): void {
  const or = OR();
  const key = roundKey(index);
  const tabs: LeaderboardTab[] = [];
  const shared = { rankTies: true, ranked: isSolvedRow, formatValue: rowLabel } as const;

  if (or.capabilities.has('scores.top')) {
    tabs.push({
      id: 'everyone',
      label: 'Everyone',
      emptyText: 'Nobody has played it yet. Be the first.',
      load: () => or.scores.top({ roundKey: key, order: 'top', limit: BOARD_LIMIT }),
      // A place is pinned for a solve only: an unsolved row holds none.
      ...(or.capabilities.has('scores.rank')
        ? {
            loadPinned: () =>
              or.scores.rank({ roundKey: key, order: 'top' }).then((r) => (r && isSolvedRow(r.entry) ? pinnedFromRank(r) : null)),
          }
        : {}),
      ...shared,
    });
  }

  // A guest who can't sign in here has no friends board to be offered.
  if (or.capabilities.has('scores.friends') && (or.user || canSignIn)) {
    const invite = 'Nobody you follow has played it yet. Invite a friend to play along.';
    tabs.push({
      id: 'friends',
      label: 'Friends',
      emptyText: invite,
      emptyPrompt: {
        blurb: invite,
        label: 'Invite a friend',
        onClick: () => void or.actions.share({ text: `Solve today's Rabbit Sudoku with me. ${SHARE_URL}` }).catch(() => undefined),
      },
      load: () => or.scores.friends({ roundKey: key }).then(friendsRows),
      ...shared,
      signInPrompt: or.user
        ? null
        : {
            blurb: 'Sign in to see how the people you follow did.',
            label: 'Sign in',
            onClick: () => void or.actions.requestSignIn('See how your friends did on today’s sudoku'),
          },
    });
  }
  if (!tabs.length) return;

  // The status bar sits on the scrim while the board is up (styles.css).
  document.documentElement.setAttribute('data-board', '');
  openLeaderboardModal({
    title: `Daily #${index + 1}`,
    tabs,
    viewerUuid: or.user?.uuid ?? null,
    defaultTab: tabs[0]!.id,
    onClose: () => document.documentElement.removeAttribute('data-board'),
  });
}
