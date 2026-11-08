import type { NextApiRequest, NextApiResponse } from 'next';

import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { getSupporterPlans } from '@/services/supporter/planPrices';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });
  // No plans while sales are off; subscribers can still manage billing.
  if (!(await getRuntimeConfig()).enableSupporter)
    return res.status(200).json([]);
  // Provider price ids are internal; buyers only need the catalog.
  const plans = Object.values(await getSupporterPlans()).map(
    ({ providerPriceId: _providerPriceId, ...plan }) => plan,
  );
  return res.status(200).json(plans);
}
