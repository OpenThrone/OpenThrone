import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
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
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof GrantPermissionSchema> },
) => {
  const { user, permission } = context.body;

  try {
    const currentUser = await prisma.users.findUnique({
      where: { display_name: user },
      include: {
        permissions: true,
      },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
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

    await prisma.permissionGrant.create({
      data: {
        user_id: currentUser.id,
        type: permission,
      },
    });

    await prisma.users.findUnique({
      where: { id: currentUser.id },
    });
    return res.status(200).json({ status: 'Successfully granted permission' });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
};

export default guardedHandler(handler);
