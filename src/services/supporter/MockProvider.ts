import { randomUUID } from 'node:crypto';

import prisma from '@/lib/prisma';
import type { PaymentProvider } from '@/services/supporter/PaymentProvider';
import {
  getSupporterPlans,
  type PricedSupporterPlan,
} from '@/services/supporter/planPrices';
import type { CheckoutRequest } from '@/types/supporter';

export function assertMockAllowed() {
  if (process.env.NODE_ENV !== 'production') return;
  for (const value of [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    if (!value) continue;
    try {
      if (new URL(value).hostname.toLowerCase() === 'openthrone.dev')
        throw new Error('Mock payments are disabled on production');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Mock payments are disabled on production'
      )
        throw error;
    }
  }
}
export class MockProvider implements PaymentProvider {
  constructor() {
    assertMockAllowed();
  }

  async createCheckout(
    userId: number,
    request: CheckoutRequest & { resolvedPlan?: PricedSupporterPlan },
  ) {
    const session = randomUUID();
    const amountCents =
      request.planId === 'alliance_sponsorship'
        ? request.amountCents
        : (request.resolvedPlan ?? (await getSupporterPlans())[request.planId])
            .priceCents;
    await prisma.paymentEvent.create({
      data: {
        provider: 'mock',
        providerEventId: `session:${session}`,
        type: 'mock.checkout.pending',
        // Plan fields only; the consent record lives in PurchaseConsent.
        summary: {
          userId,
          planId: request.planId,
          ...(amountCents === undefined ? {} : { amountCents }),
          ...(request.allianceId === undefined
            ? {}
            : { allianceId: request.allianceId }),
          ...(request.recipientUserId === undefined
            ? {}
            : { recipientUserId: request.recipientUserId }),
        },
      },
    });
    return {
      url: `/supporter/mock-checkout?session=${session}`,
      sessionId: session,
    };
  }

  async createPortalSession() {
    return { url: '/home/supporter?portal=mock' };
  }

  async refund(
    paymentId: string,
    amountCents: number,
    metadata?: { reason: string; createdById: number },
  ) {
    const payment = await prisma.payment.findUnique({
      where: { providerPaymentId: paymentId },
    });
    if (!payment || payment.provider !== 'mock')
      throw new Error('Payment not found');
    const { processPaymentEvent } =
      await import('@/services/supporter/PaymentEvents.service');
    await processPaymentEvent({
      provider: 'mock',
      providerEventId: `refund:${randomUUID()}`,
      type: 'charge.refunded',
      summary: { paymentId: payment.id, amountCents, ...metadata },
    });
  }

  async parseWebhook(payload: unknown) {
    return payload;
  }

  /** Mock subscriptions have no remote side; callers update local state. */
  async cancelSubscription() {
    return true;
  }
}
