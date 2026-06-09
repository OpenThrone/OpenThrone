import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_MULTI_ACCOUNTS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const clusters = await CheatDetectionService.getMultiAccountClusters(
    Number(req.query.limit) || 50,
  );
  return res.status(200).json(clusters);
}

export default guardedHandler(handler);
