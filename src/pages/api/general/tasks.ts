import prisma from "@/lib/prisma";
import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';
import UserModel from '@/models/Users';
import { calculateOverallRank } from "@/utils/utilities";
import user from "@/pages/messaging/compose/[user]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Optional: Check for a secret token to secure this endpoint
  const token = req.headers.authorization;
  if (token !== process.env.TASK_SECRET) {
    return res.status(403).json({
      message: `Unauthorized: ${token} ${process.env.TASK_SECRET}`,
    });
  }

  const currentTime = new Date();
  const isCloseToMidnight = currentTime.getHours() === 0 && currentTime.getMinutes() < 30;

  // Start your task logic here

  // Fetch all users
  const allUsers = await prisma.users.findMany();

  // Calculate rank scores for all users
  const userRanks = allUsers.map((user) => {
    const newUser = new UserModel(user);
    const rankScore = calculateOverallRank(user);

    return {
      id: user.id,
      rankScore,
      newUser,
    };
  });

  // Sort users by rank score in descending order
  userRanks.sort((a, b) => b.rankScore - a.rankScore);

  // Assign ranks based on sorted order
  const updatePromises = userRanks.map((userRank, index) => {
    const { newUser } = userRank;
    try {

      const updatedGold = BigInt(newUser.goldPerTurn.toString()) + newUser.gold;

      // Find the CITIZEN unit
      let citizenUnit = newUser.units.find(unit => unit.type === 'CITIZEN');

      if (citizenUnit) {
        // If CITIZEN unit is found, increment its quantity
        citizenUnit.quantity += newUser.recruitingBonus;
      } else {
        // If CITIZEN unit is not found, create one and set its quantity
        citizenUnit = {
          type: 'CITIZEN',
          level: 1,
          quantity: newUser.recruitingBonus
        };
        newUser.units.push(citizenUnit);
      }

      let updateData = {
        gold: updatedGold,
        attack_turns: newUser.attackTurns + 1,
        rank: index + 1, // Assign the rank (1-based index)
      };

      if (isCloseToMidnight) {
        updateData = {
          ...updateData,
          units: newUser.units,
        };
      }

      if (!newUser.recruitingLink) {
        updateData = {
          ...updateData,
          recruit_link: md5(newUser.id.toString()),
        }
      }

      return prisma.users.update({
        where: { id: newUser.id },
        data: updateData,
      });
    } catch (error) {
      console.log(`Error updating user ${user.id}: ${error.message}`);
    }
  });

  if (isCloseToMidnight) {
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    const cleanupPromises = [
      prisma.attack_log.deleteMany({
        where: {
          timestamp: {
            lt: twentyDaysAgo,
          },
        },
      }),
      prisma.bank_history.deleteMany({
        where: {
          date_time: {
            lt: twentyDaysAgo,
          },
        },
      }),
      prisma.recruit_history.deleteMany({
        where: {
          timestamp: {
            lt: twentyDaysAgo,
          },
        },
      }),
    ];

    try {
      await Promise.all(cleanupPromises);
    } catch (error) {
      console.log(`Error cleaning up old records: ${error.message}`);
    }
  }

  try {
    await Promise.all(updatePromises);

    // Finish your task logic
    return res.status(200).json({ message: 'Tasks executed successfully' });
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Error executing tasks: ${error.message}` });
  }
}
