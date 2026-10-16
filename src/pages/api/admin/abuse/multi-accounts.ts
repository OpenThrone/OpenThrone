import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const Schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_MULTI_ACCOUNTS],
  rateLimitProfile: 'admin',
  querySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Schema> },
) {
  const clusters = await CheatDetectionService.getMultiAccountClusters(
    context.query.limit,
  );
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_MULTI_ACCOUNTS_READ',
    ip: getRequestIp(req),
    details: { limit: context.query.limit },
  });
  return res.status(200).json(clusters);
}

export default guardedHandler(handler);
