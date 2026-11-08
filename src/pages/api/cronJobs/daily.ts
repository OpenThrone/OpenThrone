import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import { pruneOldCronRuns, withCronRunLog } from '@/services/CronRun.service';
import { runSupporterDaily } from '@/services/supporter/SupporterDaily.service';
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
    // Run-log retention rides along with the daily job and never breaks it;
    // it runs first so a failing daily pass cannot stop old rows being pruned.
    await pruneOldCronRuns();

    const outcome = await withCronRunLog('daily', async () => {
      const result = await CronJobService.processDailyUpdates();
      // Supporter housekeeping is independent of the game's daily pass and
      // is logged as its own run, so its failures show up on their own.
      const supporter = await withCronRunLog('dailySupporter', async () => {
        const housekeeping = await runSupporterDaily();
        return {
          failed: housekeeping.errors > 0,
          summary: {
            poolsConverted: housekeeping.poolsConverted,
            membershipsLapsed: housekeeping.membershipsLapsed,
            billingEnded: housekeeping.billingEnded,
            digestsQueued: housekeeping.discordDigests,
            reconcileApplied: housekeeping.reconcile?.applied.length ?? 0,
            reconcileFailed: housekeeping.reconcile?.failed.length ?? 0,
            errors: housekeeping.errors,
            failures: housekeeping.failures,
          },
          housekeeping,
        };
      })
        .then((run) => run.housekeeping)
        .catch((error) => {
          logError('Supporter daily housekeeping failed:', error);
          return null;
        });

      return {
        failed: !result.success,
        summary: {
          processed: result.processed ?? 0,
          failed: result.failed ?? 0,
        },
        result,
        supporter,
      };
    });

    if (outcome.result.success) {
      return res.status(200).json({
        message: outcome.result.message,
        processed: outcome.result.processed,
        failed: outcome.result.failed,
        supporter: outcome.supporter,
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
