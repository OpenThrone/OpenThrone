import type Stripe from 'stripe';

import prisma from '@/lib/prisma';
import { processPaymentEvent } from '@/services/supporter/PaymentEvents.service';
import type { PaymentProvider } from '@/services/supporter/PaymentProvider';
import {
  getSupporterPlans,
  type PricedSupporterPlan,
} from '@/services/supporter/planPrices';
import { getStripeClient } from '@/services/supporter/StripeClient';
import { refundEvent } from '@/services/supporter/StripeEvents.service';
import type { CheckoutRequest } from '@/types/supporter';

export {
  getStripeClient,
  isStripeTestMode,
} from '@/services/supporter/StripeClient';

const MAX_SPONSORSHIP_CENTS = 1000000;
let portalConfiguration: string | null | undefined;

export class StripeProvider implements PaymentProvider {
  private readonly stripe?: Stripe;

  constructor(stripe?: Stripe) {
    this.stripe = stripe;
  }

  private get api() {
    return this.stripe ?? getStripeClient();
  }

  async createCheckout(
    userId: number,
    request: CheckoutRequest & {
      noticeText?: string;
      resolvedPlan?: PricedSupporterPlan;
    },
  ) {
    const base = process.env.NEXTAUTH_URL;
    if (!base) throw new Error('NEXTAUTH_URL is required');
    const { origin } = new URL(base);
    const membership = await prisma.supporterMembership.findUnique({
      where: { userId },
    });
    const metadata: Record<string, string> = {
      userId: String(userId),
      planId: request.planId,
    };
    if (request.allianceId !== undefined)
      metadata.allianceId = String(request.allianceId);
    if (request.recipientUserId !== undefined)
      metadata.recipientUserId = String(request.recipientUserId);
    const monthly = request.planId === 'supporter_monthly';
    let line: Stripe.Checkout.SessionCreateParams.LineItem;
    if (request.planId === 'alliance_sponsorship') {
      if (
        !Number.isSafeInteger(request.amountCents) ||
        request.amountCents! < 500 ||
        request.amountCents! > MAX_SPONSORSHIP_CENTS
      )
        throw new Error('Invalid sponsorship amount');
      line = {
        price_data: {
          currency: 'usd',
          unit_amount: request.amountCents!,
          product_data: { name: 'OpenThrone alliance sponsorship' },
        },
        quantity: 1,
      };
    } else {
      const plan =
        request.resolvedPlan ?? (await getSupporterPlans())[request.planId];
      const lookup = `ot_${request.planId}`;
      let price = plan.providerPriceId;
      if (!price) {
        const result = await this.api.prices.list({
          lookup_keys: [lookup],
          active: true,
        });
        const current = result.data.find(
          (entry) =>
            entry.unit_amount === plan.priceCents &&
            entry.currency === plan.currency,
        );
        price = current?.id ?? null;
        if (!price)
          throw new Error(
            `Missing matching Stripe price ${lookup}; sync products`,
          );
      }
      line = { price, quantity: 1 };
    }
    const success =
      request.planId === 'alliance_sponsorship'
        ? `/alliances/${request.allianceId}?sponsorship=success&session_id={CHECKOUT_SESSION_ID}`
        : '/home/supporter?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancel =
      request.planId === 'alliance_sponsorship'
        ? `/alliances/${request.allianceId}?sponsorship=canceled`
        : '/home/supporter?checkout=canceled';
    const session = await this.api.checkout.sessions.create({
      mode: monthly ? 'subscription' : 'payment',
      client_reference_id: String(userId),
      metadata,
      line_items: [line],
      success_url: origin + success,
      cancel_url: origin + cancel,
      // US-only sales: the billing address is collected and recorded, and
      // the consent the buyer gave is shown again beside the pay button.
      billing_address_collection: 'required',
      ...(request.noticeText
        ? {
            custom_text: {
              submit: { message: request.noticeText.slice(0, 1200) },
            },
          }
        : {}),
      ...(membership?.provider === 'stripe' && membership.providerCustomerId
        ? { customer: membership.providerCustomerId }
        : monthly
          ? {}
          : { customer_creation: 'always' as const }),
      ...(monthly
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
    });
    if (!session.url) throw new Error('Stripe checkout URL missing');
    return { url: session.url, sessionId: session.id };
  }

  /**
   * The portal settings created by scripts/stripe-sync-products.ts (a new
   * account has no default until one is saved in the dashboard).
   */
  private async portalConfiguration() {
    if (process.env.STRIPE_PORTAL_CONFIGURATION)
      return process.env.STRIPE_PORTAL_CONFIGURATION;
    if (portalConfiguration === undefined) {
      const configs = await this.api.billingPortal.configurations.list({
        active: true,
        limit: 100,
      });
      portalConfiguration =
        configs.data.find((c) => c.metadata?.ot_supporter === 'true')?.id ??
        null;
    }
    return portalConfiguration;
  }

  async createPortalSession(userId: number) {
    const membership = await prisma.supporterMembership.findUnique({
      where: { userId },
    });
    if (
      membership?.provider !== 'stripe' ||
      !membership.providerCustomerId ||
      !process.env.NEXTAUTH_URL
    )
      throw new Error('Billing customer not found');
    const configuration = await this.portalConfiguration();
    const session = await this.api.billingPortal.sessions.create({
      customer: membership.providerCustomerId,
      ...(configuration ? { configuration } : {}),
      return_url: new URL(
        '/home/supporter',
        process.env.NEXTAUTH_URL,
      ).toString(),
    });
    return { url: session.url };
  }

  async refund(
    paymentId: string,
    amountCents: number,
    metadata?: { reason: string; createdById: number },
  ) {
    const refund = await this.api.refunds.create({
      payment_intent: paymentId,
      amount: amountCents,
      ...(metadata
        ? {
            metadata: {
              reason: metadata.reason,
              createdById: String(metadata.createdById),
            },
          }
        : {}),
    });
    // Record now; the later charge.refunded webhook dedupes on the refund id.
    // Pending refunds are recorded when refund.updated reports success.
    const event = await refundEvent(refund);
    if (event) await processPaymentEvent(event);
    return refund.id;
  }

  async parseWebhook(payload: unknown) {
    return payload;
  }

  async cancelSubscription(subscriptionId: string, when: 'now' | 'period_end') {
    const subscription = await this.api.subscriptions.retrieve(subscriptionId);
    if (['canceled', 'incomplete_expired'].includes(subscription.status))
      return false;
    if (when === 'now') await this.api.subscriptions.cancel(subscriptionId);
    else if (subscription.cancel_at_period_end) return false;
    else
      await this.api.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    return true;
  }
}
