import { z } from 'zod';

import { multiplyCount } from '@/constants/gameEvents';
import prisma from '@/lib/prisma';
import type { Prisma, UnitType } from '@/lib/prisma-exports';
import UserModel from '@/models/Users';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import { runInactivitySweep } from '@/services/AccountInactivity.service';
import {
  AllianceLoanService,
  divertIncomeToLoans,
  settleLoanTreasuryCredits,
} from '@/services/AllianceLoan.service';
import { ensureActiveEra } from '@/services/Era.service';
import { getGameEventModifiers } from '@/services/GameEventRuntime.service';
import { pruneLoginTelemetry } from '@/services/LoginTelemetry.service';
import { getUpdatedStatus } from '@/services/User.service';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { logError } from '@/utils/logger';
import { getEraParticipantWhere } from '@/utils/loginPolicy';
import { calculateOverallRank } from '@/utils/utilities';

// Zod schemas for validation
const _RankSchema = z.number().int().positive();

/**
 * Per-user cron transactions lock exactly one users row (FOR UPDATE) and keep
 * the work short, so they cannot deadlock with attack/spy (which lock two users
 * in ascending id order) and only briefly delay player actions.
 */
export const CRON_USER_TX_OPTIONS = {
  timeout: 10_000,
  maxWait: 5_000,
} as const;

/** Relations needed to rebuild a UserModel under the row lock. */
const USER_MODEL_INCLUDE = {
  UserUnit: true,
  UserItem: true,
  UserStructureUpgrade: true,
  UserBattleUpgrade: true,
  UserBonusPoints: true,
} as const;

type WoundedGroup = {
  type?: string;
  level?: number;
  quantity?: number;
  isMercenary?: boolean;
  woundedAt?: string;
};

type HealedUnit = {
  type: UnitType;
  level: number;
  isMercenary: boolean;
  healed: number;
};

type EraCronToken = { id: number; startDate: Date };
type UserCronOutcome = 'success' | 'stale' | 'failed';
/** Daily citizen bonuses from running game events (#86). */
type DailyEventBonuses = {
  grants: Array<{ amount: number; cutoff: Date | null }>;
  multiplier: number;
};
const NO_DAILY_EVENT_BONUSES: DailyEventBonuses = { grants: [], multiplier: 1 };

/**
 * Daily wounded-unit healing math: each group returns
 * max(1, floor(quantity * WOUNDED_HEAL_RATE_DAILY)) units (capped at quantity)
 * and keeps the remainder in the wounded pool.
 */
export const computeWoundedHealing = (
  woundedUnits: unknown,
): { healedUnits: HealedUnit[]; remaining: WoundedGroup[] } => {
  const woundedGroups: WoundedGroup[] = Array.isArray(woundedUnits)
    ? (woundedUnits as WoundedGroup[])
    : [];
  const healedUnits: HealedUnit[] = [];
  const remaining: WoundedGroup[] = [];

  for (const group of woundedGroups) {
    const quantity = Math.max(0, Math.floor(Number(group?.quantity ?? 0)));
    const type = String(group?.type ?? 'CITIZEN') as UnitType;
    const level = Math.max(1, Math.floor(Number(group?.level ?? 1)));
    const isMercenary = !!group?.isMercenary;
    if (quantity <= 0) continue;

    const healed = Math.min(
      quantity,
      Math.max(
        1,
        Math.floor(quantity * V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY),
      ),
    );
    const unhealed = quantity - healed;

    if (healed > 0) {
      healedUnits.push({ type, level, isMercenary, healed });
    }
    if (unhealed > 0) {
      remaining.push({ ...group, quantity: unhealed });
    }
  }

  return { healedUnits, remaining };
};

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
   * Rechecks the era without taking the lifecycle advisory lock. Cron already
   * holds this user's row lock; taking lifecycle here would invert reset's
   * lifecycle-then-user lock order and could deadlock.
   */
  private static async isEraTokenCurrent(
    tx: Prisma.TransactionClient,
    eraToken: EraCronToken,
  ): Promise<boolean> {
    const activeEra = await tx.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true, startDate: true },
    });
    return (
      activeEra?.id === eraToken.id &&
      new Date(activeEra.startDate).getTime() === eraToken.startDate.getTime()
    );
  }

  private static isEraParticipant(
    row: { currentEraId: number | null; last_active: Date | null },
    eraToken: EraCronToken,
  ): boolean {
    return (
      row.currentEraId === eraToken.id &&
      row.last_active !== null &&
      new Date(row.last_active).getTime() >= eraToken.startDate.getTime()
    );
  }

  /**
   * Processes daily updates for all users
   */
  static async processDailyUpdates(): Promise<CronJobResult> {
    try {
      const activeEra = await ensureActiveEra();
      const eraToken: EraCronToken = {
        id: activeEra.id,
        startDate: new Date(activeEra.startDate),
      };
      // Running game events (#86), read once so every account in this run
      // receives the same bonuses. Each flat citizen bonus only reaches
      // accounts that took a gameplay action within its activity window
      // (0 hours means every era participant qualifies).
      const { dailyCitizenGrants, dailyCitizenMultiplier } =
        await getGameEventModifiers();
      const dailyEvents: DailyEventBonuses = {
        grants: dailyCitizenGrants.map((grant) => ({
          amount: grant.amount,
          cutoff:
            grant.activityHours > 0
              ? new Date(Date.now() - grant.activityHours * 60 * 60 * 1000)
              : null,
        })),
        multiplier: dailyCitizenMultiplier,
      };
      // Only ids are read up front; every per-user write re-reads that user
      // under a row lock so concurrent player actions are never overwritten.
      const allUsers = await prisma.users.findMany({
        where: await getEraParticipantWhere(activeEra),
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      // Initialize the queue with users and attempt counts
      const queue = allUsers.map((singleUser) => ({
        userId: singleUser.id,
        healed: false,
        attempts: 0,
      }));

      let processed = 0;
      let failed = 0;

      // Process the queue
      while (queue.length > 0) {
        const currentTask = queue.shift();

        // Healing runs once per user per day (its failure is logged, not
        // retried), matching the original behaviour.
        if (!currentTask.healed) {
          currentTask.healed = true;
          const healing = await this.healWoundedUnits(
            currentTask.userId,
            eraToken,
          );
          if (healing === 'stale') continue;
        }
        const outcome = await this.updateUserPerDay(
          currentTask.userId,
          eraToken,
          dailyEvents,
        );

        if (outcome === 'stale') continue;
        if (outcome === 'success') {
          processed++;
        } else {
          currentTask.attempts += 1;
          if (currentTask.attempts < 3) {
            // Move the user to the end of the queue for another attempt
            queue.push(currentTask);
          } else {
            failed++;
            logError(
              `Failed to update user ${currentTask.userId} after 3 attempts.`,
            );
          }
        }
      }

      // Perform daily cleanup
      await this.doDailyCleanup();
      try {
        await runInactivitySweep({ dryRun: false });
      } catch {
        logError('Daily inactivity sweep failed');
      }

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
      const activeEra = await ensureActiveEra();
      const eraToken: EraCronToken = {
        id: activeEra.id,
        startDate: new Date(activeEra.startDate),
      };
      // The snapshot is only used for ranking: calculateOverallRank reads
      // experience/fort_level/house_level plus `units`/`items`, which a raw
      // users row never has (relations are UserUnit/UserItem), so only the
      // scalar columns are selected. Gold, turns, stamina and stats are
      // recomputed per user under a row lock in updateUserPerTurn.
      const allUsers = await prisma.users.findMany({
        where: await getEraParticipantWhere(activeEra),
        select: {
          id: true,
          experience: true,
          fort_level: true,
          house_level: true,
        },
      });

      const userRanks = allUsers.map((user) => ({
        id: user.id,
        rankScore: calculateOverallRank(user),
      }));

      userRanks.sort((a, b) => b.rankScore - a.rankScore);

      const queue = userRanks.map((userRank, index) => ({
        userId: userRank.id,
        rank: index + 1,
        attempts: 0,
      }));

      let processed = 0;
      let failed = 0;

      while (queue.length > 0) {
        const currentTask = queue.shift();

        const success = await this.updateUserPerTurn(
          currentTask.userId,
          currentTask.rank,
          eraToken,
        );

        if (success === 'stale') continue;
        if (success === 'success') {
          processed++;
        } else {
          currentTask.attempts += 1;
          if (currentTask.attempts < 3) {
            queue.push(currentTask);
          } else {
            failed++;
            logError(
              `Failed to update user ${currentTask.userId} after 3 attempts.`,
            );
          }
        }
      }

      // Move loan repayments diverted from this turn's income into treasuries
      // under the alliance lock (best effort; daily cleanup sweeps leftovers).
      await settleLoanTreasuryCredits();

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
   * Locks one users row for the rest of the transaction. Callers then re-read
   * the row, so every value they write is derived from committed state.
   */
  private static async lockUser(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }

  /**
   * Updates a single user for daily changes (housing growth plus any game
   * event citizen bonuses and multiplier). Runs under the user row lock;
   * citizens are added with a relative increment.
   */
  private static async updateUserPerDay(
    userId: number,
    eraToken: EraCronToken,
    dailyEvents: DailyEventBonuses = NO_DAILY_EVENT_BONUSES,
  ): Promise<UserCronOutcome> {
    try {
      return await prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        if (!(await this.isEraTokenCurrent(tx, eraToken))) return 'stale';
        const row = await tx.users.findUnique({
          where: { id: userId },
          include: {
            ...USER_MODEL_INCLUDE,
            permissions: { where: { revokedAt: null } },
          },
        });
        if (!row || !this.isEraParticipant(row, eraToken)) return 'stale';

        const currentUser = new UserModel(
          row,
          row.UserUnit,
          row.UserItem,
          row.UserStructureUpgrade,
          row.UserBattleUpgrade,
          row.UserBonusPoints,
          row.permissions.map((p) => ({ type: p })),
          row.stats,
        );

        const originalCitizens = Number(currentUser.citizens ?? 0);
        const recruitingBonus = Number(currentUser.recruitBonus ?? 0) || 0;
        const lastGameplayAt = row.last_gameplay_at
          ? new Date(row.last_gameplay_at).getTime()
          : null;
        const qualifyingGrants = dailyEvents.grants.filter(
          (grant) =>
            !grant.cutoff ||
            (lastGameplayAt !== null &&
              lastGameplayAt >= grant.cutoff.getTime()),
        );
        const appliedDailyBonus = qualifyingGrants.reduce(
          (sum, grant) => sum + grant.amount,
          0,
        );
        const grantedCitizens = multiplyCount(
          recruitingBonus + appliedDailyBonus,
          dailyEvents.multiplier,
        );
        // Every citizen an event adds (flat bonuses and the multiplier's
        // extra) raises this player's protection population limit (#89, #97);
        // the limit itself only counts housing growth and recruiting.
        const eventCitizens = Math.max(0, grantedCitizens - recruitingBonus);
        if (eventCitizens > 0) {
          await tx.users.update({
            where: { id: userId },
            data: { event_citizens_received: { increment: eventCitizens } },
          });
        }
        const newCitizens = originalCitizens + grantedCitizens;

        await tx.userUnit.upsert({
          where: {
            userId_type_level_isMercenary: {
              userId,
              type: 'CITIZEN',
              level: 1,
              isMercenary: false,
            },
          },
          update: {
            quantity: {
              increment: grantedCitizens,
            },
          },
          create: {
            userId,
            type: 'CITIZEN',
            level: 1,
            quantity: grantedCitizens,
            isMercenary: false,
          },
        });

        await tx.bank_history.create({
          data: {
            from_user_id: 0,
            to_user_id: userId,
            to_user_account_type: 'HAND',
            from_user_account_type: 'BANK',
            date_time: new Date(),
            gold_amount: 0,
            history_type: 'DAILY_RECRUIT',
            stats: {
              currentCitizens: originalCitizens,
              newCitizens,
              recruitingBonus: currentUser.recruitBonus,
              dailyCitizenBonus: appliedDailyBonus,
              ...(eventCitizens > 0 ? { eventCitizens } : {}),
              ...(dailyEvents.multiplier !== 1
                ? { eventCitizenMultiplier: dailyEvents.multiplier }
                : {}),
              lastGameplayAt: row.last_gameplay_at ?? null,
            },
          },
        });
        return 'success';
      }, CRON_USER_TX_OPTIONS);
    } catch (error) {
      logError(`Error updating user ${userId} for daily`, { error });
      return 'failed';
    }
  }

  /**
   * Heals a share of the wounded pool daily, returning recovered units to
   * active duty and persisting the remaining wounded counts. The wounded pool
   * is re-read under the user row lock, so units wounded by an attack that
   * commits while the cron runs are kept rather than overwritten.
   */
  private static async healWoundedUnits(
    userId: number,
    eraToken: EraCronToken,
  ): Promise<'continue' | 'stale'> {
    try {
      return await prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        if (!(await this.isEraTokenCurrent(tx, eraToken))) return 'stale';
        const row = await tx.users.findUnique({
          where: { id: userId },
          select: {
            wounded_units: true,
            currentEraId: true,
            last_active: true,
          },
        });
        if (!row || !this.isEraParticipant(row, eraToken)) return 'stale';

        if (!Array.isArray(row.wounded_units) || !row.wounded_units.length) {
          return 'continue';
        }

        const { healedUnits, remaining } = computeWoundedHealing(
          row.wounded_units,
        );

        for (const unit of healedUnits) {
          await tx.userUnit.upsert({
            where: {
              userId_type_level_isMercenary: {
                userId,
                type: unit.type,
                level: unit.level,
                isMercenary: unit.isMercenary,
              },
            },
            update: { quantity: { increment: unit.healed } },
            create: {
              userId,
              type: unit.type,
              level: unit.level,
              quantity: unit.healed,
              isMercenary: unit.isMercenary,
            },
          });
        }

        await tx.users.update({
          where: { id: userId },
          data: { wounded_units: remaining as Prisma.InputJsonValue },
        });
        return 'continue';
      }, CRON_USER_TX_OPTIONS);
    } catch (error) {
      logError(`Error healing wounded units for user ${userId}`, { error });
      return 'continue';
    }
  }

  /**
   * Updates a single user for turn changes. The user row is locked and
   * re-read, so income, stamina and army stats reflect anything the player did
   * since the cron's initial snapshot; gold and turns are applied as relative
   * increments.
   */
  private static async updateUserPerTurn(
    userId: number,
    rank: number,
    eraToken: EraCronToken,
  ): Promise<UserCronOutcome> {
    try {
      const { goldMultiplier, extraTurnsPerTick } =
        await getGameEventModifiers();
      return await prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        if (!(await this.isEraTokenCurrent(tx, eraToken))) return 'stale';
        const row = await tx.users.findUnique({
          where: { id: userId },
          include: USER_MODEL_INCLUDE,
        });
        if (!row || !this.isEraParticipant(row, eraToken)) return 'stale';

        const currentUser = new UserModel(row);
        const eventIncome =
          (BigInt(currentUser.goldPerTurn.toString()) *
            BigInt(Math.round(goldMultiplier * 10000))) /
          10000n;
        const room = 9223372036854775807n - BigInt(currentUser.gold);
        const grossGoldPerTurn =
          room > 0n ? (eventIncome < room ? eventIncome : room) : 0n;
        // Open alliance loans take their share of the income inside this
        // transaction; the borrower row is already locked above.
        const loanRepayment = await divertIncomeToLoans(
          tx,
          currentUser.id,
          grossGoldPerTurn,
          'economy',
        );
        const goldPerTurn = grossGoldPerTurn - loanRepayment;
        const updatedGold = goldPerTurn + BigInt(currentUser.gold);

        await tx.bank_history.create({
          data: {
            from_user_id: 0,
            to_user_id: currentUser.id,
            to_user_account_type: 'HAND',
            from_user_account_type: 'BANK',
            date_time: new Date(),
            gold_amount: goldPerTurn,
            history_type: 'ECONOMY',
            stats: {
              currentGold: currentUser.gold,
              newGold: updatedGold.toString(),
              increase: goldPerTurn,
              ...(loanRepayment > 0n
                ? { loanRepayment: loanRepayment.toString() }
                : {}),
            },
          },
        });
        await tx.users.update({
          where: { id: currentUser.id },
          data: {
            gold: { increment: goldPerTurn },
            attack_turns: { increment: 1 + extraTurnsPerTick },
            stamina: Math.min(currentUser.maxStamina, currentUser.stamina + 1),
            rank,
            offense: currentUser.offense,
            defense: currentUser.defense,
            spy: currentUser.spy,
            sentry: currentUser.sentry,
          },
        });
        return 'success';
      }, CRON_USER_TX_OPTIONS);
    } catch (error) {
      logError(`Error updating user ${userId} for turn`, { error });
      return 'failed';
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
    await pruneLoginTelemetry();
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);

    // Clean up ACL entries referencing old attack logs first to avoid foreign key violations
    await prisma.attack_log_acl.deleteMany({
      where: {
        attack_log: {
          timestamp: {
            lt: twentyDaysAgo,
          },
        },
      },
    });

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

    // Overdue alliance loans: seize from gold then bank, else mark DEFAULTED.
    try {
      await settleLoanTreasuryCredits();
      await AllianceLoanService.processOverdueLoans();
    } catch (error) {
      logError('Error processing overdue alliance loans', { error });
    }

    // Identity retention: purge blocks whose sanction end or deletion
    // cooldown has elapsed, then expired anti-abuse rows.
    await AccountAnonymizationService.purgeExpiredIdentityBlocks();
    // Idempotency keys are unique per hash, so an expired key only becomes reusable
    // once its row is deleted; they are purged here with everything else.
    await prisma.antiAbuseShadow.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }
}
