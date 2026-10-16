import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services';
import { logError } from '@/utils/logger';

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const availability = await AccountService.getVacationAvailability(
      req.session.user.id,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(availability);
  } catch (error) {
    logError(error, {}, 'Error loading vacation availability');
    return res
      .status(500)
      .json({ error: 'Failed to load vacation availability' });
  }
};

export default withAuth(handler);
