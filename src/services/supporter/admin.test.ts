import { describe, expect, it } from 'bun:test';

import { actionSchema } from '@/services/supporter/admin';

describe('supporter admin action validation', () => {
  it('rejects invalid comp durations and missing reasons', () => {
    for (const days of [0, 1.5, 3651])
      expect(
        actionSchema.safeParse({ action: 'comp', days, reason: 'test' })
          .success,
      ).toBe(false);
    expect(
      actionSchema.safeParse({ action: 'revoke', reason: '  ' }).success,
    ).toBe(false);
  });
  it('rejects nonpositive refunds', () => {
    expect(
      actionSchema.safeParse({
        action: 'refund',
        paymentId: 1,
        amountCents: 0,
        reason: 'test',
      }).success,
    ).toBe(false);
  });
});
