import md5 from 'md5';
import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

import { getSocketIO } from '@/lib/socket';
import { AttackSchema, IdQuerySchema } from '@/lib/validation';
import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { logDebug, logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'attack',
  querySchema: IdQuerySchema,
  bodySchema: AttackSchema,
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: { id: number };
    body: { turns: number };
  },
) => {
  try {
    const { id } = context.query;
    const { turns } = context.body;
    const sessionUserId =
      typeof req.session?.user?.id === 'string'
        ? parseInt(req.session.user.id, 10)
        : Number(req.session?.user?.id);

    logDebug(
      `User ${sessionUserId} is attempting to attack user ${id} for ${turns} turns`,
    );

    const canProceed = await enforceIdempotency(req, res, {
      scope: `attack:${id}`,
      actorKey: String(sessionUserId),
    });
    if (!canProceed) {
      return;
    }

    const results = await BattleService.executeAttack({
      attackerId: sessionUserId,
      defenderId: id,
      attackTurns: turns,
    });

    if (results?.status === 'success' && results.attack_log) {
      const io = getSocketIO();
      const message = `You were attacked in battle ${results.attack_log}`;
      const hash = md5(message + results.attack_log + id);
      io?.to(`user-${id}`).emit('attackNotification', {
        message,
        hash,
        battleId: results.attack_log,
        attackerId: sessionUserId,
      });
    }

    const ip = getRequestIp(req);
    await logAction(sessionUserId, 'ATTACK', ip, { targetId: id, turns });

    return res.status(200).json(results);
  } catch (error) {
    if (error instanceof ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid input', details: error.format() });
    }
    logError('Attack API error:', error);
    return res.status(500).json({
      status: 'failed',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export default guardedHandler(handler);
