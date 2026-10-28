import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { getFriendTransferStatus } from '@/services/FriendTransfer.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
});

const transferLimitsHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const userId = Number(req.session?.user?.id);
  try {
    const status = await getFriendTransferStatus(userId);
    return res.status(200).json(status);
  } catch (error: any) {
    logError('Error fetching friend transfer limits:', error);
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    return res.status(statusCode).json({ error: publicErrorMessage(error) });
  }
};

export default guardedHandler(transferLimitsHandler);
