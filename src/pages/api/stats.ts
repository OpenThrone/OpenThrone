import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { ensureActiveEra } from '@/services/Era.service';
import { logError } from '@/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const currentEra = await ensureActiveEra();

    const [players, battles, alliances] = await Promise.all([
      prisma.users.count({
        where: { currentEraId: currentEra.id },
      }),
      prisma.attack_log.count({
        where: { timestamp: { gte: currentEra.startDate } },
      }),
      prisma.alliances.count(),
    ]);

    const stats = {
      players,
      battles,
      alliances,
      epoch: currentEra.name,
    };
    return res.status(200).json(stats);
  } catch (error) {
    logError('Failed to fetch stats', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
