import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';
import { DefaultLevelBonus } from '@/constants/Bonuses';
import { BonusType } from '@/types/typings';


interface BonusPointsItem {
  type: BonusType;
  level: number;
}

// Handler function for the API route
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Ensure the request is of type POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { changeQueue } = req.body;
  const userId = req.session.user.id;
  if (!userId) {
    return res.status(403).json({ error: 'User ID is missing from session' });
  }

  try {
    // Retrieve the current user's bonus points
    const userRecord = await prisma.users.findUnique({ where: { id: userId } });
    const user = new UserModel(userRecord);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure bonus_points is initialized
    if (!user.bonus_points) {
      user.bonus_points = [];
    }

    // Calculate the total change requested
    const totalChange = Object.values(changeQueue).reduce((acc, { change }) => acc + change, 0);

    // Check if the user has enough available proficiency points
    if (Number(totalChange) > user.availableProficiencyPoints) {
      return res.status(400).json({ error: 'Not enough proficiency points available' });
    }

    // Create a lookup for user's current bonus levels
    const userBonusPoints: { [key in BonusType]?: number } = {};
    user.bonus_points.forEach((bonus: BonusPointsItem) => {
      userBonusPoints[bonus.type] = bonus.level;
    });

    // Iterate over all default bonus types to update levels
    const updatedBonusPoints: BonusPointsItem[] = DefaultLevelBonus.map((defaultBonus) => {
      const { type } = defaultBonus;
      const currentLevel = userBonusPoints[type] || 0;
      const change = changeQueue[type]?.change || 0;
      const newLevel = currentLevel + change;

      if (newLevel > 75) {
        throw new Error(`Max level reached for ${type}`);
      }

      return { type, level: newLevel };
    });

    // Update the user's bonus points in the database
    await prisma.users.update({
      where: { id: userId },
      data: { bonus_points: updatedBonusPoints },
    });

    // Return success response with updated bonus points
    return res.status(200).json({ success: true, updatedBonusPoints });
  } catch (error) {
    console.error('Error updating user bonus points:', error, userId);
    return res.status(500).json({ error: 'Internal Server Error', errorDetails: error.message });
  }
};

export default withAuth(handler);
