import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MODERATE_CHAT],
  rateLimitProfile: 'admin',
});

async function handler(_req: AuthenticatedRequest, res: NextApiResponse) {
  const mutes = await prisma.chatMute.findMany({
    where: {
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      revokedAt: null,
    },
    orderBy: { startsAt: 'desc' },
  });
  return res.status(200).json(mutes);
}

export default guardedHandler(handler);
