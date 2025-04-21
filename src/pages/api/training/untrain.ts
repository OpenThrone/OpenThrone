import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { calculateTotalCost, updateUnitsMap } from '@/utils/units'; // Removed validateUnits
import UserModel from '@/models/Users';
// Removed PlayerUnit import if UnitProps is used consistently
import { calculateUserStats } from '@/utils/utilities';
import { updateUserAndBankHistory } from '@/services';
import { logError } from '@/utils/logger';

// Zod schema for individual unit untraining request
const UntrainUnitSchema = z.object({
  type: z.string(),
  level: z.number().int().min(1),
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Unit quantity must be a positive integer.' })
  ),
});

// Zod schema for the entire request body
const UntrainRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int()
  ),
  units: z.array(UntrainUnitSchema).min(1, { message: 'At least one unit type must be provided for untraining.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (consistent with train.ts)
interface UnitProps {
  type: string;
  level: number;
  quantity: number | string; // Keep string for DB compatibility if needed
}

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!req.session?.user?.id) {
    logError(null, { requestPath: req.url }, 'Auth session missing in untrain handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = UntrainRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, units: unitsToUntrain } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    const updatedUnitsResult = await prisma.$transaction(async (tx) => {
      // Fetch user data within the transaction
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { gold: true, units: true }, // Select necessary fields
      });

      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user); // Use user data from transaction

      // Create map of current units (ensure quantity is number)
      const userUnitsMap = new Map<string, UnitProps>();
      (user.units as UnitProps[]).forEach(u => {
        const quantity = typeof u.quantity === 'string' ? parseInt(u.quantity, 10) : u.quantity;
        if (isNaN(quantity)) {
            throw new Error(`Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`);
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      // Calculate refund and check unit availability
      let totalRefund = 0;
      let totalUnitsUntrained = 0;

      for (const unitData of unitsToUntrain) {
        const key = `${unitData.type}_${unitData.level}`;
        const userUnit = userUnitsMap.get(key);

        if (!userUnit || (userUnit.quantity as number) < unitData.quantity) {
          throw new Error(`Not enough ${unitData.type} (Level ${unitData.level}) to untrain. Required: ${unitData.quantity}, Available: ${userUnit?.quantity ?? 0}`);
        }

        // Calculate refund for this unit type (75% of cost)
        const unitCost = calculateTotalCost([unitData], uModel); // Cost for the quantity being untrained
        totalRefund += Math.floor(unitCost * 0.75);
        totalUnitsUntrained += unitData.quantity;
      }

       if (totalUnitsUntrained <= 0) {
           throw new Error('Invalid units quantity: Total quantity to untrain must be positive.');
       }

      // Update units map (pass validated unitsToUntrain)
      // The 'false' indicates untraining (removes units, adds citizens)
      const updatedUnitsMap = updateUnitsMap(userUnitsMap, unitsToUntrain, false, totalUnitsUntrained);
      const updatedUnitsArray = Array.from(updatedUnitsMap.values());

      // Calculate new stats
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, updatedUnitsArray, 'units'); // Pass user from tx

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) + BigInt(totalRefund), // Use gold from tx
        updatedUnitsArray,
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(totalRefund),
          from_user_id: 0, // Bank/System
          from_user_account_type: 'BANK',
          to_user_id: userId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE', // Or 'UNTRAIN'? Clarify semantics
          stats: { type: 'TRAINING_UNTRAIN', items: unitsToUntrain }, // Log requested units
        },
        'units' // Context
      );

      return updatedUnitsArray; // Return result from transaction
    });

    return res.status(200).json({ message: 'Units untrained successfully!', data: updatedUnitsResult });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId: parseResult.data.userId, units: parseResult.data.units } : { body: req.body };
    logError(error, logContext, 'API Error: /api/training/untrain');

    // Handle specific errors
    if (error.message?.startsWith('Not enough') || error.message?.startsWith('Invalid units quantity') || error.message?.startsWith('Invalid quantity format')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while untraining units.' });
  }
};

export default withAuth(handler);
