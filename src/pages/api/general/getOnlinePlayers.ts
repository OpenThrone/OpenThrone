import type { NextApiRequest, NextApiResponse } from 'next';
import { GeneralService } from '@/services';
import { z } from 'zod';

const getOnlinePlayers = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const stats = await GeneralService.getOnlinePlayersStats();
    res.status(200).json(stats);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

export default getOnlinePlayers;
