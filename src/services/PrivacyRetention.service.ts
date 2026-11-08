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
