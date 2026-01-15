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
});
