import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';

const Schema = z.object({ signalId: z.number().int().positive() });

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ACCOUNT_STATUS],
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
  if (!['acknowledge', 'dismiss', 'takeAction'].includes(action || '')) {
    return res.status(400).json({ error: 'Unknown action' });
  }
  try {
    const result = await CheatDetectionService.applyAction(
      Number(staffUserId),
      context.body.signalId,
      action as 'acknowledge' | 'dismiss' | 'takeAction',
      getRequestIp(req),
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Signal not found') {
      return res.status(404).json({ error: 'Signal not found' });
    }
    throw error;
  }
}

export default guardedHandler(handler);
