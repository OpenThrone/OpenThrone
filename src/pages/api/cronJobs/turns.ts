import type { NextApiRequest, NextApiResponse } from 'next';

import { CronJobService } from '@/services';
import { logError } from '@/utils/logger';

const turnCron = async (req: NextApiRequest, res: NextApiResponse) => {
  if (
    process.env.DO_TURN_UPDATES === 'true' &&
    req.headers.authorization === process.env.TASK_SECRET
  ) {
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
  } else {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }
};

export default turnCron;
