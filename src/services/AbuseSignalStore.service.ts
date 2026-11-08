import {
  ABUSE_LOCK_MS,
  ABUSE_WRITE_STATEMENT_MS,
  abuseSeverity,
  isSuppressedByClosedSignal,
} from '@/constants/abuseSignals';
import type { CheatSignalType, Prisma } from '@/lib/prisma-exports';
import { withDbDeadline } from '@/utils/boundedWork';
import { cheatSignalIdentityLockKey } from '@/utils/cheatSignalLock';

export interface RaiseAbuseSignalInput {
  type: CheatSignalType;
  /** The account the signal is filed on (the sink, attacker or anchor). */
  userId: number;
  relatedUserId?: number | null;
  /** Every other account the pattern links to `userId` (staff only). */
  linkedUserIds: number[];
  /** Stable key of the pattern; one open signal exists per (type, key). */
  dedupeKey: string;
  score: number;
  summary: string;
  evidence: Prisma.InputJsonObject;
  now?: Date;
}

export type RaiseAbuseSignalResult = 'created' | 'updated' | 'suppressed';

/**
 * Raises or refreshes one admin-only signal. Deduplicated per (type,
 * dedupeKey) under an advisory lock, so a daily run overlapping a write-time
 * evaluation cannot create twins. An open or reviewed signal is bumped in
 * place and never weakens; a dismissed or actioned one is not re-raised for
 * 30 days unless the pattern escalates well past what staff dismissed. This
 * only files a signal for staff: it never touches the player or gameplay.
 */
export async function raiseAbuseSignal(
  input: RaiseAbuseSignalInput,
): Promise<RaiseAbuseSignalResult> {
  const now = input.now ?? new Date();
  const lockKey = cheatSignalIdentityLockKey(
    `abuse:${input.type}:${input.dedupeKey}`,
  );
  // Statement and lock deadlines come first so a contended advisory lock or a
  // stalled statement fails this write instead of holding a connection.
  return withDbDeadline(
    async (tx) => {
      // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw
      // cannot deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
      const open = await tx.cheatSignal.findFirst({
        where: {
          type: input.type,
          dedupeKey: input.dedupeKey,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        select: { id: true, userId: true, score: true },
      });
      if (open) {
        const score = Math.max(open.score, input.score);
        const members = new Set([input.userId, ...input.linkedUserIds]);
        members.delete(open.userId);
        await tx.cheatSignal.update({
          where: { id: open.id },
          data: {
            score,
            severity: abuseSeverity(score),
            lastSeenAt: now,
            summary: input.summary,
            evidence: input.evidence,
            linkedUserIds: [...members].sort((a, b) => a - b),
          },
        });
        return 'updated';
      }
      const closed = await tx.cheatSignal.findFirst({
        where: {
          type: input.type,
          dedupeKey: input.dedupeKey,
          status: { in: ['DISMISSED', 'ACTION_TAKEN'] },
        },
        orderBy: { resolvedAt: 'desc' },
        select: { score: true, resolvedAt: true },
      });
      if (isSuppressedByClosedSignal(closed, input.score, now))
        return 'suppressed';
      const members = new Set(input.linkedUserIds);
      members.delete(input.userId);
      await tx.cheatSignal.create({
        data: {
          userId: input.userId,
          relatedUserId: input.relatedUserId ?? null,
          type: input.type,
          severity: abuseSeverity(input.score),
          score: input.score,
          status: 'OPEN',
          summary: input.summary,
          evidence: input.evidence,
          linkedUserIds: [...members].sort((a, b) => a - b),
          dedupeKey: input.dedupeKey,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      return 'created';
    },
    { statementMs: ABUSE_WRITE_STATEMENT_MS, lockMs: ABUSE_LOCK_MS },
  );
}
