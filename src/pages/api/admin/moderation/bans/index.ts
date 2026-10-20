import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

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
  // Ban rows include account emails; record who read them before returning.
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_BANNED_USERS_READ',
    ip: getRequestIp(req),
    details: {
      limit,
      offset,
      resultCount: result.bans.length,
      total: result.total,
      userIds: result.bans.map((ban) => ban.user_id),
    },
  });
  return res.status(200).json(result);
}

export default guardedHandler(handler);
