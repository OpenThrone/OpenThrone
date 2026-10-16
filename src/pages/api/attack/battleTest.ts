import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const BattleTestSchema = z.object({
  aId: z.coerce.number().int().optional(),
  dId: z.coerce.number().int(),
});

const handler = async (req, res) => {
  const { session } = req;
  if (session) {
    const sessionUserId = parseInt(session.user.id.toString());
    // Simulation output reveals hidden defender values, so site admins only.
    if (!(await isAdmin(sessionUserId))) {
      return res.status(403).json({ status: 'failed', message: 'Forbidden' });
    }

    const validatedQuery = BattleTestSchema.safeParse(req.query);
    if (!validatedQuery.success) {
      return res.status(400).json({
        status: 'failed',
        msg: 'Invalid query parameters',
        details: validatedQuery.error.flatten().fieldErrors,
      });
    }

    let attackerId = sessionUserId;

    // Admins may choose the attacker.
    if (validatedQuery.data.aId !== undefined) {
      attackerId = validatedQuery.data.aId;
    }

    if (validatedQuery.data.dId === undefined) {
      return res
        .status(400)
        .json({ status: 'failed', msg: 'Defender ID "dId" not set' });
    }

    const defenderId = validatedQuery.data.dId;

    try {
      const result = await BattleService.simulateBattle({
        attackerId,
        defenderId,
        turns: 10,
      });

      return res.status(200).json(result);
    } catch (error) {
      logError('Battle test error:', error);
      return res
        .status(500)
        .json({ status: 'failed', message: 'Internal server error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};

export default withAuth(handler);
