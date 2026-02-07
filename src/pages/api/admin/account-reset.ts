import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AdminService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const AccountResetSchema = z.object({
  userId: z.number().int(),
  reason: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  bodySchema: AccountResetSchema,
});

export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AccountResetSchema> },
) => {
  const { userId, reason } = context.body;
  const sessionUserId = req.session?.user?.id;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await AdminService.resetAccount(Number(sessionUserId), {
      userId,
      reason,
    });
    res
      .status(200)
      .json({ message: result.message, newUserId: result.newUserId });
  } catch (error) {
    logError('Error resetting account:', error);
    res.status(500).json({ error: 'Failed to reset account' });
  }
};

export default guardedHandler(handler);
