import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { GeneralService } from '@/services/General.service';
import { logError } from '@/utils/logger';

import { getIpAddress } from './ipUtils';

/**
 * Best-effort audit write: failures are logged and swallowed, so the caller's
 * action proceeds. Use for denials, reads and actions already committed.
 */
export async function logAction(
  userId: number,
  action: string,
  ip: string,
  details: any = {},
) {
  await GeneralService.logAuditAction(userId, action, ip, details);
}

/** Thrown by `logActionStrict` when the audit row could not be written. */
export class AuditWriteError extends Error {
  constructor(action: string) {
    super(`Audit write failed for ${action}`);
    this.name = 'AuditWriteError';
  }
}

/** Client able to write audit rows: the prisma client or a transaction. */
export type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

/** Structured audit row for `logActionStrict`. */
export interface AuditEntry {
  userId: number;
  action: string;
  ip: string;
  targetUserId?: number | null;
  entityType?: string;
  entityId?: number;
  details?: Record<string, unknown>;
}

/**
 * Required audit write. Throws `AuditWriteError` on failure so the caller can
 * fail closed. Pass the transaction client to commit the row atomically with
 * the mutation it records (a failed write then rolls the mutation back);
 * otherwise call it before performing a sensitive read or irreversible action.
 */
export async function logActionStrict(
  entry: AuditEntry,
  client: AuditClient = prisma,
): Promise<void> {
  const targetUserId =
    entry.targetUserId ?? toAuditTargetUserId(entry.details?.targetUserId);
  try {
    await client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        ip: entry.ip ?? 'unknown',
        targetUserId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: {
          ...(targetUserId != null ? { targetUserId } : {}),
          ...(entry.details ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logError('Required audit write failed', {
      userId: entry.userId,
      action: entry.action,
      error,
    });
    throw new AuditWriteError(entry.action);
  }
}

/** Normalizes a details.targetUserId value for the indexed targetUserId column. */
export function toAuditTargetUserId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Returns request ip for callers that need normalized game data. */
export function getRequestIp(req: any) {
  return getIpAddress(req);
}
