'use server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { UnitTypes } from '@/constants/Units';

const DismissMercenarySchema = z.object({
  unitType: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
  level: z.number().min(1).max(3),
  quantity: z.number().min(1).max(100),
});

const handler = async (req, res) => {
  const session = req.session;
  if (session) {
    try {
      const { unitType, level, quantity } = DismissMercenarySchema.parse(req.body);
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

      const currentMercs = (user.mercenaries as any[]) || [];
      let totalAvailable = 0;
      for (const merc of currentMercs) {
        if (merc.type === unitType && merc.level === level) {
          totalAvailable += merc.quantity;
        }
      }
      if (totalAvailable < quantity) {
        return res.status(400).json({ status: 'failed', message: 'Insufficient mercenaries to dismiss' });
      }

      const unitCost = BigInt(unit.cost);
      const originalCost = unitCost * BigInt(quantity);
      const refund = originalCost / BigInt(2); // 50% refund

      // Update mercenaries: subtract quantity across matching entries
      let remainingToDismiss = quantity;
      const updatedMercs = currentMercs.filter(merc => {
        if (merc.type === unitType && merc.level === level && remainingToDismiss > 0) {
          const subtract = Math.min(merc.quantity, remainingToDismiss);
          merc.quantity -= subtract;
          remainingToDismiss -= subtract;
          if (merc.quantity <= 0) {
            return false; // Remove if zero or negative
          }
          return true;
        }
        return true;
      });

      await prisma.users.update({
        where: { id: session.user.id },
        data: {
          gold: { increment: refund },
          mercenaries: updatedMercs,
        },
      });

      const ip = getRequestIp(req);
      await logAction(session.user.id, 'DISMISS_MERCENARY', ip, { unitType, level, quantity, refund: refund.toString() });

      return res.status(200).json({ status: 'success', mercenaries: updatedMercs, addedGold: refund.toString() });
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