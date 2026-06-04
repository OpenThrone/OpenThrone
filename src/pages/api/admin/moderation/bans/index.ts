import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ACCOUNT_STATUS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const result = await ModerationService.getBannedUsers(limit, offset);
  return res.status(200).json(result);
}

export default guardedHandler(handler);
