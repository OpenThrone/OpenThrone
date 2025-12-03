import prisma from '@/lib/prisma';
import { getUpdatedStatus } from '@/services/user.service';
import { UserStatsService } from './UserStatsService';
import { UserUnitsService } from './UserUnitsService';
import { safeToISOString } from '@/utils/dateHelpers';
import { stringifyObj } from '@/utils/numberFormatting';
import type {
  PlayerRace,
  PlayerClass,
  Locales,
} from '@/types/typings';
import { AccountStatus } from '@prisma/client';

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
  armySize: number;
  population: number;
  totalOffensePower: any;
  totalDefensePower: any;
}

export class UserDataService {
  /**
   * Fetches and processes all user data, returning a unified DTO.
   * @param userId The ID of the user to fetch.
   * @returns A promise that resolves to the FullUserData object or null if not found.
   */
  static async getFullUserData(userId: number): Promise<FullUserData | null> {
    // 1. Centralized Prisma Query
    const user = await prisma.users.findUnique({
      where: { id: userId },
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

    console.log(`[DEBUG] UserDataService: Units from DB for user ${userId}:`, JSON.stringify(user?.UserUnit));

    if (!user) {
      return null;
    }

    // 2. Encapsulated Business Logic
    await this.updateLastActiveIfNeeded(user);
    const currentStatus = await getUpdatedStatus(user.id);

    // Handle non-active statuses
    if (["BANNED", "SUSPENDED", "CLOSED", "TIMEOUT"].includes(currentStatus)) {
      throw new Error(`Account is in ${currentStatus.toLowerCase()} status`);
    }

    const attackStats = await this.getAttackStats(user.id, user.last_active);

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
    const unitTotals = unitsService.getUnitTotals();

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
      stats: typeof user.stats === 'string' ? JSON.parse(user.stats) : user.stats,
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
      currentStatus: currentStatus,
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
    const lastActiveDate = user.last_active ? new Date(user.last_active) : new Date(0);
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
  private static async getAttackStats(userId: number, lastActiveDate: Date | null) {
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

  /**
   * Updates the user's stamina.
   * @param userId The ID of the user to update.
   * @param stamina The new stamina value.
   * @returns A promise that resolves when the update is complete.
   */
  static async updateStamina(userId: number, stamina: number): Promise<void> {
    await prisma.users.update({
      where: { id: userId },
      data: { stamina },
    });
  }

  /**
   * Updates the user's maxStamina.
   * @param userId The ID of the user to update.
   * @param maxStamina The new maxStamina value.
   * @returns A promise that resolves when the update is complete.
   */
  static async updateMaxStamina(userId: number, maxStamina: number): Promise<void> {
    await prisma.users.update({
      where: { id: userId },
      data: { maxStamina },
    });
  }
}
