import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { processPaymentEvent, replay } =
  await import('@/services/supporter/PaymentEvents.service');

beforeEach(() => {
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.paymentEvent = {
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  mockPrisma.payment = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  mockPrisma.supporterMembership = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  };
  mockPrisma.users = { update: vi.fn(), findUnique: vi.fn() };
  mockPrisma.paymentRefund = { create: vi.fn(), findUnique: vi.fn() };
  mockPrisma.giftCode = { updateMany: vi.fn() };
});

describe('payment event inbox', () => {
  it('returns the existing event on duplicate delivery without applying an effect', async () => {
    const existing = { id: 1, status: 'PROCESSED' };
    mockPrisma.paymentEvent.create.mockRejectedValue({ code: 'P2002' });
    mockPrisma.paymentEvent.findUniqueOrThrow.mockResolvedValue(existing);
    expect(
      (
        await processPaymentEvent({
          provider: 'mock',
          providerEventId: 'one',
          type: 'charge.refunded',
          summary: { paymentId: 3, amountCents: 100 },
        })
      ).event,
    ).toEqual(existing);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('replays a failed partial refund once', async () => {
    const event = {
      id: 1,
      provider: 'mock',
      status: 'FAILED',
      type: 'charge.refunded',
      summary: { paymentId: 3, amountCents: 100 },
    };
    mockPrisma.paymentEvent.findUniqueOrThrow.mockResolvedValue(event);
    mockPrisma.paymentEvent.update.mockResolvedValue({
      ...event,
      status: 'PROCESSED',
    });
    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      id: 3,
      provider: 'mock',
      userId: 4,
      kind: 'GIFT',
      status: 'SUCCEEDED',
      amountCents: 499,
      refundedCents: 0,
    });
    await replay(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'PARTIALLY_REFUNDED', refundedCents: 100 },
    });
    expect(mockPrisma.paymentRefund.create).toHaveBeenCalledTimes(1);
    // A partial refund leaves the gift code redeemable.
    expect(mockPrisma.giftCode.updateMany).not.toHaveBeenCalled();
  });
  it('revokes an unredeemed gift after a full refund', async () => {
    const event = {
      id: 2,
      provider: 'mock',
      status: 'RECEIVED',
      type: 'charge.refunded',
      summary: { paymentId: 3, amountCents: 399 },
    };
    mockPrisma.paymentEvent.create.mockResolvedValue(event);
    mockPrisma.paymentEvent.findUniqueOrThrow.mockResolvedValue(event);
    mockPrisma.paymentEvent.update.mockResolvedValue({
      ...event,
      status: 'PROCESSED',
    });
    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      id: 3,
      provider: 'mock',
      userId: 4,
      kind: 'GIFT',
      status: 'PARTIALLY_REFUNDED',
      amountCents: 499,
      refundedCents: 100,
    });
    await processPaymentEvent({
      provider: 'mock',
      providerEventId: 'refund',
      type: event.type,
      summary: event.summary,
    });
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'REFUNDED', refundedCents: 499 },
    });
    expect(mockPrisma.paymentRefund.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.giftCode.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('provider event coverage', () => {
  const send = async (
    type: string,
    summary: Record<string, string | number | boolean>,
  ) => {
    const event = {
      id: 9,
      provider: 'mock',
      status: 'RECEIVED',
      type,
      summary,
    };
    mockPrisma.paymentEvent.create.mockResolvedValue(event);
    mockPrisma.paymentEvent.findUniqueOrThrow.mockResolvedValue(event);
    mockPrisma.paymentEvent.update.mockImplementation(
      async ({ data }: any) => ({ ...event, ...data }),
    );
    return processPaymentEvent({
      provider: 'mock',
      providerEventId: `test:${type}`,
      type,
      summary,
    });
  };
  it('ignores unknown events', async () => {
    expect((await send('unknown', {})).event.status).toBe('IGNORED');
  });
  it('records a renewal and restores active status', async () => {
    const end = '2030-02-01T00:00:00.000Z';
    mockPrisma.supporterMembership.findUniqueOrThrow.mockResolvedValue({
      source: 'SUBSCRIPTION',
      provider: 'mock',
      currentPeriodEnd: new Date('2030-01-11'),
      subscriptionPeriodEnd: new Date('2030-01-01'),
    });
    await send('invoice.paid', {
      userId: 1,
      amountCents: 499,
      periodEnd: end,
      providerPaymentId: 'renewal',
    });
    expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.supporterMembership.update).toHaveBeenCalledWith({
      where: { userId: 1 },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2030-02-11'),
        subscriptionPeriodEnd: new Date(end),
      },
    });
  });
  it('updates and deletes subscriptions', async () => {
    mockPrisma.supporterMembership.findUniqueOrThrow.mockResolvedValue({
      source: 'SUBSCRIPTION',
      provider: 'mock',
      currentPeriodEnd: null,
    });
    await send('customer.subscription.updated', {
      userId: 1,
      periodEnd: '2030-02-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
    });
    expect(mockPrisma.supporterMembership.update).toHaveBeenCalledWith({
      where: { userId: 1 },
      data: {
        currentPeriodEnd: new Date('2030-02-01'),
        subscriptionPeriodEnd: new Date('2030-02-01'),
        cancelAtPeriodEnd: true,
      },
    });
    await send('customer.subscription.deleted', { userId: 1 });
    expect(mockPrisma.supporterMembership.update).toHaveBeenCalledWith({
      where: { userId: 1 },
      data: { status: 'CANCELED', cancelAtPeriodEnd: true },
    });
  });
  it('suspends only the disputed payment access and restores it when won', async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    const payment = {
      id: 3,
      provider: 'mock',
      userId: 1,
      kind: 'ONE_TIME',
      status: 'SUCCEEDED',
      refundedCents: 0,
      createdAt: new Date(now - DAY),
      // A 100-day pass that has not started yet (queued after other time).
      accessFrom: new Date(now + 30 * DAY),
      accessUntil: new Date(now + 130 * DAY),
    };
    let membership: any = {
      source: 'ONE_TIME',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(now + 130 * DAY),
      badgeVisible: true,
    };
    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue(payment);
    mockPrisma.supporterMembership.findUnique.mockImplementation(
      async () => membership,
    );
    mockPrisma.supporterMembership.update.mockImplementation(
      async ({ data }: any) => (membership = { ...membership, ...data }),
    );
    await send('charge.dispute.created', { paymentId: 3 });
    const removed = mockPrisma.payment.update.mock.calls.at(-1)[0].data;
    expect(removed.status).toBe('DISPUTED');
    expect(removed.disputeRemovedSeconds).toBe((100 * DAY) / 1000);
    // The 30 days bought earlier stay.
    expect(membership.currentPeriodEnd.getTime()).toBe(now + 30 * DAY);

    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      ...payment,
      status: 'DISPUTED',
      disputeRemovedSeconds: removed.disputeRemovedSeconds,
    });
    await send('charge.dispute.closed', { paymentId: 3, outcome: 'won' });
    expect(membership.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(
      now + 130 * DAY,
    );
  });
  it('removes only the refunded pass and keeps later gift time', async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    let membership: any = {
      source: 'GIFT',
      status: 'ACTIVE',
      // 100-day pass from now, then 30 gift days after it.
      currentPeriodEnd: new Date(now + 130 * DAY),
      badgeVisible: true,
    };
    mockPrisma.supporterMembership.findUnique.mockImplementation(
      async () => membership,
    );
    mockPrisma.supporterMembership.update.mockImplementation(
      async ({ data }: any) => (membership = { ...membership, ...data }),
    );
    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      id: 3,
      provider: 'mock',
      userId: 1,
      kind: 'ONE_TIME',
      status: 'SUCCEEDED',
      amountCents: 1299,
      refundedCents: 0,
      accessFrom: new Date(now),
      accessUntil: new Date(now + 100 * DAY),
    });
    await send('charge.refunded', { paymentId: 3, amountCents: 1299 });
    const left = membership.currentPeriodEnd.getTime() - now;
    expect(Math.round(left / DAY)).toBe(30);
  });
  it('restores a won subscription dispute without inventing banked time', async () => {
    const { restorePaymentAccess } =
      await import('@/services/supporter/Entitlement.service');
    const DAY = 86_400_000;
    const now = Date.now();
    // The dispute outlasted the period: both ends are in the past.
    let membership: any = {
      source: 'SUBSCRIPTION',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(now - 5 * DAY),
      subscriptionPeriodEnd: new Date(now - 5 * DAY),
      badgeVisible: true,
    };
    mockPrisma.supporterMembership.findUnique.mockImplementation(
      async () => membership,
    );
    mockPrisma.supporterMembership.update.mockImplementation(
      async ({ data }: any) => (membership = { ...membership, ...data }),
    );
    await restorePaymentAccess(
      1,
      (20 * DAY) / 1000,
      'SUBSCRIPTION',
      mockPrisma,
    );
    const banked =
      membership.currentPeriodEnd.getTime() -
      membership.subscriptionPeriodEnd.getTime();
    expect(Math.abs(banked)).toBeLessThan(1000);
    expect(membership.currentPeriodEnd.getTime()).toBeGreaterThan(
      now + 19 * DAY,
    );
  });
  it('anchors past-due grace to the first failed renewal', async () => {
    const { applyPaymentFailed } =
      await import('@/services/supporter/Entitlement.service');
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      status: 'PAST_DUE',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    await applyPaymentFailed(1, mockPrisma);
    expect(mockPrisma.supporterMembership.update).not.toHaveBeenCalled();
  });
  it('rejects a refund greater than the remaining balance', async () => {
    mockPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      id: 3,
      provider: 'mock',
      status: 'PARTIALLY_REFUNDED',
      amountCents: 499,
      refundedCents: 400,
    });
    await expect(
      send('charge.refunded', { paymentId: 3, amountCents: 100 }),
    ).rejects.toThrow('Invalid refund amount');
    expect(mockPrisma.paymentRefund.create).not.toHaveBeenCalled();
  });
});

describe('entitlement stacking', () => {
  it('extends one-time and gift grants from the later of now or an active end', async () => {
    const { grantDays } =
      await import('@/services/supporter/Entitlement.service');
    const future = new Date(Date.now() + 10 * 86400000);
    for (const source of ['ONE_TIME', 'GIFT'] as const) {
      mockPrisma.supporterMembership.findUnique.mockResolvedValue({
        source: 'SUBSCRIPTION',
        status: 'ACTIVE',
        currentPeriodEnd: future,
      });
      mockPrisma.supporterMembership.upsert = vi.fn();
      await grantDays(1, 30, source, mockPrisma);
      expect(
        mockPrisma.supporterMembership.upsert.mock.calls[0][0].update.currentPeriodEnd.getTime(),
      ).toBe(future.getTime() + 30 * 86400000);
      expect(
        mockPrisma.supporterMembership.upsert.mock.calls[0][0].update.source,
      ).toBe('SUBSCRIPTION');
    }
  });
  it('adds remaining one-time time to a new subscription', async () => {
    const { applySubscriptionStart } =
      await import('@/services/supporter/Entitlement.service');
    const now = Date.now();
    mockPrisma.supporterMembership.findUnique.mockResolvedValue({
      source: 'GIFT',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(now + 10 * 86400000),
    });
    mockPrisma.supporterMembership.upsert = vi.fn();
    await applySubscriptionStart(
      1,
      new Date(now + 30 * 86400000),
      'mock',
      'customer',
      'subscription',
      mockPrisma,
    );
    expect(
      mockPrisma.supporterMembership.upsert.mock.calls[0][0].update.currentPeriodEnd.getTime(),
    ).toBeGreaterThan(now + 39 * 86400000);
  });
});

it('counts monthly refunds by refund date, independent of payment date', async () => {
  const { summary } = await import('@/services/supporter/admin');
  mockPrisma.supporterMembership.count = vi.fn().mockResolvedValue(0);
  mockPrisma.supporterMembership.findMany = vi.fn().mockResolvedValue([]);
  mockPrisma.payment.aggregate = vi
    .fn()
    .mockResolvedValue({ _sum: { amountCents: 499 } });
  mockPrisma.paymentRefund.aggregate = vi
    .fn()
    .mockResolvedValue({ _sum: { amountCents: 200 } });
  mockPrisma.paymentEvent.count = vi.fn().mockResolvedValue(0);
  mockPrisma.allianceSponsorship = { count: vi.fn().mockResolvedValue(0) };
  const result = await summary();
  expect(result.revenueThisMonthCents).toBe(499);
  expect(result.refundsThisMonthCents).toBe(200);
  expect(
    mockPrisma.paymentRefund.aggregate.mock.calls[0][0].where.createdAt.gte,
  ).toBeInstanceOf(Date);
});
