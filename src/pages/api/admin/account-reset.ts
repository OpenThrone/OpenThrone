import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AdminService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const AccountResetSchema = z.object({
  userId: z.number().int(),
  reason: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: AccountResetSchema,
});

/** Handles admin account reset API requests. */
export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AccountResetSchema> },
) => {
  const { userId, reason } = context.body;
  const sessionUserId = req.session?.user?.id;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adminUserId = Number(sessionUserId);
  const ip = getRequestIp(req);

  const denial = await checkStaffTargetAction(adminUserId, userId);
  if (denial) {
    await logAction(adminUserId, 'ADMIN_ACCOUNT_RESET_DENIED', ip, {
      targetUserId: userId,
      reason: denial.reason,
    });
    return res.status(denial.status).json({ error: denial.error });
  }

  try {
    const result = await AdminService.resetAccount(
      adminUserId,
      { userId, reason },
      {
        // Commits with the reset; a failed write rolls the reset back.
        beforeCommit: (tx, { oldUserId, newUserId }) =>
          logActionStrict(
            {
              userId: adminUserId,
              action: 'ADMIN_ACCOUNT_RESET',
              ip,
              targetUserId: oldUserId,
              details: { oldUserId, newUserId, reason: reason ?? null },
            },
            tx,
          ),
      },
    );
    res
      .status(200)
      .json({ message: result.message, newUserId: result.newUserId });
  } catch (error) {
    logError('Error resetting account:', error);
    res.status(500).json({ error: 'Failed to reset account' });
  }
};

export default guardedHandler(handler);
