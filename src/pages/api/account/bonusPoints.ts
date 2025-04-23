import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users'; // Keep UserModel for availableProficiencyPoints calculation
import { withAuth } from '@/middleware/auth';
import { DefaultLevelBonus } from '@/constants/Bonuses';
// Removed BonusType import, will use Zod enum
import { logError } from '@/utils/logger'; // Added logger import
import { Prisma } from '@prisma/client'; // Import Prisma types

// Define BonusType enum using Zod based on DefaultLevelBonus
const BonusTypeEnum = z.enum(DefaultLevelBonus.map(b => b.type) as [string, ...string[]]); // Cast needed for non-empty array
type BonusType = z.infer<typeof BonusTypeEnum>;

// Zod schema for the change queue item
const ChangeQueueItemSchema = z.object({
  change: z.number().int({ message: "Change must be an integer." }),
});

// Zod schema for the request body (changeQueue)
const BonusPointsRequestSchema = z.object({
  // Use record to validate the changeQueue object structure
  changeQueue: z.record(BonusTypeEnum, ChangeQueueItemSchema),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = {
    message: string;
    data: { updatedBonusPoints: BonusPointsItem[] }
};

// Define BonusPointsItem type (can use Prisma.JsonValue or a specific interface)
interface BonusPointsItem {
  type: BonusType;
  level: number;
}

const MAX_BONUS_LEVEL = 75;

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in bonusPoints handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = BonusPointsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { changeQueue } = parseResult.data;
  const userId = req.session.user.id;

  try {
    const updatedBonusPointsResult = await prisma.$transaction(async (tx) => {
      // Fetch user data needed for validation and UserModel instantiation
      // Adjust select based on fields UserModel actually needs for availableProficiencyPoints
      const userRecord = await tx.users.findUnique({
          where: { id: userId },
          select: { bonus_points: true, experience: true /* Add other fields needed by UserModel */ }
      });

      if (!userRecord) {
        throw new Error('User not found within transaction');
      }

      // Instantiate UserModel to calculate available points
      // Ensure all necessary fields were selected above
      const userModel = new UserModel(userRecord as any); // Cast needed if select isn't exhaustive for UserModel type

      // Calculate the total change requested from the validated queue
      const totalChange = Object.values(changeQueue).reduce((acc, item) => acc + item.change, 0);

      // Validate against available points
      if (totalChange < 0) {
          throw new Error('Cannot decrease bonus points below zero through this endpoint.'); // Prevent negative total change if needed
      }
      if (totalChange > userModel.availableProficiencyPoints) {
        throw new Error(`Not enough proficiency points available. Required: ${totalChange}, Available: ${userModel.availableProficiencyPoints}`);
      }

      // Process the bonus points update
      const currentBonusPointsMap = new Map<BonusType, number>();
      if (Array.isArray(userRecord.bonus_points)) {
          (userRecord.bonus_points as BonusPointsItem[]).forEach(bp => {
              // Validate type just in case DB data is inconsistent
              const parseType = BonusTypeEnum.safeParse(bp.type);
              if (parseType.success && typeof bp.level === 'number') {
                  currentBonusPointsMap.set(parseType.data, bp.level);
              } else {
                   logError(null, { userId, bonusPoint: bp }, 'Invalid bonus point item found in user data');
              }
          });
      }

      const updatedBonusPoints: BonusPointsItem[] = [];
      let pointsSpent = 0; // Track actual points spent after validation

      for (const defaultBonus of DefaultLevelBonus) {
          const type = defaultBonus.type as BonusType; // Type assertion based on Zod enum source
          const currentLevel = currentBonusPointsMap.get(type) ?? 0;
          const change = changeQueue[type]?.change ?? 0; // Get change from validated queue
          const newLevel = currentLevel + change;

          if (change < 0 && newLevel < 0) {
              throw new Error(`Cannot reduce level below 0 for ${type}.`);
          }
          if (change > 0 && newLevel > MAX_BONUS_LEVEL) {
              throw new Error(`Cannot increase level above ${MAX_BONUS_LEVEL} for ${type}. Requested: ${newLevel}`);
          }

          // Only add points spent if change is positive
          if (change > 0) {
              pointsSpent += change;
          }
          // Add validation for negative changes if needed (e.g., ensure total points don't go below 0)

          updatedBonusPoints.push({ type, level: newLevel });
      }

       // Final check: ensure points spent matches totalChange requested (unless clamping logic changes it)
       if (pointsSpent !== totalChange) {
           // This might happen if validation logic changes points spent, adjust error or logic
           logError(null, { userId, totalChange, pointsSpent }, 'Mismatch between requested change and points spent');
           throw new Error('Calculation error during point allocation.');
       }


      // Update the user's bonus points
      await tx.users.update({
        where: { id: userId },
        // Ensure the final array structure matches Prisma's expected JSON format
        data: { bonus_points: updatedBonusPoints as Prisma.JsonArray },
      });

      return updatedBonusPoints; // Return the updated array from transaction
    });

    // Return success response
    return res.status(200).json({
        message: 'Bonus points updated successfully.',
        data: { updatedBonusPoints: updatedBonusPointsResult }
    });

  } catch (error: any) {
    const logContext = { userId, changeQueue: parseResult.success ? changeQueue : req.body.changeQueue };
    logError(error, logContext, 'API Error: /api/account/bonusPoints');

    // Handle specific errors
    if (error.message?.startsWith('Not enough proficiency points') || error.message?.startsWith('Cannot reduce level') || error.message?.startsWith('Cannot increase level') || error.message?.startsWith('Max level reached')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while updating bonus points.' });
  }
};

export default withAuth(handler);
