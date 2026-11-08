import { describe, expect, it } from 'bun:test';

import {
  FRIEND_REQUEST_CANCEL_COOLDOWN_HOURS,
  type FriendRequestHistoryRow,
  getFriendRequestBlock,
} from './FriendRequests';

const SENDER = 1;
const OTHER = 2;
const RULES = { cooldownDays: 7, maxDeclines: 3 };
const NOW = new Date('2026-11-06T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const row = (
  id: number,
  playerId: number,
  status: string,
  endDate: Date | null,
  acceptanceDate: Date | null = null,
  relationshipType = 'FRIEND',
): FriendRequestHistoryRow => ({
  id,
  playerId,
  relationshipType,
  status,
  endDate,
  acceptanceDate,
});

const block = (history: FriendRequestHistoryRow[], senderId = SENDER) =>
  getFriendRequestBlock(history, senderId, RULES, NOW);

describe('getFriendRequestBlock', () => {
  it('allows a first request', () => {
    expect(block([])).toBeNull();
  });

  it('holds back a declined sender until the cooldown passes', () => {
    const history = [row(1, SENDER, 'declined', daysAgo(2))];
    expect(block(history)).toEqual({
      reason: 'cooldown',
      retryAt: new Date(daysAgo(2).getTime() + 7 * DAY_MS),
    });
    expect(block([row(1, SENDER, 'declined', daysAgo(8))])).toBeNull();
  });

  it('never holds back the player who said no', () => {
    expect(block([row(1, OTHER, 'declined', daysAgo(1))])).toBeNull();
  });

  it('holds back both sides after a friendship ends', () => {
    const history = [row(1, OTHER, 'ended', daysAgo(1), daysAgo(9))];
    expect(block(history)?.reason).toBe('cooldown');
    expect(block(history, OTHER)?.reason).toBe('cooldown');
  });

  it('closes the door after the decline limit, even past the cooldown', () => {
    const history = [
      row(3, SENDER, 'declined', daysAgo(30)),
      row(2, SENDER, 'declined', daysAgo(40)),
      row(1, SENDER, 'declined', daysAgo(50)),
    ];
    expect(block(history)).toEqual({ reason: 'declined_limit', retryAt: null });
    // The player who declined can still start over.
    expect(block(history, OTHER)).toBeNull();
  });

  it('forgets earlier declines once the pair has been friends', () => {
    const history = [
      row(4, SENDER, 'ended', daysAgo(30), daysAgo(35)),
      row(3, SENDER, 'declined', daysAgo(40)),
      row(2, SENDER, 'declined', daysAgo(50)),
      row(1, SENDER, 'declined', daysAgo(60)),
    ];
    expect(block(history)).toBeNull();
  });

  it('keeps counting declines after an accepted enemy relationship', () => {
    const history = [
      row(4, OTHER, 'ended', daysAgo(30), daysAgo(40), 'ENEMY'),
      row(3, SENDER, 'declined', daysAgo(50)),
      row(2, SENDER, 'declined', daysAgo(60)),
      row(1, SENDER, 'declined', daysAgo(70)),
    ];
    expect(block(history)).toEqual({
      reason: 'declined_limit',
      retryAt: null,
    });
  });

  it('a decline limit of 0 turns that rule off', () => {
    const history = [
      row(2, SENDER, 'declined', daysAgo(30)),
      row(1, SENDER, 'declined', daysAgo(40)),
    ];
    expect(
      getFriendRequestBlock(
        history,
        SENDER,
        { cooldownDays: 7, maxDeclines: 0 },
        NOW,
      ),
    ).toBeNull();
    expect(
      getFriendRequestBlock(
        history,
        SENDER,
        { cooldownDays: 7, maxDeclines: 2 },
        NOW,
      )?.reason,
    ).toBe('declined_limit');
  });

  it('holds back the canceller briefly, and only them', () => {
    const cancelled = new Date(NOW.getTime() - 1000);
    const history = [row(1, SENDER, 'cancelled', cancelled)];
    expect(block(history)).toEqual({
      reason: 'cooldown',
      retryAt: new Date(
        cancelled.getTime() +
          FRIEND_REQUEST_CANCEL_COOLDOWN_HOURS * 60 * 60 * 1000,
      ),
    });
    expect(block(history, OTHER)).toBeNull();
    expect(block([row(1, SENDER, 'cancelled', daysAgo(2))])).toBeNull();
  });

  it('a cancelled retry cannot shorten a decline cooldown', () => {
    const history = [
      row(2, SENDER, 'cancelled', daysAgo(2)),
      row(1, SENDER, 'declined', daysAgo(3)),
    ];
    expect(block(history)).toEqual({
      reason: 'cooldown',
      retryAt: new Date(daysAgo(3).getTime() + 7 * DAY_MS),
    });
  });
});
