import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  messageId: z.number().int().positive(),
  reason: z.string().min(1).max(500).optional(),
});

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
    const result = await prisma.chatMessage.update({
      where: { id: context.body.messageId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: Number(staffUserId),
        editReason: context.body.reason,
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    logError('Failed to delete chat message:', err);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}

export default guardedHandler(handler);
