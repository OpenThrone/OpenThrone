import { describe, expect, it } from 'bun:test';

import {
  createInactivityErasureToken,
  verifyInactivityErasureToken,
} from '@/utils/inactivityErasureToken';
import { createUnsubscribeToken } from '@/utils/unsubscribeToken';

describe('inactivity erasure link token', () => {
  const warnedAt = new Date('2026-11-08T12:00:00.000Z');

  it('round-trips the player and the notice date', () => {
    expect(
      verifyInactivityErasureToken(createInactivityErasureToken(7, warnedAt)),
    ).toEqual({ userId: 7, warnedAt: warnedAt.getTime() });
  });

  it('rejects forged, swapped and malformed tokens', () => {
    const token = createInactivityErasureToken(7, warnedAt);
    const [payload, signature] = token.split('.');
    const [otherPayload] = createInactivityErasureToken(8, warnedAt).split('.');
    expect(
      verifyInactivityErasureToken(`${otherPayload}.${signature}`),
    ).toBeNull();
    expect(verifyInactivityErasureToken(`${payload}.${signature}x`)).toBeNull();
    expect(verifyInactivityErasureToken(payload)).toBeNull();
    expect(verifyInactivityErasureToken('')).toBeNull();
    expect(verifyInactivityErasureToken('a.b.c')).toBeNull();
  });

  it('never accepts an unsubscribe link signed with the same secret', () => {
    expect(
      verifyInactivityErasureToken(createUnsubscribeToken(7, 'NEWS')),
    ).toBeNull();
  });
});
