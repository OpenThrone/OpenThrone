import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { logError } from "@/utils/logger";
import { BattleService } from '@/services';

const getRecentAttacks = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await BattleService.getRecentAttacks({ timeWindow: 7 });
    res.status(200).json(result);
  } catch (error) {
    logError('Error fetching recent attacks:', error);
    res.status(500).json({ error });
  }
};

export default withAuth(getRecentAttacks);
