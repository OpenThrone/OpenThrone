import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  messageId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
  reason: z.string().min(1).max(500),
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
    const existing = await prisma.chatMessage.findUnique({
      where: { id: context.body.messageId },
    });
    if (!existing) return res.status(404).json({ error: 'Message not found' });

    const result = await prisma.chatMessage.update({
      where: { id: context.body.messageId },
      data: {
        content: context.body.content,
        originalContent: existing.originalContent ?? existing.content,
        editReason: context.body.reason,
        moderatedByUserId: Number(staffUserId),
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    logError('Failed to edit chat message:', err);
    return res.status(500).json({ error: 'Failed to edit message' });
  }
}

export default guardedHandler(handler);
