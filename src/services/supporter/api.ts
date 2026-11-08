import type { NextApiResponse } from 'next';

import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type { AuthenticatedRequest } from '@/types/api';

export async function requireSupporter(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  method: string,
  /**
   * Account management (status, history, billing portal) stays open while
   * sales are switched off, so existing subscribers can always cancel.
   */
  options: { whenSalesOff?: boolean } = {},
) {
  if (!options.whenSalesOff && !(await getRuntimeConfig()).enableSupporter) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (req.method !== method) {
    res.status(405).json({ error: 'Method not allowed' });
    return null;
  }
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}
