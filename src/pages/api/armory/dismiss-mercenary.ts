'use server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { ArmoryService } from '@/services';

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

      const result = await ArmoryService.dismissMercenary({ userId: session.user.id, unitType, level, quantity });

      const ip = getRequestIp(req);
      await logAction(session.user.id, 'DISMISS_MERCENARY', ip, { unitType, level, quantity, refund: result.addedGold });

      return res.status(200).json({ status: 'success', mercenaries: result.mercenaries, addedGold: result.addedGold });
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