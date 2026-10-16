import { readdirSync } from 'fs';
import type { NextApiResponse } from 'next';
import { join } from 'path';

import { CONFIG_ROOT_DIR } from '@/botUsers/constants';
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
  const names = (directory: 'manifests' | 'schedules') => {
    try {
      return readdirSync(join(process.cwd(), CONFIG_ROOT_DIR, directory), {
        withFileTypes: true,
      })
        .filter(
          (entry) => entry.isFile() && /^[a-z0-9_-]+\.json$/i.test(entry.name),
        )
        .map((entry) => entry.name.slice(0, -5))
        .sort();
    } catch {
      return [];
    }
  };
  return res.status(200).json({
    ...report,
    bots: report.bots.map((bot) => ({ ...bot, gold: bot.gold.toString() })),
    manifests: names('manifests'),
    schedules: names('schedules'),
  });
};

export default guardedHandler(getBotStatus);
