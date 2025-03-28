import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { Fortifications } from '@/constants';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Ensure the request is of type POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Retrieve session and return an error if not authenticated
  const session = req.session;
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
    const fortification = Fortifications.find((f) => f.level === user.fort_level);
    const totalCost = repairPoints * fortification.costPerRepairPoint;

    // Return an error if the user does not have enough gold
    if (user.gold < totalCost) return res.status(400).json({ error: 'Not enough gold' });

    if (user.fort_hitpoints === fortification.hitpoints) return res.status(400).json({ error: 'Fortification is already at full health' });

    // Calculate new fort hitpoints and ensure it does not exceed maximum allowable hitpoints
    let newFortHitpoints = user.fort_hitpoints + repairPoints;
    if (newFortHitpoints > fortification.hitpoints) newFortHitpoints = fortification.hitpoints;
    
    await prisma.$transaction(async (tx) => {
      await tx.bank_history.create({
        data: {
          from_user_id: user.id,
          to_user_id: 0,
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: totalCost,
          history_type: 'FORT_REPAIR',
          stats: {
            currentFortHP: user.fort_hitpoints,
            newFortHP: newFortHitpoints,
            increase: repairPoints,
          },
        },
      });
      // Update the user's gold and fort hitpoints in the database
      await tx.users.update({
        where: { id: userId },
        data: {
          gold: user.gold - BigInt(totalCost),
          fort_hitpoints: newFortHitpoints,
        },
      });
    });
    

    // Return success response with new gold and fort hitpoints values
    return res.status(200).json(stringifyObj({ success: true, newGold: user.gold - BigInt(totalCost), newFortHitpoints }));
  } catch (error) {
    logError('Error repairing fortification:', error, userId);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler);