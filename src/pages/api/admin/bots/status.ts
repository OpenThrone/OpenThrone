import type { NextApiResponse } from 'next';

import { listBotManifests, listBotSchedules } from '@/botUsers/config';
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
  return res.status(200).json({
    ...report,
    bots: report.bots.map((bot) => ({ ...bot, gold: bot.gold.toString() })),
    manifests: listBotManifests(),
    schedules: listBotSchedules(),
  });
};

export default guardedHandler(getBotStatus);
