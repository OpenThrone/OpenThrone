import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import {
  actionSchema,
  membershipRow,
  supporterGuard,
} from '@/services/supporter/admin';
import {
  applySubscriptionDeleted,
  getSupporterStatus,
  grantDays,
  revoke,
  setBadgeVisible,
} from '@/services/supporter/Entitlement.service';
import { getHistory } from '@/services/supporter/history';
import { getPaymentProviderFor } from '@/services/supporter/PaymentProvider';
import type { AuthenticatedRequest } from '@/types/api';
import type { DiscordNotifyPrefs } from '@/types/supporter';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

async function result(userId: number) {
  const [status, membership, history, payments, discord, outbox, consents] =
    await Promise.all([
      getSupporterStatus(userId),
      prisma.supporterMembership.findUnique({
        where: { userId },
        include: { user: { select: { display_name: true } } },
      }),
      getHistory(userId),
      prisma.payment.findMany({
        where: { userId },
        select: { id: true, providerPaymentId: true },
      }),
      prisma.discordLink.findUnique({ where: { userId } }),
      prisma.discordOutbox.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.purchaseConsent.findMany({
        where: { userId },
        orderBy: { acceptedAt: 'desc' },
        take: 50,
      }),
    ]);
  return {
    status,
    membership: membership ? await membershipRow(membership) : null,
    ...history,
    payments: history.payments.map((p) => ({
      ...p,
      providerPaymentId: payments.find((row) => row.id === p.id)
        ?.providerPaymentId,
    })),
    discord: discord
      ? {
          discordUserId: discord.discordUserId,
          discordUsername: discord.discordUsername,
          linkedAt: discord.linkedAt.toISOString(),
          notifyPrefs: discord.notifyPrefs as unknown as DiscordNotifyPrefs,
          outbox: Object.fromEntries(
            outbox.map((row) => [row.status, row._count._all]),
          ),
        }
      : null,
    consents: consents.map((c) => ({
      id: c.id,
      planId: c.planId,
      amountCents: c.amountCents,
      locale: c.locale,
      version: c.version,
      text: c.text,
      checkoutSessionId: c.checkoutSessionId,
      acceptedAt: c.acceptedAt.toISOString(),
    })),
  };
}
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = Number(req.query.userId);
  if (!Number.isSafeInteger(userId) || userId < 1)
    return res.status(400).json({ error: 'Invalid user' });
  if (
    !(await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    }))
  )
    return res.status(404).json({ error: 'User not found' });
  if (req.method === 'GET') return res.json(await result(userId));
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid action' });
  const action = parsed.data;
  try {
    const audit = {
      userId: Number(req.session?.user?.id),
      action: 'ADMIN_SUPPORTER_UPDATE',
      ip: getRequestIp(req),
      targetUserId: userId,
      details: action,
    };
    if (action.action === 'refund') {
      const payment = await prisma.payment.findUnique({
        where: { id: action.paymentId },
      });
      if (
        !payment ||
        payment.userId !== userId ||
        !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)
      )
        return res.status(400).json({ error: 'Invalid payment' });
      const amount =
        action.amountCents ?? payment.amountCents - payment.refundedCents;
      if (amount < 1 || amount > payment.amountCents - payment.refundedCents)
        return res.status(400).json({ error: 'Invalid refund amount' });
      await logActionStrict(audit);
      await getPaymentProviderFor(payment.provider).refund(
        payment.providerPaymentId,
        amount,
        {
          reason: action.reason,
          createdById: audit.userId,
        },
      );
      // Refunding never cancels by itself; the admin chooses it explicitly.
      if (action.cancelSubscription && payment.kind === 'SUBSCRIPTION') {
        const membership = await prisma.supporterMembership.findUnique({
          where: { userId },
        });
        if (membership?.providerSubscriptionId) {
          await getPaymentProviderFor(membership.provider).cancelSubscription(
            membership.providerSubscriptionId,
            'now',
          );
          await applySubscriptionDeleted(userId);
        }
      }
    } else {
      await prisma.$transaction(async (tx) => {
        if (action.action === 'comp')
          await grantDays(userId, action.days, 'COMP', tx);
        if (action.action === 'revoke') await revoke(userId, tx);
        if (action.action === 'setBadgeVisible')
          await setBadgeVisible(userId, action.badgeVisible, tx);
        if (action.action === 'unlinkDiscord') {
          await tx.discordOutbox.deleteMany({
            where: { userId, status: { in: ['PENDING', 'SENDING'] } },
          });
          await tx.discordLink.deleteMany({ where: { userId } });
        }
        await logActionStrict(audit, tx);
      });
    }
    return res.json(await result(userId));
  } catch {
    return res.status(400).json({ error: 'Supporter action failed' });
  }
}
export default supporterGuard(['GET', 'POST'])(handler);
