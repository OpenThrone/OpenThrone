import type { AccountStatus } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getDepositHistory } from '@/services/Bank.service';
import { ensureActiveEra } from '@/services/Era.service';
import { getUpdatedStatus } from '@/services/User.service';
import { UserEconomyService } from '@/services/UserEconomyService';
import type {
  Locales,
  PlayerClass,
  PlayerRace,
  UserApiResponse,
} from '@/types/typings';
import { logError } from '@/utils/logger';

import {
  buildDefaultUserUpdate,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';

// Type definitions for general operations
export interface SearchUsersResult {
  id: number;
  display_name: string;
  class: string;
  race: string;
  avatar?: string;
  experience: number;
  permissions: { type: string }[];
}

export interface OnlinePlayersStats {
  allUsersCounted: number;
  onlineUsers: number;
  newUsers: number;
  newestUser: string | null;
}

export interface DisplayNameCheckResult {
  exists: boolean;
  possibleMatches: string[];
}

export interface RankBreakdown {
  // Define based on what getRankBreakdown returns
  [key: string]: any;
}

// Zod schemas for validation
const SearchUsersSchema = z.object({
  searchTerm: z.string().min(1),
});

const CheckDisplayNameSchema = z.object({
  displayName: z.string().min(1),
});

// Result interfaces
export interface GeneralOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class GeneralService {
  /**
   * Gets comprehensive user data for the current user
   */
  static async getUserData(userId: number): Promise<UserApiResponse> {
    try {
      // Select only the fields needed for the DTO and calculations, using new relational tables
      let user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          display_name: true,
          race: true,
          class: true,
          experience: true,
          gold: true,
          gold_in_bank: true,
          fort_level: true,
          fort_hitpoints: true,
          house_level: true,
          attack_turns: true,
          last_active: true,
          bio: true,
          colorScheme: true,
          economy_level: true,
          avatar: true,
          locale: true,
          stats: true,
          achievements: true,
          currentEraId: true,
          currentEra: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
            },
          },
          permissions: { select: { type: true } },
          UserUnit: true,
          UserItem: true,
          UserStructureUpgrade: true,
          UserBattleUpgrade: true,
          UserBonusPoints: true,
          alliance_memberships: {
            include: {
              alliance: {
                select: { name: true },
              },
              role: {
                select: { name: true },
              },
            },
          },
          ledAlliances: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Update last active if over 10 minutes
      const now = new Date();
      const lastActiveDate = user.last_active
        ? new Date(user.last_active)
        : new Date(0);
      const timeSinceLastActive = now.getTime() - lastActiveDate.getTime();

      if (timeSinceLastActive > 10 * 60 * 1000) {
        await prisma.users.update({
          where: { id: userId },
          data: { last_active: now },
        });
        user.last_active = now;
      }

      // Get and update user's current status
      let currentStatus = await getUpdatedStatus(user.id);
      const activeEra = await ensureActiveEra(prisma);

      const needsResetForInactive = currentStatus === 'INACTIVE';
      const needsResetForEra = user.currentEraId !== activeEra.id;

      if (needsResetForInactive || needsResetForEra) {
        await prisma.$transaction(async (tx) => {
          await resetUserRelations(tx, userId);
          await tx.users.update({
            where: { id: userId },
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
                user_id: userId,
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
          where: { id: userId },
          select: {
            id: true,
            display_name: true,
            race: true,
            class: true,
            experience: true,
            gold: true,
            gold_in_bank: true,
            fort_level: true,
            fort_hitpoints: true,
            house_level: true,
            attack_turns: true,
            last_active: true,
            bio: true,
            colorScheme: true,
            economy_level: true,
            avatar: true,
            locale: true,
            stats: true,
            achievements: true,
            currentEraId: true,
            currentEra: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
              },
            },
            permissions: { select: { type: true } },
            UserUnit: true,
            UserItem: true,
            UserStructureUpgrade: true,
            UserBattleUpgrade: true,
            UserBonusPoints: true,
            alliance_memberships: {
              include: {
                alliance: {
                  select: { name: true },
                },
                role: {
                  select: { name: true },
                },
              },
            },
            ledAlliances: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        if (!refreshedUser) {
          throw new Error('User not found');
        }

        user = refreshedUser;
      }

      // If user's status is not ACTIVE, throw error
      if (
        ['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT', 'VACATION'].includes(
          currentStatus,
        )
      ) {
        throw new Error(`Account is in ${currentStatus.toLowerCase()} status`);
      }

      // Check if the user has been attacked since last active
      const attacksSinceLastActive = await prisma.attack_log.findMany({
        where: {
          defender_id: user.id,
          timestamp: { gte: lastActiveDate },
        },
        select: {
          type: true,
          winner: true,
        },
      });

      // Calculate attack status
      const beenAttacked = attacksSinceLastActive.some(
        (attack) => attack.type === 'attack',
      );
      const detectedSpy = attacksSinceLastActive.some(
        (attack) => attack.type !== 'attack' && attack.winner === user.id,
      );

      // Count won attacks, won defends, total attacks, and total defends
      const [wonAttacks, wonDefends, totalAttacks, totalDefends] =
        await Promise.all([
          prisma.attack_log.count({
            where: { attacker_id: user.id, winner: user.id },
          }),
          prisma.attack_log.count({
            where: { defender_id: user.id, winner: user.id },
          }),
          prisma.attack_log.count({ where: { attacker_id: user.id } }),
          prisma.attack_log.count({ where: { defender_id: user.id } }),
        ]);

      const depositHistory = await getDepositHistory(userId);
      const economyService = new UserEconomyService({
        economyLevel: user.economy_level,
      });
      const maximumBankDeposits = economyService.getMaximumBankDeposits();
      const depositsAvailable = maximumBankDeposits - depositHistory.length;
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
      const nextDepositAvailable =
        depositHistory.length > 0
          ? getCountdown(depositHistory[0].date_time.toString())
          : 0;

      // Construct the DTO
      const responseDto: UserApiResponse = {
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
        UserUnit: user.UserUnit,
        UserItem: user.UserItem,
        UserStructureUpgrade: user.UserStructureUpgrade,
        UserBattleUpgrade: user.UserBattleUpgrade,
        UserBonusPoints: user.UserBonusPoints,
        last_active: (user.last_active ?? new Date(0)).toISOString(),
        bio: user.bio,
        colorScheme: user.colorScheme,
        economy_level: user.economy_level,
        avatar: user.avatar,
        locale: user.locale as Locales,
        stats:
          typeof user.stats === 'string'
            ? JSON.parse(user.stats)
            : (user.stats ?? []),
        permissions: user.permissions,
        currentEra: user.currentEra
          ? {
              id: user.currentEra.id,
              name: user.currentEra.name,
              startDate: user.currentEra.startDate.toISOString(),
              endDate: user.currentEra.endDate?.toISOString() ?? null,
            }
          : undefined,
        beenAttacked,
        detectedSpy,
        won_attacks: wonAttacks,
        won_defends: wonDefends,
        totalAttacks,
        totalDefends,
        currentStatus: currentStatus as AccountStatus | string,
        goldPerTurn: user.goldPerTurn,
        depositsAvailable,
        nextDepositAvailable,
        alliance_memberships: (user as any).alliance_memberships,
      };

      return responseDto;
    } catch (error: any) {
      logError('Error getting user data', { userId, error });
      throw error;
    }
  }

  /**
   * Searches users by display name
   */
  static async searchUsers(searchTerm: string): Promise<SearchUsersResult[]> {
    const validatedData = SearchUsersSchema.parse({ searchTerm });

    try {
      const users = await prisma.users.findMany({
        where: {
          display_name: {
            contains: validatedData.searchTerm,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          display_name: true,
          class: true,
          race: true,
          avatar: true,
          experience: true,
          permissions: true,
        },
      });

      return users;
    } catch (error: any) {
      logError('Error searching users', { searchTerm, error });
      throw error;
    }
  }

  /**
   * Gets online players statistics
   */
  static async getOnlinePlayersStats(): Promise<OnlinePlayersStats> {
    try {
      const allUsersCounted = await prisma.users.count({
        where: { NOT: { id: 0 } },
      });
      const onlineUsers = await prisma.users.count({
        where: { last_active: { gte: new Date(Date.now() - 1000 * 60 * 10) } },
      });
      const newUsers = await prisma.users.count({
        where: {
          created_at: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
        },
      });
      const newestUser = await prisma.users.findFirst({
        orderBy: { created_at: 'desc' },
      });

      return {
        allUsersCounted,
        onlineUsers,
        newUsers,
        newestUser: newestUser ? newestUser.display_name : null,
      };
    } catch (error: any) {
      logError('Error getting online players stats', { error });
      throw error;
    }
  }

  /**
   * Checks if a display name exists and returns possible matches
   */
  static async checkDisplayName(
    displayName: string,
  ): Promise<DisplayNameCheckResult> {
    const validatedData = CheckDisplayNameSchema.parse({ displayName });

    try {
      const users = await prisma.users.findMany({
        where: {
          display_name: {
            contains: validatedData.displayName,
            mode: 'insensitive',
          },
        },
        select: {
          display_name: true,
        },
      });

      const displayNames = users.map((user) => user.display_name);
      return {
        exists: displayNames.length > 0,
        possibleMatches: displayNames,
      };
    } catch (error: any) {
      logError('Error checking display name', { displayName, error });
      throw error;
    }
  }

  /**
   * Gets user info by recruit link
   */
  static async getUserInfoByRecruitLink(recruitLink: string): Promise<any> {
    try {
      const user = await prisma.users.findFirst({
        where: { recruit_link: recruitLink },
        select: {
          id: true,
          display_name: true,
          race: true,
          class: true,
          experience: true,
          avatar: true,
        },
      });

      return user;
    } catch (error: any) {
      logError('Error getting user info by recruit link', {
        recruitLink,
        error,
      });
      throw error;
    }
  }

  /**
   * Compares top players
   */
  static async compareTop(): Promise<any> {
    try {
      // Implement top comparison logic
      const topPlayers = await prisma.users.findMany({
        orderBy: { experience: 'desc' },
        take: 10,
        select: {
          id: true,
          display_name: true,
          experience: true,
          race: true,
          class: true,
        },
      });

      return topPlayers;
    } catch (error: any) {
      logError('Error comparing top players', { error });
      throw error;
    }
  }

  /**
   * Gets user stats by ID
   */
  static async getUserStats(userId: number): Promise<any> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          display_name: true,
          experience: true,
          stats: true,
        },
      });

      return user;
    } catch (error: any) {
      logError('Error getting user stats', { userId, error });
      throw error;
    }
  }

  /**
   * Resets the game (admin only)
   */
  static async resetGame(): Promise<GeneralOperationResult> {
    try {
      // Implement game reset logic - this would be dangerous, so placeholder
      return {
        success: false,
        message: 'Game reset not implemented',
      };
    } catch (error: any) {
      logError('Error resetting game', { error });
      throw error;
    }
  }

  /**
   * Gets user breakdown by ID
   */
  static async getUserBreakdown(userId: number): Promise<any> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          display_name: true,
          experience: true,
          fort_level: true,
          UserUnit: true,
          UserItem: true,
          UserStructureUpgrade: true,
          UserBattleUpgrade: true,
          UserBonusPoints: true,
        },
      });

      return user;
    } catch (error: any) {
      logError('Error getting user breakdown', { userId, error });
      throw error;
    }
  }

  /**
   * Logs an audit action
   */
  static async logAuditAction(
    userId: number,
    action: string,
    ip: string,
    details: any = {},
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          ip,
          details,
        },
      });
    } catch (error: any) {
      logError('Failed to log audit action', {
        userId,
        action,
        ip,
        details,
        error,
      });
    }
  }

  /**
   * Gets rank breakdown
   */
  static async getRankBreakdown(): Promise<RankBreakdown> {
    try {
      // Implement rank breakdown logic
      const ranks = await prisma.users.groupBy({
        by: ['experience'],
        _count: { id: true },
        orderBy: { experience: 'desc' },
      });

      return ranks;
    } catch (error: any) {
      logError('Error getting rank breakdown', { error });
      throw error;
    }
  }
}

export default GeneralService;
