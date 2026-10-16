import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const QuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(7),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { session } = req;
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = QuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const userId = Number(session.user.id);
  const { days } = parseResult.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const logs = await prisma.attack_log.findMany({
      where: {
        timestamp: { gt: since },
        OR: [{ attacker_id: userId }, { defender_id: userId }],
      },
      select: {
        attacker_id: true,
        defender_id: true,
        winner: true,
      },
    });

    const attackedMeIds = new Set<number>();
    const iAttackedIds = new Set<number>();
    const iBeatIds = new Set<number>();
    const theyBeatMeIds = new Set<number>();

    for (const log of logs) {
      if (log.defender_id === userId) {
        attackedMeIds.add(log.attacker_id);
        if (log.winner !== userId) {
          theyBeatMeIds.add(log.attacker_id);
        }
      }

      if (log.attacker_id === userId) {
        iAttackedIds.add(log.defender_id);
        if (log.winner === userId) {
          iBeatIds.add(log.defender_id);
        }
      }
    }

    return res.status(200).json({
      since: since.toISOString(),
      days,
      attackedMeIds: Array.from(attackedMeIds),
      iAttackedIds: Array.from(iAttackedIds),
      iBeatIds: Array.from(iBeatIds),
      theyBeatMeIds: Array.from(theyBeatMeIds),
    });
  } catch (error: any) {
    logError('Error building /battle/users filter meta', {
      userId,
      days,
      error,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(handler);
