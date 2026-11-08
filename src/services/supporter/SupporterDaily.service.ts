import prisma from '@/lib/prisma';
import {
  enqueueDailyDigests,
  pruneDiscordOutbox,
} from '@/services/discord/DiscordAlerts.service';
import { sweepEndedAccountBilling } from '@/services/supporter/AccountBilling.service';
import { convertPool } from '@/services/supporter/AllianceSponsorship.service';
import { recompute } from '@/services/supporter/Entitlement.service';
import {
  type ReconcileReport,
  reconcileStripe,
} from '@/services/supporter/StripeReconcile.service';
import { logError } from '@/utils/logger';

const SPONSORSHIP_MONTH_CENTS = 499;

export interface SupporterDailyReport {
  poolsConverted: number;
  membershipsLapsed: number;
  reconcile: Pick<ReconcileReport, 'applied' | 'failed'> | null;
  billingEnded: number;
  discordDigests: number;
  errors: number;
}

/**
 * Daily supporter housekeeping, run from the daily cron:
 * - turn whole months of alliance sponsorship pools into premium time;
 * - move memberships whose perks ended out of ACTIVE/PAST_DUE and clear
 *   their badge;
 * - with Stripe, re-apply anything from the last 3 days the webhook missed;
 * - stop renewals for deleted, banned or closed accounts;
 * - queue Discord daily digests and prune old sent DMs.
 * Gift expiry needs no job: redemption checks expiresAt (null = never).
 */
export async function runSupporterDaily(
  now = new Date(),
): Promise<SupporterDailyReport> {
  const report: SupporterDailyReport = {
    poolsConverted: 0,
    membershipsLapsed: 0,
    reconcile: null,
    billingEnded: 0,
    discordDigests: 0,
    errors: 0,
  };
  const pools = await prisma.allianceSponsorship.findMany({
    where: { poolCents: { gte: SPONSORSHIP_MONTH_CENTS } },
    select: { allianceId: true },
  });
  for (const { allianceId } of pools) {
    try {
      await convertPool(allianceId);
      report.poolsConverted++;
    } catch (error) {
      report.errors++;
      logError('Supporter pool conversion failed', { allianceId, error });
    }
  }
  const lapsed = await prisma.supporterMembership.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      currentPeriodEnd: { lte: now },
    },
    select: { userId: true },
  });
  for (const { userId } of lapsed) {
    try {
      await recompute(userId);
      report.membershipsLapsed++;
    } catch (error) {
      report.errors++;
      logError('Supporter membership recompute failed', { userId, error });
    }
  }
  if (
    process.env.PAYMENT_PROVIDER === 'stripe' &&
    process.env.STRIPE_SECRET_KEY
  )
    try {
      const { applied, failed } = await reconcileStripe({ days: 3 });
      report.reconcile = { applied, failed };
      report.errors += failed.length;
    } catch (error) {
      report.errors++;
      logError('Stripe reconciliation failed', error);
    }
  const billing = await sweepEndedAccountBilling();
  report.billingEnded = billing.ended;
  report.errors += billing.errors;
  try {
    report.discordDigests = await enqueueDailyDigests(now);
    await pruneDiscordOutbox();
  } catch (error) {
    report.errors++;
    logError('Discord digest failed', error);
  }
  return report;
}
