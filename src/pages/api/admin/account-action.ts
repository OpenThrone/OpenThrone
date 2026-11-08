import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AdminService } from '@/services';
import { AccountAnonymizationService } from '@/services/AccountAnonymization.service';
import { endSupporterBillingSoon } from '@/services/supporter/AccountBilling.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction, isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const AccountActionSchema = z
  .object({
    userId: z.number().int().positive(),
    action: z.enum(['SUSPENDED', 'BANNED', 'CLOSED', 'ACTIVE']),
    duration: z.number().int().min(1).max(3650).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

class AccountStatusConflict extends Error {}

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ACCOUNT_STATUS],
  rateLimitProfile: 'admin',
  bodySchema: AccountActionSchema,
});

/** Handles admin account action API requests. */
export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AccountActionSchema> },
) => {
  const { userId, action, duration, reason } = context.body;
  const sessionUserId = req.session?.user?.id;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adminUserId = Number(sessionUserId);
  const ip = getRequestIp(req);
  if (action === 'CLOSED' && !(await isAdmin(adminUserId))) {
    return res
      .status(403)
      .json({ error: 'Only administrators can close accounts' });
  }

  // No action on yourself (lockout) or on administrators/equal-rank staff (takeover).
  const denial = await checkStaffTargetAction(adminUserId, userId);
  if (denial) {
    await logAction(adminUserId, 'ADMIN_ACCOUNT_ACTION_DENIED', ip, {
      targetUserId: userId,
      action,
      reason: denial.reason,
    });
    return res.status(denial.status).json({ error: denial.error });
  }

  try {
    const now = new Date();
    let endDate = null;

    if (duration && action !== 'CLOSED') {
      endDate = new Date();
      endDate.setDate(now.getDate() + duration);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const currentDenial = await checkStaffTargetAction(adminUserId, userId, {
        client: tx,
      });
      if (currentDenial) throw new Error(currentDenial.error);
      const target = await tx.users.findUnique({
        where: { id: userId },
        select: { anonymizedAt: true },
      });
      if (action !== 'CLOSED' && target?.anonymizedAt) {
        throw new AccountStatusConflict(
          'Anonymized accounts cannot be reopened or assigned a non-CLOSED status',
        );
      }
      // A scheduled erasure keeps the account CLOSED; reopening it here would
      // leave the erasure queued. Cancelling the erasure reopens it.
      if (action !== 'CLOSED') {
        const pendingErasure = await tx.accountErasureRequest.findFirst({
          where: { userId, status: 'PENDING' },
          select: { id: true },
        });
        if (pendingErasure) {
          throw new AccountStatusConflict(
            'This account is scheduled for deletion. Cancel the deletion in the Privacy tab first.',
          );
        }
      }
      // End current statuses if necessary
      await tx.accountStatusHistory.updateMany({
        where: {
          user_id: userId,
          end_date: null,
        },
        data: {
          end_date: now,
        },
      });

      // Create new status entry
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: action,
          start_date: now,
          end_date: endDate,
          reason: reason || `${action} by admin`,
          admin_id: adminUserId,
        },
      });

      // A closed account must not keep staff powers or a usable password.
      if (action === 'CLOSED') {
        await AdminService.revokeAccountAccess(tx, userId);
      }

      // Sanctioned accounts keep a keyed email hash (expiry = sanction end)
      // so they cannot evade the sanction by re-registering; reactivation to
      // ACTIVE clears it.
      if (action === 'BANNED' || action === 'SUSPENDED') {
        await AccountAnonymizationService.recordSanctionBlock(
          tx,
          userId,
          endDate,
        );
      } else if (action === 'ACTIVE') {
        await AccountAnonymizationService.clearSanctionBlocks(tx, userId);
      }

      // Commits with the status change; a failed write rolls it back.
      await logActionStrict(
        {
          userId: adminUserId,
          action: 'ADMIN_ACCOUNT_ACTION',
          ip,
          targetUserId: userId,
          details: {
            action,
            duration: duration ?? null,
            reason: reason ?? null,
          },
        },
        tx,
      );
    });

    // A ban or closure stops renewals; refunds stay a separate admin action.
    if (action === 'BANNED' || action === 'CLOSED')
      await endSupporterBillingSoon(userId, 'period_end');
    res.status(200).json({ message: `User has been ${action.toLowerCase()}` });
  } catch (error) {
    if (error instanceof AccountStatusConflict)
      return res.status(409).json({ error: publicErrorMessage(error) });
    logError(`Error performing ${action} on user:`, error);
    res.status(500).json({ error: `Failed to perform action ${action}` });
  }
};

export default guardedHandler(handler);
