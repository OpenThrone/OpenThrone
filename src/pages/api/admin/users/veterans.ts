import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
/** Read-only veteran record listing; hashes never leave the server. */
export default withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: Query,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Query> },
) => {
  try {
    const { page } = context.query;
    const data = await prisma.$transaction(async (tx) => {
      await logActionStrict(
        {
          userId: Number(req.session.user.id),
          action: 'ADMIN_VETERAN_RECORDS_READ',
          ip: getRequestIp(req),
          details: { page },
        },
        tx,
      );
      const [total, records] = await Promise.all([
        tx.veteranRecord.count(),
        tx.veteranRecord.findMany({
          orderBy: { id: 'desc' },
          skip: (page - 1) * 50,
          take: 50,
          select: {
            id: true,
            title: true,
            sourceUserId: true,
            originalJoinedAt: true,
            recordedAt: true,
            expiresAt: true,
            claimedByUserId: true,
            claimedAt: true,
          },
        }),
      ]);
      return { total, records, page, pageSize: 50 };
    });
    return res.status(200).json(data);
  } catch {
    logError('Veteran record listing failed');
    return res.status(500).json({ error: 'Failed to load veteran records' });
  }
});
