import prisma from '@/lib/prisma';
import type { AccountInactivityNotice, Prisma } from '@/lib/prisma-exports';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import {
  createDraftCampaign,
  createQueuedCampaign,
  enqueueCampaignBatch,
} from '@/services/AdminEmail.service';
import { resolveEligibleRecipients } from '@/services/Email.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

export const DAY_MS = 86_400_000;
export type NoticeStatus = 'none' | 'warned' | 'cancelled' | 'completed';
export function inactiveUsersWhere(
  now = new Date(),
  status?: NoticeStatus,
): Prisma.usersWhereInput {
  const cutoff = new Date(now.getTime() - 365 * DAY_MS);
  return {
    AND: [
      {
        OR: [
          { last_active: { lt: cutoff } },
          { last_active: null, created_at: { lt: cutoff } },
        ],
      },
      { NOT: { email: { endsWith: '@deleted.local', mode: 'insensitive' } } },
      { staffRoleAssignments: { none: { revokedAt: null } } },
      { permissions: { none: { revokedAt: null } } },
      {
        statusHistories: {
          none: {
            status: { in: ['CLOSED', 'BANNED', 'SUSPENDED'] },
            start_date: { lte: now },
            OR: [{ end_date: null }, { end_date: { gt: now } }],
          },
        },
      },
      ...(status === 'none'
        ? [{ accountInactivityNotice: { is: null } }]
        : status === 'warned'
          ? [
              {
                accountInactivityNotice: {
                  is: { cancelledAt: null, completedAt: null },
                },
              },
            ]
          : status
            ? [
                {
                  accountInactivityNotice: {
                    is: {
                      [status === 'cancelled' ? 'cancelledAt' : 'completedAt']:
                        { not: null },
                    },
                  },
                },
              ]
            : []),
    ],
  };
}
export function inactivityDecision(
  notice: AccountInactivityNotice,
  lastActive: Date | null,
  now: Date,
  remindersEnabled = true,
) {
  if (notice.cancelledAt || notice.completedAt) return 'skip';
  if (lastActive && lastActive > notice.warnedAt) return 'cancel';
  if (notice.scheduledDeletionAt <= now) {
    if (remindersEnabled && !notice.reminderSentAt) return 'remind';
    if (
      remindersEnabled &&
      notice.reminderSentAt &&
      now.getTime() - notice.reminderSentAt.getTime() < 7 * DAY_MS
    )
      return 'skip';
    return 'anonymize';
  }
  if (
    !notice.reminderSentAt &&
    notice.scheduledDeletionAt.getTime() - now.getTime() <= 30 * DAY_MS
  )
    return 'remind';
  return 'skip';
}
export async function cancelInactivityOnLogin(userId: number) {
  try {
    await prisma.accountInactivityNotice.updateMany({
      where: { userId, cancelledAt: null, completedAt: null },
      data: { cancelledAt: new Date() },
    });
  } catch {
    logError('Failed to cancel inactivity notice on login', { userId });
  }
}
export async function sendInactivityNotices(input: {
  userIds?: number[];
  actorId: number;
  ip: string;
}) {
  const now = new Date();
  const scheduledDeletionAt = new Date(now.getTime() + 180 * DAY_MS);
  let afterId = 0;
  const totals = {
    noticed: 0,
    queued: 0,
    undeliverable: 0,
    undeliverableUserIds: [] as number[],
    campaignId: null as number | null,
  };
  let hasMore = true;
  while (hasMore) {
    const candidates = await prisma.users.findMany({
      where: {
        ...inactiveUsersWhere(now, input.userIds ? undefined : 'none'),
        id: { gt: afterId, ...(input.userIds ? { in: input.userIds } : {}) },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 250,
    });
    if (!candidates.length) break;
    const recipients = await resolveEligibleRecipients({
      category: 'ACCOUNT_LIFECYCLE',
      userIds: candidates.map((u) => u.id),
    });
    const deliverableIds = new Set(
      recipients
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
        .map((r) => r.userId),
    );
    const page = await prisma.$transaction(
      async (tx) => {
        const users: { id: number; last_active: Date | null }[] = [];
        const undeliverableUserIds: number[] = [];
        for (const candidate of candidates) {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.id} FOR UPDATE`;
          const user = await tx.users.findFirst({
            where: { ...inactiveUsersWhere(now), id: candidate.id },
            select: {
              id: true,
              last_active: true,
              accountInactivityNotice: true,
            },
          });
          if (
            !user ||
            (user.accountInactivityNotice &&
              !user.accountInactivityNotice.cancelledAt)
          )
            continue;
          if (!deliverableIds.has(user.id)) {
            undeliverableUserIds.push(user.id);
            continue;
          }
          const data = {
            warnedAt: now,
            scheduledDeletionAt,
            lastActiveAtWarning: user.last_active,
            cancelledAt: null,
            completedAt: null,
            reminderSentAt: null,
            createdByUserId: input.actorId,
          };
          await tx.accountInactivityNotice.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data,
          });
          users.push(user);
        }
        const accepted = new Set(users.map((u) => u.id));
        const deliverable = recipients.filter(
          (r) =>
            accepted.has(r.userId) &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email),
        );
        const lastActiveDates = new Map(
          users.map((user) => [user.id, user.last_active]),
        );
        const campaignInput = {
          kind: 'INACTIVITY_NOTICE' as const,
          subject: 'Account inactivity notice',
          body: '',
          audience: { all: !input.userIds, userIds: input.userIds ?? [] },
          createdByUserId: input.actorId,
          recipients: deliverable,
          vars: { deletionDate: scheduledDeletionAt },
          recipientVars: (recipient: { userId: number }) => ({
            lastActiveDate: lastActiveDates.get(recipient.userId) ?? undefined,
          }),
        };
        const campaignId =
          totals.campaignId ??
          (await createDraftCampaign(tx, campaignInput)).id;
        const inserted = await enqueueCampaignBatch(
          tx,
          campaignId,
          campaignInput,
        );
        const result = {
          noticed: inserted.count,
          queued: inserted.count,
          undeliverable: undeliverableUserIds.length,
          undeliverableUserIds,
          campaignId,
        };
        await logActionStrict(
          {
            userId: input.actorId,
            action: 'ADMIN_INACTIVITY_NOTICE',
            ip: input.ip,
            details: result,
          },
          tx,
        );
        return result;
      },
      { timeout: 30_000 },
    );
    totals.noticed += page.noticed;
    totals.queued += page.queued;
    totals.undeliverable += page.undeliverable;
    totals.undeliverableUserIds.push(...page.undeliverableUserIds);
    totals.campaignId = page.campaignId;
    afterId = candidates[candidates.length - 1].id;
    hasMore = candidates.length === 250;
  }
  if (totals.campaignId)
    await prisma.emailCampaign.update({
      where: { id: totals.campaignId },
      data: { status: 'QUEUED', recipientCount: totals.queued },
    });
  return totals;
}

export async function runInactivitySweep({
  dryRun,
  actorId,
  ip = 'system',
}: {
  dryRun: boolean;
  actorId?: number;
  ip?: string;
}) {
  const now = new Date();
  const config = await getRuntimeConfig();
  const result = {
    cancelled: 0,
    reminders: 0,
    anonymized: 0,
    failed: 0,
    remindersEnabled: !!config.inactivityRemindersEnabled,
    autoAnonymizeEnabled: !!config.inactivityAutoAnonymizeEnabled,
  };
  let afterId = 0;
  let hasMore = true;
  while (hasMore) {
    const notices = await prisma.accountInactivityNotice.findMany({
      where: { id: { gt: afterId }, cancelledAt: null, completedAt: null },
      include: { user: { select: { last_active: true } } },
      orderBy: { id: 'asc' },
      take: 250,
    });
    if (!notices.length) break;
    for (const notice of notices) {
      try {
        let outcome: 'cancelled' | 'reminders' | 'anonymized' | undefined;
        const apply = async (tx: Prisma.TransactionClient) => {
          if (!dryRun)
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${notice.userId} FOR UPDATE`;
          const current = dryRun
            ? notice
            : await tx.accountInactivityNotice.findUnique({
                where: { userId: notice.userId },
                include: { user: { select: { last_active: true } } },
              });
          if (!current) return;
          const action = inactivityDecision(
            current,
            current.user.last_active,
            now,
            !!config.inactivityRemindersEnabled,
          );
          if (action === 'skip') return;
          if (action === 'cancel') {
            if (!dryRun)
              await tx.accountInactivityNotice.update({
                where: { id: current.id },
                data: { cancelledAt: now },
              });
            outcome = 'cancelled';
            return;
          }
          const eligible = await tx.users.findFirst({
            where: { ...inactiveUsersWhere(now), id: current.userId },
            select: { id: true },
          });
          if (!eligible) return;
          if (action === 'remind') {
            if (dryRun) {
              outcome = 'reminders';
              return;
            }
            if (!config.inactivityRemindersEnabled) return;
            const recipients = await resolveEligibleRecipients({
              category: 'ACCOUNT_LIFECYCLE',
              userIds: [current.userId],
            });
            if (!recipients.length) return;
            const campaign = await createQueuedCampaign(tx, {
              kind: 'INACTIVITY_REMINDER',
              subject: 'Account inactivity reminder',
              body: '',
              audience: { userIds: [current.userId] },
              createdByUserId: actorId,
              recipients,
              vars: { deletionDate: current.scheduledDeletionAt },
            });
            if (!campaign.recipientCount) return;
            await tx.accountInactivityNotice.update({
              where: { id: current.id },
              data: { reminderSentAt: now },
            });
            outcome = 'reminders';
          } else if (action === 'anonymize') {
            if (dryRun) {
              outcome = 'anonymized';
              return;
            }
            if (!config.inactivityAutoAnonymizeEnabled) return;
            await AccountAnonymizationService.anonymizeAccount(
              tx,
              current.userId,
              {
                reason: 'Inactive for over 18 months',
                initiatedBy: 'INACTIVITY',
              },
            );
            await tx.accountInactivityNotice.update({
              where: { id: current.id },
              data: { completedAt: now },
            });
            outcome = 'anonymized';
          }
        };
        if (dryRun) await apply(prisma);
        else
          await prisma.$transaction(
            async (tx) => {
              await apply(tx);
              if (actorId)
                await logActionStrict(
                  {
                    userId: actorId,
                    action: 'ADMIN_INACTIVITY_SWEEP_ACCOUNT',
                    ip,
                    targetUserId: notice.userId,
                  },
                  tx,
                );
            },
            { timeout: 30_000 },
          );
        if (outcome) result[outcome]++;
      } catch {
        result.failed++;
        logError('Inactivity sweep account failed', { userId: notice.userId });
      }
    }
    afterId = notices[notices.length - 1].id;
    hasMore = notices.length === 250;
  }
  return result;
}
