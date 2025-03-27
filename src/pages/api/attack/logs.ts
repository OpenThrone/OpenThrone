'use server';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  console.log('Fetching attack logs for user:', req.session);
  if (req.session.user.id) {
    const page = parseInt(req.query.page, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = page * limit;
    // Count total records for pagination
    const totalCount = await prisma.attack_log.count({
      where: {
        OR: [
          { attacker_id: parseInt(req.session.user.id, 10) },
          { defender_id: parseInt(req.session.user.id, 10) },
        ],
      },
    });
    // Get logs with player information
    const results = await prisma.attack_log.findMany({
      where: {
        OR: [
          { attacker_id: parseInt(req.session.user.id, 10) },
          { defender_id: parseInt(req.session.user.id, 10) },
        ],
      },
      orderBy: {
        timestamp: 'desc', // Most recent first
      },
      skip,
      take: limit,
      include: {
        // Include attacker information
        attackerPlayer: {
          select: {
            id: true,
            display_name: true,
            race: true,
          },
        },
        // Include defender information
        defenderPlayer: {
          select: {
            id: true,
            display_name: true,
            race:true
          },
        },
      },
    });
    res.status(200).json({
      data: results,
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

export default withAuth(handler)
