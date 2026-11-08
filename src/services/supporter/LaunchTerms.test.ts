import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
const createCheckout = vi.fn(async () => ({
  url: 'https://pay.example.test/cs_1',
  sessionId: 'cs_test_1',
}));
vi.mock('@/services/supporter/PaymentProvider', () => ({
  getPaymentProvider: () => ({ createCheckout }),
  getPaymentProviderFor: () => ({ createCheckout }),
}));
const { default: checkout } = await import('@/pages/api/supporter/checkout');
const { default: status } = await import('@/pages/api/supporter/status');
const { CONSENT_VERSION } = await import('@/services/supporter/consent');
const { renderEmail } = await import('@/services/emailTemplates');
const { resetRuntimeConfigCache } =
  await import('@/services/RuntimeConfig.service');

const call = async (handler: any, body: unknown, method = 'POST') => {
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
  await handler({ method, body, session: { user: { id: 7 } } }, res);
  return res;
};
const salesOn = (on: boolean) => {
  mockPrisma.serverSetting.findMany.mockResolvedValue(
    on ? [{ key: 'ENABLE_SUPPORTER', value: true }] : [],
  );
  resetRuntimeConfigCache();
};

beforeEach(() => {
  salesOn(true);
  mockPrisma.supporterPlanPrice.findMany.mockResolvedValue([]);
  createCheckout.mockClear();
  mockPrisma.supporterMembership = { findUnique: vi.fn(async () => null) };
  mockPrisma.purchaseConsent = {
    create: vi.fn(async ({ data }: any) => ({ id: 11, ...data })),
    update: vi.fn(),
  };
});
afterEach(() => salesOn(false));

describe('checkout consent', () => {
  it('refuses checkout without the ticked consent', async () => {
    for (const consent of [
      undefined,
      { accepted: false, version: CONSENT_VERSION, locale: 'en' },
      { accepted: true, version: 'old', locale: 'en' },
    ]) {
      const res = await call(checkout, {
        planId: 'supporter_monthly',
        quotedPriceCents: 499,
        consent,
      });
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(createCheckout).not.toHaveBeenCalled();
    expect(mockPrisma.purchaseConsent.create).not.toHaveBeenCalled();
  });

  it('requires renewed consent when the catalog price changes', async () => {
    mockPrisma.supporterPlanPrice.findMany.mockResolvedValue([
      {
        planId: 'supporter_monthly',
        priceCents: 799,
        providerPriceId: 'price_new',
      },
    ]);
    const res = await call(checkout, {
      planId: 'supporter_monthly',
      quotedPriceCents: 499,
      consent: { accepted: true, version: CONSENT_VERSION, locale: 'en' },
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'price_changed' });
    expect(createCheckout).not.toHaveBeenCalled();
    expect(mockPrisma.purchaseConsent.create).not.toHaveBeenCalled();
  });

  it('uses the same overridden price snapshot for stored consent and checkout', async () => {
    mockPrisma.supporterPlanPrice.findMany.mockResolvedValue([
      {
        planId: 'supporter_monthly',
        priceCents: 799,
        providerPriceId: 'price_new',
      },
    ]);
    await call(checkout, {
      planId: 'supporter_monthly',
      quotedPriceCents: 799,
      consent: { accepted: true, version: CONSENT_VERSION, locale: 'en' },
    });
    const record = mockPrisma.purchaseConsent.create.mock.calls[0][0].data;
    expect(record.amountCents).toBe(799);
    expect(record.text).toContain('$7.99 USD');
    expect(createCheckout.mock.calls[0][1].resolvedPlan).toMatchObject({
      priceCents: 799,
      providerPriceId: 'price_new',
    });
  });

  it('stores the exact consent text and links it to the checkout session', async () => {
    const res = await call(checkout, {
      planId: 'supporter_monthly',
      quotedPriceCents: 499,
      consent: { accepted: true, version: CONSENT_VERSION, locale: 'de-DE' },
    });
    expect(res.json).toHaveBeenCalledWith({
      url: 'https://pay.example.test/cs_1',
    });
    const stored = mockPrisma.purchaseConsent.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({
      userId: 7,
      planId: 'supporter_monthly',
      amountCents: 499,
      locale: 'de',
      version: CONSENT_VERSION,
    });
    expect(stored.text).toContain('$4.99 USD');
    expect(stored.text).toContain('18');
    // The pay page repeats what was agreed.
    expect(createCheckout.mock.calls[0][1].noticeText).toBe(stored.text);
    expect(mockPrisma.purchaseConsent.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { checkoutSessionId: 'cs_test_1' },
    });
  });
});

describe('billing stays reachable when sales are off', () => {
  it('serves status while the supporter flag is off, but not checkout', async () => {
    salesOn(false);
    const ok = await call(status, undefined, 'GET');
    expect(ok.status).toHaveBeenCalledWith(200);
    const closed = await call(checkout, {
      planId: 'supporter_monthly',
      quotedPriceCents: 499,
      consent: { accepted: true, version: CONSENT_VERSION, locale: 'en' },
    });
    expect(closed.status).toHaveBeenCalledWith(404);
  });
});

describe('supporter emails', () => {
  const root = process.env.NEXT_PUBLIC_URL_ROOT;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
  });
  afterEach(() => {
    if (root === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
    else process.env.NEXT_PUBLIC_URL_ROOT = root;
  });

  it('sends a receipt with the renewal terms and the agreed consent, without an unsubscribe link', () => {
    const email = renderEmail({
      kind: 'SUPPORTER_RECEIPT',
      locale: 'en-US',
      vars: {
        userId: 7,
        display_name: 'Tester',
        planId: 'supporter_monthly',
        amountCents: 499,
        consentText: 'I agree to pay $4.99 USD now and every month',
      },
    });
    expect(email.text).toContain('$4.99 USD');
    expect(email.text).toContain('renews every month');
    expect(email.text).toContain('I agree to pay $4.99 USD');
    expect(email.text).toContain('https://example.test/legal/refunds');
    expect(email.text).not.toContain('unsubscribe');
    expect(email.html).not.toContain('/api/email/unsubscribe');
  });
});
