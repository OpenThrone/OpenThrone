import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { CronJobService } from '@/services';
import { AllianceDuesService } from '@/services/AllianceDues.service';
import {
  hasCronRunSince,
  isForcedCronRequest,
  pruneOldCronRuns,
  withCronRunLog,
} from '@/services/CronRun.service';
import { runItemLedgerCheckSafely } from '@/services/ItemLedger.service';
import { runSupporterDaily } from '@/services/supporter/SupporterDaily.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { getGameDayStart } from '@/utils/timefunctions';

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

  // The daily pass has no per-run marker: running it twice grants citizen
  // growth twice. A second delivery in the same game day (which starts at
  // OT midnight, when the scheduled run fires) is skipped instead.
  if (
    !isForcedCronRequest(req.query) &&
    (await hasCronRunSince('daily', getGameDayStart()))
  ) {
    return res.status(200).json({
      message: 'Daily updates already ran today; skipped.',
      skipped: true,
    });
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

      // Alliance membership dues (allianceDues.ts) fall due at OT midnight,
      // when this job runs. Logged as their own run and independent of the
      // daily pass; collection is idempotent per member per period, so a
      // forced re-run charges nobody twice.
      const allianceDues = await withCronRunLog('allianceDues', async () => {
        const dues = await AllianceDuesService.collectAll();
        return {
          failed: dues.failed > 0,
          summary: dues,
          dues,
        };
      })
        .then((run) => run.dues)
        .catch((error) => {
          logError('Alliance dues collection failed:', error);
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
        allianceDues,
      };
    });

    if (outcome.result.success) {
      return res.status(200).json({
        message: outcome.result.message,
        processed: outcome.result.processed,
        failed: outcome.result.failed,
        supporter: outcome.supporter,
        allianceDues: outcome.allianceDues,
      });
    }
    return res.status(500).json({ message: 'Daily cron job failed.' });
  } catch (error) {
    logError('Error executing daily cron job:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during daily cron job.' });
  } finally {
    // Report-only and independent of the daily pass: it runs even when the
    // pass failed, and it never changes the response.
    await runItemLedgerCheckSafely();
  }
};

export default guardedHandler(dailyCron);
