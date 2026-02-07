import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
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

const turnCron = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_TURN_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  try {
    const result = await CronJobService.processTurnUpdates();

    if (result.success) {
      return res.status(200).json({
        message: result.message,
        processed: result.processed,
        failed: result.failed,
      });
    }
    return res.status(500).json({ message: 'Turn cron job failed.' });
  } catch (error) {
    logError('Error executing turn cron job:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during turn cron job.' });
  }
};

export default guardedHandler(turnCron);
