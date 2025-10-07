'use server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { UnitTypes } from '@/constants/Units';

const HireMercenarySchema = z.object({
  unitType: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
  level: z.number().min(1).max(3),
  quantity: z.number().min(1).max(100),
});

const handler = async (req, res) => {
  const session = req.session;
  if (session) {
    try {
      const { unitType, level, quantity } = HireMercenarySchema.parse(req.body);
      const user = await prisma.users.findUnique({
        where: { id: session.user.id },
      });
      if (!user) {
        return res.status(400).json({ status: 'failed', message: 'User not found' });
      }

      const unit = UnitTypes.find(u => u.type === unitType && u.level === level);
      if (!unit) {
        return res.status(400).json({ status: 'failed', message: 'Invalid unit type or level' });
      }

      const unitCost = BigInt(unit.cost);
      const totalCost = unitCost * BigInt(quantity);
      if (user.gold < totalCost) {
        return res.status(400).json({ status: 'failed', message: 'Insufficient gold' });
      }

      // Check fort level requirement for mercenaries (e.g., level 1 at fort 5, level 2 at 8, level 3 at 11)
      const requiredFortLevel = 5 + (level - 1) * 3;
      if (user.fort_level < requiredFortLevel) {
        return res.status(400).json({ status: 'failed', message: `Fort level too low. Requires fort level ${requiredFortLevel} for level ${level} mercenaries.` });
      }

      // Add new mercenary batch with expiresAt (30 days)
      const currentMercs = (user.mercenaries as any[]) || [];
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const newMerc = { type: unitType, level, quantity, expiresAt };
      const updatedMercs = [...currentMercs, newMerc];

      await prisma.users.update({
        where: { id: session.user.id },
        data: {
          gold: { decrement: totalCost },
          mercenaries: updatedMercs,
        },
      });

      const ip = getRequestIp(req);
      await logAction(session.user.id, 'HIRE_MERCENARY', ip, { unitType, level, quantity, cost: totalCost.toString(), expiresAt: expiresAt.toISOString() });

      return res.status(200).json({ status: 'success', mercenaries: updatedMercs, remainingGold: (BigInt(user.gold) - totalCost).toString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.format() });
      }
      console.error(error);
      return res.status(500).json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};

export default withAuth(handler);