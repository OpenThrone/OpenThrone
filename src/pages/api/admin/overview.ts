import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_STAFF_DASHBOARD],
  rateLimitProfile: 'admin',
});

async function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers24h,
      newUsers7d,
      bannedUsers,
      totalAlliances,
      openReports,
      openAppeals,
      openCheatSignals,
      recentAttacks,
    ] = await Promise.all([
      prisma.users.count(),
      prisma.users.count({ where: { last_active: { gte: oneDayAgo } } }),
      prisma.users.count({ where: { created_at: { gte: sevenDaysAgo } } }),
      prisma.accountStatusHistory.count({
        where: { status: 'BANNED', end_date: null },
      }),
      prisma.alliances.count(),
      prisma.report.count({
        where: { status: { in: ['OPEN', 'TRIAGED', 'IN_REVIEW'] } },
      }),
      prisma.banAppeal.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      }),
      prisma.cheatSignal.count({ where: { status: 'OPEN' } }),
      prisma.attack_log.count({ where: { timestamp: { gte: oneDayAgo } } }),
    ]);

    return res.status(200).json({
      totalUsers,
      activeUsers24h,
      newUsers7d,
      bannedUsers,
      totalAlliances,
      openReports,
      openAppeals,
      openCheatSignals,
      recentAttacks,
    });
  } catch (err) {
    logError('Failed to load overview:', err);
    return res.status(500).json({ error: 'Failed to load overview' });
  }
}

export default guardedHandler(handler);
