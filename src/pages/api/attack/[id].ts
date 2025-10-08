import { AttackService } from '@/services/AttackService';
import { withAuth } from '@/middleware/auth';
import { logAction, getRequestIp } from '@/utils/auditLogger';
import { IdQuerySchema, AttackSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { NextApiResponse } from 'next';
import { logDebug } from '@/utils/logger';
import prisma from "@/lib/prisma";

const handler = async (req, res: NextApiResponse) => {
  const session = req.session;
  if (session) {
    try {
      const queryData = IdQuerySchema.parse(req.query);
      const bodyData = AttackSchema.parse(req.body);
      const { id } = queryData;
      const { turns } = bodyData;

      // Convert session user ID to number for comparison
      const sessionUserId = typeof session.user.id === 'string' ? parseInt(session.user.id, 10) : session.user.id;

      if (sessionUserId === id) {
        return res.status(400).json({ status: 'failed', message: 'Cannot attack yourself' });
      }

      logDebug(`User ${sessionUserId} is attempting to attack user ${id} for ${turns} turns`);

      // Check if both attacker and defender exist
      const [attackerUser, defenderUser] = await Promise.all([
        prisma.users.findUnique({
          where: { id: sessionUserId },
        }),
        prisma.users.findUnique({
          where: { id: id },
        })
      ]);
      logDebug(`Attacker: ${attackerUser}, Defender: ${defenderUser}`);

      if (!attackerUser) {
        return res.status(400).json({ status: 'failed', message: 'Attacker user not found' });
      }

      if (!defenderUser) {
        return res.status(400).json({ status: 'failed', message: 'Defender user not found' });
      }

      if (turns > attackerUser.attack_turns) {
        return res.status(400).json({ status: 'failed', message: 'Insufficient attack turns' });
      }

      const results = await AttackService.executeAttack(
        sessionUserId,
        id,
        turns
      );

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