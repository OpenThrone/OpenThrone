import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { UnitTypes } from '@/constants';
import { updateUserAndBankHistory } from '@/services';
import { calculateUserStats } from '@/utils/utilities';
import { logDebug, logError, logTrace } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

// Zod schema for parsing "TYPE_LEVEL" strings
const UnitIdentifierSchema = z.string().regex(/^[A-Z]+_\d+$/, { message: "Unit identifier must be in TYPE_LEVEL format (e.g., ATTACK_1)" })
  .transform(val => {
    const [type, levelStr] = val.split('_');
    return { type, level: parseInt(levelStr, 10) };
  })
  .refine(val => !isNaN(val.level) && val.level > 0, { message: "Invalid level in unit identifier" });

// Zod schema for the request body
const ConvertRequestSchema = z.object({
  userId: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int()
  ),
  fromUnit: UnitIdentifierSchema,
  toUnit: UnitIdentifierSchema,
  conversionAmount: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val), // Handle potential commas
    z.number().int().positive({ message: 'Conversion amount must be a positive integer.' })
  ),
});

// Define response types
type ApiErrorResponse = { error: string; details?: any };
type ApiSuccessResponse = { message: string; data: any }; // Consider defining a more specific Unit type

// Define UnitProps interface (consistent with train/untrain)
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
    logError(null, { requestPath: req.url }, 'Auth session missing in convert handler');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Validate request body
  const parseResult = ConvertRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body.',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, fromUnit, toUnit, conversionAmount } = parseResult.data;

  // Authorization check
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  // Basic validation checks
  if (fromUnit.type !== toUnit.type) {
    return res.status(400).json({ error: 'Conversion must be within the same unit type (e.g., ATTACK to ATTACK).' });
  }
  if (fromUnit.level === toUnit.level) {
    return res.status(400).json({ error: 'Cannot convert units to the same level.' });
  }

  try {
    const updatedUnitsResult = await prisma.$transaction(async (tx) => {
      // Fetch user data within the transaction
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { gold: true, units: true, bonus_points: true }, // Select necessary fields including bonus_points JSON
      });

      console.log(`User data fetched in transaction: ${JSON.stringify(stringifyObj(user))}`);

      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user); // Use user data from transaction

      // Find unit definitions from constants
      const fromUnitDef = UnitTypes.find(u => u.type === fromUnit.type && u.level === fromUnit.level);
      const toUnitDef = UnitTypes.find(u => u.type === toUnit.type && u.level === toUnit.level);

      if (!fromUnitDef || !toUnitDef) {
        throw new Error(`Invalid unit definition for conversion: ${fromUnit.type}_${fromUnit.level} or ${toUnit.type}_${toUnit.level}`);
      }
      console.log(`Unit definitions found: fromUnitDef=${JSON.stringify(fromUnitDef)}, toUnitDef=${JSON.stringify(toUnitDef)}`);

      logDebug(`Converting from ${fromUnitDef.name} (Level ${fromUnitDef.level}) to ${toUnitDef.name} (Level ${toUnitDef.level}) with amount ${conversionAmount}`);

      // Create map of current units (ensure quantity is number)
      const userUnitsMap = new Map<string, UnitProps>();
      (user.units as unknown as UnitProps[]).forEach(u => {
        const quantity = typeof u.quantity === 'string' ? parseInt(u.quantity, 10) : u.quantity;
        if (isNaN(quantity)) {
            throw new Error(`Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`);
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      logDebug(`Current user units map: ${JSON.stringify(Array.from(userUnitsMap.entries()))}`);

      // Check if user has enough units to convert
      const currentFromUnit = userUnitsMap.get(`${fromUnit.type}_${fromUnit.level}`);
      if (!currentFromUnit || (currentFromUnit.quantity as number) < conversionAmount) {
        throw new Error(`Not enough ${fromUnitDef.name} (Level ${fromUnitDef.level}) to convert. Required: ${conversionAmount}, Available: ${currentFromUnit?.quantity ?? 0}`);
      }

      // Calculate cost/refund
      const isUpgrade = toUnit.level > fromUnit.level;
      const toCost = parseInt(toUnitDef.cost.toString(), 10);
      const fromCost = parseInt(fromUnitDef.cost.toString(), 10);
      const baseCostDifference =
          (toCost - Math.round((uModel.priceBonus ?? 0) / 100 * toCost)) -
          (fromCost - Math.round((uModel.priceBonus ?? 0) / 100 * fromCost));
      let costOrRefund = 0;
      if (isUpgrade) {
          // Upgrade cost is the positive difference
          costOrRefund = Math.ceil(conversionAmount * baseCostDifference);
          if (BigInt(user.gold) < BigInt(costOrRefund)) {
              throw new Error(`Not enough gold for upgrade. Required: ${costOrRefund}, Available: ${user.gold}`);
          }
      } else {
          // Downgrade refund is 75% of the absolute difference (cost difference will be negative)
          costOrRefund = Math.floor(conversionAmount * Math.abs(baseCostDifference) * 0.75);
      }
      costOrRefund = Math.round(costOrRefund); // Ensure integer

      // Update unit quantities
      (currentFromUnit.quantity as number) -= conversionAmount;

      const currentToUnitKey = `${toUnit.type}_${toUnit.level}`;
      const currentToUnit = userUnitsMap.get(currentToUnitKey);
      if (currentToUnit) {
        (currentToUnit.quantity as number) += conversionAmount;
      } else {
        // Add the new unit type/level if it doesn't exist
        userUnitsMap.set(currentToUnitKey, { type: toUnit.type, level: toUnit.level, quantity: conversionAmount });
      }

      // Filter out units with zero quantity
      const finalUnitsArray = Array.from(userUnitsMap.values()).filter(item => (item.quantity as number) > 0);
      
      // Calculate final gold
      const costOrRefundBigInt = typeof costOrRefund === 'bigint' ? costOrRefund : BigInt(costOrRefund);
      const finalGold = isUpgrade ? BigInt(user.gold) - costOrRefundBigInt : BigInt(user.gold) + costOrRefundBigInt;

      // Calculate new stats
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, finalUnitsArray, 'units'); // Pass user from tx

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        finalGold,
        finalUnitsArray,
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: BigInt(costOrRefund),
          // If upgrading, user pays (HAND -> BANK), if downgrading, user receives (BANK -> HAND)
          from_user_id: isUpgrade ? userId : 0,
          from_user_account_type: isUpgrade ? 'HAND' : 'BANK',
          to_user_id: isUpgrade ? 0 : userId,
          to_user_account_type: isUpgrade ? 'BANK' : 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: {
            type: 'TRAINING_CONVERSION',
            fromItem: `${fromUnit.type}_${fromUnit.level}`, // Log original string format
            toItem: `${toUnit.type}_${toUnit.level}`,     // Log original string format
            amount: conversionAmount,
          },
        },
        'units' // Context
      );

      return finalUnitsArray; // Return result from transaction
    });

    return res.status(200).json({ message: 'Units converted successfully!', data: updatedUnitsResult });

  } catch (error: any) {
    const logContext = parseResult.success ? { userId: parseResult.data.userId, ...parseResult.data } : { body: req.body };
    logError(error, logContext, 'API Error: /api/training/convert');

    // Handle specific errors
    if (error.message?.startsWith('Not enough') || error.message?.startsWith('Invalid unit definition') || error.message?.startsWith('Invalid quantity format')) {
      return res.status(400).json({ error: error.message });
    }
     if (error.message === 'User not found within transaction') {
       return res.status(404).json({ error: 'User data inconsistency during transaction.' });
    }
    // Generic error
    return res.status(500).json({ error: 'An unexpected error occurred while converting units.' });
  }
};

export default withAuth(handler);
