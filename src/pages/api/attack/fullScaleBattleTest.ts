import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { logError } from '@/utils/logger';

const FullScaleBattleTestSchema = z.object({
  aId: z.coerce.number().int().optional(),
});

const handler = async (req, res) => {
  const { session } = req;
  if (session) {
    const validatedQuery = FullScaleBattleTestSchema.safeParse(req.query);
    if (!validatedQuery.success) {
      return res.status(400).json({
        status: 'failed',
        msg: 'Invalid query parameters',
        details: validatedQuery.error.flatten().fieldErrors,
      });
    }

    if (session.user.id !== 1 && session.user.id !== 2) {
      return res
        .status(401)
        .json({ status: 'failed', msg: 'Unauthorized', session });
    }

    let attackerId;
    if (
      (session.user.id === 1 || session.user.id === 2) &&
      validatedQuery.data.aId !== undefined
    ) {
      attackerId = validatedQuery.data.aId;
    }

    try {
      const result = await BattleService.fullScaleBattleTest(attackerId);
      return res.status(200).json(result);
    } catch (error) {
      logError('Full scale battle test error:', error);
      return res
        .status(500)
        .json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};
export default withAuth(handler);
