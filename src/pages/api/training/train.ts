import type { NextApiRequest, NextApiResponse } from 'next';

import { UnitTypes } from '@/constants';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { userId, units } = req.body;

    // Validate the input data
    if (!userId || !Array.isArray(units)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      const user = await prisma.users.findUnique({ where: { id: userId } });
      let totalCost = 0;

      for (const unitData of units) {
        const unit = UnitTypes.find((u) => u.type === unitData.type);
        if (!unit) {
          return res
            .status(400)
            .json({ error: `Invalid unit type: ${unitData.type}` });
        }
        totalCost += unit.cost * unitData.quantity;
      }

      if (user.gold < totalCost) {
        return res.status(400).json({ error: 'Not enough gold' });
      }

      // Deduct the number of units from "CITIZENS"
      const citizenUnit = user.units.find((u) => u.type === 'CITIZEN');
      if (
        citizenUnit &&
        citizenUnit.quantity <
          units.reduce((acc, unit) => acc + unit.quantity, 0)
      ) {
        return res.status(400).json({ error: 'Not enough citizens to train' });
      }
      citizenUnit.quantity -= units.reduce(
        (acc, unit) => acc + unit.quantity,
        0
      );

      // Update the user's units
      const updatedUnits = user.units.map((u) => {
        const unitToUpdate = units.find((unit) => unit.type === u.type);
        if (unitToUpdate) {
          u.quantity += unitToUpdate.quantity;
        }
        return u;
      });

      // If the user does not have any of the units they want to train, add that unit type to their units array
      for (const unitData of units) {
        if (!user.units.some((u) => u.type === unitData.type)) {
          updatedUnits.push({
            type: unitData.type,
            level: 1, // Assuming level 1 for simplicity
            quantity: unitData.quantity,
          });
        }
      }

      await prisma.users.update({
        where: { id: userId },
        data: {
          gold: user.gold - totalCost,
          units: updatedUnits,
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
      return res.status(500).json({ error: 'Failed to train units' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
