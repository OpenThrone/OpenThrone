import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import type Stripe from 'stripe';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { getSupporterPlans, planPriceSchema, saveSupporterPlanPrice } =
  await import('@/services/supporter/planPrices');
const { StripeProvider } = await import('@/services/supporter/StripeProvider');
const { MockProvider } = await import('@/services/supporter/MockProvider');
const { consentText } = await import('@/services/supporter/consent');
const { summary } = await import('@/services/supporter/admin');

const originalProvider = process.env.PAYMENT_PROVIDER;
const originalUrl = process.env.NEXTAUTH_URL;
afterEach(() => {
  if (originalProvider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = originalProvider;
  if (originalUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = originalUrl;
});
let rows: any[];
beforeEach(() => {
  rows = [];
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.supporterPlanPrice.findMany.mockImplementation(async () => rows);
  mockPrisma.supporterPlanPrice.upsert = vi.fn(async ({ create }: any) => {
    rows = [create];
    return create;
  });
  mockPrisma.auditLog = { create: vi.fn() };
  mockPrisma.supporterMembership = { findUnique: vi.fn(async () => null) };
  mockPrisma.paymentEvent = { create: vi.fn() };
});
const input = {
  planId: 'supporter_monthly',
  priceCents: 799,
  currency: 'usd',
  expectedCents: 499,
};
const actor = { userId: 3, ip: '127.0.0.1' };
const stripeMock = () => ({
  prices: {
    list: vi.fn(async () => ({
      data: [
        {
          id: 'price_default',
          product: 'prod_monthly',
          unit_amount: 499,
          currency: 'usd',
        },
      ],
    })),
    create: vi.fn(async () => ({ id: 'price_new' })),
    update: vi.fn(async () => ({})),
  },
  checkout: {
    sessions: {
      create: vi.fn(async () => ({
        url: 'https://checkout.example.test/session',
      })),
    },
  },
  subscriptions: { update: vi.fn() },
});

describe('supporter catalog prices', () => {
  it('merges overrides while retaining defaults, kinds, intervals and grants', async () => {
    rows = [
      {
        planId: 'gift_3m',
        priceCents: 1899,
        currency: 'usd',
        providerPriceId: 'price_gift',
      },
    ];
    const plans = await getSupporterPlans();
    expect(Object.keys(plans)).toHaveLength(5);
    expect(plans.supporter_monthly.priceCents).toBe(499);
    expect(plans.gift_3m).toMatchObject({
      kind: 'GIFT',
      grantMonths: 3,
      interval: null,
      priceCents: 1899,
      providerPriceId: 'price_gift',
    });
    expect(plans.supporter_era_pass.grantDays).toBe(100);
  });
  it('rejects invalid cents, currencies and plan ids', () => {
    for (const priceCents of [0, 99, 100001, 100.1, '799', NaN, Infinity])
      expect(planPriceSchema.safeParse({ ...input, priceCents }).success).toBe(
        false,
      );
    expect(
      planPriceSchema.safeParse({ ...input, currency: 'eur' }).success,
    ).toBe(false);
    expect(
      planPriceSchema.safeParse({ ...input, planId: 'alliance_sponsorship' })
        .success,
    ).toBe(false);
    for (const priceCents of [100, 100000])
      expect(planPriceSchema.safeParse({ ...input, priceCents }).success).toBe(
        true,
      );
  });
  it('saves mock prices and audits old and new cents in the same transaction', async () => {
    await saveSupporterPlanPrice(input, actor);
    expect(mockPrisma.supporterPlanPrice.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 3,
      action: 'ADMIN_SUPPORTER_PRICE_UPDATE',
      details: { oldCents: 499, newCents: 799 },
    });
    expect((await getSupporterPlans()).supporter_monthly.priceCents).toBe(799);
  });
  it('rotates the Stripe lookup key and immediately uses the new price without updating subscriptions', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    const stripe = stripeMock();
    const provider = new StripeProvider(stripe as unknown as Stripe);
    await provider.createCheckout(7, { planId: 'supporter_monthly' });
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items).toEqual(
      [{ price: 'price_default', quantity: 1 }],
    );
    await saveSupporterPlanPrice(input, actor, stripe as unknown as Stripe);
    expect(stripe.prices.create).toHaveBeenCalledWith({
      product: 'prod_monthly',
      currency: 'usd',
      unit_amount: 799,
      lookup_key: 'ot_supporter_monthly',
      transfer_lookup_key: true,
      recurring: { interval: 'month' },
    });
    await provider.createCheckout(8, { planId: 'supporter_monthly' });
    expect(stripe.checkout.sessions.create.mock.calls[1][0].line_items).toEqual(
      [{ price: 'price_new', quantity: 1 }],
    );
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('rotates one-time prices without recurring billing', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    const stripe = stripeMock();
    await saveSupporterPlanPrice(
      { ...input, planId: 'gift_3m', expectedCents: 1399 },
      actor,
      stripe as unknown as Stripe,
    );
    expect(stripe.prices.create.mock.calls[0][0]).not.toHaveProperty(
      'recurring',
    );
    expect(stripe.prices.create.mock.calls[0][0].transfer_lookup_key).toBe(
      true,
    );
  });
  it('leaves the catalog and audit untouched if Stripe fails', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    const stripe = stripeMock();
    stripe.prices.create.mockRejectedValue(new Error('Stripe unavailable'));
    await expect(
      saveSupporterPlanPrice(input, actor, stripe as unknown as Stripe),
    ).rejects.toThrow('stripe_price_failed');
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect((await getSupporterPlans()).supporter_monthly.priceCents).toBe(499);
  });
  it('refuses a stale edit when another admin already changed the price', async () => {
    await expect(
      saveSupporterPlanPrice({ ...input, expectedCents: 550 }, actor),
    ).rejects.toThrow('price_conflict');
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
  it('hands the Stripe lookup key back if the database write fails', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    const stripe = stripeMock();
    mockPrisma.supporterPlanPrice.upsert.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      saveSupporterPlanPrice(input, actor, stripe as unknown as Stripe),
    ).rejects.toThrow('database unavailable');
    expect(stripe.prices.update).toHaveBeenCalledWith('price_default', {
      lookup_key: 'ot_supporter_monthly',
      transfer_lookup_key: true,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith('price_new', {
      active: false,
    });
  });
  it('snapshots the amount for mock checkout and uses it in consent', async () => {
    await saveSupporterPlanPrice(input, actor);
    await new MockProvider().createCheckout(7, { planId: 'supporter_monthly' });
    expect(
      mockPrisma.paymentEvent.create.mock.calls[0][0].data.summary.amountCents,
    ).toBe(799);
    const text = consentText(
      (key, vars) => `${key}:${vars?.price ?? ''}`,
      { planId: 'supporter_monthly' },
      undefined,
      await getSupporterPlans(),
    );
    expect(text).toContain('$7.99 USD');
  });
  it('calculates MRR from individual paid subscription amounts, independently of current list price', async () => {
    rows = [{ ...input, priceCents: 999 }];
    mockPrisma.supporterMembership.count = vi.fn(async () => 2);
    mockPrisma.$queryRaw = vi.fn(async () => [{ mrr: BigInt(1298) }]);
    mockPrisma.payment = {
      aggregate: vi.fn(async () => ({ _sum: { amountCents: 1298 } })),
    };
    mockPrisma.paymentRefund = {
      aggregate: vi.fn(async () => ({ _sum: { amountCents: 100 } })),
    };
    mockPrisma.paymentEvent.count = vi.fn(async () => 0);
    mockPrisma.allianceSponsorship = { count: vi.fn(async () => 0) };
    const result = await summary();
    expect(result.mrrCents).toBe(1298);
    expect(result.revenueThisMonthCents).toBe(1298);
    // One aggregate query, independent of the number of subscribers.
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('DISTINCT ON');
    expect(sql).toContain('"cancelAtPeriodEnd" = false');
    expect(sql).not.toContain('supporterPlanPrice');
  });
});
