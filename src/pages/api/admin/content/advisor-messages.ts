import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  message: z.string().min(1).max(500),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_CONTENT],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET') {
    const messages = await prisma.advisor_messages.findMany({
      orderBy: { sort_order: 'asc' },
      include: { createdBy: { select: { id: true, display_name: true } } },
    });
    return res.status(200).json(messages);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const msg = await prisma.advisor_messages.create({
        data: {
          message: context.body!.message,
          is_active: context.body!.is_active,
          sort_order: context.body!.sort_order,
          created_by: Number(userId),
        },
      });
      return res.status(201).json(msg);
    } catch (err) {
      logError('Failed to create advisor message:', err);
      return res
        .status(500)
        .json({ error: 'Failed to create advisor message' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
