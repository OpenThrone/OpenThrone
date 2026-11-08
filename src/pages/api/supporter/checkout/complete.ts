import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { fulfillCheckoutSession } from '@/services/supporter/StripeEvents.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

/** Return-page fulfillment; the webhook does the same, whichever is first. */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'POST');
  if (!userId) return;
  const { sessionId } = req.body ?? {};
  if (
    process.env.PAYMENT_PROVIDER !== 'stripe' ||
    typeof sessionId !== 'string' ||
    !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)
  )
    return res.status(400).json({ error: 'Invalid checkout' });
  try {
    return res
      .status(200)
      .json(await fulfillCheckoutSession(sessionId, userId));
  } catch (error) {
    logError('Supporter checkout completion failed', error);
    return res.status(409).json({ error: 'Checkout is not confirmed yet' });
  }
}
export default withAuth(handler, { rateLimitProfile: 'game_write' });
