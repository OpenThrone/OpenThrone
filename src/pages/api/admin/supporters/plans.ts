import type { NextApiResponse } from 'next';

import { supporterGuard } from '@/services/supporter/admin';
import {
  getAdminSupporterPlans,
  planPriceSchema,
  saveSupporterPlanPrice,
} from '@/services/supporter/planPrices';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      const parsed = planPriceSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: 'invalid_price' });
      await saveSupporterPlanPrice(parsed.data, {
        userId: Number(req.session?.user?.id),
        ip: getRequestIp(req),
      });
    }
    const rows = await getAdminSupporterPlans();
    return res.json({ rows, total: rows.length });
  } catch (error) {
    if (error instanceof Error && error.message === 'price_conflict') {
      // Send the current prices so the editor updates in place and keeps its message.
      const rows = await getAdminSupporterPlans().catch(() => null);
      return res.status(409).json({
        error: 'price_conflict',
        ...(rows && { rows, total: rows.length }),
      });
    }
    logError('Supporter price update failed', error);
    return res.status(502).json({
      error:
        error instanceof Error && error.message === 'stripe_price_failed'
          ? 'stripe_price_failed'
          : 'price_save_failed',
    });
  }
}
export default supporterGuard(['GET', 'POST'])(handler);
