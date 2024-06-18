import type { NextApiRequest, NextApiResponse } from 'next';

import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

const handler = async(
  req: NextApiRequest,
  res: NextApiResponse
) => {
  if (req.method === 'POST') {
    let { userId, units } = req.body;
    if (userId !== req.session.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await prisma.users.findUnique({ where: { id: userId } });
    const uModel = new UserModel(user);
    if (typeof units === 'string') {
      units = JSON.parse(units);
    }
    if (typeof userId === 'string') {
      userId = parseInt(userId);
    }
    // Validate the input data
    if (!userId || !Array.isArray(units)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      let totalCost = 0;
      
      // Prepare a map for quick lookup of user's current units
      const userUnitsMap = new Map(user.units.map(u => [`${u.type}_${u.level}`, u]));

      // Calculate total cost and validate each unit type and level
      for (const unitData of units) {
        const unitType = UnitTypes.find(u => u.type === unitData.type && u.level === unitData.level);
        if (unitData.quantity < 0) {
          res.status(400).json({ error: 'Invalid quantity' });
        }
        if (!unitType) {
          return res.status(400).json({ error: `Invalid unit type or level: ${unitData.type} Level ${unitData.level}` });
        }
        totalCost += (unitType.cost - ((uModel.priceBonus || 0) / 100) * unitType.cost) * unitData.quantity;
      }

      if (user.gold < totalCost) {
        return res.status(400).json({ error: 'Not enough gold' });
      }

      // Check if user has enough citizens
      const citizensRequired = units.reduce((acc, unit) => acc + unit.quantity, 0);
      const citizenUnit = userUnitsMap.get('CITIZEN_1');
      if (!citizenUnit || citizenUnit.quantity < citizensRequired) {
        return res.status(400).json({ error: 'Not enough citizens to train' });
      }

      // Iterate over the units that the user is trying to train to update or add the units
      units.forEach(unitData => {
        const unitKey = `${unitData.type}_${unitData.level}`;
        const currentUnit = userUnitsMap.get(unitKey);
        // If the unit exists, update the quantity, otherwise, set the new unit with the desired quantity.
        if (currentUnit) {
          currentUnit.quantity += unitData.quantity;
        } else {
          userUnitsMap.set(unitKey, { type: unitData.type, level: unitData.level, quantity: unitData.quantity });
        }
      });

      // Deduct the number of units from "CITIZEN"
      const citizenUnitKey = 'CITIZEN_1';
      if (userUnitsMap.has(citizenUnitKey)) {
        userUnitsMap.get(citizenUnitKey).quantity -= citizensRequired;
      }

      // Convert the map back to an array for the response
      const updatedUnitsArray = Array.from(userUnitsMap.values()).map(u => ({
        type: u.type,
        level: u.level,
        quantity: u.quantity
      }));

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: BigInt(user.gold) - BigInt(Math.ceil(totalCost).toString()),
          units: updatedUnitsArray,
        },
      });
      const updatedUser = await prisma.users.findUnique({
        where: { id: userId },
      });
      return res.status(200).json({
        message: 'Units trained successfully!',
        data: updatedUser.units,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Failed to train units' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);