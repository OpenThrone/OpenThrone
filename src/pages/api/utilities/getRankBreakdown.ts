import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../auth/[...nextauth]';
import { ItemTypes, UnitTypes } from '@/constants';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const calculateUserScoreNEW = (user) => {
    const sortedItems = JSON.parse(JSON.stringify(user.items.sort((a, b) => b.level - a.level)));
    const sortedUnits = JSON.parse(JSON.stringify(user.units.sort((a, b) => b.level - a.level)));

    let totalStat = 0;
    sortedUnits.forEach((unit) => {
      const unitFiltered = UnitTypes.find((unitType) => unitType.type === unit.type && unitType.level === unit.level);
      if (unitFiltered === undefined) return 0;
      totalStat += (unitFiltered?.bonus || 0) * unit.quantity;

      const itemCounts = {};
      sortedItems.forEach((item) => {
        itemCounts[item.type] = itemCounts[item.type] || 0;
        const weaponBonus = ItemTypes.find((w) => w.level === item.level && w.usage === unit.type && w.type === item.type)?.bonus || 0;
        const usableQuantity = Math.min(item.quantity, unit.quantity - itemCounts[item.type]);
        totalStat += weaponBonus * usableQuantity;
        item.quantity -= usableQuantity;
        itemCounts[item.type] += usableQuantity;
      });
    });

    const unitScore = totalStat; // Adjusted unit score
    const itemScore = user.items
      ? user.items.map((item) => (ItemTypes.find(i => i.level === item.level && i.type === item.type)?.bonus || 0) * item.quantity).reduce((a, b) => a + b, 0)
      : 0;

    const userScore = 0.7 * user.experience +
      0.2 * user.fort_level +
      0.1 * user.house_level +
      0.4 * unitScore +
      0.3 * itemScore;

    return {
      id: user.id,
      display_name: user.display_name,
      experienceWeight: 0.7 * user.experience,
      fortLevelWeight: 0.2 * user.fort_level,
      houseLevelWeight: 0.1 * user.house_level,
      unitScoreWeight: 0.4 * unitScore,
      itemScoreWeight: 0.3 * itemScore,
      userScore
    };
  };

  const calculateUserScore = (user) => {
    const unitScore = user.units
      ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0)
      : 0;
    const itemScore = user.items
      ? user.items.map((item) => item.quantity * (item.level * 0.1)).reduce((a, b) => a + b, 0)
      : 0;

    const userScore = 0.7 * user.experience +
      0.2 * user.fort_level +
      0.1 * user.house_level +
      0.4 * unitScore +
      0.3 * itemScore;

    return {
      id: user.id,
      display_name: user.display_name,
      experienceWeight: 0.7 * user.experience,
      fortLevelWeight: 0.2 * user.fort_level,
      houseLevelWeight: 0.1 * user.house_level,
      unitScoreWeight: 0.4 * unitScore,
      itemScoreWeight: 0.3 * itemScore,
      userScore
    };
  };

  let users = await prisma.users.findMany({
    select: {
      units: true,
      id: true,
      display_name: true,
      items: true,
      house_level: true,
      fort_level: true,
      experience: true,
    },
    where: {
      NOT: [{ id: { in: [0] } }],
    },
  });

  const usersWithOldScores = users.map(user => calculateUserScore(user));
  const usersWithNewScores = users.map(user => calculateUserScoreNEW(user));

  usersWithOldScores.sort((a, b) => b.userScore - a.userScore);
  usersWithNewScores.sort((a, b) => b.userScore - a.userScore);

  // Add rank to each user
  usersWithOldScores.forEach((user, index) => {
    user.Oldrank = index + 1;
  });

  usersWithNewScores.forEach((user, index) => {
    user.Newrank = index + 1;
  });

  // Combine both scores into the desired format
  const combinedUsers = users.map((user, index) => {
    const oldUserScore = usersWithOldScores.find(u => u.id === user.id);
    const newUserScore = usersWithNewScores.find(u => u.id === user.id);

    return {
      id: user.id,
      display_name: user.display_name,
      experienceWeight: oldUserScore.experienceWeight,
      fortLevelWeight: oldUserScore.fortLevelWeight,
      houseLevelWeight: oldUserScore.houseLevelWeight,
      oldunitScoreWeight: oldUserScore.unitScoreWeight,
      newUnitScoreWeight: newUserScore.unitScoreWeight,
      olditemScoreWeight: oldUserScore.itemScoreWeight,
      newitemScoreWeight: newUserScore.itemScoreWeight,
      olduserScore: oldUserScore.userScore,
      newUserScore: newUserScore.userScore,
      oldrank: oldUserScore.Oldrank,
      newRank: newUserScore.Newrank
    };
  });


  // Sort combined users by oldrank
  combinedUsers.sort((a, b) => a.oldrank - b.oldrank);

  return res.status(200).json({ users: combinedUsers });
}
