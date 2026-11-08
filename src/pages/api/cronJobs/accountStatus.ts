import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import { withCronRunLog } from '@/services/CronRun.service';
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

const accountStatusCron = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_TURN_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  try {
    const outcome = await withCronRunLog('accountStatus', async () => {
      const result = await CronJobService.processAccountStatusUpdates();
      return {
        failed: !result.success,
        summary: {
          processed: result.processed ?? 0,
          failed: result.failed ?? 0,
        },
        result,
      };
    });

    if (outcome.result.success) {
      return res.status(200).json({
        message: outcome.result.message,
        processed: outcome.result.processed,
        failed: outcome.result.failed,
      });
    }
    return res.status(500).json({ message: 'Account status cron job failed.' });
  } catch (error) {
    logError('Error executing account status cron job:', error);
    return res.status(500).json({
      message: 'Internal server error during account status cron job.',
    });
  }
};

export default guardedHandler(accountStatusCron);
