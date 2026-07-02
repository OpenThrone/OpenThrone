import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
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

  const verificationCode = Math.random().toString(36).substring(2, 15);
  try {
    const pr = await prisma.passwordReset.create({
      data: {
        userId: context.body.userId,
        verificationCode,
        type: 'PASSWORD',
      },
    });
    return res.status(201).json({
      success: true,
      resetId: pr.id,
      message: 'Password reset initiated. User must complete via email link.',
    });
  } catch (err) {
    logError('Failed to initiate password reset:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}

export default guardedHandler(handler);
