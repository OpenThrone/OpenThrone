import prisma from "@/lib/prisma";
import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';
import UserModel from '@/models/Users';

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

  // Example: Fetch all users
  const allUsers = await prisma.users.findMany();

  const updatePromises = allUsers.map((user) => {
    try {
      const newUser = new UserModel(user);
      const updatedGold = newUser.goldPerTurn + user.gold;
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
        attack_turns: user.attack_turns + 1,
      };

      if (isCloseToMidnight) {
        updateData = {
          ...updateData,
          units: newUser.units,
        };
      }

      if (!user.recruit_link) {
        updateData = {
          ...updateData,
          recruit_link: md5(user.id.toString()),
        }
      }

      return prisma.users.update({
        where: { id: user.id },
        data: updateData,
      });
    } catch (error) {
      console.log(`Error updating user ${user.id}: ${error.message}`)
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
