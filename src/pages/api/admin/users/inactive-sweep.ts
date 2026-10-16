import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { runInactivitySweep } from '@/services/AccountInactivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const Body = z.object({ dryRun: z.boolean().default(true) });
export default withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  bodySchema: Body,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Body> },
) => {
  try {
    const dryRun = req.method === 'GET' || context.body?.dryRun !== false;
    const actorId = Number(req.session.user.id);
    const ip = getRequestIp(req);
    // Audit invocation before any work; each changed account is audited in its own transaction.
    await prisma.$transaction(async (tx) => {
      await logActionStrict(
        {
          userId: actorId,
          action: 'ADMIN_INACTIVITY_SWEEP',
          ip,
          details: { dryRun },
        },
        tx,
      );
    });
    return res
      .status(200)
      .json(await runInactivitySweep({ dryRun, actorId, ip }));
  } catch {
    logError('Admin inactivity sweep failed');
    return res.status(500).json({ error: 'Failed to run inactivity sweep' });
  }
});
