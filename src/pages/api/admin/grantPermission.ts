import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { withAuth } from '@/middleware/auth';

import prisma from '@/lib/prisma';

import { PermissionType } from '@prisma/client';
import { z } from 'zod';

const GrantPermissionSchema = z.object({
  user: z.string().min(1),
  permission: z.nativeEnum(PermissionType)
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const parseResult = GrantPermissionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }
  const { user, permission } = parseResult.data;

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized', msg: session });
  }

  const adminUserId = session.user.id;
  const adminUser = await prisma.users.findUnique({ where: { id: adminUserId }, include: { permissions: true } });

  if (!adminUser?.permissions?.some((perm) => perm.type === PermissionType.ADMINISTRATOR)) {
    // Logged in, but not an admin
    return res.status(401).json({ error: 'Unauthorized', msg: 'Current user is not an administrator.'});
  }

  try {
    const currentUser = await prisma.users.findUnique({ where: { display_name: user } });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingPermission = currentUser.permissions?.find((perm) => perm.type === permission);

    if (existingPermission) {
      // Already has the requested permission, so just return success.
      return res.status(200).json({status: 'User already has that permission'});
    }

    const permissionGrant = await prisma.PermissionGrant.create({
      data: {
        user_id: currentUser.id,
        type: permission,
      }
    });

    const newUser = await prisma.users.findUnique({ where: { id: currentUser.id } });
    return res.status(200).json({status: 'Successfully granted permission'});
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

export default withAuth(handler);
