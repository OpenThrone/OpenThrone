// pages/api/update-bonus-points.js
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

  // Retrieve the type to update and user ID from the request body
  const { typeToUpdate } = req.body;
  
  const userId = req.session.user?.id; // Make sure your session object has the correct structure
  if (!userId) {
    return res.status(403).json({ error: 'User ID is missing from session' , session: session});
  }

  try {
    // Retrieve the current user's bonus points
    const user = new UserModel(await prisma.users.findUnique({ where: { id: userId } }));
    if (!user || !user.bonus_points) {
      return res.status(404).json({ error: 'User or bonus points not found' });
    }

    if (user.usedProficiencyPoints >= user.level) {
      return res.status(404).json({ error: 'Not enough proficiency points' });
    }

    // Define the template for required bonus points
    const requiredBonusPoints = [
      { type: "OFFENSE", level: 0 },
      { type: "DEFENSE", level: 0 },
      { type: "INCOME", level: 0 },
      { type: "INTEL", level: 0 },
      { type: "PRICES", level: 0 },
    ];
    
    // Initialize updatedBonusPoints with existing bonus points or an empty array if not set
    let updatedBonusPoints = user.bonus_points || [];

    // Ensure all required bonus point types are present, adding any that are missing
    requiredBonusPoints.forEach((requiredBonus) => {
      const existingBonus = updatedBonusPoints.find(bonus => bonus.type === requiredBonus.type);
      if (!existingBonus) {
        // If the required type is not found, add it with the default level
        updatedBonusPoints.push(requiredBonus);
      }
    });

    // Increment the level of the specified type if present
    updatedBonusPoints = updatedBonusPoints.map((bonus) => {
      if (bonus.type === typeToUpdate) {
        if (bonus.level <= 75) {
          return { ...bonus, level: bonus.level + 1 };
        } else {
          return res.status(404).json({ error: 'Max level reached' });
        }
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
    return res.status(500).json({ error: 'Internal Server Error', errorDetails: error });
  }
}

export default withAuth(handler);