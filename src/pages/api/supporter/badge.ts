import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import {
  getSupporterStatus,
  setBadgeVisible,
} from '@/services/supporter/Entitlement.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'PATCH');
  if (!userId) return;
  if (typeof req.body?.badgeVisible !== 'boolean')
    return res.status(400).json({ error: 'Invalid badge visibility' });
  try {
    await setBadgeVisible(userId, req.body.badgeVisible);
    return res.status(200).json(await getSupporterStatus(userId));
  } catch {
    return res.status(400).json({ error: 'Membership not found' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
