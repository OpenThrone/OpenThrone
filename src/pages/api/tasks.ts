// pages/api/tasks.ts
import { PrismaClient } from '@prisma/client';
import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';

import UserModel from '@/models/Users';

const prisma = new PrismaClient();

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

  try {
    // Start your task logic here

    // Example: Fetch all users
    const allUsers = await prisma.users.findMany();

    const updatePromises = allUsers.map((user) => {
      const newUser = new UserModel(user);
      const updatedGold = newUser.goldPerTurn + user.gold;
      return prisma.users.update({
        where: { id: user.id },
        data: {
          gold: updatedGold,
          recruit_link: md5(user.id.toString()),
        },
      });
    });

    await Promise.all(updatePromises);

    // Finish your task logic

    return res.status(200).json({ message: 'Tasks executed successfully' });
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Error executing tasks: ${error.message}` });
  }
}
