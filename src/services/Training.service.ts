import { z } from 'zod';

import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import UserModel from '@/models/Users';
import { getUserById } from '@/services/AttackDataService';
import { updateUserAndBankHistory } from '@/services/User.service';
import type { PlayerUnit } from '@/types/typings';
import { logDebug, logError } from '@/utils/logger';
import { calculateTotalCost, updateUnitsMap } from '@/utils/units';
import { calculateUserStats } from '@/utils/utilities';

type TransactionClient = Prisma.TransactionClient;

// Define TypeScript interfaces for training data structures
interface TrainingUnit {
  type: string;
  level: number;
  quantity: number;
}

/** Describes the training request data contract. */
export interface TrainingRequest {
  userId: number;
  units: TrainingUnit[];
}

/** Describes the conversion request data contract. */
export interface ConversionRequest {
  userId: number;
  fromUnit: {
    type: string;
    level: number;
  };
  toUnit: {
    type: string;
    level: number;
  };
  conversionAmount: number;
}

/** Describes the training result data contract. */
export interface TrainingResult {
  units: PlayerUnit[];
  totalCost?: number;
  totalRefund?: number;
  message: string;
}

// Zod schemas for validation
const TrainUnitSchema = z.object({
  type: z.string(),
  level: z.number().int().min(1),
  quantity: z
    .number()
    .int()
    .positive({ message: 'Unit quantity must be a positive integer.' }),
});

const TrainRequestSchema = z.object({
  userId: z.number().int(),
  units: z.array(TrainUnitSchema).min(1, {
    message: 'At least one unit type must be provided for training.',
  }),
});

const UnitIdentifierSchema = z.object({
  type: z.string(),
  level: z.number().int().min(1),
});

const ConvertRequestSchema = z.object({
  userId: z.number().int(),
  fromUnit: UnitIdentifierSchema,
  toUnit: UnitIdentifierSchema,
  conversionAmount: z
    .number()
    .int()
    .positive({ message: 'Conversion amount must be a positive integer.' }),
});

/**
 * Trains units for a user, handling all validation, cost calculation, and unit updates.
 * @param request - Training request containing userId and units to train
 * @returns TrainingResult with updated units and transaction details
 * @throws Error if validation fails, insufficient resources, or user not found
 */
export const trainUnits = async (
  request: TrainingRequest,
): Promise<TrainingResult> => {
  // Validate request
  const parseResult = TrainRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid training request: ${parseResult.error.message}`);
  }

  const { userId, units: unitsToTrain } = parseResult.data;

  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      // Fetch user data within the transaction
      const user = await getUserById(userId, tx);

      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user);

      // Calculate total cost using validated unitsToTrain
      const unitList = unitsToTrain as PlayerUnit[];
      let totalCost = calculateTotalCost(unitList, uModel);
      totalCost = Math.ceil(totalCost); // Ensure integer for BigInt

      // Check gold within transaction
      if (user.gold < BigInt(totalCost)) {
        throw new Error(
          `Not enough gold. Required: ${totalCost}, Available: ${user.gold}`,
        );
      }

      // Create map of current units (ensure quantity is number)
      const userUnitsRaw = user.UserUnit as PlayerUnit[];
      const userUnitsMap = new Map<string, PlayerUnit>();
      userUnitsRaw.forEach((u) => {
        const quantity =
          typeof u.quantity === 'string'
            ? parseInt(u.quantity, 10)
            : u.quantity;
        if (isNaN(quantity)) {
          throw new Error(
            `Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`,
          );
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      // Check for sufficient citizens (assuming 'CITIZEN' level 1 represents available population)
      const citizensRequired = unitsToTrain.reduce(
        (acc, unit) => acc + unit.quantity,
        0,
      );
      const availableCitizens = userUnitsMap.get('CITIZEN_1')?.quantity ?? 0;

      if (citizensRequired <= 0) {
        throw new Error(
          'Invalid units quantity: Total quantity must be positive.',
        );
      }
      if (availableCitizens < citizensRequired) {
        throw new Error(
          `Not enough citizens. Required: ${citizensRequired}, Available: ${availableCitizens}`,
        );
      }

      // Update units map (pass validated unitsToTrain)
      // The 'true' indicates training (adds units, consumes citizens)
      const updatedUnitsMap = updateUnitsMap(
        userUnitsMap,
        unitList,
        true,
        citizensRequired,
      );
      const updatedUnitsArray = Array.from(updatedUnitsMap.values());

      // Calculate new stats
      const {
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
      } = calculateUserStats(user, updatedUnitsArray, 'units');

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) - BigInt(totalCost),
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
          history_type: 'SALE',
          stats: { type: 'TRAINING_TRAIN', items: unitsToTrain },
        },
        'units',
      );

      return {
        units: updatedUnitsArray,
        totalCost,
        message: 'Units trained successfully!',
      };
    });

    return result;
  } catch (error: any) {
    logError(
      error,
      { userId, units: unitsToTrain },
      'TrainingService.trainUnits',
    );

    // Re-throw specific errors for API layer handling
    if (
      error.message?.startsWith('Not enough gold') ||
      error.message?.startsWith('Not enough citizens') ||
      error.message?.startsWith('Invalid units quantity') ||
      error.message?.startsWith('Invalid quantity format')
    ) {
      throw error;
    }
    if (error.message === 'User not found within transaction') {
      throw new Error('User data inconsistency during training transaction.');
    }

    // Generic error
    throw new Error(`Training failed: ${error.message}`);
  }
};

/**
 * Untrains units for a user, handling refunds and unit updates.
 * @param request - Training request containing userId and units to untrain
 * @returns TrainingResult with updated units and refund details
 * @throws Error if validation fails, insufficient units, or user not found
 */
export const untrainUnits = async (
  request: TrainingRequest,
): Promise<TrainingResult> => {
  // Validate request
  const parseResult = TrainRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid untraining request: ${parseResult.error.message}`);
  }

  const { userId, units: unitsToUntrain } = parseResult.data;

  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      // Fetch user data within the transaction
      const user = await getUserById(userId, tx);
      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user);

      // Create map of current units (ensure quantity is number)
      const userUnitsMap = new Map<string, TrainingUnit>();
      (user.UserUnit as TrainingUnit[]).forEach((u) => {
        const quantity =
          typeof u.quantity === 'string'
            ? parseInt(u.quantity, 10)
            : u.quantity;
        if (isNaN(quantity)) {
          throw new Error(
            `Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`,
          );
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      // Calculate refund and check unit availability
      let totalRefund = 0;
      let totalUnitsUntrained = 0;

      for (const unitData of unitsToUntrain) {
        const key = `${unitData.type}_${unitData.level}`;
        const userUnit = userUnitsMap.get(key);

        if (!userUnit || userUnit.quantity < unitData.quantity) {
          throw new Error(
            `Not enough ${unitData.type} (Level ${unitData.level}) to untrain. Required: ${unitData.quantity}, Available: ${userUnit?.quantity ?? 0}`,
          );
        }

        // Calculate refund for this unit type (75% of cost)
        // Cast the unitData to a PlayerUnit shape expected by calculateTotalCost
        const unitForCost = {
          id: 0,
          userId,
          type: unitData.type,
          level: unitData.level,
          quantity: unitData.quantity,
          isMercenary: false,
        } as any;
        const unitCost = calculateTotalCost([unitForCost], uModel); // Cost for the quantity being untrained
        totalRefund += Math.floor(unitCost * 0.75);
        totalUnitsUntrained += unitData.quantity;
      }

      if (totalUnitsUntrained <= 0) {
        throw new Error(
          'Invalid units quantity: Total quantity to untrain must be positive.',
        );
      }

      // Update units map (pass validated unitsToUntrain)
      // The 'false' indicates untraining (removes units, adds citizens)
      // Map unitsToUntrain into full PlayerUnit shapes before passing to updateUnitsMap
      const unitsToUntrainFull = unitsToUntrain.map(
        (u) =>
          ({
            id: 0,
            userId,
            type: u.type,
            level: u.level,
            quantity: u.quantity,
            isMercenary: false,
          }) as any,
      );
      const updatedUnitsMap = updateUnitsMap(
        userUnitsMap as any,
        unitsToUntrainFull as any,
        false,
        totalUnitsUntrained,
      );
      const updatedUnitsArray = Array.from(updatedUnitsMap.values());

      // Calculate new stats
      const {
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
      } = calculateUserStats(user, updatedUnitsArray, 'units');

      // Update user and bank history
      await updateUserAndBankHistory(
        tx,
        userId,
        BigInt(user.gold) + BigInt(totalRefund),
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
          history_type: 'SALE',
          stats: { type: 'TRAINING_UNTRAIN', items: unitsToUntrain },
        },
        'units',
      );

      return {
        units: updatedUnitsArray,
        totalRefund,
        message: 'Units untrained successfully!',
      };
    });

    return result;
  } catch (error: any) {
    logError(
      error,
      { userId, units: unitsToUntrain },
      'TrainingService.untrainUnits',
    );

    // Re-throw specific errors for API layer handling
    if (
      error.message?.startsWith('Not enough') ||
      error.message?.startsWith('Invalid units quantity') ||
      error.message?.startsWith('Invalid quantity format')
    ) {
      throw error;
    }
    if (error.message === 'User not found within transaction') {
      throw new Error('User data inconsistency during untraining transaction.');
    }

    // Generic error
    throw new Error(`Untraining failed: ${error.message}`);
  }
};

/**
 * Converts units between types/levels for a user.
 * @param request - Conversion request with from/to unit details and amount
 * @returns TrainingResult with updated units and cost/refund details
 * @throws Error if validation fails, insufficient units, or user not found
 */
export const convertUnits = async (
  request: ConversionRequest,
): Promise<TrainingResult> => {
  // Validate request
  const parseResult = ConvertRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid conversion request: ${parseResult.error.message}`);
  }

  const { userId, fromUnit, toUnit, conversionAmount } = parseResult.data;

  // Basic validation checks
  if (fromUnit.type !== toUnit.type) {
    throw new Error(
      'Conversion must be within the same unit type (e.g., ATTACK to ATTACK).',
    );
  }
  if (fromUnit.level === toUnit.level) {
    throw new Error('Cannot convert units to the same level.');
  }

  try {
    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      // Fetch user data within the transaction
      const user = await getUserById(userId, tx);

      if (!user) {
        throw new Error('User not found within transaction');
      }

      const uModel = new UserModel(user);

      // Find unit definitions from constants
      const fromUnitDef = UnitTypes.find(
        (u) => u.type === fromUnit.type && u.level === fromUnit.level,
      );
      const toUnitDef = UnitTypes.find(
        (u) => u.type === toUnit.type && u.level === toUnit.level,
      );

      if (!fromUnitDef || !toUnitDef) {
        throw new Error(
          `Invalid unit definition for conversion: ${fromUnit.type}_${fromUnit.level} or ${toUnit.type}_${toUnit.level}`,
        );
      }

      logDebug(
        `Converting from ${fromUnitDef.name} (Level ${fromUnitDef.level}) to ${toUnitDef.name} (Level ${toUnitDef.level}) with amount ${conversionAmount}`,
      );

      // Create map of current units (ensure quantity is number)
      const userUnitsMap = new Map<string, TrainingUnit>();
      (user.UserUnit as TrainingUnit[]).forEach((u) => {
        const quantity =
          typeof u.quantity === 'string'
            ? parseInt(u.quantity, 10)
            : u.quantity;
        if (isNaN(quantity)) {
          throw new Error(
            `Invalid quantity format for unit ${u.type}-${u.level} in user inventory.`,
          );
        }
        userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
      });

      // Check if user has enough units to convert
      const currentFromUnit = userUnitsMap.get(
        `${fromUnit.type}_${fromUnit.level}`,
      );
      if (!currentFromUnit || currentFromUnit.quantity < conversionAmount) {
        throw new Error(
          `Not enough ${fromUnitDef.name} (Level ${fromUnitDef.level}) to convert. Required: ${conversionAmount}, Available: ${currentFromUnit?.quantity ?? 0}`,
        );
      }

      // Calculate cost/refund
      const isUpgrade = toUnit.level > fromUnit.level;
      const toCost = parseInt(toUnitDef.cost.toString(), 10);
      const fromCost = parseInt(fromUnitDef.cost.toString(), 10);
      const baseCostDifference =
        toCost -
        Math.round(((uModel.priceBonus ?? 0) / 100) * toCost) -
        (fromCost - Math.round(((uModel.priceBonus ?? 0) / 100) * fromCost));
      let costOrRefund = 0;
      if (isUpgrade) {
        // Upgrade cost is the positive difference
        costOrRefund = Math.ceil(conversionAmount * baseCostDifference);
        if (BigInt(user.gold) < BigInt(costOrRefund)) {
          throw new Error(
            `Not enough gold for upgrade. Required: ${costOrRefund}, Available: ${user.gold}`,
          );
        }
      } else {
        // Downgrade refund is 75% of the absolute difference (cost difference will be negative)
        costOrRefund = Math.floor(
          conversionAmount * Math.abs(baseCostDifference) * 0.75,
        );
      }
      costOrRefund = Math.round(costOrRefund); // Ensure integer

      // Update unit quantities
      currentFromUnit.quantity -= conversionAmount;

      const currentToUnitKey = `${toUnit.type}_${toUnit.level}`;
      const currentToUnit = userUnitsMap.get(currentToUnitKey);
      if (currentToUnit) {
        currentToUnit.quantity += conversionAmount;
      } else {
        // Add the new unit type/level if it doesn't exist
        userUnitsMap.set(currentToUnitKey, {
          type: toUnit.type,
          level: toUnit.level,
          quantity: conversionAmount,
        });
      }

      // Filter out units with zero quantity
      const finalUnitsArray = Array.from(userUnitsMap.values()).filter(
        (item) => item.quantity > 0,
      );

      // Calculate final gold
      const costOrRefundBigInt =
        typeof costOrRefund === 'bigint' ? costOrRefund : BigInt(costOrRefund);
      const finalGold = isUpgrade
        ? BigInt(user.gold) - costOrRefundBigInt
        : BigInt(user.gold) + costOrRefundBigInt;

      // Calculate new stats
      const {
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
      } = calculateUserStats(user, finalUnitsArray, 'units');

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
            fromItem: `${fromUnit.type}_${fromUnit.level}`,
            toItem: `${toUnit.type}_${toUnit.level}`,
            amount: conversionAmount,
          },
        },
        'units',
      );

      return {
        units: finalUnitsArray,
        totalCost: isUpgrade ? costOrRefund : undefined,
        totalRefund: !isUpgrade ? costOrRefund : undefined,
        message: 'Units converted successfully!',
      };
    });

    return result;
  } catch (error: any) {
    logError(
      error,
      { userId, fromUnit, toUnit, conversionAmount },
      'TrainingService.convertUnits',
    );

    // Re-throw specific errors for API layer handling
    if (
      error.message?.startsWith('Not enough') ||
      error.message?.startsWith('Invalid unit definition') ||
      error.message?.startsWith('Invalid quantity format') ||
      error.message?.startsWith('Conversion must be') ||
      error.message?.startsWith('Cannot convert')
    ) {
      throw error;
    }
    if (error.message === 'User not found within transaction') {
      throw new Error('User data inconsistency during conversion transaction.');
    }

    // Generic error
    throw new Error(`Conversion failed: ${error.message}`);
  }
};

/**
 * Validates training costs and resource requirements without performing the training.
 * @param request - Training request to validate
 * @returns Object containing validation results and cost breakdown
 * @throws Error if validation fails
 */
const validateTrainingRequest = async (request: TrainingRequest) => {
  const parseResult = TrainRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new Error(`Invalid training request: ${parseResult.error.message}`);
  }

  const { userId, units: unitsToTrain } = parseResult.data;

  try {
    // Fetch user data
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const uModel = new UserModel(user);

    // Calculate total cost
    const unitList = unitsToTrain as PlayerUnit[];
    let totalCost = calculateTotalCost(unitList, uModel);
    totalCost = Math.ceil(totalCost);

    // Check citizens requirement
    const citizensRequired = unitsToTrain.reduce(
      (acc, unit) => acc + unit.quantity,
      0,
    );
    const userUnitsMap = new Map<string, PlayerUnit>();
    (user.UserUnit as PlayerUnit[]).forEach((u) => {
      const quantity =
        typeof u.quantity === 'string' ? parseInt(u.quantity, 10) : u.quantity;
      userUnitsMap.set(`${u.type}_${u.level}`, { ...u, quantity });
    });
    const availableCitizens = userUnitsMap.get('CITIZEN_1')?.quantity ?? 0;

    return {
      valid: true,
      totalCost: Number(totalCost),
      citizensRequired,
      availableCitizens,
      hasEnoughGold: user.gold >= BigInt(totalCost),
      hasEnoughCitizens: availableCitizens >= citizensRequired,
      breakdown: unitsToTrain.map((unit) => ({
        ...unit,
        cost: calculateTotalCost(
          [
            {
              id: 0,
              userId,
              type: unit.type,
              level: unit.level,
              quantity: unit.quantity,
              isMercenary: false,
            } as any,
          ],
          uModel,
        ),
      })),
    };
  } catch (error: any) {
    logError(
      error,
      { userId, units: unitsToTrain },
      'TrainingService.validateTrainingRequest',
    );
    throw new Error(`Validation failed: ${error.message}`);
  }
};

/**
 * Gets training history for a user from bank history records.
 * @param userId - The ID of the user to get training history for
 * @param limit - Maximum number of records to return (default: 50)
 * @returns Array of training history records
 */
const getTrainingHistory = async (userId: number, limit: number = 50) => {
  try {
    const history = await prisma.bank_history.findMany({
      where: {
        OR: [
          {
            AND: [
              { from_user_id: userId },
              { history_type: 'SALE' },
              { stats: { path: ['type'], equals: 'TRAINING_TRAIN' } },
            ],
          },
          {
            AND: [
              { to_user_id: userId },
              { history_type: 'SALE' },
              { stats: { path: ['type'], equals: 'TRAINING_UNTRAIN' } },
            ],
          },
          {
            AND: [
              { history_type: 'SALE' },
              { stats: { path: ['type'], equals: 'TRAINING_CONVERSION' } },
            ],
          },
        ],
      },
      take: limit,
      orderBy: {
        date_time: 'desc',
      },
    });

    return history;
  } catch (error: any) {
    logError(error, { userId, limit }, 'TrainingService.getTrainingHistory');
    throw new Error(`Failed to get training history: ${error.message}`);
  }
};
