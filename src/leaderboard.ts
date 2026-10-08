// The Sprint's boards: Everyone on a day, the month (each player's best days,
// rated out of 1,000), and Friends. The casual board's: Everyone and Friends.

import type { FriendScore } from '@oddsrabbit/apps-sdk';
import { openLeaderboardModal, pinnedFromRank, type LeaderboardRow, type LeaderboardTab } from '@oddsrabbit/apps-sdk/ui/leaderboard';
import { createSeasonTab, currentPeriod, formatPeriod } from '@oddsrabbit/apps-sdk/ui/season';
import { casualRoundKey, DAY_MS, EPOCH_MS, roundKey } from './puzzle';
import { scoreLabel } from './scoring';
import { rowMeta, rowPoints } from './sprint-rules';
import { inviteShare, OR } from './ui';

const BOARD_LIMIT = 100;

const points = (row: LeaderboardRow): string => `${rowPoints(row.score, row.metadata).toLocaleString()} pts`;

/** "3 rare" once the day has closed: words only that player found. */
function badges(row: LeaderboardRow): string[] {
  const m = rowMeta(row.metadata);
  return m.sealed && m.unique ? [`✨ ${m.unique} rare`] : [];
}

function friendsRows(friends: FriendScore[]): LeaderboardRow[] {
  // Nobody but the viewer isn't a comparison: empty shows the invite prompt.
  if (friends.every((f) => f.isSelf)) return [];
  return friends.slice().sort((a, b) => b.score - a.score);
}

export function showSprintLeaderboard(index: number, today: number): void {
  const or = OR();
  const key = roundKey(index);
  const period = currentPeriod(new Date(EPOCH_MS + index * DAY_MS));
  const live = index >= today;
  const tabs: LeaderboardTab[] = [];

  if (or.capabilities.has('scores.top')) {
    tabs.push({
      id: 'everyone',
      label: live ? 'So far' : 'Everyone',
      emptyText: live ? 'Nobody has played today’s ranked board yet. Be the first.' : 'Nobody played this ranked board.',
      load: () => or.scores.top({ roundKey: key, order: 'top', limit: BOARD_LIMIT }),
      ...(or.capabilities.has('scores.rank')
        ? { loadPinned: () => or.scores.rank({ roundKey: key, order: 'top' }).then(pinnedFromRank) }
        : {}),
      formatValue: points,
      badges,
    });
  }

  // No `metric`: the server ranks each month by its own rule (best days).
  // Values are summed day ratings, each out of 1,000.
  if (or.capabilities.has('scores.season')) {
    tabs.push(
      createSeasonTab({
        label: 'Month',
        load: () => or.scores.season({ period, limit: BOARD_LIMIT }),
        ...(or.capabilities.has('scores.seasonRank') ? { loadRank: () => or.scores.seasonRank({ period }) } : {}),
        emptyText: `No finished ranked days in ${formatPeriod(period)} yet. The month updates after each day closes.`,
        formatValue: (value) => `${Math.round(value).toLocaleString()} pts`,
      })
    );
  }

  const invite = 'Invite friends or follow other players on OddsRabbit to race them.';
  tabs.push({
    id: 'friends',
    label: 'Friends',
    emptyText: invite,
    emptyPrompt: { blurb: invite, label: 'Invite a friend', onClick: () => void inviteShare() },
    load: () => or.scores.friends({ roundKey: key }).then(friendsRows),
    formatValue: points,
    badges,
    signInPrompt: or.user
      ? null
      : {
          blurb: 'Sign in to race the people you follow.',
          label: 'Sign in',
          onClick: () => void or.actions.requestSignIn('Race your friends on the ranked board'),
        },
  });

  openLeaderboardModal({
    title: live ? "Today's ranked board" : `Ranked #${index + 1}`,
    tabs,
    viewerUuid: or.user?.uuid ?? null,
    defaultTab: tabs[0]?.id,
  });
}

/** A casual board, untimed: by share of the everyday words found, bonus words breaking ties. */
export function showCasualLeaderboard(index: number, today: number): void {
  const or = OR();
  const key = casualRoundKey(index);
  const live = index >= today;
  const value = (row: LeaderboardRow): string => scoreLabel(row.score);
  const tabs: LeaderboardTab[] = [];

  if (or.capabilities.has('scores.top')) {
    tabs.push({
      id: 'everyone',
      label: live ? 'So far' : 'Everyone',
      emptyText: live ? 'Nobody has played today’s casual board yet. Be the first.' : 'Nobody played this casual board.',
      load: () => or.scores.top({ roundKey: key, order: 'top', limit: BOARD_LIMIT }),
      ...(or.capabilities.has('scores.rank')
        ? { loadPinned: () => or.scores.rank({ roundKey: key, order: 'top' }).then(pinnedFromRank) }
        : {}),
      formatValue: value,
    });
  }

  const invite = 'Invite friends or follow other players on OddsRabbit to see how they did.';
  tabs.push({
    id: 'friends',
    label: 'Friends',
    emptyText: invite,
    emptyPrompt: { blurb: invite, label: 'Invite a friend', onClick: () => void inviteShare() },
    load: () => or.scores.friends({ roundKey: key }).then(friendsRows),
    formatValue: value,
    signInPrompt: or.user
      ? null
      : {
          blurb: 'Sign in to see how the people you follow did.',
          label: 'Sign in',
          onClick: () => void or.actions.requestSignIn('See how your friends did on the casual board'),
        },
  });

  openLeaderboardModal({
    title: live ? "Today's casual board" : `Casual #${index + 1}`,
    tabs,
    viewerUuid: or.user?.uuid ?? null,
    defaultTab: tabs[0]?.id,
  });
}
