import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { duesPaymentSchema } = await import('./ForceDues.service');

describe('dues payment quantity', () => {
  it('accepts paying a dues obligation above one million troops', () => {
    const payment = duesPaymentSchema.safeParse({
      obligationId: 1,
      quantity: 2_000_000,
      unitId: 1,
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(payment.success).toBe(true);
  });
});
