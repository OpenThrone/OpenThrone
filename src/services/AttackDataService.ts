import type { Prisma, PrismaClient } from '@prisma/client'; // Import Prisma types
import type { Omit } from '@prisma/client/runtime/library';
import { z } from 'zod';

import { BattleUpgrades, ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import type { PlayerStat, PlayerUnit } from '@/types/typings'; // Import custom types
import { getOTStartDate } from '@/utils/timefunctions';

import { getActiveEra } from './Era.service';

// Define the type for the transaction client
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Zod schemas for validation
const UserIdSchema = z.number().int().positive();
const PlayerUnitSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  level: z.number().int().min(1),
  quantity: z.number().int().min(0),
});
const PlayerUnitArraySchema = z.array(PlayerUnitSchema);
const HitpointsSchema = z.number().int().min(0);
const StatUpdateSchema = z.object({
  type: z.string(),
  subtype: z.string(),
});
const TimeFrameSchema = z.number().int().positive();
const DaysSchema = z.number().int().min(1).default(7);

/**
 * Retrieves a user by their ID.
 * @param userId - The ID of the user to retrieve.
 * @returns The user object or null if not found.
 */
export const getUserById = async (
  userId: number,
  txClient?: TransactionClient,
) => {
  const validatedUserId = UserIdSchema.parse(userId);
  const db = txClient ?? prisma;
  return await db.users.findUnique({
    where: { id: validatedUserId },
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      permissions: true,
    },
  });
};

/**
 * Retrieves all users from the database.
 * @returns An array of all user objects.
 */
export const getAllUsers = async () => {
  return await prisma.users.findMany({
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      permissions: true,
    },
  });
};

/**
 * Retrieves the IDs of all users.
 * @returns An array of objects containing user IDs.
 */
export const getAllUserIds = async () => {
  return await prisma.users.findMany({
    select: { id: true },
  });
};

/**
 * Updates the units for a specific user within a transaction using the UserUnit table.
 * @param userId - The ID of the user to update.
 * @param units - The new units array.
 * @param txClient - The Prisma transaction client.
 */
export const updateUserUnits = async (
  userId: number,
  units: PlayerUnit[],
  txClient: TransactionClient,
) => {
  const validatedUserId = UserIdSchema.parse(userId);
  const validatedUnits = PlayerUnitArraySchema.parse(units);
  const nonMercenaryUnits = validatedUnits.filter((unit) => unit.quantity >= 0);
  const incomingUnitKeys = new Set(
    nonMercenaryUnits.map((unit) => `${unit.type}:${unit.level}`),
  );

  // Upsert delta for non-mercenary units instead of delete-and-recreate.
  for (const unit of nonMercenaryUnits) {
    if (unit.quantity <= 0) continue;

    await txClient.userUnit.upsert({
      where: {
        userId_type_level_isMercenary: {
          userId: validatedUserId,
          type: unit.type as any,
          level: unit.level,
          isMercenary: false,
        },
      },
      update: {
        quantity: unit.quantity,
      },
      create: {
        userId: validatedUserId,
        type: unit.type as any,
        level: unit.level,
        quantity: unit.quantity,
        isMercenary: false,
      },
    });
  }

  // Remove stale non-mercenary units no longer present in input.
  const existingNonMercenaryUnits = await txClient.userUnit.findMany({
    where: {
      userId: validatedUserId,
      isMercenary: false,
    },
    select: {
      id: true,
      type: true,
      level: true,
    },
  });

  const staleIds = existingNonMercenaryUnits
    .filter(
      (existing) => !incomingUnitKeys.has(`${existing.type}:${existing.level}`),
    )
    .map((existing) => existing.id);

  if (staleIds.length > 0) {
    await txClient.userUnit.deleteMany({
      where: {
        id: {
          in: staleIds,
        },
      },
    });
  }
};

/**
 * Updates the fortification hitpoints for a specific user within a transaction.
 * @param userId - The ID of the user to update.
 * @param hitpoints - The new hitpoint value.
 * @param txClient - The Prisma transaction client.
 */
export const updateFortHitpoints = async (
  userId: number,
  hitpoints: number,
  txClient: TransactionClient,
) => {
  const validatedUserId = UserIdSchema.parse(userId);
  const validatedHitpoints = HitpointsSchema.parse(hitpoints);
  await txClient.users.update({
    where: { id: validatedUserId },
    data: { fort_hitpoints: validatedHitpoints },
  });
};

/**
 * Creates a new attack log entry within a transaction.
 * @param logData - The data for the attack log entry.
 * @param txClient - The Prisma transaction client.
 * @returns The created attack log entry.
 */
export const createAttackLog = async (
  logData: Prisma.attack_logCreateInput,
  txClient: TransactionClient,
) => {
  return txClient.attack_log.create({
    data: logData,
  });
};

// Example newStat structure:
// { type: 'OFFENSE', subtype: 'TOTAL', stat: 1 } // Increments OFFENSE/TOTAL by 1
// { type: 'OFFENSE', subtype: 'WON', stat: 12 } // Increments OFFENSE/WON by 12 (Note: current implementation only increments by 1)
// { type: 'DEFENSE', subtype: 'LOST' } // Increments DEFENSE/LOST by 1 (defaults to 1 if stat not specified)
/**
 * Increments a specific user statistic within a transaction.
 * If the stat type/subtype exists, it increments the count by 1.
 * If it doesn't exist, it creates the stat with a count of 1.
 * @param userId - The ID of the user whose stats to update.
 * @param newStat - An object containing the 'type' and 'subtype' of the stat to increment.
 * @param txClient - The Prisma transaction client.
 */
export const incrementUserStats = async (
  userId: number,
  newStat: { type: string; subtype: string },
  txClient: TransactionClient,
) => {
  const validatedUserId = UserIdSchema.parse(userId);
  const validatedNewStat = StatUpdateSchema.parse(newStat);
  const user = await txClient.users.findUnique({
    where: { id: validatedUserId },
    select: {
      stats: true,
    },
  });

  if (!user) {
    throw { message: 'User not found' } as any;
  }

  // Safely handle the stats array from Prisma JSON
  let userStats: PlayerStat[] = [];
  if (Array.isArray(user.stats)) {
    // Assume the array elements *should* conform to PlayerStat,
    // but treat as 'any' temporarily for manipulation.
    // More robust validation could be added here if needed.
    userStats = user.stats as any[];
  }

  const existingStatIndex = userStats.findIndex(
    (stat) =>
      stat.type === validatedNewStat.type &&
      stat.subtype === validatedNewStat.subtype,
  );

  if (existingStatIndex >= 0) {
    // Ensure the stat property exists and is a number before incrementing
    let currentStatValue = userStats[existingStatIndex].stat;
    if (typeof currentStatValue !== 'number') {
      currentStatValue = 0;
    }
    userStats[existingStatIndex].stat = currentStatValue + 1;
  } else {
    userStats.push({
      type: newStat.type as PlayerStat['type'], // Cast to specific type
      subtype: newStat.subtype,
      stat: 1,
    });
  }

  // Update the user's stats
  await txClient.users.update({
    where: { id: userId },
    // Prisma expects JsonValue for JSON fields
    data: { stats: userStats as unknown as Prisma.InputJsonValue },
  });
};

/**
 * Updates a user's data within a transaction.
 * @param userId - The ID of the user to update.
 * @param data - An object containing the fields to update.
 * @param txClient - The Prisma transaction client.
 */
export const updateUser = async (
  userId: number,
  data: Prisma.usersUpdateInput,
  txClient: TransactionClient,
) => {
  await txClient.users.update({
    where: { id: userId },
    data,
  });
};

/**
 * Creates a new bank history entry within a transaction.
 * @param historyData - The data for the bank history entry.
 * @param txClient - The Prisma transaction client.
 */
export const createBankHistory = async (
  historyData: Prisma.bank_historyCreateInput,
  txClient: TransactionClient,
) => {
  await txClient.bank_history.create({
    data: historyData,
  });
};

/**
 * Retrieves the top 10 attacks ranked by total casualties (attacker + defender) within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds (e.g., 24 * 60 * 60 * 1000 for 24 hours).
 * @returns An array of the top 10 attacks with rank, display name (Attacker vs Defender), and total casualties.
 */
export const getTop10AttacksByTotalCasualties = async (timeFrame: number) => {
  try {
    const validatedTimeFrame = TimeFrameSchema.parse(timeFrame);
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const relations = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gt: new Date(Date.now() - validatedTimeFrame),
        },
        attackerPlayer: {
          currentEraId: activeEra.id,
        },
        defenderPlayer: {
          currentEraId: activeEra.id,
        },
      },
      include: {
        attackerPlayer: {
          select: { display_name: true },
        },
        defenderPlayer: {
          select: { display_name: true },
        },
      },
    });

    const sortedAttacks = relations
      .map((attack) => {
        // Safely access nested stats properties
        const attackerLosses = attack.stats?.attacker_losses?.total ?? 0;
        const defenderLosses = attack.stats?.defender_losses?.total ?? 0;
        return {
          rank: 0,
          display_name: `${attack.attackerPlayer?.display_name ?? 'Unknown'} vs ${attack.defenderPlayer?.display_name ?? 'Unknown'}`,
          stat: attackerLosses + defenderLosses,
        };
      })
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    return sortedAttacks.map((attack, index) => ({
      ...attack,
      rank: index + 1,
    }));
  } catch {
    return [];
  }
};

/**
 * Retrieves the top 10 attackers ranked by their total casualties inflicted within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds.
 * @returns An array of the top 10 attackers with rank, display name, and total casualties inflicted.
 */
export const getTop10TotalAttackerCasualties = async (timeFrame: number) => {
  try {
    const validatedTimeFrame = TimeFrameSchema.parse(timeFrame);
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const relations = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gt: new Date(Date.now() - validatedTimeFrame),
        },
        attackerPlayer: {
          currentEraId: activeEra.id,
        },
      },
      include: {
        attackerPlayer: {
          select: { display_name: true },
        },
      },
    });

    const attackerCasualties: {
      [key: number]: { display_name: string; stat: number };
    } = {};

    relations.forEach((attack) => {
      const losses = attack.stats?.attacker_losses?.total ?? 0;
      if (!attackerCasualties[attack.attacker_id]) {
        attackerCasualties[attack.attacker_id] = {
          display_name: attack.attackerPlayer?.display_name ?? 'Unknown',
          stat: 0,
        };
      }
      attackerCasualties[attack.attacker_id].stat += losses;
    });

    const sortedCasualties = Object.values(attackerCasualties)
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    return sortedCasualties.map((attacker, index) => ({
      rank: index + 1,
      ...attacker,
    }));
  } catch {
    return [];
  }
};

/**
 * Retrieves the top 10 defenders ranked by their total casualties suffered within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds.
 * @returns An array of the top 10 defenders with rank, display name, and total casualties suffered.
 */
export const getTop10TotalDefenderCasualties = async (timeFrame: number) => {
  try {
    const validatedTimeFrame = TimeFrameSchema.parse(timeFrame);
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const relations = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gt: new Date(Date.now() - validatedTimeFrame),
        },
        defenderPlayer: {
          currentEraId: activeEra.id,
        },
      },
      include: {
        defenderPlayer: {
          select: { display_name: true },
        },
      },
    });

    const defenderCasualties: {
      [key: number]: { display_name: string; stat: number };
    } = {};

    relations.forEach((attack) => {
      const losses = attack.stats?.defender_losses?.total ?? 0;
      if (!defenderCasualties[attack.defender_id]) {
        defenderCasualties[attack.defender_id] = {
          display_name: attack.defenderPlayer?.display_name ?? 'Unknown',
          stat: 0,
        };
      }
      defenderCasualties[attack.defender_id].stat += losses;
    });

    const sortedCasualties = Object.values(defenderCasualties)
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    return sortedCasualties.map((defender, index) => ({
      rank: index + 1,
      ...defender,
    }));
  } catch {
    return [];
  }
};

/**
 * Retrieves recruitment counts grouped by the recruiter (to_user) within a specified number of days.
 * Filters out self-recruitment records.
 * @param days - The number of past days to include in the history (default: 7).
 * @returns An array of recruitment counts with associated valid recruitment records.
 */
export async function getRecruitmentCounts(days: number = 7) {
  const validatedDays = DaysSchema.parse(days);
  const startDate = new Date(
    Number(getOTStartDate()) - validatedDays * 24 * 60 * 60 * 1000,
  ); // The start of the specified days ago
  const endDate = new Date(
    Number(getOTStartDate()) - (validatedDays - 1) * 24 * 60 * 60 * 1000,
  ); // The start of the next day

  const recruitmentCounts = await prisma.recruit_history.groupBy({
    by: ['to_user'],
    _count: {
      to_user: true,
    },
    where: {
      timestamp: {
        gte: startDate,
        lt: endDate,
      },
      from_user: { not: 0 },
      to_user: { not: 0 },
    },
    orderBy: {
      _count: {
        to_user: 'desc',
      },
    },
    take: 10,
  });

  const recruitmentCountsWithFilteredRecords = await Promise.all(
    recruitmentCounts.map(async (recruit) => {
      const validRecruitmentRecords = await prisma.recruit_history.findMany({
        where: {
          from_user: { not: recruit.to_user }, // Filter out self-recruitment
          to_user: recruit.to_user,
          timestamp: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          from_user: true,
          timestamp: true,
          to_user: true,
        },
      });

      // Return structure compatible with expected format, including the filtered records
      return {
        ...recruit,
        recruitmentRecords: validRecruitmentRecords,
        _count: {
          to_user: validRecruitmentRecords.length, // Update count based on valid records
        },
      };
    }),
  );

  return recruitmentCountsWithFilteredRecords;
}

/**
 * Retrieves the top recruiters based on valid recruitment counts from the previous day,
 * including their display names.
 * @returns A sorted array of the top recruiters with id, display_name, and recruitment count (stat).
 */
export async function getTopRecruitsWithDisplayNames() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const recruitmentCounts = await getRecruitmentCounts(1); // Get counts for the last day

    // Filter out entries with no valid recruitments
    const filteredRecruitmentCounts = recruitmentCounts.filter(
      (recruit) => recruit.recruitmentRecords.length > 0,
    );

    // Map recruitmentCounts to include user data
    const recruitsWithUser = await Promise.all(
      filteredRecruitmentCounts.map(async (recruit) => {
        const user = await prisma.users.findFirst({
          where: {
            AND: [
              { id: recruit.to_user },
              { id: { not: 0 } }, // Ensure user ID is not 0
              { currentEraId: activeEra.id },
            ],
          },
          select: {
            display_name: true,
            id: true,
          },
        });

        // Return null if user is not found or ID is 0, otherwise return the desired structure
        if (!user || user.id === 0) {
          return null;
        }

        return {
          id: user.id,
          display_name: user.display_name,
          stat: recruit._count.to_user, // Use the count of valid records
        };
      }),
    );

    // Filter out null entries and sort
    return recruitsWithUser
      .filter(
        (
          recruit,
        ): recruit is { id: number; display_name: string; stat: number } =>
          recruit !== null,
      )
      .sort((a, b) => {
        if (b.stat !== a.stat) {
          return b.stat - a.stat; // Sort by stat descending
        }
        return a.display_name.localeCompare(b.display_name); // Then by display_name ascending
      });
  } catch {
    return [];
  }
}

/**
 * Retrieves top 10 attackers based on the number of successful attacks in the last 7 days.
 * @returns An array of the top 10 attackers with id, display_name, and successful attack count (stat).
 */
export async function getTopSuccessfulAttacks() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch attacks within the last 7 days
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gte: sevenDaysAgo,
        },
        type: 'attack',
        attackerPlayer: {
          currentEraId: activeEra.id,
        },
      },
    });

    // Filter attacks where attacker is the winner
    const successfulAttacks = attacks.filter(
      (attack) => attack.winner === attack.attacker_id,
    );

    // Aggregate successful attacks by attacker_id
    const attackCounts = successfulAttacks.reduce(
      (acc: { [key: number]: number }, { attacker_id }) => {
        acc[attacker_id] = (acc[attacker_id] || 0) + 1;
        return acc;
      },
      {},
    );

    // Convert to array, sort by count, and take the top 10
    const sortedAttackers = Object.entries(attackCounts)
      .map(([attacker_id, stat]) => ({
        attacker_id: parseInt(attacker_id, 10),
        stat,
      }))
      .sort((a, b) => Number(b.stat) - Number(a.stat))
      .slice(0, 10);

    // Fetch displayName for each top attacker
    const attackerDetails = await Promise.all(
      sortedAttackers.map(async ({ attacker_id }) => {
        const user = await prisma.users.findUnique({
          where: {
            id: attacker_id,
          },
          select: {
            id: true,
            display_name: true,
          },
        });
        // Return null if user not found, otherwise return details
        return user ? { attacker_id, display_name: user.display_name } : null;
      }),
    );

    // Merge attacker details with attack counts, filtering out nulls
    const detailedAttackCounts = sortedAttackers
      .map((attacker) => {
        const detail = attackerDetails.find(
          (d) => d && d.attacker_id === attacker.attacker_id,
        );
        if (!detail) return null; // Skip if user details couldn't be found
        return {
          ...attacker,
          id: attacker.attacker_id,
          display_name: detail.display_name,
        };
      })
      .filter(
        (
          attacker,
        ): attacker is {
          attacker_id: number;
          stat: number;
          id: number;
          display_name: string;
        } => attacker !== null,
      ); // Type guard to filter out nulls

    return detailedAttackCounts;
  } catch {
    return [];
  }
}

/**
 * Retrieves the top 10 users ranked by their total population (sum of all unit quantities).
 * @returns An array of the top 10 users with id, display_name, and total population (stat).
 */
export async function getTopPopulations() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    // Fetch users and their units
    const usersWithUnits = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        UserUnit: true, // Use the new relational structure
      },
      where: {
        id: { not: 0 }, // Exclude user ID 0
        currentEraId: activeEra.id,
      },
    });

    // Calculate total units for each user
    const usersTotalUnits = usersWithUnits.map((user) => {
      // Calculate total from UserUnit relation
      const totalUnits =
        user.UserUnit?.reduce((acc, unit) => acc + (unit.quantity ?? 0), 0) ||
        0;
      return {
        id: user.id,
        display_name: user.display_name,
        stat: totalUnits,
      };
    });
    // Sort by total units in descending order and take the top 10
    const topPopulations = usersTotalUnits
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    return topPopulations;
  } catch {
    return [];
  }
}

/**
 * Retrieves the top 10 users ranked by the amount of gold they have on hand.
 * @returns An array of the top 10 users with id, display_name, and gold on hand (stat).
 */
export async function getTopGoldOnHand() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold: true,
      },
      orderBy: {
        gold: 'desc',
      },
      where: {
        id: { not: 0 }, // Exclude user ID 0
        currentEraId: activeEra.id,
      },
      take: 10,
    });

    // Map to the desired output format
    const mappedUsers = users.map((user) => ({
      id: user.id,
      display_name: user.display_name,
      stat: user.gold, // gold is already BigInt or number
    }));

    return mappedUsers;
  } catch {
    return [];
  }
}

/**
 * Retrieves the top 10 users ranked by the amount of gold they have in the bank.
 * @returns An array of the top 10 users with id, display_name, and gold in bank (stat).
 */
export async function getTopGoldInBank() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold_in_bank: true,
      },
      orderBy: {
        gold_in_bank: 'desc',
      },
      where: {
        id: { not: 0 }, // Exclude user ID 0
        currentEraId: activeEra.id,
      },
      take: 10,
    });

    // Map to the desired output format
    const mappedUsers = users.map((user) => ({
      id: user.id,
      display_name: user.display_name,
      stat: user.gold_in_bank, // gold_in_bank is already BigInt or number
    }));

    return mappedUsers;
  } catch {
    return [];
  }
}

/**
 * Calculates the total wealth (gold on hand + gold in bank + item value + battle upgrade value)
 * for all users and returns the top 10 wealthiest users.
 * @returns An array of the top 10 users ranked by wealth, including id, display_name, and total wealth (stat).
 */
// Wealth is calculated by the amount of gold a user has in bank + the amount of gold a user has in hand + the value (cost) of all the items they hold
export async function getTopWealth() {
  try {
    const activeEra = await getActiveEra();
    if (!activeEra) {
      return [];
    }

    const users = await prisma.users.findMany({
      select: {
        id: true,
        display_name: true,
        gold: true,
        UserItem: true,
        gold_in_bank: true,
        UserBattleUpgrade: true,
      },
      where: {
        id: { not: 0 }, // Exclude user ID 0
        currentEraId: activeEra.id,
      },
    });

    // Helper function to calculate the total value of items based on their cost
    const calculateItemsValue = (items: any[]): bigint => {
      return items.reduce((total, item) => {
        const itemTypeInfo = ItemTypes.find(
          (itm) =>
            itm.level === item.level &&
            item.usage === itm.usage &&
            item.type === itm.type,
        );
        if (!itemTypeInfo) return total; // If item type info not found, add 0
        // Ensure quantity and cost are numbers before calculation
        const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
        const cost =
          typeof itemTypeInfo.cost === 'number' ? itemTypeInfo.cost : 0;
        return total + BigInt(quantity * cost);
      }, BigInt(0));
    };

    // Helper function to calculate the total value of battle upgrades based on their cost
    const calculateBattleUpgradeValue = (upgrades: any[]): bigint => {
      return upgrades.reduce((total, upgrade) => {
        const battleUpgradeInfo = BattleUpgrades.find(
          (upg) => upg.level === upgrade.level && upgrade.type === upg.type,
        );
        if (!battleUpgradeInfo) return total; // If upgrade info not found, add 0
        // Ensure quantity and cost are numbers
        const quantity =
          typeof upgrade.quantity === 'number' ? upgrade.quantity : 0;
        const cost =
          typeof battleUpgradeInfo.cost === 'number'
            ? battleUpgradeInfo.cost
            : 0;
        return total + BigInt(quantity * cost);
      }, BigInt(0));
    };

    // Calculate wealth for each user
    const usersWithWealth = users.map((user) => {
      const itemsValue = calculateItemsValue(user.UserItem || []);
      const battleUpgradesValue = calculateBattleUpgradeValue(
        user.UserBattleUpgrade || [],
      );

      const wealth =
        BigInt(user.gold ?? 0) +
        BigInt(user.gold_in_bank ?? 0) +
        itemsValue +
        battleUpgradesValue;

      return {
        id: user.id,
        display_name: user.display_name,
        stat: wealth, // Total wealth as stat
      };
    });

    // Sort users by wealth in descending order
    usersWithWealth.sort((a, b) =>
      b.stat > a.stat ? 1 : b.stat < a.stat ? -1 : 0,
    );

    // Get only the top 10 users
    const top10UsersWithWealth = usersWithWealth.slice(0, 10);

    return top10UsersWithWealth;
  } catch {
    return [];
  }
}
