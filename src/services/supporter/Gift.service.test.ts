import { beforeEach, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { giftExpiry, redeemGift } =
  await import('@/services/supporter/Gift.service');
beforeEach(() => {
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.giftCode = {
    findUnique: vi.fn().mockResolvedValue({ id: 1, months: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
});
it('refuses expired, revoked, and already redeemed gifts using an atomic availability predicate', async () => {
  await expect(redeemGift(2, 'OT-TEST')).rejects.toThrow('unavailable');
  const { where } = mockPrisma.giftCode.updateMany.mock.calls[0][0];
  expect(where).toMatchObject({
    id: 1,
    redeemedAt: null,
    revokedAt: null,
    // Null expiry means the code never expires.
    OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
  });
});

it('keeps paid gift codes for 5 years, and forever where state law requires', () => {
  const now = new Date('2026-10-29T00:00:00Z');
  expect(giftExpiry({ country: 'US', state: 'TX' }, now)).toEqual(
    new Date('2031-10-29T00:00:00Z'),
  );
  for (const billing of [
    { country: 'US', state: 'CA' },
    { country: 'US', state: 'wa' },
    { country: 'US', state: null },
    { country: null, state: null },
    { country: 'CA', state: 'ON' },
  ])
    expect(giftExpiry(billing, now)).toBeNull();
});
