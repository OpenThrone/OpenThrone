import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import {
  ALLIANCE_NOTE_MAX_LENGTH,
  MEMBER_DAILY_CAP_DEFAULT,
} from '@/constants/allianceTreasury';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { AllianceTransactionType } from '@/lib/prisma-exports';
import { ensureActiveEra } from '@/services/Era.service';
import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from '@/utils/bankLimits';
import { logError } from '@/utils/logger';
import { getOTStartDate } from '@/utils/timefunctions';

const DepositSchema = z.object({
  allianceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1)),
});

const TransferSchema = z.object({
  allianceId: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  targetUserId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1)),
  notes: z.string().trim().max(ALLIANCE_NOTE_MAX_LENGTH).optional(),
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

/**
 * Gold a member already received from the treasury since the OT day began:
 * transfers, approved gold requests (WITHDRAWAL) and loan principal (LOAN).
 */
export const getReceivedToday = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  userId: number,
): Promise<bigint> => {
  const sum = await tx.alliance_bank_history.aggregate({
    where: {
      alliance_id: allianceId,
      related_user_id: userId,
      transaction_type: {
        in: [AllianceTransactionType.WITHDRAWAL, AllianceTransactionType.LOAN],
      },
      created_at: { gte: getOTStartDate() },
    },
    _sum: { amount: true },
  });
  return BigInt(sum?._sum?.amount ?? 0);
};

/**
 * Moves gold from the alliance treasury to a member inside a transaction.
 * The caller must already hold the alliance and target-user locks (see
 * lockAllianceThenUsers). Needs the leader or manage_bank; the target must be
 * a current member; the debit is conditional (gold_in_bank >= amount).
 */
export const transferInTx = async (
  tx: Prisma.TransactionClient,
  params: {
    allianceId: number;
    actorId: number;
    targetUserId: number;
    amount: bigint;
    notes?: string | null;
    /** WITHDRAWAL for transfers and requests; LOAN for loan disbursement. */
    transactionType?: AllianceTransactionType;
  },
): Promise<void> => {
  const { allianceId, actorId, targetUserId, amount, notes } = params;
  const alliance = await tx.alliances.findUnique({
    where: { id: allianceId },
    select: { leader_id: true, member_daily_cap: true },
  });
  if (!alliance) {
    throw new Error('Alliance not found');
  }

  if (alliance.leader_id !== actorId) {
    const actorMembership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: actorId },
      },
      include: { role: true },
    });
    if (!actorMembership) {
      throw new Error('You are not a member of this alliance');
    }
    if (
      !hasAlliancePermission(
        alliance.leader_id,
        actorId,
        actorMembership.role,
        'manage_bank',
      )
    ) {
      throw new Error('You do not have permission to manage the bank');
    }
  }

  // Funds may only go to a current member of this alliance.
  const targetMembership = await tx.alliance_memberships.count({
    where: { alliance_id: allianceId, user_id: targetUserId },
  });
  if (targetMembership === 0) {
    throw new Error('Target user is not a member of this alliance');
  }

  // The alliance row is locked, so concurrent payouts cannot both pass.
  const dailyCap = BigInt(
    alliance.member_daily_cap ?? MEMBER_DAILY_CAP_DEFAULT,
  );
  const receivedToday = await getReceivedToday(tx, allianceId, targetUserId);
  if (receivedToday + amount > dailyCap) {
    const left = dailyCap > receivedToday ? dailyCap - receivedToday : 0n;
    throw new Error(
      `Daily limit reached: this member can receive at most ${left.toString()} more gold today`,
    );
  }

  const debit = await tx.alliances.updateMany({
    where: { id: allianceId, gold_in_bank: { gte: amount } },
    data: { gold_in_bank: { decrement: amount } },
  });
  if (debit.count !== 1) {
    throw new Error('Insufficient alliance funds');
  }

  const credit = await tx.users.updateMany({
    where: { id: targetUserId },
    data: { gold: { increment: amount } },
  });
  if (credit.count !== 1) {
    throw new Error('Target user not found');
  }

  await tx.alliance_bank_history.create({
    data: {
      alliance_id: allianceId,
      transaction_type:
        params.transactionType ?? AllianceTransactionType.WITHDRAWAL,
      amount,
      performed_by_user_id: actorId,
      related_user_id: targetUserId,
      notes: notes ?? null,
    },
  });
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

        // The user row is locked, so the cap is evaluated on committed gold.
        const depositor = await tx.users.findUnique({
          where: { id: validatedData.userId },
          select: { gold: true },
        });
        if (!depositor) {
          throw new Error('User not found');
        }
        if (validatedData.amount > getMaxDeposit(depositor.gold)) {
          throw new Error(
            `You can deposit at most ${DEPOSIT_CAP_PERCENT}% of the gold you hold at once`,
          );
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
   * Transfer gold from the alliance treasury to a member. The leader or a
   * member with manage_bank may do it. Locks follow lockAllianceThenUsers
   * (alliance, then target user); see transferInTx for the checks.
   */
  static async transfer(data: {
    allianceId: number;
    requesterId: number;
    targetUserId: number;
    amount: bigint;
    notes?: string;
  }) {
    const validatedData = TransferSchema.parse(data);

    try {
      await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, validatedData.allianceId, [
          validatedData.targetUserId,
        ]);
        await transferInTx(tx, {
          allianceId: validatedData.allianceId,
          actorId: validatedData.requesterId,
          targetUserId: validatedData.targetUserId,
          amount: validatedData.amount,
          notes: validatedData.notes,
        });
      }, ALLIANCE_BANK_TX_OPTIONS);

      return { message: 'Transfer successful' };
    } catch (error: any) {
      logError('Error transferring from alliance bank', {
        ...validatedData,
        error,
      });
      throw error;
    }
  }

  /** Legacy name for transfer; kept so existing callers and routes work. */
  static async withdraw(data: {
    allianceId: number;
    requesterId: number;
    targetUserId: number;
    amount: bigint;
    notes?: string;
  }) {
    await AllianceBankService.transfer(data);
    return { message: 'Withdrawal successful' };
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
