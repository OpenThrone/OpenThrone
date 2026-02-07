import md5 from 'md5';
import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

import { getSocketIO } from '@/lib/socket';
import { AttackSchema, IdQuerySchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import { enforceIdempotency } from '@/middleware/idempotency';
import { BattleService } from '@/services';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { logDebug, logError } from '@/utils/logger';

const handler = async (req, res: NextApiResponse) => {
  const { session } = req;
  if (session) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const queryData = IdQuerySchema.parse(req.query);
      const bodyData = AttackSchema.parse(req.body);
      const { id } = queryData;
      const { turns } = bodyData;

      // Convert session user ID to number
      const sessionUserId =
        typeof session.user.id === 'string'
          ? parseInt(session.user.id, 10)
          : session.user.id;

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
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
};

export default withAuth(handler);
