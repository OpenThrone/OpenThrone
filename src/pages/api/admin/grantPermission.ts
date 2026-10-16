import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { checkStaffTargetAction } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import { isPrivileged2FAEnforced } from '@/utils/securityPolicies';

const GrantPermissionSchema = z.object({
  user: z.string().min(1),
  permission: z.nativeEnum(PermissionType),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: GrantPermissionSchema,
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof GrantPermissionSchema> },
) => {
  const { user, permission } = context.body;
  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);

  try {
    const currentUser = await prisma.users.findUnique({
      where: { display_name: user },
      include: {
        permissions: { where: { revokedAt: null } },
      },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Other administrators' access is managed only by themselves.
    const denial = await checkStaffTargetAction(adminUserId, currentUser.id, {
      allowSelf: true,
    });
    if (denial) {
      await logAction(adminUserId, 'ADMIN_PERMISSION_GRANT_DENIED', ip, {
        targetUserId: currentUser.id,
        permission,
        reason: denial.reason,
      });
      return res.status(denial.status).json({ error: denial.error });
    }

    if (
      isPrivileged2FAEnforced() &&
      (permission === PermissionType.MANAGE_USERS ||
        permission === PermissionType.MANAGE_ACCOUNT_STATUS) &&
      !currentUser.twoFactorSecret
    ) {
      return res.status(400).json({
        error:
          'Cannot grant privileged permission until user enables 2FA first.',
      });
    }

    const existingPermission = currentUser.permissions?.find(
      (perm) => perm.type === permission,
    );

    if (existingPermission) {
      // Already has the requested permission, so just return success.
      return res
        .status(200)
        .json({ status: 'User already has that permission' });
    }

    // The grant only exists if its audit row commits with it.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${currentUser.id} FOR UPDATE`;
      const currentDenial = await checkStaffTargetAction(
        adminUserId,
        currentUser.id,
        { allowSelf: true, client: tx },
      );
      if (currentDenial) throw new Error(currentDenial.error);
      const grant = await tx.permissionGrant.create({
        data: {
          user_id: currentUser.id,
          type: permission,
          grantedByUserId: Number.isFinite(adminUserId)
            ? adminUserId
            : undefined,
        },
      });
      await logActionStrict(
        {
          userId: adminUserId,
          action: 'ADMIN_PERMISSION_GRANT',
          ip,
          targetUserId: currentUser.id,
          entityType: 'PermissionGrant',
          entityId: grant.id,
          details: { permission },
        },
        tx,
      );
    });

    return res.status(200).json({ status: 'Successfully granted permission' });
  } catch (error) {
    logError('Failed to grant permission:', error);
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
    });
  }
};

export default guardedHandler(handler);
