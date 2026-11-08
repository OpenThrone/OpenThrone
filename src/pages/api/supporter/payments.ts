import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { getHistory } from '@/services/supporter/history';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'GET', {
    whenSalesOff: true,
  });
  if (userId) return res.status(200).json(await getHistory(userId));
}
export default withAuth(handler);
