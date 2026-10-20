import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHEAT_SIGNALS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const filters = {
    status: req.query.status as any,
    severity: req.query.severity as any,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    limit: Number(req.query.limit) || 25,
    offset: Number(req.query.offset) || 0,
  };
  const signals = await CheatDetectionService.listSignals(filters);
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_CHEAT_SIGNALS_READ',
    ip: getRequestIp(req),
    targetUserId: filters.userId ?? null,
    details: {
      status: filters.status ?? null,
      severity: filters.severity ?? null,
      limit: filters.limit,
      offset: filters.offset,
      resultCount: signals.signals.length,
      total: signals.total,
    },
  });
  return res.status(200).json(signals);
}

export default guardedHandler(handler);
