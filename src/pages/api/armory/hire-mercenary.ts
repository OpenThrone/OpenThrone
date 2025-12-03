'use server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { UnitTypes } from '@/constants/Units';
import { getUserById } from '@/services';
import UserModel from '@/models/Users';

const HireMercenarySchema = z.object({
  unitType: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
  level: z.number().min(1).max(3),
  quantity: z.number().min(1).max(100),
});

const handler = async (req, res) => {
  const session = req.session;
  if (!session) return res.status(401).json({ status: 'failed', message: 'Unauthorized' });

  try {
    const { unitType, level, quantity } = HireMercenarySchema.parse(req.body);

    // Use a transaction to update gold, mercenaries and create bank history atomically
    const result = await prisma.$transaction(async (tx) => {
      // Read user inside transaction for consistency
      const user = await getUserById(session.user.id, tx as any);
      if (!user) {
        throw new Error('User not found');
      }

      const unit = UnitTypes.find(u => u.type === unitType && u.level === level);
      if (!unit) {
        throw new Error('Invalid unit type or level');
      }

      // Check fort level requirement for mercenaries (e.g., level 1 at fort 5, level 2 at 8, level 3 at 11)
      const requiredFortLevel = 5 + (level - 1) * 3;
      if (user.fort_level < requiredFortLevel) {
        throw new Error(`Fort level too low. Requires fort level ${requiredFortLevel} for level ${level} mercenaries.`);
      }

      // Calculate cost with user's price bonus if present
      const uModel = new UserModel(user as any);
      const unitBaseCost = unit.cost - Math.ceil(((uModel.priceBonus ?? 0) / 100) * unit.cost);
      const totalCost = BigInt(Math.ceil(unitBaseCost * quantity));

      if (BigInt(user.gold) < totalCost) {
        throw new Error('Insufficient gold');
      }

      // Prepare new mercenary entry
      const currentMercs = (user.mercenaries as any[]) || [];
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const newMerc = { type: unitType, level, quantity, expiresAt };
      const updatedMercs = [...currentMercs, newMerc];

      // Update user gold and mercenaries in transaction
      await tx.users.update({
        where: { id: session.user.id },
        data: {
          gold: { decrement: totalCost },
          mercenaries: updatedMercs,
        },
      });

      // Create bank history entry in transaction
      await tx.bank_history.create({
        data: {
          gold_amount: totalCost,
          from_user_id: session.user.id,
          from_user_account_type: 'HAND',
          to_user_id: 0,
          to_user_account_type: 'BANK',
          date_time: new Date().toISOString(),
          history_type: 'SALE',
          stats: { type: 'HIRE_MERCENARY', unitType, level, quantity },
        },
      });

      return { updatedMercs, remainingGold: (BigInt(user.gold) - totalCost).toString(), cost: totalCost.toString(), expiresAt };
    });

    const ip = getRequestIp(req);
    await logAction(session.user.id, 'HIRE_MERCENARY', ip, { unitType: req.body.unitType, level: req.body.level, quantity: req.body.quantity, cost: result.cost, expiresAt: result.expiresAt?.toISOString?.() });

    return res.status(200).json({ status: 'success', mercenaries: result.updatedMercs, remainingGold: result.remainingGold });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.format() });
    }
    if (typeof error.message === 'string' && (error.message.includes('Invalid unit') || error.message.includes('Insufficient') || error.message.includes('Fort level') || error.message.includes('User not found'))) {
      return res.status(400).json({ status: 'failed', message: error.message });
    }
    console.error(error);
    return res.status(500).json({ status: 'failed', message: 'Internal server error' });
  }
};

export default withAuth(handler);