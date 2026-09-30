import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
});

const getBotStatus = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const report = await BotService.getBotStatus();
  return res.status(200).json(report);
};

export default guardedHandler(getBotStatus);
