import { timingSafeEqual } from 'crypto';
import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { BotService } from '@/services';
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

const botsCron = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (!isAuthorizedTaskRequest(req, process.env.DO_BOT_UPDATES === 'true')) {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }

  try {
    const schedule =
      typeof req.query.schedule === 'string' ? req.query.schedule : 'default';
    const result = await BotService.runDailyBotTick(schedule);

    return res.status(200).json({
      message: 'Bot daily tick processed',
      totalBots: result.totalBots,
      processedAt: result.processedAt,
      byAction: result.byAction,
      byStatus: result.byStatus,
      durationMs: result.durationMs,
      results: result.results,
    });
  } catch (error) {
    logError('Error executing bot cron job:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error during bot cron job.' });
  }
};

export default guardedHandler(botsCron);
