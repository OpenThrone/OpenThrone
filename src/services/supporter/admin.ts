import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { getSponsorshipInfo } from '@/services/supporter/AllianceSponsorship.service';
import { isStripeTestMode } from '@/services/supporter/StripeClient';
import type { AuthenticatedRequest } from '@/types/api';

export const supporterGuard = (
  methods: string[],
): ((
  handler: (
    req: AuthenticatedRequest,
    res: NextApiResponse,
  ) => Promise<unknown>,
) => (req: AuthenticatedRequest, res: NextApiResponse) => Promise<unknown>) =>
  withApiGuard({
    methods,
    authMode: 'permission',
    requiredAnyPermissions: [PermissionType.MANAGE_SUPPORTERS],
    rateLimitProfile: 'admin',
  });
export const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('comp'),
    days: z.number().int().min(1).max(3650),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal('revoke'),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal('refund'),
    paymentId: z.number().int().positive(),
    amountCents: z.number().int().positive().optional(),
    reason: z.string().trim().min(3).max(500),
    /** Subscription payments: also stop the subscription now (no renewal). */
    cancelSubscription: z.boolean().optional(),
  }),
  z.object({ action: z.literal('setBadgeVisible'), badgeVisible: z.boolean() }),
  z.object({
    action: z.literal('unlinkDiscord'),
    reason: z.string().trim().min(3).max(500),
  }),
]);
export function pagination(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error('Invalid pagination');
  return { skip: (page - 1) * pageSize, take: pageSize };
}
export async function membershipRow(m: any) {
  const sums = await prisma.payment.aggregate({
    where: {
      userId: m.userId,
      status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    },
    _sum: { amountCents: true, refundedCents: true },
  });
  return {
    userId: m.userId,
    displayName: m.user.display_name,
    status: m.status,
    source: m.source,
    activeUntil: m.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: m.cancelAtPeriodEnd,
    startedAt: m.startedAt.toISOString(),
    totalPaidCents:
      (sums._sum.amountCents ?? 0) - (sums._sum.refundedCents ?? 0),
    provider: m.provider,
    providerCustomerId: m.providerCustomerId,
    providerSubscriptionId: m.providerSubscriptionId,
  };
}
export function paymentRow(p: any) {
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    amountCents: p.amountCents,
    refundedCents: p.refundedCents,
    taxCents: p.taxCents,
    currency: p.currency,
    description: p.description,
    createdAt: p.createdAt.toISOString(),
    allianceId: p.allianceId,
    provider: p.provider,
    providerPaymentId: p.providerPaymentId,
  };
}
export function giftRow(g: any) {
  return {
    id: g.id,
    codePrefix: g.codePrefix,
    months: g.months,
    status: g.revokedAt
      ? 'REVOKED'
      : g.redeemedAt
        ? 'REDEEMED'
        : g.expiresAt && g.expiresAt <= new Date()
          ? 'EXPIRED'
          : 'UNREDEEMED',
    recipientName: g.recipient?.display_name ?? null,
    redeemedByName: g.redeemedBy?.display_name ?? null,
    redeemedAt: g.redeemedAt?.toISOString() ?? null,
    expiresAt: g.expiresAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
  };
}
export async function summary() {
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const active = {
    status: {
      in: ['ACTIVE', 'PAST_DUE', 'CANCELED'] as (
        | 'ACTIVE'
        | 'PAST_DUE'
        | 'CANCELED'
      )[],
    },
    currentPeriodEnd: { gt: now },
  };
  const [
    activeSupporters,
    pastDue,
    subscriptions,
    payments,
    refunds,
    failedEvents,
    activeSponsoredAlliances,
  ] = await Promise.all([
    prisma.supporterMembership.count({ where: active }),
    prisma.supporterMembership.count({
      where: { ...active, status: 'PAST_DUE' },
    }),
    // MRR: the latest charge of each subscription that will bill again (not
    // ones winding down). Catalog edits never rewrite what a subscriber pays.
    prisma.$queryRaw<{ mrr: bigint | number | null }[]>`
      SELECT COALESCE(SUM(latest."amountCents"), 0) AS mrr FROM (
        SELECT DISTINCT ON (p."userId", p."provider") p."amountCents"
        FROM "Payment" p
        JOIN "SupporterMembership" m
          ON m."userId" = p."userId" AND m."provider" = p."provider"
        WHERE p."kind" = 'SUBSCRIPTION'
          AND p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED')
          AND m."status" IN ('ACTIVE', 'PAST_DUE')
          AND m."source" = 'SUBSCRIPTION'
          AND m."cancelAtPeriodEnd" = false
          AND m."currentPeriodEnd" > ${now}
        ORDER BY p."userId", p."provider", p."createdAt" DESC, p."id" DESC
      ) latest
    `,
    prisma.payment.aggregate({
      where: {
        createdAt: { gte: month },
        status: {
          in: ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
        },
      },
      _sum: { amountCents: true },
    }),
    prisma.paymentRefund.aggregate({
      where: { createdAt: { gte: month } },
      _sum: { amountCents: true },
    }),
    prisma.paymentEvent.count({ where: { status: 'FAILED' } }),
    prisma.allianceSponsorship.count({ where: { activeUntil: { gt: now } } }),
  ]);
  return {
    activeSupporters,
    pastDue,
    mrrCents: Number(subscriptions[0]?.mrr ?? 0),
    revenueThisMonthCents: payments._sum.amountCents ?? 0,
    refundsThisMonthCents: refunds._sum.amountCents ?? 0,
    failedEvents,
    activeSponsoredAlliances,
    provider: process.env.PAYMENT_PROVIDER ?? 'mock',
    testMode:
      (process.env.PAYMENT_PROVIDER ?? 'mock') === 'mock' || isStripeTestMode(),
  };
}
export async function sponsorshipRow(row: {
  allianceId: number;
  alliance: { name: string };
}) {
  return {
    ...(await getSponsorshipInfo(row.allianceId)),
    name: row.alliance.name,
  };
}
