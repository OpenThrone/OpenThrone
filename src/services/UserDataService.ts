import type { AccountStatus } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getDepositHistory } from '@/services/Bank.service';
import { ensureActiveEra } from '@/services/Era.service';
import { getUpdatedStatus } from '@/services/User.service';
import type { Locales, PlayerClass, PlayerRace } from '@/types/typings';
import { safeToISOString } from '@/utils/dateHelpers';
import { logDebug } from '@/utils/logger';

import {
  buildDefaultUserUpdate,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';
import { UserEconomyService } from './UserEconomyService';
import { UserStatsService } from './UserStatsService';
import { UserUnitsService } from './UserUnitsService';

export interface FullUserData {
  id: number;
  display_name: string;
  race: PlayerRace;
  class: PlayerClass;
  experience: number;
  gold: string;
  gold_in_bank: string;
  fort_level: number;
  fort_hitpoints: number;
  house_level: number;
  attack_turns: number;
  stamina: number;
  maxStamina: number;
  last_active: string;
  bio: string | null;
  colorScheme: string | null;
  economy_level: number;
  avatar: string | null;
  locale: Locales;
  stats: any;
  permissions: any;
  currentEra?: {
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
  };
  UserUnit: any[];
  UserItem: any[];
  UserStructureUpgrade: any[];
  UserBattleUpgrade: any[];
  UserBonusPoints: any[];
  beenAttacked: boolean;
  detectedSpy: boolean;
  won_attacks: number;
  won_defends: number;
  totalAttacks: number;
  totalDefends: number;
  currentStatus: AccountStatus | string;
  depositsAvailable: number;
  nextDepositAvailable: { hours: number; minutes: number; seconds: number } | 0;
  armySize: number;
  population: number;
  totalOffensePower: any;
  totalDefensePower: any;
}

const UserIdSchema = z.number().int().positive();

export class UserDataService {
  /**
   * Fetches and processes all user data, returning a unified DTO.
   * @param userId The ID of the user to fetch.
   * @returns A promise that resolves to the FullUserData object or null if not found.
   */
  static async getFullUserData(userId: number): Promise<FullUserData | null> {
    const validatedUserId = UserIdSchema.parse(userId);
    // 1. Centralized Prisma Query
    let user = await prisma.users.findUnique({
      where: { id: validatedUserId },
      include: {
        UserUnit: true,
        UserItem: true,
        UserStructureUpgrade: true,
        UserBattleUpgrade: true,
        UserBonusPoints: true,
        permissions: true,
        currentEra: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    logDebug(
      `[DEBUG] UserDataService: Units from DB for user ${userId}:`,
      JSON.stringify(user?.UserUnit),
    );

    if (!user) {
      return null;
    }

    // 2. Encapsulated Business Logic
    await this.updateLastActiveIfNeeded(user);
    let currentStatus = await getUpdatedStatus(user.id);
    const activeEra = await ensureActiveEra(prisma);

    const needsResetForInactive = currentStatus === 'INACTIVE';
    const needsResetForEra = user.currentEraId !== activeEra.id;

    if (needsResetForInactive || needsResetForEra) {
      await prisma.$transaction(async (tx) => {
        await resetUserRelations(tx, user.id);
        await tx.users.update({
          where: { id: user.id },
          data: {
            ...buildDefaultUserUpdate(),
            currentEraId: activeEra.id,
            achievements: user.achievements ?? {},
            colorScheme: resolveColorScheme(user.colorScheme, user.race),
          },
        });

        if (needsResetForInactive) {
          await tx.accountStatusHistory.create({
            data: {
              user_id: user.id,
              status: 'ACTIVE',
              start_date: new Date(),
              reason: 'User returned from inactive, resetting account',
            },
          });
        }
      });

      if (needsResetForInactive) {
        currentStatus = 'ACTIVE';
      }

      const refreshedUser = await prisma.users.findUnique({
        where: { id: user.id },
        include: {
          UserUnit: true,
          UserItem: true,
          UserStructureUpgrade: true,
          UserBattleUpgrade: true,
          UserBonusPoints: true,
          permissions: true,
          currentEra: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      });

      if (!refreshedUser) {
        return null;
      }

      user = refreshedUser;
    }

    // Handle non-active statuses
    if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT'].includes(currentStatus)) {
      throw new Error(`Account is in ${currentStatus.toLowerCase()} status`);
    }

    const [attackStats, depositHistory] = await Promise.all([
      this.getAttackStats(user.id, user.last_active),
      getDepositHistory(user.id),
    ]);

    const economyService = new UserEconomyService({
      economyLevel: user.economy_level,
    });
    const maximumBankDeposits = economyService.getMaximumBankDeposits();
    const depositsAvailable = maximumBankDeposits - depositHistory.length;
    const nextDepositAvailable =
      depositHistory.length > 0
        ? this.getDepositCountdown(depositHistory[0].date_time.toString())
        : 0;

    // 3. Rich Data Composition using other services
    const statsService = new UserStatsService({
      experience: user.experience,
      units: user.UserUnit,
      items: user.UserItem,
      bonus_points: user.UserBonusPoints,
      structure_upgrades: user.UserStructureUpgrade,
      battle_upgrades: user.UserBattleUpgrade,
      fortLevel: user.fort_level,
      fortHitpoints: user.fort_hitpoints,
      race: user.race,
      class: user.class,
    });

    const unitsService = new UserUnitsService({
      units: user.UserUnit,
      items: user.UserItem,
      fortLevel: user.fort_level,
      structure_upgrades: user.UserStructureUpgrade,
    });

    const calculatedStats = statsService.updateStats();

    // 4. Unified DTO Construction
    const userDto: FullUserData = {
      id: user.id,
      display_name: user.display_name,
      race: user.race as PlayerRace,
      class: user.class as PlayerClass,
      experience: user.experience,
      gold: user.gold.toString(),
      gold_in_bank: user.gold_in_bank.toString(),
      fort_level: user.fort_level,
      fort_hitpoints: user.fort_hitpoints,
      house_level: user.house_level,
      attack_turns: user.attack_turns,
      stamina: user.stamina,
      maxStamina: user.maxStamina,
      last_active: safeToISOString(user.last_active),
      bio: user.bio,
      colorScheme: user.colorScheme,
      economy_level: user.economy_level,
      avatar: user.avatar,
      locale: user.locale as Locales,
      stats:
        typeof user.stats === 'string' ? JSON.parse(user.stats) : user.stats,
      permissions: user.permissions,
      currentEra: user.currentEra
        ? {
            id: user.currentEra.id,
            name: user.currentEra.name,
            startDate: safeToISOString(user.currentEra.startDate),
            endDate: safeToISOString(user.currentEra.endDate),
          }
        : undefined,
      UserUnit: user.UserUnit,
      UserItem: user.UserItem,
      UserStructureUpgrade: user.UserStructureUpgrade,
      UserBattleUpgrade: user.UserBattleUpgrade,
      UserBonusPoints: user.UserBonusPoints,
      beenAttacked: attackStats.beenAttacked,
      detectedSpy: attackStats.detectedSpy,
      won_attacks: attackStats.wonAttacks,
      won_defends: attackStats.wonDefends,
      totalAttacks: attackStats.totalAttacks,
      totalDefends: attackStats.totalDefends,
      currentStatus,
      depositsAvailable,
      nextDepositAvailable,
      armySize: unitsService.getArmySize(),
      population: unitsService.getPopulation(),
      totalOffensePower: calculatedStats.offense.totalStats,
      totalDefensePower: calculatedStats.defense.totalStats,
    };

    return userDto;
  }

  /**
   * Updates the user's last_active timestamp if they've been inactive for more than 10 minutes.
   * @param user The user object to potentially update.
   */
  private static async updateLastActiveIfNeeded(user: any): Promise<void> {
    const now = new Date();
    const lastActiveDate = user.last_active
      ? new Date(user.last_active)
      : new Date(0);
    const timeSinceLastActive = now.getTime() - lastActiveDate.getTime();

    if (timeSinceLastActive > 10 * 60 * 1000) {
      await prisma.users.update({
        where: { id: user.id },
        data: { last_active: now },
      });
      user.last_active = now; // Update in-memory object for consistency
    }
  }

  /**
   * Calculates attack-related statistics for the user.
   * @param userId The user's ID.
   * @param lastActiveDate The user's last active timestamp.
   * @returns An object with attack statistics.
   */
  private static async getAttackStats(
    userId: number,
    lastActiveDate: Date | null,
  ) {
    let ts = lastActiveDate ? new Date(lastActiveDate) : new Date(0);
    if (isNaN(ts.getTime())) {
      ts = new Date(0);
    }

    const attacksSinceLastActive = await prisma.attack_log.findMany({
      where: {
        defender_id: userId,
        timestamp: { gte: ts },
      },
      select: {
        type: true,
        winner: true,
      },
    });

    const beenAttacked = attacksSinceLastActive.some(
      (attack) => attack.type === 'attack',
    );
    const detectedSpy = attacksSinceLastActive.some(
      (attack) => attack.type !== 'attack' && attack.winner === userId,
    );

    const [wonAttacks, wonDefends, totalAttacks, totalDefends] =
      await Promise.all([
        prisma.attack_log.count({
          where: { attacker_id: userId, winner: userId },
        }),
        prisma.attack_log.count({
          where: { defender_id: userId, winner: userId },
        }),
        prisma.attack_log.count({ where: { attacker_id: userId } }),
        prisma.attack_log.count({ where: { defender_id: userId } }),
      ]);

    return {
      beenAttacked,
      detectedSpy,
      wonAttacks,
      wonDefends,
      totalAttacks,
      totalDefends,
    };
  }

  private static getDepositCountdown(timestamp: string) {
    const targetDate = new Date(timestamp);
    targetDate.setHours(targetDate.getHours() + 24);
    const currentDate = new Date();
    const timeDiff = targetDate.getTime() - currentDate.getTime();

    if (timeDiff > 0) {
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
      return { hours, minutes, seconds };
    }

    return { hours: 0, minutes: 0, seconds: 0 };
  }

  /**
   * Updates the user's stamina.
   * @param userId The ID of the user to update.
   * @param stamina The new stamina value.
   * @returns A promise that resolves when the update is complete.
   */
  static async updateStamina(userId: number, stamina: number): Promise<void> {
    const validatedUserId = UserIdSchema.parse(userId);
    await prisma.users.update({
      where: { id: validatedUserId },
      data: { stamina },
    });
  }

  /**
   * Updates the user's maxStamina.
   * @param userId The ID of the user to update.
   * @param maxStamina The new maxStamina value.
   * @returns A promise that resolves when the update is complete.
   */
  static async updateMaxStamina(
    userId: number,
    maxStamina: number,
  ): Promise<void> {
    const validatedUserId = UserIdSchema.parse(userId);
    await prisma.users.update({
      where: { id: validatedUserId },
      data: { maxStamina },
    });
  }
}
