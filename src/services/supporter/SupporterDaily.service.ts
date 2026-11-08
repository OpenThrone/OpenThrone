import prisma from '@/lib/prisma';
import { truncateErrorMessage } from '@/services/CronRun.service';
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
/** Failure lines kept on the report; `errors` still counts every failure. */
const MAX_FAILURES = 10;
/** Longest cause kept per failure line (the run log caps strings at 200). */
const FAILURE_CAUSE_LENGTH = 120;

export interface SupporterDailyReport {
  poolsConverted: number;
  membershipsLapsed: number;
  reconcile: Pick<ReconcileReport, 'applied' | 'failed'> | null;
  billingEnded: number;
  discordDigests: number;
  errors: number;
  /**
   * One line per failure (`kind ref: cause`), capped at MAX_FAILURES. Ids and
   * redacted messages only, so the cron run log can show what went wrong.
   */
  failures: string[];
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
    failures: [],
  };
  const fail = (kind: string, ref: string | number | null, error: unknown) => {
    report.errors++;
    if (report.failures.length >= MAX_FAILURES) return;
    const cause = truncateErrorMessage(error).slice(0, FAILURE_CAUSE_LENGTH);
    report.failures.push(`${kind}${ref === null ? '' : ` ${ref}`}: ${cause}`);
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
      fail('pool', allianceId, error);
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
      fail('recompute', userId, error);
      logError('Supporter membership recompute failed', { userId, error });
    }
  }
  if (
    process.env.PAYMENT_PROVIDER === 'stripe' &&
    process.env.STRIPE_SECRET_KEY
  )
    try {
      const { applied, failed, failures } = await reconcileStripe({ days: 3 });
      report.reconcile = { applied, failed };
      for (const { id, error } of failures) {
        fail('reconcile', id, error);
        logError('Stripe reconcile event failed', { eventId: id, error });
      }
    } catch (error) {
      fail('reconcile', null, error);
      logError('Stripe reconciliation failed', error);
    }
  const billing = await sweepEndedAccountBilling();
  report.billingEnded = billing.ended;
  for (const { userId, error } of billing.failures)
    fail('billing', userId, error);
  try {
    report.discordDigests = await enqueueDailyDigests(now);
    await pruneDiscordOutbox();
  } catch (error) {
    fail('discord', null, error);
    logError('Discord digest failed', error);
  }
  return report;
}
