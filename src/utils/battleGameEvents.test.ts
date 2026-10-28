import { describe, expect, it } from 'bun:test';

import { readBattleGameEvents } from '@/utils/battleGameEvents';

const snapshot = {
  version: 1,
  capturedAt: '2026-10-22T22:40:12.565Z',
  appliedXpMultiplier: 2,
  events: [
    {
      id: 25,
      name: 'Double XP',
      startsAt: '2026-10-22T22:36:00.000Z',
      endsAt: null,
      effects: { xpMultiplier: 2 },
    },
  ],
};

describe('historical battle game events', () => {
  it('distinguishes an older missing snapshot from a recorded event-free battle', () => {
    expect(readBattleGameEvents(undefined)).toBeNull();
    expect(
      readBattleGameEvents({ ...snapshot, events: [], appliedXpMultiplier: 1 })
        ?.events,
    ).toEqual([]);
  });
  it('retains event facts and removes unapproved administrative fields', () => {
    const result = readBattleGameEvents({
      ...snapshot,
      internalNotes: 'private',
      events: [{ ...snapshot.events[0], createdByUserId: 99 }],
    });
    expect(result).toEqual(snapshot);
  });
  it('rejects malformed multipliers and unrecognized event effects', () => {
    expect(
      readBattleGameEvents({ ...snapshot, appliedXpMultiplier: Infinity }),
    ).toBeNull();
    expect(
      readBattleGameEvents({
        ...snapshot,
        events: [{ ...snapshot.events[0], effects: { secret: 'invalid' } }],
      }),
    ).toBeNull();
  });
});
