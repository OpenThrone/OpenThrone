'use server';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = req.session;
  if (!session?.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const {
    page = 0,
    limit = 10,
    player,
    minPillage,
    maxPillage,
    sortBy,
    sortOrder
  } = req.query;

  const skip = parseInt(page.toString(), 10) * parseInt(limit.toString(), 10);

  const whereClause = {
    OR: [
      { attacker_id: session.user.id },
      { defender_id: session.user.id },
    ],
    ...(player ? {
      OR: [
        { attackerPlayer: { display_name: { contains: player as string, mode: 'insensitive' } } },
        { defenderPlayer: { display_name: { contains: player as string, mode: 'insensitive' } } },
      ],
    } : {}),
    ...(minPillage ? { stats: { path: ['pillagedGold'], gt: parseInt(minPillage.toString(), 10) } } : {}),
    ...(maxPillage ? { stats: { path: ['pillagedGold'], lt: parseInt(maxPillage.toString(), 10) } } : {}),
  };

  const orderByClause = sortBy && sortOrder ? { [sortBy as string]: sortOrder } : { timestamp: 'desc' };
  const results = await prisma.attack_log.findMany({
    where: whereClause,
    orderBy: orderByClause,
    skip: skip,
    take: parseInt(limit.toString(), 10),
    include: {
      attackerPlayer: { select: { id: true, display_name: true, avatar: true } },
      defenderPlayer: { select: { id: true, display_name: true, avatar: true } },
    },
  });

  const totalCount = await prisma.attack_log.count({ where: whereClause });

  res.status(200).json({
    data: results,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / parseInt(limit.toString(), 10)),
    timestamp: new Date().toISOString()
  });
}

export default withAuth(handler)
