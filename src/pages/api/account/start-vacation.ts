import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import { logError } from '@/utils/logger';

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const { session } = req;
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;

    try {
      const result = await AccountService.startVacation(userId);
      res.status(200).json(result);
    } catch (error) {
      logError('Error starting vacation mode:', error);
      res.status(500).json({ error: 'Failed to start vacation mode' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

export default withAuth(handler);
