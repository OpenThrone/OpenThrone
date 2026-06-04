import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_AUDIT_LOGS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const logs = await ModerationService.getAuditLogs({
    action: req.query.action as string,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    targetUserId: req.query.targetUserId
      ? Number(req.query.targetUserId)
      : undefined,
    limit: Number(req.query.limit) || 50,
    offset: Number(req.query.offset) || 0,
  });
  return res.status(200).json(logs);
}

export default guardedHandler(handler);
