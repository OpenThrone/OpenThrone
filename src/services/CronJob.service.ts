import { z } from 'zod';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { getAllUsers } from '@/services';
import { getUpdatedStatus } from '@/services/User.service';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { logError } from '@/utils/logger';
import { calculateOverallRank } from '@/utils/utilities';

// Zod schemas for validation
const _RankSchema = z.number().int().positive();

// Type definitions for cron job operations
/** Describes the cron job result data contract. */
export interface CronJobResult {
  success: boolean;
  message: string;
  processed?: number;
  failed?: number;
}

/** Encapsulates cron job data access and domain operations. */
export class CronJobService {
  /**
   * Processes daily updates for all users
   */
  static async processDailyUpdates(): Promise<CronJobResult> {
    try {
      const allUsers = await getAllUsers();

      // Initialize the queue with users and attempt counts
      const queue = allUsers.map((singleUser) => ({
        user: new UserModel(
          singleUser,
          singleUser.UserUnit,
          singleUser.UserItem,
          singleUser.UserStructureUpgrade,
          singleUser.UserBattleUpgrade,
          singleUser.UserBonusPoints,
          singleUser.permissions.map((p) => ({ type: p })),
          singleUser.stats,
        ),
        attempts: 0,
      }));

      let processed = 0;
      let failed = 0;

      // Process the queue
      while (queue.length > 0) {
        const currentTask = queue.shift();

        const success = await this.updateUserPerDay(currentTask.user);

        if (success) {
          processed++;
        } else {
          currentTask.attempts += 1;
          if (currentTask.attempts < 3) {
            // Move the user to the end of the queue for another attempt
            queue.push(currentTask);
          } else {
            failed++;
            logError(
              `Failed to update user ${currentTask.user.id} after 3 attempts.`,
            );
          }
        }
      }

      // Perform daily cleanup
      await this.doDailyCleanup();

      return {
        success: true,
        message: 'Daily updates processed successfully',
        processed,
        failed,
      };
    } catch (error: any) {
      logError('Error processing daily updates', { error });
      throw error;
    }
  }

  /**
   * Processes turn updates for all users
   */
  static async processTurnUpdates(): Promise<CronJobResult> {
    try {
      const allUsers = await prisma.users.findMany({
        include: {
          UserUnit: true,
          UserItem: true,
          UserStructureUpgrade: true,
          UserBattleUpgrade: true,
          UserBonusPoints: true,
        },
      });

      const userRanks = allUsers.map((user) => {
        const newUser = new UserModel(user);
        const rankScore = calculateOverallRank(user);

        return {
          id: user.id,
          rankScore,
          newUser,
        };
      });

      userRanks.sort((a, b) => b.rankScore - a.rankScore);

      const queue = userRanks.map((userRank, index) => ({
        user: userRank.newUser,
        rank: index + 1,
        attempts: 0,
      }));

      let processed = 0;
      let failed = 0;

      while (queue.length > 0) {
        const currentTask = queue.shift();

        const success = await this.updateUserPerTurn(
          currentTask.user,
          currentTask.rank,
        );

        if (success) {
          processed++;
        } else {
          currentTask.attempts += 1;
          if (currentTask.attempts < 3) {
            queue.push(currentTask);
          } else {
            failed++;
            logError(
              `Failed to update user ${currentTask.user.id} after 3 attempts.`,
            );
          }
        }
      }

      return {
        success: true,
        message: 'Turn updates processed successfully',
        processed,
        failed,
      };
    } catch (error: any) {
      logError('Error processing turn updates', { error });
      throw error;
    }
  }

  /**
   * Processes account status updates for all users
   */
  static async processAccountStatusUpdates(): Promise<CronJobResult> {
    try {
      const allUsers = await prisma.users.findMany();

      const userRanks = allUsers.map((user) => {
        const newUser = new UserModel(user);

        return {
          id: user.id,
          newUser,
        };
      });

      userRanks.sort((a, b) => b.id - a.id);

      const queue = userRanks.map((userRank) => ({
        user: userRank.newUser,
        attempts: 0,
      }));

      let processed = 0;
      let failed = 0;

      while (queue.length > 0) {
        const currentTask = queue.shift();

        const success = await this.updateUserAccountStatus(currentTask.user);

        if (success) {
          processed++;
        } else {
          currentTask.attempts += 1;
          if (currentTask.attempts < 3) {
            queue.push(currentTask);
          } else {
            failed++;
            logError(
              `Failed to update account status for user ${currentTask.user.id} after 3 attempts.`,
            );
          }
        }
      }

      return {
        success: true,
        message: 'Account status updates processed successfully',
        processed,
        failed,
      };
    } catch (error: any) {
      logError('Error processing account status updates', { error });
      throw error;
    }
  }

  /**
   * Updates a single user for daily changes
   */
  private static async updateUserPerDay(
    currentUser: UserModel,
  ): Promise<boolean> {
    try {
      await this.healWoundedUnits(currentUser);

      const originalCitizens = Number(currentUser.citizens ?? 0);
      const recruitingBonus = Number(currentUser.recruitBonus ?? 0) || 0;
      const newCitizens = originalCitizens + recruitingBonus;

      await prisma.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId: currentUser.id,
            type: 'CITIZEN',
            level: 1,
            isMercenary: false,
          },
        },
        update: {
          quantity: {
            increment: recruitingBonus,
          },
        },
        create: {
          userId: currentUser.id,
          type: 'CITIZEN',
          level: 1,
          quantity: recruitingBonus,
          isMercenary: false,
        },
      });

      await prisma.bank_history.create({
        data: {
          from_user_id: 0,
          to_user_id: currentUser.id,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: 0,
          history_type: 'DAILY_RECRUIT',
          stats: {
            currentCitizens: originalCitizens,
            newCitizens,
            recruitingBonus: currentUser.recruitBonus,
          },
        },
      });

      return true;
    } catch (error) {
      logError(`Error updating user ${currentUser.id} for daily`, { error });
      return false;
    }
  }

  /**
   * Heals a share of the wounded pool daily, returning recovered units to
   * active duty and persisting the remaining wounded counts.
   */
  private static async healWoundedUnits(user: UserModel): Promise<void> {
    const woundedGroups = Array.isArray(user.woundedUnits)
      ? (user.woundedUnits as Array<{
          type?: string;
          level?: number;
          quantity?: number;
          isMercenary?: boolean;
          woundedAt?: string;
        }>)
      : [];
    if (!woundedGroups.length) return;

    try {
      const remaining: typeof woundedGroups = [];

      for (const group of woundedGroups) {
        const quantity = Math.max(0, Math.floor(Number(group?.quantity ?? 0)));
        const type = String(group?.type ?? 'CITIZEN');
        const level = Math.max(1, Math.floor(Number(group?.level ?? 1)));
        const isMercenary = !!group?.isMercenary;
        if (quantity <= 0) continue;

        const healed = Math.min(
          quantity,
          Math.max(
            1,
            Math.floor(
              quantity * V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY,
            ),
          ),
        );
        const unhealed = quantity - healed;

        if (healed > 0) {
          await prisma.userUnit.upsert({
            where: {
              userId_type_level_isMercenary: {
                userId: user.id,
                type,
                level,
                isMercenary,
              },
            },
            update: { quantity: { increment: healed } },
            create: {
              userId: user.id,
              type,
              level,
              quantity: healed,
              isMercenary,
            },
          });
        }

        if (unhealed > 0) {
          remaining.push({ ...group, quantity: unhealed });
        }
      }

      await prisma.users.update({
        where: { id: user.id },
        data: { wounded_units: remaining },
      });
    } catch (error) {
      logError(`Error healing wounded units for user ${user.id}`, { error });
    }
  }

  /**
   * Updates a single user for turn changes
   */
  private static async updateUserPerTurn(
    currentUser: UserModel,
    rank: number,
  ): Promise<boolean> {
    try {
      const updatedGold =
        BigInt(currentUser.goldPerTurn.toString()) + BigInt(currentUser.gold);

      const updateData = {
        gold: updatedGold,
        attack_turns: currentUser.attackTurns + 1,
        stamina: Math.min(currentUser.maxStamina, currentUser.stamina + 1),
        rank,
        offense: currentUser.offense,
        defense: currentUser.defense,
        spy: currentUser.spy,
        sentry: currentUser.sentry,
      };

      await prisma.$transaction(async (tx) => {
        await tx.bank_history.create({
          data: {
            from_user_id: 0,
            to_user_id: currentUser.id,
            to_user_account_type: 'HAND',
            from_user_account_type: 'BANK',
            date_time: new Date(),
            gold_amount: currentUser.goldPerTurn,
            history_type: 'ECONOMY',
            stats: {
              currentGold: currentUser.gold,
              newGold: updatedGold.toString(),
              increase: currentUser.goldPerTurn,
            },
          },
        });
        await tx.users.update({
          where: { id: currentUser.id },
          data: updateData,
        });
      });

      return true;
    } catch (error) {
      logError(`Error updating user ${currentUser.id} for turn`, { error });
      return false;
    }
  }

  /**
   * Updates account status for a single user
   */
  private static async updateUserAccountStatus(
    currentUser: UserModel,
  ): Promise<boolean> {
    try {
      await getUpdatedStatus(currentUser.id);
      return true;
    } catch (error) {
      logError(`Error updating account status for user ${currentUser.id}`, {
        error,
      });
      return false;
    }
  }

  /**
   * Performs daily cleanup tasks
   */
  private static async doDailyCleanup(): Promise<void> {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const tablesToClean = [
      { name: 'attack_log', dateField: 'timestamp' },
      { name: 'bank_history', dateField: 'date_time' },
      { name: 'recruit_history', dateField: 'timestamp' },
    ];

    const cleanupPromises = tablesToClean.map(
      async (table) =>
        await prisma[table.name].deleteMany({
          where: {
            [table.dateField]: {
              lt: twentyDaysAgo,
            },
          },
        }),
    );

    await Promise.all(cleanupPromises);
  }
}
