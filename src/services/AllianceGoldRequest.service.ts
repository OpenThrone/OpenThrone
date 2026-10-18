import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import {
  ALLIANCE_NOTE_MAX_LENGTH,
  MAX_PENDING_GOLD_REQUESTS,
} from '@/constants/allianceTreasury';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { AllianceGoldRequestStatus } from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
  transferInTx,
} from '@/services/AllianceBank.service';
import { logError } from '@/utils/logger';

const AllianceIdSchema = z.number().int().positive();
const RequestIdSchema = z.number().int().positive();

const CreateSchema = z.object({
  allianceId: AllianceIdSchema,
  userId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1)),
  reason: z.string().trim().max(ALLIANCE_NOTE_MAX_LENGTH).optional(),
});

const DecideSchema = z.object({
  allianceId: AllianceIdSchema,
  requestId: RequestIdSchema,
  actorId: z.number().int().positive(),
  decision: z.enum(['approve', 'decline']),
});

const CancelSchema = z.object({
  allianceId: AllianceIdSchema,
  requestId: RequestIdSchema,
  userId: z.number().int().positive(),
});

/**
 * Marks a departing member's PENDING requests CANCELLED. Call inside the
 * leave/kick transaction after removing the membership.
 */
export const cancelPendingGoldRequests = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  userId: number,
): Promise<void> => {
  await tx.alliance_gold_requests.updateMany({
    where: {
      alliance_id: allianceId,
      requester_id: userId,
      status: AllianceGoldRequestStatus.PENDING,
    },
    data: {
      status: AllianceGoldRequestStatus.CANCELLED,
      decided_at: new Date(),
    },
  });
};

/** Member gold requests against the alliance treasury. */
export class AllianceGoldRequestService {
  private static async getStanding(
    tx: Prisma.TransactionClient | typeof prisma,
    allianceId: number,
    userId: number,
  ) {
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
      select: { leader_id: true },
    });
    if (!alliance) {
      throw new Error('Alliance not found');
    }
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { role: true },
    });
    if (!membership) {
      throw new Error('You are not a member of this alliance');
    }
    return {
      leaderId: alliance.leader_id,
      role: membership.role,
      canManageBank: hasAlliancePermission(
        alliance.leader_id,
        userId,
        membership.role,
        'manage_bank',
      ),
      // Bank managers need this extra key to approve their own requests.
      canApproveOwn: hasAlliancePermission(
        alliance.leader_id,
        userId,
        membership.role,
        'approve_own_requests',
      ),
    };
  }

  /** Creates a request. Needs request_gold; at most 3 PENDING per member. */
  static async create(data: {
    allianceId: number;
    userId: number;
    amount: bigint;
    reason?: string;
  }) {
    const v = CreateSchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        // Alliance lock serializes the pending-count check for this alliance.
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${v.allianceId} FOR UPDATE`;
        const standing = await this.getStanding(tx, v.allianceId, v.userId);
        if (
          !hasAlliancePermission(
            standing.leaderId,
            v.userId,
            standing.role,
            'request_gold',
          )
        ) {
          throw new Error('You do not have permission to request gold');
        }
        const pending = await tx.alliance_gold_requests.count({
          where: {
            alliance_id: v.allianceId,
            requester_id: v.userId,
            status: AllianceGoldRequestStatus.PENDING,
          },
        });
        if (pending >= MAX_PENDING_GOLD_REQUESTS) {
          throw new Error(
            `You can have at most ${MAX_PENDING_GOLD_REQUESTS} pending gold requests`,
          );
        }
        return await tx.alliance_gold_requests.create({
          data: {
            alliance_id: v.allianceId,
            requester_id: v.userId,
            amount: v.amount,
            reason: v.reason || null,
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error creating alliance gold request', { ...v, error });
      throw error;
    }
  }

  /**
   * Managers (leader or manage_bank) see every pending request plus recent
   * history; other members see only their own.
   */
  static async list(allianceId: number, userId: number) {
    const standing = await this.getStanding(prisma, allianceId, userId);
    const include = {
      requester: { select: { id: true, display_name: true } },
      decider: { select: { display_name: true } },
    };
    if (standing.canManageBank) {
      const [pending, history] = await Promise.all([
        prisma.alliance_gold_requests.findMany({
          where: {
            alliance_id: allianceId,
            status: AllianceGoldRequestStatus.PENDING,
          },
          orderBy: { created_at: 'asc' },
          include,
        }),
        prisma.alliance_gold_requests.findMany({
          where: {
            alliance_id: allianceId,
            status: { not: AllianceGoldRequestStatus.PENDING },
          },
          orderBy: { created_at: 'desc' },
          take: 25,
          include,
        }),
      ]);
      return {
        canManage: true,
        canApproveOwn: standing.canApproveOwn,
        requests: [...pending, ...history],
      };
    }
    const requests = await prisma.alliance_gold_requests.findMany({
      where: { alliance_id: allianceId, requester_id: userId },
      orderBy: { created_at: 'desc' },
      take: 25,
      include,
    });
    return { canManage: false, canApproveOwn: false, requests };
  }

  /**
   * Approves or declines a PENDING request (leader or manage_bank). Approval
   * is the same locked transfer as a manual one, and the status flip is
   * guarded on PENDING so it applies once. Insufficient treasury throws and
   * rolls back, leaving the request pending.
   */
  static async decide(data: {
    allianceId: number;
    requestId: number;
    actorId: number;
    decision: 'approve' | 'decline';
  }) {
    const v = DecideSchema.parse(data);
    try {
      return await prisma.$transaction(async (tx) => {
        // Peek at the requester so locks can follow alliance -> user order.
        const peek = await tx.alliance_gold_requests.findFirst({
          where: { id: v.requestId, alliance_id: v.allianceId },
          select: { requester_id: true },
        });
        if (!peek) {
          throw new Error('Request not found');
        }
        await lockAllianceThenUsers(tx, v.allianceId, [peek.requester_id]);

        const standing = await this.getStanding(tx, v.allianceId, v.actorId);
        if (!standing.canManageBank) {
          throw new Error('You do not have permission to manage the bank');
        }

        const request = await tx.alliance_gold_requests.findFirst({
          where: { id: v.requestId, alliance_id: v.allianceId },
        });
        if (!request) {
          throw new Error('Request not found');
        }
        if (request.status !== AllianceGoldRequestStatus.PENDING) {
          throw new Error('This request has already been decided');
        }
        if (
          v.decision === 'approve' &&
          request.requester_id === v.actorId &&
          !standing.canApproveOwn
        ) {
          throw new Error(
            'You do not have permission to approve your own requests',
          );
        }

        const status =
          v.decision === 'approve'
            ? AllianceGoldRequestStatus.APPROVED
            : AllianceGoldRequestStatus.DECLINED;
        const flipped = await tx.alliance_gold_requests.updateMany({
          where: {
            id: v.requestId,
            status: AllianceGoldRequestStatus.PENDING,
          },
          data: { status, decided_by: v.actorId, decided_at: new Date() },
        });
        if (flipped.count !== 1) {
          throw new Error('This request has already been decided');
        }

        if (v.decision === 'approve') {
          // Requester must still be a member (leave/kick cancels pending).
          await transferInTx(tx, {
            allianceId: v.allianceId,
            actorId: v.actorId,
            targetUserId: request.requester_id,
            amount: request.amount,
            notes: request.reason
              ? `Gold request: ${request.reason}`
              : 'Gold request',
          });
        }
        return { message: `Request ${status.toLowerCase()}`, status };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error deciding alliance gold request', { ...v, error });
      throw error;
    }
  }

  /** Cancels the caller's own PENDING request. */
  static async cancel(data: {
    allianceId: number;
    requestId: number;
    userId: number;
  }) {
    const v = CancelSchema.parse(data);
    try {
      const result = await prisma.alliance_gold_requests.updateMany({
        where: {
          id: v.requestId,
          alliance_id: v.allianceId,
          requester_id: v.userId,
          status: AllianceGoldRequestStatus.PENDING,
        },
        data: {
          status: AllianceGoldRequestStatus.CANCELLED,
          decided_at: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new Error('No pending request to cancel');
      }
      return { message: 'Request cancelled' };
    } catch (error: any) {
      logError('Error cancelling alliance gold request', { ...v, error });
      throw error;
    }
  }
}
