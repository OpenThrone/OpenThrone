import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { withCors } from '@/middleware/cors';
import { GeneralService } from '@/services';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const getUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { session } = req as any;
    const userId =
      typeof session.user.id === 'string'
        ? parseInt(session.user.id)
        : session.user.id;

    const responseDto = await GeneralService.getUserData(userId);

    res.status(200).json(stringifyObj(responseDto));
  } catch (error) {
    logError('Error in getUser:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withCors(withAuth(getUser));
