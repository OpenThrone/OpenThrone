import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { GameEventService } from '@/services/GameEvent.service';
import type { AuthenticatedRequest } from '@/types/api';

const CreateSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_EVENTS],
  rateLimitProfile: 'admin',
  bodySchema: CreateSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof CreateSchema> },
) {
  if (req.method === 'GET') {
    const events = await GameEventService.list();
    return res.status(200).json(events);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const event = await GameEventService.create(Number(userId), {
      ...(context.body as Record<string, unknown>),
      config: {},
    } as any);
    return res.status(201).json(event);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
