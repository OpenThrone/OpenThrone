// pages/api/untrain.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { calculateTotalCost, updateUnitsMap, validateUnits } from '@/utils/units';
import UserModel from '@/models/Users';
import { PlayerUnit } from '@/types/typings';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, units } = req.body;
  if (userId !== req.session.user.id) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.users.findUnique({ where: { id: userId } });
  const uModel = new UserModel(user);

  if (!validateUnits(units)) return res.status(400).json({ error: 'Invalid input data' });

  try {
    const totalRefund = calculateTotalCost(units, uModel) * 0.75;
    if(totalRefund <= 0) return res.status(400).json({ error: 'Invalid units quantity' });
    const userUnitsMap = new Map((user.units as PlayerUnit[]).map(u => [`${u.type}_${u.level}`, u]));
    // Add the number of units to "CITIZENS"
    const citizenUnit = user.units.find((u) => u.type === 'CITIZEN');
    citizenUnit.quantity += units.reduce(
      (acc, unit) => acc + unit.quantity,
      0
    );
    const updatedUnitsMap = updateUnitsMap(userUnitsMap as Map<string, PlayerUnit>, units, false);
    const updatedUnitsArray = Array.from(updatedUnitsMap.values());

    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold) + BigInt(totalRefund),
        units: updatedUnitsArray,
      },
    });

    await prisma.bank_history.create({
      data: {
        gold_amount: BigInt(totalRefund),
        from_user_id: 0,
        from_user_account_type: 'BANK',
        to_user_id: userId,
        to_user_account_type: 'HAND',
        date_time: new Date().toISOString(),
        history_type: 'SALE',
        stats: { type: 'TRAINING_UNTRAIN', items: units },
      },
    });

    return res.status(200).json({ message: 'Units untrained successfully!', data: updatedUnitsArray });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to untrain units' });
  }
};

export default withAuth(handler);
