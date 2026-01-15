import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const AttackLogsQuerySchema = z.object({
  page: z.coerce.number().int().optional().default(0),
  limit: z.coerce.number().int().optional().default(10),
  player: z.string().optional(),
  minPillage: z.coerce.number().int().optional(),
  maxPillage: z.coerce.number().int().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { session } = req;
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const validatedQuery = AttackLogsQuerySchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      details: validatedQuery.error.flatten().fieldErrors,
    });
  }

  const userId = session.user.id;

  const { page, limit, player, minPillage, maxPillage, sortBy, sortOrder } =
    validatedQuery.data;

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
    console.error('Error getting attack logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export default withAuth(handler);
