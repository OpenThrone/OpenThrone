import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { AllianceTransactionType } from '@/lib/prisma-exports';
import { ensureActiveEra } from '@/services/Era.service';
import { logError } from '@/utils/logger';

const DepositSchema = z.object({
  allianceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1)),
});

const WithdrawSchema = z.object({
  allianceId: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  targetUserId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1)),
  notes: z.string().optional(),
});

/** Upper bound for an alliance bank transaction (lock wait + work). */
export const ALLIANCE_BANK_TX_OPTIONS = {
  timeout: 10_000,
  maxWait: 5_000,
} as const;

/**
 * Lock order shared by every alliance bank operation: the alliance row first,
 * then each user row in ascending id order. Code that locks both alliances and
 * users must follow this order so concurrent deposits and withdrawals cannot
 * deadlock (a member depositing while the leader withdraws to that member).
 */
export const lockAllianceThenUsers = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  userIds: number[],
): Promise<void> => {
  await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
  const orderedIds = [...new Set(userIds)].sort((a, b) => a - b);
  for (const userId of orderedIds) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }
};

/** Encapsulates alliance bank data access and domain operations. */
export class AllianceBankService {
  /**
   * Deposit gold from user's hand to alliance bank.
   * Locks follow lockAllianceThenUsers (alliance, then user). Membership and
   * balance are checked inside the transaction; the debit is a conditional
   * update (gold >= amount), so concurrent deposits cannot overdraw.
   */
  static async deposit(data: {
    allianceId: number;
    userId: number;
    amount: bigint;
  }) {
    const validatedData = DepositSchema.parse(data);

    try {
      await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, validatedData.allianceId, [
          validatedData.userId,
        ]);

        const membership = await tx.alliance_memberships.count({
          where: {
            alliance_id: validatedData.allianceId,
            user_id: validatedData.userId,
          },
        });
        if (membership === 0) {
          throw new Error('You are not a member of this alliance');
        }

        const debit = await tx.users.updateMany({
          where: {
            id: validatedData.userId,
            gold: { gte: validatedData.amount },
          },
          data: { gold: { decrement: validatedData.amount } },
        });
        if (debit.count !== 1) {
          throw new Error('Insufficient gold');
        }

        const credit = await tx.alliances.updateMany({
          where: { id: validatedData.allianceId },
          data: { gold_in_bank: { increment: validatedData.amount } },
        });
        if (credit.count !== 1) {
          throw new Error('Alliance not found');
        }

        await tx.alliance_bank_history.create({
          data: {
            alliance_id: validatedData.allianceId,
            transaction_type: AllianceTransactionType.DEPOSIT,
            amount: validatedData.amount,
            performed_by_user_id: validatedData.userId,
            related_user_id: validatedData.userId,
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);

      return { message: 'Deposit successful' };
    } catch (error: any) {
      logError('Error depositing to alliance bank', {
        ...validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Withdraw gold from alliance bank to a member (Direct Deposit).
   * Locks follow lockAllianceThenUsers (alliance, then target user), so
   * leadership, membership and balance are all evaluated against committed
   * state. The debit is conditional
   * (gold_in_bank >= amount) and must affect exactly one row.
   */
  static async withdraw(data: {
    allianceId: number;
    requesterId: number;
    targetUserId: number;
    amount: bigint;
    notes?: string;
  }) {
    const validatedData = WithdrawSchema.parse(data);

    try {
      await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, validatedData.allianceId, [
          validatedData.targetUserId,
        ]);

        const alliance = await tx.alliances.findUnique({
          where: { id: validatedData.allianceId },
          select: { leader_id: true },
        });
        if (!alliance) {
          throw new Error('Alliance not found');
        }

        const requesterMembership = await tx.alliance_memberships.count({
          where: {
            alliance_id: validatedData.allianceId,
            user_id: validatedData.requesterId,
          },
        });
        if (requesterMembership === 0) {
          throw new Error('You are not a member of this alliance');
        }

        // TODO: Add refined permissions like 'can_withdraw' or 'manage_bank'
        // For now, only Leader or potentially logic for roles needed
        if (alliance.leader_id !== validatedData.requesterId) {
          throw new Error('Only the alliance leader can withdraw funds');
        }

        // Funds may only go to a member of this alliance.
        const targetMembership = await tx.alliance_memberships.count({
          where: {
            alliance_id: validatedData.allianceId,
            user_id: validatedData.targetUserId,
          },
        });
        if (targetMembership === 0) {
          throw new Error('Target user is not a member of this alliance');
        }

        const debit = await tx.alliances.updateMany({
          where: {
            id: validatedData.allianceId,
            gold_in_bank: { gte: validatedData.amount },
          },
          data: { gold_in_bank: { decrement: validatedData.amount } },
        });
        if (debit.count !== 1) {
          throw new Error('Insufficient alliance funds');
        }

        const credit = await tx.users.updateMany({
          where: { id: validatedData.targetUserId },
          data: { gold: { increment: validatedData.amount } },
        });
        if (credit.count !== 1) {
          throw new Error('Target user not found');
        }

        await tx.alliance_bank_history.create({
          data: {
            alliance_id: validatedData.allianceId,
            transaction_type: AllianceTransactionType.WITHDRAWAL,
            amount: validatedData.amount,
            performed_by_user_id: validatedData.requesterId,
            related_user_id: validatedData.targetUserId,
            notes: validatedData.notes,
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);

      return { message: 'Withdrawal successful' };
    } catch (error: any) {
      logError('Error withdrawing from alliance bank', {
        ...validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Get bank history. Only the alliance's leader or a member may read it.
   */
  static async getHistory(allianceId: number, requesterId: number) {
    const [membership, alliance] = await Promise.all([
      prisma.alliance_memberships.count({
        where: { alliance_id: allianceId, user_id: requesterId },
      }),
      prisma.alliances.findUnique({
        where: { id: allianceId },
        select: { leader_id: true },
      }),
    ]);
    if (!alliance) {
      throw new Error('Alliance not found');
    }
    if (membership === 0 && alliance.leader_id !== requesterId) {
      throw new Error(
        'Forbidden: only alliance members can view its bank history',
      );
    }

    const era = await ensureActiveEra();
    return await prisma.alliance_bank_history.findMany({
      where: {
        alliance_id: allianceId,
        created_at: { gte: era.startDate },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        performed_by_user: { select: { display_name: true } },
        related_user: { select: { display_name: true } },
      },
    });
  }
}
