import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const IdQuerySchema = z.object({
  id: z.string().pipe(z.coerce.number()),
});

const AttackLogACLSchema = z.object({
  userId: z.number(),
  roomId: z.number(),
  participantIds: z.array(z.number()).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'attack',
  querySchema: IdQuerySchema,
  bodySchema: AttackLogACLSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof IdQuerySchema>;
    body: z.infer<typeof AttackLogACLSchema>;
  },
) {
  try {
    const { id: attackLogId } = context.query;
    const { userId, roomId, participantIds } = context.body;

    const result = await BattleService.manageAttackLogACL(attackLogId, {
      userId,
      roomId,
      participantIds,
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error sharing attack log:', error);
    return res.status(500).json({
      message: 'An error occurred while sharing the attack log',
      error: error.message,
    });
  }
}

export default guardedHandler(handler);
