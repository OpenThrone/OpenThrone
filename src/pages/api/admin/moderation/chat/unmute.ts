import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({ muteId: z.number().int().positive() });

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MODERATE_CHAT],
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

  try {
    const mute = await prisma.chatMute.update({
      where: { id: context.body.muteId },
      data: {
        revokedAt: new Date(),
        revokedByUserId: Number(staffUserId),
      },
    });
    return res.status(200).json(mute);
  } catch (err) {
    logError('Failed to unmute user:', err);
    return res.status(500).json({ error: 'Failed to unmute user' });
  }
}

export default guardedHandler(handler);
