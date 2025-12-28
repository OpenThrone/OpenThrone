import type { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
import { GeneralService } from '@/services';
import { logError } from '@/utils/logger';
import { z } from 'zod';

const getUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const session = (req as any).session;
    const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;

    const responseDto = await GeneralService.getUserData(userId);

    res.status(200).json(stringifyObj(responseDto));
  } catch (error) {
    logError('Error in getUser:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getUser);
