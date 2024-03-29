import type { NextApiRequest, NextApiResponse } from 'next';

import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { userId, units } = req.body;
    let totalCost = 0;

    // Validate the input data
    if (!userId || !Array.isArray(units)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      
      // Validate if the user has enough units to untrain
      for (const unitData of units) {
        const unit = UnitTypes.find((u) => u.type === unitData.type);
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
        totalCost += unit.cost * unitData.quantity;
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
      const updatedUser = await prisma.users.findUnique({
        where: { id: userId },
      });
      return res.status(200).json({
        message: 'Units untrained successfully',
        data: updatedUser.units,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to untrain units' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
