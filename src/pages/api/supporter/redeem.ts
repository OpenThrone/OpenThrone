import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { redeemGift } from '@/services/supporter/Gift.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST');
  if (!userId) return;
  if (typeof req.body?.code !== 'string' || req.body.code.length > 40)
    return res.status(400).json({ error: 'Invalid gift code' });
  try {
    return res.status(200).json(await redeemGift(userId, req.body.code));
  } catch {
    return res.status(400).json({ error: 'Gift code is unavailable' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
