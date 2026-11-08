import type Stripe from 'stripe';

import prisma from '@/lib/prisma';
import {
  type EventInput,
  processPaymentEvent,
  replay,
} from '@/services/supporter/PaymentEvents.service';
import { getStripeClient } from '@/services/supporter/StripeClient';
import {
  checkoutEvent,
  disputeEvent,
  invoiceEvent,
  refundEvent,
  subscriptionPeriodEnd,
} from '@/services/supporter/StripeEvents.service';

export interface ReconcileReport {
  dryRun: boolean;
  days: number;
  scanned: Record<
    'checkouts' | 'invoices' | 'refunds' | 'disputes' | 'subscriptions',
    number
  >;
  /** Internal event ids applied (or that would be, in a dry run). */
  applied: string[];
  failed: string[];
}

/**
 * Re-reads recent Stripe objects and pushes anything we have not recorded
 * through the same idempotent paths the webhook uses. Safe to run repeatedly.
 */
export async function reconcileStripe({
  days = 35,
  dryRun = false,
  stripe = getStripeClient(),
}: { days?: number; dryRun?: boolean; stripe?: Stripe } = {}) {
  const created = { gte: Math.floor(Date.now() / 1000) - days * 86_400 };
  const report: ReconcileReport = {
    dryRun,
    days,
    scanned: {
      checkouts: 0,
      invoices: 0,
      refunds: 0,
      disputes: 0,
      subscriptions: 0,
    },
    applied: [],
    failed: [],
  };
  const run = async (input: EventInput | null) => {
    if (!input) return;
    const existing = await prisma.paymentEvent.findUnique({
      where: { providerEventId: input.providerEventId },
    });
    if (existing && existing.status !== 'FAILED') return;
    if (dryRun) {
      report.applied.push(input.providerEventId);
      return;
    }
    try {
      const result = existing
        ? await replay(existing.id)
        : await processPaymentEvent(input);
      (result.event.status === 'FAILED' ? report.failed : report.applied).push(
        input.providerEventId,
      );
    } catch {
      report.failed.push(input.providerEventId);
    }
  };

  for await (const session of stripe.checkout.sessions.list({
    created,
    status: 'complete',
    limit: 100,
  })) {
    report.scanned.checkouts++;
    await run(await checkoutEvent(stripe, session.id));
  }
  for await (const invoice of stripe.invoices.list({
    created,
    status: 'paid',
    limit: 100,
  })) {
    report.scanned.invoices++;
    await run(await invoiceEvent(stripe, invoice.id, 'invoice.paid'));
  }
  for await (const refund of stripe.refunds.list({ created, limit: 100 })) {
    report.scanned.refunds++;
    await run(await refundEvent(refund));
  }
  for await (const dispute of stripe.disputes.list({ created, limit: 100 })) {
    report.scanned.disputes++;
    // A closed dispute only restores what its opening revoked, so replay the
    // opening first (a no-op when it was already recorded).
    if (['won', 'lost'].includes(dispute.status))
      await run(
        await disputeEvent(stripe, { ...dispute, status: 'needs_response' }),
      );
    await run(await disputeEvent(stripe, dispute));
  }
  for await (const subscription of stripe.subscriptions.list({
    status: 'all',
    created,
    limit: 100,
  })) {
    report.scanned.subscriptions++;
    const membership = await prisma.supporterMembership.findFirst({
      where: { provider: 'stripe', providerSubscriptionId: subscription.id },
    });
    if (!membership) continue;
    const periodEnd = subscriptionPeriodEnd(subscription);
    const cancel =
      subscription.cancel_at_period_end || subscription.cancel_at !== null;
    const ended = ['canceled', 'incomplete_expired'].includes(
      subscription.status,
    );
    const drift =
      (periodEnd !== null &&
        (membership.subscriptionPeriodEnd?.getTime() ?? 0) <
          new Date(periodEnd).getTime()) ||
      membership.cancelAtPeriodEnd !== (cancel || ended) ||
      (ended && !['CANCELED', 'EXPIRED'].includes(membership.status));
    if (!drift) continue;
    await run({
      provider: 'stripe',
      providerEventId: `stripe:subscription:reconcile:${subscription.id}:${periodEnd}:${cancel}:${subscription.status}`,
      type: ended
        ? 'customer.subscription.deleted'
        : 'customer.subscription.updated',
      summary: {
        userId: membership.userId,
        subscriptionId: subscription.id,
        periodEnd,
        cancelAtPeriodEnd: cancel,
      },
    });
  }
  return report;
}
