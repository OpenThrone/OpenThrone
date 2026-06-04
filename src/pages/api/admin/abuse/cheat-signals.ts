import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHEAT_SIGNALS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const signals = await CheatDetectionService.listSignals({
    status: req.query.status as any,
    severity: req.query.severity as any,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    limit: Number(req.query.limit) || 25,
    offset: Number(req.query.offset) || 0,
  });
  return res.status(200).json(signals);
}

export default guardedHandler(handler);
