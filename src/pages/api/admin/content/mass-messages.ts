import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  recipientUserIds: z.array(z.number().int().positive()).optional(),
  sendToAll: z.boolean().default(false),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.SEND_MASS_MESSAGES],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof Schema> },
) {
  const senderId = req.session?.user?.id;
  if (!senderId) return res.status(401).json({ error: 'Unauthorized' });

  let recipients: number[];
  if (context.body.sendToAll) {
    const all = await prisma.users.findMany({ select: { id: true } });
    recipients = all.map((u) => u.id);
  } else if (
    context.body.recipientUserIds &&
    context.body.recipientUserIds.length > 0
  ) {
    recipients = context.body.recipientUserIds;
  } else {
    return res.status(400).json({ error: 'No recipients specified' });
  }

  try {
    const messages = await prisma.$transaction(
      recipients.map((rid) =>
        prisma.messages.create({
          data: {
            subject: context.body.subject,
            body: context.body.body,
            from_user_id: Number(senderId),
            to_user_id: rid,
          },
        }),
      ),
    );
    return res.status(200).json({ sent: messages.length });
  } catch (err) {
    logError('Failed to send mass message:', err);
    return res.status(500).json({ error: 'Failed to send messages' });
  }
}

export default guardedHandler(handler);
