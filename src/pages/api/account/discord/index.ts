import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import {
  getLinkInfo,
  unlink,
  updatePrefs,
} from '@/services/supporter/DiscordLink.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const method = req.method ?? '';
  if (!['GET', 'PATCH', 'DELETE'].includes(method))
    return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireSupporter(req, res, method);
  if (!userId) return;
  try {
    if (method === 'GET')
      return res.status(200).json(await getLinkInfo(userId));
    if (method === 'DELETE') return res.status(200).json(await unlink(userId));
    return res
      .status(200)
      .json(await updatePrefs(userId, req.body?.notifyPrefs));
  } catch {
    return res
      .status(400)
      .json({ error: 'Invalid preferences or account not linked' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
