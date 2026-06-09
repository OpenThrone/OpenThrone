import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({ signalId: z.number().int().positive() });

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHEAT_SIGNALS],
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

  const action = (req.url || '').split('/').pop();
  let result;
  if (action === 'acknowledge') {
    result = await CheatDetectionService.acknowledge(
      Number(staffUserId),
      context.body.signalId,
    );
  } else if (action === 'dismiss') {
    result = await CheatDetectionService.dismiss(
      Number(staffUserId),
      context.body.signalId,
    );
  } else if (action === 'takeAction') {
    result = await CheatDetectionService.takeAction(
      Number(staffUserId),
      context.body.signalId,
    );
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }
  return res.status(200).json(result);
}

export default guardedHandler(handler);
