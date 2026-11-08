import type Stripe from 'stripe';

import prisma from '@/lib/prisma';
import { revealGiftCode } from '@/services/supporter/Gift.service';
import {
  type EventInput,
  type EventSummary,
  processPaymentEvent,
} from '@/services/supporter/PaymentEvents.service';
import { getStripeClient } from '@/services/supporter/StripeClient';

/**
 * Translates Stripe objects into the provider-neutral events the inbox
 * processes. Event ids are derived from the business object (checkout
 * session, invoice, refund, dispute), not from Stripe's evt_ id, so the
 * return page, webhook retries and reconciliation all collapse to one effect.
 * Objects are always re-fetched from Stripe; payloads are never stored.
 */

const ref = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);
const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;
const int = (value: string | null | undefined) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return ends.length ? iso(Math.max(...ends)) : null;
}

async function userIdFor(refs: {
  metadata?: Stripe.Metadata | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  paymentIntentId?: string | null;
}) {
  const fromMetadata = int(refs.metadata?.userId);
  if (fromMetadata) return fromMetadata;
  if (refs.subscriptionId) {
    const m = await prisma.supporterMembership.findFirst({
      where: {
        provider: 'stripe',
        providerSubscriptionId: refs.subscriptionId,
      },
    });
    if (m) return m.userId;
  }
  if (refs.customerId) {
    const m = await prisma.supporterMembership.findFirst({
      where: { provider: 'stripe', providerCustomerId: refs.customerId },
    });
    if (m) return m.userId;
  }
  if (refs.paymentIntentId) {
    const p = await prisma.payment.findUnique({
      where: { providerPaymentId: refs.paymentIntentId },
    });
    if (p) return p.userId;
  }
  return null;
}

/** The payment intent that paid an invoice (Stripe moved it off Invoice). */
async function invoicePaymentIntent(stripe: Stripe, invoiceId: string) {
  const payments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    status: 'paid',
    limit: 1,
  });
  return ref(payments.data[0]?.payment.payment_intent);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return ref(invoice.parent?.subscription_details?.subscription);
}

/** Internal checkout event for a completed, paid Checkout Session. */
export async function checkoutEvent(
  stripe: Stripe,
  sessionId: string,
): Promise<EventInput | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });
  if (
    session.status !== 'complete' ||
    !['paid', 'no_payment_required'].includes(session.payment_status)
  )
    return null;
  const md = session.metadata ?? {};
  const userId = int(md.userId) ?? int(session.client_reference_id);
  if (!userId || !md.planId) throw new Error('Checkout metadata missing');
  const customerId = ref(session.customer);
  const summary: EventSummary = {
    userId,
    planId: md.planId,
    session: session.id,
    amountCents: session.amount_total ?? 0,
    customerId,
    allianceId: int(md.allianceId),
    recipientUserId: int(md.recipientUserId),
    // Address region only (no card data): US-only sales and gift expiry.
    billingCountry: session.customer_details?.address?.country ?? null,
    billingState: session.customer_details?.address?.state ?? null,
  };
  if (session.mode === 'subscription') {
    const subscription = session.subscription as Stripe.Subscription | null;
    if (!subscription) throw new Error('Checkout subscription missing');
    const invoiceId = ref(session.invoice) ?? ref(subscription.latest_invoice);
    const paymentIntent = invoiceId
      ? await invoicePaymentIntent(stripe, invoiceId)
      : null;
    Object.assign(summary, {
      subscriptionId: subscription.id,
      periodEnd: subscriptionPeriodEnd(subscription),
      providerInvoiceId: invoiceId,
      providerPaymentId: paymentIntent ?? invoiceId ?? `stripe:${session.id}`,
    });
  } else {
    summary.providerPaymentId =
      ref(session.payment_intent) ?? `stripe:${session.id}`;
  }
  return {
    provider: 'stripe',
    providerEventId: `stripe:checkout:${session.id}`,
    type: 'checkout.session.completed',
    summary,
  };
}

/**
 * Records a paid checkout once, from whichever path arrives first (return
 * page or webhook). Returns where to send the player and, for gifts, the
 * purchaser's code even if the webhook already fulfilled it.
 */
export async function fulfillCheckoutSession(
  sessionId: string,
  expectedUserId?: number,
  stripe: Stripe = getStripeClient(),
) {
  const event = await checkoutEvent(stripe, sessionId);
  if (!event) throw new Error('Checkout is not paid');
  if (expectedUserId !== undefined && event.summary.userId !== expectedUserId)
    throw new Error('Checkout belongs to another player');
  const result = await processPaymentEvent(event);
  if (result.event.status === 'FAILED') throw new Error('Checkout failed');
  let giftCode = 'giftCode' in result ? result.giftCode : undefined;
  if (!giftCode && String(event.summary.planId).startsWith('gift_')) {
    const payment = await prisma.payment.findUnique({
      where: { providerPaymentId: String(event.summary.providerPaymentId) },
    });
    if (payment)
      giftCode =
        (await revealGiftCode(Number(event.summary.userId), payment.id)) ??
        undefined;
  }
  const { allianceId } = event.summary;
  return {
    redirect:
      event.summary.planId === 'alliance_sponsorship' && allianceId
        ? `/alliances/${allianceId}?sponsorship=success`
        : '/home/supporter?checkout=success',
    ...(giftCode ? { giftCode } : {}),
  };
}

export async function invoiceEvent(
  stripe: Stripe,
  invoiceId: string,
  type: 'invoice.paid' | 'invoice.payment_failed',
): Promise<EventInput | null> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = invoiceSubscriptionId(invoice);
  // First invoices are fulfilled by their checkout session.
  if (!subscriptionId || invoice.billing_reason === 'subscription_create')
    return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await userIdFor({
    metadata: subscription.metadata,
    subscriptionId,
    customerId: ref(invoice.customer),
  });
  if (!userId) throw new Error('No player for invoice');
  if (type === 'invoice.paid') {
    const paymentIntent = await invoicePaymentIntent(stripe, invoice.id);
    return {
      provider: 'stripe',
      providerEventId: `stripe:invoice.paid:${invoice.id}`,
      type,
      summary: {
        userId,
        subscriptionId,
        amountCents: invoice.amount_paid,
        periodEnd: subscriptionPeriodEnd(subscription),
        providerInvoiceId: invoice.id,
        providerPaymentId: paymentIntent ?? invoice.id,
        billingCountry: invoice.customer_address?.country ?? null,
        billingState: invoice.customer_address?.state ?? null,
      },
    };
  }
  return {
    provider: 'stripe',
    providerEventId: `stripe:invoice.payment_failed:${invoice.id}:${invoice.attempt_count}`,
    type,
    summary: {
      userId,
      planId: 'supporter_monthly',
      subscriptionId,
      amountCents: invoice.amount_due,
      providerInvoiceId: invoice.id,
      providerPaymentId: `${invoice.id}:attempt:${invoice.attempt_count}`,
    },
  };
}

export async function subscriptionEvent(
  stripe: Stripe,
  subscriptionId: string,
  eventId: string,
): Promise<EventInput | null> {
  // Until checkout fulfillment links the subscription, its state comes from
  // the checkout itself; earlier updates are not errors.
  const membership = await prisma.supporterMembership.findFirst({
    where: { provider: 'stripe', providerSubscriptionId: subscriptionId },
  });
  if (!membership) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { userId } = membership;
  const ended = ['canceled', 'incomplete_expired'].includes(
    subscription.status,
  );
  return {
    provider: 'stripe',
    // Current state is re-read, so each delivery may apply; ids stay unique.
    providerEventId: `stripe:subscription:${eventId}`,
    type: ended
      ? 'customer.subscription.deleted'
      : 'customer.subscription.updated',
    summary: {
      userId,
      subscriptionId,
      periodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end || subscription.cancel_at !== null,
    },
  };
}

async function paymentFor(paymentIntentId: string | null) {
  if (!paymentIntentId) return null;
  return prisma.payment.findUnique({
    where: { providerPaymentId: paymentIntentId },
  });
}

export async function refundEvent(
  refund: Stripe.Refund,
): Promise<EventInput | null> {
  if (refund.status !== 'succeeded') return null;
  const payment = await paymentFor(ref(refund.payment_intent));
  if (!payment) return null;
  const createdById = int(refund.metadata?.createdById);
  return {
    provider: 'stripe',
    providerEventId: `stripe:refund:${refund.id}`,
    type: 'charge.refunded',
    summary: {
      paymentId: payment.id,
      amountCents: refund.amount,
      refundId: refund.id,
      reason: refund.metadata?.reason ?? refund.reason ?? null,
      createdById,
    },
  };
}

export async function disputeEvent(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<EventInput | null> {
  // Inquiries (warning_*) are not chargebacks; perks stay until one is filed.
  if (dispute.status.startsWith('warning_')) return null;
  const payment = await paymentFor(ref(dispute.payment_intent));
  if (!payment) return null;
  const closed = ['won', 'lost'].includes(dispute.status);
  const summary: EventSummary = {
    paymentId: payment.id,
    disputeId: dispute.id,
    amountCents: dispute.amount,
    reason: dispute.reason,
  };
  if (closed) {
    summary.outcome = dispute.status;
    const membership = await prisma.supporterMembership.findUnique({
      where: { userId: payment.userId },
    });
    if (payment.kind === 'SUBSCRIPTION' && membership?.providerSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(
        membership.providerSubscriptionId,
      );
      summary.cancelAtPeriodEnd =
        subscription.cancel_at_period_end ||
        subscription.cancel_at !== null ||
        subscription.status === 'canceled';
    }
  }
  return {
    provider: 'stripe',
    providerEventId: `stripe:dispute:${dispute.id}:${closed ? 'closed' : 'created'}`,
    type: closed ? 'charge.dispute.closed' : 'charge.dispute.created',
    summary,
  };
}

/** Maps a verified webhook event to internal events (re-fetching objects). */
export async function eventsForWebhook(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<EventInput[]> {
  const object = event.data.object as { id?: string };
  const one = (e: EventInput | null) => (e ? [e] : []);
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return one(await checkoutEvent(stripe, object.id!));
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return one(await invoiceEvent(stripe, object.id!, event.type));
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return one(await subscriptionEvent(stripe, object.id!, event.id));
    case 'charge.refunded': {
      const refunds = await stripe.refunds.list({
        charge: object.id!,
        limit: 100,
      });
      const events = await Promise.all(refunds.data.map(refundEvent));
      return events.filter((e): e is EventInput => !!e);
    }
    case 'refund.created':
    case 'refund.updated':
      return one(await refundEvent(await stripe.refunds.retrieve(object.id!)));
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
      return one(
        await disputeEvent(stripe, await stripe.disputes.retrieve(object.id!)),
      );
    default:
      return [];
  }
}

/** Processes a verified webhook; processing failures stay FAILED for replay. */
export async function handleStripeWebhook(
  event: Stripe.Event,
  stripe: Stripe = getStripeClient(),
) {
  const events = await eventsForWebhook(stripe, event);
  const results = [];
  for (const input of events) {
    try {
      results.push((await processPaymentEvent(input)).event.status);
    } catch {
      results.push('FAILED');
    }
  }
  return results;
}
