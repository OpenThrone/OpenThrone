import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  CreateEventSchema,
  GameEventService,
} from '@/services/GameEvent.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_EVENTS],
  rateLimitProfile: 'admin',
  bodySchema: CreateEventSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof CreateEventSchema> },
) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json(await GameEventService.list());
    } catch (error) {
      logError('Failed to list game events:', error);
      return res.status(500).json({ error: 'Failed to load events' });
    }
  }
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const event = await GameEventService.create(Number(userId), context.body);
    await logAction(
      Number(userId),
      'ADMIN_GAME_EVENT_CREATE',
      getRequestIp(req),
      { eventId: event.id },
    );
    return res.status(201).json(event);
  } catch (error) {
    logError('Failed to create game event:', error);
    return res
      .status(400)
      .json({ error: 'Invalid event or event key already exists' });
  }
}

export default guardedHandler(handler);
