import type { SendMailOptions } from 'nodemailer';
import nodemailer from 'nodemailer';

import prisma from '@/lib/prisma';
import type { EmailCategory, EmailOutbox, Prisma } from '@/lib/prisma-exports';
import { getLoginBlockingStatuses } from '@/services/User.service';
import { hashIdentity } from '@/utils/identityHash';
import { createUnsubscribeToken } from '@/utils/unsubscribeToken';

export function smtpTransportOptions() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE !== 'false',
    tls: { rejectUnauthorized: true },
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
  };
}
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
function getTransport() {
  return (transport ??= nodemailer.createTransport(smtpTransportOptions()));
}

export type ImmediateMessage = Pick<
  SendMailOptions,
  'to' | 'subject' | 'text' | 'html' | 'headers'
>;
export function sendImmediate(message: ImmediateMessage) {
  return getTransport().sendMail({
    ...message,
    from: `OpenThrone <${process.env.SMTP_FROM_EMAIL}>`,
  });
}

export type EmailQueueItem = Pick<
  Prisma.EmailOutboxCreateManyInput,
  | 'eventKey'
  | 'campaignId'
  | 'userId'
  | 'toAddress'
  | 'category'
  | 'locale'
  | 'subject'
  | 'textBody'
  | 'htmlBody'
  | 'headers'
>;
export async function enqueueEmails(
  db: Prisma.TransactionClient | typeof prisma,
  items: EmailQueueItem[],
) {
  // A campaign must be fully enqueued before its status changes to QUEUED.
  return db.emailOutbox.createMany({ data: items, skipDuplicates: true });
}

export interface RecipientFilter {
  category: EmailCategory;
  userIds?: number[];
  activeWithinDays?: number;
  includeAll?: boolean;
}
export interface EmailRecipient {
  userId: number;
  email: string;
  locale: string;
  display_name: string;
}
export async function forEachEligibleRecipientBatch(
  filter: RecipientFilter,
  batchSize: number,
  callback: (recipients: EmailRecipient[]) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 250)
    throw new Error('Invalid recipient batch size');
  if (
    !filter.includeAll &&
    !filter.userIds?.length &&
    filter.activeWithinDays === undefined
  )
    return;
  if (
    filter.activeWithinDays !== undefined &&
    (!Number.isFinite(filter.activeWithinDays) || filter.activeWithinDays < 0)
  )
    throw new Error('Invalid activity window');

  let afterId = 0;
  let hasMore = true;
  while (hasMore) {
    const users = await prisma.users.findMany({
      where: {
        id: { gt: afterId, ...(filter.userIds ? { in: filter.userIds } : {}) },
        ...(filter.activeWithinDays === undefined
          ? {}
          : {
              last_active: {
                gte: new Date(
                  Date.now() - filter.activeWithinDays * 86_400_000,
                ),
              },
            }),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        email: true,
        locale: true,
        display_name: true,
        emailPreference: true,
      },
    });
    if (!users.length) break;
    const hashes = users.map((user) => hashIdentity('EMAIL', user.email));
    const suppressed = new Set(
      (
        await prisma.emailSuppression.findMany({
          where: { hash: { in: hashes } },
          select: { hash: true },
        })
      ).map((row) => row.hash),
    );
    const statuses = await getLoginBlockingStatuses(
      users.map((user) => user.id),
    );
    const recipients: EmailRecipient[] = [];
    for (const user of users) {
      const preference = user.emailPreference;
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
        user.email.toLowerCase().endsWith('@deleted.local') ||
        suppressed.has(hashIdentity('EMAIL', user.email))
      )
        continue;
      if (
        filter.category === 'ATTACK_NOTIFICATION' &&
        (!preference?.attackNotificationEmails || preference.unsubscribedAllAt)
      )
        continue;
      const marketing =
        filter.category === 'NEWS' || filter.category === 'ANNOUNCEMENT';
      if (
        marketing &&
        (preference?.unsubscribedAllAt ||
          (filter.category === 'NEWS'
            ? preference?.newsEmails === false
            : preference?.announcementEmails === false))
      )
        continue;
      const status = statuses.get(user.id);
      if (
        status === 'CLOSED' ||
        (marketing && (status === 'BANNED' || status === 'SUSPENDED'))
      )
        continue;
      recipients.push({
        userId: user.id,
        email: user.email,
        locale: user.locale,
        display_name: user.display_name,
      });
    }
    await callback(recipients);
    afterId = users[users.length - 1].id;
    hasMore = users.length === batchSize;
  }
}

/** Convenience collector for small, explicit audiences. Campaigns use the batch callback. */
export async function resolveEligibleRecipients(
  filter: RecipientFilter,
): Promise<EmailRecipient[]> {
  const recipients: EmailRecipient[] = [];
  await forEachEligibleRecipientBatch(filter, 250, async (batch) => {
    recipients.push(...batch);
  });
  return recipients;
}

export function unsubscribeHeaders(
  userId: number,
  category: EmailCategory,
): Record<string, string> {
  if (category === 'TRANSACTIONAL' || category === 'ACCOUNT_LIFECYCLE')
    return {};
  const root = process.env.NEXT_PUBLIC_URL_ROOT;
  if (!root) throw new Error('NEXT_PUBLIC_URL_ROOT is required for email');
  const url = new URL('/api/email/unsubscribe', root);
  if (url.protocol !== 'https:')
    throw new Error('Unsubscribe URL must use HTTPS');
  url.searchParams.set('token', createUnsubscribeToken(userId, category));
  return {
    'List-Unsubscribe': `<${url.href}>${process.env.SMTP_FROM_EMAIL ? `, <mailto:${process.env.SMTP_FROM_EMAIL}?subject=unsubscribe>` : ''}`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

async function finish(
  row: EmailOutbox,
  status: 'SENT' | 'SKIPPED' | 'FAILED' | 'PENDING',
) {
  await prisma.$transaction(async (tx) => {
    if (row.campaignId)
      await tx.$queryRaw`SELECT id FROM "EmailCampaign" WHERE id = ${row.campaignId} FOR UPDATE`;
    await tx.emailOutbox.update({
      where: { id: row.id },
      data: {
        status,
        ...(status === 'SENT' ? { sentAt: new Date(), lastError: null } : {}),
        ...(status === 'FAILED' || status === 'PENDING'
          ? {
              // SMTP exceptions may contain addresses or credentials; never persist them.
              lastError: 'Email delivery failed',
              nextAttemptAt: new Date(
                Date.now() + 60_000 * 2 ** (row.attempts - 1),
              ),
            }
          : {}),
      },
    });
    if (!row.campaignId) return;
    const counter = {
      SENT: 'sentCount',
      SKIPPED: 'skippedCount',
      FAILED: 'failedCount',
    } as const;
    if (status !== 'PENDING')
      await tx.emailCampaign.update({
        where: { id: row.campaignId },
        data: { [counter[status]]: { increment: 1 } },
      });
    const remaining = await tx.emailOutbox.count({
      where: {
        campaignId: row.campaignId,
        status: { in: ['PENDING', 'SENDING'] },
      },
    });
    if (!remaining)
      await tx.emailCampaign.updateMany({
        where: { id: row.campaignId, status: { in: ['QUEUED', 'SENDING'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
  });
}

/** Sequential sends; PostgreSQL claims prevent competing workers sending the same row. */
export async function processOutboxBatch(limit = 1): Promise<number> {
  const count = Math.max(0, Math.min(250, Math.floor(limit)));
  if (!count) return 0;
  let processed = 0;
  // Claim just before each send so queued batch members cannot outlive their lease.
  while (processed < count) {
    const rows = await prisma.$transaction(async (tx) => {
      return tx.$queryRaw<(EmailOutbox & { exhausted: boolean })[]>`
        WITH picked AS (
          SELECT o.id, o.attempts >= 5 AS exhausted FROM "EmailOutbox" o
          LEFT JOIN "EmailCampaign" c ON c.id = o."campaignId"
          WHERE ((o.status = 'PENDING' AND o."nextAttemptAt" <= NOW())
            OR (o.status = 'SENDING' AND o."lockedAt" < NOW() - INTERVAL '15 minutes'))
          AND (o."campaignId" IS NULL OR c.status IN ('QUEUED', 'SENDING'))
          ORDER BY CASE o.category WHEN 'ACCOUNT_LIFECYCLE' THEN 0 WHEN 'TRANSACTIONAL' THEN 0 ELSE 1 END, o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED
        )
        UPDATE "EmailOutbox" o SET status = 'SENDING', "lockedAt" = NOW(),
          attempts = LEAST(o.attempts + 1, 5)
        FROM picked WHERE o.id = picked.id RETURNING o.*, picked.exhausted`;
    });
    const row = rows[0];
    if (!row) break;
    processed += 1;
    if (row.exhausted) {
      await finish(row, 'FAILED');
      continue;
    }
    if (row.campaignId) {
      await prisma.emailCampaign.updateMany({
        where: { id: row.campaignId, status: 'QUEUED' },
        data: { status: 'SENDING' },
      });
    }
    let status: 'SENT' | 'SKIPPED' | 'FAILED' | 'PENDING';
    try {
      const recipients = row.userId
        ? await resolveEligibleRecipients({
            category: row.category,
            userIds: [row.userId],
          })
        : [];
      const recipient = recipients[0];
      if (
        !recipient ||
        recipient.email.trim().toLowerCase() !==
          row.toAddress.trim().toLowerCase()
      )
        status = 'SKIPPED';
      else {
        const storedHeaders =
          row.headers &&
          typeof row.headers === 'object' &&
          !Array.isArray(row.headers)
            ? Object.fromEntries(
                Object.entries(row.headers).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === 'string' &&
                    !['list-unsubscribe', 'list-unsubscribe-post'].includes(
                      entry[0].toLowerCase(),
                    ),
                ),
              )
            : {};
        const headers =
          row.category === 'TRANSACTIONAL' ||
          row.category === 'ACCOUNT_LIFECYCLE'
            ? storedHeaders
            : {
                ...storedHeaders,
                ...unsubscribeHeaders(recipient.userId, row.category),
              };
        await sendImmediate({
          to: row.toAddress,
          subject: row.subject,
          text: row.textBody,
          html: row.htmlBody ?? undefined,
          headers,
        });
        status = 'SENT';
      }
    } catch {
      status = row.attempts >= 5 ? 'FAILED' : 'PENDING';
    }
    // A persistence failure must propagate; do not turn a successful send into a retry here.
    await finish(row, status);
  }
  await completeFinishedCampaigns();
  return processed;
}

/** Completes empty/finished campaigns even when there is no delivery slot to reserve. */
export async function completeFinishedCampaigns() {
  // Also complete explicitly queued campaigns with an empty audience.
  await prisma.emailCampaign.updateMany({
    where: {
      status: { in: ['QUEUED', 'SENDING'] },
      outbox: { none: { status: { in: ['PENDING', 'SENDING'] } } },
    },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
}
