import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { startNewEra } from '@/services/Era.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ERAS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const eras = await prisma.era.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { userEras: true } } },
    });
    return res.status(200).json(eras);
  }

  if (req.method === 'POST') {
    try {
      const newEra = await startNewEra();
      return res.status(200).json(newEra);
    } catch (err) {
      logError('Failed to start new era:', err);
      return res.status(500).json({ error: 'Failed to start new era' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
