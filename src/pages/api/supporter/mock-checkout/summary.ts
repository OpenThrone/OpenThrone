import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { requireSupporter } from '@/services/supporter/api';
import { getMockCheckoutSummary } from '@/services/supporter/PaymentEvents.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'GET');
  if (!userId) return;
  const { session } = req.query;
  if (
    (process.env.PAYMENT_PROVIDER ?? 'mock') !== 'mock' ||
    typeof session !== 'string'
  )
    return res.status(400).json({ error: 'Invalid checkout' });
  try {
    const summary = await getMockCheckoutSummary(userId, session);
    if (!summary) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(summary);
  } catch {
    return res.status(400).json({ error: 'Invalid checkout' });
  }
}
export default withAuth(handler);
