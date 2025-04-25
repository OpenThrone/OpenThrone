import { BattleUpgrades, ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { getOTStartDate } from '@/utils/timefunctions';
import { Prisma, PrismaClient } from '@prisma/client'; // Import Prisma types
import type { PlayerStat, PlayerUnit, PlayerItem, PlayerBattleUpgrade } from '@/types/typings'; // Import custom types

// Define the type for the transaction client
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Retrieves a user by their ID.
 * @param userId - The ID of the user to retrieve.
 * @returns The user object or null if not found.
 */
export const getUserById = async (userId: number) => {
  return await prisma.users.findUnique({
    where: { id: userId },
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
 * Updates the units JSON for a specific user within a transaction.
 * @param userId - The ID of the user to update.
 * @param units - The new units JSON array.
 * @param txClient - The Prisma transaction client.
 */
export const updateUserUnits = async (userId: number, units: PlayerUnit[], txClient: TransactionClient) => {
  await txClient.users.update({
    where: { id: userId },
    data: { units },
  });
};

/**
 * Updates the fortification hitpoints for a specific user within a transaction.
 * @param userId - The ID of the user to update.
 * @param hitpoints - The new hitpoint value.
 * @param txClient - The Prisma transaction client.
 */
export const updateFortHitpoints = async (userId: number, hitpoints: number, txClient: TransactionClient) => {
  await txClient.users.update({
    where: { id: userId },
    data: { fort_hitpoints: hitpoints },
  });
}

/**
 * Creates a new attack log entry within a transaction.
 * @param logData - The data for the attack log entry.
 * @param txClient - The Prisma transaction client.
 * @returns The created attack log entry.
 */
export const createAttackLog = async (logData: Prisma.attack_logCreateInput, txClient: TransactionClient) => {
  return await txClient.attack_log.create({
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
export const incrementUserStats = async (userId: number, newStat: { type: string, subtype: string }, txClient: TransactionClient) => {
  const user = await txClient.users.findUnique({
    where: { id: userId },
    select: {
      stats: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  throw new Error("User not found");
}

// Safely handle the stats array from Prisma JSON
let userStats: PlayerStat[] = [];
if (Array.isArray(user.stats)) {
  // Assume the array elements *should* conform to PlayerStat,
  // but treat as 'any' temporarily for manipulation.
  // More robust validation could be added here if needed.
  userStats = user.stats as any[];
}

const existingStatIndex = userStats.findIndex(stat => stat.type === newStat.type && stat.subtype === newStat.subtype);

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
  data: { stats: userStats as Prisma.InputJsonValue },
});
}

/**
 * Updates a user's data within a transaction.
 * @param userId - The ID of the user to update.
 * @param data - An object containing the fields to update.
 * @param txClient - The Prisma transaction client.
 */
export const updateUser = async (userId: number, data: Prisma.usersUpdateInput, txClient: TransactionClient) => {
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
export const createBankHistory = async (historyData: Prisma.bank_historyCreateInput, txClient: TransactionClient) => {
  await txClient.bank_history.create({
    data: historyData,
  });
};

/**
 * Checks if an attacker can attack a defender based on recent attack history (max 5 attacks in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the attack is allowed, false otherwise.
 */
export const canAttack = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'attack' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } }, // Last 24 hours
      ]
    },
  });
  return history < 5; // Allow if less than 5 attacks
};

/**
 * Checks if an attacker can assassinate a defender based on recent intel history (max 5 intel missions in 24 hours).
 * Note: This currently checks 'INTEL' type, adjust if assassination has its own type or limit.
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the assassination is allowed, false otherwise.
 */
export const canAssassinate = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INTEL' }, // Assuming assassination limit is tied to INTEL missions
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
  });
  return history < 5;
};

/**
 * Checks if an attacker can infiltrate a defender based on recent infiltration history (max 5 infiltrations in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the infiltration is allowed, false otherwise.
 */
export const canInfiltrate = async (attacker: { id: number }, defender: { id: number }) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INFILTRATE' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
  });
  return history < 5;
};

/**
 * Retrieves the top 10 attacks ranked by total casualties (attacker + defender) within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds (e.g., 24 * 60 * 60 * 1000 for 24 hours).
 * @returns An array of the top 10 attacks with rank, display name (Attacker vs Defender), and total casualties.
 */
export const getTop10AttacksByTotalCasualties = async (timeFrame: number) => {
  const relations = await prisma.attack_log.findMany({
    where: {
      timestamp: {
        gt: new Date(Date.now() - timeFrame)
      }
    },
    include: {
      attackerPlayer: {
        select: { display_name: true }
      },
      defenderPlayer: {
        select: { display_name: true }
      }
    }
  });

  const sortedAttacks = relations.map(attack => {
    // Safely access nested stats properties
    const attackerLosses = (attack.stats as any)?.attacker_losses?.total ?? 0;
    const defenderLosses = (attack.stats as any)?.defender_losses?.total ?? 0;
    return {
      rank: 0,
      display_name: `${attack.attackerPlayer?.display_name ?? 'Unknown'} vs ${attack.defenderPlayer?.display_name ?? 'Unknown'}`,
      stat: attackerLosses + defenderLosses
    };
  }).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedAttacks.map((attack, index) => ({ ...attack, rank: index + 1 }));
};


/**
 * Retrieves the top 10 attackers ranked by their total casualties inflicted within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds.
 * @returns An array of the top 10 attackers with rank, display name, and total casualties inflicted.
 */
export const getTop10TotalAttackerCasualties = async (timeFrame: number) => {
  const relations = await prisma.attack_log.findMany({
    where: {
      timestamp: {
        gt: new Date(Date.now() - timeFrame)
      }
    },
    include: {
      attackerPlayer: {
        select: { display_name: true }
      }
    }
  });

  const attackerCasualties: { [key: number]: { display_name: string, stat: number } } = {};

  relations.forEach(attack => {
    const losses = (attack.stats as any)?.attacker_losses?.total ?? 0;
    if (!attackerCasualties[attack.attacker_id]) {
      attackerCasualties[attack.attacker_id] = { display_name: attack.attackerPlayer?.display_name ?? 'Unknown', stat: 0 };
    }
    attackerCasualties[attack.attacker_id].stat += losses;
  });

  const sortedCasualties = Object.values(attackerCasualties).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedCasualties.map((attacker, index) => ({ rank: index + 1, ...attacker }));
};

/**
 * Retrieves the top 10 defenders ranked by their total casualties suffered within a given timeframe.
 * @param timeFrame - The timeframe in milliseconds.
 * @returns An array of the top 10 defenders with rank, display name, and total casualties suffered.
 */
export const getTop10TotalDefenderCasualties = async (timeFrame: number) => {
  const relations = await prisma.attack_log.findMany({
    where: {
      timestamp: {
        gt: new Date(Date.now() - timeFrame)
      }
    },
    include: {
      defenderPlayer: {
        select: { display_name: true }
      }
    }
  });

  const defenderCasualties: { [key: number]: { display_name: string, stat: number } } = {};

  relations.forEach(attack => {
    const losses = (attack.stats as any)?.defender_losses?.total ?? 0;
    if (!defenderCasualties[attack.defender_id]) {
      defenderCasualties[attack.defender_id] = { display_name: attack.defenderPlayer?.display_name ?? 'Unknown', stat: 0 };
    }
    defenderCasualties[attack.defender_id].stat += losses;
  });

  const sortedCasualties = Object.values(defenderCasualties).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedCasualties.map((defender, index) => ({ rank: index + 1, ...defender }));
};

/**
 * Retrieves recruitment counts grouped by the recruiter (to_user) within a specified number of days.
 * Filters out self-recruitment records.
 * @param days - The number of past days to include in the history (default: 7).
 * @returns An array of recruitment counts with associated valid recruitment records.
 */
export async function getRecruitmentCounts(days: number = 7) {
  const startDate = new Date(Number(getOTStartDate()) - days * 24 * 60 * 60 * 1000); // The start of the specified days ago
  const endDate = new Date(Number(getOTStartDate()) - (days - 1) * 24 * 60 * 60 * 1000); // The start of the next day

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
      to_user: { not: 0 }
    },
    orderBy: {
      _count: {
        to_user: 'desc',
      },
    },
    take: 10,
  });

  const recruitmentCountsWithFilteredRecords = await Promise.all(recruitmentCounts.map(async (recruit) => {
    const validRecruitmentRecords = await prisma.recruit_history.findMany({
      where: {
        from_user: { not: recruit.to_user }, // Filter out self-recruitment
        to_user: recruit.to_user,
        timestamp: {
          gte: startDate,
          lt: endDate
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
        to_user: validRecruitmentRecords.length // Update count based on valid records
      }
    };
  }));

  return recruitmentCountsWithFilteredRecords;
}

/**
 * Retrieves the top recruiters based on valid recruitment counts from the previous day,
 * including their display names.
 * @returns A sorted array of the top recruiters with id, display_name, and recruitment count (stat).
 */
export async function getTopRecruitsWithDisplayNames() {
  const recruitmentCounts = await getRecruitmentCounts(1); // Get counts for the last day

  // Filter out entries with no valid recruitments
  const filteredRecruitmentCounts = recruitmentCounts.filter(recruit =>
    recruit.recruitmentRecords.length > 0
  );

  // Map recruitmentCounts to include user data
  const recruitsWithUser = await Promise.all(filteredRecruitmentCounts.map(async (recruit) => {
    const user = await prisma.users.findFirst({
      where: {
        AND: [
          { id: recruit.to_user },
          { id: { not: 0 } } // Ensure user ID is not 0
        ]
      },
      select: {
        display_name: true,
        id: true
      }
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
  }));

  // Filter out null entries and sort
  return recruitsWithUser
    .filter((recruit): recruit is { id: number; display_name: string; stat: number } => recruit !== null)
    .sort((a, b) => {
      if (b.stat !== a.stat) {
        return b.stat - a.stat; // Sort by stat descending
      }
      return a.display_name.localeCompare(b.display_name); // Then by display_name ascending
    });
}

/**
 * Retrieves the top 10 attackers based on the number of successful attacks in the last 7 days.
 * @returns An array of the top 10 attackers with id, display_name, and successful attack count (stat).
 */
export async function getTopSuccessfulAttacks() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Fetch attacks within the last 7 days
  const attacks = await prisma.attack_log.findMany({
    where: {
      timestamp: {
        gte: sevenDaysAgo,
      },
      type: 'attack',
    },
  });

  // Filter attacks where attacker is the winner
  const successfulAttacks = attacks.filter(attack => attack.winner === attack.attacker_id);

  // Aggregate successful attacks by attacker_id
  const attackCounts = successfulAttacks.reduce((acc: { [key: number]: number }, { attacker_id }) => {
    acc[attacker_id] = (acc[attacker_id] || 0) + 1;
    return acc;
  }, {});

  // Convert to array, sort by count, and take the top 10
  const sortedAttackers = Object.entries(attackCounts)
    .map(([attacker_id, stat]) => ({ attacker_id: parseInt(attacker_id, 10), stat }))
    .sort((a, b) => b.stat - a.stat)
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
    })
  );

  // Merge attacker details with attack counts, filtering out nulls
  const detailedAttackCounts = sortedAttackers
    .map(attacker => {
      const detail = attackerDetails.find(d => d && d.attacker_id === attacker.attacker_id);
      if (!detail) return null; // Skip if user details couldn't be found
      return {
        ...attacker,
        id: attacker.attacker_id,
        display_name: detail.display_name,
      };
    })
    .filter((attacker): attacker is { attacker_id: number; stat: number; id: number; display_name: string } => attacker !== null); // Type guard to filter out nulls

  return detailedAttackCounts;
}

/**
 * Retrieves the top 10 users ranked by their total population (sum of all unit quantities).
 * @returns An array of the top 10 users with id, display_name, and total population (stat).
 */
export async function getTopPopulations() {
  // Fetch users and their units
  const usersWithUnits = await prisma.users.findMany({
    select: {
      id: true,
      display_name: true,
      units: true, // Assuming this is the field containing the units JSON
    },
    where: {
      id: { not: 0 }, // Exclude user ID 0
    }
  });

  // Calculate total units for each user
  const usersTotalUnits = usersWithUnits.map(user => {
    // Safely parse units and calculate total
    const unitsArray = user.units as PlayerUnit[] ?? [];
    const totalUnits = unitsArray.reduce((acc, unit) => acc + (unit.quantity ?? 0), 0);
    return {
      id: user.id,
      display_name: user.display_name,
      stat: totalUnits,
    };
  });

  // Sort by total units in descending order and take the top 10
  const topPopulations = usersTotalUnits.sort((a, b) => b.stat - a.stat).slice(0, 10);

  return topPopulations;
}

/**
 * Retrieves the top 10 users ranked by the amount of gold they have on hand.
 * @returns An array of the top 10 users with id, display_name, and gold on hand (stat).
 */
export async function getTopGoldOnHand() {
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
}

/**
 * Retrieves the top 10 users ranked by the amount of gold they have in the bank.
 * @returns An array of the top 10 users with id, display_name, and gold in bank (stat).
 */
export async function getTopGoldInBank() {
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
}

/**
 * Calculates the total wealth (gold on hand + gold in bank + item value + battle upgrade value)
 * for all users and returns the top 10 wealthiest users.
 * @returns An array of the top 10 users ranked by wealth, including id, display_name, and total wealth (stat).
 */
// Wealth is calculated by the amount of gold a user has in bank + the amount of gold a user has in hand + the value (cost) of all the items they hold
export async function getTopWealth() {
  const users = await prisma.users.findMany({
    select: {
      id: true,
      display_name: true,
      gold: true,
      items: true,
      gold_in_bank: true,
      battle_upgrades: true,
    },
    where: {
      id: { not: 0 }, // Exclude user ID 0
    },
  });

  // Helper function to calculate the total value of items based on their cost
  const calculateItemsValue = (items: PlayerItem[]): bigint => {
    return items.reduce((total, item) => {
      const itemTypeInfo = ItemTypes.find((itm) => itm.level === item.level && item.usage === itm.usage && item.type === itm.type);
      if (!itemTypeInfo) return total; // If item type info not found, add 0
      // Ensure quantity and cost are numbers before calculation
      const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
      const cost = typeof itemTypeInfo.cost === 'number' ? itemTypeInfo.cost : 0;
      return total + BigInt(quantity * cost);
    }, BigInt(0));
  };

  // Helper function to calculate the total value of battle upgrades based on their cost
  const calculateBattleUpgradeValue = (upgrades: PlayerBattleUpgrade[]): bigint => {
    return upgrades.reduce((total, upgrade) => {
      const battleUpgradeInfo = BattleUpgrades.find((upg) => upg.level === upgrade.level && upgrade.type === upg.type);
      if (!battleUpgradeInfo) return total; // If upgrade info not found, add 0
      // Ensure quantity and cost are numbers
      const quantity = typeof upgrade.quantity === 'number' ? upgrade.quantity : 0;
      const cost = typeof battleUpgradeInfo.cost === 'number' ? battleUpgradeInfo.cost : 0;
      return total + BigInt(quantity * cost);
    }, BigInt(0));
  };

  // Calculate wealth for each user
  const usersWithWealth = users.map((user) => {
    const itemsArray = user.items as PlayerItem[] ?? [];
    const upgradesArray = user.battle_upgrades as PlayerBattleUpgrade[] ?? [];

    const itemsValue = calculateItemsValue(itemsArray);
    const battleUpgradesValue = calculateBattleUpgradeValue(upgradesArray);
    const wealth = BigInt(user.gold ?? 0) + BigInt(user.gold_in_bank ?? 0) + itemsValue + battleUpgradesValue;

    return {
      id: user.id,
      display_name: user.display_name,
      stat: wealth, // Total wealth as stat
    };
  });

  // Sort users by wealth in descending order
  usersWithWealth.sort((a, b) => (b.stat > a.stat ? 1 : (b.stat < a.stat ? -1 : 0)));

  // Get only the top 10 users
  const top10UsersWithWealth = usersWithWealth.slice(0, 10);

  return top10UsersWithWealth;
}

/**
 * Handles spy missions (Intel, Assassinate, Infiltrate) between two users.
 * @param attackerId - The ID of the attacking user.
 * @param defenderId - The ID of the defending user.
 * @param spies - The number of spies sent on the mission.
 * @param type - The type of spy mission ('INTEL', 'ASSASSINATE', 'INFILTRATE').
 * @param unit - (Optional) The specific unit type targeted for assassination (UnitType or "CITIZEN_WORKERS").
 * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
 */
export async function spyHandler(attackerId: number, defenderId: number, spies: number, type: string, unit?: UnitType | "CITIZEN_WORKERS") {
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.unitTotals.spies < spies) {
    return { status: 'failed', message: 'Insufficient spies' };
  }

  let spyResults: AssassinationResult | IntelResult | InfiltrationResult;
  if (attacker.spy === 0) {
    return { status: 'failed', message: 'Insufficient Spy Offense' };
  }
  const Winner = attacker.spy > defender.sentry ? attacker : defender;
  try {
    const prismaTx = await prisma.$transaction(async (tx) => {
      if (type === 'INTEL') {
        spyResults = simulateIntel(attacker, defender, spies);

      } else if (type === 'ASSASSINATE') {
        if (attacker.units.find((u) => u.type === 'SPY' && u.level === 3) === undefined || attacker.units.find((u) => u.type === 'SPY' && u.level === 2).quantity < spies) {
          logError('Insufficient Assassins');
          return { status: 'failed', message: 'Insufficient Assassins' };
        }
        spyResults = simulateAssassination(attacker, defender, spies, unit);

        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
      } else if (type === 'INFILTRATE') {
        spyResults = simulateInfiltration(attacker, defender, spies);
        await updateUserUnits(defenderId,
          defender.units,
          tx
        );
        await updateFortHitpoints(defenderId, defender.fortHitpoints, tx);

      }
      if (spyResults.spiesLost > 0) {
        await updateUserUnits(attackerId,
          attacker.units,
          tx);
      }

      const attack_log = await createAttackLog({
        attacker_id: attackerId,
        defender_id: defenderId,
        timestamp: new Date().toISOString(),
        winner: Winner.id,
        type: type,
        // Stringify complex results for JSON storage
        stats: { spyResults: JSON.stringify(spyResults) },
        // Connect to users via relation fields instead of setting IDs directly
        attackerPlayer: { connect: { id: attackerId } },
        defenderPlayer: { connect: { id: defenderId } },
      }, tx);

      await incrementUserStats(attackerId, {
        type: 'SPY',
        subtype: (attackerId === Winner.id) ? 'WON' : 'LOST',
      }, tx);
      await incrementUserStats(defenderId, {
        type: 'SENTRY',
        subtype: (defenderId === Winner.id) ? 'WON' : 'LOST',
      }, tx);

      return {
        status: 'success',
        result: spyResults,
        attack_log: attack_log.id,
        extra_variables: {
          spies,
          spyResults,
        },
      };
    });
    return prismaTx;
  } catch (ex) {
    logError('Transaction failed: ', ex);
    return { status: 'failed', message: 'Transaction failed.' };
  }
}

/**
 * Handles standard attacks between two users.
 * @param attackerId - The ID of the attacking user.
 * @param defenderId - The ID of the defending user.
 * @param attack_turns - The number of attack turns to use.
 * @returns An object indicating the status ('success' or 'failed'), results, and attack log ID.
 */
export async function attackHandler(
  attackerId: number,
  defenderId: number,
  attack_turns: number
) {
  const attackerUser = await getUserById(attackerId);
  const defenderUser = await getUserById(defenderId);
  const attacker = new UserModel(attackerUser);
  const defender = new UserModel(defenderUser);
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.attackTurns < attack_turns) {
    return { status: 'failed', message: 'Insufficient attack turns' };
  }

  const AttackPlayer = new UserModel(attackerUser);
  const DefensePlayer = new UserModel(defenderUser);

  // Enhanced strength calculation with unit-item allocation and battle upgrades
  const { killingStrength: attackerOffenseKS, defenseStrength: attackerOffenseDS } = calculateStrength(
    AttackPlayer,
    'OFFENSE',
    false
  );

  if (attackerOffenseKS <= 0) {
    return {
      status: 'failed',
      message: 'Attack unsuccessful due to negligible offense.',
    };
  }

  if (!AttackPlayer.canAttack(DefensePlayer.level)) {
    return {
      status: 'failed',
      message: `You can only attack within ${process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE} levels of your own level.`,
    }
  }

  if (await canAttack(AttackPlayer, DefensePlayer) === false) {
    return {
      status: 'failed',
      message: 'You have attacked this player too many times in the last 24 hours.',
    }
  }

  const startOfAttack = {
    Attacker: JSON.parse(JSON.stringify(stringifyObj(AttackPlayer))),
    Defender: JSON.parse(JSON.stringify(stringifyObj(DefensePlayer))),
  };

  // Enhanced battle simulation with all factors
  const battleResults = await simulateBattle(
    AttackPlayer,
    DefensePlayer,
    DefensePlayer.fortHitpoints, // Use existing fort HP or default
    attack_turns
  );


  DefensePlayer.fortHitpoints -= (startOfAttack.Defender.fortHitpoints - battleResults.finalFortHP);

  const isAttackerWinner = battleResults.result === 'WIN';

  AttackPlayer.experience += battleResults.experienceGained.attacker;
  DefensePlayer.experience += battleResults.experienceGained.defender;

  try {
    const attack_log = await prisma.$transaction(async (tx) => {
      if (isAttackerWinner) {
        DefensePlayer.gold = BigInt(DefensePlayer.gold) - BigInt(battleResults.pillagedGold.toString());
        AttackPlayer.gold = BigInt(AttackPlayer.gold) + BigInt(battleResults.pillagedGold.toString());
      }

      const attack_log = await createAttackLog({        timestamp: new Date().toISOString(),
        winner: isAttackerWinner ? attackerId : defenderId,
        stats: {
          startOfAttack,
          endTurns: AttackPlayer.attackTurns,
          offensePointsAtEnd: attackerOffenseKS,
          defensePointsAtEnd: DefensePlayer.defense,
          // Convert BigInt to string for JSON compatibility
          pillagedGold: isAttackerWinner ? battleResults.pillagedGold.toString() : '0',
          forthpAtStart: startOfAttack.Defender.fortHitpoints,
          forthpAtEnd: Math.max(DefensePlayer.fortHitpoints, 0),
          // Stringify potentially complex objects within stats
          xpEarned: JSON.stringify(battleResults.experienceGained),
          turns: attack_turns,
          attacker_units: JSON.stringify(AttackPlayer.units),
          defender_units: JSON.stringify(DefensePlayer.units),
          attacker_losses: JSON.stringify(battleResults.Losses.Attacker),
          defender_losses: JSON.stringify(battleResults.Losses.Defender),
        },
        // Connect to users via relation fields
        attackerPlayer: { connect: { id: attackerId } },
        defenderPlayer: { connect: { id: defenderId } },
      }, tx);

      if (isAttackerWinner) {
        // Ensure gold_amount is passed as primitive bigint or number
        const goldAmount = typeof battleResults.pillagedGold === 'bigint'
            ? battleResults.pillagedGold
            : BigInt(battleResults.pillagedGold.toString()); // Convert BigInt object or number to primitive bigint
        await createBankHistory({
          gold_amount: goldAmount,
          from_user_id: defenderId,
          from_user_account_type: 'HAND',
          to_user_id: attackerId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'WAR_SPOILS',
          stats: { type: 'ATTACK', attackID: attack_log.id },
        }, tx);
      }

      await incrementUserStats(attackerId, {
        type: 'OFFENSE',
        subtype: (isAttackerWinner) ? 'WON' : 'LOST',
      }, tx);

      await incrementUserStats(defenderId, {
        type: 'DEFENSE',
        subtype: (!isAttackerWinner) ? 'WON' : 'LOST',
      }, tx);

      // Recalculate final stats for both players after casualties
      const { killingStrength: finalAttackerKS, defenseStrength: finalAttackerDS } = calculateStrength(
        AttackPlayer,
        'OFFENSE',
        false,
      );
      const newAttOffense = AttackPlayer.getArmyStat('OFFENSE')
      const newAttDefense = AttackPlayer.getArmyStat('DEFENSE')
      const newAttSpying = AttackPlayer.getArmyStat('SPY')
      const newAttSentry = AttackPlayer.getArmyStat('SENTRY')

      const { killingStrength: finalDefenderKS, defenseStrength: finalDefenderDS } = calculateStrength(
        DefensePlayer,
        'DEFENSE',
        false,
      );
      const newDefOffense = DefensePlayer.getArmyStat('OFFENSE')
      const newDefDefense = DefensePlayer.getArmyStat('DEFENSE')
      const newDefSpying = DefensePlayer.getArmyStat('SPY')
      const newDefSentry = DefensePlayer.getArmyStat('SENTRY')

      await updateUser(attackerId, {
        gold: AttackPlayer.gold,
        attack_turns: AttackPlayer.attackTurns - attack_turns,
        experience: Math.ceil(AttackPlayer.experience),
        units: AttackPlayer.units,
        offense: newAttOffense,
        defense: newAttDefense,
        spy: newAttSpying,
        sentry: newAttSentry,
      }, tx);

      await updateUser(defenderId, {
        gold: DefensePlayer.gold,
        fort_hitpoints: Math.max(DefensePlayer.fortHitpoints, 0),
        units: DefensePlayer.units,
        experience: Math.ceil(DefensePlayer.experience),
        offense: newDefOffense,
        defense: newDefDefense,
        spy: newDefSpying,
        sentry: newDefSentry,
      }, tx);

      return attack_log;
    });

    return {
      status: 'success',
      result: isAttackerWinner,
      attack_log: attack_log.id,
      extra_variables: stringifyObj({
        fortDmgTotal: startOfAttack.Defender.fortHitpoints - Math.max(DefensePlayer.fortHitpoints, 0),
        BattleResults: battleResults,
      }),
    };
  } catch (error) {
    logError('Transaction failed: ', error);
    return { status: 'failed', message: 'Transaction failed.' };
  }
}