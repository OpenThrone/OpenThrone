'use server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { ArmoryService } from '@/services';

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

    const result = await ArmoryService.hireMercenary({ userId: session.user.id, unitType, level, quantity });

    const ip = getRequestIp(req);
    await logAction(session.user.id, 'HIRE_MERCENARY', ip, { unitType, level, quantity, cost: result.cost, expiresAt: result.expiresAt?.toISOString?.() });

    return res.status(200).json({ status: 'success', mercenaries: result.mercenaries, remainingGold: result.remainingGold });
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