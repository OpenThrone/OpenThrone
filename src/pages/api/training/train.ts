import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { calculateTotalCost, updateUnitsMap } from '@/utils/units'; // Removed validateUnits
import type { PlayerUnit } from '@/types/typings';
import UserModel from '@/models/Users';
import { updateUserAndBankHistory } from '@/services';
import { calculateUserStats } from '@/utils/utilities';
import { logError } from '@/utils/logger'; // Added logError import

// Zod schema for individual unit training request
const TrainUnitSchema = z.object({
  type: z.string(),
  level: z.number().int().min(1),
  quantity: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int().positive({ message: 'Unit quantity must be a positive integer.' })
  ),
});

// Zod schema for the entire request body
const TrainRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int()
  ),
  units: z.array(TrainUnitSchema).min(1, { message: 'At least one unit type must be provided for training.' }),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (similar to EquipmentProps)
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
    logError(null, { requestPath: req.url }, 'Auth session missing in train handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = TrainRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, units: unitsToTrain } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    const updatedUnitsResult = await prisma.$transaction(async (tx) => {
      // Fetch user data within the transaction
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { gold: true, units: true, bonus_points: true }, // Select necessary fields including bonus_points JSON
      });

      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user); // Use user data from transaction

      // Calculate total cost using validated unitsToTrain
      const unitList = unitsToTrain as PlayerUnit[];
      let totalCost = calculateTotalCost(unitList, uModel);
      totalCost = Math.ceil(totalCost); // Ensure integer for BigInt

      // Check gold within transaction
      if (user.gold < BigInt(totalCost)) {
        throw new Error(`Not enough gold. Required: ${totalCost}, Available: ${user.gold}`);
      }

      // Create map of current units (ensure quantity is number)
      const userUnitsRaw = user.units as unknown as PlayerUnit[];
      const userUnitsMap = new Map<string, PlayerUnit>();
      userUnitsRaw.forEach(u => {
        const quantity = typeof u.quantity === 'string' ? parseInt(u.quantity, 10) : u.quantity;
        if (isNaN(quantity)) {
          throw new Error(`Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`);
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      // Check for sufficient citizens (assuming 'CITIZEN' level 1 represents available population)
      const citizensRequired = unitsToTrain.reduce((acc, unit) => acc + unit.quantity, 0);
      const availableCitizens = (userUnitsMap.get('CITIZEN_1')?.quantity as number) ?? 0;

      if (citizensRequired <= 0) {
        throw new Error('Invalid units quantity: Total quantity must be positive.');
      }
      if (availableCitizens < citizensRequired) {
        throw new Error(`Not enough citizens. Required: ${citizensRequired}, Available: ${availableCitizens}`);
      }

      // Update units map (pass validated unitsToTrain)
      // The 'true' indicates training (adds units, consumes citizens)
      const updatedUnitsMap = updateUnitsMap(userUnitsMap as Map<string, PlayerUnit>, unitList, true, citizensRequired);
      const updatedUnitsArray = Array.from(updatedUnitsMap.values());

      // Calculate new stats
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, updatedUnitsArray, 'units'); // Pass user from tx

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) - BigInt(totalCost), // Use gold from tx
        updatedUnitsArray,
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(totalCost),
          from_user_id: userId,
          from_user_account_type: 'HAND',
          to_user_id: 0, // Bank/System
          to_user_account_type: 'BANK',
          date_time: new Date().toISOString(),
          history_type: 'SALE', // Or 'TRAIN'? Clarify semantics
          stats: { type: 'TRAINING_TRAIN', items: unitsToTrain }, // Log requested units
        },
        'units' // Context
      );

      return updatedUnitsArray; // Return result from transaction
    });

    return res.status(200).json({ message: 'Units trained successfully!', data: updatedUnitsResult });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId: parseResult.data.userId, units: parseResult.data.units } : { body: req.body };
    logError(error, logContext, 'API Error: /api/training/train');

    // Handle specific errors
    if (error.message?.startsWith('Not enough gold') || error.message?.startsWith('Not enough citizens') || error.message?.startsWith('Invalid units quantity') || error.message?.startsWith('Invalid quantity format')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'User not found within transaction') {
      return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while training units.' });
  }
};

export default withAuth(handler);
