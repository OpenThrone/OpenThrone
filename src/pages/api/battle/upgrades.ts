import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { BattleService } from '@/services';

const handler = async(
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, items, operation = 'buy' } = req.body;

    const result = await BattleService.manageBattleUpgrades({
      userId,
      items,
      operation
    });

    return res.status(200).json(result);
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Failed to manage battle upgrades', message: error.message });
  }
};

export default withAuth(handler);