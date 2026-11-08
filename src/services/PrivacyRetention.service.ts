import fs from 'node:fs';
import path from 'node:path';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';

/** Raw IP addresses in the admin audit log are blanked after this many days. */
export const AUDIT_IP_RETENTION_DAYS = 90;

/** Blanks old audit-log IPs; the recorded actions stay. Run daily. */
export async function pruneAuditLogIps(now = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - AUDIT_IP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  try {
    const result = await prisma.auditLog.updateMany({
      where: { timestamp: { lt: cutoff }, NOT: { ip: '' } },
      data: { ip: '' },
    });
    return result.count;
  } catch {
    logError('Unable to prune audit log IP addresses');
    return 0;
  }
}

/**
 * Erases the text of private messages and chat messages the player wrote.
 * Runs inside the anonymization transaction; the rows stay so conversations
 * keep their shape, shown as deleted.
 */
export async function eraseAuthoredMessages(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  await tx.messages.updateMany({
    where: { from_user_id: userId },
    data: { subject: '', body: '' },
  });
  await tx.chatMessage.updateMany({
    where: { senderId: userId },
    data: {
      content: '',
      richContent: Prisma.DbNull,
      originalContent: null,
      editReason: null,
      deletedAt: new Date(),
    },
  });
}

/** Completed, cancelled and expired erasure requests are pruned after this. */
export const ERASURE_RECORD_RETENTION_DAYS = 365;
/** Export-log rows (no content) are pruned after this many days. */
export const EXPORT_LOG_RETENTION_DAYS = 90;

/**
 * Removes the moderation and abuse records held about an erased account:
 * fair-play signals, staff notes, the text of ban appeals, and the free text of
 * reports the player filed once those are closed. Reports against the player
 * stay: they are the reporter's own filing and the accused is pseudonymized.
 * Skipped while a sanction still runs (see eraseRemainingPersonalData).
 */
export async function purgeModerationRecords(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  await tx.cheatSignal.deleteMany({ where: { userId } });
  await tx.cheatSignal.updateMany({
    where: { relatedUserId: userId },
    data: { relatedUserId: null },
  });
  // Staff-only links from other accounts' signals to this one.
  await tx.$executeRaw`UPDATE "CheatSignal" SET "linkedUserIds" = array_remove("linkedUserIds", ${userId}) WHERE ${userId} = ANY("linkedUserIds")`;
  await tx.moderatorNote.deleteMany({ where: { userId } });
  await tx.banAppeal.updateMany({
    where: { userId },
    data: { subject: null, body: '' },
  });
  await tx.report.updateMany({
    where: {
      reporterUserId: userId,
      status: { in: ['RESOLVED', 'DISMISSED'] },
    },
    data: { subject: null, description: '' },
  });
}

/**
 * Personal data that the core anonymization leaves behind: sign-in history,
 * raw addresses, social links, chat participation, API usage records and the
 * moderation file. Runs inside the anonymization transaction and is safe to
 * repeat. `sanctionInEffect` keeps the moderation file until the sanction (and
 * its email-hash block) ends; the daily purge removes it afterwards.
 */
export async function eraseRemainingPersonalData(
  tx: Prisma.TransactionClient,
  userId: number,
  { sanctionInEffect }: { sanctionInEffect: boolean },
) {
  await tx.loginEvent.deleteMany({ where: { userId } });
  // The audit rows stay as the action record; the network identifiers go.
  await tx.auditLog.updateMany({
    where: { userId },
    data: { ip: '', ipHash: null, requestId: null },
  });
  // The recruited player's own address; the recruiter's rows hold someone else's.
  await tx.recruit_history.updateMany({
    where: { to_user: userId },
    data: { ip_addr: '' },
  });
  await tx.social.deleteMany({
    where: { OR: [{ playerId: userId }, { friendId: userId }] },
  });
  await tx.post_read_status.deleteMany({ where: { user_id: userId } });
  await tx.autoRecruitSession.deleteMany({ where: { userId } });
  await tx.chatRoomParticipant.deleteMany({ where: { userId } });
  await tx.chatMessageReaction.deleteMany({ where: { userId } });
  await tx.chatMessageReadStatus.deleteMany({ where: { userId } });
  await tx.chatMute.deleteMany({ where: { userId } });
  await tx.emailOutbox.updateMany({
    where: { userId },
    data: { subject: '' },
  });
  await tx.apiTokenAudit.deleteMany({
    where: { token: { client: { ownerUserId: userId } } },
  });
  await tx.apiToken.updateMany({
    where: { client: { ownerUserId: userId } },
    data: { lastIpHash: null },
  });
  await tx.apiClient.updateMany({
    where: { ownerUserId: userId },
    data: { name: 'deleted' },
  });
  await tx.accountDataExport.deleteMany({ where: { userId } });
  // Free text the player wrote in alliance records. The records stay (ledger
  // and roster integrity, under the pseudonym); notes other members wrote about
  // the player are theirs and stay too. Announcements stay (owner decision).
  await tx.alliance_bank_history.updateMany({
    where: { performed_by_user_id: userId, NOT: { notes: null } },
    data: { notes: null },
  });
  await tx.alliance_gold_requests.updateMany({
    where: { requester_id: userId, NOT: { reason: null } },
    data: { reason: null },
  });
  await tx.alliance_loans.updateMany({
    where: { borrower_id: userId, NOT: { reason: null } },
    data: { reason: null },
  });
  await tx.alliance_list_entries.updateMany({
    where: { added_by: userId, NOT: { note: null } },
    data: { note: null },
  });
  await tx.alliance_target_calls.updateMany({
    where: { created_by: userId, NOT: { note: null } },
    data: { note: null },
  });
  await tx.alliance_intel_shares.updateMany({
    where: { shared_by: userId, NOT: { note: null } },
    data: { note: null },
  });
  // Bot-timing counters used only by the admin abuse signal.
  await tx.activityDay.deleteMany({ where: { userId } });
  if (!sanctionInEffect) await purgeModerationRecords(tx, userId);
}

/**
 * Daily: removes the moderation file of erased accounts whose sanction has
 * ended, and of any whose records were kept only because a sanction ran. That
 * includes accounts whose only remaining trace is a reference in another
 * account's signal (`relatedUserId`, `linkedUserIds`). An erased account is
 * held back while a live SANCTION email block names it.
 */
export async function purgeErasedModerationRecords(
  now = new Date(),
  limit = 200,
): Promise<number> {
  try {
    // Erased accounts that other accounts' signals still link to by id list.
    const linked = await prisma.$queryRaw<{ id: number }[]>`
      SELECT DISTINCT u.id FROM users u
      JOIN "CheatSignal" s ON u.id = ANY(s."linkedUserIds")
      WHERE u."anonymizedAt" IS NOT NULL
      LIMIT ${limit}`;
    const users = await prisma.users.findMany({
      where: {
        anonymizedAt: { not: null },
        identityBlocks: {
          none: {
            reason: 'SANCTION',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        OR: [
          { id: { in: linked.map((row) => row.id) } },
          { cheatSignalsRelatedUser: { some: {} } },
          { cheatSignalsOnUser: { some: {} } },
          { moderatorNotesOnUser: { some: {} } },
          { banAppealsFiled: { some: { NOT: { body: '' } } } },
          {
            reportsFiled: {
              some: {
                status: { in: ['RESOLVED', 'DISMISSED'] },
                NOT: { description: '' },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
    for (const user of users) {
      await prisma.$transaction((tx) => purgeModerationRecords(tx, user.id));
    }
    return users.length;
  } catch {
    logError('Unable to purge moderation records of erased accounts');
    return 0;
  }
}

/**
 * Deletes every avatar file the player uploaded (current and replaced ones),
 * from the bucket or the local public folder. Call after the account change
 * commits; failures are logged and do not undo the deletion.
 */
export async function deleteUserAvatarFiles(userId: number) {
  // Callers pass a user id; anything else must never become a path.
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  const prefix = `users/${userId}/avatar/`;
  let ok = true;
  if (process.env.NEXT_PUBLIC_USE_AWS === 'true')
    try {
      const s3 = new S3Client({
        endpoint: process.env.AWS_S3_ENDPOINT,
        region: process.env.AWS_REGION ?? 'auto',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        },
        forcePathStyle: true,
      });
      const Bucket = process.env.AWS_BUCKET_NAME ?? '';
      let ContinuationToken: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken,
          }),
        );
        const Objects = (page.Contents ?? [])
          .filter((object) => object.Key?.startsWith(prefix))
          .map((object) => ({ Key: object.Key as string }));
        if (Objects.length)
          await s3.send(
            new DeleteObjectsCommand({
              Bucket,
              Delete: { Objects, Quiet: true },
            }),
          );
        ContinuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (ContinuationToken);
    } catch {
      ok = false;
      logError('Unable to delete avatar files from storage', { userId });
    }
  // Local uploads (and any left from before the bucket was used), even if
  // the bucket call failed.
  try {
    await fs.promises.rm(path.join(process.cwd(), 'public', prefix), {
      recursive: true,
      force: true,
    });
  } catch {
    ok = false;
    logError('Unable to delete local avatar files', { userId });
  }
  return ok;
}
