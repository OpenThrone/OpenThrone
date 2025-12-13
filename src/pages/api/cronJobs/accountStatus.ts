import { NextApiRequest, NextApiResponse } from "next";
import { CronJobService } from "@/services";

const accountStatusCron = async (req: NextApiRequest, res: NextApiResponse) => {
  //if (process.env.DO_TURN_UPDATES === 'true' && req.headers['authorization'] === process.env.TASK_SECRET) {
    try {
      const result = await CronJobService.processAccountStatusUpdates();

      if (result.success) {
        return res.status(200).json({
          message: result.message,
          processed: result.processed,
          failed: result.failed,
        });
      } else {
        return res.status(500).json({ message: 'Account status cron job failed.' });
      }
    } catch (error) {
      console.error('Error executing account status cron job:', error);
      return res.status(500).json({ message: 'Internal server error during account status cron job.' });
    }
  /*}
  else {
    return res.status(401).json({ message: 'Unauthorized or Disabled Task' });
  }*/
};

export default accountStatusCron;