// Who solved a day's puzzle: everyone, in the order they solved it, and the
// people you follow. The shared leaderboard (src/ui/leaderboard.ts), as in
// Word Rush; its stylesheet is ../leaderboard-v1.css, themed by the --lb-*
// aliases in styles.css.
//
// Every solve scores 1 (no clock), so there's no score to rank by. The boards
// go by who finished first, which is also a list that only ever grows at the
// bottom, and each row shows how many hints it took.

import type { FriendScore } from '@oddsrabbit/apps-sdk';
import { openLeaderboardModal, pinnedFromRank, type LeaderboardRow, type LeaderboardTab } from '@oddsrabbit/apps-sdk/ui/leaderboard';
import { roundKey } from './puzzle';
import { OR, SHARE_URL } from './ui';

const BOARD_LIMIT = 100;

/** "No hints", "1 hint", "3 hints"; nothing when the row doesn't say. */
export function hintsLabel(metadata: Record<string, unknown> | null): string {
  const n = metadata?.hints;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  return n === 0 ? 'No hints' : n === 1 ? '1 hint' : `${Math.round(n)} hints`;
}

/** Earliest first. Just the viewer isn't a comparison, so that's empty (the invite). */
export function friendsRows(rows: FriendScore[]): FriendScore[] {
  if (rows.every((r) => r.isSelf)) return [];
  return rows.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Whether there's any board to open here. */
export function hasBoard(canSignIn: boolean): boolean {
  const caps = OR().capabilities;
  return caps.has('scores.top') || (caps.has('scores.friends') && (OR().user !== null || canSignIn));
}

export function showSolvers(index: number, canSignIn: boolean): void {
  const or = OR();
  const key = roundKey(index);
  const value = (row: LeaderboardRow): string => hintsLabel(row.metadata);
  const tabs: LeaderboardTab[] = [];

  if (or.capabilities.has('scores.top')) {
    tabs.push({
      id: 'everyone',
      label: 'Everyone',
      emptyText: 'Nobody has solved it yet. Be the first.',
      load: () => or.scores.top({ roundKey: key, order: 'first', limit: BOARD_LIMIT }),
      ...(or.capabilities.has('scores.rank')
        ? { loadPinned: () => or.scores.rank({ roundKey: key, order: 'first' }).then(pinnedFromRank) }
        : {}),
      // Places by time, so no two share one.
      rankTies: false,
      formatValue: value,
    });
  }

  // A guest who can't sign in here has no friends board to be offered.
  if (or.capabilities.has('scores.friends') && (or.user || canSignIn)) {
    const invite = 'Nobody you follow has solved it yet. Invite a friend to play along.';
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
      rankTies: false,
      formatValue: value,
      signInPrompt: or.user
        ? null
        : {
            blurb: 'Sign in to see which of the people you follow solved it.',
            label: 'Sign in',
            onClick: () => void or.actions.requestSignIn('See which friends solved today’s sudoku'),
          },
    });
  }
  if (!tabs.length) return;

  // The status bar sits on the scrim while the board is up (styles.css).
  document.documentElement.setAttribute('data-board', '');
  openLeaderboardModal({
    title: `Solved Daily #${index + 1}`,
    tabs,
    viewerUuid: or.user?.uuid ?? null,
    defaultTab: tabs[0]!.id,
    onClose: () => document.documentElement.removeAttribute('data-board'),
  });
}
