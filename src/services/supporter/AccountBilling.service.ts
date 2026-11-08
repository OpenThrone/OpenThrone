import prisma from '@/lib/prisma';
import {
  applyCancel,
  applySubscriptionDeleted,
  revoke,
} from '@/services/supporter/Entitlement.service';
import { getPaymentProviderFor } from '@/services/supporter/PaymentProvider';
import { getActiveAccountStatus } from '@/services/User.service';
import { logError } from '@/utils/logger';

const DELETED_EMAIL_SUFFIX = '@deleted.local';

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
    select: { userId: true, user: { select: { email: true } } },
  });
  let ended = 0;
  let errors = 0;
  for (const { userId, user } of memberships) {
    try {
      const status = (await getActiveAccountStatus(userId))?.status;
      const when = user.email.endsWith(DELETED_EMAIL_SUFFIX)
        ? 'now'
        : status === 'BANNED' || status === 'CLOSED'
          ? 'period_end'
          : null;
      if (when && (await endSupporterBilling(userId, when))) ended++;
    } catch {
      errors++;
      logError('Supporter billing stop failed', { userId });
    }
  }
  return { ended, errors };
}
