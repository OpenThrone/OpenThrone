import { beforeEach, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

const reconcileStripe = vi.fn();
mock.module('@/services/supporter/StripeReconcile.service', () => ({
  reconcileStripe,
}));

const { runSupporterDaily } =
  await import('@/services/supporter/SupporterDaily.service');

beforeEach(() => {
  process.env.PAYMENT_PROVIDER = 'stripe';
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.allianceSponsorship = { findMany: vi.fn(async () => []) };
  mockPrisma.supporterMembership = { findMany: vi.fn(async () => []) };
  mockPrisma.discordOutbox = { deleteMany: vi.fn() };
});

it('lists the Stripe events that failed again and why, without logging a bare count', async () => {
  reconcileStripe.mockResolvedValue({
    applied: ['stripe:checkout:cs_ok'],
    failed: ['stripe:checkout:cs_1', 'stripe:checkout:cs_2'],
    failures: [
      {
        id: 'stripe:checkout:cs_1',
        error: 'GIFT_CODE_SECRET, NEXTAUTH_SECRET or JWT_SECRET is required',
      },
      { id: 'stripe:checkout:cs_2', error: 'Authorization: Bearer sk_live_x' },
    ],
  });

  const report = await runSupporterDaily();

  expect(report.errors).toBe(2);
  expect(report.reconcile?.failed).toHaveLength(2);
  expect(report.failures).toEqual([
    'reconcile stripe:checkout:cs_1: GIFT_CODE_SECRET, NEXTAUTH_SECRET or JWT_SECRET is required',
    'reconcile stripe:checkout:cs_2: Authorization: [redacted]',
  ]);
});

it('caps the failure lines but still counts every error', async () => {
  const failures = Array.from({ length: 25 }, (_, i) => ({
    id: `stripe:checkout:cs_${i}`,
    error: 'boom',
  }));
  reconcileStripe.mockResolvedValue({
    applied: [],
    failed: failures.map((f) => f.id),
    failures,
  });

  const report = await runSupporterDaily();

  expect(report.errors).toBe(25);
  expect(report.failures).toHaveLength(10);
});
