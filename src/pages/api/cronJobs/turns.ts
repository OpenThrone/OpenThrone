import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import {
  hasRecentCronRun,
  isForcedCronRequest,
  withCronRunLog,
} from '@/services/CronRun.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { getTurnIntervalMinutes } from '@/utils/timefunctions';

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

const turnCron = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_TURN_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  // A repeated delivery inside the same interval (two thirds of it, so a
  // late-but-legitimate tick still runs) is skipped, not applied twice.
  const windowMs = (getTurnIntervalMinutes() * 60_000 * 2) / 3;
  if (
    !isForcedCronRequest(req.query) &&
    (await hasRecentCronRun('turns', windowMs))
  ) {
    return res.status(200).json({
      message: 'Turn updates already ran this interval; skipped.',
      skipped: true,
    });
  }

  try {
    const outcome = await withCronRunLog('turns', async () => {
      const result = await CronJobService.processTurnUpdates();
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
    return res.status(500).json({ message: 'Turn cron job failed.' });
  } catch (error) {
    logError('Error executing turn cron job:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during turn cron job.' });
  }
};

export default guardedHandler(turnCron);
