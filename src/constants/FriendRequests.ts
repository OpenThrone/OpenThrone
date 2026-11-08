/**
 * Limits on repeating social requests, so a player who has been told no can't
 * keep asking. Cooldown, decline limit and daily cap are runtime settings.
 */
export const FRIEND_REQUEST_COOLDOWN_DAYS_DEFAULT = 7;
export const FRIEND_REQUEST_MAX_DECLINES_DEFAULT = 3;
export const FRIEND_REQUEST_DAILY_CAP_DEFAULT = 20;
/** Fixed: long enough to stop request-and-cancel pings, short enough for a misclick. */
export const FRIEND_REQUEST_CANCEL_COOLDOWN_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export type FriendRequestRules = {
  cooldownDays: number;
  /** Declines before only the other player can restart contact. 0 turns this off. */
  maxDeclines: number;
};

export type FriendRequestHistoryRow = {
  id: number;
  playerId: number;
  relationshipType: string;
  status: string;
  acceptanceDate: Date | null;
  endDate: Date | null;
};

export type FriendRequestBlock =
  | { reason: 'cooldown'; retryAt: Date }
  | { reason: 'declined_limit'; retryAt: null };

/**
 * Why `senderId` can't send a new request to the other player in `history`,
 * or null when they can. `history` holds every row between the pair.
 *
 * A decline binds only the player who was declined: whoever said no can still
 * reach out. An ended friendship binds both sides, so neither can cycle it.
 */
export const getFriendRequestBlock = (
  history: FriendRequestHistoryRow[],
  senderId: number,
  rules: FriendRequestRules,
  now: Date = new Date(),
): FriendRequestBlock | null => {
  const lastFriendshipId = Math.max(
    0,
    ...history
      .filter((row) => row.acceptanceDate && row.relationshipType === 'FRIEND')
      .map((row) => row.id),
  );
  const declines = history.filter(
    (row) =>
      row.status === 'declined' &&
      row.playerId === senderId &&
      row.id > lastFriendshipId,
  ).length;
  if (rules.maxDeclines > 0 && declines >= rules.maxDeclines) {
    return { reason: 'declined_limit', retryAt: null };
  }

  const waitHours = (row: FriendRequestHistoryRow): number => {
    const ownRequest = row.playerId === senderId;
    if (row.status === 'ended') return rules.cooldownDays * 24;
    if (row.status === 'declined' && ownRequest) return rules.cooldownDays * 24;
    if (row.status === 'cancelled' && ownRequest) {
      return FRIEND_REQUEST_CANCEL_COOLDOWN_HOURS;
    }
    return 0;
  };

  const retryAt = history.reduce((latest, row) => {
    if (!row.endDate) return latest;
    return Math.max(latest, row.endDate.getTime() + waitHours(row) * HOUR_MS);
  }, 0);

  return retryAt > now.getTime()
    ? { reason: 'cooldown', retryAt: new Date(retryAt) }
    : null;
};
