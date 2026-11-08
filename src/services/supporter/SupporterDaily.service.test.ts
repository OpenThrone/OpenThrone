import { beforeEach, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { runSupporterDaily } =
  await import('@/services/supporter/SupporterDaily.service');

const DAY = 86_400_000;

beforeEach(() => {
  delete process.env.PAYMENT_PROVIDER;
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.users = { update: vi.fn() };
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ status: 'ACTIVE' })),
  };
  mockPrisma.discordOutbox = { deleteMany: vi.fn() };
  mockPrisma.paymentEvent = { updateMany: vi.fn(), upsert: vi.fn() };
});

it('converts pools, lapses ended memberships and clears their badge', async () => {
  mockPrisma.allianceSponsorship = {
    findMany: vi.fn(async () => [{ allianceId: 4 }]),
    findUnique: vi.fn(async () => ({ poolCents: 1000, activeUntil: null })),
    update: vi.fn(),
  };
  const ended = new Date(Date.now() - DAY);
  let membership: any = {
    userId: 7,
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: ended,
    badgeVisible: true,
  };
  mockPrisma.supporterMembership = {
    // The billing sweep's query (renewing subscriptions) finds nothing here.
    findMany: vi.fn(async ({ where }: any) =>
      where.providerSubscriptionId ? [] : [{ userId: 7 }],
    ),
    findUnique: vi.fn(async () => membership),
    update: vi.fn(async ({ data }: any) => {
      membership = { ...membership, ...data };
      return membership;
    }),
  };

  const report = await runSupporterDaily();

  expect(report).toMatchObject({
    poolsConverted: 1,
    membershipsLapsed: 1,
    reconcile: null,
    errors: 0,
  });
  const pool = mockPrisma.allianceSponsorship.update.mock.calls[0][0].data;
  expect(pool.poolCents).toBe(2);
  expect(pool.activeUntil.getTime()).toBeGreaterThan(Date.now() + 59 * DAY);
  expect(
    mockPrisma.supporterMembership.findMany.mock.calls[0][0].where,
  ).toMatchObject({ status: { in: ['ACTIVE', 'PAST_DUE'] } });
  expect(membership.status).toBe('EXPIRED');
  expect(mockPrisma.users.update).toHaveBeenCalledWith({
    where: { id: 7 },
    data: { supporter_until: null },
  });
});

it('keeps going when one alliance fails', async () => {
  mockPrisma.allianceSponsorship = {
    findMany: vi.fn(async () => [{ allianceId: 1 }, { allianceId: 2 }]),
    findUnique: vi
      .fn()
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce({ poolCents: 499, activeUntil: null }),
    update: vi.fn(),
  };
  mockPrisma.supporterMembership = { findMany: vi.fn(async () => []) };
  const report = await runSupporterDaily();
  expect(report).toMatchObject({ poolsConverted: 1, errors: 1 });
});

it('stops renewals for banned accounts and cancels deleted ones at once', async () => {
  process.env.PAYMENT_PROVIDER = 'mock';
  mockPrisma.allianceSponsorship = { findMany: vi.fn(async () => []) };
  const rows: Record<number, any> = {
    1: { userId: 1, status: 'ACTIVE', cancelAtPeriodEnd: false },
    2: { userId: 2, status: 'ACTIVE', cancelAtPeriodEnd: false },
    3: { userId: 3, status: 'ACTIVE', cancelAtPeriodEnd: false },
    // Perks already lapsed and a cancel was scheduled, but the account was
    // deleted: billing must still stop at once.
    4: { userId: 4, status: 'EXPIRED', cancelAtPeriodEnd: true },
    // Live account whose address is on the reserved domain: not erased.
    5: { userId: 5, status: 'ACTIVE', cancelAtPeriodEnd: false },
  };
  for (const row of Object.values(rows))
    Object.assign(row, {
      provider: 'mock',
      providerSubscriptionId: `sub_${row.userId}`,
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
      badgeVisible: true,
    });
  mockPrisma.supporterMembership = {
    findMany: vi.fn(async ({ where }: any) =>
      where.providerSubscriptionId
        ? [
            { userId: 1, user: { anonymizedAt: null } },
            { userId: 2, user: { anonymizedAt: new Date() } },
            { userId: 3, user: { anonymizedAt: null } },
            { userId: 4, user: { anonymizedAt: new Date() } },
            // Live account whose address is on the reserved domain: not erased.
            { userId: 5, user: { anonymizedAt: null } },
          ]
        : [],
    ),
    findUnique: vi.fn(async ({ where }: any) => rows[where.userId]),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(rows[where.userId], data),
    ),
  };
  mockPrisma.accountStatusHistory = {
    findFirst: vi.fn(async ({ where }: any) =>
      where.user_id === 1 ? { status: 'BANNED', end_date: null } : null,
    ),
  };

  const report = await runSupporterDaily();

  expect(report).toMatchObject({ billingEnded: 3, errors: 0 });
  expect(
    mockPrisma.supporterMembership.findMany.mock.calls.at(-1)[0].where,
  ).toMatchObject({ status: { not: 'CANCELED' } });
  expect(rows[4]).toMatchObject({ status: 'CANCELED' });
  expect(rows[1]).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true });
  expect(rows[2]).toMatchObject({
    status: 'CANCELED',
    cancelAtPeriodEnd: true,
  });
  expect(rows[2].currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now());
  expect(rows[3]).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false });
  expect(rows[5]).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false });
});

it('records a failed billing stop for admins and retries it the next day', async () => {
  const { endSupporterBilling } =
    await import('@/services/supporter/AccountBilling.service');
  const { MockProvider } = await import('@/services/supporter/MockProvider');
  process.env.PAYMENT_PROVIDER = 'mock';
  mockPrisma.supporterMembership = {
    findUnique: vi.fn(async () => ({
      userId: 9,
      status: 'ACTIVE',
      provider: 'mock',
      providerSubscriptionId: 'sub_mock_9',
    })),
  };
  const spy = vi
    .spyOn(MockProvider.prototype, 'cancelSubscription')
    .mockRejectedValue(new Error('provider down'));
  await expect(endSupporterBilling(9, 'period_end')).rejects.toThrow(
    'provider down',
  );
  expect(mockPrisma.paymentEvent.upsert.mock.calls[0][0]).toMatchObject({
    where: { providerEventId: 'billing-stop:9' },
    create: { type: 'billing.stop', status: 'FAILED' },
  });
  spy.mockRestore();
});

it('names each failed billing stop and its cause in the report', async () => {
  const { MockProvider } = await import('@/services/supporter/MockProvider');
  process.env.PAYMENT_PROVIDER = 'mock';
  mockPrisma.allianceSponsorship = { findMany: vi.fn(async () => []) };
  mockPrisma.supporterMembership = {
    findMany: vi.fn(async ({ where }: any) =>
      where.providerSubscriptionId
        ? [{ userId: 1, user: { anonymizedAt: new Date() } }]
        : [],
    ),
    findUnique: vi.fn(async () => ({
      userId: 1,
      status: 'ACTIVE',
      provider: 'mock',
      providerSubscriptionId: 'sub_1',
    })),
  };
  const spy = vi
    .spyOn(MockProvider.prototype, 'cancelSubscription')
    .mockRejectedValue(new Error('provider down for a@b.example'));
  const report = await runSupporterDaily();
  spy.mockRestore();

  expect(report.errors).toBe(1);
  // Id and redacted cause only: never the address inside the message.
  expect(report.failures).toEqual(['billing 1: provider down for [email]']);
});
