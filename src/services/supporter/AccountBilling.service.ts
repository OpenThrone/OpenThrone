import prisma from '@/lib/prisma';
import {
  applyCancel,
  applySubscriptionDeleted,
  applySubscriptionUpdate,
  revoke,
} from '@/services/supporter/Entitlement.service';
import { getPaymentProviderFor } from '@/services/supporter/PaymentProvider';
import { getActiveAccountStatus } from '@/services/User.service';
import { logError } from '@/utils/logger';

/**
 * Stops a player's subscription billing. `now` is for deleted accounts
 * (cancelled at once, no refund, perks end); `period_end` is for banned or
 * closed accounts (no further renewals; refunds stay an admin decision).
 * Eligibility ignores local perk status: an expired or revoked membership
 * can still have a renewing subscription. The provider call is idempotent.
 * Returns false when the provider had nothing left to cancel.
 */
export async function endSupporterBilling(
  userId: number,
  when: 'now' | 'period_end',
) {
  const membership = await prisma.supporterMembership.findUnique({
    where: { userId },
  });
  if (
    !membership?.providerSubscriptionId ||
    // CANCELED means the provider already ended the subscription.
    membership.status === 'CANCELED'
  )
    return false;
  // A failed stop shows in the admin webhook-events list until it succeeds.
  const providerEventId = `billing-stop:${userId}`;
  let changed: boolean;
  try {
    changed = await getPaymentProviderFor(
      membership.provider,
    ).cancelSubscription(membership.providerSubscriptionId, when);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Cancel failed';
    await prisma.paymentEvent.upsert({
      where: { providerEventId },
      create: {
        provider: membership.provider,
        providerEventId,
        type: 'billing.stop',
        status: 'FAILED',
        error: message,
        summary: {
          userId,
          subscriptionId: membership.providerSubscriptionId,
          status: when,
        },
      },
      update: { status: 'FAILED', error: message },
    });
    throw error;
  }
  await prisma.paymentEvent.updateMany({
    where: { providerEventId, status: 'FAILED' },
    data: { status: 'PROCESSED', error: null, processedAt: new Date() },
  });
  if (when === 'now') {
    // Perks end and the row matches the provider: the subscription is gone.
    await revoke(userId);
    await applySubscriptionDeleted(userId);
  } else await applyCancel(userId);
  return changed;
}

/**
 * Undoes `endSupporterBilling(userId, 'period_end')` when the paid period is
 * still running (used when an erasure request is cancelled). A subscription
 * whose period has ended, or that the provider already closed, cannot be
 * resumed: the player subscribes again. Returns true when renewal resumed.
 */
export async function resumeSupporterBilling(userId: number) {
  const membership = await prisma.supporterMembership.findUnique({
    where: { userId },
  });
  if (
    !membership?.providerSubscriptionId ||
    !membership.cancelAtPeriodEnd ||
    membership.status === 'CANCELED' ||
    membership.status === 'EXPIRED' ||
    !membership.subscriptionPeriodEnd ||
    membership.subscriptionPeriodEnd <= new Date()
  )
    return false;
  const resumed = await getPaymentProviderFor(
    membership.provider,
  ).resumeSubscription(membership.providerSubscriptionId);
  if (!resumed) return false;
  await applySubscriptionUpdate(
    userId,
    membership.subscriptionPeriodEnd,
    false,
  );
  return true;
}

/** Best-effort after a cancel commits; failures are logged, the player can resubscribe. */
export const resumeSupporterBillingSoon = (userId: number) =>
  resumeSupporterBilling(userId).catch(() => {
    logError('Supporter billing resume failed', { userId });
    return false;
  });

/** Best-effort call after an account action commits; the daily sweep retries. */
export const endSupporterBillingSoon = (
  userId: number,
  when: 'now' | 'period_end',
) =>
  endSupporterBilling(userId, when).catch(() =>
    logError('Supporter billing stop failed; the daily job will retry', {
      userId,
    }),
  );

/**
 * Daily backstop: any renewing subscription on a deleted, banned or closed
 * account is stopped.
 */
export async function sweepEndedAccountBilling() {
  const memberships = await prisma.supporterMembership.findMany({
    where: {
      providerSubscriptionId: { not: null },
      status: { not: 'CANCELED' },
    },
    select: { userId: true, user: { select: { anonymizedAt: true } } },
  });
  let ended = 0;
  let errors = 0;
  const failures: { userId: number; error: unknown }[] = [];
  for (const { userId, user } of memberships) {
    try {
      const status = (await getActiveAccountStatus(userId))?.status;
      const when = user.anonymizedAt
        ? 'now'
        : status === 'BANNED' || status === 'CLOSED'
          ? 'period_end'
          : null;
      if (when && (await endSupporterBilling(userId, when))) ended++;
    } catch (error) {
      errors++;
      failures.push({ userId, error });
      logError('Supporter billing stop failed', { userId, error });
    }
  }
  return { ended, errors, failures };
}
