import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AuthService } from '@/services/Auth.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const Schema = z.object({
  userId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof Schema> },
) {
  const staffUserId = req.session?.user?.id;
  if (!staffUserId) return res.status(401).json({ error: 'Unauthorized' });

  const actorId = Number(staffUserId);
  const targetUserId = context.body.userId;
  const ip = getRequestIp(req);

  // A reset on an administrator or equal-rank staff account enables takeover.
  const denial = await checkStaffTargetAction(actorId, targetUserId, {
    allowSelf: true,
  });
  if (denial) {
    await logAction(actorId, 'ADMIN_PASSWORD_RESET_DENIED', ip, {
      targetUserId,
      reason: denial.reason,
    });
    return res.status(denial.status).json({ error: denial.error });
  }

  try {
    const pr = await AuthService.requestPasswordReset(targetUserId, {
      beforeCommit: async (tx, reset) => {
        const currentDenial = await checkStaffTargetAction(
          actorId,
          targetUserId,
          { allowSelf: true, client: tx },
        );
        if (currentDenial) throw new Error(currentDenial.error);
        await logActionStrict(
          {
            userId: actorId,
            action: 'ADMIN_PASSWORD_RESET_INITIATED',
            ip,
            targetUserId,
            entityType: 'PasswordReset',
            entityId: reset.id,
          },
          tx,
        );
      },
    });
    return res.status(201).json({
      success: true,
      resetId: pr.id,
      message: 'Password reset email sent.',
    });
  } catch (err) {
    logError('Failed to initiate password reset:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}

export default guardedHandler(handler);
