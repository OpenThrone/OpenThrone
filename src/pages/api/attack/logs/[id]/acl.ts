import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const IdQuerySchema = z.object({
  id: z.string().pipe(z.coerce.number()),
});

// The acting user is always the session user; any body userId is stripped and ignored.
const AttackLogACLSchema = z.object({
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
  const sessionUserId = Number(req.session?.user?.id);
  if (!req.session || !Number.isSafeInteger(sessionUserId)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { id: attackLogId } = context.query;
    const { roomId, participantIds } = context.body;

    const result = await BattleService.manageAttackLogACL(attackLogId, {
      userId: sessionUserId,
      roomId,
      participantIds,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (
      error.message?.includes('do not have permission') ||
      error.message?.includes('not a participant') ||
      error.message?.includes('Chat room not found')
    ) {
      return res.status(403).json({ message: publicErrorMessage(error) });
    }
    logError('Error sharing attack log:', error);
    return res.status(500).json({
      message: 'An error occurred while sharing the attack log',
    });
  }
}

export default guardedHandler(handler);
