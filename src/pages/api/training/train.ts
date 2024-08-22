// pages/api/train.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { calculateTotalCost, updateUnitsMap, validateUnits } from '@/utils/units';
import UserModel from '@/models/Users';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { userId, units } = req.body;
  if (userId !== req.session.user.id) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.users.findUnique({ where: { id: userId } });
  const uModel = new UserModel(user);
  if (typeof units === 'string') {
    units = JSON.parse(units);
  }
  if (typeof userId === 'string') {
    userId = parseInt(userId);
  }
  if (!validateUnits(units)) return res.status(400).json({ error: 'Invalid input data' });

  try {
    const totalCost = calculateTotalCost(units, uModel);
    if (user.gold < totalCost) return res.status(400).json({ error: 'Not enough gold' });

    const userUnitsMap = new Map(user.units.map(u => [`${u.type}_${u.level}`, u]));
    // Check if user has enough citizens
    const citizensRequired = units.reduce((acc, unit) => acc + unit.quantity, 0);
    if(citizensRequired <= 0) return res.status(400).json({ error: 'Invalid units quantity' });

    const updatedUnitsMap = updateUnitsMap(userUnitsMap, units, true, citizensRequired);
    const updatedUnitsArray = Array.from(updatedUnitsMap.values());

    await prisma.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold) - BigInt(totalCost),
        units: updatedUnitsArray,
      },
    });

    await prisma.bank_history.create({
      data: {
        gold_amount: BigInt(totalCost),
        from_user_id: userId,
        from_user_account_type: 'HAND',
        to_user_id: 0,
        to_user_account_type: 'BANK',
        date_time: new Date().toISOString(),
        history_type: 'SALE',
        stats: { type: 'TRAINING_TRAIN', items: units },
      },
    });

    return res.status(200).json({ message: 'Units trained successfully!', data: updatedUnitsArray });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to train units' });
  }
};

export default withAuth(handler);
