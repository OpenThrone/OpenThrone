import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  GameEventService,
  UpdateEventSchema,
} from '@/services/GameEvent.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const ActionSchema = z
  .object({ action: z.enum(['activate', 'deactivate']).optional() })
  .and(UpdateEventSchema);
const QuerySchema = z.object({ eventId: z.coerce.number().int().positive() });

const guardedHandler = withApiGuard({
  methods: ['PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_EVENTS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
  bodySchema: ActionSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof QuerySchema>;
    body: z.infer<typeof ActionSchema>;
  },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { eventId } = context.query;

  try {
    if (req.method === 'PUT' && context.body.action === 'activate') {
      const event = await GameEventService.activate(Number(userId), eventId);
      await logAction(
        Number(userId),
        'ADMIN_GAME_EVENT_ACTIVATE',
        getRequestIp(req),
        { eventId },
      );
      return res.status(200).json(event);
    }
    if (req.method === 'PUT' && context.body.action === 'deactivate') {
      const event = await GameEventService.deactivate(Number(userId), eventId);
      await logAction(
        Number(userId),
        'ADMIN_GAME_EVENT_DEACTIVATE',
        getRequestIp(req),
        { eventId },
      );
      return res.status(200).json(event);
    }
    if (req.method === 'PUT') {
      const { action: _action, ...changes } = context.body;
      const event = await GameEventService.update(
        Number(userId),
        eventId,
        changes,
      );
      await logAction(
        Number(userId),
        'ADMIN_GAME_EVENT_UPDATE',
        getRequestIp(req),
        { eventId },
      );
      return res.status(200).json(event);
    }
    await GameEventService.delete(eventId);
    await logAction(
      Number(userId),
      'ADMIN_GAME_EVENT_DELETE',
      getRequestIp(req),
      { eventId },
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    logError('Failed to update game event:', error);
    return res.status(400).json({ error: 'Failed to update event' });
  }
}

export default guardedHandler(handler);
