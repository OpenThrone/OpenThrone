// pages/api/convert.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { UnitTypes } from '@/constants';
import { updateUserAndBankHistory } from '@/services';
import { calculateUserStats } from '@/utils/utilities';
import { logError } from '@/utils/logger';

interface ConvertRequest {
  userId: string;
  fromUnit: string;
  toUnit: string;
  conversionAmount: string; // Amount in string format to handle locale-specific formats
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, fromUnit, toUnit, conversionAmount }: ConvertRequest = req.body;
  if (!userId || !fromUnit || !toUnit || !conversionAmount) {
    return res.status(400).json({ error: 'Invalid input data' });
  }
  if (userId !== req.session.user.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const amount = Number(conversionAmount);
    const uModel = new UserModel(user);
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid conversion amount' });
    }
    // Split the fromUnit and toUnit strings to get the type and level
    const [fromType, fromLevelStr] = fromUnit.split('_');
    const [toType, toLevelStr] = toUnit.split('_');
    const fromLevel = parseInt(fromLevelStr, 10);
    const toLevel = parseInt(toLevelStr, 10);

    // Determine the direction of conversion
    const isUpgrade = toLevel > fromLevel ? true : false;

    // Prevent same level conversion
    if (toLevel === fromLevel) {
      return res.status(400).json({ error: 'Cannot convert to the same unit level' });
    }

    // Fetch user's units and perform the conversion logic here
    const fromUnitData = user.units.find(
      (unit) => unit.type === fromType && unit.level === fromLevel
    );
    const toUnitData = user.units.find(
      (unit) => unit.type === toType && unit.level === toLevel
    );

    if (!fromUnitData || fromUnitData.quantity < amount) {
      return res.status(400).json({ error: 'Not enough units to convert' });
    }

    const toUnitType = UnitTypes.find((unit) => unit.type === toType && unit.level === toLevel);
    const fromUnitType = UnitTypes.find((unit) => unit.type === fromType && unit.level === fromLevel);

    if (!toUnitType || !fromUnitType) {
      return res.status(400).json({ error: 'Invalid unit types or levels' });
    }

    // Calculate the base cost difference
    const baseCostDifference =
      (toUnitType.cost - ((uModel.priceBonus || 0) / 100) * toUnitType.cost) -
      (fromUnitType.cost - ((uModel.priceBonus || 0) / 100) * fromUnitType.cost);

    // Apply multiplier based on conversion direction
    const multiplier = isUpgrade ? 1 : 0.75;

    // Calculate the final cost
    let cost = Math.ceil(amount * baseCostDifference * multiplier);

    // For downgrades, cost represents a refund, so we make it positive
    if (!isUpgrade) {
      cost = Math.ceil(amount * baseCostDifference * multiplier);
      // Ensure the refund is a positive value
      if (cost < 0) cost = -cost;
    }

    // Check if user has enough gold for upgrade or handle refund for downgrade
    if (isUpgrade && user.gold < BigInt(cost)) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct units and add/remove gold based on conversion direction
    fromUnitData.quantity -= amount;
    if (toUnitData) {
      toUnitData.quantity += amount;
    } else {
      user.units.push({ type: toType, level: toLevel, quantity: amount });
    }

    if (isUpgrade) {
      user.gold = BigInt(user.gold) - BigInt(cost.toString());
    } else {
      user.gold = BigInt(user.gold) + BigInt(cost.toString());
    }

    const conversion = await prisma.$transaction(async (tx) => {
      const { killingStrength, defenseStrength, newOffense, newDefense, newSpying, newSentry } =
        calculateUserStats(user, JSON.parse(JSON.stringify(user.units)), 'units');

      await updateUserAndBankHistory(
        tx,
        user.id,
        user.gold,
        JSON.parse(JSON.stringify(user.units)),
        killingStrength,
        defenseStrength,
        newOffense,
        newDefense,
        newSpying,
        newSentry,
        {
          gold_amount: isUpgrade ? BigInt(cost) : BigInt(cost),
          from_user_id: Number(userId),
          from_user_account_type: isUpgrade ? 'HAND' : 'BANK',
          to_user_id: Number(userId),
          to_user_account_type: isUpgrade ? 'BANK' : 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: {
            type: 'TRAINING_CONVERSION',
            fromItem: fromUnit,
            toItem: toUnit,
            amount: conversionAmount,
          },
        },
        'units'
      );
    });

    return res.status(200).json({ message: 'Units converted successfully!', data: user.units });
  } catch (error) {
    logError("Error during unit conversion:", error);
    return res.status(400).json({ error: 'Failed to convert units' });
  }
};

export default withAuth(handler);
