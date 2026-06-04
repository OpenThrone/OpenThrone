import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const MuteSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().min(1).max(500).optional(),
  durationMinutes: z.number().int().positive().max(10080).optional(),
  roomId: z.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MODERATE_CHAT],
  rateLimitProfile: 'admin',
  bodySchema: MuteSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof MuteSchema> },
) {
  const staffUserId = req.session?.user?.id;
  if (!staffUserId) return res.status(401).json({ error: 'Unauthorized' });

  const endsAt = context.body.durationMinutes
    ? new Date(Date.now() + context.body.durationMinutes * 60 * 1000)
    : null;

  try {
    const mute = await prisma.chatMute.create({
      data: {
        userId: context.body.userId,
        roomId: context.body.roomId,
        createdByUserId: Number(staffUserId),
        reason: context.body.reason,
        endsAt,
      },
    });
    return res.status(201).json(mute);
  } catch (err) {
    logError('Failed to mute user:', err);
    return res.status(500).json({ error: 'Failed to mute user' });
  }
}

export default guardedHandler(handler);
