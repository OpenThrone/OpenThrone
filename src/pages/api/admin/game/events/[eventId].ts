import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { GameEventService } from '@/services/GameEvent.service';
import type { AuthenticatedRequest } from '@/types/api';

const ActionSchema = z.object({ action: z.enum(['activate', 'deactivate']) });

const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_EVENTS],
  rateLimitProfile: 'admin',
  bodySchema: ActionSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof ActionSchema> },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const eventId = Number((context.query as { eventId: string }).eventId);
  if (Number.isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

  if (req.method === 'PUT' && req.body?.action === 'activate') {
    const event = await GameEventService.activate(Number(userId), eventId);
    return res.status(200).json(event);
  }

  if (req.method === 'PUT' && req.body?.action === 'deactivate') {
    const event = await GameEventService.deactivate(Number(userId), eventId);
    return res.status(200).json(event);
  }

  if (req.method === 'DELETE') {
    await GameEventService.delete(eventId);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
