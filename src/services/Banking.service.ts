import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

import {
  deposit,
  getBankHistory,
  getDepositHistory,
  withdraw,
} from './Bank.service';

// Define the type for the transaction client
type _TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Type definitions for banking operations
export interface DepositData {
  amount: bigint;
}

export interface WithdrawData {
  amount: bigint;
}

export interface BankHistoryQuery {
  deposits?: boolean;
  withdraws?: boolean;
  war_spoils?: boolean;
  transfers?: boolean;
  sale?: boolean;
  training?: boolean;
  economy?: boolean;
  recruitment?: boolean;
  fortification?: boolean;
  daily?: boolean;
  friend_transfers?: boolean;
  page?: number;
  limit?: number;
}

export interface BankTransaction {
  id: number;
  gold_amount: bigint;
  from_user_id: number;
  from_user_account_type: string;
  to_user_id: number;
  to_user_account_type: string;
  date_time: Date;
  history_type: string;
  stats?: any;
}

export interface DepositHistoryInfo {
  remainingDeposits: number;
  nextDepositAvailable:
    | {
        hours: number;
        minutes: number;
        seconds: number;
      }
    | number;
}

export interface BankBalance {
  gold: bigint;
  gold_in_bank: bigint;
  total: bigint;
}

export interface BankingValidationResult {
  canDeposit: boolean;
  canWithdraw: boolean;
  remainingDeposits: number;
  lastDepositTime?: Date;
  errors: string[];
}

// Zod schemas for validation
const DepositSchema = z.object({
  amount: z
    .string()
    .transform((val) => BigInt(val))
    .refine((val) => val > 0n, 'Deposit amount must be positive'),
});

const WithdrawSchema = z.object({
  amount: z
    .string()
    .transform((val) => BigInt(val))
    .refine((val) => val > 0n, 'Withdrawal amount must be positive'),
});

const BankHistoryQuerySchema = z.object({
  deposits: z.coerce.boolean().optional(),
  withdraws: z.coerce.boolean().optional(),
  war_spoils: z.coerce.boolean().optional(),
  transfers: z.coerce.boolean().optional(),
  sale: z.coerce.boolean().optional(),
  training: z.coerce.boolean().optional(),
  economy: z.coerce.boolean().optional(),
  recruitment: z.coerce.boolean().optional(),
  fortification: z.coerce.boolean().optional(),
  daily: z.coerce.boolean().optional(),
  friend_transfers: z.coerce.boolean().optional(),
  page: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export class BankingService {
  /**
   * Validates deposit conditions for a user
   */
  private static async validateDeposit(
    userId: number,
    amount: bigint,
  ): Promise<BankingValidationResult> {
    const errors: string[] = [];

    try {
      // Fetch user data
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        errors.push('User not found');
        return {
          canDeposit: false,
          canWithdraw: false,
          remainingDeposits: 0,
          errors,
        };
      }

      const userModel = new UserModel(user);
      const history = await getDepositHistory(userId);

      // Check if user has enough gold in hand
      if (BigInt(user.gold ?? 0) < amount) {
        errors.push('Insufficient gold in hand for deposit');
      }

      // Check deposit limits
      const remainingDeposits = userModel.maximumBankDeposits - history.length;
      if (remainingDeposits <= 0) {
        errors.push('Maximum deposits reached for today');
      }

      return {
        canDeposit: errors.length === 0,
        canWithdraw: true, // Withdraw validation is separate
        remainingDeposits,
        lastDepositTime: history.length > 0 ? history[0].date_time : undefined,
        errors,
      };
    } catch (error: any) {
      logError('Error validating deposit', {
        userId,
        amount: amount.toString(),
        error,
      });
      errors.push('Validation failed');
      return {
        canDeposit: false,
        canWithdraw: false,
        remainingDeposits: 0,
        errors,
      };
    }
  }

  /**
   * Validates withdrawal conditions for a user
   */
  private static async validateWithdrawal(
    userId: number,
    amount: bigint,
  ): Promise<{ canWithdraw: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Fetch user data
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        errors.push('User not found');
        return { canWithdraw: false, errors };
      }

      // Check if user has enough gold in bank
      if (BigInt(user.gold_in_bank ?? 0) < amount) {
        errors.push('Insufficient gold in bank for withdrawal');
      }

      return {
        canWithdraw: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      logError('Error validating withdrawal', {
        userId,
        amount: amount.toString(),
        error,
      });
      errors.push('Validation failed');
      return { canWithdraw: false, errors };
    }
  }

  /**
   * Deposits gold from user's hand to bank account
   */
  static async depositToBank(userId: number, data: DepositData) {
    const validatedData = DepositSchema.parse(data);

    try {
      // Validate deposit conditions
      const validation = await this.validateDeposit(
        userId,
        validatedData.amount,
      );
      if (!validation.canDeposit) {
        throw new Error(validation.errors.join(', '));
      }

      // Perform the deposit using existing Bank.service
      const updatedUser = await deposit(userId, validatedData.amount);

      return {
        message: 'Deposit successful',
        data: stringifyObj(updatedUser),
        remainingDeposits: validation.remainingDeposits - 1,
      };
    } catch (error: any) {
      logError('Error depositing to bank', {
        userId,
        amount: validatedData.amount.toString(),
        error,
      });
      throw error;
    }
  }

  /**
   * Withdraws gold from bank account to user's hand
   */
  static async withdrawFromBank(userId: number, data: WithdrawData) {
    const validatedData = WithdrawSchema.parse(data);

    try {
      // Validate withdrawal conditions
      const validation = await this.validateWithdrawal(
        userId,
        validatedData.amount,
      );
      if (!validation.canWithdraw) {
        throw new Error(validation.errors.join(', '));
      }

      // Perform the withdrawal using existing Bank.service
      const updatedUser = await withdraw(userId, validatedData.amount);

      return {
        message: 'Withdrawal successful',
        data: stringifyObj(updatedUser),
      };
    } catch (error: any) {
      logError('Error withdrawing from bank', {
        userId,
        amount: validatedData.amount.toString(),
        error,
      });
      throw error;
    }
  }

  /**
   * Gets comprehensive bank transaction history for a user
   */
  static async getBankHistory(userId: number, query: BankHistoryQuery) {
    const validatedQuery = BankHistoryQuerySchema.parse(query);

    try {
      const conditions: Prisma.bank_historyWhereInput[] = [];
      const transactionConditions: Prisma.bank_historyWhereInput[] = [];

      // Build filter conditions based on query parameters
      if (validatedQuery.deposits) {
        transactionConditions.push({
          from_user_account_type: 'HAND',
          to_user_id: userId,
          to_user_account_type: 'BANK',
          from_user_id: userId,
          history_type: 'PLAYER_TRANSFER',
        });
      }

      if (validatedQuery.withdraws) {
        transactionConditions.push({
          from_user_account_type: 'BANK',
          to_user_id: userId,
          to_user_account_type: 'HAND',
          from_user_id: userId,
          history_type: 'PLAYER_TRANSFER',
        });
      }

      if (validatedQuery.war_spoils) {
        transactionConditions.push({
          history_type: 'WAR_SPOILS',
        });
      }

      if (validatedQuery.transfers) {
        transactionConditions.push({
          history_type: 'PLAYER_TRANSFER',
          AND: [
            {
              OR: [{ from_user_id: userId }, { to_user_id: userId }],
            },
            {
              NOT: [{ from_user_id: userId, to_user_id: userId }],
            },
          ],
        });
      }

      if (validatedQuery.economy) {
        transactionConditions.push({
          history_type: 'ECONOMY',
          to_user_id: userId,
        });
      }

      if (validatedQuery.fortification) {
        transactionConditions.push({
          history_type: 'FORT_REPAIR',
          from_user_id: userId,
        });
      }

      if (validatedQuery.recruitment) {
        transactionConditions.push({
          history_type: 'RECRUITMENT',
          to_user_id: userId,
        });
      }

      if (validatedQuery.sale) {
        transactionConditions.push(
          {
            history_type: 'SALE',
            stats: {
              path: ['type'],
              string_contains: 'ARMORY',
            },
          },
          {
            history_type: 'SALE',
            stats: {
              path: ['type'],
              string_contains: '_UPGRADES',
            },
          },
          {
            history_type: 'SALE',
            stats: {
              path: ['action'],
              string_contains: '_upgrade',
            },
          },
        );
      }

      if (validatedQuery.training) {
        transactionConditions.push({
          history_type: { in: ['SALE'] },
          stats: {
            path: ['type'],
            string_contains: 'TRAINING_',
          },
        });
      }

      if (validatedQuery.daily) {
        transactionConditions.push({
          history_type: 'DAILY_RECRUIT',
          to_user_id: userId,
        });
      }

      if (validatedQuery.friend_transfers) {
        transactionConditions.push({
          history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
          OR: [{ from_user_id: userId }, { to_user_id: userId }],
        });
      }

      // Combine transaction conditions if any exist
      if (transactionConditions.length > 0) {
        conditions.push({
          OR: transactionConditions,
        });
      }

      // Always include user's own transactions
      conditions.push({
        OR: [{ from_user_id: userId }, { to_user_id: userId }],
      });

      // Use existing Bank.service method
      const { rows, total } = await getBankHistory(
        conditions,
        validatedQuery.limit,
        validatedQuery.page,
      );
      const totalPages = Math.ceil(total / validatedQuery.limit);

      return {
        rows: stringifyObj(rows),
        total,
        totalPages,
        currentPage: validatedQuery.page,
        limit: validatedQuery.limit,
      };
    } catch (error: any) {
      logError('Error getting bank history', {
        userId,
        query: validatedQuery,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets deposit-related information for a user
   */
  static async getDepositInfo(userId: number): Promise<DepositHistoryInfo> {
    try {
      const [user, history] = await Promise.all([
        prisma.users.findUnique({
          where: { id: userId },
        }),
        getDepositHistory(userId),
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      const userModel = new UserModel(user);
      const remainingDeposits = userModel.maximumBankDeposits - history.length;

      // Calculate next deposit available time
      let nextDepositAvailable: DepositHistoryInfo['nextDepositAvailable'] = 0;
      if (history.length > 0) {
        const getCountdown = (timestamp: string) => {
          const targetDate = new Date(timestamp);
          targetDate.setHours(targetDate.getHours() + 24);
          const currentDate = new Date();
          const timeDiff = targetDate.getTime() - currentDate.getTime();

          if (timeDiff > 0) {
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor(
              (timeDiff % (1000 * 60 * 60)) / (1000 * 60),
            );
            const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
            return { hours, minutes, seconds };
          }
          return { hours: 0, minutes: 0, seconds: 0 };
        };

        nextDepositAvailable = getCountdown(history[0].date_time.toString());
      }

      return {
        remainingDeposits,
        nextDepositAvailable,
      };
    } catch (error: any) {
      logError('Error getting deposit info', { userId, error });
      throw error;
    }
  }

  /**
   * Gets current bank balance information for a user
   */
  static async getBankBalance(userId: number): Promise<BankBalance> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { gold: true, gold_in_bank: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const gold = BigInt(user.gold ?? 0);
      const goldInBank = BigInt(user.gold_in_bank ?? 0);
      const total = gold + goldInBank;

      return {
        gold,
        gold_in_bank: goldInBank,
        total,
      };
    } catch (error: any) {
      logError('Error getting bank balance', { userId, error });
      throw error;
    }
  }

  /**
   * Validates if a user can perform a banking operation
   */
  static async validateBankingOperation(
    userId: number,
    operation: 'deposit' | 'withdraw',
    amount?: bigint,
  ): Promise<BankingValidationResult> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          canDeposit: false,
          canWithdraw: false,
          remainingDeposits: 0,
          errors: ['User not found'],
        };
      }

      const userModel = new UserModel(user);
      const history = await getDepositHistory(userId);
      const remainingDeposits = userModel.maximumBankDeposits - history.length;

      const result: BankingValidationResult = {
        canDeposit: true,
        canWithdraw: true,
        remainingDeposits,
        lastDepositTime: history.length > 0 ? history[0].date_time : undefined,
        errors: [],
      };

      // Check specific operation validation
      if (amount !== undefined) {
        if (operation === 'deposit') {
          const validation = await this.validateDeposit(userId, amount);
          result.canDeposit = validation.canDeposit;
          result.errors = validation.errors;
        } else if (operation === 'withdraw') {
          const validation = await this.validateWithdrawal(userId, amount);
          result.canWithdraw = validation.canWithdraw;
          result.errors = validation.errors;
        }
      }

      return result;
    } catch (error: any) {
      logError('Error validating banking operation', {
        userId,
        operation,
        amount: amount?.toString(),
        error,
      });
      return {
        canDeposit: false,
        canWithdraw: false,
        remainingDeposits: 0,
        errors: ['Validation failed'],
      };
    }
  }

  /**
   * Gets comprehensive banking statistics for a user
   */
  static async getBankingStats(userId: number) {
    try {
      const [balance, depositInfo, recentHistory] = await Promise.all([
        this.getBankBalance(userId),
        this.getDepositInfo(userId),
        this.getBankHistory(userId, { limit: 5, page: 0 }),
      ]);

      return {
        balance,
        depositInfo,
        recentTransactions: recentHistory.rows,
        totalTransactions: recentHistory.total,
      };
    } catch (error: any) {
      logError('Error getting banking stats', { userId, error });
      throw error;
    }
  }
}
