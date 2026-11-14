import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { ChatModerationShadowService } from '@/services/ChatModerationShadow.service';
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

/**
 * Shadow chat moderation sweep (#448). Shares the `DO_TURN_UPDATES` switch
 * with the other frequent jobs; the sweep itself also needs the
 * `moderation.shadowEnabled` runtime setting and otherwise does nothing.
 */
const chatModerationCron = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_TURN_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  try {
    const outcome = await withCronRunLog('chatModeration', async () => {
      const result = await ChatModerationShadowService.runSweep();
      return {
        summary: {
          enabled: result.enabled,
          processed: result.processed,
          failed: result.failed,
          providerUnavailable: result.providerUnavailable ?? false,
        },
        result,
      };
    });
    return res.status(200).json({
      message: !outcome.result.enabled
        ? 'Shadow chat moderation is off.'
        : outcome.result.providerUnavailable
          ? 'Decision provider unreachable; sweep skipped.'
          : 'Shadow chat moderation sweep finished.',
      processed: outcome.result.processed,
      failed: outcome.result.failed,
      providerUnavailable: outcome.result.providerUnavailable ?? false,
    });
  } catch (error) {
    logError('Error executing chat moderation cron job:', error);
    return res.status(500).json({
      message: 'Internal server error during chat moderation cron job.',
    });
  }
};

export default guardedHandler(chatModerationCron);
