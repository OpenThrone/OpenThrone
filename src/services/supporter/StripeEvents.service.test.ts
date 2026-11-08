import { beforeEach, describe, expect, it, vi } from 'bun:test';
import type Stripe from 'stripe';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.STRIPE_SECRET_KEY = 'sk_test_unit';

const events = await import('@/services/supporter/StripeEvents.service');
const { StripeProvider } = await import('@/services/supporter/StripeProvider');
const { getStripeClient } = await import('@/services/supporter/StripeClient');
const { giftCodeFor } = await import('@/services/supporter/Gift.service');
const { reconcileStripe } =
  await import('@/services/supporter/StripeReconcile.service');
const webhook = (await import('@/pages/api/supporter/webhook/stripe')).default;

const DAY = 86_400_000;
const sec = (date: Date) => Math.floor(date.getTime() / 1000);
const ALLOWED = new Set([
  'userId',
  'session',
  'planId',
  'amountCents',
  'allianceId',
  'recipientUserId',
  'paymentId',
  'status',
  'periodEnd',
  'cancelAtPeriodEnd',
  'refundId',
  'reason',
  'createdById',
  'providerPaymentId',
  'providerInvoiceId',
  'customerId',
  'subscriptionId',
  'disputeId',
  'outcome',
  'billingCountry',
  'billingState',
]);

let eventRows: any[];
let payments: any[];
let refunds: any[];
let gifts: any[];
let membership: any;

const matches = (row: any, where: any) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

beforeEach(() => {
  eventRows = [];
  payments = [];
  refunds = [];
  gifts = [];
  membership = null;
  mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.paymentEvent = {
    create: vi.fn(async ({ data }: any) => {
      if (eventRows.some((r) => r.providerEventId === data.providerEventId))
        throw { code: 'P2002' };
      const row = { id: eventRows.length + 1, status: 'RECEIVED', ...data };
      eventRows.push(row);
      return row;
    }),
    findUnique: vi.fn(
      async ({ where }: any) =>
        eventRows.find((r) => matches(r, where)) ?? null,
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const row = eventRows.find((r) => matches(r, where));
      if (!row) throw new Error('missing event');
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(
        eventRows.find((r) => r.id === where.id),
        data,
      ),
    ),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.payment = {
    create: vi.fn(async ({ data }: any) => {
      const row = {
        id: payments.length + 1,
        refundedCents: 0,
        createdAt: new Date(),
        disputeRevokedUntil: null,
        ...data,
      };
      payments.push(row);
      return row;
    }),
    findUnique: vi.fn(
      async ({ where }: any) => payments.find((p) => matches(p, where)) ?? null,
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const row = payments.find((p) => matches(p, where));
      if (!row) throw new Error('missing payment');
      return row;
    }),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(
        payments.find((p) => p.id === where.id),
        data,
      ),
    ),
  };
  mockPrisma.paymentRefund = {
    create: vi.fn(async ({ data }: any) => refunds.push(data)),
    findUnique: vi.fn(
      async ({ where }: any) =>
        refunds.find((r) => r.providerRefundId === where.providerRefundId) ??
        null,
    ),
  };
  mockPrisma.giftCode = {
    create: vi.fn(async ({ data }: any) =>
      gifts.push({ redeemedAt: null, revokedAt: null, ...data }),
    ),
    findFirst: vi.fn(
      async ({ where }: any) =>
        gifts.find(
          (g) =>
            g.paymentId === where.paymentId &&
            g.purchaserUserId === where.purchaserUserId &&
            !g.redeemedAt &&
            !g.revokedAt,
        ) ?? null,
    ),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.supporterMembership = {
    findUnique: vi.fn(async () => membership),
    findUniqueOrThrow: vi.fn(async () => {
      if (!membership) throw new Error('missing membership');
      return membership;
    }),
    findFirst: vi.fn(async ({ where }: any) =>
      membership && matches(membership, where) ? membership : null,
    ),
    upsert: vi.fn(async ({ create, update }: any) => {
      membership = membership
        ? { ...membership, ...update }
        : { badgeVisible: true, cancelAtPeriodEnd: false, ...create };
      return membership;
    }),
    update: vi.fn(async ({ data }: any) => {
      membership = { ...membership, ...data };
      return membership;
    }),
  };
  mockPrisma.users = { update: vi.fn(), findUnique: vi.fn(async () => null) };
  mockPrisma.purchaseConsent = { findUnique: vi.fn(async () => null) };
});

const asList = (items: any[]) => {
  const result: any = Promise.resolve({ data: items });
  result[Symbol.asyncIterator] = async function* () {
    yield* items;
  };
  return result;
};

const subscription = (periodEnd: Date, over: any = {}) => ({
  id: 'sub_1',
  status: 'active',
  metadata: { userId: '7' },
  customer: 'cus_1',
  cancel_at_period_end: false,
  cancel_at: null,
  latest_invoice: 'in_1',
  items: { data: [{ current_period_end: sec(periodEnd) }] },
  ...over,
});

const paidSession = (over: any = {}) => ({
  id: 'cs_test_1',
  status: 'complete',
  payment_status: 'paid',
  mode: 'payment',
  metadata: { userId: '7', planId: 'supporter_era_pass' },
  client_reference_id: '7',
  amount_total: 1299,
  customer: 'cus_1',
  payment_intent: 'pi_1',
  invoice: null,
  subscription: null,
  ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial Stripe double
function fakeStripe(over: Record<string, any> = {}): any {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => paidSession()),
        create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/s' })),
        list: vi.fn(() => asList([])),
      },
    },
    prices: {
      list: vi.fn(async ({ lookup_keys }: any) => ({
        data: [
          {
            id: `price_${lookup_keys[0]}`,
            unit_amount: lookup_keys[0] === 'ot_gift_3m' ? 1399 : 499,
            currency: 'usd',
          },
        ],
      })),
    },
    invoices: { retrieve: vi.fn(), list: vi.fn(() => asList([])) },
    invoicePayments: {
      list: vi.fn(async () => ({
        data: [{ payment: { payment_intent: 'pi_sub' } }],
      })),
    },
    subscriptions: { retrieve: vi.fn(), list: vi.fn(() => asList([])) },
    refunds: {
      create: vi.fn(),
      retrieve: vi.fn(),
      list: vi.fn(() => asList([])),
    },
    disputes: { retrieve: vi.fn(), list: vi.fn(() => asList([])) },
    ...over,
  } as any;
}

const deliver = (stripe: Stripe, type: string, id: string) =>
  events.handleStripeWebhook(
    { id: `evt_${type}_${id}`, type, data: { object: { id } } } as any,
    stripe,
  );

describe('stripe client', () => {
  it('refuses live keys outside an explicit production opt-in', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_unit';
    try {
      expect(() => getStripeClient()).toThrow('Live Stripe keys are disabled');
      process.env.SUPPORTER_ALLOW_LIVE = '1';
      expect(() => getStripeClient()).toThrow('Live Stripe keys are disabled');
    } finally {
      delete process.env.SUPPORTER_ALLOW_LIVE;
      process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    }
  });
});

describe('stripe checkout', () => {
  it('builds sessions from lookup-key prices with player metadata', async () => {
    const stripe = fakeStripe();
    const provider = new StripeProvider(stripe);
    await provider.createCheckout(7, { planId: 'supporter_monthly' });
    const monthly = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(monthly).toMatchObject({
      mode: 'subscription',
      client_reference_id: '7',
      line_items: [{ price: 'price_ot_supporter_monthly', quantity: 1 }],
      subscription_data: {
        metadata: { userId: '7', planId: 'supporter_monthly' },
      },
      success_url:
        'http://localhost:3000/home/supporter?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    });
    await provider.createCheckout(7, { planId: 'gift_3m', recipientUserId: 9 });
    expect(stripe.checkout.sessions.create.mock.calls[1][0]).toMatchObject({
      mode: 'payment',
      customer_creation: 'always',
      payment_intent_data: { metadata: { recipientUserId: '9' } },
    });
    await expect(
      provider.createCheckout(7, {
        planId: 'alliance_sponsorship',
        allianceId: 4,
        amountCents: 499,
      }),
    ).rejects.toThrow('Invalid sponsorship amount');
    await provider.createCheckout(7, {
      planId: 'alliance_sponsorship',
      allianceId: 4,
      amountCents: 1500,
    });
    const alliance = stripe.checkout.sessions.create.mock.calls[2][0];
    expect(alliance.line_items[0].price_data.unit_amount).toBe(1500);
    expect(alliance.success_url).toContain('/alliances/4?sponsorship=success');
  });

  it('fulfills a checkout once whether the webhook or the return page comes first', async () => {
    const stripe = fakeStripe();
    await events.fulfillCheckoutSession('cs_test_1', 7, stripe);
    await deliver(stripe, 'checkout.session.completed', 'cs_test_1');
    await events.fulfillCheckoutSession('cs_test_1', 7, stripe);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 1299,
      status: 'SUCCEEDED',
    });
    expect(membership).toMatchObject({
      source: 'ONE_TIME',
      provider: 'stripe',
      providerCustomerId: 'cus_1',
    });
  });

  it('turns an alliance sponsorship into premium time at once', async () => {
    let sponsorship: any = null;
    mockPrisma.allianceSponsorship = {
      upsert: vi.fn(async ({ create, update }: any) => {
        sponsorship = sponsorship
          ? {
              ...sponsorship,
              poolCents: sponsorship.poolCents + update.poolCents.increment,
            }
          : { activeUntil: null, ...create };
        return sponsorship;
      }),
      findUnique: vi.fn(async () => sponsorship),
      update: vi.fn(async ({ data }: any) => {
        sponsorship = { ...sponsorship, ...data };
        return sponsorship;
      }),
    };
    const stripe = fakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({
        metadata: {
          userId: '7',
          planId: 'alliance_sponsorship',
          allianceId: '4',
        },
        payment_intent: 'pi_alliance',
        amount_total: 1000,
      }),
    );
    const result = await events.fulfillCheckoutSession('cs_test_1', 7, stripe);
    expect(result.redirect).toBe('/alliances/4?sponsorship=success');
    expect(sponsorship.poolCents).toBe(2);
    expect(sponsorship.activeUntil.getTime()).toBeGreaterThan(
      Date.now() + 59 * DAY,
    );
  });

  it('rejects a checkout that belongs to another player', async () => {
    await expect(
      events.fulfillCheckoutSession('cs_test_1', 8, fakeStripe()),
    ).rejects.toThrow('another player');
    expect(payments).toHaveLength(0);
  });

  it('ignores unpaid sessions', async () => {
    const stripe = fakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ payment_status: 'unpaid' }),
    );
    expect(await deliver(stripe, 'checkout.session.completed', 'cs_x')).toEqual(
      [],
    );
    expect(payments).toHaveLength(0);
  });

  it('shows the gift code again when the webhook fulfilled the gift first', async () => {
    const stripe = fakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({
        metadata: { userId: '7', planId: 'gift_1m' },
        payment_intent: 'pi_gift',
        amount_total: 499,
      }),
    );
    await deliver(stripe, 'checkout.session.completed', 'cs_test_1');
    expect(gifts).toHaveLength(1);
    const result = await events.fulfillCheckoutSession('cs_test_1', 7, stripe);
    expect(result.giftCode).toBe(giftCodeFor(payments[0].id).code);
    expect(gifts).toHaveLength(1);
  });

  it('starts a subscription with the provider period and skips its first invoice', async () => {
    const periodEnd = new Date(Date.UTC(2030, 0, 1));
    const stripe = fakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({
        mode: 'subscription',
        metadata: { userId: '7', planId: 'supporter_monthly' },
        amount_total: 499,
        payment_intent: null,
        invoice: 'in_1',
        subscription: subscription(periodEnd),
      }),
    );
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_1',
      billing_reason: 'subscription_create',
      parent: { subscription_details: { subscription: 'sub_1' } },
    });
    await events.fulfillCheckoutSession('cs_test_1', 7, stripe);
    expect(await deliver(stripe, 'invoice.paid', 'in_1')).toEqual([]);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      providerPaymentId: 'pi_sub',
      providerInvoiceId: 'in_1',
    });
    expect(membership).toMatchObject({
      source: 'SUBSCRIPTION',
      provider: 'stripe',
      providerSubscriptionId: 'sub_1',
      subscriptionPeriodEnd: periodEnd,
    });
  });
});

describe('stripe webhooks', () => {
  const activeSubscription = (periodEnd: Date, banked = 0) => ({
    userId: 7,
    source: 'SUBSCRIPTION',
    status: 'ACTIVE',
    provider: 'stripe',
    providerCustomerId: 'cus_1',
    providerSubscriptionId: 'sub_1',
    subscriptionPeriodEnd: periodEnd,
    currentPeriodEnd: new Date(periodEnd.getTime() + banked),
    cancelAtPeriodEnd: false,
    badgeVisible: true,
  });

  it('renews once and keeps banked gift time', async () => {
    const oldEnd = new Date(Date.now() + 2 * DAY);
    const newEnd = new Date(oldEnd.getTime() + 30 * DAY);
    membership = activeSubscription(oldEnd, 10 * DAY);
    const stripe = fakeStripe();
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_2',
      billing_reason: 'subscription_cycle',
      amount_paid: 499,
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
    });
    stripe.subscriptions.retrieve.mockResolvedValue(subscription(newEnd));
    stripe.invoicePayments.list.mockResolvedValue({
      data: [{ payment: { payment_intent: 'pi_renew' } }],
    });
    await deliver(stripe, 'invoice.paid', 'in_2');
    await deliver(stripe, 'invoice.paid', 'in_2');
    expect(payments).toHaveLength(1);
    expect(payments[0].providerPaymentId).toBe('pi_renew');
    expect(membership.subscriptionPeriodEnd.getTime()).toBe(sec(newEnd) * 1000);
    expect(membership.currentPeriodEnd.getTime()).toBe(
      sec(newEnd) * 1000 + 10 * DAY,
    );
  });

  it('marks a failed renewal past due', async () => {
    membership = activeSubscription(new Date(Date.now() + DAY));
    const stripe = fakeStripe();
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_3',
      billing_reason: 'subscription_cycle',
      amount_due: 499,
      attempt_count: 1,
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
    });
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription(new Date(Date.now() + DAY)),
    );
    await deliver(stripe, 'invoice.payment_failed', 'in_3');
    expect(membership.status).toBe('PAST_DUE');
    // Perks run through the retry window rather than ending with the period.
    expect(membership.currentPeriodEnd.getTime()).toBeGreaterThan(
      Date.now() + 6 * DAY,
    );
    expect(payments[0]).toMatchObject({
      status: 'FAILED',
      providerPaymentId: 'in_3:attempt:1',
    });
  });

  it('applies cancel-at-period-end from the current subscription', async () => {
    const end = new Date(Date.now() + 5 * DAY);
    membership = activeSubscription(end);
    const stripe = fakeStripe();
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription(end, { cancel_at_period_end: true }),
    );
    await deliver(stripe, 'customer.subscription.updated', 'sub_1');
    expect(membership.cancelAtPeriodEnd).toBe(true);
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription(end, { status: 'canceled' }),
    );
    await deliver(stripe, 'customer.subscription.deleted', 'sub_1');
    expect(membership.status).toBe('CANCELED');
  });

  it('ignores subscription updates before checkout links the subscription', async () => {
    const stripe = fakeStripe();
    expect(
      await deliver(stripe, 'customer.subscription.updated', 'sub_new'),
    ).toEqual([]);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  const paidPayment = (over: any = {}) =>
    payments.push({
      id: 1,
      userId: 7,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      kind: 'ONE_TIME',
      status: 'SUCCEEDED',
      amountCents: 1299,
      refundedCents: 0,
      createdAt: new Date(Date.now() - DAY),
      // A 100-day pass bought yesterday.
      accessFrom: new Date(Date.now() - DAY),
      accessUntil: new Date(Date.now() + 99 * DAY),
      disputeRemovedSeconds: null,
      ...over,
    });

  it('records an admin refund once even when the webhook reports it again', async () => {
    paidPayment();
    const refund = {
      id: 're_1',
      status: 'succeeded',
      amount: 500,
      payment_intent: 'pi_1',
      reason: null,
      metadata: { reason: 'goodwill', createdById: '1' },
    };
    const stripe = fakeStripe();
    stripe.refunds.create.mockResolvedValue(refund);
    stripe.refunds.list.mockReturnValue(asList([refund]));
    await new StripeProvider(stripe).refund('pi_1', 500, {
      reason: 'goodwill',
      createdById: 1,
    });
    await deliver(stripe, 'charge.refunded', 'ch_1');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      providerRefundId: 're_1',
      amountCents: 500,
      createdById: 1,
    });
    expect(payments[0]).toMatchObject({
      refundedCents: 500,
      status: 'PARTIALLY_REFUNDED',
    });
  });

  it('suspends the disputed purchase and restores it when the dispute is won', async () => {
    const until = new Date(Date.now() + 50 * DAY);
    paidPayment();
    membership = {
      userId: 7,
      source: 'ONE_TIME',
      status: 'ACTIVE',
      provider: 'stripe',
      currentPeriodEnd: until,
      cancelAtPeriodEnd: false,
      badgeVisible: true,
    };
    const stripe = fakeStripe();
    const dispute = {
      id: 'dp_1',
      status: 'needs_response',
      payment_intent: 'pi_1',
      amount: 1299,
      reason: 'fraudulent',
    };
    stripe.disputes.retrieve.mockResolvedValue(dispute);
    await deliver(stripe, 'charge.dispute.created', 'dp_1');
    // The pass's remaining 50 days are suspended; nothing else is touched.
    expect(payments[0].status).toBe('DISPUTED');
    expect(
      Math.abs(payments[0].disputeRemovedSeconds - (50 * DAY) / 1000),
    ).toBeLessThan(5);
    expect(membership.currentPeriodEnd.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    stripe.disputes.retrieve.mockResolvedValue({ ...dispute, status: 'won' });
    await deliver(stripe, 'charge.dispute.closed', 'dp_1');
    expect(payments[0].status).toBe('SUCCEEDED');
    expect(membership.status).toBe('ACTIVE');
    expect(
      Math.abs(membership.currentPeriodEnd.getTime() - until.getTime()),
    ).toBeLessThan(5000);
  });

  it('keeps the disputed access removed when the dispute is lost', async () => {
    paidPayment();
    membership = {
      userId: 7,
      source: 'ONE_TIME',
      status: 'ACTIVE',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 50 * DAY),
      badgeVisible: true,
    };
    const stripe = fakeStripe();
    const dispute = {
      id: 'dp_2',
      status: 'needs_response',
      payment_intent: 'pi_1',
      amount: 1299,
      reason: 'fraudulent',
    };
    stripe.disputes.retrieve.mockResolvedValue(dispute);
    await deliver(stripe, 'charge.dispute.created', 'dp_2');
    stripe.disputes.retrieve.mockResolvedValue({ ...dispute, status: 'lost' });
    await deliver(stripe, 'charge.dispute.closed', 'dp_2');
    expect(payments[0].status).toBe('DISPUTED');
    expect(membership.currentPeriodEnd.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('does not revoke perks for a dispute inquiry', async () => {
    paidPayment();
    const stripe = fakeStripe();
    stripe.disputes.retrieve.mockResolvedValue({
      id: 'dp_3',
      status: 'warning_needs_response',
      payment_intent: 'pi_1',
    });
    expect(await deliver(stripe, 'charge.dispute.created', 'dp_3')).toEqual([]);
    expect(payments[0].status).toBe('SUCCEEDED');
  });

  it('ignores event types it does not handle', async () => {
    expect(await deliver(fakeStripe(), 'customer.created', 'cus_1')).toEqual(
      [],
    );
  });

  it('stores only allow-listed scalar summary fields', async () => {
    const stripe = fakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({
        customer_details: { email: 'player@example.com', name: 'Player' },
      }),
    );
    await deliver(stripe, 'checkout.session.completed', 'cs_test_1');
    for (const row of eventRows) {
      for (const [key, value] of Object.entries(row.summary)) {
        expect(ALLOWED.has(key)).toBe(true);
        expect(value === null || typeof value !== 'object').toBe(true);
      }
      expect(JSON.stringify(row.summary)).not.toContain('example.com');
    }
  });
});

describe('stripe webhook route', () => {
  const call = async (body: string, signature?: string) => {
    const req: any = {
      method: 'POST',
      headers: signature ? { 'stripe-signature': signature } : {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(body);
      },
    };
    const res: any = {
      statusCode: 0,
      setHeader: vi.fn(),
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json: vi.fn(),
    };
    await webhook(req, res);
    return res.statusCode;
  };

  it('accepts only correctly signed payloads', async () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    try {
      const payload = JSON.stringify({
        id: 'evt_1',
        object: 'event',
        type: 'customer.created',
        data: { object: { id: 'cus_1' } },
      });
      const header =
        await getStripeClient().webhooks.generateTestHeaderStringAsync({
          payload,
          secret: 'whsec_unit',
        });
      expect(await call(payload, header)).toBe(200);
      expect(await call(payload, 'bad')).toBe(400);
      expect(await call(payload)).toBe(400);
      const forged =
        await getStripeClient().webhooks.generateTestHeaderStringAsync({
          payload,
          secret: 'whsec_other',
        });
      expect(await call(payload, forged)).toBe(400);
      process.env.PAYMENT_PROVIDER = 'mock';
      expect(await call(payload, header)).toBe(404);
    } finally {
      delete process.env.PAYMENT_PROVIDER;
      delete process.env.STRIPE_WEBHOOK_SECRET;
    }
  });
});

describe('stripe reconciliation', () => {
  it('reports in a dry run, applies once, then finds nothing new', async () => {
    const stripe = fakeStripe();
    stripe.checkout.sessions.list.mockReturnValue(
      asList([{ id: 'cs_test_1' }]),
    );
    const dry = await reconcileStripe({ dryRun: true, stripe });
    expect(dry.applied).toEqual(['stripe:checkout:cs_test_1']);
    expect(payments).toHaveLength(0);
    const real = await reconcileStripe({ stripe });
    expect(real.applied).toEqual(['stripe:checkout:cs_test_1']);
    expect(payments).toHaveLength(1);
    const again = await reconcileStripe({ stripe });
    expect(again.applied).toEqual([]);
    expect(payments).toHaveLength(1);
  });
});
