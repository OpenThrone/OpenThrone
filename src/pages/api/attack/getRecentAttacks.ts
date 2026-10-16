import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { logError } from '@/utils/logger';

const getRecentAttacks = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const viewerId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(viewerId) || viewerId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Only logs the viewer may read, with loss totals (fort HP for the defender).
    const result = await BattleService.getRecentAttacks(viewerId, {
      timeWindow: 7,
    });
    res.status(200).json(result);
  } catch (error) {
    logError('Error fetching recent attacks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getRecentAttacks);
