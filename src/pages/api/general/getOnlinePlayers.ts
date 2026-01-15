import type { NextApiRequest, NextApiResponse } from 'next';

import { GeneralService } from '@/services';
import { logError } from '@/utils/logger';

const getOnlinePlayers = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const stats = await GeneralService.getOnlinePlayersStats();
    res.status(200).json(stats);
  } catch (error) {
    logError(error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
};

export default getOnlinePlayers;
