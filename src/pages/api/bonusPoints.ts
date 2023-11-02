// pages/api/update-bonus-points.js
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma'; // Adjust the import path to your actual Prisma instance
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';

// Handler function for the API route
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure the request is of type POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Retrieve session and return an error if not authenticated
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  // Retrieve the type to update and user ID from the request body
  const { typeToUpdate } = req.body;
  
  const userId = session.user?.id; // Make sure your session object has the correct structure
  if (!userId) {
    return res.status(403).json({ error: 'User ID is missing from session' , session: session});
  }

  try {
    // Retrieve the current user's bonus points
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user || !user.bonus_points) {
      return res.status(404).json({ error: 'User or bonus points not found' });
    }

    // Increment the level of the specified type
    const updatedBonusPoints = user.bonus_points.map((level) => {
      if (level.type === typeToUpdate) {
        return { ...level, level: level.level + 1 };
      }
      return level;
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
