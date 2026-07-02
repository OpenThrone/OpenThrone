import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  search: z.string().optional(),
  roomId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHAT_LOGS],
  rateLimitProfile: 'admin',
  querySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Schema> },
) {
  const where: Record<string, unknown> = {};
  if (context.query.roomId) where.roomId = context.query.roomId;
  if (context.query.search) {
    where.OR = [
      { content: { contains: context.query.search, mode: 'insensitive' } },
      { senderId: Number(context.query.search) || undefined },
    ];
  }

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where,
      include: { sender: { select: { id: true, display_name: true } } },
      orderBy: { sentAt: 'desc' },
      take: context.query.limit,
      skip: context.query.offset,
    }),
    prisma.chatMessage.count({ where }),
  ]);

  return res.status(200).json({ messages, total });
}

export default guardedHandler(handler);
