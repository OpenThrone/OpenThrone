import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { confirmMockCheckout } from '@/services/supporter/PaymentEvents.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST');
  if (!userId) return;
  const { session, outcome } = req.body ?? {};
  if (
    (process.env.PAYMENT_PROVIDER ?? 'mock') !== 'mock' ||
    typeof session !== 'string' ||
    !['success', 'fail'].includes(outcome)
  )
    return res.status(400).json({ error: 'Invalid checkout' });
  try {
    return res
      .status(200)
      .json(await confirmMockCheckout(userId, session, outcome));
  } catch {
    return res.status(400).json({ error: 'Checkout could not be confirmed' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
