// pages/api/tasks.ts
import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from "@/lib/prisma";
import UserModel from '@/models/Users';


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = req.headers.authorization;
  if (token !== process.env.TASK_SECRET) {
    return res.status(403).json({
      message: `Unauthorized: Token Invalid`,
    });
  }

  const allUsers = await prisma.users.findMany();

  const updatePromises = allUsers.map((user) => {
    try {
      const newUser = new UserModel(user);
      const updateData = {
        gold: 25000,
        attack_turns: 50,
        gold_in_bank: 0,
        fort_level: 1,
        fort_hitpoints: 100,
        items: [
          {
            type: 'WEAPON',
            level: 1,
            quantity: 0,
            usage: 'DEFENSE'
          },
          {
            type: 'WEAPON',
            level: 1,
            quantity: 0,
            usage: 'OFFENSE'
          }
        ],
        structure_upgrades: [
          {
            "type": "ARMORY",
            "level": 0
          },
          {
            "type": "SPY",
            "level": 0
          },
          {
            "type": "SENTRY",
            "level": 0
          },
          {
            "type": "OFFENSE",
            "level": 0
          }
        ],
        colorScheme: newUser.colorScheme,
        economy_level: 0,
        house_level: 0,
        bonus_points: [
          {
            "type": "OFFENSE",
            "level": 0
          },
          {
            "type": "DEFENSE",
            "level": 0
          },
          {
            "type": "INCOME",
            "level": 0
          },
          {
            "type": "INTEL",
            "level": 0
          },
          {
            "type": "PRICES",
            "level": 0
          }
        ],
        units: [
          {
          type: 'CITIZEN',
          level: 1,
          quantity: 100
          },
          {
            type: 'OFFENSE',
            level: 1,
            quantity: 0
          },
          {
            type: 'DEFENSE',
            level: 1,
            quantity: 0
          }
        ],

      }

      return prisma.users.update({
        where: { id: user.id },
        data: updateData,
      });
    } catch (error) {
      console.log(`Error updating user ${user.id}: ${error.message}`)
    }

  });
  try {
    await Promise.all(updatePromises);

    return res.status(200).json({ message: 'Tasks executed successfully' });
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Error executing tasks: ${error.message}` });
  }
}
