import { AllianceTransactionType } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
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

export class AllianceBankService {
  /**
   * Deposit gold from user's hand to alliance bank
   */
  static async deposit(data: {
    allianceId: number;
    userId: number;
    amount: bigint;
  }) {
    const validatedData = DepositSchema.parse(data);

    try {
      // Check user balance
      const user = await prisma.users.findUnique({
        where: { id: validatedData.userId },
        select: { gold: true },
      });

      if (!user || user.gold < validatedData.amount) {
        throw new Error('Insufficient gold');
      }

      // Check membership
      const membership = await prisma.alliance_memberships.count({
        where: {
          alliance_id: validatedData.allianceId,
          user_id: validatedData.userId,
        },
      });
      if (membership === 0) {
        throw new Error('You are not a member of this alliance');
      }

      await prisma.$transaction(async (tx) => {
        // Deduct from user
        await tx.users.update({
          where: { id: validatedData.userId },
          data: { gold: { decrement: validatedData.amount } },
        });

        // Add to alliance
        await tx.alliances.update({
          where: { id: validatedData.allianceId },
          data: { gold_in_bank: { increment: validatedData.amount } },
        });

        // Log transaction
        await tx.alliance_bank_history.create({
          data: {
            alliance_id: validatedData.allianceId,
            transaction_type: AllianceTransactionType.DEPOSIT,
            amount: validatedData.amount,
            performed_by_user_id: validatedData.userId,
            related_user_id: validatedData.userId,
          },
        });
      });

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
   * Withdraw gold from alliance bank to a user (Direct Deposit)
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
      // Check permissions
      const requesterMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: validatedData.allianceId,
          user_id: validatedData.requesterId,
        },
        include: { role: true, alliance: true },
      });

      if (!requesterMembership) {
        throw new Error('You are not a member of this alliance');
      }

      // TODO: Add refined permissions like 'can_withdraw' or 'manage_bank'
      // For now, only Leader or potentially logic for roles needed
      const isLeader =
        requesterMembership.alliance.leader_id === validatedData.requesterId;
      if (!isLeader) {
        throw new Error('Only the alliance leader can withdraw funds');
      }

      // Check alliance balance
      if (
        requesterMembership.alliance.gold_in_bank === null ||
        BigInt(requesterMembership.alliance.gold_in_bank) < validatedData.amount
      ) {
        throw new Error('Insufficient alliance funds');
      }

      await prisma.$transaction(async (tx) => {
        // Deduct from alliance
        await tx.alliances.update({
          where: { id: validatedData.allianceId },
          data: { gold_in_bank: { decrement: validatedData.amount } },
        });

        // Add to target user
        await tx.users.update({
          where: { id: validatedData.targetUserId },
          data: { gold: { increment: validatedData.amount } },
        });

        // Log transaction
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
      });

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
   * Get bank history
   */
  static async getHistory(allianceId: number) {
    return await prisma.alliance_bank_history.findMany({
      where: { alliance_id: allianceId },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        performed_by_user: { select: { display_name: true } },
        related_user: { select: { display_name: true } },
      },
    });
  }
}
