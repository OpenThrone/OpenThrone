import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  rateLimitProfile: 'admin',
});

const isAuthorizedTaskRequest = (
  req: AuthenticatedRequest,
  isEnabled: boolean,
): boolean => {
  const taskSecret = process.env.TASK_SECRET;
  const authorizationHeader = req.headers.authorization;

  if (!isEnabled || !taskSecret || !authorizationHeader) {
    return false;
  }

  const provided = Buffer.from(authorizationHeader);
  const expected = Buffer.from(taskSecret);
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
};

const dailyCron = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_DAILY_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  try {
    const result = await CronJobService.processDailyUpdates();

    if (result.success) {
      return res.status(200).json({
        message: result.message,
        processed: result.processed,
        failed: result.failed,
      });
    }
    return res.status(500).json({ message: 'Daily cron job failed.' });
  } catch (error) {
    logError('Error executing daily cron job:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during daily cron job.' });
  }
};

export default guardedHandler(dailyCron);
