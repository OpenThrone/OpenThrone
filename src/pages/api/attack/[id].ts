import { BattleService } from '@/services';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { IdQuerySchema, AttackSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { NextApiResponse } from 'next';
import { logDebug } from '@/utils/logger';

const handler = async (req, res: NextApiResponse) => {
  const session = req.session;
  if (session) {
    try {
      const queryData = IdQuerySchema.parse(req.query);
      const bodyData = AttackSchema.parse(req.body);
      const { id } = queryData;
      const { turns } = bodyData;

      // Convert session user ID to number
      const sessionUserId = typeof session.user.id === 'string' ? parseInt(session.user.id, 10) : session.user.id;

      logDebug(`User ${sessionUserId} is attempting to attack user ${id} for ${turns} turns`);

      const results = await BattleService.executeAttack({
        attackerId: sessionUserId,
        defenderId: id,
        attackTurns: turns
      });

      const ip = getRequestIp(req);
      await logAction(sessionUserId, 'ATTACK', ip, { targetId: id, turns });

      return res
        .status(200)
        .json(results);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.format() });
      }
      console.error('Attack API error:', error);
      return res.status(500).json({ status: 'failed', message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return res.status(401).json({ status: 'failed', message: 'Unauthorized' });
}

export default withAuth(handler);