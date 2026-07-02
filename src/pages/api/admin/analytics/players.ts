import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_ANALYTICS],
  rateLimitProfile: 'admin',
});

async function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      dau,
      wau,
      mau,
      newToday,
      new7d,
      new30d,
      totalAttacks24h,
      totalAttacks7d,
    ] = await Promise.all([
      prisma.users.count({ where: { last_active: { gte: oneDayAgo } } }),
      prisma.users.count({ where: { last_active: { gte: sevenDaysAgo } } }),
      prisma.users.count({ where: { last_active: { gte: thirtyDaysAgo } } }),
      prisma.users.count({ where: { created_at: { gte: oneDayAgo } } }),
      prisma.users.count({ where: { created_at: { gte: sevenDaysAgo } } }),
      prisma.users.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
      prisma.attack_log.count({ where: { timestamp: { gte: oneDayAgo } } }),
      prisma.attack_log.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
    ]);

    return res.status(200).json({
      dau,
      wau,
      mau,
      newToday,
      new7d,
      new30d,
      totalAttacks24h,
      totalAttacks7d,
    });
  } catch (err) {
    logError('Failed to load analytics:', err);
    return res.status(500).json({ error: 'Failed to load analytics' });
  }
}

export default guardedHandler(handler);
