import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await SocialService.countPendingRequests(session.user.id);

    return res.status(200).json(result);
  } catch (error: any) {
    logError('Error fetching friend request count:', error);
    return res.status(500).json({ error: error.message });
  }
};

export default withAuth(handler);
