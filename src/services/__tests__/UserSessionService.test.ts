import { describe, expect, it } from 'bun:test';

const { UserSessionService } = require('../UserSessionService');

describe('UserSessionService', () => {
  it('isOnline returns false with no lastActive', () => {
    const s = new UserSessionService({});
    expect(s.isOnline()).toBe(false);
  });

  it('isOnline returns true for recent lastActive', () => {
    const now = new Date();
    const s = new UserSessionService({ last_active: now.toISOString() });
    expect(s.isOnline(1)).toBe(true);
  });

  it('getTimeToNextTurn rounds to next 30 minutes', () => {
    const s = new UserSessionService({ last_active: new Date() });
    const next = s.getTimeToNextTurn(new Date(0));
    expect(next.getTime() % 1800000).toBe(0);
  });

  it('getTimeToNextTurn follows the configured turn interval (#278)', () => {
    const previous = process.env.NEXT_PUBLIC_TURN_INTERVAL_MINUTES;
    process.env.NEXT_PUBLIC_TURN_INTERVAL_MINUTES = '5';
    try {
      const s = new UserSessionService({});
      const next = s.getTimeToNextTurn(new Date(Date.UTC(2026, 0, 1, 0, 1)));
      expect(next.toISOString()).toBe('2026-01-01T00:05:00.000Z');
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_TURN_INTERVAL_MINUTES;
      } else {
        process.env.NEXT_PUBLIC_TURN_INTERVAL_MINUTES = previous;
      }
    }
  });
});
