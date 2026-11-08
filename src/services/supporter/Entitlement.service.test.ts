import { describe, expect, it } from 'bun:test';

import {
  membershipIsActive,
  subscriptionEntitlementEnd,
} from '@/services/supporter/Entitlement.service';
import { SUPPORTER_PLANS } from '@/services/supporter/plans';

describe('supporter entitlement boundaries', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('keeps past-due access until the period end', () => {
    const membership = {
      status: 'PAST_DUE',
      currentPeriodEnd: new Date('2026-01-02T00:00:00Z'),
    };
    expect(membershipIsActive(membership, now)).toBe(true);
    expect(membershipIsActive(membership, membership.currentPeriodEnd)).toBe(
      false,
    );
  });
  it('does not grant access to expired memberships', () => {
    for (const status of ['EXPIRED'])
      expect(
        membershipIsActive(
          { status, currentPeriodEnd: new Date('2026-02-01T00:00:00Z') },
          now,
        ),
      ).toBe(false);
    expect(membershipIsActive(null, now)).toBe(false);
  });
  it('uses the documented plan prices', () => {
    expect(
      Object.values(SUPPORTER_PLANS).map((plan) => plan.priceCents),
    ).toEqual([499, 1299, 499, 1399, 4999]);
  });
  it('carries banked gift time forward from the old provider period', () => {
    expect(
      subscriptionEntitlementEnd(
        new Date('2030-02-01T00:00:00Z'),
        new Date('2030-01-11T00:00:00Z'),
        new Date('2030-01-01T00:00:00Z'),
      ),
    ).toEqual(new Date('2030-02-11T00:00:00Z'));
    expect(
      subscriptionEntitlementEnd(
        new Date('2030-02-01T00:00:00Z'),
        new Date('2029-12-01T00:00:00Z'),
        new Date('2030-01-01T00:00:00Z'),
      ),
    ).toEqual(new Date('2030-02-01T00:00:00Z'));
  });
});
