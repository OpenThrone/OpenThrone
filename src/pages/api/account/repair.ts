import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { Fortifications } from '@/constants';
// Removed stringifyObj import
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';

// Zod schema for the request body
const RepairRequestSchema = z.object({
  repairPoints: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Repair points must be a positive integer.' })
  ),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = {
  message: string;
  data: {
    newGold: string; // Return gold as string for consistency with BigInt
    newFortHitpoints: number;
  };
};

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in repair handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = RepairRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { repairPoints } = parseResult.data;
  const userId = req.session.user.id; // Get userId from session

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Fetch user data within the transaction
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { gold: true, fort_level: true, fort_hitpoints: true }, // Select necessary fields
      });

      if (!user) {
        throw new Error('User not found within transaction');
      }

      // Retrieve fortification details
      const fortification = Fortifications.find((f) => f.level === user.fort_level);
      if (!fortification) {
          throw new Error(`Invalid fortification level found for user: ${user.fort_level}`);
      }

      // Check if already at full health
      if (user.fort_hitpoints >= fortification.hitpoints) {
        throw new Error('Fortification is already at full health or above.'); // Use Error for flow control
      }

      // Calculate cost and check gold
      const totalCost = BigInt(repairPoints) * BigInt(fortification.costPerRepairPoint); // Use BigInt for cost calculation
      if (user.gold < totalCost) {
        throw new Error(`Not enough gold. Required: ${totalCost}, Available: ${user.gold}`);
      }

      // Calculate new hitpoints, capped at max
      const currentHp = user.fort_hitpoints; // Store current HP for logging
      let newFortHitpoints = user.fort_hitpoints + repairPoints;
      if (newFortHitpoints > fortification.hitpoints) {
        newFortHitpoints = fortification.hitpoints;
      }
      const actualRepairAmount = newFortHitpoints - currentHp; // Calculate actual HP increase

      // If somehow the actual repair amount is non-positive after checks, something is wrong
      if (actualRepairAmount <= 0) {
          throw new Error('Calculated repair amount is zero or negative, cannot proceed.');
      }

      // Recalculate cost based on actual repair amount to prevent overcharging
      const finalCost = BigInt(actualRepairAmount) * BigInt(fortification.costPerRepairPoint);
      if (user.gold < finalCost) {
          // Re-check gold with potentially reduced cost
          throw new Error(`Not enough gold for actual repair. Required: ${finalCost}, Available: ${user.gold}`);
      }


      // Create bank history entry
      await tx.bank_history.create({
        data: {
          from_user_id: userId,
          to_user_id: 0, // Bank/System
          from_user_account_type: 'HAND',
          to_user_account_type: 'BANK',
          date_time: new Date(),
          gold_amount: finalCost, // Log the final calculated cost
          history_type: 'FORT_REPAIR',
          stats: {
            currentFortHP: currentHp,
            requestedRepairPoints: repairPoints, // Log requested points
            actualRepairAmount: actualRepairAmount, // Log actual HP increase
            newFortHP: newFortHitpoints,
            cost: finalCost.toString(), // Log cost as string
          },
        },
      });

      // Update user's gold and fort hitpoints
      const updatedUser = await tx.users.update({
        where: { id: userId },
        data: {
          gold: user.gold - finalCost, // Deduct final cost
          fort_hitpoints: newFortHitpoints,
        },
        select: { gold: true, fort_hitpoints: true }, // Select updated values
      });

      return {
          newGold: updatedUser.gold.toString(), // Return BigInt as string
          newFortHitpoints: updatedUser.fort_hitpoints
      };
    });

    // Return success response with updated data
    return res.status(200).json({
      message: 'Fortification repaired successfully',
      data: result,
    });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId, repairPoints: parseResult.data.repairPoints } : { userId, body: req.body };
    logError(error, logContext, 'API Error: /api/account/repair');

    // Handle specific errors thrown from the transaction
    if (error.message?.startsWith('Not enough gold') || error.message?.startsWith('Fortification is already at full health') || error.message?.startsWith('Invalid fortification level') || error.message?.startsWith('Calculated repair amount')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic internal server error
    return res.status(500).json({ error: 'An unexpected error occurred while repairing fortification.' });
  }
}

export default withAuth(handler);