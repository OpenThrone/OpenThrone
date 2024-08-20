import type { NextApiRequest, NextApiResponse } from 'next';

import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { withAuth } from '@/middleware/auth';

const handler = async(
  req: NextApiRequest,
  res: NextApiResponse
) => {
  if (req.method === 'POST') {
    const { userId, units } = req.body;
    let totalCost = 0;

    // Validate the input data
    if (!userId || !Array.isArray(units)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.id !== req.session.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const uModel = new UserModel(user);
      
      // Validate if the user has enough units to untrain
      for (const unitData of units.filter((u) => u.quantity > 0)) {
        const unit = UnitTypes.find((u) => u.type === unitData.type && u.level === unitData.level);
        if (unitData.quantity === 0)
          continue;
        const userUnit = user.units.find((u) => u.type === unitData.type && u.level === unitData.level);
        if (!userUnit) {
         return res
            .status(400)
            .json({ error: `Invalid unit to untrain: ${unitData}` });
        }
        if (userUnit.quantity < unitData.quantity) {
          return res.status(400).json({
            error: `Not enough units to untrain: ${unit?.name}`,
          });
        }
        if (unitData.quantity < 0) {
          return res.status(400).json({ error: 'Invalid quantity' });
        }
        if (!unit) {
          return res
            .status(400)
            .json({ error: `Invalid unit type: ${unitData.type}` });
        }
        totalCost += Math.floor((unit.cost - ((uModel.priceBonus || 0) / 100) * unit.cost) * unitData.quantity * 0.75);
      }

      // Add the number of units to "CITIZENS"
      const citizenUnit = user.units.find((u) => u.type === 'CITIZEN');
      citizenUnit.quantity += units.reduce(
        (acc, unit) => acc + unit.quantity,
        0
      );

      // Update the user's units
      const updatedUnits = user.units.map((u) => {
        const unitToUpdate = units.find((unit) => unit.type === u.type && u.level === unit.level);
        if (unitToUpdate) {
          u.quantity -= unitToUpdate.quantity;
        }
        return u;
      });

      await prisma.users.update({
        where: { id: userId },
        data: {
          units: updatedUnits,
          gold: BigInt(user.gold) + BigInt(totalCost),
        },
      });

      await prisma.bank_history.create({
        data: {
          gold_amount: BigInt(totalCost),
          from_user_id: 0,
          from_user_account_type: 'BANK',
          to_user_id: userId,
          to_user_account_type: 'HAND',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: {
            type: 'TRAINING_UNTRAIN',
            items: units,
          }
        },
      });

      const updatedUser = await prisma.users.findUnique({
        where: { id: userId },
      });
      return res.status(200).json({
        message: 'Units untrained successfully',
        data: updatedUser.units,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to untrain units' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);