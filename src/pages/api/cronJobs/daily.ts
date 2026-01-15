import type { NextApiRequest, NextApiResponse } from 'next';

import { CronJobService } from '@/services';

const dailyCron = async (req: NextApiRequest, res: NextApiResponse) => {
  const { TASK_SECRET } = process.env;
  if (
    process.env.DO_DAILY_UPDATES === 'true' &&
    req.headers.authorization === TASK_SECRET
  ) {
    try {
      const result = await CronJobService.processDailyUpdates();

      if (result.success) {
        return res.status(200).json({
          message: result.message,
          processed: result.processed,
          failed: result.failed,
        });
      }
      return res.status(500).json({ message: 'Daily cron job failed.' });
    } catch (error) {
      console.error('Error executing daily cron job:', error);
      return res
        .status(500)
        .json({ message: 'Internal server error during daily cron job.' });
    }
  } else {
    res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }
};

export default dailyCron;
