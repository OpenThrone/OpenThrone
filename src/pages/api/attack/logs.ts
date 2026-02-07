import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const AttackLogsQuerySchema = z.object({
  page: z.coerce.number().int().optional().default(0),
  limit: z.coerce.number().int().optional().default(10),
  player: z.string().optional(),
  minPillage: z.coerce.number().int().optional(),
  maxPillage: z.coerce.number().int().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: AttackLogsQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof AttackLogsQuerySchema> },
) {
  const { session } = req;
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = session.user.id;

  const { page, limit, player, minPillage, maxPillage, sortBy, sortOrder } =
    context.query;

  try {
    const result = await BattleService.getAttackLogs(userId, {
      page,
      limit,
      player,
      minPillage,
      maxPillage,
      sortBy,
      sortOrder,
    });

    res.status(200).json(result);
  } catch (error) {
    logError('Error getting attack logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export default guardedHandler(handler);
