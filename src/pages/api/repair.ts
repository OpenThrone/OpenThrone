import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { Fortifications } from '@/constants';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';
import { stringifyObj } from '@/utils/numberFormatting';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure the request is of type POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Retrieve session and return an error if not authenticated
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(403).json({ error: 'Not authenticated' });

  // Retrieve repair points from the request body and validate
  const { repairPoints } = req.body;
  if (repairPoints < 1) return res.status(400).json({ error: 'Invalid repair points' });

  // Retrieve user ID from the session
  const userId = session.user?.id;
  if (!userId) return res.status(403).json({ error: 'User ID is missing from session' });

  try {
    // Find the user and return an error if not found
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Retrieve fortification details and calculate total cost for repair
    const fortification = Fortifications[user.fort_level];
    const totalCost = repairPoints * fortification.costPerRepairPoint;

    // Return an error if the user does not have enough gold
    if (user.gold < totalCost) return res.status(400).json({ error: 'Not enough gold' });

    // Calculate new fort hitpoints and ensure it does not exceed maximum allowable hitpoints
    let newFortHitpoints = user.fort_hitpoints + repairPoints;
    if (newFortHitpoints > fortification.hitpoints) newFortHitpoints = fortification.hitpoints;
    
    // Update the user's gold and fort hitpoints in the database
    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: user.gold - BigInt(totalCost),
        fort_hitpoints: newFortHitpoints,
      },
    });

    // Return success response with new gold and fort hitpoints values
    return res.status(200).json(stringifyObj({ success: true, newGold: user.gold - BigInt(totalCost), newFortHitpoints }));
  } catch (error) {
    console.error('Error repairing fortification:', error, userId);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
