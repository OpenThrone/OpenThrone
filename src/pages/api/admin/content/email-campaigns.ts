import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

export default withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.SEND_MASS_MESSAGES],
  rateLimitProfile: 'admin',
})(async (req: AuthenticatedRequest, res: NextApiResponse) => {
  try {
    const campaigns = await prisma.$transaction(async (tx) => {
      await logActionStrict(
        {
          userId: Number(req.session.user.id),
          action: 'ADMIN_EMAIL_CAMPAIGNS_READ',
          ip: getRequestIp(req),
        },
        tx,
      );
      return tx.emailCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          kind: true,
          subject: true,
          status: true,
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          skippedCount: true,
          createdAt: true,
          createdBy: { select: { id: true, display_name: true } },
        },
      });
    });
    return res.status(200).json({
      campaigns,
      outboxEnabled: !!(await getRuntimeConfig()).emailOutboxEnabled,
    });
  } catch {
    logError('Campaign history failed');
    return res.status(500).json({ error: 'Failed to load campaigns' });
  }
});
