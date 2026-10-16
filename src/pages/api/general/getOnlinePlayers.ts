import type { NextApiRequest, NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { GeneralService } from '@/services';
import { logError } from '@/utils/logger';

const getOnlinePlayers = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const stats = await GeneralService.getOnlinePlayersStats();
    res.status(200).json(stats);
  } catch (error) {
    logError(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withApiGuard({
  methods: ['GET'],
  authMode: 'none',
  rateLimitProfile: 'auth',
})(getOnlinePlayers);
