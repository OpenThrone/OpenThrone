import prisma from '@/lib/prisma';
import type { AccountInactivityNotice, Prisma } from '@/lib/prisma-exports';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import {
  createDraftCampaign,
  createQueuedCampaign,
  enqueueCampaignBatch,
} from '@/services/AdminEmail.service';
import { AllianceService } from '@/services/Alliance.service';
import { resolveEligibleRecipients } from '@/services/Email.service';
import { deleteUserAvatarFiles } from '@/services/PrivacyRetention.service';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logActionStrict } from '@/utils/auditLogger';
import { createInactivityErasureToken } from '@/utils/inactivityErasureToken';
import { logError } from '@/utils/logger';

export const DAY_MS = 86_400_000;
export type NoticeStatus = 'none' | 'warned' | 'cancelled' | 'completed';
export type InactivityNoticeTemplateValue = 'STANDARD' | 'ERA_RELAUNCH';

export interface InactiveUsersOptions {
  /**
   * Fixed cutoff (for example the era relaunch date): a user is eligible when
   * the latest of last_gameplay_at / last_active / created_at is before it.
   * Undefined keeps the legacy 365-day rule on last_active.
   */
  inactiveSince?: Date;
}
export function inactiveUsersWhere(
  now = new Date(),
  status?: NoticeStatus,
  opts?: InactiveUsersOptions,
): Prisma.usersWhereInput {
  const cutoff = new Date(now.getTime() - 365 * DAY_MS);
  return {
    AND: [
      opts?.inactiveSince
        ? {
            OR: [
              { last_gameplay_at: { lt: opts.inactiveSince } },
              {
                last_gameplay_at: null,
                last_active: { lt: opts.inactiveSince },
              },
              {
                last_gameplay_at: null,
                last_active: null,
                created_at: { lt: opts.inactiveSince },
              },
            ],
          }
        : {
            OR: [
              { last_active: { lt: cutoff } },
              { last_active: null, created_at: { lt: cutoff } },
            ],
          },
      // Bot accounts never leave on their own; a relaunch wave is for people.
      ...(opts?.inactiveSince ? [{ isBot: false }] : []),
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
  // The relaunch email promises to be the last one, so it never gets a
  // reminder: the account is erased on its stated purge date.
  const relaunch = notice.template === 'ERA_RELAUNCH';
  const reminders = remindersEnabled && !relaunch;
  if (notice.scheduledDeletionAt <= now) {
    if (reminders && !notice.reminderSentAt) return 'remind';
    if (
      reminders &&
      notice.reminderSentAt &&
      now.getTime() - notice.reminderSentAt.getTime() < 7 * DAY_MS
    )
      return 'skip';
    return 'anonymize';
  }
  // Remind once the remaining time halves the notice period, capped at 30
  // days, so a short notice period still gets a fair final warning.
  const remaining = notice.scheduledDeletionAt.getTime() - now.getTime();
  const noticeSpan =
    notice.scheduledDeletionAt.getTime() - notice.warnedAt.getTime();
  const reminderWindow = Math.min(30 * DAY_MS, noticeSpan / 2);
  if (!relaunch && !notice.reminderSentAt && remaining <= reminderWindow)
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
export const MIN_NOTICE_DAYS = 14;
export const MAX_NOTICE_DAYS = 365;
export const DEFAULT_NOTICE_DAYS = 180;

const noticeDaysInRange = (days: number | undefined) =>
  Math.min(
    MAX_NOTICE_DAYS,
    Math.max(MIN_NOTICE_DAYS, days ?? DEFAULT_NOTICE_DAYS),
  );

/**
 * Parses an admin-chosen purge date (YYYY-MM-DD, midnight UTC, the day the
 * emails print). Returns null unless it is a real date 14–365 days ahead.
 */
export function parsePurgeDate(value: string, now = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return null;
  const days = (date.getTime() - now.getTime()) / DAY_MS;
  return days >= MIN_NOTICE_DAYS && days <= MAX_NOTICE_DAYS ? date : null;
}

export async function sendInactivityNotices(input: {
  userIds?: number[];
  actorId: number;
  ip: string;
  /** Fixed eligibility cutoff (relaunch); undefined = legacy 365-day rule. */
  inactiveSince?: Date;
  /** Grace period before scheduled deletion; clamped to 14–365 days. */
  noticeDays?: number;
  /** Explicit purge date (see parsePurgeDate); overrides noticeDays. */
  deletionDate?: Date;
  /** Copy variant stored on the notice and rendered in the emails. */
  template?: InactivityNoticeTemplateValue;
  /** News post the ERA_RELAUNCH template links to. */
  newsPostId?: number | null;
}) {
  const now = new Date();
  const scheduledDeletionAt =
    input.deletionDate ??
    new Date(now.getTime() + noticeDaysInRange(input.noticeDays) * DAY_MS);
  const noticeDays = Math.round(
    (scheduledDeletionAt.getTime() - now.getTime()) / DAY_MS,
  );
  const template = input.template ?? 'STANDARD';
  const relaunch = template === 'ERA_RELAUNCH';
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
        ...inactiveUsersWhere(now, input.userIds ? undefined : 'none', {
          inactiveSince: input.inactiveSince,
        }),
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
            where: {
              ...inactiveUsersWhere(now, undefined, {
                inactiveSince: input.inactiveSince,
              }),
              id: candidate.id,
            },
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
            inactiveSince: input.inactiveSince ?? null,
            template,
            newsPostId: input.newsPostId ?? null,
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
          vars: {
            deletionDate: scheduledDeletionAt,
            ...(relaunch
              ? { relaunch: true, newsId: input.newsPostId ?? undefined }
              : {}),
          },
          recipientVars: (recipient: { userId: number }) => ({
            lastActiveDate: lastActiveDates.get(recipient.userId) ?? undefined,
            // Bound to this notice (warnedAt = now): logging in retires it.
            erasureToken: createInactivityErasureToken(recipient.userId, now),
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
            details: {
              ...result,
              inactiveSince: input.inactiveSince?.toISOString() ?? null,
              noticeDays,
              deletionDate: scheduledDeletionAt.toISOString(),
              template,
              newsPostId: input.newsPostId ?? null,
            },
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
        // #318: an inactivity erasure also leaves every alliance. The exit
        // must run before the user-row lock below so the transaction keeps
        // the canonical alliance→user lock order; the decision is rechecked
        // under the lock, and with the same `now` it can only flip away
        // from anonymize, in which case the exit rolls back with the branch.
        const willAnonymize =
          !dryRun &&
          !!config.inactivityAutoAnonymizeEnabled &&
          inactivityDecision(
            notice,
            notice.user.last_active,
            now,
            !!config.inactivityRemindersEnabled,
          ) === 'anonymize';
        const apply = async (tx: Prisma.TransactionClient) => {
          if (willAnonymize)
            await AllianceService.leaveAllAlliancesOnErasure(tx, notice.userId);
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
          // Re-check eligibility with this notice's own cutoff: a relaunch
          // notice (inactiveSince set) must never fall back to the 365-day
          // rule, or its deadline would never be enforced.
          const eligible = await tx.users.findFirst({
            where: {
              ...inactiveUsersWhere(now, undefined, {
                inactiveSince: current.inactiveSince ?? undefined,
              }),
              id: current.userId,
            },
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
            const relaunch = current.template === 'ERA_RELAUNCH';
            const campaign = await createQueuedCampaign(tx, {
              kind: 'INACTIVITY_REMINDER',
              subject: 'Account inactivity reminder',
              body: '',
              audience: { userIds: [current.userId] },
              createdByUserId: actorId,
              recipients,
              vars: {
                deletionDate: current.scheduledDeletionAt,
                erasureToken: createInactivityErasureToken(
                  current.userId,
                  current.warnedAt,
                ),
                ...(relaunch
                  ? { relaunch: true, newsId: current.newsPostId ?? undefined }
                  : {}),
              },
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
                reason: current.inactiveSince
                  ? 'Inactive past the relaunch notice deadline'
                  : 'Inactive for over 18 months',
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
        if (outcome === 'anonymized' && !dryRun)
          await deleteUserAvatarFiles(notice.userId);
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
