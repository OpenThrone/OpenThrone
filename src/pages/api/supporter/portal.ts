import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { getPaymentProvider } from '@/services/supporter/PaymentProvider';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST', {
    whenSalesOff: true,
  });
  if (!userId) return;
  try {
    return res
      .status(200)
      .json(await getPaymentProvider().createPortalSession(userId));
  } catch {
    return res.status(500).json({ error: 'Portal unavailable' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
