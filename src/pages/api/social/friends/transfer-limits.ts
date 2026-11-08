import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { getFriendTransferStatus } from '@/services/FriendTransfer.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const LimitsQuerySchema = z.object({
  friendId: z.coerce.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
  querySchema: LimitsQuerySchema,
});

const transferLimitsHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof LimitsQuerySchema> },
) => {
  const userId = Number(req.session?.user?.id);
  try {
    const status = await getFriendTransferStatus(
      userId,
      context.query.friendId,
    );
    return res.status(200).json(status);
  } catch (error: any) {
    logError('Error fetching friend transfer limits:', error);
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    return res.status(statusCode).json({ error: publicErrorMessage(error) });
  }
};

export default guardedHandler(transferLimitsHandler);
