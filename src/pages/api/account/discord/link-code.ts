import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { createLinkCode } from '@/services/supporter/DiscordLink.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST');
  if (userId) return res.status(200).json(await createLinkCode(userId));
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
