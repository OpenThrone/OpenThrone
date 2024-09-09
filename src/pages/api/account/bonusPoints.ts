// pages/api/account/bonusPoints.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

// Handler function for the API route
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Ensure the request is of type POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { changeQueue } = req.body;
  const userId = req.session.user.id;
  if (!userId) {
    return res.status(403).json({ error: 'User ID is missing from session' , session: session});
  }

  try {
    // Retrieve the current user's bonus points
    const user = new UserModel(await prisma.users.findUnique({ where: { id: userId } }));
    if (!user || !user.bonus_points) {
      return res.status(404).json({ error: 'User or bonus points not found' });
    }

    // Calculate the total change requested
    const totalChange = Object.values(changeQueue).reduce((acc, { change }) => acc + change, 0);

    // Check if the user has enough available proficiency points
    if (Number(totalChange) > user.availableProficiencyPoints) {
      return res.status(400).json({ error: 'Not enough proficiency points available' });
    }

    // Iterate over changeQueue to update levels
    let updatedBonusPoints = user.bonus_points.map((bonus) => {
      if (changeQueue[bonus.type]?.change > 0) {
        const newLevel = bonus.level + changeQueue[bonus.type].change;
        if (newLevel > 75) {
          throw new Error(`Max level reached for ${bonus.type}`);
        }
        return { ...bonus, level: newLevel };
      }
      return bonus;
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
}

export default withAuth(handler);