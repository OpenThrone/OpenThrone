import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { getOTStartDate } from '@/utils/timefunctions';

export const getUserById = async (userId) => {
  return await prisma.users.findUnique({
    where: { id: userId },
  });
};

export const getAllUserIds = async () => {
  return await prisma.users.findMany({
    select: { id: true },
  });
};

export const updateUserUnits = async (userId, units) => {
  await prisma.users.update({
    where: { id: userId },
    data: { units },
  });
};

export const updateFortHitpoints = async (userId, hitpoints) => {
  await prisma.users.update({
    where: { id: userId },
    data: { fort_hitpoints: hitpoints },
  });
}

export const createAttackLog = async (logData) => {
  return await prisma.attack_log.create({
    data: logData,
  });
};

// { type: 'OFFENSE', subtype: 'TOTAL', stat: 1 } +1
// { type: 'OFFENSE', subtype: 'WON', stat: 12 } +12
// { type: 'DEFENSE', subtype: 'LOST' } +1 (defaults to 1 if not specified)
export const incrementUserStats = async (userId, newStat) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      stats: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Initialize stats if none exist
  if (!user.stats) {
    user.stats = [];
  }

  // Check if the stat type and subtype already exists
  const existingStatIndex = user.stats.findIndex(stat => stat.type === newStat.type && stat.subtype === newStat.subtype);

  if (existingStatIndex >= 0) {
    if (user.stats[existingStatIndex].stat === null) {
      // Temporary detection of a broken state from when we were accidentally setting
      // stats to null - reset these to 0.
      user.stats[existingStatIndex].stat = 0;
    }
    // Stat already exists, increment it
    user.stats[existingStatIndex].stat += newStat.stat || 1;
  } else {
    // Stat does not exist, initialize it with the new stat value
    user.stats.push({
      type: newStat.type,
      subtype: newStat.subtype,
      stat: newStat.stat || 1,
    });
  }

  // Update the user's stats
  await prisma.users.update({
    where: { id: userId },
    data: { stats: user.stats },
  });
}


export const updateUser = async (userId, data) => {
  await prisma.users.update({
    where: { id: userId },
    data,
  });
};

export const createBankHistory = async (historyData) => {
  await prisma.bank_history.create({
    data: historyData,
  });
};

export const canAttack = async (attacker, defender) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'attack' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  if (history >= 5) return false;
  return true;
};

export const canAssassinate = async (attacker, defender) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INTEL' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  if (history >= 5) return false;
  return true;
};

export const canInfiltrate = async (attacker, defender) => {
  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: attacker.id },
        { defender_id: defender.id },
        { type: 'INFILTRATE' },
        { timestamp: { gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24) } },
      ]
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  if (history >= 5) return false;
  return true;
};

export const getTop10AttacksByTotalCasualties = async (timeFrame) => {
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

  const sortedAttacks = relations.map(attack => ({
    rank: 0,
    display_name: attack.attackerPlayer.display_name + " vs " + attack.defenderPlayer.display_name,
    stat: (attack.stats.attacker_losses?.total || 0) + (attack.stats.defender_losses?.total || 0)
  })).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedAttacks.map((attack, index) => ({ ...attack, rank: index + 1 }));
};


export const getTop10TotalAttackerCasualties = async (timeFrame) => {
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

  const attackerCasualties = {};

  relations.forEach(attack => {
    const losses = attack.stats.attacker_losses?.total || 0;
    if (!attackerCasualties[attack.attacker_id]) {
      attackerCasualties[attack.attacker_id] = { display_name: attack.attackerPlayer.display_name, stat: 0 };
    }
    attackerCasualties[attack.attacker_id].stat += losses;
  });

  const sortedCasualties = Object.values(attackerCasualties).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedCasualties.map((attacker, index) => ({ rank: index + 1, ...attacker }));
};

export const getTop10TotalDefenderCasualties = async (timeFrame) => {
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

  const defenderCasualties = {};

  relations.forEach(attack => {
    const losses = attack.stats.defender_losses?.total || 0;
    if (!defenderCasualties[attack.defender_id]) {
      defenderCasualties[attack.defender_id] = { display_name: attack.defenderPlayer.display_name, stat: 0 };
    }
    defenderCasualties[attack.defender_id].stat += losses;
  });

  const sortedCasualties = Object.values(defenderCasualties).sort((a, b) => b.stat - a.stat).slice(0, 10);

  return sortedCasualties.map((defender, index) => ({ rank: index + 1, ...defender }));
};

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
        gte: startDate, // Greater than or equal to the start of the specified days ago
        lt: endDate,   // Less than the start of the next day
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
        from_user: { not: recruit.to_user },
        to_user: recruit.to_user,
        timestamp: {
          gte: startDate,
          lt: endDate },
      },
      select: {
        from_user: true,
        timestamp: true,
        to_user: true,
      },
    });

    recruit.recruitmentRecords = validRecruitmentRecords;
    recruit._count.to_user = validRecruitmentRecords.length; // update count based on valid records

    return recruit;
  }));

  return recruitmentCountsWithFilteredRecords;
}

export async function getTopRecruitsWithDisplayNames() {
  const recruitmentCounts = await getRecruitmentCounts(1);

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
          { id: { not: 0 } }
        ]
      },
      select: {
        display_name: true,
        id: true
      }
    });

    return {
      id: user ? user.id : 0,
      display_name: user ? user.display_name : 'Unknown',
      stat: recruit._count.to_user,
    };
  }));

  return recruitsWithUser
    .filter(recruit => recruit !== null)
    .sort((a, b) => {
      if (b.stat !== a.stat) {
        return b.stat - a.stat; // Sort by stat in descending order
      }
      return a.display_name.localeCompare(b.display_name); // Sort by display_name in ascending order
    });
}

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
  const attackCounts = successfulAttacks.reduce((acc, { attacker_id }) => {
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
      return user ? { attacker_id, display_name: user.display_name } : null;
    })
  );

  // Merge attacker details with attack counts
  const detailedAttackCounts = sortedAttackers.map(attacker => ({
    ...attacker,
    id: attacker.attacker_id,
    display_name: attackerDetails.find(detail => detail && detail.attacker_id === attacker.attacker_id)?.display_name || 'Unknown',
  }));

  return detailedAttackCounts;
}

export async function getTopPopulations() {
  // Fetch users and their units
  const usersWithUnits = await prisma.users.findMany({
    select: {
      id: true,
      display_name: true,
      units: true, // Assuming this is the field containing the units JSON
    },
    where: {
      id: { not: 0 },
    }
  });

  // Calculate total units for each user
  const usersTotalUnits = usersWithUnits.map(user => {
    // Parse the units JSON and sum the quantities
    const totalUnits = user.units.reduce((acc, unit) => acc + unit.quantity, 0);
    return {
      ...user,
      stat: totalUnits,
    };
  });

  // Sort by total units in descending order and take the top 10
  const topPopulations = usersTotalUnits.sort((a, b) => b.stat - a.stat).slice(0, 10);

  return topPopulations;
}

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
      id: { not: 0 },
    },
    take: 10,
  });

  const mappedUsers = users.map((user) => {
    return {
      ...user,
      stat: user.gold,
    }
  })

  return mappedUsers;
}

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
      id: { not: 0 },
    },
    take: 10,
  });

  const mappedUsers = users.map((user) => {
    return {
      ...user,
      stat: user.gold_in_bank,
    }
  })

  return mappedUsers;
}

// Wealth is calculated by the amount of gold a user has in bank + the amount of gold a user has in hand + the value (cost) of all the items they hold
export async function getTopWealth() {
  const users = await prisma.users.findMany({
    select: {
      id: true,
      display_name: true,
      gold: true,
      items: true,
      gold_in_bank: true,
    },
    where: {
      id: { not: 0 },
    },
  });

  const calculateItemsValue = (items) => {
    return items.reduce((total, item) => {
      return total + (item.quantity * ItemTypes.find((itm) => itm.level === item.level && item.usage === itm.usage && item.type === itm.type).cost); // Assuming the value is quantity * level
    }, 0);
  };

  const usersWithWealth = users.map((user) => {
    const itemsValue = user.items ? calculateItemsValue(user.items) : 0;
    const wealth = user.gold + user.gold_in_bank + BigInt(itemsValue);

    return {
      ...user,
      itemsValue,
      stat: wealth,
    };
  })

  // Sort users by wealth in descending order
  usersWithWealth.sort((a, b) => (b.stat > a.stat ? 1 : (b.stat < a.stat ? -1 : 0)));

  // Get only the top 10 users
  const top10UsersWithWealth = usersWithWealth.slice(0, 10);

  return top10UsersWithWealth;
}
